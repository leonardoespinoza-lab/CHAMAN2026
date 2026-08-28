const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const toolkit = require('../lib/era5-pilot-snapshot');
const BRIDGE_NOW = new Date('2026-08-28T12:00:00.000Z');

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
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some((item) => match(document, item));
    const actual = key.split('.').reduce((value, part) => value?.[part], document);
    if (expected && typeof expected === 'object' && !(expected instanceof FakeObjectId) && !(expected instanceof Date)) {
      if ('$ne' in expected) return !same(actual, expected.$ne);
      if ('$in' in expected) return expected.$in.some((item) => same(actual, item));
      if ('$gte' in expected && actual < expected.$gte) return false;
      if ('$lte' in expected && actual > expected.$lte) return false;
      if ('$lt' in expected && actual >= expected.$lt) return false;
      if ('$gte' in expected || '$lte' in expected || '$lt' in expected) return true;
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
  constructor(documents, db, name) { this.documents = documents; this.db = db; this.name = name; }
  find(query) { return new FakeCursor(this.documents.filter((document) => match(document, query))); }
  listIndexes() { return new FakeCursor(requiredIndexes()[this.name] || [{ name: '_id_', key: { _id: 1 } }]); }
  async deleteMany(query) {
    const before = this.documents.length;
    this.documents.splice(0, this.documents.length, ...this.documents.filter((document) => !match(document, query)));
    return { deletedCount: before - this.documents.length };
  }
  async insertMany(documents) {
    if (this.db.failInsertCollection === this.name) throw new Error(`fallo simulado en ${this.name}`);
    this.documents.push(...ejsonRevive(JSON.parse(JSON.stringify(ejsonNormalize(documents)))));
    if (this.db.corruptAfterInsertCollection === this.name && this.documents[0]) this.documents[0].corrupcionConcurrente = true;
  }
}

function requiredIndexes() {
  return {
    weather_grid_points: [{ name: 'uniq_weather_grid_point_key', key: { key: 1 }, unique: true }],
    weather_location_bindings: [{ name: 'uniq_weather_location_binding', key: { locationType: 1, locationId: 1 }, unique: true }],
    weather_daily: [{ name: 'uniq_weather_daily_grid_date_version', key: { gridPointKey: 1, date: 1, calculationVersion: 1 }, unique: true }],
    observaciones_meteorologicas: [{ name: 'uniq_establishment_time_granularity', key: { idEstablecimiento: 1, timestamp: 1, granularidad: 1 }, unique: true }],
    indicadores_agrometeorologicos: [{ name: 'uniq_sowing_date_engine_version', key: { idSiembra: 1, fecha: 1, versionCalculo: 1 }, unique: true }],
  };
}

class FakeDb {
  constructor(data) { this.data = data; }
  collection(name) { return new FakeCollection(this.data[name] || (this.data[name] = []), this, name); }
}

class FakeClient {
  startSession() {
    return {
      async withTransaction(callback) { await callback(); },
      async endSession() {},
    };
  }
}

class TransactionalFakeClient {
  constructor(db) { this.db = db; }
  startSession() {
    return {
      withTransaction: async (callback) => {
        const before = ejsonRevive(JSON.parse(JSON.stringify(ejsonNormalize(this.db.data))));
        try { await callback(); } catch (error) { this.db.data = before; throw error; }
      },
      async endSession() {},
    };
  }
}

function scopeAndConfig() {
  const scope = {
    lotObjectId: id('1'), sowingObjectId: id('2'), establishmentObjectId: id('3'),
    seedObjectId: id('4'), cronoObjectId: id('5'), gridPointKey: 'grid-ar-1', gridTimezone: 'America/Argentina/Buenos_Aires', sowingDate: '2026-05-01',
  };
  scope.lotCoordinates = { lat: -38.7888, lng: -68.10434 };
  scope.binding = {
    locationType: 'lote', locationId: scope.lotObjectId.value, gridPointKey: scope.gridPointKey,
    latitude: -38.7888, longitude: -68.10434, distanceKm: 0, active: true,
  };
  scope.gridPoint = {
    key: scope.gridPointKey, latitude: -38.7888, longitude: -68.10434, countryCode: 'AR',
    timezone: scope.gridTimezone, enabled: true, provider: 'copernicus-cds',
    dataset: 'reanalysis-era5-land-timeseries', historicalStart: '2020-01-01',
  };
  const config = {
    operationId: 'era5-pilot-test-001', lotId: scope.lotObjectId.value, sowingId: scope.sowingObjectId.value,
    from: '2026-05-01', to: '2026-05-03', historicalStart: '2020-01-01', bridgeToday: '2026-08-28',
  };
  return { scope, config };
}

