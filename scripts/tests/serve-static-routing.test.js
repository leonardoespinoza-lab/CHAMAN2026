const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function waitForOutput(child, expected) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor estatico no inicio a tiempo')), 5000);
    const inspect = (chunk) => {
      if (!String(chunk).includes(expected)) return;
      clearTimeout(timeout);
      resolve();
    };
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`El servidor estatico termino antes de iniciar (${code})`));
    });
  });
}

function assertTrustHeaders(response) {
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(response.headers.get('content-security-policy'), null);

  const permissionsPolicy = response.headers.get('permissions-policy') || '';
  assert.match(permissionsPolicy, /camera=\(self\)/);
  assert.match(permissionsPolicy, /geolocation=\(self\)/);
  assert.match(permissionsPolicy, /microphone=\(self\)/);
  assert.match(permissionsPolicy, /payment=\(\)/);
  assert.match(permissionsPolicy, /usb=\(\)/);

  const reportOnlyPolicy = response.headers.get('content-security-policy-report-only') || '';
  assert.match(reportOnlyPolicy, /connect-src 'self' https: wss:/);
  assert.match(reportOnlyPolicy, /fonts\.googleapis\.com/);
  assert.match(reportOnlyPolicy, /fonts\.gstatic\.com/);
  assert.match(reportOnlyPolicy, /arcgis\.com/);
  assert.match(reportOnlyPolicy, /arcgisonline\.com/);
  assert.match(reportOnlyPolicy, /worker-src 'self' blob: https:/);
}

test('sirve JSON estatico antes del proxy API aunque Accept solicite JSON', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-static-'));
  fs.mkdirSync(path.join(root, 'i18n'));
  fs.writeFileSync(path.join(root, 'index.html'), '<html>Chaman</html>');
  fs.writeFileSync(path.join(root, 'i18n', 'es.json'), '{"LOGIN":"Ingresar"}');

  const upstream = http.createServer((req, res) => {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ proxied: req.url }));
  });
  const upstreamPort = await listen(upstream);

  const reservation = http.createServer();
  const appPort = await listen(reservation);
  await close(reservation);

  const child = spawn(process.execPath, [path.join(__dirname, '..', 'serve-static.js'), root], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(appPort),
      CHAMAN_WEB_API_URL: `http://127.0.0.1:${upstreamPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(async () => {
    child.kill();
    await close(upstream);
    fs.rmSync(root, { recursive: true, force: true });
  });

  await waitForOutput(child, 'Static app serving');

  const staticResponse = await fetch(`http://127.0.0.1:${appPort}/i18n/es.json`, {
    headers: { accept: 'application/json, text/plain, */*' },
  });
  assert.equal(staticResponse.status, 200);
  assertTrustHeaders(staticResponse);
  assert.deepEqual(await staticResponse.json(), { LOGIN: 'Ingresar' });

  const apiResponse = await fetch(`http://127.0.0.1:${appPort}/auth/me`, {
    headers: { accept: 'application/json, text/plain, */*' },
  });
  assert.equal(apiResponse.status, 401);
  assert.equal(apiResponse.headers.get('cache-control'), 'no-store');
  assertTrustHeaders(apiResponse);
  assert.deepEqual(await apiResponse.json(), { proxied: '/auth/me' });
});

