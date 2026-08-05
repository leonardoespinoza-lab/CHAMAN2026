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
  assert.deepEqual(await staticResponse.json(), { LOGIN: 'Ingresar' });

  const apiResponse = await fetch(`http://127.0.0.1:${appPort}/auth/me`, {
    headers: { accept: 'application/json, text/plain, */*' },
  });
  assert.equal(apiResponse.status, 401);
  assert.deepEqual(await apiResponse.json(), { proxied: '/auth/me' });
});