function baselineData(scope) {
  return {
    siembras: [{ _id: scope.sowingObjectId, idLote: scope.lotObjectId, ultimaPrediccion: { riesgo: 1 } }],
    lotes: [{ _id: scope.lotObjectId, idSiembra: scope.sowingObjectId, ubicacion: { centro: scope.lotCoordinates } }],
    observaciones_meteorologicas: [{
      _id: id('10'), idEstablecimiento: scope.establishmentObjectId,
      timestamp: new Date('2026-05-01T15:00:00.000Z'), granularidad: 'daily',
      fechaLocal: '2099-01-01', idLote: scope.lotObjectId,
      contextosLote: { [scope.lotObjectId.value]: { idLote: scope.lotObjectId.value, fechaLocal: '2099-01-01' } },
      fuente: 'open_meteo',
    }],
    indicadores_agrometeorologicos: [{ _id: id('11'), idSiembra: scope.sowingObjectId, fecha: '2026-05-01' }],
    indicadores_agrometeorologicos_generados: [{ _id: id('12'), idSiembra: scope.sowingObjectId, generacionCalculo: 'old' }],
    indicadores_agrometeorologicos_generaciones: [{ _id: id('13'), idSiembra: scope.sowingObjectId, generacionActiva: 'old' }],
    prediccions: [{ _id: id('14'), idSiembra: scope.sowingObjectId, fecha: new Date('2026-05-01T00:00:00Z') }],
    prediccionriegos: [{ _id: id('15'), idSiembra: scope.sowingObjectId, idLote: scope.lotObjectId }],
    alertas: [{ _id: id('16'), idSiembra: scope.sowingObjectId, activa: true }],
    establecimientos: [{ _id: scope.establishmentObjectId }],
    semillas: [{ _id: scope.seedObjectId }],
    cronos: [{ _id: scope.cronoObjectId }],
    weather_location_bindings: [{ _id: id('17'), ...scope.binding, locationId: scope.lotObjectId }],
    weather_grid_points: [{ _id: id('18'), ...scope.gridPoint }],
    weather_daily: ['01', '02', '03'].map((day, index) => ({ _id: id(String(19 + index)), gridPointKey: scope.gridPointKey, date: `2026-05-${day}`, timezone: scope.gridTimezone, calculationVersion: toolkit.ERA5_CALCULATION_VERSION, hoursAvailable: 24, hoursExpected: 24, availableHoursByMetric: { temperature: 24 }, calculatedAt: new Date('2026-08-01T00:00:00Z'), values: { temperatureMinC: 5, temperatureMeanC: 10, temperatureMaxC: 15 } })),
  };
}

