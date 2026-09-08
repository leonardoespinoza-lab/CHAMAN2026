/* Run manually after building sdc-modelos, sdc-api-cliente and sdc-datos:
 * node --test scripts/tests/privacy-local-integration.js
 * Uses a NEW loopback-only mongod, never a configured DB_URL or live account.
 * Auth records, content and confirmation delivery are isolated fixtures.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { randomUUID, randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const { once } = require('node:events');

const root = path.resolve(__dirname, '../..');
const apiRequire = createRequire(path.join(root, 'sdc-api-cliente/package.json'));
const dataRequire = createRequire(path.join(root, 'sdc-datos/package.json'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const binary = 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
const progress = step => console.log('# fixture: ' + step);

async function unusedPort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('privacy: HTTP API -> internal guard -> real isolated Mongo -> manual fixture fulfillment', { timeout: 120000 }, async t => {
  await fs.access(binary);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'chaman-privacy-fixture-'));
  const port = await unusedPort();
  const logfile = path.join(directory, 'mongod.log');
  const databaseName = 'privacy_fixture_' + randomUUID().replaceAll('-', '');
  const child = spawn(binary, ['--bind_ip', '127.0.0.1', '--port', String(port), '--dbpath', directory, '--logpath', logfile], {
    windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
  });
  let spawnError;
  child.once('error', error => { spawnError = error; });
  child.stderr.resume();
  let connection, dataApp, apiApp;
  const envKeys = ['ENV', 'NODE_ENV', 'RAILWAY_ENVIRONMENT_NAME', 'API_DATOS', 'PRIVACY_REQUESTS_INTERNAL_TOKEN'];
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  try {
    progress('starting isolated mongod');
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error('Fixture mongod stopped before connecting; no database used.');
      const log = await fs.readFile(logfile, 'utf8').catch(() => '');
      if (log.includes('Waiting for connections')) { ready = true; break; }
      await delay(150);
    }
    assert.equal(ready, true, 'only connect after OUR mongod reports readiness');
    progress('mongod ready');
    const mongoose = dataRequire('mongoose');
    connection = await mongoose.createConnection('mongodb://127.0.0.1:' + port + '/' + databaseName, {
      serverSelectionTimeoutMS: 5000,
    }).asPromise();
    const status = await connection.db.admin().serverStatus();
    assert.equal(Number(status.pid), child.pid, 'server must be the process created by this test');
    assert.equal(connection.name, databaseName);
    progress('owned Mongo connection verified');

    process.env.ENV = 'test';
    process.env.NODE_ENV = 'test';
    process.env.RAILWAY_ENVIRONMENT_NAME = 'test';
    process.env.PRIVACY_REQUESTS_INTERNAL_TOKEN = randomBytes(32).toString('hex');
    apiRequire('tsconfig-paths').register({
      baseUrl: path.join(root, 'sdc-api-cliente/dist'), paths: { 'src/*': ['*'] },
    });
    apiRequire('reflect-metadata');
    const { Test } = apiRequire('@nestjs/testing');
    const { Test: DataTest } = dataRequire('@nestjs/testing');
    const { UnauthorizedException } = apiRequire('@nestjs/common');
    const { HttpModule, HttpService } = apiRequire('@nestjs/axios');
    const { getModelToken } = dataRequire('@nestjs/mongoose');
    const {
      PrivacyRequest, PrivacyRequestSchema, PrivacyRequestsService, PrivacyRequestsController, PrivacyInternalGuard,
    } = require('../../sdc-datos/dist/entidades/usuario/privacy-request.js');
    const requests = connection.model(PrivacyRequest.name, PrivacyRequestSchema);
    progress('compiling isolated data module');
    const dataModule = await DataTest.createTestingModule({
      controllers: [PrivacyRequestsController],
      providers: [PrivacyRequestsService, PrivacyInternalGuard, { provide: getModelToken(PrivacyRequest.name), useValue: requests }],
    }).compile();
    dataApp = dataModule.createNestApplication({ logger: false });
    await dataApp.listen(0, '127.0.0.1');
    progress('data HTTP ready');
    const dataOrigin = await dataApp.getUrl();
    process.env.API_DATOS = dataOrigin;
    // Import env-dependent API modules only after the local URL is fixed.
    const { PrivacyController } = require('../../sdc-api-cliente/dist/entidades/usuario/privacy.controller.js');
    const { AxiosService } = require('../../sdc-api-cliente/dist/auxiliares/axios/axios.service.js');
    const { AuthenticationMiddleware } = require('../../sdc-api-cliente/dist/auxiliares/authentication/authentication.middleware.js');
    progress('API modules loaded');
    const users = connection.db.collection('fixture_users');
    const sessions = connection.db.collection('fixture_sessions');
    const content = connection.db.collection('fixture_content');
    const outbox = connection.db.collection('fixture_confirmation_outbox');
    const firstId = new mongoose.Types.ObjectId().toString();
    const secondId = new mongoose.Types.ObjectId().toString();
    const adminId = new mongoose.Types.ObjectId().toString();
    const firstUser = { _id: firstId, username: 'fixture-owner', email: 'owner@example.invalid', permisos: [{ nivel: 'Productor', rol: 'Lectura' }] };
    const secondUser = { _id: secondId, username: 'fixture-neighbor', email: 'neighbor@example.invalid', permisos: [{ nivel: 'Asesor', rol: 'Admin' }] };
    const admin = { _id: adminId, username: 'fixture-admin', permisos: [{ nivel: 'Admin', rol: 'Admin' }] };
    await users.insertMany([firstUser, secondUser, admin]);
    const tokens = [firstUser, secondUser, admin].map(user => ({ value: 'Bearer fixture-' + randomUUID(), userId: user._id }));
    await sessions.insertMany(tokens);
    await content.insertMany([
      { _id: 'owner-audio', ownerId: firstId, sharedWith: [secondId], kind: 'audio', fake: true },
      { _id: 'neighbor-photo', ownerId: secondId, sharedWith: [firstId], kind: 'photo', fake: true },
    ]);
    const middleware = new AuthenticationMiddleware({
      // A fixture session provider, not the live OAuth login service.
      authorization: async authorization => {
        const session = await sessions.findOne({ value: authorization });
        const user = session && await users.findOne({ _id: session.userId });
        if (!user) throw new UnauthorizedException();
        return { user };
      },
    }, { getLicenciaEfectivaPorPermiso: async () => null }, { enrichPermission: async () => {} });
    const apiModule = await Test.createTestingModule({
      imports: [HttpModule.register({ timeout: 5000 })],
      controllers: [PrivacyController], providers: [AxiosService],
    }).compile();
    // Block any accidental outgoing URL beyond the isolated data server.
    apiModule.get(HttpService).axiosRef.interceptors.request.use(config => {
      if (new URL(config.url).origin !== dataOrigin) throw new Error('External HTTP is forbidden in this fixture.');
      return config;
    });
    apiApp = apiModule.createNestApplication({ logger: false });
    apiApp.use((req, res, next) => {
      middleware.use(req, res, next).catch(error => res.status(error.getStatus?.() || 500).json({ error: 'fixture authentication rejected' }));
    });
    await apiApp.listen(0, '127.0.0.1');
    progress('API HTTP ready');
    const apiOrigin = await apiApp.getUrl();
    const headers = index => ({ Authorization: tokens[index].value, 'Content-Type': 'application/json' });
    const ownPath = '/cuenta/privacidad/eliminacion';
    const submit = (index, extra = {}) => fetch(apiOrigin + ownPath, {
      method: 'POST', headers: headers(index),
      body: JSON.stringify({ confirmacion: 'ELIMINAR MI CUENTA', ...extra }),
    });
    await t.test('rejects unauthenticated requests and direct data-server access', async () => {
      assert.equal((await fetch(apiOrigin + ownPath)).status, 401);
      assert.equal((await fetch(dataOrigin + '/privacy-requests/' + firstId)).status, 401);
      assert.equal(await requests.countDocuments(), 0);
    });
    await t.test('does not select someone else through a POST body', async () => {
      assert.equal((await submit(0, { userId: secondId })).status, 400);
      assert.equal(await requests.countDocuments(), 0);
    });
    let ticket;
    await t.test('persists one ticket under concurrent retries with the original deadline', async () => {
      const responses = await Promise.all(Array.from({ length: 12 }, () => submit(0)));
      for (const response of responses) assert.equal(response.status, 201);
      const receipts = await Promise.all(responses.map(response => response.json()));
      ticket = receipts[0];
      assert.equal(ticket._id, firstId);
      for (const receipt of receipts) assert.deepEqual(receipt, ticket);
      assert.equal(await requests.countDocuments(), 1);
      assert.equal(new Date(ticket.respondBy) - new Date(ticket.requestedAt), 30 * 86400000);
      assert.equal(await users.countDocuments(), 3, 'request never deletes an account');
      assert.equal(await content.countDocuments(), 2, 'request never deletes agronomic content');
    });
    await t.test('reads only own status and restricts the queue to central administration', async () => {
      assert.deepEqual(await (await fetch(apiOrigin + ownPath, { headers: headers(0) })).json(), ticket);
      const neighbor = await fetch(apiOrigin + ownPath, { headers: headers(1) });
      assert.equal(neighbor.status, 200);
      const neighborBody = await neighbor.text();
      assert.ok(neighborBody === '' || neighborBody === 'null');
      assert.equal((await fetch(apiOrigin + '/cuenta/privacidad/solicitudes', { headers: headers(1) })).status, 403);
      const queue = await (await fetch(apiOrigin + '/cuenta/privacidad/solicitudes', { headers: headers(2) })).json();
      assert.equal(queue.records.length, 1);
      assert.equal(queue.records[0]._id, firstId);
    });
    await t.test('rehearses manual fulfillment only on owned synthetic records, preserving the neighbor', async () => {
      assert.equal(connection.name, databaseName);
      assert.match(databaseName, /^privacy_fixture_[a-f0-9]{32}$/);
      assert.equal((await users.findOne({ _id: firstId })).username, 'fixture-owner');
      assert.equal((await content.deleteMany({ ownerId: firstId, fake: true })).deletedCount, 1);
      assert.equal((await sessions.deleteMany({ userId: firstId })).deletedCount, 1);
      assert.equal((await users.deleteOne({ _id: firstId, username: 'fixture-owner' })).deletedCount, 1);
      // Simulated delivery only: no SMTP or real email destination.
      await outbox.insertOne({ accountId: firstId, to: 'owner@example.invalid', kind: 'completed', simulatedDelivery: true });
      assert.equal((await requests.deleteOne({ _id: firstId, status: 'pending' })).deletedCount, 1);
      assert.equal(await users.countDocuments({ _id: secondId }), 1);
      assert.equal(await content.countDocuments({ _id: 'neighbor-photo', ownerId: secondId }), 1);
      assert.equal(await sessions.countDocuments({ userId: secondId }), 1);
      assert.equal(await outbox.countDocuments({ accountId: firstId }), 1);
      assert.equal((await fetch(apiOrigin + ownPath, { headers: headers(0) })).status, 401);
      assert.equal((await fetch(apiOrigin + ownPath, { headers: headers(1) })).status, 200);
      const queue = await (await fetch(apiOrigin + '/cuenta/privacidad/solicitudes', { headers: headers(2) })).json();
      assert.equal(queue.records.length, 0);
    });
    t.diagnostic('Completed on a new mongod on loopback; see assertions above. Live OAuth, production collections, real files and email delivery were NOT tested.');
  } catch (error) {
    console.error('# fixture failure:', error.message);
    throw error;
  } finally {
    progress('closing isolated test servers');
    if (apiApp) await apiApp.close();
    if (dataApp) await dataApp.close();
    if (connection) {
      await Promise.race([connection.close(true).catch(() => {}), delay(3000)]);
    }
    if (child.exitCode === null && !spawnError) {
      const exited = once(child, 'exit');
      child.kill();
      await Promise.race([exited, delay(5000)]);
    }
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    t.diagnostic('Synthetic fixture files retained for inspection at ' + directory + '; no live database was used.');
  }
});
