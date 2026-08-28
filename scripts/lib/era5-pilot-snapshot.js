const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DB_NAME = 'chaman_testing';
const SCHEMA_VERSION = 2;
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ERA5_CALCULATION_VERSION = 'chaman-meteo-agro-v2';
const SAFETY_ATTESTATION = 'AGROMET_ONLY:CRONS_FROZEN:NOTIFICATIONS_DISABLED:OUTBOX_DISABLED:PUSH_DISABLED';

const MUTABLE_COLLECTIONS = [
  'siembras',
  'lotes',
  'observaciones_meteorologicas',
  'indicadores_agrometeorologicos',
  'indicadores_agrometeorologicos_generados',
  'indicadores_agrometeorologicos_generaciones',
  'prediccions',
  'prediccionriegos',
  'alertas',
];

const REFERENCE_COLLECTIONS = [
  'establecimientos',
  'semillas',
  'cronos',
  'weather_location_bindings',
  'weather_grid_points',
  'weather_daily',
];

const ALL_COLLECTIONS = [...MUTABLE_COLLECTIONS, ...REFERENCE_COLLECTIONS];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateIdentifier(value, label) {
  assert(OBJECT_ID_PATTERN.test(String(value || '')), `${label} debe ser un ObjectId canonico de 24 caracteres.`);
  return String(value).toLowerCase();
}

function validateDate(value, label) {
  assert(ISO_DATE_PATTERN.test(String(value || '')), `${label} debe usar YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  assert(!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value, `${label} no es una fecha valida.`);
  return value;
}

function mongoEndpoint(uri) {
  const match = String(uri || '').match(/^(mongodb(?:\+srv)?):\/\/([^/?#]+)\//i);
  assert(match, 'La URI Mongo no contiene un endpoint valido.');
  const authority = match[2].slice(match[2].lastIndexOf('@') + 1);
  const seeds = authority.split(',').map((seed) => seed.trim().toLowerCase()).filter(Boolean).sort();
  assert(seeds.length > 0, 'La URI Mongo no contiene hosts.');
  return `${match[1].toLowerCase()}://${seeds.join(',')}`;
}

function testingClusterFingerprint(uri) {
  return sha256(mongoEndpoint(uri));
}

function loadAttestationFile(filePath, label) {
  assert(typeof filePath === 'string' && filePath.trim(), `${label} requiere una ruta de archivo.`);
  const resolved = path.resolve(filePath);
  assert(fs.existsSync(resolved), `No existe la attestation ${label}.`);
  const stats = fs.statSync(resolved);
  assert(stats.isFile() && stats.size > 0 && stats.size <= 65536, `Archivo de attestation ${label} invalido.`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function assertTestingOnly({ uri, attestation, env = process.env }) {
  const productionFlags = [
    'NODE_ENV',
    'RAILWAY_ENVIRONMENT_NAME',
    'RAILWAY_ENVIRONMENT',
    'CHAMAN_ENV',
    'APP_ENV',
    'ENVIRONMENT',
  ].filter((name) => /prod(?:uction)?/i.test(String(env[name] || '').trim()));
  assert(productionFlags.length === 0, `Abortado: flags productivos detectados (${productionFlags.join(', ')}).`);
  assert(typeof uri === 'string' && /^mongodb(?:\+srv)?:\/\//i.test(uri), 'La URI Mongo de Testing es obligatoria.');
  const withoutQuery = uri.split('?')[0];
  const slash = withoutQuery.lastIndexOf('/');
  assert(slash > withoutQuery.indexOf('://') + 2, 'La URI debe declarar explicitamente la base chaman_testing.');
  const database = decodeURIComponent(withoutQuery.slice(slash + 1));
  assert(database === DB_NAME, `Abortado: la base debe ser exactamente ${DB_NAME}.`);
  assert(attestation?.schemaVersion === 1 && attestation.environment === 'testing' && attestation.database === DB_NAME,
    'Se requiere una attestation externa aprobada del cluster Testing.');
  assert(typeof attestation.approvedBy === 'string' && attestation.approvedBy.trim().length >= 3, 'La attestation del cluster no tiene aprobador.');
  assert(typeof attestation.evidence === 'string' && attestation.evidence.trim().length >= 8, 'La attestation del cluster no tiene evidencia.');
  assert(Number.isFinite(new Date(attestation.approvedAt).getTime()), 'La attestation del cluster no tiene fecha valida.');
  const expectedFingerprint = String(attestation.endpointFingerprint || '').trim().toLowerCase();
  assert(/^[a-f0-9]{64}$/.test(expectedFingerprint), 'La attestation no contiene un fingerprint SHA-256 valido.');
  assert(testingClusterFingerprint(uri) === expectedFingerprint, 'Abortado: el fingerprint del cluster no corresponde al Testing aprobado.');
  return database;
}

function assertSafetyAttestation(attestation) {
  assert(attestation?.statement === SAFETY_ATTESTATION,
    'Falta attestation: piloto agromet-only, crons congelados y notificaciones/outbox/push deshabilitados.');
  assert(typeof attestation.approvedBy === 'string' && attestation.approvedBy.trim().length >= 3, 'La attestation operativa no tiene aprobador.');
  assert(typeof attestation.evidence === 'string' && attestation.evidence.trim().length >= 8, 'La attestation operativa no tiene evidencia verificable.');
  assert(Number.isFinite(new Date(attestation.approvedAt).getTime()), 'La attestation operativa no tiene fecha valida.');
}

function sortForEjson(value) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date || Buffer.isBuffer(value) || value._bsontype || typeof value.toExtendedJSON === 'function') return value;
  if (Array.isArray(value)) return value.map(sortForEjson);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortForEjson(value[key])]));
}