test('rechaza cualquier destino que no sea chaman_testing o tenga flags productivos', () => {
  const uri = 'mongodb://testing.example/chaman_testing?retryWrites=true';
  const fingerprint = toolkit.testingClusterFingerprint(uri);
  const operationId = 'era5-pilot-test-001';
  const now = new Date('2026-08-28T12:00:00.000Z');
  const attestation = {
    schemaVersion: 2, purpose: 'era5-agromet-pilot', operationId, environment: 'testing', database: 'chaman_testing',
    endpointFingerprint: fingerprint, approvedBy: 'qa-owner', evidence: 'change-ticket-123',
    approvedAt: '2026-08-28T11:00:00.000Z', expiresAt: '2026-08-29T11:00:00.000Z',
  };
  const options = { operationId, env: {}, now };
  assert.throws(() => toolkit.assertTestingOnly({ uri: 'mongodb://host/chaman', attestation, ...options }), /exactamente chaman_testing/);
  assert.throws(() => toolkit.assertTestingOnly({ uri, attestation, ...options, env: { RAILWAY_ENVIRONMENT_NAME: 'my-production-copy' } }), /flags productivos/);
  assert.throws(() => toolkit.assertTestingOnly({ uri, ...options }), /attestation externa/);
  assert.throws(() => toolkit.assertTestingOnly({ uri: 'mongodb://otro.example/chaman_testing', attestation, ...options }), /no corresponde/);
  assert.equal(toolkit.assertTestingOnly({ uri, attestation, ...options, env: { NODE_ENV: 'test' } }), 'chaman_testing');
  assert.equal(toolkit.testingClusterFingerprint('mongodb://b.example:27017,a.example:27017/chaman_testing'), toolkit.testingClusterFingerprint('mongodb://a.example:27017,b.example:27017/chaman_testing'));
  const codeSha = 'a'.repeat(40);
  const safety = {
    schemaVersion: 2, environment: 'testing', database: 'chaman_testing', operationId,
    endpointFingerprint: fingerprint, codeSha, statement: toolkit.SAFETY_ATTESTATION,
    approvedBy: 'qa-owner', evidence: 'ticket-1234', approvedAt: '2026-08-28T11:00:00.000Z',
    expiresAt: '2026-08-28T20:00:00.000Z',
  };
  assert.throws(() => toolkit.assertSafetyAttestation({}, { operationId, endpointFingerprint: fingerprint, codeSha, now }), /attestation/);
  toolkit.assertSafetyAttestation(safety, { operationId, endpointFingerprint: fingerprint, codeSha, now });
  assert.throws(() => toolkit.assertSafetyAttestation({ ...safety, operationId: 'otra-operacion' }, { operationId, endpointFingerprint: fingerprint, codeSha, now }), /vinculada/);
  assert.throws(() => toolkit.assertSafetyAttestation({ ...safety, approvedAt: '2026-08-28T11:00:00Z' }, { operationId, endpointFingerprint: fingerprint, codeSha, now }), /ISO-8601/);
  assert.throws(() => toolkit.assertSafetyAttestation({ ...safety, expiresAt: '2026-08-28T11:30:00.000Z' }, { operationId, endpointFingerprint: fingerprint, codeSha, now: new Date('2026-08-28T12:00:00.000Z') }), /vigente/);
  assert.throws(() => toolkit.assertSafetyAttestation({ ...safety, approvedAt: '2026-08-28T12:06:00.000Z', expiresAt: '2026-08-28T20:00:00.000Z' }, { operationId, endpointFingerprint: fingerprint, codeSha, now }), /futuro/);
});

test('exige IDs exactos, intervalo valido y un operation-id cerrado', () => {
  assert.throws(() => toolkit.operationConfig({ lotId: '1', sowingId: '2', from: '2026-05-01', to: '2026-05-02', historicalStart: '2020-01-01', bridgeToday: '2026-08-28', operationId: 'pilot' }), /ObjectId/);
  assert.throws(() => toolkit.operationConfig({ lotId: '1'.padStart(24, '0'), sowingId: '2'.padStart(24, '0'), from: '2026-05-03', to: '2026-05-02', historicalStart: '2020-01-01', bridgeToday: '2026-08-28', operationId: 'pilot-001' }), /posterior/);
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
    lote: { _id: scope.lotObjectId, idSiembra: scope.sowingObjectId, idEstablecimiento: scope.establishmentObjectId, ubicacion: { centro: scope.lotCoordinates } },
    siembrasActivas: [{ _id: scope.sowingObjectId }],
  };
  const db = {
    collection(name) {
      if (name === 'siembras') return { aggregate: () => ({ toArray: async () => [row] }) };
      if (name === 'weather_location_bindings') return {
        findOne: async () => ({ ...scope.binding, locationId: scope.lotObjectId }),
        countDocuments: async () => 1,
      };
      if (name === 'weather_grid_points') return { findOne: async () => ({ ...scope.gridPoint }) };
      if (name === 'lotes') return { countDocuments: async () => 0 };
      if (name === 'observaciones_meteorologicas') return { find: () => ({ toArray: async () => [] }) };
      throw new Error(`coleccion inesperada ${name}`);
    },
  };
  const resolved = await toolkit.resolveScope(db, config, FakeObjectId, { now: BRIDGE_NOW });
  assert.equal(resolved.gridPointKey, scope.gridPointKey);
  assert.equal(resolved.sowingDate, config.from);
  await assert.rejects(
    toolkit.resolveScope(db, { ...config, bridgeToday: '2026-08-27' }, FakeObjectId, { now: BRIDGE_NOW }),
    /bridge-today no coincide/,
  );
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
    lote: { _id: scope.lotObjectId, idSiembra: scope.sowingObjectId, idEstablecimiento: scope.establishmentObjectId, ubicacion: { centro: scope.lotCoordinates } },
    siembrasActivas: [{ _id: scope.sowingObjectId }, { _id: id('99') }],
  };
  const db = { collection: () => ({ aggregate: () => ({ toArray: async () => [row] }) }) };
  await assert.rejects(toolkit.resolveScope(db, config, FakeObjectId, { now: BRIDGE_NOW }), /exactamente una siembra activa/);
});

