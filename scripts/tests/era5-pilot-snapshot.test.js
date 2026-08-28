const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const toolkit = require('../lib/era5-pilot-snapshot');

class FakeObjectId {
  constructor(value) {
    this.value = String(value).toLowerCase();
    this._bsontype = 'ObjectId';
  }
  toHexString() { return this.value; }
  toString() { return this.value; }
}

function ejsonNormalize(value) {
  if (value instanceof FakeObjectId) return { $oid: value.value };
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Array.isArray(value)) return value.map(ejsonNormalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, ejsonNormalize(child)]));
  return value;
}

function ejsonRevive(value) {
  if (Array.isArray(value)) return value.map(ejsonRevive);
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && value.$oid) return new FakeObjectId(value.$oid);
    if (Object.keys(value).length === 1 && value.$date) return new Date(value.$date);
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, ejsonRevive(child)]));
  }
  return value;
}

const EJSON = {
  stringify(value) { return JSON.stringify(ejsonNormalize(value)); },
  parse(value) { return ejsonRevive(JSON.parse(value)); },
};

function id(value) { return new FakeObjectId(value.padStart(24, '0')); }
function same(left, right) {
  const a = left instanceof FakeObjectId ? left.value : left;
  const b = right instanceof FakeObjectId ? right.value : right;
  return String(a) === String(b);
}

function match(document, query) {
  if (query.$or) return query.$or.some((item) => match(document, item));
  return Object.entries(query).every(([key, expected]) => {
    const actual = key.split('.').reduce((value, part) => value?.[part], document);
    if (expected && typeof expected === 'object' && !(expected instanceof FakeObjectId) && !(expected instanceof Date)) {
      if ('$gte' in expected && actual < expected.$gte) return false;
      if ('$lte' in expected && actual > expected.$lte) return false;
      if ('$gte' in expected || '$lte' in expected) return true;
    }
    return same(actual, expected);
  });
}

class FakeCursor {
  constructor(documents) { this.documents = documents; }
  sort() { return this; }
  async toArray() { return ejsonRevive(JSON.parse(JSON.stringify(ejsonNormalize(this.documents)))); }
}

class FakeCollection {
  constructor(documents) { this.documents = documents; }
  find(query) { return new FakeCursor(this.documents.filter((document) => match(document, query))); }
  async deleteMany(query) {
    const before = this.documents.length;
    this.documents.splice(0, this.documents.length, ...this.documents.filter((document) => !match(document, query)));
    return { deletedCount: before - this.documents.length };
  }
  async insertMany(documents) {
    this.documents.push(...ejsonRevive(JSON.parse(JSON.stringify(ejsonNormalize(documents)))));
  }
}

class FakeDb {
  constructor(data) { this.data = data; }
  collection(name) { return new FakeCollection(this.data[name] || (this.data[name] = [])); }
}

class FakeClient {
  startSession() {
    return {
      async withTransaction(callback) { await callback(); },
      async endSession() {},
    };
  }
}

function scopeAndConfig() {
  const scope = {
    lotObjectId: id('1'), sowingObjectId: id('2'), establishmentObjectId: id('3'),
    seedObjectId: id('4'), cronoObjectId: id('5'), gridPointKey: 'grid-ar-1', sowingDate: '2026-05-01',
  };
  const config = { operationId: 'era5-pilot-test-001', lotId: scope.lotObjectId.value, sowingId: scope.sowingObjectId.value, from: '2026-05-01', to: '2026-05-03' };
  return { scope, config };
}

