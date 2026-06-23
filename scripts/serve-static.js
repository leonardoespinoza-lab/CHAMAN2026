const fs = require('fs');
const http = require('http');
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
    GOOGLE_PROVIDER_ID: process.env.GOOGLE_PROVIDER_ID || '',
  };

  return `window.__CHAMAN_CONFIG__ = ${JSON.stringify(config)};`;
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
  if ((req.url || '').split('?')[0] === '/health') {
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end('OK');
    return;
  }

  if ((req.url || '').split('?')[0] === '/runtime-config.js') {
    res.writeHead(200, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(runtimeConfigScript());
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