test('aborta ante otro lote del establecimiento o contexto meteorologico ajeno', async () => {
  const { scope, config } = scopeAndConfig();
  const row = {
    _id: scope.sowingObjectId, idLote: scope.lotObjectId, idEstablecimiento: scope.establishmentObjectId,
    idSemilla: scope.seedObjectId, idCrono: scope.cronoObjectId, fechaSiembra: new Date('2026-05-01T00:00:00Z'), activa: true,
    lote: { _id: scope.lotObjectId, idSiembra: scope.sowingObjectId, idEstablecimiento: scope.establishmentObjectId, ubicacion: { centro: scope.lotCoordinates } }, siembrasActivas: [{ _id: scope.sowingObjectId }],
  };
  function database(otherLots, observations) {
    return { collection(name) {
      if (name === 'siembras') return { aggregate: () => ({ toArray: async () => [row] }) };
      if (name === 'weather_location_bindings') return { findOne: async () => ({ ...scope.binding, locationId: scope.lotObjectId }), countDocuments: async () => 1 };
      if (name === 'weather_grid_points') return { findOne: async () => ({ ...scope.gridPoint }) };
      if (name === 'lotes') return { countDocuments: async () => otherLots };
      if (name === 'observaciones_meteorologicas') return { find: () => ({ toArray: async () => observations }) };
      throw new Error(name);
    } };
  }
  await assert.rejects(toolkit.resolveScope(database(1, []), config, FakeObjectId, { now: BRIDGE_NOW }), /otros lotes/);
  const foreign = id('77').value;
  await assert.rejects(toolkit.resolveScope(database(0, [{ contextosLote: { [foreign]: { idLote: foreign, estado: 'x' } } }]), config, FakeObjectId, { now: BRIDGE_NOW }), /contextos de otros lotes/);
  await assert.rejects(toolkit.resolveScope(database(0, [{ contextosLote: { 'lote-alias': { idLote: 'lote-alias', estado: 'x' } } }]), config, FakeObjectId, { now: BRIDGE_NOW }), /no canonicas/);
  await assert.rejects(toolkit.resolveScope(database(0, [{ contextosLote: { [scope.lotObjectId.value]: { idLote: foreign } } }]), config, FakeObjectId, { now: BRIDGE_NOW }), /no coincide con su clave/);
});

test('selecciona observaciones por la identidad real del upsert y no por fechaLocal', async () => {
  const { scope, config } = scopeAndConfig();
  const wrongLocalDate = {
    _id: id('81'), idEstablecimiento: scope.establishmentObjectId,
    timestamp: new Date('2026-05-02T15:37:00.000Z'), granularidad: 'hourly', fechaLocal: '1999-12-31',
  };
  const stationDaily = {
    _id: id('82'), idEstablecimiento: scope.establishmentObjectId,
    timestamp: new Date('2026-05-02T00:00:00.000Z'), granularidad: 'daily', fechaLocal: '2099-01-01',
  };
  const impossibleDailyKey = {
    _id: id('83'), idEstablecimiento: scope.establishmentObjectId,
    timestamp: new Date('2026-05-02T01:00:00.000Z'), granularidad: 'daily', fechaLocal: '2026-05-02',
  };
  const foreignEstablishment = {
    _id: id('84'), idEstablecimiento: id('99'),
    timestamp: new Date('2026-05-02T15:00:00.000Z'), granularidad: 'daily', fechaLocal: '2026-05-02',
  };
  const query = toolkit.observationIdentityQuery(scope, config);
  const selected = [wrongLocalDate, stationDaily, impossibleDailyKey, foreignEstablishment].filter((item) => match(item, query));
  assert.deepEqual(selected.map((item) => item._id.value), [id('81').value, id('82').value]);
});

