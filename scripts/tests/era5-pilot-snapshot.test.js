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
  findOne(query) { return Promise.resolve(this.documents.find((document) => match(document, query)) || null); }
  countDocuments(query) { return Promise.resolve(this.documents.filter((document) => match(document, query)).length); }
  aggregate(pipeline) {
    assert.equal(this.name, 'siembras');
    const matched = this.documents.filter((document) => match(document, pipeline[0].$match));
    const rows = matched.map((sowing) => {
      const lot = this.db.data.lotes.find((item) => same(item._id, sowing.idLote));
      if (!lot) return null;
      const active = this.documents.filter((item) => same(item.idLote, sowing.idLote) && item.activa !== false && !item.fechaCosecha);
      return { ...sowing, lote: lot, siembrasActivas: active.map((item) => ({ _id: item._id })) };
    }).filter(Boolean);
    return new FakeCursor(rows);
  }
  listIndexes() {
    this.db.indexListCalls = (this.db.indexListCalls || 0) + 1;
    if (this.db.failIndexesAfterCall && this.db.indexListCalls > this.db.failIndexesAfterCall) return new FakeCursor([]);
    return new FakeCursor(requiredIndexes()[this.name] || [{ name: '_id_', key: { _id: 1 } }]);
  }
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

function planControls(config) {
  return {
    operationalApproval: {
      schemaVersion: 3,
      attestationSha256: 'a'.repeat(64),
      endpointFingerprint: 'd'.repeat(64),
      pilotConfig: toolkit.criticalPilotConfig(config),
    },
    runtimeIdentity: {
      nodeMajor: 20,
      nodeVersion: '20.19.5',
      lockfiles: {
        'package-lock.json': 'b'.repeat(64),
        'sdc-datos/package-lock.json': 'c'.repeat(64),
      },
    },
  };
}

function buildPlan(config, scope, state, codeSha) {
  return toolkit.buildPlan(config, scope, state, codeSha, EJSON, planControls(config));
}

async function readRevalidatedPostState(db, manifest, now = new Date('2026-08-30T12:00:00.000Z')) {
  return toolkit.readConsistentState({
    client: new FakeClient(),
    db,
    queries: toolkit.sealedQueries(manifest, FakeObjectId),
    EJSON,
    revalidation: { manifest, ObjectId: FakeObjectId, now },
  });
}

