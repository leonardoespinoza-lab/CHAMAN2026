const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BACKUP_KIND = 'chaman-mongo-logical-backup';
const SOURCE_ATTESTATION_KIND = 'chaman-mongo-write-freeze-attestation';
const TARGET_ATTESTATION_KIND = 'chaman-mongo-disposable-target-attestation';
const RESTORE_DB_PREFIX = 'chaman_restore_drill_';
const SYSTEM_DATABASES = new Set(['admin', 'config', 'local']);
const INSTANCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{5,199}$/;

function fail(message) {
  throw new Error(message);
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
    ],
    'La atestacion de congelamiento',
  );
  if (attestation.schemaVersion !== 1 || attestation.kind !== SOURCE_ATTESTATION_KIND) {
    fail('Formato de atestacion de congelamiento no soportado.');
  }
  const id = requiredText(attestation.attestationId, 'attestationId');
  if (!/^[a-z0-9][a-z0-9_-]{7,79}$/i.test(id)) fail('attestationId invalido.');
  if (attestation.sourceEnvironment !== 'production') {
    fail('El dump gobernado exige sourceEnvironment=production.');
  }
  const database = validateDatabaseName(attestation.database);
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
  const frozenAt = validDate(attestation.frozenAt, 'frozenAt');
  const verifiedAt = validDate(attestation.verifiedAt, 'verifiedAt');
  const expiresAt = validDate(attestation.expiresAt, 'expiresAt');
  if (verifiedAt < frozenAt) fail('verifiedAt no puede preceder frozenAt.');
  if (expiresAt <= verifiedAt) fail('expiresAt debe ser posterior a verifiedAt.');
  if (expiresAt - frozenAt > 2 * 60 * 60 * 1000) {
    fail('La ventana de congelamiento no puede superar dos horas.');
  }
  if (now < verifiedAt || now >= expiresAt) fail('La atestacion no esta vigente.');
  return { id, database, frozenAt, verifiedAt, expiresAt, instanceIdentity };
}

function validateTargetAttestation(attestation, { now = new Date() } = {}) {
  assertPlainObject(attestation, 'La atestacion del destino');
  assertExactKeys(
    attestation,
    [
      'schemaVersion',
      'kind',
      'drillId',
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
    ],
    'La atestacion del destino',
  );
  if (attestation.schemaVersion !== 1 || attestation.kind !== TARGET_ATTESTATION_KIND) {
    fail('Formato de atestacion del destino no soportado.');
  }
  const drillId = requiredText(attestation.drillId, 'drillId');
  if (!/^[a-z0-9][a-z0-9_-]{7,79}$/i.test(drillId)) fail('drillId invalido.');
  if (attestation.environment !== 'recovery-drill') {
    fail('El destino debe declarar environment=recovery-drill.');
  }
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
  const expiresAt = validDate(attestation.expiresAt, 'expiresAt');
  if (now >= expiresAt) fail('La atestacion del destino esta vencida.');
  if (expiresAt - now > 48 * 60 * 60 * 1000) {
    fail('La atestacion del destino no puede tener mas de 48 horas de vigencia restante.');
  }
  return { drillId, database, expiresAt, instanceIdentity };
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
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    fail('Los artefactos de backup deben guardarse fuera del repositorio.');
  }
  if (resolved === path.parse(resolved).root) fail('output-dir no puede ser la raiz del volumen.');
  if (mustNotExist && fs.existsSync(resolved)) fail('output-dir ya existe; no se sobreescribira.');
  if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) {
    fail('output-dir no puede ser un enlace simbolico.');
  }
  return resolved;
}