test('valida indices exactos fuera de transaccion y cobertura ERA5 v2 diaria continua', async () => {
  const { scope, config } = scopeAndConfig();
  const indexes = requiredIndexes();
  const days = baselineData(scope).weather_daily;
  const db = { collection(name) { return {
    listIndexes: (...args) => { assert.equal(args.length, 0, 'listIndexes no debe recibir session/transaccion'); return { toArray: async () => indexes[name] }; },
    find: () => ({ toArray: async () => days }),
  }; } };
  await toolkit.assertRequiredIndexes(db);
  indexes.weather_daily[0].partialFilterExpression = { active: true };
  await assert.rejects(toolkit.assertRequiredIndexes(db), /no puede ser parcial/);
  delete indexes.weather_daily[0].partialFilterExpression;
  await toolkit.assertEra5Coverage(db, scope, config);
  days[0].availableHoursByMetric.temperature = 23;
  await assert.rejects(toolkit.assertEra5Coverage(db, scope, config), /invalido/);
  days[0].availableHoursByMetric.temperature = 24;
  days[0].values.temperatureMeanC = Number.NaN;
  await assert.rejects(toolkit.assertEra5Coverage(db, scope, config), /invalido/);
  days[0].values.temperatureMeanC = 10;
  days[0].values.temperatureMaxC = 999;
  await assert.rejects(toolkit.assertEra5Coverage(db, scope, config), /invalido/);
  days[0].values.temperatureMaxC = 15;
  scope.gridPoint.timezone = 'UTC+3';
  await assert.rejects(toolkit.assertEra5Coverage(db, scope, config), /timezone IANA/);
  scope.gridPoint.timezone = scope.gridTimezone;
  scope.gridPoint.historicalStart = '2026-06-01';
  await assert.rejects(toolkit.assertEra5Coverage(db, scope, config), /historicalStart/);
  scope.gridPoint.historicalStart = '2020-01-01';
  scope.gridPoint.provider = 'otro';
  await assert.rejects(toolkit.assertEra5Coverage(db, scope, config), /proveedor/);
  scope.gridPoint.provider = 'copernicus-cds';
  days.splice(1, 1);
  await assert.rejects(toolkit.assertEra5Coverage(db, scope, config), /incompleta/);
});

test('la cobertura ERA5 usa el mismo corte historico del bridge y excluye los ultimos cinco dias', async () => {
  const { scope, config } = scopeAndConfig();
  const bridgeConfig = { ...config, from: '2026-08-20', to: '2026-08-27', bridgeToday: '2026-08-28' };
  const rows = ['20', '21', '22', '23', '24'].map((day, index) => ({
    _id: id(String(150 + index)), gridPointKey: scope.gridPointKey, date: `2026-08-${day}`,
    timezone: scope.gridTimezone, calculationVersion: toolkit.ERA5_CALCULATION_VERSION,
    hoursAvailable: 24, hoursExpected: 24, availableHoursByMetric: { temperature: 24 },
    calculatedAt: new Date('2026-08-28T00:00:00.000Z'),
    values: { temperatureMinC: 5, temperatureMeanC: 10, temperatureMaxC: 15 },
  }));
  let capturedQuery;
  const db = { collection: () => ({
    find(query) {
      capturedQuery = query;
      return new FakeCursor(rows.filter((row) => match(row, query)));
    },
  }) };
  await toolkit.assertEra5Coverage(db, scope, bridgeConfig);
  assert.equal(capturedQuery.date.$gte, '2026-08-20');
  assert.equal(capturedQuery.date.$lt, '2026-08-24');
});