function canonicalEjson(value, EJSON) {
  return EJSON.stringify(sortForEjson(value), { relaxed: false });
}

function documentId(document) {
  if (!document || document._id === undefined || document._id === null) return '';
  if (typeof document._id.toHexString === 'function') return document._id.toHexString();
  return String(document._id);
}

function idValue(value) {
  if (value && typeof value === 'object' && Object.hasOwn(value, '_id')) return documentId(value);
  if (value && typeof value.toHexString === 'function') return value.toHexString();
  return value === undefined || value === null ? '' : String(value);
}

function canonicalDocuments(documents, EJSON) {
  return [...documents]
    .sort((left, right) => documentId(left).localeCompare(documentId(right)))
    .map((document) => canonicalEjson(document, EJSON));
}

function summarizeDocuments(documents, EJSON) {
  const canonical = canonicalDocuments(documents, EJSON);
  return {
    count: documents.length,
    ids: [...documents].map(documentId).sort(),
    sha256: sha256(canonical.join('\n')),
  };
}

function scanSecrets(value, pathParts = [], findings = []) {
  if (value === null || value === undefined) return findings;
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSecrets(item, [...pathParts, String(index)], findings));
    return findings;
  }
  if (typeof value === 'object') {
    if (value instanceof Date || value._bsontype) return findings;
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      const sensitiveValue = child !== null && child !== undefined && !/^(|redacted|<redacted>|masked|none|null|n\/a)$/i.test(String(child).trim());
      if (sensitiveValue && /^(password|passwd|secret|clientsecret|apikey|accesstoken|refreshtoken|authtoken|token|authorization|bearer|privatekey|signingkey|smtp(?:uri|url|password|token)?|databaseuri|databaseurl|mongouri|cookie|credentials?|mqttpassword|cdskey|fieldclimatekey)$/.test(normalizedKey)) {
        findings.push([...pathParts, key].join('.'));
      }
      scanSecrets(child, [...pathParts, key], findings);
    }
    return findings;
  }
  if (typeof value === 'string') {
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value) || /mongodb(?:\+srv)?:\/\/[^\s/:]+:[^\s/@]+@/i.test(value) || /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/.test(value)) {
      findings.push(pathParts.join('.'));
    }
  }
  return findings;
}

