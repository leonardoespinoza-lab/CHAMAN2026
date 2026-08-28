const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BACKUP_KIND = 'chaman-mongo-logical-backup';
const SOURCE_ATTESTATION_KIND = 'chaman-mongo-write-freeze-attestation';
const TARGET_ATTESTATION_KIND = 'chaman-mongo-disposable-target-attestation';
const RESTORE_DB_PREFIX = 'chaman_restore_drill_';
const TESTING_LOCAL_MODE = 'testing-local-drill';
const PRODUCTION_MODE = 'production-disposable';
const SYSTEM_DATABASES = new Set(['admin', 'config', 'local']);
const INSTANCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{5,199}$/;

function fail(message) {
  throw new Error(message);
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function readJson(filePath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  } catch (error) {
    fail(`No se pudo leer JSON valido en ${path.basename(filePath)}: ${error.message}`);
  }
  return parsed;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} debe ser un objeto JSON.`);
  }
}

function assertExactKeys(value, allowed, label) {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) fail(`${label} contiene campos no permitidos: ${extras.join(', ')}.`);
}

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`Falta ${label}.`);
  return value.trim();
}

function validDate(value, label) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail(`${label} no es una fecha ISO valida.`);
  return date;
}

function validateDatabaseName(database, { restore = false } = {}) {
  const value = requiredText(database, 'database');
  if (!/^[A-Za-z0-9_-]{1,63}$/.test(value)) {
    fail('database contiene caracteres no admitidos o supera 63 caracteres.');
  }
  if (SYSTEM_DATABASES.has(value.toLowerCase())) fail(`La base ${value} es un destino del sistema.`);
  if (restore && !value.startsWith(RESTORE_DB_PREFIX)) {
    fail(`La base descartable debe comenzar con ${RESTORE_DB_PREFIX}.`);
  }
  return value;
}

function databaseFromMongoUri(uri) {
  const value = requiredText(uri, 'URI de MongoDB');
  if (!/^mongodb(?:\+srv)?:\/\//i.test(value)) fail('La URI no usa mongodb:// o mongodb+srv://.');
  const withoutQuery = value.split('?')[0];
  const slash = withoutQuery.lastIndexOf('/');
  if (slash < 'mongodb://x/'.length || slash === withoutQuery.length - 1) {
    fail('La URI debe fijar explicitamente una base de datos.');
  }
  let database;
  try {
    database = decodeURIComponent(withoutQuery.slice(slash + 1));
  } catch {
    fail('La base codificada en la URI no es valida.');
  }
  return validateDatabaseName(database);
}

function mongoEndpointFingerprint(uri) {
  const value = requiredText(uri, 'URI de MongoDB');
  const schemeMatch = value.match(/^(mongodb(?:\+srv)?):\/\//i);
  if (!schemeMatch) fail('La URI no usa mongodb:// o mongodb+srv://.');
  if (/[\r\n\0]/.test(value)) fail('La URI contiene caracteres de control.');
  const scheme = schemeMatch[1].toLowerCase();
  const remainder = value.slice(schemeMatch[0].length);
  const authority = remainder.split('/')[0];
  const hostsPart = authority.slice(authority.lastIndexOf('@') + 1);
  if (!hostsPart) fail('La URI no contiene endpoints MongoDB.');
  const endpoints = hostsPart
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .map((entry) => {
      if (!entry) fail('La URI contiene un endpoint vacio.');
      if (entry.startsWith('[')) {
        const closing = entry.indexOf(']');
        if (closing < 0) fail('Endpoint IPv6 invalido.');
        const host = entry.slice(1, closing).replace(/\.$/, '');
        const suffix = entry.slice(closing + 1);
        const port = suffix ? Number(suffix.replace(/^:/, '')) : 27017;
        if (!host || !Number.isInteger(port) || port < 1 || port > 65535) fail('Endpoint IPv6 invalido.');
        return `[${host}]:${port}`;
      }
      const separator = entry.lastIndexOf(':');
      const hasPort = separator > -1 && entry.indexOf(':') === separator;
      const host = (hasPort ? entry.slice(0, separator) : entry).replace(/\.$/, '');
      const port = hasPort ? Number(entry.slice(separator + 1)) : 27017;
      if (!host || !Number.isInteger(port) || port < 1 || port > 65535) fail('Endpoint MongoDB invalido.');
      return `${host}:${port}`;
    })
    .sort();
  const canonical = `${scheme}|${endpoints.join(',')}`;
  return {
    scheme,
    endpointCount: endpoints.length,
    endpointFingerprintSha256: crypto.createHash('sha256').update(canonical).digest('hex'),
  };
}

function validateInstanceIdentity(identity, label) {
  assertPlainObject(identity, label);
  assertExactKeys(identity, ['provider', 'instanceId', 'endpointFingerprintSha256'], label);
  const provider = requiredText(identity.provider, `${label}.provider`).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,31}$/.test(provider)) fail(`${label}.provider invalido.`);
  const instanceId = requiredText(identity.instanceId, `${label}.instanceId`);
  if (!INSTANCE_ID_PATTERN.test(instanceId)) fail(`${label}.instanceId invalido.`);
  const endpointFingerprintSha256 = requiredText(
    identity.endpointFingerprintSha256,
    `${label}.endpointFingerprintSha256`,
  ).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(endpointFingerprintSha256)) {
    fail(`${label}.endpointFingerprintSha256 invalido.`);
  }
  return { provider, instanceId, endpointFingerprintSha256 };
}

function validateSourceAttestation(attestation, { now = new Date() } = {}) {
  assertPlainObject(attestation, 'La atestacion de congelamiento');
  assertExactKeys(
    attestation,
    [
      'schemaVersion',
      'kind',
      'attestationId',
      'drillMode',
      'sourceEnvironment',
      'database',
      'writesFrozen',
      'freezeControls',
      'frozenAt',
      'verifiedAt',
      'expiresAt',
      'operator',
      'approvedBy',
      'changeTicket',
      'instanceIdentity',
      'infrastructureEvidenceSha256',
    ],
    'La atestacion de congelamiento',
  );
  if (attestation.schemaVersion !== 1 || attestation.kind !== SOURCE_ATTESTATION_KIND) {
    fail('Formato de atestacion de congelamiento no soportado.');
  }
  const id = requiredText(attestation.attestationId, 'attestationId');
  if (!/^[a-z0-9][a-z0-9_-]{7,79}$/i.test(id)) fail('attestationId invalido.');
  const drillMode = requiredText(attestation.drillMode, 'drillMode');
  if (![TESTING_LOCAL_MODE, PRODUCTION_MODE].includes(drillMode)) fail('drillMode invalido.');
  const expectedEnvironment = drillMode === TESTING_LOCAL_MODE ? 'testing' : 'production';
  if (attestation.sourceEnvironment !== expectedEnvironment) {
    fail(`El modo ${drillMode} exige sourceEnvironment=${expectedEnvironment}.`);
  }
  const database = validateDatabaseName(attestation.database);
  const expectedDatabase = drillMode === TESTING_LOCAL_MODE ? 'chaman_testing' : 'chaman';
  if (database !== expectedDatabase) fail(`El modo ${drillMode} exige database=${expectedDatabase}.`);
  if (attestation.writesFrozen !== true) fail('writesFrozen debe ser true.');
  assertPlainObject(attestation.freezeControls, 'freezeControls');
  assertExactKeys(
    attestation.freezeControls,
    [
      'apiWritesDisabled',
      'backgroundWorkersStopped',
      'scheduledJobsDisabled',
      'operatorWritesBlocked',
      'activeWritersVerifiedZero',
    ],
    'freezeControls',
  );
  for (const [key, enabled] of Object.entries(attestation.freezeControls)) {
    if (enabled !== true) fail(`freezeControls.${key} debe ser true.`);
  }
  requiredText(attestation.operator, 'operator');
  requiredText(attestation.approvedBy, 'approvedBy');
  requiredText(attestation.changeTicket, 'changeTicket');
  const instanceIdentity = validateInstanceIdentity(attestation.instanceIdentity, 'instanceIdentity');
  const infrastructureEvidenceSha256 = requiredText(
    attestation.infrastructureEvidenceSha256,
    'infrastructureEvidenceSha256',
  ).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(infrastructureEvidenceSha256)) {
    fail('infrastructureEvidenceSha256 invalido.');
  }
  const frozenAt = validDate(attestation.frozenAt, 'frozenAt');
  const verifiedAt = validDate(attestation.verifiedAt, 'verifiedAt');
  const expiresAt = validDate(attestation.expiresAt, 'expiresAt');
  if (verifiedAt < frozenAt) fail('verifiedAt no puede preceder frozenAt.');
  if (expiresAt <= verifiedAt) fail('expiresAt debe ser posterior a verifiedAt.');
  if (expiresAt - frozenAt > 2 * 60 * 60 * 1000) {
    fail('La ventana de congelamiento no puede superar dos horas.');
  }
  if (now < verifiedAt || now >= expiresAt) fail('La atestacion no esta vigente.');
  return {
    id,
    drillMode,
    sourceEnvironment: expectedEnvironment,
    database,
    frozenAt,
    verifiedAt,
    expiresAt,
    instanceIdentity,
    infrastructureEvidenceSha256,
  };
}

function validateTargetAttestation(attestation, { now = new Date(), allowExpired = false } = {}) {
  assertPlainObject(attestation, 'La atestacion del destino');
  assertExactKeys(
    attestation,
    [
      'schemaVersion',
      'kind',
      'drillId',
      'drillMode',
      'environment',
      'database',
      'disposable',
      'dedicatedInstance',
      'initiallyEmptyExpected',
      'productionTrafficBlocked',
      'externalIntegrationsDisabled',
      'cleanupApproved',
      'expiresAt',
      'operator',
      'approvedBy',
      'changeTicket',
      'instanceIdentity',
      'infrastructureEvidenceSha256',
    ],
    'La atestacion del destino',
  );
  if (attestation.schemaVersion !== 1 || attestation.kind !== TARGET_ATTESTATION_KIND) {
    fail('Formato de atestacion del destino no soportado.');
  }
  const drillId = requiredText(attestation.drillId, 'drillId');
  if (!/^[a-z0-9][a-z0-9_-]{7,79}$/i.test(drillId)) fail('drillId invalido.');
  const drillMode = requiredText(attestation.drillMode, 'drillMode');
  if (![TESTING_LOCAL_MODE, PRODUCTION_MODE].includes(drillMode)) fail('drillMode invalido.');
  const expectedEnvironment = drillMode === TESTING_LOCAL_MODE ? 'local-recovery-drill' : 'recovery-drill';
  if (attestation.environment !== expectedEnvironment) fail(`El modo ${drillMode} exige environment=${expectedEnvironment}.`);
  const database = validateDatabaseName(attestation.database, { restore: true });
  for (const key of [
    'disposable',
    'dedicatedInstance',
    'initiallyEmptyExpected',
    'productionTrafficBlocked',
    'externalIntegrationsDisabled',
    'cleanupApproved',
  ]) {
    if (attestation[key] !== true) fail(`${key} debe ser true.`);
  }
  requiredText(attestation.operator, 'operator');
  requiredText(attestation.approvedBy, 'approvedBy');
  requiredText(attestation.changeTicket, 'changeTicket');
  const instanceIdentity = validateInstanceIdentity(attestation.instanceIdentity, 'instanceIdentity');
  const expectedProvider = drillMode === TESTING_LOCAL_MODE ? 'local-mongodb' : 'railway';
  if (instanceIdentity.provider !== expectedProvider) fail(`El modo ${drillMode} exige provider=${expectedProvider}.`);
  const infrastructureEvidenceSha256 = requiredText(
    attestation.infrastructureEvidenceSha256,
    'infrastructureEvidenceSha256',
  ).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(infrastructureEvidenceSha256)) {
    fail('infrastructureEvidenceSha256 invalido.');
  }
  const expiresAt = validDate(attestation.expiresAt, 'expiresAt');
  if (!allowExpired && now >= expiresAt) fail('La atestacion del destino esta vencida.');
  if (!allowExpired && expiresAt - now > 48 * 60 * 60 * 1000) {
    fail('La atestacion del destino no puede tener mas de 48 horas de vigencia restante.');
  }
  return { drillId, drillMode, database, expiresAt, instanceIdentity, infrastructureEvidenceSha256 };
}

function assertRuntimeIdentity(uri, attestedIdentity, label) {
  const runtime = mongoEndpointFingerprint(uri);
  if (runtime.endpointFingerprintSha256 !== attestedIdentity.endpointFingerprintSha256) {
    fail(`El endpoint runtime no coincide con la identidad atestada de ${label}.`);
  }
  return runtime;
}

function assertDestinationIsolated(sourceIdentity, targetIdentity) {
  const source = validateInstanceIdentity(sourceIdentity, 'sourceInstance');
  const target = validateInstanceIdentity(targetIdentity, 'targetInstance');
  if (source.endpointFingerprintSha256 === target.endpointFingerprintSha256) {
    fail('Destino rechazado: comparte host/puerto normalizado con Produccion.');
  }
  if (source.provider === target.provider && source.instanceId === target.instanceId) {
    fail('Destino rechazado: comparte identidad de instancia con Produccion.');
  }
  return true;
}

function expectedConfirmation(action, id, database) {
  if (action === 'dump') return `dump:${id}:${database}`;
  if (action === 'restore') return `restore:${id}:${database}`;
  if (action === 'cleanup') return `cleanup:${id}:${database}`;
  fail(`Accion de confirmacion desconocida: ${action}.`);
}

function requireConfirmation(actual, expected, variableName) {
  if (actual !== expected) {
    fail(`${variableName} no coincide. Valor esperado: ${expected}`);
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const input = fs.readFileSync(filePath);
  hash.update(input);
  return hash.digest('hex');
}

function sha256Json(value) {
  return crypto.createHash('sha256').update(`${JSON.stringify(value, null, 2)}\n`).digest('hex');
}

function safeArtifactDirectory(outputDir, repositoryRoot, { mustNotExist = false } = {}) {
  const resolved = path.resolve(requiredText(outputDir, 'output-dir'));
  const repo = path.resolve(repositoryRoot);
  const repoReal = fs.existsSync(repo) ? fs.realpathSync(repo) : repo;
  const parent = path.dirname(resolved);
  const resolvedReal = fs.existsSync(resolved)
    ? fs.realpathSync(resolved)
    : fs.existsSync(parent)
      ? path.join(fs.realpathSync(parent), path.basename(resolved))
      : resolved;
  const relative = path.relative(repoReal, resolvedReal);
  const outsideRepository = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  if (!outsideRepository) {
    fail('Los artefactos de backup deben guardarse fuera del repositorio.');
  }
  if (resolved === path.parse(resolved).root) fail('output-dir no puede ser la raiz del volumen.');
  if (mustNotExist && fs.existsSync(resolved)) fail('output-dir ya existe; no se sobreescribira.');
  if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) {
    fail('output-dir no puede ser un enlace simbolico.');
  }
  return resolved;
}

function normalizedIndex(index, position) {
  assertPlainObject(index, `El indice ${position}`);
  const label = `El indice ${position}`;
  const isAlreadyNormalized =
    Array.isArray(index.key) ||
    Object.hasOwn(index, 'options') ||
    Object.hasOwn(index, 'semanticSha256');

  if (isAlreadyNormalized) {
    assertExactKeys(index, ['name', 'key', 'options', 'semanticSha256'], label);
    const name = requiredText(index.name, `${label}.name`);
    if (!Array.isArray(index.key) || index.key.length === 0) {
      fail(`${label}.key normalizado debe ser una lista no vacia.`);
    }
    const seenFields = new Set();
    const key = index.key.map((entry, entryPosition) => {
      if (!Array.isArray(entry) || entry.length !== 2) {
        fail(`${label}.key[${entryPosition}] debe contener exactamente campo y direccion.`);
      }
      const field = requiredText(entry[0], `${label}.key[${entryPosition}].field`);
      if (seenFields.has(field)) fail(`${label}.key contiene el campo duplicado ${field}.`);
      seenFields.add(field);
      return [field, canonicalize(entry[1])];
    });
    assertPlainObject(index.options, `${label}.options`);
    const normalized = { name, key, options: canonicalize(index.options) };
    const semanticSha256 = sha256Text(JSON.stringify(normalized));
    if (
      !/^[0-9a-f]{64}$/i.test(index.semanticSha256 || '') ||
      index.semanticSha256.toLowerCase() !== semanticSha256
    ) {
      fail(`${label} tiene un hash semantico invalido.`);
    }
    return { ...normalized, semanticSha256 };
  }

  const semantic = Object.fromEntries(
    Object.entries(index).filter(([key]) => !['v', 'ns'].includes(key)),
  );
  const name = requiredText(semantic.name, `${label}.name`);
  assertPlainObject(semantic.key, `${label}.key`);
  const key = Object.entries(semantic.key).map(([field, direction]) => [field, canonicalize(direction)]);
  if (key.length === 0) fail(`${label}.key debe contener al menos un campo.`);
  const normalized = {
    name,
    key,
    options: canonicalize(Object.fromEntries(
      Object.entries(semantic).filter(([keyName]) => !['name', 'key'].includes(keyName)),
    )),
  };
  return { ...normalized, semanticSha256: sha256Text(JSON.stringify(normalized)) };
}

function normalizeIndexes(indexes = []) {
  if (!Array.isArray(indexes)) fail('collection.indexes debe ser una lista JSON.');
  return indexes
    .map((index, position) => normalizedIndex(index, position))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function normalizeCollection(collection, { requireContentHash = false } = {}) {
  const name = requiredText(collection.name, 'collection.name');
  const type = collection.type === 'view' ? 'view' : 'collection';
  if (type === 'view') {
    return { name, type, options: canonicalize(collection.options || {}), indexes: [] };
  }
  const count = Number(collection.count);
  if (!Number.isSafeInteger(count) || count < 0) fail(`Conteo invalido para ${name}.`);
  const normalized = {
    name,
    type,
    options: canonicalize(collection.options || {}),
    count,
    indexes: normalizeIndexes(collection.indexes),
  };
  if (requireContentHash) {
    const contentHash = requiredText(collection.contentHash, `collection ${name}.contentHash`).toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(contentHash)) fail(`Digest documental invalido para ${name}.`);
    normalized.contentHash = contentHash;
  }
  return normalized;
}

function normalizeInventory(inventory) {
  assertPlainObject(inventory, 'El inventario');
  if (!Array.isArray(inventory.collections)) fail('El inventario no contiene collections.');
  if (![1, 2].includes(inventory.schemaVersion)) fail('Schema de inventario no soportado.');
  const requireContentHash = inventory.schemaVersion === 2;
  const normalized = {
    schemaVersion: inventory.schemaVersion,
    database: validateDatabaseName(inventory.database, {
      restore: String(inventory.database).startsWith(RESTORE_DB_PREFIX),
    }),
    serverVersion: requiredText(inventory.serverVersion, 'serverVersion'),
    capturedAt: validDate(inventory.capturedAt, 'capturedAt').toISOString(),
    collections: inventory.collections
      .filter((collection) => !String(collection.name || '').startsWith('system.'))
      .map((collection) => normalizeCollection(collection, { requireContentHash }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
  if (requireContentHash) {
    if (inventory.contentHashAlgorithm !== 'mongodb-dbHash-md5') fail('Algoritmo de digest documental no soportado.');
    const databaseContentHash = requiredText(inventory.databaseContentHash, 'databaseContentHash').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(databaseContentHash)) fail('databaseContentHash invalido.');
    normalized.contentHashAlgorithm = inventory.contentHashAlgorithm;
    normalized.databaseContentHash = databaseContentHash;
  }
  return normalized;
}

function mongoMajor(version) {
  const major = Number(String(version).split('.')[0]);
  if (!Number.isInteger(major) || major < 4) fail(`Version MongoDB no soportada: ${version}.`);
  return major;
}

function assertCompatibleMongoVersions(sourceVersion, targetVersion) {
  const sourceMajor = mongoMajor(sourceVersion);
  const targetMajor = mongoMajor(targetVersion);
  if (sourceMajor !== targetMajor) {
    fail(`Versiones MongoDB incompatibles para el simulacro: origen ${sourceMajor}, destino ${targetMajor}.`);
  }
}

function compareInventories(sourceRaw, targetRaw) {
  const source = normalizeInventory(sourceRaw);
  const target = normalizeInventory(targetRaw);
  if (source.schemaVersion !== target.schemaVersion) {
    fail('Inventarios con capacidades de digest documental incompatibles.');
  }
  assertCompatibleMongoVersions(source.serverVersion, target.serverVersion);
  const sourceByName = new Map(source.collections.map((item) => [item.name, item]));
  const targetByName = new Map(target.collections.map((item) => [item.name, item]));
  const findings = [];
  if (source.schemaVersion === 2 && source.databaseContentHash !== target.databaseContentHash) {
    findings.push({
      collection: '$database',
      issue: 'database_content_hash_mismatch',
      expected: source.databaseContentHash,
      actual: target.databaseContentHash,
    });
  }
  for (const [name, expected] of sourceByName) {
    const actual = targetByName.get(name);
    if (!actual) {
      findings.push({ collection: name, issue: 'missing_collection' });
      continue;
    }
    if (actual.type !== expected.type) findings.push({ collection: name, issue: 'type_mismatch' });
    if (JSON.stringify(actual.options) !== JSON.stringify(expected.options)) {
      findings.push({ collection: name, issue: 'options_mismatch' });
    }
    if (expected.type === 'collection' && actual.count !== expected.count) {
      findings.push({ collection: name, issue: 'count_mismatch', expected: expected.count, actual: actual.count });
    }
    if (expected.type === 'collection' && actual.contentHash !== expected.contentHash) {
      findings.push({
        collection: name,
        issue: 'content_hash_mismatch',
        expected: expected.contentHash,
        actual: actual.contentHash,
      });
    }
    if (JSON.stringify(actual.indexes) !== JSON.stringify(expected.indexes)) {
      findings.push({ collection: name, issue: 'indexes_mismatch' });
    }
  }
  for (const name of targetByName.keys()) {
    if (!sourceByName.has(name)) findings.push({ collection: name, issue: 'unexpected_collection' });
  }
  return {
    ok: findings.length === 0,
    sourceCollections: source.collections.length,
    targetCollections: target.collections.length,
    sourceDocuments: source.collections.reduce((sum, item) => sum + (item.count || 0), 0),
    targetDocuments: target.collections.reduce((sum, item) => sum + (item.count || 0), 0),
    findings,
  };
}

function summarizeSeedResolution(sowings, resolvedSeedDocuments) {
  const missingSeedReferences = sowings.filter((sowing) => sowing?.idSemilla == null).length;
  const referenced = new Map();
  for (const sowing of sowings) {
    if (sowing?.idSemilla != null) referenced.set(String(sowing.idSemilla), sowing.idSemilla);
  }
  const resolved = new Set(
    resolvedSeedDocuments.filter((seed) => seed?._id != null).map((seed) => String(seed._id)),
  );
  const unresolvedSeedIds = [...referenced.keys()].filter((id) => !resolved.has(id));
  return {
    referencedUniqueSeeds: referenced.size,
    resolvedUniqueSeeds: [...referenced.keys()].filter((id) => resolved.has(id)).length,
    missingSeedReferences,
    unresolvedUniqueSeeds: unresolvedSeedIds.length,
  };
}

function assertNoSecrets(value, trail = 'manifest') {
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoSecrets(item, `${trail}[${index}]`));
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (/(uri|url|host|password|secret|token|credential)/i.test(key)) {
        fail(`${trail} contiene el campo sensible ${key}.`);
      }
      assertNoSecrets(nested, `${trail}.${key}`);
    }
    return;
  }
  if (typeof value === 'string' && /mongodb(?:\+srv)?:\/\//i.test(value)) {
    fail(`${trail} contiene una URI de MongoDB.`);
  }
}

function inventoryArtifact(inventory, inventoryPath) {
  const normalized = normalizeInventory(inventory);
  return {
    file: path.basename(inventoryPath),
    sha256: sha256File(inventoryPath),
    capturedAt: normalized.capturedAt,
    collections: normalized.collections.length,
    documents: normalized.collections.reduce((sum, item) => sum + (item.count || 0), 0),
  };
}

function buildBackupManifest({
  attestation,
  inventoryBefore,
  inventoryAfter,
  inventoryBeforePath,
  inventoryAfterPath,
  archivePath,
  tools,
  gitSha,
  now = new Date(),
}) {
  const source = validateSourceAttestation(attestation, { now });
  const normalizedBefore = normalizeInventory(inventoryBefore);
  const normalizedAfter = normalizeInventory(inventoryAfter);
  if (normalizedBefore.schemaVersion !== 2 || normalizedAfter.schemaVersion !== 2) {
    fail('El manifiesto candidato exige inventarios schema v2 con dbHash por coleccion.');
  }
  if (normalizedBefore.database !== source.database || normalizedAfter.database !== source.database) {
    fail('Las observaciones fuente no coinciden con la base atestada.');
  }
  if (normalizedBefore.serverVersion !== normalizedAfter.serverVersion) {
    fail('La version MongoDB cambio durante la ventana del dump.');
  }
  const createdAt = new Date(now);
  const beforeCapturedAt = new Date(normalizedBefore.capturedAt);
  const afterCapturedAt = new Date(normalizedAfter.capturedAt);
  if (
    beforeCapturedAt < source.verifiedAt ||
    afterCapturedAt < beforeCapturedAt ||
    createdAt < afterCapturedAt ||
    afterCapturedAt >= source.expiresAt
  ) {
    fail('Las observaciones source no estan ordenadas dentro de la ventana atestada.');
  }
  const sourceComparison = compareInventories(normalizedBefore, normalizedAfter);
  const manifest = {
    schemaVersion: 2,
    kind: BACKUP_KIND,
    drillId: source.id,
    drillMode: source.drillMode,
    database: source.database,
    sourceEnvironment: source.sourceEnvironment,
    sourceInstance: source.instanceIdentity,
    infrastructureEvidenceSha256: source.infrastructureEvidenceSha256,
    consistency: {
      method: 'application-write-freeze-with-system-writers-observed',
      attestationId: source.id,
      frozenAt: source.frozenAt.toISOString(),
      verifiedAt: source.verifiedAt.toISOString(),
      expiresAt: source.expiresAt.toISOString(),
      changeTicket: attestation.changeTicket,
      sourcePointInTimeGuaranteed: false,
    },
    createdAt: createdAt.toISOString(),
    gitSha: requiredText(gitSha, 'gitSha'),
    mongoServerVersion: normalizedBefore.serverVersion,
    tools,
    archive: {
      file: path.basename(archivePath),
      sizeBytes: fs.statSync(archivePath).size,
      sha256: sha256File(archivePath),
    },
    sourceObservation: {
      before: inventoryArtifact(normalizedBefore, inventoryBeforePath),
      after: inventoryArtifact(normalizedAfter, inventoryAfterPath),
      comparison: sourceComparison,
      sourcePointInTimeGuaranteed: false,
    },
    certificationRequired: true,
  };
  assertNoSecrets(manifest);
  return manifest;
}

function validateLegacyBackupManifest(manifest, backupDir) {
  assertPlainObject(manifest, 'El manifiesto');
  assertExactKeys(
    manifest,
    [
      'schemaVersion',
      'kind',
      'drillId',
      'drillMode',
      'database',
      'sourceEnvironment',
      'sourceInstance',
      'infrastructureEvidenceSha256',
      'consistency',
      'createdAt',
      'gitSha',
      'mongoServerVersion',
      'tools',
      'archive',
      'inventory',
    ],
    'El manifiesto',
  );
  if (manifest.schemaVersion !== 1 || manifest.kind !== BACKUP_KIND) {
    fail('Formato de manifiesto de backup no soportado.');
  }
  assertNoSecrets(manifest);
  requiredText(manifest.drillId, 'drillId');
  validateDatabaseName(manifest.database);
  if (![TESTING_LOCAL_MODE, PRODUCTION_MODE].includes(manifest.drillMode)) fail('drillMode del manifiesto invalido.');
  const expectedEnvironment = manifest.drillMode === TESTING_LOCAL_MODE ? 'testing' : 'production';
  const expectedDatabase = manifest.drillMode === TESTING_LOCAL_MODE ? 'chaman_testing' : 'chaman';
  if (manifest.sourceEnvironment !== expectedEnvironment || manifest.database !== expectedDatabase) {
    fail('Origen del manifiesto incompatible con drillMode.');
  }
  validateInstanceIdentity(manifest.sourceInstance, 'sourceInstance');
  if (!/^[0-9a-f]{64}$/i.test(manifest.infrastructureEvidenceSha256 || '')) {
    fail('infrastructureEvidenceSha256 del manifiesto es invalido.');
  }
  if (!/^[0-9a-f]{40}$/i.test(manifest.gitSha || '')) fail('gitSha del manifiesto es invalido.');
  const createdAt = validDate(manifest.createdAt, 'createdAt');
  assertPlainObject(manifest.consistency, 'consistency');
  if (
    manifest.consistency.method !== 'application-write-freeze' ||
    manifest.consistency.attestationId !== manifest.drillId
  ) {
    fail('La evidencia de consistencia del manifiesto es invalida.');
  }
  const frozenAt = validDate(manifest.consistency.frozenAt, 'consistency.frozenAt');
  const verifiedAt = validDate(manifest.consistency.verifiedAt, 'consistency.verifiedAt');
  const expiresAt = validDate(manifest.consistency.expiresAt, 'consistency.expiresAt');
  if (verifiedAt < frozenAt || expiresAt <= verifiedAt || expiresAt - frozenAt > 2 * 60 * 60 * 1000) {
    fail('La ventana de consistencia del manifiesto es invalida.');
  }
  if (createdAt < verifiedAt || createdAt >= expiresAt) {
    fail('El manifiesto no fue creado dentro de la ventana atestada.');
  }
  assertPlainObject(manifest.archive, 'archive');
  assertPlainObject(manifest.inventory, 'inventory');
  const archiveFile = requiredText(manifest.archive.file, 'archive.file');
  const inventoryFile = requiredText(manifest.inventory.file, 'inventory.file');
  if (path.basename(archiveFile) !== archiveFile || path.basename(inventoryFile) !== inventoryFile) {
    fail('Los artefactos del manifiesto deben ser nombres de archivo simples.');
  }
  if (!/^[0-9a-f]{64}$/i.test(manifest.archive.sha256 || '')) fail('SHA-256 del archive invalido.');
  if (!/^[0-9a-f]{64}$/i.test(manifest.inventory.sha256 || '')) fail('SHA-256 del inventario invalido.');
  const archivePath = path.resolve(backupDir, archiveFile);
  const inventoryPath = path.resolve(backupDir, inventoryFile);
  for (const artifactPath of [archivePath, inventoryPath]) {
    const relative = path.relative(path.resolve(backupDir), artifactPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) fail('El manifiesto intenta salir de backup-dir.');
    if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
      fail(`Falta el artefacto ${path.basename(artifactPath)}.`);
    }
  }
  if (sha256File(archivePath).toLowerCase() !== manifest.archive.sha256.toLowerCase()) fail('Checksum del archive invalido.');
  if (sha256File(inventoryPath).toLowerCase() !== manifest.inventory.sha256.toLowerCase()) fail('Checksum del inventario invalido.');
  if (fs.statSync(archivePath).size !== manifest.archive.sizeBytes) fail('Tamano del archive no coincide.');
  const inventory = normalizeInventory(readJson(inventoryPath));
  if (inventory.database !== manifest.database) fail('Inventario y manifiesto refieren bases distintas.');
  if (inventory.serverVersion !== manifest.mongoServerVersion) {
    fail('Inventario y manifiesto refieren versiones MongoDB distintas.');
  }
  if (
    inventory.collections.length !== manifest.inventory.collections ||
    inventory.collections.reduce((sum, item) => sum + (item.count || 0), 0) !== manifest.inventory.documents
  ) {
    fail('Resumen de inventario del manifiesto no coincide.');
  }
  return { archivePath, inventoryPath, inventory };
}

function validateInventoryArtifact(value, backupDir, label) {
  assertPlainObject(value, label);
  assertExactKeys(value, ['file', 'sha256', 'capturedAt', 'collections', 'documents'], label);
  const file = requiredText(value.file, `${label}.file`);
  if (path.basename(file) !== file) fail(`${label}.file debe ser un nombre simple.`);
  if (!/^[0-9a-f]{64}$/i.test(value.sha256 || '')) fail(`${label}.sha256 invalido.`);
  validDate(value.capturedAt, `${label}.capturedAt`);
  if (!Number.isSafeInteger(value.collections) || value.collections < 0) fail(`${label}.collections invalido.`);
  if (!Number.isSafeInteger(value.documents) || value.documents < 0) fail(`${label}.documents invalido.`);
  const artifactPath = path.resolve(backupDir, file);
  const relative = path.relative(path.resolve(backupDir), artifactPath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`${label} intenta salir de backup-dir.`);
  }
  if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) fail(`Falta ${label}.`);
  if (sha256File(artifactPath).toLowerCase() !== value.sha256.toLowerCase()) fail(`Checksum invalido para ${label}.`);
  const inventory = normalizeInventory(readJson(artifactPath));
  const documents = inventory.collections.reduce((sum, item) => sum + (item.count || 0), 0);
  if (
    inventory.capturedAt !== validDate(value.capturedAt, `${label}.capturedAt`).toISOString() ||
    inventory.collections.length !== value.collections ||
    documents !== value.documents
  ) {
    fail(`Resumen invalido para ${label}.`);
  }
  return { path: artifactPath, inventory };
}

function validateBackupManifestV2(manifest, backupDir) {
  assertExactKeys(
    manifest,
    [
      'schemaVersion', 'kind', 'drillId', 'drillMode', 'database', 'sourceEnvironment',
      'sourceInstance', 'infrastructureEvidenceSha256', 'consistency', 'createdAt', 'gitSha',
      'mongoServerVersion', 'tools', 'archive', 'sourceObservation', 'certificationRequired',
    ],
    'El manifiesto',
  );
  if (manifest.kind !== BACKUP_KIND) fail('Formato de manifiesto de backup no soportado.');
  assertNoSecrets(manifest);
  requiredText(manifest.drillId, 'drillId');
  validateDatabaseName(manifest.database);
  if (![TESTING_LOCAL_MODE, PRODUCTION_MODE].includes(manifest.drillMode)) fail('drillMode del manifiesto invalido.');
  const expectedEnvironment = manifest.drillMode === TESTING_LOCAL_MODE ? 'testing' : 'production';
  const expectedDatabase = manifest.drillMode === TESTING_LOCAL_MODE ? 'chaman_testing' : 'chaman';
  if (manifest.sourceEnvironment !== expectedEnvironment || manifest.database !== expectedDatabase) {
    fail('Origen del manifiesto incompatible con drillMode.');
  }
  validateInstanceIdentity(manifest.sourceInstance, 'sourceInstance');
  if (!/^[0-9a-f]{64}$/i.test(manifest.infrastructureEvidenceSha256 || '')) {
    fail('infrastructureEvidenceSha256 del manifiesto es invalido.');
  }
  if (!/^[0-9a-f]{40}$/i.test(manifest.gitSha || '')) fail('gitSha del manifiesto es invalido.');
  const createdAt = validDate(manifest.createdAt, 'createdAt');
  assertPlainObject(manifest.consistency, 'consistency');
  assertExactKeys(
    manifest.consistency,
    ['method', 'attestationId', 'frozenAt', 'verifiedAt', 'expiresAt', 'changeTicket', 'sourcePointInTimeGuaranteed'],
    'consistency',
  );
  if (
    manifest.consistency.method !== 'application-write-freeze-with-system-writers-observed' ||
    manifest.consistency.attestationId !== manifest.drillId ||
    typeof manifest.consistency.sourcePointInTimeGuaranteed !== 'boolean'
  ) {
    fail('La evidencia de consistencia del manifiesto v2 es invalida.');
  }
  const frozenAt = validDate(manifest.consistency.frozenAt, 'consistency.frozenAt');
  const verifiedAt = validDate(manifest.consistency.verifiedAt, 'consistency.verifiedAt');
  const expiresAt = validDate(manifest.consistency.expiresAt, 'consistency.expiresAt');
  if (verifiedAt < frozenAt || expiresAt <= verifiedAt || expiresAt - frozenAt > 2 * 60 * 60 * 1000) {
    fail('La ventana de consistencia del manifiesto es invalida.');
  }
  if (createdAt < verifiedAt || createdAt >= expiresAt) fail('El manifiesto no fue creado dentro de la ventana atestada.');
  if (manifest.certificationRequired !== true) fail('El manifiesto v2 debe exigir certificacion local del archive.');
  assertPlainObject(manifest.archive, 'archive');
  assertExactKeys(manifest.archive, ['file', 'sizeBytes', 'sha256'], 'archive');
  const archiveFile = requiredText(manifest.archive.file, 'archive.file');
  if (path.basename(archiveFile) !== archiveFile) fail('archive.file debe ser un nombre simple.');
  if (!Number.isSafeInteger(manifest.archive.sizeBytes) || manifest.archive.sizeBytes < 1) fail('Tamano del archive invalido.');
  if (!/^[0-9a-f]{64}$/i.test(manifest.archive.sha256 || '')) fail('SHA-256 del archive invalido.');
  const archivePath = path.resolve(backupDir, archiveFile);
  const archiveRelative = path.relative(path.resolve(backupDir), archivePath);
  if (archiveRelative === '..' || archiveRelative.startsWith(`..${path.sep}`) || path.isAbsolute(archiveRelative)) {
    fail('archive intenta salir de backup-dir.');
  }
  if (!fs.existsSync(archivePath) || !fs.statSync(archivePath).isFile()) fail('Falta el archive.');
  if (sha256File(archivePath).toLowerCase() !== manifest.archive.sha256.toLowerCase()) fail('Checksum del archive invalido.');
  if (fs.statSync(archivePath).size !== manifest.archive.sizeBytes) fail('Tamano del archive no coincide.');
  assertPlainObject(manifest.sourceObservation, 'sourceObservation');
  assertExactKeys(
    manifest.sourceObservation,
    ['before', 'after', 'comparison', 'sourcePointInTimeGuaranteed'],
    'sourceObservation',
  );
  const before = validateInventoryArtifact(manifest.sourceObservation.before, backupDir, 'sourceObservation.before');
  const after = validateInventoryArtifact(manifest.sourceObservation.after, backupDir, 'sourceObservation.after');
  if (before.inventory.schemaVersion !== 2 || after.inventory.schemaVersion !== 2) {
    fail('El manifiesto candidato exige inventarios schema v2 con digest documental.');
  }
  const beforeCapturedAt = new Date(before.inventory.capturedAt);
  const afterCapturedAt = new Date(after.inventory.capturedAt);
  if (
    beforeCapturedAt < verifiedAt ||
    afterCapturedAt < beforeCapturedAt ||
    createdAt < afterCapturedAt ||
    afterCapturedAt >= expiresAt
  ) {
    fail('Las observaciones source no estan ordenadas dentro de la ventana atestada.');
  }
  if (before.inventory.database !== manifest.database || after.inventory.database !== manifest.database) {
    fail('Observaciones source y manifiesto refieren bases distintas.');
  }
  if (
    before.inventory.serverVersion !== manifest.mongoServerVersion ||
    after.inventory.serverVersion !== manifest.mongoServerVersion
  ) {
    fail('Observaciones source y manifiesto refieren versiones MongoDB distintas.');
  }
  const comparison = compareInventories(before.inventory, after.inventory);
  if (JSON.stringify(manifest.sourceObservation.comparison) !== JSON.stringify(comparison)) {
    fail('La comparacion source before/after no coincide con los inventarios sellados.');
  }
  if (
    manifest.sourceObservation.sourcePointInTimeGuaranteed !== false ||
    manifest.consistency.sourcePointInTimeGuaranteed !== false
  ) {
    fail('Este dump logico sin oplog/snapshot no puede declarar garantia point-in-time.');
  }
  return {
    schemaVersion: 2,
    archivePath,
    sourceBeforePath: before.path,
    sourceAfterPath: after.path,
    sourceBefore: before.inventory,
    sourceAfter: after.inventory,
    sourceComparison: comparison,
    sourcePointInTimeGuaranteed: false,
    artifactPaths: [archivePath, before.path, after.path],
  };
}

function validateBackupManifest(manifest, backupDir) {
  assertPlainObject(manifest, 'El manifiesto');
  if (manifest.schemaVersion === 1) {
    const legacy = validateLegacyBackupManifest(manifest, backupDir);
    return {
      schemaVersion: 1,
      ...legacy,
      sourcePointInTimeGuaranteed: false,
      artifactPaths: [legacy.archivePath, legacy.inventoryPath],
    };
  }
  if (manifest.schemaVersion === 2) return validateBackupManifestV2(manifest, backupDir);
  fail('Formato de manifiesto de backup no soportado.');
}

function redact(text, secrets = []) {
  let value = String(text || '');
  for (const secret of secrets.filter(Boolean)) value = value.split(secret).join('[REDACTED]');
  return value.replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/gi, '[REDACTED_MONGODB_URI]');
}

module.exports = {
  BACKUP_KIND,
  PRODUCTION_MODE,
  RESTORE_DB_PREFIX,
  SOURCE_ATTESTATION_KIND,
  TARGET_ATTESTATION_KIND,
  TESTING_LOCAL_MODE,
  assertCompatibleMongoVersions,
  assertDestinationIsolated,
  assertNoSecrets,
  assertRuntimeIdentity,
  buildBackupManifest,
  compareInventories,
  databaseFromMongoUri,
  expectedConfirmation,
  mongoEndpointFingerprint,
  normalizeInventory,
  readJson,
  redact,
  requireConfirmation,
  safeArtifactDirectory,
  sha256File,
  sha256Json,
  summarizeSeedResolution,
  validateBackupManifest,
  validateSourceAttestation,
  validateTargetAttestation,
};
