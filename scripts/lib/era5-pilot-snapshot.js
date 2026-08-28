const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DB_NAME = 'chaman_testing';
const SCHEMA_VERSION = 4;
const SAFETY_ATTESTATION_SCHEMA_VERSION = 3;
const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ERA5_CALCULATION_VERSION = 'chaman-meteo-agro-v2';
const ERA5_SOURCE_VERSION = 'era5-land-timeseries-19var-v2';
const ERA5_PROVIDER = 'copernicus-cds';
const ERA5_DATASET = 'reanalysis-era5-land-timeseries';
const ERA5_COUNTRIES = new Set(['AR', 'UY', 'PY', 'BR', 'CL']);
const RECENT_OPEN_METEO_DAYS = 5;
const EARLIEST_ERA5_HISTORICAL_START = '2020-01-01';
const MAX_LOT_BINDING_DRIFT_KM = 1;
const MAX_GRID_BINDING_DISTANCE_KM = 15;
const BINDING_DISTANCE_TOLERANCE_KM = 0.1;
const CLUSTER_ATTESTATION_MAX_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000;
const SAFETY_ATTESTATION_MAX_VALIDITY_MS = 24 * 60 * 60 * 1000;
const REVALIDATION_TOKEN = Symbol('era5-pilot-scope-revalidation');
const MAX_ATTESTATION_FUTURE_SKEW_MS = 5 * 60 * 1000;
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