function normalizeIndexes(indexes = []) {
  return indexes
    .map((index) => ({
      name: index.name,
      key: index.key,
      unique: index.unique === true,
      sparse: index.sparse === true,
      hidden: index.hidden === true,
      ...(index.expireAfterSeconds == null ? {} : { expireAfterSeconds: index.expireAfterSeconds }),
      ...(index.partialFilterExpression == null
        ? {}
        : { partialFilterExpression: canonicalize(index.partialFilterExpression) }),
      ...(index.collation == null ? {} : { collation: canonicalize(index.collation) }),
      ...(index.wildcardProjection == null
        ? {}
        : { wildcardProjection: canonicalize(index.wildcardProjection) }),
      ...(index.weights == null ? {} : { weights: canonicalize(index.weights) }),
      ...Object.fromEntries(
        [
          'default_language',
          'language_override',
          'textIndexVersion',
          '2dsphereIndexVersion',
          'bits',
          'min',
          'max',
          'bucketSize',
          'storageEngine',
        ]
          .filter((key) => index[key] != null)
          .map((key) => [key, canonicalize(index[key])]),
      ),
    }))
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
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

function normalizeCollection(collection) {
  const name = requiredText(collection.name, 'collection.name');
  const type = collection.type === 'view' ? 'view' : 'collection';
  if (type === 'view') {
    return { name, type, options: canonicalize(collection.options || {}), indexes: [] };
  }
  const count = Number(collection.count);
  if (!Number.isSafeInteger(count) || count < 0) fail(`Conteo invalido para ${name}.`);
  return {
    name,
    type,
    options: canonicalize(collection.options || {}),
    count,
    indexes: normalizeIndexes(collection.indexes),
  };
}

function normalizeInventory(inventory) {
  assertPlainObject(inventory, 'El inventario');
  if (!Array.isArray(inventory.collections)) fail('El inventario no contiene collections.');
  return {
    schemaVersion: 1,
    database: validateDatabaseName(inventory.database, {
      restore: String(inventory.database).startsWith(RESTORE_DB_PREFIX),
    }),
    serverVersion: requiredText(inventory.serverVersion, 'serverVersion'),
    capturedAt: validDate(inventory.capturedAt, 'capturedAt').toISOString(),
    collections: inventory.collections
      .filter((collection) => !String(collection.name || '').startsWith('system.'))
      .map(normalizeCollection)
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
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
  assertCompatibleMongoVersions(source.serverVersion, target.serverVersion);
  const sourceByName = new Map(source.collections.map((item) => [item.name, item]));
  const targetByName = new Map(target.collections.map((item) => [item.name, item]));
  const findings = [];
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

function buildBackupManifest({ attestation, inventory, archivePath, inventoryPath, tools, gitSha, now = new Date() }) {
  const source = validateSourceAttestation(attestation, { now });
  const normalizedInventory = normalizeInventory(inventory);
  if (normalizedInventory.database !== source.database) {
    fail('La base del inventario no coincide con la atestacion.');
  }
  const manifest = {
    schemaVersion: 1,
    kind: BACKUP_KIND,
    drillId: source.id,
    database: source.database,
    sourceEnvironment: 'production',
    sourceInstance: source.instanceIdentity,
    consistency: {
      method: 'application-write-freeze',
      attestationId: source.id,
      frozenAt: source.frozenAt.toISOString(),
      verifiedAt: source.verifiedAt.toISOString(),
      expiresAt: source.expiresAt.toISOString(),
      changeTicket: attestation.changeTicket,
    },
    createdAt: now.toISOString(),
    gitSha: requiredText(gitSha, 'gitSha'),
    mongoServerVersion: normalizedInventory.serverVersion,
    tools,
    archive: {
      file: path.basename(archivePath),
      sizeBytes: fs.statSync(archivePath).size,
      sha256: sha256File(archivePath),
    },
    inventory: {
      file: path.basename(inventoryPath),
      sha256: sha256File(inventoryPath),
      collections: normalizedInventory.collections.length,
      documents: normalizedInventory.collections.reduce((sum, item) => sum + (item.count || 0), 0),
    },
  };
  assertNoSecrets(manifest);
  return manifest;
}

function validateBackupManifest(manifest, backupDir) {
  assertPlainObject(manifest, 'El manifiesto');
  assertExactKeys(
    manifest,
    [
      'schemaVersion',
      'kind',
      'drillId',
      'database',
      'sourceEnvironment',
      'sourceInstance',
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
  if (manifest.sourceEnvironment !== 'production') fail('El manifiesto no identifica production como origen.');
  validateInstanceIdentity(manifest.sourceInstance, 'sourceInstance');
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
  if (sha256File(archivePath) !== manifest.archive.sha256) fail('Checksum del archive invalido.');
  if (sha256File(inventoryPath) !== manifest.inventory.sha256) fail('Checksum del inventario invalido.');
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

function redact(text, secrets = []) {
  let value = String(text || '');
  for (const secret of secrets.filter(Boolean)) value = value.split(secret).join('[REDACTED]');
  return value.replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/gi, '[REDACTED_MONGODB_URI]');
}

module.exports = {
  BACKUP_KIND,
  RESTORE_DB_PREFIX,
  SOURCE_ATTESTATION_KIND,
  TARGET_ATTESTATION_KIND,
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
