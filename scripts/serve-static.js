const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const zlib = require('zlib');

const requestedRoot = process.argv[2];
if (!requestedRoot) {
  console.error('Usage: node scripts/serve-static.js <dist-directory>');
  process.exit(1);
}

let root = path.resolve(requestedRoot);
const browserRoot = path.join(root, 'browser');
if (!fs.existsSync(path.join(root, 'index.html')) && fs.existsSync(path.join(browserRoot, 'index.html'))) {
  root = browserRoot;
}
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const compressibleExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.svg',
  '.txt',
  '.webmanifest',
]);

const gzipCache = new Map();

function runtimeConfigScript() {
  const config = {
    API: process.env.CHAMAN_WEB_API_URL || process.env.API_URL || process.env.API || '',
    WS: process.env.CHAMAN_WEB_WS_URL || process.env.WS_URL || process.env.WS || '',
    TILES_URL: process.env.CHAMAN_WEB_TILES_URL || process.env.TILES_URL || '',
    COOKIE_AUTH: process.env.CHAMAN_COOKIE_AUTH_ENABLED === 'true',
  };

  return `window.__CHAMAN_CONFIG__ = ${JSON.stringify(config)};`;
}

function apiBaseUrl() {
  return process.env.CHAMAN_WEB_API_URL || process.env.API_URL || process.env.API || '';
}

function isLegacyApiRequest(req, pathname) {
  if (pathname === '/health' || pathname.startsWith('/runtime-config.')) {
    return false;
  }

  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return true;
  }

  const accept = String(req.headers.accept || '').toLowerCase();
  return accept.includes('application/json') && !accept.includes('text/html');
}

function rewriteProxyCookies(cookies, upstreamAuthPath) {
  if (!Array.isArray(cookies)) {
    return cookies;
  }

  const escapedPath = upstreamAuthPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pathPattern = new RegExp(`Path=${escapedPath}(?=;|$)`, 'i');
  return cookies.map((cookie) => cookie.replace(pathPattern, 'Path=/auth'));
}

function proxyApiRequest(req, res) {
  const configuredBase = apiBaseUrl();
  if (!configuredBase) {
    res.writeHead(503, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify({ message: 'API de Chaman no configurada' }));
    return;
  }

  let target;
  let upstreamAuthPath;
  try {
    const base = new URL(configuredBase);
    const incoming = new URL(req.url || '/', 'http://chaman.local');
    const basePath = base.pathname.replace(/\/$/, '');
    base.pathname = `${basePath}${incoming.pathname.startsWith('/') ? incoming.pathname : `/${incoming.pathname}`}`;
    base.search = incoming.search;
    target = base;
    upstreamAuthPath = `${basePath}/auth`;
  } catch (error) {
    res.writeHead(503, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify({ message: 'API de Chaman mal configurada' }));
    return;
  }

  const transport = target.protocol === 'https:' ? https : http;
  const originalHost = String(req.headers.host || '');
  const headers = {
    ...req.headers,
    host: target.host,
    'x-forwarded-host': originalHost,
    'x-forwarded-proto': String(req.headers['x-forwarded-proto'] || 'https'),
  };

  const upstream = transport.request(
    target,
    { method: req.method, headers },
    (upstreamResponse) => {
      const responseHeaders = { ...upstreamResponse.headers };
      responseHeaders['cache-control'] = 'no-store';
      if (responseHeaders['set-cookie']) {
        responseHeaders['set-cookie'] = rewriteProxyCookies(
          responseHeaders['set-cookie'],
          upstreamAuthPath,
        );
      }
      res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
      upstreamResponse.pipe(res);
    },
  );

  upstream.on('error', (error) => {
    if (!res.headersSent) {
      res.writeHead(502, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
    }
    res.end(JSON.stringify({ message: 'No se pudo contactar la API de Chaman' }));
  });

  req.pipe(upstream);
}

function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const resolved = path.join(root, normalized);

  if (!resolved.startsWith(root)) {
    return null;
  }

  return resolved;
}

function shouldGzip(req, extension) {
  if (!compressibleExtensions.has(extension)) {
    return false;
  }

  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  return /\bgzip\b/.test(acceptEncoding);
}

function getGzipBuffer(filePath, stat) {
  const cached = gzipCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.buffer;
  }

  const buffer = zlib.gzipSync(fs.readFileSync(filePath), { level: 6 });
  gzipCache.set(filePath, {
    buffer,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
  });
  return buffer;
}

function sendFile(req, res, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[extension] || 'application/octet-stream';
  const stat = fs.statSync(filePath);
  const gzip = shouldGzip(req, extension);
  const gzipBuffer = gzip ? getGzipBuffer(filePath, stat) : null;

  const headers = {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    'Vary': 'Accept-Encoding',
  };

  if (gzip) {
    headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = gzipBuffer.length;
  } else {
    headers['Content-Length'] = stat.size;
  }

  res.writeHead(200, headers);

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  if (gzip) {
    res.end(gzipBuffer);
    return;
  }

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(500);
    }
    res.end('Unable to read file');
  });

  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  const pathname = (req.url || '').split('?')[0];

  if (pathname === '/health') {
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end('OK');
    return;
  }

  if (pathname === '/runtime-config.js' || pathname === '/runtime-config.bootstrap') {
    res.writeHead(200, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(runtimeConfigScript());
    return;
  }

  // Compatibilidad para sesiones que conservaron un runtime-config.js viejo.
  // En vez de entregar index.html a HttpClient, las solicitudes de API se
  // encaminan al backend configurado para el ambiente actual.
  if (isLegacyApiRequest(req, pathname)) {
    proxyApiRequest(req, res);
    return;
  }

  const requestedPath = safeResolve(req.url || '/');
  if (!requestedPath) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  let filePath = requestedPath;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    filePath = path.join(root, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  sendFile(req, res, filePath);
});

server.listen(port, host, () => {
  console.log(`Static app serving ${root} on http://${host}:${port}`);
});