function operationConfig(input) {
  const lotId = validateIdentifier(input.lotId, 'lot-id');
  const sowingId = validateIdentifier(input.sowingId, 'sowing-id');
  const from = validateDate(input.from, 'from');
  const to = validateDate(input.to, 'to');
  assert(from <= to, 'from no puede ser posterior a to.');
  assert(/^[a-z0-9][a-z0-9._-]{5,100}$/i.test(String(input.operationId || '')), 'operation-id es invalido.');
  return { operationId: input.operationId, lotId, sowingId, from, to };
}

async function resolveScope(db, config, ObjectId, options = {}) {
  const session = options.session;
  const sowingObjectId = new ObjectId(config.sowingId);
  const lotObjectId = new ObjectId(config.lotId);
  const rows = await db.collection('siembras').aggregate([
    { $match: { _id: sowingObjectId, idLote: lotObjectId } },
    { $lookup: { from: 'lotes', localField: 'idLote', foreignField: '_id', as: 'lote' } },
    { $unwind: '$lote' },
    {
      $lookup: {
        from: 'siembras',
        let: { loteId: '$idLote' },
        pipeline: [
          { $match: { $expr: { $eq: ['$idLote', '$$loteId'] } } },
          { $match: { activa: { $ne: false }, $or: [{ fechaCosecha: { $exists: false } }, { fechaCosecha: null }] } },
          { $project: { _id: 1 } },
        ],
        as: 'siembrasActivas',
      },
    },
    {
      $project: {
        _id: 1,
        idLote: 1,
        idEstablecimiento: 1,
        idSemilla: 1,
        idCrono: 1,
        fechaSiembra: 1,
        activa: 1,
        fechaCosecha: 1,
        lote: { _id: 1, idSiembra: 1, idEstablecimiento: 1 },
        siembrasActivas: 1,
      },
    },
  ], { session }).toArray();
  assert(rows.length === 1, 'La pareja lote/siembra exacta no existe o no se puede resolver de forma univoca.');
  const row = rows[0];
  assert(row.activa !== false && !row.fechaCosecha, 'La siembra solicitada no esta activa.');
  assert(row.siembrasActivas.length === 1 && documentId(row.siembrasActivas[0]) === config.sowingId, 'El lote debe tener exactamente una siembra activa y debe ser la solicitada.');
  assert(idValue(row.lote.idSiembra) === config.sowingId, 'lotes.idSiembra no apunta exactamente a la siembra solicitada.');
  const establishmentId = idValue(row.idEstablecimiento || row.lote.idEstablecimiento);
  assert(OBJECT_ID_PATTERN.test(establishmentId), 'No se pudo resolver idEstablecimiento de la siembra/lote.');
  if (row.idEstablecimiento && row.lote.idEstablecimiento) {
    assert(idValue(row.idEstablecimiento) === idValue(row.lote.idEstablecimiento), 'La siembra y el lote apuntan a establecimientos diferentes.');
  }
  const sowingDate = new Date(row.fechaSiembra).toISOString().slice(0, 10);
  assert(config.from === sowingDate, `from debe coincidir exactamente con fechaSiembra (${sowingDate}) para no dejar datos fuera del rollback.`);
  const binding = await db.collection('weather_location_bindings').findOne(
    { locationType: 'lote', locationId: lotObjectId, active: true },
    { session },
  );
  assert(binding && binding.gridPointKey, 'El lote piloto necesita un unico binding Chaman-Meteo activo.');
  const activeBindingCount = await db.collection('weather_location_bindings').countDocuments(
    { locationType: 'lote', locationId: lotObjectId, active: true },
    { session },
  );
  assert(activeBindingCount === 1, 'El lote piloto debe tener exactamente un binding Chaman-Meteo activo.');
  const gridPoint = await db.collection('weather_grid_points').findOne(
    { key: binding.gridPointKey, enabled: true },
    { session },
  );
  assert(gridPoint, 'El punto de grilla del binding no existe o no esta habilitado.');
  const otherLots = await db.collection('lotes').countDocuments({
    _id: { $ne: lotObjectId },
    idEstablecimiento: new ObjectId(establishmentId),
  }, { session });
  assert(otherLots === 0, 'Piloto abortado: el establecimiento contiene otros lotes; las observaciones son compartidas y no pueden restaurarse aisladamente.');
  const observations = await db.collection('observaciones_meteorologicas').find({
    idEstablecimiento: new ObjectId(establishmentId),
    fechaLocal: { $gte: config.from, $lte: config.to },
  }, { session }).toArray();
  for (const observation of observations) {
    const contextKeys = observation.contextosLote && typeof observation.contextosLote === 'object' && !Array.isArray(observation.contextosLote)
      ? Object.keys(observation.contextosLote) : [];
    assert(contextKeys.every((value) => OBJECT_ID_PATTERN.test(value)), 'Piloto abortado: una observacion contiene claves de contexto no canonicas.');
    const foreignIds = contextLotIds(observation.contextosLote).filter((value) => value !== config.lotId);
    assert(foreignIds.length === 0, `Piloto abortado: una observacion contiene contextos de otros lotes (${foreignIds.join(', ')}).`);
    if (observation.idLote) assert(idValue(observation.idLote) === config.lotId, 'Piloto abortado: una observacion compartida pertenece a otro lote.');
  }
  return {
    lotObjectId,
    sowingObjectId,
    establishmentObjectId: new ObjectId(establishmentId),
    seedObjectId: row.idSemilla,
    cronoObjectId: row.idCrono,
    gridPointKey: String(binding.gridPointKey),
    gridTimezone: String(gridPoint.timezone || ''),
    sowingDate,
  };
}