function baselineData(scope) {
  return {
    siembras: [{ _id: scope.sowingObjectId, idLote: scope.lotObjectId, ultimaPrediccion: { riesgo: 1 } }],
    lotes: [{ _id: scope.lotObjectId, idSiembra: scope.sowingObjectId }],
    observaciones_meteorologicas: [{ _id: id('10'), idEstablecimiento: scope.establishmentObjectId, fechaLocal: '2026-05-01', fuente: 'open_meteo' }],
    indicadores_agrometeorologicos: [{ _id: id('11'), idSiembra: scope.sowingObjectId, fecha: '2026-05-01' }],
    indicadores_agrometeorologicos_generados: [{ _id: id('12'), idSiembra: scope.sowingObjectId, generacionCalculo: 'old' }],
    indicadores_agrometeorologicos_generaciones: [{ _id: id('13'), idSiembra: scope.sowingObjectId, generacionActiva: 'old' }],
    prediccions: [{ _id: id('14'), idSiembra: scope.sowingObjectId, fecha: new Date('2026-05-01T00:00:00Z') }],
    prediccionriegos: [{ _id: id('15'), idSiembra: scope.sowingObjectId, idLote: scope.lotObjectId }],
    alertas: [{ _id: id('16'), idSiembra: scope.sowingObjectId, activa: true }],
    establecimientos: [{ _id: scope.establishmentObjectId }],
    semillas: [{ _id: scope.seedObjectId }],
    cronos: [{ _id: scope.cronoObjectId }],
    weather_location_bindings: [{ _id: id('17'), locationType: 'lote', locationId: scope.lotObjectId, gridPointKey: scope.gridPointKey }],
    weather_grid_points: [{ _id: id('18'), key: scope.gridPointKey }],
    weather_daily: [{ _id: id('19'), gridPointKey: scope.gridPointKey, date: '2026-05-01', values: { temperatureMeanC: 10 } }],
  };
}

test('rechaza cualquier destino que no sea chaman_testing o tenga flags productivos', () => {
  assert.throws(() => toolkit.assertTestingOnly({ uri: 'mongodb://u:p@host/chaman', env: {} }), /exactamente chaman_testing/);
  assert.throws(() => toolkit.assertTestingOnly({ uri: 'mongodb://u:p@host/chaman_testing', env: { RAILWAY_ENVIRONMENT_NAME: 'production' } }), /flags productivos/);
  assert.equal(toolkit.assertTestingOnly({ uri: 'mongodb://u:p@host/chaman_testing?retryWrites=true', env: { NODE_ENV: 'test' } }), 'chaman_testing');
});

test('exige IDs exactos, intervalo valido y un operation-id cerrado', () => {
  assert.throws(() => toolkit.operationConfig({ lotId: '1', sowingId: '2', from: '2026-05-01', to: '2026-05-02', operationId: 'pilot' }), /ObjectId/);
  assert.throws(() => toolkit.operationConfig({ lotId: '1'.padStart(24, '0'), sowingId: '2'.padStart(24, '0'), from: '2026-05-03', to: '2026-05-02', operationId: 'pilot-001' }), /posterior/);
});

test('resuelve server-side una unica siembra activa y binding exacto', async () => {
  const { scope, config } = scopeAndConfig();
  const row = {
    _id: scope.sowingObjectId,
    idLote: scope.lotObjectId,
    idEstablecimiento: scope.establishmentObjectId,
    idSemilla: scope.seedObjectId,
    idCrono: scope.cronoObjectId,
    fechaSiembra: new Date('2026-05-01T00:00:00Z'),
    activa: true,
    lote: { _id: scope.lotObjectId, idSiembra: scope.sowingObjectId, idEstablecimiento: scope.establishmentObjectId },
    siembrasActivas: [{ _id: scope.sowingObjectId }],
  };
  const db = {
    collection(name) {
      if (name === 'siembras') return { aggregate: () => ({ toArray: async () => [row] }) };
      if (name === 'weather_location_bindings') return {
        findOne: async () => ({ gridPointKey: scope.gridPointKey }),
        countDocuments: async () => 1,
      };
      if (name === 'weather_grid_points') return { findOne: async () => ({ key: scope.gridPointKey, enabled: true }) };
      throw new Error(`coleccion inesperada ${name}`);
    },
  };
  const resolved = await toolkit.resolveScope(db, config, FakeObjectId);
  assert.equal(resolved.gridPointKey, scope.gridPointKey);
  assert.equal(resolved.sowingDate, config.from);
});

test('aborta cuando el lote tiene mas de una siembra activa', async () => {
  const { scope, config } = scopeAndConfig();
  const row = {
    _id: scope.sowingObjectId,
    idLote: scope.lotObjectId,
    idEstablecimiento: scope.establishmentObjectId,
    idSemilla: scope.seedObjectId,
    idCrono: scope.cronoObjectId,
    fechaSiembra: new Date('2026-05-01T00:00:00Z'),
    activa: true,
    lote: { _id: scope.lotObjectId, idSiembra: scope.sowingObjectId, idEstablecimiento: scope.establishmentObjectId },
    siembrasActivas: [{ _id: scope.sowingObjectId }, { _id: id('99') }],
  };
  const db = { collection: () => ({ aggregate: () => ({ toArray: async () => [row] }) }) };
  await assert.rejects(toolkit.resolveScope(db, config, FakeObjectId), /exactamente una siembra activa/);
});