test('aplica headers conservadores y cache seguro a los recursos publicos reales', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-static-trust-'));
  fs.mkdirSync(path.join(root, '.well-known'));
  fs.writeFileSync(path.join(root, 'index.html'), '<html>Chaman SPA</html>');
  fs.writeFileSync(path.join(root, 'main.12345678.js'), 'window.chaman = true;');
  fs.writeFileSync(path.join(root, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  fs.writeFileSync(path.join(root, 'sitemap.xml'), '<?xml version="1.0"?><urlset></urlset>');
  fs.writeFileSync(path.join(root, '.well-known', 'security.txt'), 'Contact: mailto:security@chamanagro.ar\n');
  fs.writeFileSync(path.join(root, 'manifest.webmanifest'), '{"name":"Chaman"}');
  fs.writeFileSync(path.join(root, 'favicon.ico'), Buffer.from([0, 0, 1, 0]));
  fs.writeFileSync(path.join(root, 'ngsw.json'), '{"configVersion":1}');
  fs.writeFileSync(path.join(root, 'ngsw-worker.js'), 'self.chaman = true;');

  const reservation = http.createServer();
  const appPort = await listen(reservation);
  await close(reservation);

  const child = spawn(process.execPath, [path.join(__dirname, '..', 'serve-static.js'), root], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(appPort),
      CHAMAN_WEB_API_URL: 'https://api.chamanagro.ar',
      CHAMAN_WEB_WS_URL: 'wss://ws.chamanagro.ar',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(() => {
    child.kill();
    fs.rmSync(root, { recursive: true, force: true });
  });

  await waitForOutput(child, 'Static app serving');

  const indexResponse = await fetch(`http://127.0.0.1:${appPort}/`);
  assert.equal(indexResponse.status, 200);
  assert.equal(indexResponse.headers.get('cache-control'), 'no-cache');
  assertTrustHeaders(indexResponse);

  const hashedAssetResponse = await fetch(`http://127.0.0.1:${appPort}/main.12345678.js`);
  assert.equal(hashedAssetResponse.status, 200);
  assert.equal(hashedAssetResponse.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assertTrustHeaders(hashedAssetResponse);

  const trustResources = [
    ['/robots.txt', 'text/plain', 'User-agent: *'],
    ['/sitemap.xml', 'application/xml', '<urlset>'],
    ['/.well-known/security.txt', 'text/plain', 'security@chamanagro.ar'],
    ['/manifest.webmanifest', 'application/manifest+json', 'Chaman'],
    ['/favicon.ico', 'image/x-icon', null],
    ['/ngsw.json', 'application/json', 'configVersion'],
    ['/ngsw-worker.js', 'text/javascript', 'self.chaman'],
  ];

  for (const [resourcePath, contentType, expectedContent] of trustResources) {
    const response = await fetch(`http://127.0.0.1:${appPort}${resourcePath}`);
    assert.equal(response.status, 200, resourcePath);
    assert.ok((response.headers.get('content-type') || '').startsWith(contentType), resourcePath);
    assert.equal(response.headers.get('cache-control'), 'no-cache', resourcePath);
    assertTrustHeaders(response);
    if (expectedContent) {
      assert.match(await response.text(), new RegExp(expectedContent), resourcePath);
    }
  }

  const runtimeResponse = await fetch(`http://127.0.0.1:${appPort}/runtime-config.js`);
  assert.equal(runtimeResponse.status, 200);
  assert.equal(runtimeResponse.headers.get('cache-control'), 'no-store');
  assert.match(await runtimeResponse.text(), /https:\/\/api\.chamanagro\.ar/);
  assertTrustHeaders(runtimeResponse);
});

test('no oculta recursos publicos reservados ausentes con el fallback de Angular', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-static-reserved-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<html>Chaman SPA</html>');

  const reservation = http.createServer();
  const appPort = await listen(reservation);
  await close(reservation);

  const child = spawn(process.execPath, [path.join(__dirname, '..', 'serve-static.js'), root], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(appPort),
      CHAMAN_WEB_API_URL: 'https://api.chamanagro.ar',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(() => {
    child.kill();
    fs.rmSync(root, { recursive: true, force: true });
  });

  await waitForOutput(child, 'Static app serving');

  const reservedPaths = [
    '/robots.txt',
    '/sitemap.xml',
    '/.well-known/security.txt',
    '/favicon.ico',
    '/favicon.png',
    '/favicon.svg',
    '/manifest.json',
    '/manifest.webmanifest',
    '/site.webmanifest',
  ];

  for (const resourcePath of reservedPaths) {
    const response = await fetch(`http://127.0.0.1:${appPort}${resourcePath}`, {
      headers: { accept: 'application/json, text/plain, */*' },
    });
    assert.equal(response.status, 404, resourcePath);
    assert.equal(await response.text(), 'Not found', resourcePath);
    assertTrustHeaders(response);
  }

  for (const route of ['/auth', '/productores/cliente/lotes', '/ruta/angular/aleatoria']) {
    const response = await fetch(`http://127.0.0.1:${appPort}${route}`, {
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
    assert.equal(response.status, 200, route);
    assert.equal(await response.text(), '<html>Chaman SPA</html>', route);
    assertTrustHeaders(response);
  }
});

test('deja la pagina publica about fuera del fallback del service worker', () => {
  const configPath = path.join(__dirname, '..', '..', 'sdc-app-chaman', 'ngsw-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  assert.ok(config.navigationUrls.includes('/**'));
  assert.ok(config.navigationUrls.includes('!/about'));
  assert.ok(config.navigationUrls.includes('!/about/**'));
});
