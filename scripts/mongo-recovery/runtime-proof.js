const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { mongoEndpointFingerprint } = require('./lib');
const { verifyRestrictedDirectory, verifyRestrictedFile } = require('./secure-config');

const KIND = 'chaman-local-mongo-runtime-proof';
const SHA256 = /^[0-9a-f]{64}$/i;
const CURRENT_SCHEMA_VERSION = 2;
const RUNTIME_PURPOSES = new Set(['operation', 'cleanup']);

function fail(message) {
  throw new Error(message);
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`Falta ${label}.`);
  return value.trim();
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} debe ser un objeto.`);
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !(key in value));
  if (extras.length || missing.length) fail(`${label} contiene campos inesperados o faltantes.`);
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function hashDbPath(dbPath, platform = process.platform) {
  const identity = platform === 'win32' ? String(dbPath).toLowerCase() : String(dbPath);
  return sha256Text(identity);
}

function parseUriEndpoints(uri) {
  const match = String(uri).match(/^mongodb:\/\/([^/]+)\//i);
  if (!match) fail('El destino local debe usar mongodb://, no SRV.');
  const authority = match[1].slice(match[1].lastIndexOf('@') + 1);
  const endpoints = authority.split(',').map((item) => item.trim()).filter(Boolean);
  if (endpoints.length !== 1) fail('El destino local debe declarar exactamente un endpoint loopback.');
  let host;
  let port;
  if (endpoints[0].startsWith('[')) {
    const closing = endpoints[0].indexOf(']');
    if (closing < 0) fail('Endpoint IPv6 local invalido.');
    host = endpoints[0].slice(1, closing).toLowerCase();
    const suffix = endpoints[0].slice(closing + 1);
    port = suffix ? Number(suffix.replace(/^:/, '')) : 27017;
  } else {
    const separator = endpoints[0].lastIndexOf(':');
    const hasPort = separator > -1 && endpoints[0].indexOf(':') === separator;
    host = (hasPort ? endpoints[0].slice(0, separator) : endpoints[0]).toLowerCase().replace(/\.$/, '');
    port = hasPort ? Number(endpoints[0].slice(separator + 1)) : 27017;
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    fail('El destino local debe usar exclusivamente loopback.');
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535) fail('Puerto URI local invalido.');
  return { host, port, endpointCount: 1 };
}

function normalizeBindIps(value) {
  const entries = Array.isArray(value) ? value : String(value || '').split(',');
  const result = entries.map((item) => String(item).trim().toLowerCase()).filter(Boolean).sort();
  if (!result.length || result.some((item) => !['127.0.0.1', 'localhost', '::1'].includes(item))) {
    fail('Mongo local no esta ligado exclusivamente a loopback.');
  }
  return [...new Set(result)];
}

function normalizeMembers(value, label) {
  if (!Array.isArray(value)) fail(`${label} debe ser una lista.`);
  return value.map((item) => text(item, label).toLowerCase()).sort();
}

function normalizeMongoProcess(value) {
  const executable = text(value, 'serverStatus.process')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .toLowerCase();
  if (!['mongod', 'mongod.exe'].includes(executable)) {
    fail('serverStatus.process no acredita un proceso mongod.');
  }
  return 'mongod';
}

function assertDbPath(dbPathValue, expectedRoot) {
  const dbPathInput = path.resolve(text(dbPathValue, 'commandLine.storage.dbPath'));
  const rootInput = path.resolve(text(expectedRoot, 'expected-dbpath-root'));
  if (!fs.existsSync(dbPathInput) || !fs.statSync(dbPathInput).isDirectory() ||
      !fs.existsSync(rootInput) || !fs.statSync(rootInput).isDirectory()) {
    fail('dbPath y expected-dbpath-root deben existir como directorios.');
  }
  const dbPath = fs.realpathSync(dbPathInput);
  const root = fs.realpathSync(rootInput);
  if (!/(^|[\\/])chaman-recovery-drill([\\/]|$)/i.test(root)) {
    fail('expected-dbpath-root debe estar dentro de un directorio chaman-recovery-drill dedicado.');
  }
  const relative = path.relative(root, dbPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('dbPath runtime debe ser un subdirectorio del root descartable esperado.');
  }
  if (dbPath === path.parse(dbPath).root) fail('dbPath no puede ser la raiz del volumen.');
  return { dbPath, dbPathSha256: hashDbPath(dbPath) };
}

function assertRuntimePurpose(purpose) {
  if (!RUNTIME_PURPOSES.has(purpose)) fail('Proposito de runtime proof invalido.');
  return purpose;
}

function assertTtlMonitorState(value, purpose) {
  if (typeof value !== 'boolean') fail('getParameter.ttlMonitorEnabled debe ser booleano.');
  if (purpose !== 'cleanup' && value !== false) {
    fail('El monitor TTL debe estar deshabilitado para preservar la fotografia restaurada.');
  }
  return value;
}

function buildRuntimeProof(raw, {
  uri,
  expectedDbPathRoot,
  now = new Date(),
  purpose = 'operation',
}) {
  assertRuntimePurpose(purpose);
  if (!raw || typeof raw !== 'object' || raw.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    fail('Respuesta runtime de mongosh invalida.');
  }
  const uriEndpoint = parseUriEndpoints(uri);
  const database = text(raw.database, 'database');
  if (!database.startsWith('chaman_restore_drill_')) fail('Runtime proof exige una base descartable.');
  const capturedAt = new Date(raw.capturedAt);
  if (!Number.isFinite(capturedAt.getTime()) || Math.abs(now - capturedAt) > 2 * 60 * 1000) {
    fail('La captura runtime no es reciente.');
  }
  const replicaSet = text(raw.hello?.setName, 'hello.setName');
  if (raw.hello?.isWritablePrimary !== true) fail('Mongo local no es primary escribible.');
  const me = text(raw.hello?.me, 'hello.me').toLowerCase();
  const primary = text(raw.hello?.primary, 'hello.primary').toLowerCase();
  if (me !== primary || !/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(me)) {
    fail('hello no acredita un primary loopback unico.');
  }
  const members = normalizeMembers(raw.hello?.hosts, 'hello.hosts');
  const passives = normalizeMembers(raw.hello?.passives, 'hello.passives');
  const arbiters = normalizeMembers(raw.hello?.arbiters, 'hello.arbiters');
  if (members.length !== 1 || members[0] !== me || passives.length || arbiters.length) {
    fail('hello no acredita un replica set local de un solo nodo.');
  }
  const replSetName = raw.commandLine?.replication?.replSetName;
  const replSet = raw.commandLine?.replication?.replSet;
  if (replSetName != null && replSet != null && String(replSetName).trim() !== String(replSet).trim()) {
    fail('getCmdLineOpts informa nombres de replica set contradictorios.');
  }
  const configuredReplicaSet = text(
    replSetName ?? replSet,
    'commandLine.replication.replSetName/replSet',
  );
  if (configuredReplicaSet !== replicaSet) fail('Replica set runtime no coincide con getCmdLineOpts.');
  const bindIps = normalizeBindIps(raw.commandLine?.net?.bindIp);
  const port = Number(raw.commandLine?.net?.port ?? 27017);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) fail('Puerto runtime local invalido.');
  if (port !== uriEndpoint.port || !me.endsWith(`:${port}`)) fail('Puerto URI, hello y getCmdLineOpts no coinciden.');
  const processId = Number(raw.serverStatus?.pid);
  if (!Number.isSafeInteger(processId) || processId < 1) fail('serverStatus.pid invalido.');
  normalizeMongoProcess(raw.serverStatus?.process);
  const mongoVersion = text(raw.buildInfo?.version, 'buildInfo.version');
  const ttlMonitorEnabled = assertTtlMonitorState(raw.getParameter?.ttlMonitorEnabled, purpose);
  const { dbPath, dbPathSha256 } = assertDbPath(raw.commandLine?.storage?.dbPath, expectedDbPathRoot);
  const endpointFingerprintSha256 = mongoEndpointFingerprint(uri).endpointFingerprintSha256;
  const stable = { endpointFingerprintSha256, replicaSet, dbPathSha256 };
  const instanceId = `local-mongodb:${sha256Text(JSON.stringify(stable))}`;
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: KIND,
    database,
    collectedAt: capturedAt.toISOString(),
    expiresAt: new Date(capturedAt.getTime() + 10 * 60 * 1000).toISOString(),
    endpoint: { loopbackOnly: true, bindIps, port, endpointFingerprintSha256 },
    mongo: {
      version: mongoVersion,
      process: 'mongod',
      replicaSet,
      members,
      dbPath,
      dbPathSha256,
      processId,
      writablePrimary: true,
    },
    getParameter: { ttlMonitorEnabled },
    commands: { hello: true, buildInfo: true, getCmdLineOpts: true, serverStatus: true, getParameter: true },
    instanceId,
  };
}

function validateRuntimeProof(value, {
  now = new Date(),
  allowExpired = false,
  expectedDatabase,
  purpose = 'operation',
} = {}) {
  assertRuntimePurpose(purpose);
  if (!value || typeof value !== 'object' || ![1, CURRENT_SCHEMA_VERSION].includes(value.schemaVersion) || value.kind !== KIND) {
    fail('Formato de runtime proof no soportado.');
  }
  const legacyV1 = value.schemaVersion === 1;
  if (legacyV1 && purpose !== 'cleanup') {
    fail('Runtime proof schema v1 solo se admite para cleanup seguro de intentos antiguos.');
  }
  const allowed = [
    'schemaVersion', 'kind', 'database', 'collectedAt', 'expiresAt', 'endpoint', 'mongo',
    ...(legacyV1 ? [] : ['getParameter']),
    'commands', 'instanceId',
  ];
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !(key in value));
  if (extras.length || missing.length) fail('Runtime proof contiene campos inesperados o faltantes.');
  exactKeys(value.endpoint, ['loopbackOnly', 'bindIps', 'port', 'endpointFingerprintSha256'], 'runtime.endpoint');
  exactKeys(
    value.mongo,
    ['version', 'process', 'replicaSet', 'members', 'dbPath', 'dbPathSha256', 'processId', 'writablePrimary'],
    'runtime.mongo',
  );
  if (!legacyV1) exactKeys(value.getParameter, ['ttlMonitorEnabled'], 'runtime.getParameter');
  exactKeys(
    value.commands,
    legacyV1
      ? ['hello', 'buildInfo', 'getCmdLineOpts', 'serverStatus']
      : ['hello', 'buildInfo', 'getCmdLineOpts', 'serverStatus', 'getParameter'],
    'runtime.commands',
  );
  const database = text(value.database, 'database');
  if (!database.startsWith('chaman_restore_drill_')) fail('Runtime proof no refiere una base descartable.');
  if (expectedDatabase && database !== expectedDatabase) fail('Runtime proof refiere otra base descartable.');
  const collectedAt = new Date(value.collectedAt);
  const expiresAt = new Date(value.expiresAt);
  if (!Number.isFinite(collectedAt.getTime()) || !Number.isFinite(expiresAt.getTime()) ||
      expiresAt - collectedAt !== 10 * 60 * 1000) fail('Ventana runtime proof invalida.');
  if (!allowExpired && (now < collectedAt || now >= expiresAt)) fail('Runtime proof no esta vigente.');
  if (value.endpoint?.loopbackOnly !== true) fail('Runtime proof no garantiza loopback.');
  if (!Array.isArray(value.endpoint.bindIps)) fail('runtime.endpoint.bindIps debe ser una lista.');
  normalizeBindIps(value.endpoint.bindIps);
  if (!Number.isInteger(value.endpoint.port) || value.endpoint.port < 1024 || value.endpoint.port > 65535) {
    fail('Puerto del runtime proof invalido.');
  }
  const endpointFingerprintSha256 = text(value.endpoint.endpointFingerprintSha256, 'endpoint fingerprint').toLowerCase();
  const dbPathSha256 = text(value.mongo?.dbPathSha256, 'dbPathSha256').toLowerCase();
  if (!SHA256.test(endpointFingerprintSha256) || !SHA256.test(dbPathSha256)) fail('Hash runtime invalido.');
  const dbPath = path.resolve(text(value.mongo?.dbPath, 'mongo.dbPath'));
  if (!fs.existsSync(dbPath) || !fs.statSync(dbPath).isDirectory()) fail('dbPath del runtime proof ya no existe.');
  const realDbPath = fs.realpathSync(dbPath);
  if (!path.isAbsolute(realDbPath) || !/(^|[\\/])chaman-recovery-drill([\\/]|$)/i.test(realDbPath)) {
    fail('dbPath del runtime proof no es un directorio descartable permitido.');
  }
  if (hashDbPath(realDbPath) !== dbPathSha256) fail('dbPathSha256 no coincide con dbPath.');
  const replicaSet = text(value.mongo?.replicaSet, 'replicaSet');
  const members = normalizeMembers(value.mongo?.members, 'mongo.members');
  if (
    members.length !== 1 ||
    !/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(members[0]) ||
    !members[0].endsWith(`:${value.endpoint.port}`)
  ) {
    fail('Runtime proof no acredita un replica set loopback de un solo nodo.');
  }
  if (!Number.isSafeInteger(value.mongo?.processId) || value.mongo.processId < 1) fail('processId runtime invalido.');
  if (value.mongo?.process !== 'mongod') fail('Runtime proof no corresponde a un proceso mongod.');
  if (value.mongo?.writablePrimary !== true) fail('Runtime proof no corresponde a primary escribible.');
  const requiredCommands = ['hello', 'buildInfo', 'getCmdLineOpts', 'serverStatus'];
  if (!legacyV1) requiredCommands.push('getParameter');
  for (const command of requiredCommands) {
    if (value.commands?.[command] !== true) fail(`Falta evidencia del comando ${command}.`);
  }
  const ttlMonitorEnabled = legacyV1
    ? null
    : assertTtlMonitorState(value.getParameter?.ttlMonitorEnabled, purpose);
  const expectedInstanceId = `local-mongodb:${sha256Text(JSON.stringify({ endpointFingerprintSha256, replicaSet, dbPathSha256 }))}`;
  if (String(value.instanceId).toLowerCase() !== expectedInstanceId) fail('instanceId runtime no coincide con sus campos estables.');
  return { database, collectedAt, expiresAt, endpointFingerprintSha256, replicaSet, dbPathSha256,
    instanceId: expectedInstanceId, processId: value.mongo.processId, mongoVersion: text(value.mongo.version, 'mongo.version'),
    schemaVersion: value.schemaVersion, ttlMonitorEnabled };
}

function loadRuntimeProof(filePath, options = {}) {
  if (!filePath) fail('Falta --runtime-proof.');
  const resolved = path.resolve(filePath);
  verifyRestrictedDirectory(path.dirname(resolved));
  verifyRestrictedFile(resolved);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    fail(`Runtime proof invalido: ${error.message}`);
  }
  return { path: resolved, sha256: sha256File(resolved), value, validated: validateRuntimeProof(value, options) };
}

function assertRuntimeProofMatchesEvidence(proof, target, { requireSealedHash = true } = {}) {
  if (requireSealedHash && proof.sha256.toLowerCase() !== target.runtimeProofSha256.toLowerCase()) {
    fail('Runtime proof no coincide con el hash sellado en infraestructura.');
  }
  for (const key of ['instanceId', 'endpointFingerprintSha256', 'replicaSet', 'dbPathSha256']) {
    if (String(proof.validated[key]).toLowerCase() !== String(target[key]).toLowerCase()) {
      fail(`Runtime proof no coincide con target.${key}.`);
    }
  }
}

module.exports = {
  KIND,
  assertRuntimeProofMatchesEvidence,
  buildRuntimeProof,
  hashDbPath,
  loadRuntimeProof,
  parseUriEndpoints,
  sha256File,
  validateRuntimeProof,
};
