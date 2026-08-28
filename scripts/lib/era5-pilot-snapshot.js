const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DB_NAME = 'chaman_testing';
const SCHEMA_VERSION = 1;
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

function assertTestingOnly({ uri, env = process.env }) {
  const productionFlags = [
    'NODE_ENV',
    'RAILWAY_ENVIRONMENT_NAME',
    'RAILWAY_ENVIRONMENT',
    'CHAMAN_ENV',
    'APP_ENV',
    'ENVIRONMENT',
  ].filter((name) => /^(production|prod)$/i.test(String(env[name] || '').trim()));
  assert(productionFlags.length === 0, `Abortado: flags productivos detectados (${productionFlags.join(', ')}).`);
  assert(typeof uri === 'string' && /^mongodb(?:\+srv)?:\/\//i.test(uri), 'La URI Mongo de Testing es obligatoria.');
  const withoutQuery = uri.split('?')[0];
  const slash = withoutQuery.lastIndexOf('/');
  assert(slash > withoutQuery.indexOf('://') + 2, 'La URI debe declarar explicitamente la base chaman_testing.');
  const database = decodeURIComponent(withoutQuery.slice(slash + 1));
  assert(database === DB_NAME, `Abortado: la base debe ser exactamente ${DB_NAME}.`);
  return database;
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
      if (/^(password|passwd|secret|clientsecret|apikey|api_key|access_token|refresh_token|cookie|credentials?|mqtt_password|cds_key|fieldclimate_key)$/i.test(key)) {
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
  return {
    lotObjectId,
    sowingObjectId,
    establishmentObjectId: new ObjectId(establishmentId),
    seedObjectId: row.idSemilla,
    cronoObjectId: row.idCrono,
    gridPointKey: String(binding.gridPointKey),
    sowingDate,
  };
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
    weather_daily: { gridPointKey: scope.gridPointKey, date: { $gte: config.from, $lte: config.to } },
  };
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
  const session = client.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const scope = await resolveScope(db, config, ObjectId, { session });
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
    sowingDate: scope.sowingDate,
    weatherWindow: { from: config.from, to: config.to },
    gridPointKey: scope.gridPointKey,
    policy: { oneLot: true, exactlyOneActiveSowing: true, onConflict: 'abort', restore: 'transactional-compare-and-swap' },
    collections,
  };
  return { ...core, planSha256: sha256(canonicalEjson(core, EJSON)) };
}

function writeJsonExclusive(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', encoding: 'utf8' });
}

function writeBundle(bundleDir, plan, state, EJSON, now = new Date()) {
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

async function restoreBundle({ client, db, bundle, queries, EJSON, confirmation, bundleDir }) {
  const postState = loadPostState(bundleDir, bundle.manifest, EJSON);
  assert(confirmation === confirmationForRestore(bundle.manifest, postState.postStateSha256), 'Confirmacion de restore ausente o incorrecta.');
  const session = client.startSession();
  let outcome = 'restored';
  try {
    await session.withTransaction(async () => {
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
  MUTABLE_COLLECTIONS,
  REFERENCE_COLLECTIONS,
  assertNoSecrets,
  assertSummaryEqual,
  assertTestingOnly,
  buildPlan,
  canonicalEjson,
  collectionQueries,
  confirmationForRestore,
  confirmationForSnapshot,
  hashStateSummary,
  loadBundle,
  loadPostState,
  operationConfig,
  readConsistentScope,
  readState,
  recordPostState,
  resolveScope,
  restoreBundle,
  scanSecrets,
  sha256,
  stateSummary,
  summarizeDocuments,
  writeBundle,
};