test('hash canonico no depende del orden de claves y el escaner bloquea secretos', () => {
  const first = toolkit.canonicalEjson({ b: 2, a: { d: 4, c: 3 } }, EJSON);
  const second = toolkit.canonicalEjson({ a: { c: 3, d: 4 }, b: 2 }, EJSON);
  assert.equal(first, second);
  assert.deepEqual(toolkit.scanSecrets({ nested: { api_key: 'real-value' } }), ['nested.api_key']);
  assert.deepEqual(toolkit.scanSecrets({ client_secret: 'real', token: 'real', authorization: 'real' }).sort(), ['authorization', 'client_secret', 'token']);
  assert.deepEqual(toolkit.scanSecrets({ authToken: 'x', bearer: 'x', private_key: 'x', signingKey: 'x', smtpUrl: 'x', databaseUri: 'x' }).sort(), ['authToken', 'bearer', 'databaseUri', 'private_key', 'signingKey', 'smtpUrl'].sort());
  assert.deepEqual(toolkit.scanSecrets({ payload: { _bsontype: 'ObjectId', apiToken: 'x', jwtSecret: 'y' } }).sort(), ['payload.apiToken', 'payload.jwtSecret']);
  assert.deepEqual(toolkit.scanSecrets({ payload: { _bsontype: 'ObjectId', apiToken: 'x', toExtendedJSON: () => ({ $oid: 'safe' }) } }), ['payload.apiToken']);
  assert.deepEqual(toolkit.scanSecrets({ authToken: null, bearer: '<redacted>', databaseUri: 'redacted' }), []);
  assert.deepEqual(toolkit.scanSecrets({ dedupeKey: 'safe', eventKeys: ['safe'] }), []);
});

test('verify y restore revalidan worktree limpio y codeSha sellado', () => {
  const manifest = { codeSha: 'a'.repeat(40) };
  toolkit.assertCodeIdentity(manifest, 'a'.repeat(40));
  assert.throws(() => toolkit.assertCodeIdentity(manifest, 'b'.repeat(40)), /no coincide/);
  const cli = fs.readFileSync(path.join(__dirname, '..', 'era5-pilot-snapshot.js'), 'utf8');
  assert.match(cli, /if \(bundle\) toolkit\.assertCodeIdentity\(bundle\.manifest, executionCodeSha\)/);
  assert.match(cli, /toolkit\.assertCodeIdentity\(bundle\.manifest, codeSha\(\)\)/);
  assert.match(cli, /const restoreCodeSha = codeSha\(\)/);
});