function contextLotIds(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value).filter((key) => OBJECT_ID_PATTERN.test(key)).map((key) => key.toLowerCase());
}

function dateRange(from, to) {
  const dates = [];
  for (let cursor = new Date(`${from}T00:00:00.000Z`), end = new Date(`${to}T00:00:00.000Z`); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

async function assertRequiredIndexes(db) {
  const requirements = {
    weather_grid_points: [{ name: 'uniq_weather_grid_point_key', key: { key: 1 }, unique: true }],
    weather_location_bindings: [{ name: 'uniq_weather_location_binding', key: { locationType: 1, locationId: 1 }, unique: true }],
    weather_daily: [{ name: 'uniq_weather_daily_grid_date_version', key: { gridPointKey: 1, date: 1, calculationVersion: 1 }, unique: true }],
    observaciones_meteorologicas: [{ name: 'uniq_establishment_time_granularity', key: { idEstablecimiento: 1, timestamp: 1, granularidad: 1 }, unique: true }],
    indicadores_agrometeorologicos: [{ name: 'uniq_sowing_date_engine_version', key: { idSiembra: 1, fecha: 1, versionCalculo: 1 }, unique: true }],
  };
  for (const [collectionName, expected] of Object.entries(requirements)) {
    const indexes = await db.collection(collectionName).listIndexes().toArray();
    for (const requirement of expected) {
      const actual = indexes.find((index) => index.name === requirement.name);
      assert(actual && Boolean(actual.unique) === requirement.unique && JSON.stringify(actual.key) === JSON.stringify(requirement.key),
        `Falta indice exacto requerido ${collectionName}.${requirement.name}.`);
      assert(!actual.partialFilterExpression, `${collectionName}.${requirement.name} no puede ser parcial.`);
      assert(!actual.collation || actual.collation.locale === 'simple', `${collectionName}.${requirement.name} requiere collation simple/binaria.`);
      assert(!actual.sparse && !actual.hidden, `${collectionName}.${requirement.name} no puede ser sparse ni hidden.`);
    }
  }
}

async function assertEra5Coverage(db, scope, config, options = {}) {
  const session = options.session;
  const daily = await db.collection('weather_daily').find({
    gridPointKey: scope.gridPointKey,
    calculationVersion: ERA5_CALCULATION_VERSION,
    date: { $gte: config.from, $lte: config.to },
  }, { session }).toArray();
  const expectedDates = dateRange(config.from, config.to);
  const actualDates = daily.map((item) => item.date).sort();
  assert(daily.length === expectedDates.length && JSON.stringify(actualDates) === JSON.stringify(expectedDates),
    `Cobertura ERA5 v2 incompleta: se requieren ${expectedDates.length} dias continuos y hay ${daily.length}.`);
  for (const item of daily) {
    const expected = Number(item.hoursExpected);
    const available = Number(item.hoursAvailable);
    assert([23, 24, 25].includes(expected) && available === expected && Number(item.availableHoursByMetric?.temperature) === expected &&
      item.gridPointKey === scope.gridPointKey && item.calculationVersion === ERA5_CALCULATION_VERSION &&
      item.timezone === scope.gridTimezone && item.date >= config.from && item.date <= config.to &&
      Number.isFinite(new Date(item.calculatedAt).getTime()) &&
      ['temperatureMinC', 'temperatureMeanC', 'temperatureMaxC'].every((key) => Number.isFinite(Number(item.values?.[key]))),
      `Dia ERA5 v2 incompleto o invalido: ${item.date}.`);
  }
}

function collectionQueries(scope, config) {
  return {
    siembras: { _id: scope.sowingObjectId },
    lotes: { _id: scope.lotObjectId },
    observaciones_meteorologicas: {
      idEstablecimiento: scope.establishmentObjectId,
      fechaLocal: { $gte: config.from, $lte: config.to },
    },
    indicadores_agrometeorologicos: { idSiembra: scope.sowingObjectId },
    indicadores_agrometeorologicos_generados: { idSiembra: scope.sowingObjectId },
    indicadores_agrometeorologicos_generaciones: { idSiembra: scope.sowingObjectId },
    prediccions: { idSiembra: scope.sowingObjectId },
    prediccionriegos: { $or: [{ idSiembra: scope.sowingObjectId }, { idLote: scope.lotObjectId }] },
    alertas: { $or: [{ idSiembra: scope.sowingObjectId }, { idLote: scope.lotObjectId }] },
    establecimientos: { _id: scope.establishmentObjectId },
    semillas: { _id: scope.seedObjectId },
    cronos: { _id: scope.cronoObjectId },
    weather_location_bindings: { locationType: 'lote', locationId: scope.lotObjectId },
    weather_grid_points: { key: scope.gridPointKey },
    weather_daily: { gridPointKey: scope.gridPointKey, calculationVersion: ERA5_CALCULATION_VERSION, date: { $gte: config.from, $lte: config.to } },
  };
}

function sealedQueries(manifest, ObjectId, postState) {
  const oid = (value) => new ObjectId(validateIdentifier(value, 'id sellado'));
  const idsFor = (name) => [...new Set([
    ...(manifest.collections[name]?.ids || []),
    ...(postState?.collections?.[name]?.ids || []),
  ])].filter(Boolean).map(oid);
  const scoped = {
    siembras: { _id: oid(manifest.sowingId) },
    lotes: { _id: oid(manifest.lotId) },
    observaciones_meteorologicas: { idEstablecimiento: oid(manifest.establishmentId), fechaLocal: { $gte: manifest.weatherWindow.from, $lte: manifest.weatherWindow.to } },
    indicadores_agrometeorologicos: { idSiembra: oid(manifest.sowingId) },
    indicadores_agrometeorologicos_generados: { idSiembra: oid(manifest.sowingId) },
    indicadores_agrometeorologicos_generaciones: { idSiembra: oid(manifest.sowingId) },
    prediccions: { idSiembra: oid(manifest.sowingId) },
    prediccionriegos: { $or: [{ idSiembra: oid(manifest.sowingId) }, { idLote: oid(manifest.lotId) }] },
    alertas: { $or: [{ idSiembra: oid(manifest.sowingId) }, { idLote: oid(manifest.lotId) }] },
  };
  const result = {};
  for (const name of MUTABLE_COLLECTIONS) {
    const sealedIds = idsFor(name);
    result[name] = sealedIds.length ? { $or: [scoped[name], { _id: { $in: sealedIds } }] } : scoped[name];
  }
  for (const name of REFERENCE_COLLECTIONS) result[name] = { _id: { $in: idsFor(name) } };
  return result;
}

async function readState(db, queries, EJSON, options = {}) {
  const result = {};
  for (const name of ALL_COLLECTIONS) {
    const documents = await db.collection(name).find(queries[name], { session: options.session }).sort({ _id: 1 }).toArray();
    result[name] = { documents, ...summarizeDocuments(documents, EJSON) };
  }
  return result;
}

async function readConsistentScope({ client, db, config, ObjectId, EJSON }) {
  await assertRequiredIndexes(db);
  const session = client.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const scope = await resolveScope(db, config, ObjectId, { session });
      await assertEra5Coverage(db, scope, config, { session });
      const queries = collectionQueries(scope, config);
      const state = await readState(db, queries, EJSON, { session });
      result = { scope, queries, state };
    }, {
      readConcern: { level: 'snapshot' },
      readPreference: 'primary',
    });
  } finally {
    await session.endSession();
  }
  assert(result, 'No se pudo obtener un snapshot transaccional consistente.');
  return result;
}