test('hash canonico no depende del orden de claves y el escaner bloquea secretos', () => {
  const first = toolkit.canonicalEjson({ b: 2, a: { d: 4, c: 3 } }, EJSON);
  const second = toolkit.canonicalEjson({ a: { c: 3, d: 4 }, b: 2 }, EJSON);
  assert.equal(first, second);
  assert.deepEqual(toolkit.scanSecrets({ nested: { api_key: 'redacted' } }), ['nested.api_key']);
  assert.deepEqual(toolkit.scanSecrets({ dedupeKey: 'safe', eventKeys: ['safe'] }), []);
});

test('bundle detecta manipulacion por SHA-256', async () => {
  const { scope, config } = scopeAndConfig();
  const db = new FakeDb(baselineData(scope));
  const queries = toolkit.collectionQueries(scope, config);
  const state = await toolkit.readState(db, queries, EJSON);
  const plan = toolkit.buildPlan(config, scope, state, 'a'.repeat(40), EJSON);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-era5-bundle-'));
  const bundleDir = path.join(root, 'bundle');
  try {
    toolkit.writeBundle(bundleDir, plan, state, EJSON, new Date('2026-08-28T00:00:00Z'));
    toolkit.loadBundle(bundleDir, EJSON);
    fs.appendFileSync(path.join(bundleDir, 'alertas.ndjson'), '{}\n');
    assert.throws(() => toolkit.loadBundle(bundleDir, EJSON), /Hash invalido/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('restore compara post-state, revierte en transaccion y es idempotente', async () => {
  const { scope, config } = scopeAndConfig();
  const data = baselineData(scope);
  const db = new FakeDb(data);
  const client = new FakeClient();
  const queries = toolkit.collectionQueries(scope, config);
  const pre = await toolkit.readState(db, queries, EJSON);
  const plan = toolkit.buildPlan(config, scope, pre, 'b'.repeat(40), EJSON);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-era5-restore-'));
  const bundleDir = path.join(root, 'bundle');
  try {
    const manifest = toolkit.writeBundle(bundleDir, plan, pre, EJSON);
    data.indicadores_agrometeorologicos.push({ _id: id('20'), idSiembra: scope.sowingObjectId, fecha: '2026-05-02' });
    data.siembras[0].ultimaPrediccion = { riesgo: 99 };
    const post = await toolkit.readState(db, queries, EJSON);
    const postRecord = toolkit.recordPostState(bundleDir, manifest, toolkit.stateSummary(post), EJSON);
    const bundle = toolkit.loadBundle(bundleDir, EJSON);
    const confirmation = toolkit.confirmationForRestore(manifest, postRecord.postStateSha256);
    assert.equal(await toolkit.restoreBundle({ client, db, bundle, queries, EJSON, confirmation, bundleDir }), 'restored');
    assert.equal(data.indicadores_agrometeorologicos.length, 1);
    assert.deepEqual(data.siembras[0].ultimaPrediccion, { riesgo: 1 });
    assert.equal(await toolkit.restoreBundle({ client, db, bundle, queries, EJSON, confirmation, bundleDir }), 'already_restored');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('restore aborta si hubo drift despues de registrar el post-state', async () => {
  const { scope, config } = scopeAndConfig();
  const data = baselineData(scope);
  const db = new FakeDb(data);
  const client = new FakeClient();
  const queries = toolkit.collectionQueries(scope, config);
  const pre = await toolkit.readState(db, queries, EJSON);
  const plan = toolkit.buildPlan(config, scope, pre, 'c'.repeat(40), EJSON);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-era5-drift-'));
  const bundleDir = path.join(root, 'bundle');
  try {
    const manifest = toolkit.writeBundle(bundleDir, plan, pre, EJSON);
    data.alertas[0].activa = false;
    const post = await toolkit.readState(db, queries, EJSON);
    const postRecord = toolkit.recordPostState(bundleDir, manifest, toolkit.stateSummary(post), EJSON);
    data.alertas[0].descripcion = 'cambio concurrente';
    const bundle = toolkit.loadBundle(bundleDir, EJSON);
    await assert.rejects(
      toolkit.restoreBundle({
        client, db, bundle, queries, EJSON,
        confirmation: toolkit.confirmationForRestore(manifest, postRecord.postStateSha256),
        bundleDir,
      }),
      /drift detectado en alertas/,
    );
    assert.equal(data.alertas[0].descripcion, 'cambio concurrente');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