function exactKeys(value, allowed, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} debe ser un objeto.`);
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !(key in value));
  assert(extras.length === 0 && missing.length === 0,
    `${label} contiene campos inesperados o faltantes (extras=${extras.join(',')}; faltantes=${missing.join(',')}).`);
}

function resolveWithExistingAncestor(inputPath) {
  const resolved = path.resolve(inputPath);
  const suffix = [];
  let cursor = resolved;
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    assert(parent !== cursor, `No se pudo resolver un ancestro existente para ${resolved}.`);
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
  return path.join(fs.realpathSync(cursor), ...suffix);
}

function assertExternalPath(inputPath, label, repositoryRoot = REPOSITORY_ROOT) {
  assert(typeof inputPath === 'string' && inputPath.trim(), `${label} requiere una ruta.`);
  const target = resolveWithExistingAncestor(inputPath);
  const root = fs.realpathSync(path.resolve(repositoryRoot));
  const relative = path.relative(root, target);
  const outside = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  assert(outside, `${label} debe estar fuera del worktree.`);
  return target;
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

function validateInstant(value, label) {
  assert(ISO_INSTANT_PATTERN.test(String(value || '')), `${label} debe usar ISO-8601 UTC canonico (YYYY-MM-DDTHH:mm:ss.sssZ).`);
  const parsed = new Date(value);
  assert(!Number.isNaN(parsed.getTime()) && parsed.toISOString() === value, `${label} no es un instante ISO-8601 valido.`);
  return parsed;
}

function assertAttestationWindow(attestation, label, now, maxValidityMs) {
  const approvedAt = validateInstant(attestation?.approvedAt, `${label}.approvedAt`);
  const expiresAt = validateInstant(attestation?.expiresAt, `${label}.expiresAt`);
  const reference = now instanceof Date ? now : new Date(now);
  assert(Number.isFinite(reference.getTime()), `El reloj usado para validar ${label} no es valido.`);
  assert(expiresAt > approvedAt, `${label}.expiresAt debe ser posterior a approvedAt.`);
  assert(expiresAt.getTime() - approvedAt.getTime() <= maxValidityMs, `${label} excede su vigencia maxima permitida.`);
  assert(approvedAt.getTime() <= reference.getTime() + MAX_ATTESTATION_FUTURE_SKEW_MS, `${label} fue aprobada en el futuro.`);
  assert(reference.getTime() + MAX_ATTESTATION_FUTURE_SKEW_MS >= approvedAt.getTime() && reference < expiresAt, `${label} no esta vigente.`);
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
  const resolved = assertExternalPath(filePath, `La attestation ${label}`);
  assert(fs.existsSync(resolved), `No existe la attestation ${label}.`);
  const stats = fs.statSync(resolved);
  assert(stats.isFile() && stats.size > 0 && stats.size <= 65536, `Archivo de attestation ${label} invalido.`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function assertTestingOnly({ uri, attestation, operationId, env = process.env, now = new Date() }) {
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
  assert(attestation?.schemaVersion === 2 && attestation.purpose === 'era5-agromet-pilot' && attestation.environment === 'testing' && attestation.database === DB_NAME,
    'Se requiere una attestation externa aprobada del cluster Testing.');
  assert(attestation.operationId === operationId, 'La attestation del cluster no esta vinculada a esta operacion.');
  assert(typeof attestation.approvedBy === 'string' && attestation.approvedBy.trim().length >= 3, 'La attestation del cluster no tiene aprobador.');
  assert(typeof attestation.evidence === 'string' && attestation.evidence.trim().length >= 8, 'La attestation del cluster no tiene evidencia.');
  assertAttestationWindow(attestation, 'attestation del cluster', now, CLUSTER_ATTESTATION_MAX_VALIDITY_MS);
  const expectedFingerprint = String(attestation.endpointFingerprint || '').trim().toLowerCase();
  assert(/^[a-f0-9]{64}$/.test(expectedFingerprint), 'La attestation no contiene un fingerprint SHA-256 valido.');
  assert(testingClusterFingerprint(uri) === expectedFingerprint, 'Abortado: el fingerprint del cluster no corresponde al Testing aprobado.');
  return database;
}

function criticalPilotConfig(config) {
  const validated = operationConfig(config);
  return {
    lotId: validated.lotId,
    sowingId: validated.sowingId,
    from: validated.from,
    to: validated.to,
    historicalStart: validated.historicalStart,
    bridgeToday: validated.bridgeToday,
    recentOpenMeteoDays: RECENT_OPEN_METEO_DAYS,
    calculationVersion: ERA5_CALCULATION_VERSION,
    sourceVersion: ERA5_SOURCE_VERSION,
  };
}

function assertSafetyAttestation(attestation, {
  operationId,
  endpointFingerprint,
  codeSha,
  config,
  now = new Date(),
}) {
  assert(attestation?.schemaVersion === SAFETY_ATTESTATION_SCHEMA_VERSION &&
    attestation.environment === 'testing' && attestation.database === DB_NAME,
    'La attestation operativa no pertenece inequívocamente a Testing.');
  exactKeys(attestation, [
    'schemaVersion', 'environment', 'database', 'operationId', 'endpointFingerprint', 'codeSha',
    'statement', 'pilotConfig', 'approvedBy', 'evidence', 'approvedAt', 'expiresAt',
  ], 'attestation operativa');
  assert(attestation?.statement === SAFETY_ATTESTATION,
    'Falta attestation: piloto agromet-only, crons congelados y notificaciones/outbox/push deshabilitados.');
  assert(attestation.operationId === operationId, 'La attestation operativa no esta vinculada a esta operacion.');
  assert(attestation.endpointFingerprint === endpointFingerprint, 'La attestation operativa no esta vinculada al cluster Testing aprobado.');
  assert(attestation.codeSha === codeSha, 'La attestation operativa no esta vinculada al codigo que se esta ejecutando.');
  const expectedConfig = criticalPilotConfig(config);
  assert(JSON.stringify(sortForEjson(attestation.pilotConfig)) === JSON.stringify(sortForEjson(expectedConfig)),
    'La attestation operativa no aprueba la configuracion critica exacta del piloto.');
  assert(typeof attestation.approvedBy === 'string' && attestation.approvedBy.trim().length >= 3, 'La attestation operativa no tiene aprobador.');
  assert(typeof attestation.evidence === 'string' && attestation.evidence.trim().length >= 8, 'La attestation operativa no tiene evidencia verificable.');
  assertAttestationWindow(attestation, 'attestation operativa', now, SAFETY_ATTESTATION_MAX_VALIDITY_MS);
  return {
    schemaVersion: SAFETY_ATTESTATION_SCHEMA_VERSION,
    attestationSha256: sha256(JSON.stringify(sortForEjson(attestation))),
    endpointFingerprint,
    pilotConfig: expectedConfig,
  };
}

function assertOperationalApproval(approval, config) {
  exactKeys(approval, ['schemaVersion', 'attestationSha256', 'endpointFingerprint', 'pilotConfig'], 'aprobacion operativa sellada');
  assert(approval.schemaVersion === SAFETY_ATTESTATION_SCHEMA_VERSION,
    'La aprobacion operativa sellada tiene una version no admitida.');
  assert(/^[a-f0-9]{64}$/i.test(String(approval.attestationSha256 || '')),
    'La aprobacion operativa no contiene un hash canonico de la attestation.');
  assert(/^[a-f0-9]{64}$/i.test(String(approval.endpointFingerprint || '')),
    'La aprobacion operativa no contiene el fingerprint canonico del cluster Testing.');
  const expected = criticalPilotConfig(config);
  assert(JSON.stringify(sortForEjson(approval.pilotConfig)) === JSON.stringify(sortForEjson(expected)),
    'La aprobacion operativa no esta vinculada a la configuracion critica exacta del piloto.');
}

function assertOperationalApprovalMatchesManifest(manifest, currentApproval) {
  assertOperationalApproval(currentApproval, manifestOperationConfig(manifest));
  assert(currentApproval.endpointFingerprint === manifest.operationalApproval?.endpointFingerprint,
    'El cluster Testing actual no coincide con el cluster sellado en el bundle.');
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

function runtimeDependencyIdentity(repositoryRoot = REPOSITORY_ROOT, versions = process.versions) {
  const nodeVersion = String(versions?.node || '');
  const nodeMajor = Number(nodeVersion.split('.')[0]);
  assert(nodeMajor === 20, 'La herramienta requiere Node.js 20.x, igual que el engine y .nvmrc sellados.');
  const lockNames = ['package-lock.json', 'sdc-datos/package-lock.json'];
  const lockfiles = {};
  for (const name of lockNames) {
    const filePath = path.join(repositoryRoot, ...name.split('/'));
    assert(fs.existsSync(filePath) && fs.statSync(filePath).isFile(), `Falta lockfile requerido ${name}.`);
    lockfiles[name] = sha256(fs.readFileSync(filePath));
  }
  return { nodeMajor, nodeVersion, lockfiles };
}

function assertRuntimeDependencyIdentity(sealed, current) {
  exactKeys(sealed, ['nodeMajor', 'nodeVersion', 'lockfiles'], 'runtimeIdentity sellada');
  exactKeys(current, ['nodeMajor', 'nodeVersion', 'lockfiles'], 'runtimeIdentity actual');
  exactKeys(sealed.lockfiles, ['package-lock.json', 'sdc-datos/package-lock.json'], 'lockfiles sellados');
  exactKeys(current.lockfiles, ['package-lock.json', 'sdc-datos/package-lock.json'], 'lockfiles actuales');
  assert(sealed.nodeMajor === 20 && current.nodeMajor === 20,
    'La herramienta y el bundle exigen exactamente Node.js 20.x.');
  assert(/^20\.\d+\.\d+(?:[-+][0-9a-z.-]+)?$/i.test(String(sealed.nodeVersion || '')) &&
    /^20\.\d+\.\d+(?:[-+][0-9a-z.-]+)?$/i.test(String(current.nodeVersion || '')),
  'Las versiones Node sellada y actual deben ser versiones 20.x canonicas.');
  for (const name of ['package-lock.json', 'sdc-datos/package-lock.json']) {
    assert(/^[a-f0-9]{64}$/i.test(String(sealed.lockfiles?.[name] || '')),
      `Hash sellado invalido para ${name}.`);
    assert(String(current.lockfiles?.[name] || '').toLowerCase() === sealed.lockfiles[name].toLowerCase(),
      `El lockfile ${name} no coincide con el bundle.`);
  }
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

function normalizedKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function looksLikeBase64(value) {
  const text = String(value || '').trim();
  if (/^data:[^;,]+;base64,[a-z0-9+/=]+$/i.test(text) || /^base64:[a-z0-9+/=]+$/i.test(text)) return true;
  if (text.length < 24 || text.length % 4 !== 0 || !/^[a-z0-9+/]+={0,2}$/i.test(text) || /^[a-f0-9]+$/i.test(text)) return false;
  try {
    const normalized = Buffer.from(text, 'base64').toString('base64').replace(/=+$/, '');
    return normalized === text.replace(/=+$/, '');
  } catch {
    return false;
  }
}

function scanSecrets(value, pathParts = [], findings = []) {
  if (value === null || value === undefined) return findings;
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSecrets(item, [...pathParts, String(index)], findings));
    return findings;
  }
  if (typeof value === 'object') {
    if (value instanceof Date) return findings;
    if (Buffer.isBuffer(value) || value instanceof ArrayBuffer || ArrayBuffer.isView(value) || value?._bsontype === 'Binary' || Object.hasOwn(value, '$binary')) {
      findings.push(pathParts.join('.'));
      return findings;
    }
    const entries = Object.entries(value);
    for (const [key, child] of entries) {
      const keyNormalized = normalizedKey(key);
      const parentNormalized = normalizedKey(pathParts.at(-1));
      const sensitiveValue = child !== null && child !== undefined && !/^(|redacted|<redacted>|masked|none|null|n\/a)$/i.test(String(child).trim());
      if (sensitiveValue && (isSensitiveKey(keyNormalized) || isSensitiveKey(`${parentNormalized}${keyNormalized}`))) {
        findings.push([...pathParts, key].join('.'));
      }
    }
    if (
      value?._bsontype === 'ObjectId' &&
      typeof value.toHexString === 'function' &&
      OBJECT_ID_PATTERN.test(String(value.toHexString()))
    ) {
      for (const [key, child] of entries) {
        if (!['_bsontype', 'id', 'buffer'].includes(key)) scanSecrets(child, [...pathParts, key], findings);
      }
      return findings;
    }
    if (typeof value.toExtendedJSON === 'function') {
      const extended = value.toExtendedJSON();
      if (extended !== value) scanSecrets(extended, pathParts, findings);
    }
    for (const [key, child] of entries) {
      scanSecrets(child, [...pathParts, key], findings);
    }
    return findings;
  }
  if (typeof value === 'string') {
    if (looksLikeBase64(value) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value) || /mongodb(?:\+srv)?:\/\/[^\s/:]+:[^\s/@]+@/i.test(value) || /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/.test(value)) {
      findings.push(pathParts.join('.'));
    }
  }
  return findings;
}

function isSensitiveKey(normalizedKey) {
  if (!normalizedKey) return false;
  if (/^(dedupekey|eventkey|eventkeys|idempotencykey|publickey)$/.test(normalizedKey)) return false;
  return /(?:password|passwd|passphrase|secret|credential|authorization|bearer|privatekey|signingkey|encryptionkey|apikey|apitoken|accesstoken|refreshtoken|authtoken|jwttoken|jwtsecret|sessiontoken|sessionsecret|databaseuri|databaseurl|mongouri|mongourl|connectionstring|mqttpassword|cdskey|fieldclimatekey|smtp(?:uri|url|password|token)|cookie)$/.test(normalizedKey) ||
    /^(?:password|passwd|secret|token|credentials?)$/.test(normalizedKey);
}

function operationConfig(input) {
  const lotId = validateIdentifier(input.lotId, 'lot-id');
  const sowingId = validateIdentifier(input.sowingId, 'sowing-id');
  const from = validateDate(input.from, 'from');
  const to = validateDate(input.to, 'to');
  const historicalStart = validateDate(input.historicalStart, 'historical-start');
  const bridgeToday = validateDate(input.bridgeToday, 'bridge-today');
  assert(from <= to, 'from no puede ser posterior a to.');
  assert(historicalStart >= EARLIEST_ERA5_HISTORICAL_START, `historical-start no puede ser anterior a ${EARLIEST_ERA5_HISTORICAL_START}.`);
  assert(from >= historicalStart, 'from es anterior a historical-start; el bridge no puede reconstruir el ciclo completo solicitado.');
  assert(/^[a-z0-9][a-z0-9._-]{5,100}$/i.test(String(input.operationId || '')), 'operation-id es invalido.');
  assert(to < bridgeToday, 'to debe ser anterior a bridge-today; el snapshot piloto no admite pronostico.');
  return { operationId: input.operationId, lotId, sowingId, from, to, historicalStart, bridgeToday };
}

function isIanaTimezone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return typeof value === 'string' && value.length > 0;
  } catch {
    return false;
  }
}

function dateInTimezone(value, timezone) {
  assert(isIanaTimezone(timezone), `Timezone IANA invalido: ${timezone}.`);
  const date = value instanceof Date ? value : new Date(value);
  assert(Number.isFinite(date.getTime()), 'El reloj local del bridge no es valido.');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const read = (type) => parts.find((part) => part.type === type)?.value;
  return `${read('year')}-${read('month')}-${read('day')}`;
}

function localDateTimeToUtc(date, hour, timezone) {
  validateDate(date, 'fecha local');
  assert(Number.isInteger(hour) && hour >= 0 && hour <= 23, 'La hora local debe estar entre 0 y 23.');
  assert(isIanaTimezone(timezone), `Timezone IANA invalido: ${timezone}.`);
  const targetAsUtc = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00.000Z`);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  let candidate = targetAsUtc;
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = formatter.formatToParts(candidate);
    const read = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
    const representedAsUtc = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'), read('second'));
    candidate = new Date(candidate.getTime() + (targetAsUtc.getTime() - representedAsUtc));
  }
  const represented = Object.fromEntries(formatter.formatToParts(candidate).map((part) => [part.type, part.value]));
  assert(`${represented.year}-${represented.month}-${represented.day}` === date && Number(represented.hour) === hour,
    `La hora local ${date} ${hour}:00 no existe o es ambigua en ${timezone}.`);
  return candidate;
}