async function readConsistentState({ client, db, queries, EJSON, coverage }) {
  await assertRequiredIndexes(db);
  const session = client.startSession();
  let state;
  try {
    await session.withTransaction(async () => {
      if (coverage) await assertEra5Coverage(db, coverage.scope, coverage.config, { session });
      state = await readState(db, queries, EJSON, { session });
    }, {
      readConcern: { level: 'snapshot' }, readPreference: 'primary',
    });
  } finally { await session.endSession(); }
  assert(state, 'No se pudo leer el estado sellado consistentemente.');
  return state;
}

function stateSummary(state) {
  return Object.fromEntries(ALL_COLLECTIONS.map((name) => [name, {
    role: MUTABLE_COLLECTIONS.includes(name) ? 'mutable' : 'reference',
    count: state[name].count,
    ids: state[name].ids,
    sha256: state[name].sha256,
  }]));
}

function hashStateSummary(summary, EJSON) {
  return sha256(canonicalEjson(summary, EJSON));
}

function assertNoSecrets(state) {
  const findings = [];
  for (const name of ALL_COLLECTIONS) {
    for (const document of state[name].documents) {
      scanSecrets(document, [name, documentId(document) || '<sin-id>'], findings);
    }
  }
  assert(findings.length === 0, `El escaner de secretos bloqueo el snapshot en: ${findings.slice(0, 10).join(', ')}`);
}