function baselineData(scope) {
  return {
    siembras: [{
      _id: scope.sowingObjectId, idLote: scope.lotObjectId, idEstablecimiento: scope.establishmentObjectId,
      idSemilla: scope.seedObjectId, idCrono: scope.cronoObjectId,
      fechaSiembra: new Date('2026-05-01T00:00:00.000Z'), activa: true,
      ultimaPrediccion: { riesgo: 1 },
    }],
    lotes: [{
      _id: scope.lotObjectId, idSiembra: scope.sowingObjectId,
      idEstablecimiento: scope.establishmentObjectId, ubicacion: { centro: scope.lotCoordinates },
    }],
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
  const { config } = scopeAndConfig();
  const safety = {
    schemaVersion: 3, environment: 'testing', database: 'chaman_testing', operationId,
    endpointFingerprint: fingerprint, codeSha, statement: toolkit.SAFETY_ATTESTATION,
    pilotConfig: toolkit.criticalPilotConfig(config),
    approvedBy: 'qa-owner', evidence: 'ticket-1234', approvedAt: '2026-08-28T11:00:00.000Z',
    expiresAt: '2026-08-28T20:00:00.000Z',
  };
  const safetyOptions = { operationId, endpointFingerprint: fingerprint, codeSha, config, now };
  assert.throws(() => toolkit.assertSafetyAttestation({}, safetyOptions), /attestation/);
  const approval = toolkit.assertSafetyAttestation(safety, safetyOptions);
  const manifest = {
    operationId,
    lotId: config.lotId,
    sowingId: config.sowingId,
    weatherWindow: { from: config.from, to: config.to },
    bridgeConfig: { historicalStart: config.historicalStart, bridgeToday: config.bridgeToday },
    operationalApproval: approval,
  };
  toolkit.assertOperationalApprovalMatchesManifest(manifest, approval);
  assert.throws(() => toolkit.assertOperationalApprovalMatchesManifest(manifest, {
    ...approval, endpointFingerprint: 'f'.repeat(64),
  }), /cluster Testing actual/);
  assert.throws(() => toolkit.assertSafetyAttestation({ ...safety, operationId: 'otra-operacion' }, safetyOptions), /vinculada/);
  assert.throws(() => toolkit.assertSafetyAttestation({ ...safety, pilotConfig: { ...safety.pilotConfig, historicalStart: '2021-01-01' } }, safetyOptions), /configuracion critica/);
  assert.throws(() => toolkit.assertSafetyAttestation({ ...safety, approvedAt: '2026-08-28T11:00:00Z' }, safetyOptions), /ISO-8601/);
  assert.throws(() => toolkit.assertSafetyAttestation({ ...safety, expiresAt: '2026-08-28T11:30:00.000Z' }, { ...safetyOptions, now: new Date('2026-08-28T12:00:00.000Z') }), /vigente/);
  assert.throws(() => toolkit.assertSafetyAttestation({ ...safety, approvedAt: '2026-08-28T12:06:00.000Z', expiresAt: '2026-08-28T20:00:00.000Z' }, safetyOptions), /futuro/);
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

test('selecciona hourly y todas las identidades daily por fechaLocal, rango UTC, 00Z/01Z y mediodia local', async () => {
  const { scope, config } = scopeAndConfig();
  const wrongLocalDate = {
    _id: id('81'), idEstablecimiento: scope.establishmentObjectId,
    timestamp: new Date('2026-05-02T15:37:00.000Z'), granularidad: 'hourly', fechaLocal: '1999-12-31',
  };
  const stationDaily = {
    _id: id('82'), idEstablecimiento: scope.establishmentObjectId,
    timestamp: new Date('2026-05-02T00:00:00.000Z'), granularidad: 'daily', fechaLocal: '2099-01-01',
  };
  const oneUtcDailyKey = {
    _id: id('83'), idEstablecimiento: scope.establishmentObjectId,
    timestamp: new Date('2026-05-02T01:00:00.000Z'), granularidad: 'daily', fechaLocal: '2099-01-01',
  };
  const localDateOnly = {
    _id: id('85'), idEstablecimiento: scope.establishmentObjectId,
    timestamp: new Date('2030-01-01T09:00:00.000Z'), granularidad: 'daily', fechaLocal: '2026-05-03',
  };
  const foreignEstablishment = {
    _id: id('84'), idEstablecimiento: id('99'),
    timestamp: new Date('2026-05-02T15:00:00.000Z'), granularidad: 'daily', fechaLocal: '2026-05-02',
  };
  const query = toolkit.observationIdentityQuery(scope, config);
  const selected = [wrongLocalDate, stationDaily, oneUtcDailyKey, localDateOnly, foreignEstablishment].filter((item) => match(item, query));
  assert.deepEqual(selected.map((item) => item._id.value), [id('81').value, id('82').value, id('83').value, id('85').value]);
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
  const validTemperatures = { temperatureMinC: 5, temperatureMeanC: 10, temperatureMaxC: 15 };
  for (const key of Object.keys(validTemperatures)) {
    for (const invalid of [null, undefined, '', '   ', false]) {
      days[0].values[key] = invalid;
      await assert.rejects(toolkit.assertEra5Coverage(db, scope, config), /invalido/);
    }
    days[0].values[key] = validTemperatures[key];
  }
  days[0].values.temperatureMinC = '5.25';
  await toolkit.assertEra5Coverage(db, scope, config);
  days[0].values.temperatureMinC = 16;
  await assert.rejects(toolkit.assertEra5Coverage(db, scope, config), /invalido/);
  days[0].values.temperatureMinC = 5;
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
  assert.deepEqual(toolkit.scanSecrets({ payload: {
    _bsontype: 'ObjectId', toHexString: () => 'a'.repeat(24), metadata: { password: 'nested-secret' },
  } }), ['payload.metadata.password']);
  assert.deepEqual(toolkit.scanSecrets({ api: { key: 'real-value' } }), ['api.key']);
  assert.deepEqual(toolkit.scanSecrets({ raw: Buffer.from('secret') }), ['raw']);
  assert.deepEqual(toolkit.scanSecrets({ raw: new ArrayBuffer(32) }), ['raw']);
  assert.deepEqual(toolkit.scanSecrets({ raw: new Uint8Array([1, 2, 3]) }), ['raw']);
  assert.deepEqual(toolkit.scanSecrets({ raw: { _bsontype: 'Binary', buffer: Buffer.from('secret') } }), ['raw']);
  assert.deepEqual(toolkit.scanSecrets({ raw: { $binary: { base64: 'c2VjcmV0', subType: '00' } } }), ['raw']);
  assert.deepEqual(toolkit.scanSecrets({ encoded: 'VGhpcy1pcy1hLXNlY3JldC12YWx1ZQ==' }), ['encoded']);
  assert.deepEqual(toolkit.scanSecrets({ authToken: null, bearer: '<redacted>', databaseUri: 'redacted' }), []);
  assert.deepEqual(toolkit.scanSecrets({ dedupeKey: 'safe', eventKeys: ['safe'], sha256: 'a'.repeat(64) }), []);
});

test('exige Node 20.x y liga el bundle a ambos package-lock exactos', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-era5-runtime-'));
  try {
    fs.mkdirSync(path.join(root, 'sdc-datos'));
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
    fs.writeFileSync(path.join(root, 'sdc-datos', 'package-lock.json'), '{"lockfileVersion":3,"name":"datos"}\n');
    assert.throws(() => toolkit.runtimeDependencyIdentity(root, { node: '19.9.0' }), /Node\.js 20/);
    assert.throws(() => toolkit.runtimeDependencyIdentity(root, { node: '21.1.0' }), /Node\.js 20/);
    const sealed = toolkit.runtimeDependencyIdentity(root, { node: '20.19.5' });
    toolkit.assertRuntimeDependencyIdentity(sealed, { ...sealed, nodeVersion: '20.20.0' });
    assert.throws(() => toolkit.assertRuntimeDependencyIdentity(sealed, {
      ...sealed,
      lockfiles: { ...sealed.lockfiles, 'sdc-datos/package-lock.json': '0'.repeat(64) },
    }), /no coincide/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fuerza bundle y attestations fuera del worktree, incluso antes de crearlos', () => {
  const repositoryRoot = path.resolve(__dirname, '..', '..');
  assert.throws(
    () => toolkit.assertExternalPath(path.join(__dirname, 'bundle-interno'), 'bundle de prueba'),
    /fuera del worktree/,
  );
  for (const deceptiveName of ['..bundle', '...', '..safe']) {
    assert.throws(
      () => toolkit.assertExternalPath(path.join(repositoryRoot, deceptiveName, 'bundle'), 'bundle de prueba'),
      /fuera del worktree/,
    );
  }
  const outside = path.join(os.tmpdir(), `chaman-era5-external-${process.pid}`, 'bundle');
  assert.equal(toolkit.assertExternalPath(outside, 'bundle de prueba'), path.resolve(outside));
});

test('verify y restore revalidan worktree limpio y codeSha sellado', () => {
  const manifest = { codeSha: 'a'.repeat(40) };
  toolkit.assertCodeIdentity(manifest, 'a'.repeat(40));
  assert.throws(() => toolkit.assertCodeIdentity(manifest, 'b'.repeat(40)), /no coincide/);
  const cli = fs.readFileSync(path.join(__dirname, '..', 'era5-pilot-snapshot.js'), 'utf8');
  assert.match(cli, /if \(bundle\) toolkit\.assertCodeIdentity\(bundle\.manifest, executionCodeSha\)/);
  assert.match(cli, /if \(bundle\) toolkit\.assertOperationalApprovalMatchesManifest\(bundle\.manifest, operationalApproval\)/);
  assert.match(cli, /toolkit\.assertCodeIdentity\(bundle\.manifest, toolkit\.resolveCodeSha\(\)\)/);
  assert.match(cli, /const restoreCodeSha = toolkit\.resolveCodeSha\(\)/);
});

test('codeSha usa Git limpio local y acepta metadata nativa solo en testing-datos sin .git', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-era5-code-sha-'));
  try {
    fs.writeFileSync(path.join(root, '.git'), 'gitdir: C:/fake\n');
    const calls = [];
    const local = toolkit.resolveCodeSha({
      repositoryRoot: root,
      runGit(args) {
        calls.push(args.join(' '));
        return args[0] === 'status' ? '' : `${'a'.repeat(40)}\n`;
      },
    });
    assert.equal(local, 'a'.repeat(40));
    assert.deepEqual(calls, ['status --porcelain --untracked-files=all', 'rev-parse HEAD']);
    assert.throws(() => toolkit.resolveCodeSha({
      repositoryRoot: root,
      runGit(args) { return args[0] === 'status' ? ' M archivo\n' : `${'a'.repeat(40)}\n`; },
    }), /worktree debe estar limpio/);

    fs.rmSync(path.join(root, '.git'));
    const railwayEnvironment = {
      RAILWAY_ENVIRONMENT_NAME: 'testing',
      RAILWAY_SERVICE_NAME: 'testing-datos',
      RAILWAY_DEPLOYMENT_ID: '12e33a7e-41e7-4772-aa42-23a2458f11de',
      RAILWAY_PROJECT_ID: '36dee457-e9f8-498d-a990-72b9728d63d5',
      RAILWAY_GIT_COMMIT_SHA: 'B'.repeat(40),
    };
    assert.equal(
      toolkit.resolveCodeSha({ repositoryRoot: root, environment: railwayEnvironment }),
      'b'.repeat(40),
    );
    assert.throws(() => toolkit.resolveCodeSha({
      repositoryRoot: root,
      environment: { ...railwayEnvironment, RAILWAY_ENVIRONMENT_NAME: 'production' },
    }), /solo puede provenir.*testing-datos/);
    assert.throws(() => toolkit.resolveCodeSha({
      repositoryRoot: root,
      environment: { ...railwayEnvironment, RAILWAY_SERVICE_NAME: 'testing-clima' },
    }), /solo puede provenir.*testing-datos/);
    assert.throws(() => toolkit.resolveCodeSha({
      repositoryRoot: root,
      environment: { ...railwayEnvironment, RAILWAY_GIT_COMMIT_SHA: 'not-a-sha' },
    }), /solo puede provenir.*testing-datos/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('writeBundle falla cerrado ante secretos incluso con un _bsontype falsificado', async () => {
  const { scope, config } = scopeAndConfig();
  const db = new FakeDb(baselineData(scope));
  const state = await toolkit.readState(db, toolkit.collectionQueries(scope, config), EJSON);
  state.alertas.documents[0].metadata = { _bsontype: 'ObjectId', apiToken: 'no-debe-salir' };
  const plan = buildPlan(config, scope, state, 'f'.repeat(40));
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
  const plan = buildPlan(config, scope, state, 'a'.repeat(40));
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

test('record-post-state solo acepta prueba fresca de revalidacion transaccional y revalida indices antes/despues', async () => {
  const { scope, config } = scopeAndConfig();
  const db = new FakeDb(baselineData(scope));
  const pre = await toolkit.readState(db, toolkit.collectionQueries(scope, config), EJSON);
  const plan = buildPlan(config, scope, pre, '8'.repeat(40));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-era5-revalidation-'));
  const bundleDir = path.join(root, 'bundle');
  try {
    const manifest = toolkit.writeBundle(bundleDir, plan, pre, EJSON);
    db.indexListCalls = 0;
    const post = await readRevalidatedPostState(db, manifest, new Date('2026-09-15T12:00:00.000Z'));
    assert.equal(db.indexListCalls, 10, 'cinco indices deben comprobarse antes y despues de la transaccion');
    assert.throws(
      () => toolkit.recordPostState(bundleDir, manifest, toolkit.stateSummary(post.state), EJSON),
      /prueba de revalidacion/,
    );
    const mismatchedSummary = toolkit.stateSummary(post.state);
    mismatchedSummary.alertas = { ...mismatchedSummary.alertas, count: mismatchedSummary.alertas.count + 1 };
    assert.throws(
      () => toolkit.recordPostState(bundleDir, manifest, mismatchedSummary, EJSON, post.revalidationProof),
      /resumen post-piloto/,
    );
    const record = toolkit.recordPostState(
      bundleDir,
      manifest,
      toolkit.stateSummary(post.state),
      EJSON,
      post.revalidationProof,
    );
    assert.equal(record.revalidationProof.manifestSha256, manifest.manifestSha256);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('post-state aborta dentro de transaccion ante drift de siembra, exclusividad o contextos', async () => {
  const { scope, config } = scopeAndConfig();
  const baseDb = new FakeDb(baselineData(scope));
  const pre = await toolkit.readState(baseDb, toolkit.collectionQueries(scope, config), EJSON);
  const plan = buildPlan(config, scope, pre, '7'.repeat(40));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-era5-scope-drift-'));
  const bundleDir = path.join(root, 'bundle');
  try {
    const manifest = toolkit.writeBundle(bundleDir, plan, pre, EJSON);
    const cases = [
      {
        expected: /pareja lote\/siembra/,
        mutate(data) { data.siembras[0].idLote = id('88'); },
      },
      {
        expected: /no esta activa/,
        mutate(data) { data.siembras[0].activa = false; },
      },
      {
        expected: /fechaSiembra/,
        mutate(data) { data.siembras[0].fechaSiembra = new Date('2026-05-02T00:00:00.000Z'); },
      },
      {
        expected: /otros lotes/,
        mutate(data) { data.lotes.push({ _id: id('89'), idEstablecimiento: scope.establishmentObjectId }); },
      },
      {
        expected: /contextos de otros lotes/,
        mutate(data) {
          const foreign = id('90').value;
          data.observaciones_meteorologicas[0].timestamp = new Date('2030-01-01T01:00:00.000Z');
          data.observaciones_meteorologicas[0].fechaLocal = '2030-01-01';
          data.observaciones_meteorologicas[0].contextosLote[foreign] = { idLote: foreign };
        },
      },
    ];
    for (const scenario of cases) {
      const data = baselineData(scope);
      scenario.mutate(data);
      await assert.rejects(readRevalidatedPostState(new FakeDb(data), manifest), scenario.expected);
    }
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
  const plan = buildPlan(config, scope, pre, 'b'.repeat(40));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-era5-restore-'));
  const bundleDir = path.join(root, 'bundle');
  try {
    const manifest = toolkit.writeBundle(bundleDir, plan, pre, EJSON);
    data.indicadores_agrometeorologicos.push({ _id: id('20'), idSiembra: scope.sowingObjectId, fecha: '2026-05-02' });
    data.siembras[0].ultimaPrediccion = { riesgo: 99 };
    data.observaciones_meteorologicas[0].fechaLocal = '1900-01-01';
    const post = await readRevalidatedPostState(db, manifest);
    const postRecord = toolkit.recordPostState(bundleDir, manifest, toolkit.stateSummary(post.state), EJSON, post.revalidationProof);
    const bundle = toolkit.loadBundle(bundleDir, EJSON);
    const confirmation = toolkit.confirmationForRestore(manifest, postRecord.postStateSha256);
    await assert.rejects(
      toolkit.restoreBundle({ client, db, bundle, ObjectId: FakeObjectId, EJSON, confirmation, bundleDir, currentCodeSha: '0'.repeat(40) }),
      /codeSha actual no coincide/,
    );
    db.indexListCalls = 0;
    const restored = await toolkit.restoreBundle({
      client, db, bundle, ObjectId: FakeObjectId, EJSON, confirmation, bundleDir,
      currentCodeSha: manifest.codeSha, now: new Date('2026-10-01T12:00:00.000Z'),
    });
    assert.equal(restored.status, 'restored');
    assert.equal(restored.databaseMutationCommitted, true);
    assert.equal(restored.indexPostcheck, 'passed');
    assert.equal(db.indexListCalls, 10, 'restore debe revalidar indices antes y despues de la transaccion');
    assert.equal(data.indicadores_agrometeorologicos.length, 1);
    assert.deepEqual(data.siembras[0].ultimaPrediccion, { riesgo: 1 });
    assert.equal(data.siembras[0].idLote.value, scope.lotObjectId.value);
    assert.equal(data.observaciones_meteorologicas[0].fechaLocal, '2099-01-01');
    const idempotent = await toolkit.restoreBundle({
      client, db, bundle, ObjectId: FakeObjectId, EJSON, confirmation, bundleDir,
      currentCodeSha: manifest.codeSha, now: new Date('2026-10-02T12:00:00.000Z'),
    });
    assert.equal(idempotent.status, 'already_restored');
    assert.equal(idempotent.databaseMutationCommitted, false);
    assert.equal(db.indexListCalls, 20);
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
  const plan = buildPlan(config, scope, pre, 'c'.repeat(40));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-era5-drift-'));
  const bundleDir = path.join(root, 'bundle');
  try {
    const manifest = toolkit.writeBundle(bundleDir, plan, pre, EJSON);
    data.alertas[0].activa = false;
    const post = await readRevalidatedPostState(db, manifest);
    const postRecord = toolkit.recordPostState(bundleDir, manifest, toolkit.stateSummary(post.state), EJSON, post.revalidationProof);
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

test('restore informa inequívocamente si el commit ocurrió pero falla el postcheck de índices', async () => {
  const { scope, config } = scopeAndConfig();
  const db = new FakeDb(baselineData(scope));
  const queries = toolkit.collectionQueries(scope, config);
  const pre = await toolkit.readState(db, queries, EJSON);
  const plan = buildPlan(config, scope, pre, '5'.repeat(40));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-era5-index-receipt-'));
  const bundleDir = path.join(root, 'bundle');
  try {
    const manifest = toolkit.writeBundle(bundleDir, plan, pre, EJSON);
    db.data.alertas[0].activa = false;
    const post = await readRevalidatedPostState(db, manifest);
    const record = toolkit.recordPostState(
      bundleDir, manifest, toolkit.stateSummary(post.state), EJSON, post.revalidationProof,
    );
    db.indexListCalls = 0;
    db.failIndexesAfterCall = 5;
    const outcome = await toolkit.restoreBundle({
      client: new FakeClient(), db, bundle: toolkit.loadBundle(bundleDir, EJSON), ObjectId: FakeObjectId, EJSON,
      confirmation: toolkit.confirmationForRestore(manifest, record.postStateSha256), bundleDir,
      currentCodeSha: manifest.codeSha,
    });
    assert.equal(outcome.status, 'restored_but_index_postcheck_failed');
    assert.equal(outcome.restoreStatus, 'restored');
    assert.equal(outcome.databaseMutationCommitted, true);
    assert.equal(outcome.indexPostcheck, 'failed');
    assert.match(outcome.postcheckError, /Falta indice exacto requerido/);
    assert.equal(db.data.alertas[0].activa, true, 'el recibo debe reconocer que el restore ya fue confirmado');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('restore revalida contextos contra el manifiesto antes de cualquier mutacion', async () => {
  const { scope, config } = scopeAndConfig();
  const db = new FakeDb(baselineData(scope));
  const queries = toolkit.collectionQueries(scope, config);
  const pre = await toolkit.readState(db, queries, EJSON);
  const plan = buildPlan(config, scope, pre, '6'.repeat(40));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-era5-restore-scope-'));
  const bundleDir = path.join(root, 'bundle');
  try {
    const manifest = toolkit.writeBundle(bundleDir, plan, pre, EJSON);
    db.data.alertas[0].activa = false;
    const post = await readRevalidatedPostState(db, manifest);
    const record = toolkit.recordPostState(
      bundleDir, manifest, toolkit.stateSummary(post.state), EJSON, post.revalidationProof,
    );
    const foreign = id('77').value;
    db.data.observaciones_meteorologicas[0].timestamp = new Date('2030-01-01T01:00:00.000Z');
    db.data.observaciones_meteorologicas[0].fechaLocal = '2030-01-01';
    db.data.observaciones_meteorologicas[0].contextosLote[foreign] = { idLote: foreign };
    await assert.rejects(toolkit.restoreBundle({
      client: new FakeClient(), db, bundle: toolkit.loadBundle(bundleDir, EJSON), ObjectId: FakeObjectId, EJSON,
      confirmation: toolkit.confirmationForRestore(manifest, record.postStateSha256), bundleDir,
      currentCodeSha: manifest.codeSha,
    }), /contextos de otros lotes/);
    assert.equal(db.data.alertas[0].activa, false, 'restore no debe empezar a mutar antes de revalidar el scope');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CAS sellado detecta re-key de un documento creado durante el piloto', async () => {
  const { scope, config } = scopeAndConfig();
  const db = new FakeDb(baselineData(scope));
  const queries = toolkit.collectionQueries(scope, config);
  const pre = await toolkit.readState(db, queries, EJSON);
  const plan = buildPlan(config, scope, pre, 'e'.repeat(40));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-era5-rekey-'));
  const bundleDir = path.join(root, 'bundle');
  try {
    const manifest = toolkit.writeBundle(bundleDir, plan, pre, EJSON);
    const created = { _id: id('90'), idSiembra: scope.sowingObjectId, fecha: '2026-05-02' };
    db.data.indicadores_agrometeorologicos.push(created);
    const post = await readRevalidatedPostState(db, manifest);
    const record = toolkit.recordPostState(bundleDir, manifest, toolkit.stateSummary(post.state), EJSON, post.revalidationProof);
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
  const plan = buildPlan(config, scope, pre, 'd'.repeat(40));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-era5-rollback-'));
  const bundleDir = path.join(root, 'bundle');
  try {
    const manifest = toolkit.writeBundle(bundleDir, plan, pre, EJSON);
    db.data.siembras[0].ultimaPrediccion = { riesgo: 50 };
    db.data.alertas[0].activa = false;
    const post = await readRevalidatedPostState(db, manifest);
    const record = toolkit.recordPostState(bundleDir, manifest, toolkit.stateSummary(post.state), EJSON, post.revalidationProof);
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
  const plan = buildPlan(config, scope, pre, '9'.repeat(40));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-era5-transaction-verify-'));
  const bundleDir = path.join(root, 'bundle');
  try {
    const manifest = toolkit.writeBundle(bundleDir, plan, pre, EJSON);
    db.data.siembras[0].ultimaPrediccion = { riesgo: 77 };
    const post = await readRevalidatedPostState(db, manifest);
    const record = toolkit.recordPostState(bundleDir, manifest, toolkit.stateSummary(post.state), EJSON, post.revalidationProof);
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