test('writeBundle falla cerrado ante secretos incluso con un _bsontype falsificado', async () => {
  const { scope, config } = scopeAndConfig();
  const db = new FakeDb(baselineData(scope));
  const state = await toolkit.readState(db, toolkit.collectionQueries(scope, config), EJSON);
  state.alertas.documents[0].metadata = { _bsontype: 'ObjectId', apiToken: 'no-debe-salir' };
  const plan = toolkit.buildPlan(config, scope, state, 'f'.repeat(40), EJSON);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-era5-secret-'));
  const bundleDir = path.join(root, 'bundle');
  try {
    assert.throws(() => toolkit.writeBundle(bundleDir, plan, state, EJSON), /escaner de secretos/);
    assert.equal(fs.existsSync(bundleDir), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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
    data.siembras[0].idLote = id('88');
    data.observaciones_meteorologicas[0].fechaLocal = '1900-01-01';
    const post = await toolkit.readState(db, queries, EJSON);
    const postRecord = toolkit.recordPostState(bundleDir, manifest, toolkit.stateSummary(post), EJSON);
    const bundle = toolkit.loadBundle(bundleDir, EJSON);
    const confirmation = toolkit.confirmationForRestore(manifest, postRecord.postStateSha256);
    await assert.rejects(
      toolkit.restoreBundle({ client, db, bundle, ObjectId: FakeObjectId, EJSON, confirmation, bundleDir, currentCodeSha: '0'.repeat(40) }),
      /codeSha actual no coincide/,
    );
    assert.equal(await toolkit.restoreBundle({ client, db, bundle, ObjectId: FakeObjectId, EJSON, confirmation, bundleDir, currentCodeSha: manifest.codeSha }), 'restored');
    assert.equal(data.indicadores_agrometeorologicos.length, 1);
    assert.deepEqual(data.siembras[0].ultimaPrediccion, { riesgo: 1 });
    assert.equal(data.siembras[0].idLote.value, scope.lotObjectId.value);
    assert.equal(data.observaciones_meteorologicas[0].fechaLocal, '2099-01-01');
    assert.equal(await toolkit.restoreBundle({ client, db, bundle, ObjectId: FakeObjectId, EJSON, confirmation, bundleDir, currentCodeSha: manifest.codeSha }), 'already_restored');
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
        ObjectId: FakeObjectId, confirmation: toolkit.confirmationForRestore(manifest, postRecord.postStateSha256),
        bundleDir, currentCodeSha: manifest.codeSha,
      }),
      /drift detectado en alertas/,
    );
    assert.equal(data.alertas[0].descripcion, 'cambio concurrente');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CAS sellado detecta re-key de un documento creado durante el piloto', async () => {
  const { scope, config } = scopeAndConfig();
  const db = new FakeDb(baselineData(scope));
  const queries = toolkit.collectionQueries(scope, config);
  const pre = await toolkit.readState(db, queries, EJSON);
  const plan = toolkit.buildPlan(config, scope, pre, 'e'.repeat(40), EJSON);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-era5-rekey-'));
  const bundleDir = path.join(root, 'bundle');
  try {
    const manifest = toolkit.writeBundle(bundleDir, plan, pre, EJSON);
    const created = { _id: id('90'), idSiembra: scope.sowingObjectId, fecha: '2026-05-02' };
    db.data.indicadores_agrometeorologicos.push(created);
    const postQueries = toolkit.sealedQueries(manifest, FakeObjectId);
    const post = await toolkit.readState(db, postQueries, EJSON);
    const record = toolkit.recordPostState(bundleDir, manifest, toolkit.stateSummary(post), EJSON);
    created.idSiembra = id('91');
    await assert.rejects(toolkit.restoreBundle({
      client: new FakeClient(), db, bundle: toolkit.loadBundle(bundleDir, EJSON), ObjectId: FakeObjectId, EJSON,
      confirmation: toolkit.confirmationForRestore(manifest, record.postStateSha256), bundleDir, currentCodeSha: manifest.codeSha,
    }), /drift detectado/);
    assert.equal(db.data.indicadores_agrometeorologicos.some((item) => same(item._id, id('90'))), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('un fallo intermedio revierte todas las escrituras en la transaccion simulada', async () => {
  const { scope, config } = scopeAndConfig();
  const db = new FakeDb(baselineData(scope));
  const queries = toolkit.collectionQueries(scope, config);
  const pre = await toolkit.readState(db, queries, EJSON);
  const plan = toolkit.buildPlan(config, scope, pre, 'd'.repeat(40), EJSON);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-era5-rollback-'));
  const bundleDir = path.join(root, 'bundle');
  try {
    const manifest = toolkit.writeBundle(bundleDir, plan, pre, EJSON);
    db.data.siembras[0].ultimaPrediccion = { riesgo: 50 };
    db.data.alertas[0].activa = false;
    const post = await toolkit.readState(db, queries, EJSON);
    const record = toolkit.recordPostState(bundleDir, manifest, toolkit.stateSummary(post), EJSON);
    const before = EJSON.stringify(db.data);
    db.failInsertCollection = 'lotes';
    await assert.rejects(toolkit.restoreBundle({
      client: new TransactionalFakeClient(db), db, bundle: toolkit.loadBundle(bundleDir, EJSON), ObjectId: FakeObjectId, EJSON,
      confirmation: toolkit.confirmationForRestore(manifest, record.postStateSha256), bundleDir, currentCodeSha: manifest.codeSha,
    }), /fallo simulado/);
    assert.equal(EJSON.stringify(db.data), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('la verificacion dentro de la transaccion bloquea y revierte un restore corrupto', async () => {
  const { scope, config } = scopeAndConfig();
  const db = new FakeDb(baselineData(scope));
  const queries = toolkit.collectionQueries(scope, config);
  const pre = await toolkit.readState(db, queries, EJSON);
  const plan = toolkit.buildPlan(config, scope, pre, '9'.repeat(40), EJSON);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-era5-transaction-verify-'));
  const bundleDir = path.join(root, 'bundle');
  try {
    const manifest = toolkit.writeBundle(bundleDir, plan, pre, EJSON);
    db.data.siembras[0].ultimaPrediccion = { riesgo: 77 };
    const post = await toolkit.readState(db, queries, EJSON);
    const record = toolkit.recordPostState(bundleDir, manifest, toolkit.stateSummary(post), EJSON);
    const before = EJSON.stringify(db.data);
    db.corruptAfterInsertCollection = 'siembras';
    await assert.rejects(toolkit.restoreBundle({
      client: new TransactionalFakeClient(db), db, bundle: toolkit.loadBundle(bundleDir, EJSON), ObjectId: FakeObjectId, EJSON,
      confirmation: toolkit.confirmationForRestore(manifest, record.postStateSha256), bundleDir,
      currentCodeSha: manifest.codeSha,
    }), /verificacion transaccional del restore/);
    assert.equal(EJSON.stringify(db.data), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