function buildPlan(config, scope, state, codeSha, EJSON) {
  for (const name of ['siembras', 'lotes', 'establecimientos', 'semillas', 'cronos', 'weather_location_bindings', 'weather_grid_points']) {
    assert(state[name].count === 1, `El cierre exige exactamente un documento en ${name}; se encontraron ${state[name].count}.`);
  }
  const collections = stateSummary(state);
  const core = {
    schemaVersion: SCHEMA_VERSION,
    operationId: config.operationId,
    codeSha,
    database: DB_NAME,
    lotId: config.lotId,
    sowingId: config.sowingId,
    establishmentId: idValue(scope.establishmentObjectId),
    sowingDate: scope.sowingDate,
    weatherWindow: { from: config.from, to: config.to },
    gridPointKey: scope.gridPointKey,
    gridTimezone: scope.gridTimezone,
    policy: { oneLot: true, exclusiveEstablishment: true, agrometOnly: true, sideEffectsFrozen: true, exactlyOneActiveSowing: true, onConflict: 'abort', restore: 'transactional-compare-and-swap' },
    collections,
  };
  return { ...core, planSha256: sha256(canonicalEjson(core, EJSON)) };
}

function writeJsonExclusive(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', encoding: 'utf8' });
}

function writeBundle(bundleDir, plan, state, EJSON, now = new Date()) {
  assertNoSecrets(state);
  assert(!fs.existsSync(bundleDir), `El directorio de bundle ya existe: ${bundleDir}`);
  fs.mkdirSync(bundleDir, { recursive: false });
  const files = {};
  try {
    for (const name of ALL_COLLECTIONS) {
      const fileName = `${name}.ndjson`;
      const contents = canonicalDocuments(state[name].documents, EJSON).join('\n') + (state[name].count ? '\n' : '');
      fs.writeFileSync(path.join(bundleDir, fileName), contents, { flag: 'wx', encoding: 'utf8' });
      files[fileName] = { sha256: sha256(contents), bytes: Buffer.byteLength(contents), count: state[name].count };
    }
    const manifestCore = {
      ...plan,
      createdAt: now.toISOString(),
      files,
      secretScan: { status: 'passed', findings: 0 },
    };
    delete manifestCore.planSha256;
    const manifest = { ...manifestCore, manifestSha256: sha256(canonicalEjson(manifestCore, EJSON)) };
    writeJsonExclusive(path.join(bundleDir, 'manifest.json'), manifest);
    return manifest;
  } catch (error) {
    fs.rmSync(bundleDir, { recursive: true, force: true });
    throw error;
  }
}