function addDays(value, days) {
  const date = new Date(`${validateDate(value, 'fecha')}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function numeroFinito(value, label, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  const allowedType = typeof value === 'number' || typeof value === 'string';
  assert(allowedType && value !== null && value !== undefined &&
    !(typeof value === 'string' && value.trim() === ''), `${label} invalido: debe ser un numero finito explicito.`);
  const numeric = Number(value);
  assert(Number.isFinite(numeric) && numeric >= min && numeric <= max,
    `${label} invalido: debe estar entre ${min} y ${max}.`);
  return numeric;
}

function validCoordinates(value) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function distanceKm(left, right) {
  const radians = (value) => (value * Math.PI) / 180;
  const lat1 = radians(Number(left.lat));
  const lat2 = radians(Number(right.lat));
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(Number(right.lng) - Number(left.lng));
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function assertBridgeScopeMetadata(scope, config) {
  const binding = scope.binding;
  const gridPoint = scope.gridPoint;
  assert(binding && binding.locationType === 'lote' && binding.locationId === config.lotId && binding.active === true,
    'El binding Chaman-Meteo no coincide exactamente con el lote activo.');
  assert(gridPoint && gridPoint.key === binding.gridPointKey && gridPoint.enabled === true,
    'El punto de grilla no coincide con el binding activo.');
  assert(gridPoint.provider === ERA5_PROVIDER && gridPoint.dataset === ERA5_DATASET && ERA5_COUNTRIES.has(gridPoint.countryCode),
    'El punto no coincide con el proveedor, dataset o pais operativo del bridge.');
  validateDate(gridPoint.historicalStart, 'weather_grid_points.historicalStart');
  assert(gridPoint.historicalStart >= EARLIEST_ERA5_HISTORICAL_START, 'El historicalStart de la grilla es anterior al minimo operativo.');
  assert(config.from >= gridPoint.historicalStart && config.from >= config.historicalStart,
    'La ventana solicitada comienza antes del historicalStart efectivo del bridge.');
  assert(isIanaTimezone(gridPoint.timezone) && gridPoint.timezone === scope.gridTimezone,
    'La grilla requiere un timezone IANA coherente con el alcance sellado.');
  const lotCoordinates = scope.lotCoordinates;
  const bindingCoordinates = { lat: Number(binding.latitude), lng: Number(binding.longitude) };
  const gridCoordinates = { lat: Number(gridPoint.latitude), lng: Number(gridPoint.longitude) };
  assert(validCoordinates(lotCoordinates) && validCoordinates(bindingCoordinates) && validCoordinates(gridCoordinates),
    'El lote, binding o punto de grilla contiene coordenadas invalidas.');
  assert(distanceKm(lotCoordinates, bindingCoordinates) <= MAX_LOT_BINDING_DRIFT_KM,
    'El centroide del lote excede el drift permitido respecto del binding.');
  const calculatedDistance = distanceKm(bindingCoordinates, gridCoordinates);
  const declaredDistance = Number(binding.distanceKm);
  assert(Number.isFinite(declaredDistance) && declaredDistance >= 0 && declaredDistance <= MAX_GRID_BINDING_DISTANCE_KM &&
    calculatedDistance <= MAX_GRID_BINDING_DISTANCE_KM && Math.abs(calculatedDistance - declaredDistance) <= BINDING_DISTANCE_TOLERANCE_KM,
  'La distancia declarada entre binding y grilla no es valida o no coincide con sus coordenadas.');
}

function observationIdentityQuery(scope, config) {
  assert(isIanaTimezone(scope.gridTimezone), 'No se puede sellar observaciones sin timezone IANA valido.');
  const start = localDateTimeToUtc(config.from, 0, scope.gridTimezone);
  const end = localDateTimeToUtc(addDays(config.to, 1), 0, scope.gridTimezone);
  const dates = dateRange(config.from, config.to);
  const dailyIdentities = dates.flatMap((date) => [
    localDateTimeToUtc(date, 12, scope.gridTimezone),
    new Date(`${date}T00:00:00.000Z`),
    new Date(`${date}T01:00:00.000Z`),
  ]);
  const utcCalendarStart = new Date(`${config.from}T00:00:00.000Z`);
  const utcCalendarEnd = new Date(`${addDays(config.to, 1)}T00:00:00.000Z`);
  const base = { idEstablecimiento: scope.establishmentObjectId };
  return {
    $or: [
      { ...base, timestamp: { $gte: start, $lt: end }, granularidad: 'hourly' },
      { ...base, fechaLocal: { $gte: config.from, $lte: config.to }, granularidad: 'daily' },
      { ...base, timestamp: { $gte: utcCalendarStart, $lt: utcCalendarEnd }, granularidad: 'daily' },
      { ...base, timestamp: { $in: dailyIdentities }, granularidad: 'daily' },
    ],
  };
}

function era5BridgeWindow(scope, config) {
  const from = [config.from, config.historicalStart, scope.gridPoint.historicalStart].sort().reverse()[0];
  const recentWindowStart = addDays(config.bridgeToday, -(RECENT_OPEN_METEO_DAYS - 1));
  const toExclusive = [addDays(config.to, 1), recentWindowStart].sort()[0];
  assert(from < toExclusive, 'La ventana solicitada no contiene dias historicos que el bridge ERA5 pueda usar.');
  const to = addDays(toExclusive, -1);
  return { from, to, toExclusive, recentWindowStart };
}

function assertObservationOwnership(observations, lotId) {
  const canonicalLotId = validateIdentifier(lotId, 'lot-id de ownership meteorologico');
  for (const observation of observations) {
    assert(observation.contextosLote === undefined || observation.contextosLote === null ||
      (typeof observation.contextosLote === 'object' && !Array.isArray(observation.contextosLote)),
    'Piloto abortado: contextosLote debe ser un objeto.');
    const contextKeys = observation.contextosLote && typeof observation.contextosLote === 'object' && !Array.isArray(observation.contextosLote)
      ? Object.keys(observation.contextosLote) : [];
    assert(contextKeys.every((value) => OBJECT_ID_PATTERN.test(value)), 'Piloto abortado: una observacion contiene claves de contexto no canonicas.');
    for (const [key, context] of Object.entries(observation.contextosLote || {})) {
      assert(context && typeof context === 'object' && !Array.isArray(context), `Piloto abortado: contextosLote.${key} no es un objeto.`);
      assert(idValue(context.idLote) === key.toLowerCase(), `Piloto abortado: contextosLote.${key}.idLote no coincide con su clave.`);
    }
    const foreignIds = contextLotIds(observation.contextosLote).filter((value) => value !== canonicalLotId);
    assert(foreignIds.length === 0, `Piloto abortado: una observacion contiene contextos de otros lotes (${foreignIds.join(', ')}).`);
    if (observation.idLote) assert(idValue(observation.idLote) === canonicalLotId, 'Piloto abortado: una observacion compartida pertenece a otro lote.');
  }
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
        coordenadas: 1,
        lote: { _id: 1, idSiembra: 1, idEstablecimiento: 1, ubicacion: 1 },
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
  const parsedSowingDate = new Date(row.fechaSiembra);
  assert(Number.isFinite(parsedSowingDate.getTime()), 'La siembra no tiene una fechaSiembra valida.');
  const sowingDate = parsedSowingDate.toISOString().slice(0, 10);
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
  const rawLotCoordinates = row.lote?.ubicacion?.centro || row.coordenadas;
  const lotCoordinates = { lat: Number(rawLotCoordinates?.lat), lng: Number(rawLotCoordinates?.lng) };
  const scopeMetadata = {
    gridTimezone: String(gridPoint.timezone || ''),
    lotCoordinates,
    binding: {
      locationType: binding.locationType,
      locationId: idValue(binding.locationId),
      gridPointKey: String(binding.gridPointKey || ''),
      latitude: Number(binding.latitude),
      longitude: Number(binding.longitude),
      distanceKm: Number(binding.distanceKm),
      active: binding.active,
    },
    gridPoint: {
      key: String(gridPoint.key || ''),
      latitude: Number(gridPoint.latitude),
      longitude: Number(gridPoint.longitude),
      countryCode: String(gridPoint.countryCode || ''),
      timezone: String(gridPoint.timezone || ''),
      enabled: gridPoint.enabled,
      provider: String(gridPoint.provider || ''),
      dataset: String(gridPoint.dataset || ''),
      historicalStart: String(gridPoint.historicalStart || ''),
    },
  };
  assertBridgeScopeMetadata({ ...scopeMetadata }, config);
  if (options.requireCurrentBridgeDate !== false) {
    assert(config.bridgeToday === dateInTimezone(options.now || new Date(), scopeMetadata.gridTimezone),
      'bridge-today no coincide con la fecha local actual del punto de grilla.');
  }
  const otherLots = await db.collection('lotes').countDocuments({
    _id: { $ne: lotObjectId },
    idEstablecimiento: new ObjectId(establishmentId),
  }, { session });
  assert(otherLots === 0, 'Piloto abortado: el establecimiento contiene otros lotes; las observaciones son compartidas y no pueden restaurarse aisladamente.');
  const observationScope = {
    establishmentObjectId: new ObjectId(establishmentId),
    ...scopeMetadata,
  };
  const observations = await db.collection('observaciones_meteorologicas').find(
    observationIdentityQuery(observationScope, config),
    { session },
  ).toArray();
  assertObservationOwnership(observations, config.lotId);
  return {
    lotObjectId,
    sowingObjectId,
    establishmentObjectId: new ObjectId(establishmentId),
    seedObjectId: row.idSemilla,
    cronoObjectId: row.idCrono,
    gridPointKey: String(binding.gridPointKey),
    ...scopeMetadata,
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
  assertBridgeScopeMetadata(scope, config);
  const window = era5BridgeWindow(scope, config);
  const daily = await db.collection('weather_daily').find({
    gridPointKey: scope.gridPointKey,
    calculationVersion: ERA5_CALCULATION_VERSION,
    date: { $gte: window.from, $lt: window.toExclusive },
  }, { session }).toArray();
  const expectedDates = dateRange(window.from, window.to);
  const actualDates = daily.map((item) => item.date).sort();
  assert(daily.length === expectedDates.length && JSON.stringify(actualDates) === JSON.stringify(expectedDates),
    `Cobertura ERA5 v2 incompleta: se requieren ${expectedDates.length} dias continuos y hay ${daily.length}.`);
  const ranges = {
    temperatureMinC: [-55, 60],
    temperatureMeanC: [-55, 60],
    temperatureMaxC: [-55, 65],
  };
  for (const item of daily) {
    const expected = numeroFinito(item.hoursExpected, 'hoursExpected', { min: 23, max: 25 });
    const available = numeroFinito(item.hoursAvailable, 'hoursAvailable', { min: 23, max: 25 });
    const temperatures = Object.fromEntries(Object.entries(ranges).map(([key, [min, max]]) => [
      key,
      numeroFinito(item.values?.[key], `values.${key}`, { min, max }),
    ]));
    const plausibleTemperatures = temperatures.temperatureMinC <= temperatures.temperatureMeanC &&
      temperatures.temperatureMeanC <= temperatures.temperatureMaxC;
    const availableTemperatureHours = numeroFinito(
      item.availableHoursByMetric?.temperature,
      'availableHoursByMetric.temperature',
      { min: 23, max: 25 },
    );
    assert([23, 24, 25].includes(expected) && available === expected &&
      item.gridPointKey === scope.gridPointKey && item.calculationVersion === ERA5_CALCULATION_VERSION &&
      item.timezone === scope.gridTimezone && isIanaTimezone(item.timezone) && validateDate(item.date, 'weather_daily.date') &&
      item.date >= window.from && item.date < window.toExclusive && item.date >= config.historicalStart && item.date >= scope.gridPoint.historicalStart &&
      Number.isFinite(new Date(item.calculatedAt).getTime()) &&
      availableTemperatureHours === expected && plausibleTemperatures,
      `Dia ERA5 v2 incompleto o invalido: ${item.date}.`);
  }
}

function collectionQueries(scope, config) {
  const window = era5BridgeWindow(scope, config);
  return {
    siembras: { _id: scope.sowingObjectId },
    lotes: { _id: scope.lotObjectId },
    observaciones_meteorologicas: observationIdentityQuery(scope, config),
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
    weather_daily: { gridPointKey: scope.gridPointKey, calculationVersion: ERA5_CALCULATION_VERSION, date: { $gte: window.from, $lt: window.toExclusive } },
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
    observaciones_meteorologicas: observationIdentityQuery({
      establishmentObjectId: oid(manifest.establishmentId),
      gridTimezone: manifest.gridTimezone,
    }, {
      from: manifest.weatherWindow.from,
      to: manifest.weatherWindow.to,
    }),
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

async function readConsistentScope({ client, db, config, ObjectId, EJSON, now }) {
  await assertRequiredIndexes(db);
  const session = client.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const scope = await resolveScope(db, config, ObjectId, { session, now });
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
  await assertRequiredIndexes(db);
  return result;
}

async function readConsistentState({ client, db, queries, EJSON, revalidation }) {
  assert(revalidation?.manifest && revalidation?.ObjectId,
    'La lectura post-piloto exige revalidar el scope sellado dentro de la transaccion.');
  await assertRequiredIndexes(db);
  const session = client.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const config = manifestOperationConfig(revalidation.manifest);
      const scope = await resolveScope(db, config, revalidation.ObjectId, {
        session,
        now: revalidation.now,
        requireCurrentBridgeDate: false,
      });
      await assertEra5Coverage(db, scope, config, { session });
      const state = await readState(db, queries, EJSON, { session });
      assertObservationOwnership(state.observaciones_meteorologicas.documents, revalidation.manifest.lotId);
      const revalidationProof = createScopeRevalidationProof(
        scope,
        revalidation.manifest,
        EJSON,
        stateSummary(state),
      );
      result = { state, revalidationProof };
    }, {
      readConcern: { level: 'snapshot' }, readPreference: 'primary',
    });
  } finally { await session.endSession(); }
  assert(result, 'No se pudo leer y revalidar el estado sellado consistentemente.');
  await assertRequiredIndexes(db);
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

function buildPlan(config, scope, state, codeSha, EJSON, controls = {}) {
  assert(/^[a-f0-9]{40}$/.test(String(codeSha || '')), 'codeSha debe ser un commit Git SHA-1 completo y canonico.');
  assertOperationalApproval(controls.operationalApproval, config);
  assertRuntimeDependencyIdentity(controls.runtimeIdentity, controls.runtimeIdentity);
  assertBridgeScopeMetadata(scope, config);
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
    seedId: idValue(scope.seedObjectId),
    cronoId: idValue(scope.cronoObjectId),
    sowingDate: scope.sowingDate,
    weatherWindow: { from: config.from, to: config.to },
    gridPointKey: scope.gridPointKey,
    gridTimezone: scope.gridTimezone,
    bridgeConfig: {
      historicalStart: config.historicalStart,
      bridgeToday: config.bridgeToday,
      recentOpenMeteoDays: RECENT_OPEN_METEO_DAYS,
      calculationVersion: ERA5_CALCULATION_VERSION,
      sourceVersion: ERA5_SOURCE_VERSION,
    },
    bridgeScope: {
      lotCoordinates: scope.lotCoordinates,
      binding: scope.binding,
      gridPoint: scope.gridPoint,
    },
    operationalApproval: controls.operationalApproval,
    runtimeIdentity: controls.runtimeIdentity,
    policy: { oneLot: true, exclusiveEstablishment: true, agrometOnly: true, sideEffectsFrozen: true, exactlyOneActiveSowing: true, onConflict: 'abort', restore: 'transactional-compare-and-swap' },
    collections,
  };
  return { ...core, planSha256: sha256(canonicalEjson(core, EJSON)) };
}

function assertCodeIdentity(manifest, currentCodeSha) {
  assert(/^[a-f0-9]{40}$/.test(String(currentCodeSha || '')), 'El codeSha actual no es canonico.');
  assert(manifest?.codeSha === currentCodeSha, 'El codeSha actual no coincide con el codigo sellado en el bundle.');
}

function manifestBridgeScope(manifest) {
  return {
    gridPointKey: manifest.gridPointKey,
    gridTimezone: manifest.gridTimezone,
    lotCoordinates: manifest.bridgeScope?.lotCoordinates,
    binding: manifest.bridgeScope?.binding,
    gridPoint: manifest.bridgeScope?.gridPoint,
  };
}

function manifestBridgeConfig(manifest) {
  return {
    from: manifest.weatherWindow?.from,
    to: manifest.weatherWindow?.to,
    historicalStart: manifest.bridgeConfig?.historicalStart,
    bridgeToday: manifest.bridgeConfig?.bridgeToday,
    lotId: manifest.lotId,
  };
}

function manifestOperationConfig(manifest) {
  return operationConfig({
    operationId: manifest.operationId,
    lotId: manifest.lotId,
    sowingId: manifest.sowingId,
    from: manifest.weatherWindow?.from,
    to: manifest.weatherWindow?.to,
    historicalStart: manifest.bridgeConfig?.historicalStart,
    bridgeToday: manifest.bridgeConfig?.bridgeToday,
  });
}

function scopeDescriptorFromScope(scope) {
  return {
    lotId: idValue(scope.lotObjectId),
    sowingId: idValue(scope.sowingObjectId),
    establishmentId: idValue(scope.establishmentObjectId),
    seedId: idValue(scope.seedObjectId),
    cronoId: idValue(scope.cronoObjectId),
    sowingDate: scope.sowingDate,
    gridPointKey: scope.gridPointKey,
    gridTimezone: scope.gridTimezone,
    bridgeScope: {
      lotCoordinates: scope.lotCoordinates,
      binding: scope.binding,
      gridPoint: scope.gridPoint,
    },
  };
}

function scopeDescriptorFromManifest(manifest) {
  return {
    lotId: manifest.lotId,
    sowingId: manifest.sowingId,
    establishmentId: manifest.establishmentId,
    seedId: manifest.seedId,
    cronoId: manifest.cronoId,
    sowingDate: manifest.sowingDate,
    gridPointKey: manifest.gridPointKey,
    gridTimezone: manifest.gridTimezone,
    bridgeScope: manifest.bridgeScope,
  };
}

function createScopeRevalidationProof(scope, manifest, EJSON, summary) {
  const actual = canonicalEjson(scopeDescriptorFromScope(scope), EJSON);
  const expected = canonicalEjson(scopeDescriptorFromManifest(manifest), EJSON);
  assert(actual === expected,
    'La revalidacion transaccional del lote/siembra/binding no coincide con el manifiesto sellado.');
  const checks = {
    exactLotAndSowing: true,
    exactlyOneActiveSowing: true,
    exclusiveEstablishment: true,
    canonicalObservationContexts: true,
    exactBindingAndGrid: true,
    exactSowingAndReferences: true,
  };
  const proof = {
    schemaVersion: 1,
    manifestSha256: manifest.manifestSha256,
    scopeSha256: sha256(expected),
    stateSummarySha256: hashStateSummary(summary, EJSON),
    checks,
  };
  Object.defineProperty(proof, REVALIDATION_TOKEN, { value: true, enumerable: false });
  return proof;
}

function assertScopeRevalidationProof(proof, manifest, EJSON, requireFresh = false, summary) {
  exactKeys(proof, ['schemaVersion', 'manifestSha256', 'scopeSha256', 'stateSummarySha256', 'checks'], 'prueba de revalidacion');
  exactKeys(proof.checks, [
    'exactLotAndSowing', 'exactlyOneActiveSowing', 'exclusiveEstablishment',
    'canonicalObservationContexts', 'exactBindingAndGrid', 'exactSowingAndReferences',
  ], 'checks de revalidacion');
  assert(proof.schemaVersion === 1 && proof.manifestSha256 === manifest.manifestSha256,
    'La prueba de revalidacion no corresponde al manifiesto.');
  assert(Object.values(proof.checks).every((value) => value === true),
    'La prueba de revalidacion no acredita todos los invariantes del scope.');
  assert(proof.scopeSha256 === sha256(canonicalEjson(scopeDescriptorFromManifest(manifest), EJSON)),
    'La prueba de revalidacion no corresponde al scope sellado.');
  assert(/^[a-f0-9]{64}$/i.test(String(proof.stateSummarySha256 || '')),
    'La prueba de revalidacion no contiene un hash canonico del estado leido.');
  if (summary) assert(proof.stateSummarySha256 === hashStateSummary(summary, EJSON),
    'La prueba de revalidacion no corresponde al resumen post-piloto entregado.');
  if (requireFresh) assert(proof[REVALIDATION_TOKEN] === true,
    'recordPostState exige una prueba fresca generada por la revalidacion transaccional.');
}

function writeJsonExclusive(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', encoding: 'utf8' });
}

function writeBundle(bundleDir, plan, state, EJSON, now = new Date()) {
  bundleDir = assertExternalPath(bundleDir, 'El bundle');
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
  bundleDir = assertExternalPath(bundleDir, 'El bundle');
  const manifestPath = path.join(bundleDir, 'manifest.json');
  assert(fs.existsSync(manifestPath), 'El bundle no contiene manifest.json.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(manifest.schemaVersion === SCHEMA_VERSION, 'Version de manifiesto no soportada.');
  assert(manifest.database === DB_NAME, 'El manifiesto no pertenece a chaman_testing.');
  const expectedManifestHash = manifest.manifestSha256;
  const manifestCore = { ...manifest };
  delete manifestCore.manifestSha256;
  assert(sha256(canonicalEjson(manifestCore, EJSON)) === expectedManifestHash, 'El hash del manifiesto no coincide.');
  assert(/^[a-f0-9]{40}$/.test(String(manifest.codeSha || '')), 'El bundle no contiene un codeSha canonico.');
  const sealedConfig = manifestOperationConfig(manifest);
  assertOperationalApproval(manifest.operationalApproval, sealedConfig);
  assertRuntimeDependencyIdentity(manifest.runtimeIdentity, manifest.runtimeIdentity);
  assert(manifest.bridgeConfig?.calculationVersion === ERA5_CALCULATION_VERSION &&
    manifest.bridgeConfig?.sourceVersion === ERA5_SOURCE_VERSION &&
    manifest.bridgeConfig?.recentOpenMeteoDays === RECENT_OPEN_METEO_DAYS,
    'El bundle no corresponde a las versiones exactas del bridge ERA5 admitidas.');
  assertBridgeScopeMetadata(manifestBridgeScope(manifest), manifestBridgeConfig(manifest));
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
  const loadedState = Object.fromEntries(ALL_COLLECTIONS.map((name) => [name, { documents: documents[name] }]));
  assertObservationOwnership(documents.observaciones_meteorologicas, manifest.lotId);
  assertNoSecrets(loadedState);
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

function assertReferencesEqual(actual, expected, label) {
  for (const name of REFERENCE_COLLECTIONS) {
    const left = actual[name];
    const right = expected[name];
    assert(left && right && left.count === right.count && left.sha256 === right.sha256 && JSON.stringify(left.ids) === JSON.stringify(right.ids),
      `${label}: referencia ${name} cambio.`);
  }
}

function recordPostState(bundleDir, manifest, summary, EJSON, revalidationProof, now = new Date()) {
  bundleDir = assertExternalPath(bundleDir, 'El bundle');
  assertScopeRevalidationProof(revalidationProof, manifest, EJSON, true, summary);
  assertReferencesEqual(summary, manifest.collections, 'estado post-piloto');
  const core = {
    schemaVersion: SCHEMA_VERSION,
    operationId: manifest.operationId,
    manifestSha256: manifest.manifestSha256,
    recordedAt: now.toISOString(),
    database: DB_NAME,
    revalidationProof,
    collections: summary,
  };
  const record = { ...core, postStateSha256: sha256(canonicalEjson(core, EJSON)) };
  writeJsonExclusive(path.join(bundleDir, 'post-state.json'), record);
  return record;
}

function loadPostState(bundleDir, manifest, EJSON) {
  bundleDir = assertExternalPath(bundleDir, 'El bundle');
  const filePath = path.join(bundleDir, 'post-state.json');
  assert(fs.existsSync(filePath), 'Falta post-state.json; ejecute verify --record-post-state inmediatamente despues del piloto.');
  const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert(record.operationId === manifest.operationId && record.manifestSha256 === manifest.manifestSha256 && record.database === DB_NAME, 'post-state.json no corresponde al bundle.');
  assertScopeRevalidationProof(record.revalidationProof, manifest, EJSON, false, record.collections);
  const core = { ...record };
  delete core.postStateSha256;
  assert(sha256(canonicalEjson(core, EJSON)) === record.postStateSha256, 'Hash invalido en post-state.json.');
  return record;
}

async function restoreBundle({ client, db, bundle, ObjectId, EJSON, confirmation, bundleDir, currentCodeSha, now }) {
  assertCodeIdentity(bundle.manifest, currentCodeSha);
  const postState = loadPostState(bundleDir, bundle.manifest, EJSON);
  const queries = sealedQueries(bundle.manifest, ObjectId, postState);
  await assertRequiredIndexes(db);
  assert(confirmation === confirmationForRestore(bundle.manifest, postState.postStateSha256), 'Confirmacion de restore ausente o incorrecta.');
  const session = client.startSession();
  let outcome = 'restored';
  try {
    await session.withTransaction(async () => {
      const config = manifestOperationConfig(bundle.manifest);
      const scope = await resolveScope(db, config, ObjectId, {
        session,
        now,
        requireCurrentBridgeDate: false,
      });
      const currentScopeProof = createScopeRevalidationProof(
        scope,
        bundle.manifest,
        EJSON,
        postState.collections,
      );
      assertScopeRevalidationProof(currentScopeProof, bundle.manifest, EJSON, true);
      assert(canonicalEjson(currentScopeProof, EJSON) === canonicalEjson(postState.revalidationProof, EJSON),
        'El scope revalidado durante restore no coincide con la prueba post-piloto sellada.');
      await assertEra5Coverage(db, scope, config, { session });
      const current = await readState(db, queries, EJSON, { session });
      assertObservationOwnership(current.observaciones_meteorologicas.documents, bundle.manifest.lotId);
      const currentSummary = stateSummary(current);
      try {
        assertSummaryEqual(currentSummary, bundle.manifest.collections, 'estado actual');
        outcome = 'already_restored';
        return;
      } catch {
        assertSummaryEqual(currentSummary, postState.collections, 'estado post-piloto');
      }
      assertReferencesEqual(currentSummary, bundle.manifest.collections, 'restore abortado');
      for (const name of MUTABLE_COLLECTIONS) {
        await db.collection(name).deleteMany(queries[name], { session });
        if (bundle.documents[name].length) {
          await db.collection(name).insertMany(bundle.documents[name], { ordered: true, session });
        }
      }
      const restored = await readState(db, queries, EJSON, { session });
      assertSummaryEqual(stateSummary(restored), bundle.manifest.collections, 'verificacion transaccional del restore');
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
    });
  } finally {
    await session.endSession();
  }
  try {
    await assertRequiredIndexes(db);
  } catch (error) {
    return {
      status: outcome === 'restored' ? 'restored_but_index_postcheck_failed' : 'already_restored_but_index_postcheck_failed',
      restoreStatus: outcome,
      databaseMutationCommitted: outcome === 'restored',
      indexPostcheck: 'failed',
      postcheckError: error.message,
    };
  }
  return {
    status: outcome,
    databaseMutationCommitted: outcome === 'restored',
    indexPostcheck: 'passed',
  };
}

module.exports = {
  ALL_COLLECTIONS,
  DB_NAME,
  ERA5_CALCULATION_VERSION,
  MUTABLE_COLLECTIONS,
  REFERENCE_COLLECTIONS,
  SAFETY_ATTESTATION,
  assertBridgeScopeMetadata,
  assertCodeIdentity,
  assertExternalPath,
  assertNoSecrets,
  assertObservationOwnership,
  assertEra5Coverage,
  assertOperationalApproval,
  assertOperationalApprovalMatchesManifest,
  assertRequiredIndexes,
  assertRuntimeDependencyIdentity,
  assertSafetyAttestation,
  assertScopeRevalidationProof,
  assertSummaryEqual,
  assertTestingOnly,
  buildPlan,
  canonicalEjson,
  collectionQueries,
  confirmationForRestore,
  confirmationForSnapshot,
  contextLotIds,
  criticalPilotConfig,
  hashStateSummary,
  isIanaTimezone,
  loadBundle,
  loadAttestationFile,
  loadPostState,
  manifestBridgeConfig,
  manifestBridgeScope,
  manifestOperationConfig,
  numeroFinito,
  observationIdentityQuery,
  operationConfig,
  readConsistentScope,
  readConsistentState,
  readState,
  recordPostState,
  resolveScope,
  restoreBundle,
  runtimeDependencyIdentity,
  scanSecrets,
  sealedQueries,
  sha256,
  stateSummary,
  summarizeDocuments,
  testingClusterFingerprint,
  writeBundle,
};