function loadBundle(bundleDir, EJSON) {
  const manifestPath = path.join(bundleDir, 'manifest.json');
  assert(fs.existsSync(manifestPath), 'El bundle no contiene manifest.json.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(manifest.schemaVersion === SCHEMA_VERSION, 'Version de manifiesto no soportada.');
  assert(manifest.database === DB_NAME, 'El manifiesto no pertenece a chaman_testing.');
  const expectedManifestHash = manifest.manifestSha256;
  const manifestCore = { ...manifest };
  delete manifestCore.manifestSha256;
  assert(sha256(canonicalEjson(manifestCore, EJSON)) === expectedManifestHash, 'El hash del manifiesto no coincide.');
  const documents = {};
  for (const name of ALL_COLLECTIONS) {
    const fileName = `${name}.ndjson`;
    const filePath = path.join(bundleDir, fileName);
    assert(fs.existsSync(filePath), `Falta ${fileName}.`);
    const contents = fs.readFileSync(filePath, 'utf8');
    assert(sha256(contents) === manifest.files[fileName].sha256, `Hash invalido para ${fileName}.`);
    documents[name] = contents.trim() ? contents.trimEnd().split('\n').map((line) => EJSON.parse(line, { relaxed: false })) : [];
    const summary = summarizeDocuments(documents[name], EJSON);
    assert(summary.count === manifest.collections[name].count && summary.sha256 === manifest.collections[name].sha256, `Contenido inconsistente en ${name}.`);
  }
  return { manifest, documents };
}

function confirmationForSnapshot(plan) {
  return `SNAPSHOT:${DB_NAME}:${plan.operationId}:${plan.planSha256}`;
}

function confirmationForRestore(manifest, postStateSha256) {
  return `RESTORE:${DB_NAME}:${manifest.operationId}:${manifest.manifestSha256}:${postStateSha256}`;
}

function assertSummaryEqual(actual, expected, label) {
  for (const name of ALL_COLLECTIONS) {
    const left = actual[name];
    const right = expected[name];
    assert(left && right && left.count === right.count && left.sha256 === right.sha256 && JSON.stringify(left.ids) === JSON.stringify(right.ids), `${label}: drift detectado en ${name}.`);
  }
}

function recordPostState(bundleDir, manifest, summary, EJSON, now = new Date()) {
  const core = {
    schemaVersion: SCHEMA_VERSION,
    operationId: manifest.operationId,
    manifestSha256: manifest.manifestSha256,
    recordedAt: now.toISOString(),
    database: DB_NAME,
    collections: summary,
  };
  const record = { ...core, postStateSha256: sha256(canonicalEjson(core, EJSON)) };
  writeJsonExclusive(path.join(bundleDir, 'post-state.json'), record);
  return record;
}

function loadPostState(bundleDir, manifest, EJSON) {
  const filePath = path.join(bundleDir, 'post-state.json');
  assert(fs.existsSync(filePath), 'Falta post-state.json; ejecute verify --record-post-state inmediatamente despues del piloto.');
  const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert(record.operationId === manifest.operationId && record.manifestSha256 === manifest.manifestSha256 && record.database === DB_NAME, 'post-state.json no corresponde al bundle.');
  const core = { ...record };
  delete core.postStateSha256;
  assert(sha256(canonicalEjson(core, EJSON)) === record.postStateSha256, 'Hash invalido en post-state.json.');
  return record;
}

async function restoreBundle({ client, db, bundle, ObjectId, EJSON, confirmation, bundleDir }) {
  const postState = loadPostState(bundleDir, bundle.manifest, EJSON);
  const queries = sealedQueries(bundle.manifest, ObjectId, postState);
  await assertRequiredIndexes(db);
  assert(confirmation === confirmationForRestore(bundle.manifest, postState.postStateSha256), 'Confirmacion de restore ausente o incorrecta.');
  const session = client.startSession();
  let outcome = 'restored';
  try {
    await session.withTransaction(async () => {
      await assertEra5Coverage(db, {
        gridPointKey: bundle.manifest.gridPointKey,
        gridTimezone: bundle.manifest.gridTimezone,
      }, {
        from: bundle.manifest.weatherWindow.from,
        to: bundle.manifest.weatherWindow.to,
      }, { session });
      const current = await readState(db, queries, EJSON, { session });
      const currentSummary = stateSummary(current);
      try {
        assertSummaryEqual(currentSummary, bundle.manifest.collections, 'estado actual');
        outcome = 'already_restored';
        return;
      } catch {
        assertSummaryEqual(currentSummary, postState.collections, 'estado post-piloto');
      }
      for (const name of REFERENCE_COLLECTIONS) {
        const actual = currentSummary[name];
        const expected = bundle.manifest.collections[name];
        assert(actual.count === expected.count && actual.sha256 === expected.sha256, `Referencia ${name} cambio; restore abortado.`);
      }
      for (const name of MUTABLE_COLLECTIONS) {
        await db.collection(name).deleteMany(queries[name], { session });
        if (bundle.documents[name].length) {
          await db.collection(name).insertMany(bundle.documents[name], { ordered: true, session });
        }
      }
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
    });
  } finally {
    await session.endSession();
  }
  const finalState = await readState(db, queries, EJSON);
  assertSummaryEqual(stateSummary(finalState), bundle.manifest.collections, 'verificacion posterior al restore');
  return outcome;
}

module.exports = {
  ALL_COLLECTIONS,
  DB_NAME,
  ERA5_CALCULATION_VERSION,
  MUTABLE_COLLECTIONS,
  REFERENCE_COLLECTIONS,
  assertNoSecrets,
  assertEra5Coverage,
  assertRequiredIndexes,
  assertSafetyAttestation,
  assertSummaryEqual,
  assertTestingOnly,
  buildPlan,
  canonicalEjson,
  collectionQueries,
  confirmationForRestore,
  confirmationForSnapshot,
  contextLotIds,
  hashStateSummary,
  loadBundle,
  loadAttestationFile,
  loadPostState,
  operationConfig,
  readConsistentScope,
  readConsistentState,
  readState,
  recordPostState,
  resolveScope,
  restoreBundle,
  scanSecrets,
  sealedQueries,
  sha256,
  stateSummary,
  summarizeDocuments,
  testingClusterFingerprint,
  writeBundle,
};
