const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  PRODUCTION_MODE,
  TESTING_LOCAL_MODE,
  assertNoSecrets,
  assertDestinationIsolated,
  assertRuntimeIdentity,
  buildBackupManifest,
  compareInventories,
  databaseFromMongoUri,
  expectedConfirmation,
  mongoEndpointFingerprint,
  safeArtifactDirectory,
  summarizeSeedResolution,
  validateBackupManifest,
  validateSourceAttestation,
  validateTargetAttestation,
} = require('../mongo-recovery/lib');
const {
  assertNoMongoUriEnvironment,
  assertMongoToolsConfigVersion,
  buildMongodumpArgs,
  buildMongorestoreArgs,
  buildMongoshArgs,
  hardenRestrictedDirectory,
  hardenRestrictedFile,
  safeChildEnv,
  verifyRestrictedDirectory,
  verifyRestrictedFile,
  withMongoSecretFile,
} = require('../mongo-recovery/secure-config');
const {
  bindAttestationToEvidence,
  deriveRailwayAsset,
  validateInfrastructureEvidence,
} = require('../mongo-recovery/infrastructure-evidence');
const {
  buildRuntimeProof,
  hashDbPath,
  validateRuntimeProof,
} = require('../mongo-recovery/runtime-proof');
const { collectRailwayEvidence } = require('../mongo-recovery/railway-collector');
const {
  assertCleanupReceiptBindings,
  assertDropConfirmed,
  assertSameRuntimeForCleanup,
} = require('../mongo-recovery');

const NOW = new Date('2026-08-28T18:00:00.000Z');
const SOURCE_URI = 'mongodb://prod.example.invalid:27017/chaman';
const TARGET_URI = 'mongodb://restore.example.invalid:27018/chaman_restore_drill_20260828_1800';
const EVIDENCE_HASH = 'a'.repeat(64);
const SOURCE_SERVICE = '11111111-1111-4111-8111-111111111111';
const TARGET_SERVICE = '22222222-2222-4222-8222-222222222222';
const LOCAL_URI = 'mongodb://127.0.0.1:27019/chaman_restore_drill_20260828_1800?replicaSet=chamanDrill';
const TESTING_SOURCE_URI = 'mongodb://testing.example.invalid:27017/chaman_testing';

function identity(provider, instanceId, uri) {
  return {
    provider,
    instanceId,
    endpointFingerprintSha256: mongoEndpointFingerprint(uri).endpointFingerprintSha256,
  };
}

function sourceAttestation(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: 'chaman-mongo-write-freeze-attestation',
    attestationId: 'backup_20260828_1800',
    drillMode: PRODUCTION_MODE,
    sourceEnvironment: 'production',
    database: 'chaman',
    writesFrozen: true,
    freezeControls: {
      apiWritesDisabled: true,
      backgroundWorkersStopped: true,
      scheduledJobsDisabled: true,
      operatorWritesBlocked: true,
      activeWritersVerifiedZero: true,
    },
    frozenAt: '2026-08-28T17:55:00.000Z',
    verifiedAt: '2026-08-28T17:59:00.000Z',
    expiresAt: '2026-08-28T18:30:00.000Z',
    operator: 'operador-a',
    approvedBy: 'responsable-b',
    changeTicket: 'CHAMAN-RECOVERY-2026-08-28',
    infrastructureEvidenceSha256: EVIDENCE_HASH,
    instanceIdentity: identity('railway', SOURCE_SERVICE, SOURCE_URI),
    ...overrides,
  };
}

function targetAttestation(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: 'chaman-mongo-disposable-target-attestation',
    drillId: 'backup_20260828_1800',
    drillMode: PRODUCTION_MODE,
    environment: 'recovery-drill',
    database: 'chaman_restore_drill_20260828_1800',
    disposable: true,
    dedicatedInstance: true,
    initiallyEmptyExpected: true,
    productionTrafficBlocked: true,
    externalIntegrationsDisabled: true,
    cleanupApproved: true,
    expiresAt: '2026-08-29T18:00:00.000Z',
    operator: 'operador-a',
    approvedBy: 'responsable-b',
    changeTicket: 'CHAMAN-RECOVERY-2026-08-28',
    infrastructureEvidenceSha256: EVIDENCE_HASH,
    instanceIdentity: identity('railway', TARGET_SERVICE, TARGET_URI),
    ...overrides,
  };
}

function writeEvidence(directory) {
  fs.mkdirSync(directory, { recursive: true });
  hardenRestrictedDirectory(directory);
  const projectId = '33333333-3333-4333-8333-333333333333';
  const sourceEnvironmentId = '44444444-4444-4444-8444-444444444444';
  const targetEnvironmentId = '77777777-7777-4777-8777-777777777777';
  const sourceVolume = '55555555-5555-4555-8555-555555555555';
  const targetVolume = '88888888-8888-4888-8888-888888888888';
  const status = (environmentId, environmentName, serviceId, volumeId) => ({
    id: projectId,
    name: 'CHAMAN2026',
    environments: [{
      id: environmentId,
      name: environmentName,
      services: [{ id: serviceId, name: 'MongoDB' }],
      volumes: [{ id: volumeId, name: 'mongo-data', serviceId }],
    }],
  });
  const sourceRaw = status(sourceEnvironmentId, 'production', SOURCE_SERVICE, sourceVolume);
  const targetRaw = status(targetEnvironmentId, 'recovery-drill', TARGET_SERVICE, targetVolume);
  const sourceRawFile = path.join(directory, 'railway-status-source.raw.json');
  const targetRawFile = path.join(directory, 'railway-status-target.raw.json');
  fs.writeFileSync(sourceRawFile, JSON.stringify(sourceRaw));
  fs.writeFileSync(targetRawFile, JSON.stringify(targetRaw));
  hardenRestrictedFile(sourceRawFile);
  hardenRestrictedFile(targetRawFile);
  const sourceGraph = deriveRailwayAsset(sourceRaw, { projectId, environment: 'production', service: 'MongoDB' });
  const targetGraph = deriveRailwayAsset(targetRaw, { projectId, environment: 'recovery-drill', service: 'MongoDB' });
  const digest = (filePath) => require('node:crypto').createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  const commandDigest = (environment) => require('node:crypto').createHash('sha256')
    .update(`${JSON.stringify(['railway', 'status', '--project', projectId, '--environment', environment, '--json'])}\n`)
    .digest('hex');
  const file = path.join(directory, 'railway-evidence.json');
  const evidence = {
    schemaVersion: 2, kind: 'chaman-mongo-infrastructure-evidence', evidenceId: 'evidence_20260828',
    drillMode: PRODUCTION_MODE,
    collection: { method: 'railway-cli-status-json', projectId, railwayCliVersion: 'railway 5.26.1', readOnly: true,
      rawCaptures: [
        { environmentSelector: 'production', file: path.basename(sourceRawFile), sha256: digest(sourceRawFile), commandSha256: commandDigest('production') },
        { environmentSelector: 'recovery-drill', file: path.basename(targetRawFile), sha256: digest(targetRawFile), commandSha256: commandDigest('recovery-drill') },
      ] },
    collectedAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    source: { provider: 'railway', environmentId: sourceGraph.environmentId, environmentName: sourceGraph.environmentName,
      serviceId: sourceGraph.serviceId, serviceName: sourceGraph.serviceName, volumeIds: sourceGraph.volumeIds,
      graphSha256: sourceGraph.graphSha256 },
    target: { provider: 'railway', environmentId: targetGraph.environmentId, environmentName: targetGraph.environmentName,
      serviceId: targetGraph.serviceId, serviceName: targetGraph.serviceName, volumeIds: targetGraph.volumeIds,
      graphSha256: targetGraph.graphSha256 },
    collector: 'operador-a', reviewedBy: 'responsable-b',
  };
  fs.writeFileSync(file, JSON.stringify(evidence));
  hardenRestrictedFile(file);
  return { file, sha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex'), evidence };
}

function writeTestingEvidence(directory) {
  fs.mkdirSync(directory, { recursive: true });
  hardenRestrictedDirectory(directory);
  const projectId = '33333333-3333-4333-8333-333333333333';
  const environmentId = '44444444-4444-4444-8444-444444444444';
  const volumeId = '55555555-5555-4555-8555-555555555555';
  const raw = {
    id: projectId,
    name: 'CHAMAN2026',
    environments: [{
      id: environmentId,
      name: 'Testing',
      services: [{ id: SOURCE_SERVICE, name: 'MongoDB' }],
      volumes: [{ id: volumeId, name: 'mongo-data', serviceId: SOURCE_SERVICE }],
    }],
  };
  const rawFile = path.join(directory, 'railway-status-source.raw.json');
  fs.writeFileSync(rawFile, JSON.stringify(raw));
  hardenRestrictedFile(rawFile);
  const localRoot = path.join(directory, 'chaman-recovery-drill', 'testing-evidence');
  const dbPath = path.join(localRoot, 'data');
  fs.mkdirSync(dbPath, { recursive: true });
  const proof = buildRuntimeProof(localRuntimeRaw(dbPath, new Date().toISOString()), {
    uri: LOCAL_URI,
    expectedDbPathRoot: localRoot,
  });
  const proofFile = path.join(directory, 'runtime-proof.json');
  fs.writeFileSync(proofFile, `${JSON.stringify(proof)}\n`);
  hardenRestrictedFile(proofFile);
  const digest = (filePath) => require('node:crypto').createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  const commandSha256 = require('node:crypto').createHash('sha256')
    .update(`${JSON.stringify(['railway', 'status', '--project', projectId, '--environment', 'Testing', '--json'])}\n`)
    .digest('hex');
  const sourceGraph = deriveRailwayAsset(raw, { projectId, environment: 'Testing', service: 'MongoDB' });
  const now = Date.now();
  const evidence = {
    schemaVersion: 2,
    kind: 'chaman-mongo-infrastructure-evidence',
    evidenceId: 'testing_evidence_20260828',
    drillMode: TESTING_LOCAL_MODE,
    collection: {
      method: 'railway-cli-status-json', projectId, railwayCliVersion: 'railway 5.26.1', readOnly: true,
      rawCaptures: [{
        environmentSelector: 'Testing', file: path.basename(rawFile), sha256: digest(rawFile), commandSha256,
      }],
    },
    collectedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 60 * 60_000).toISOString(),
    source: {
      provider: 'railway', environmentId: sourceGraph.environmentId, environmentName: sourceGraph.environmentName,
      serviceId: sourceGraph.serviceId, serviceName: sourceGraph.serviceName, volumeIds: sourceGraph.volumeIds,
      graphSha256: sourceGraph.graphSha256,
    },
    target: {
      provider: 'local-mongodb', instanceId: proof.instanceId,
      endpointFingerprintSha256: proof.endpoint.endpointFingerprintSha256,
      runtimeProofSha256: digest(proofFile), replicaSet: proof.mongo.replicaSet,
      dbPathSha256: proof.mongo.dbPathSha256,
    },
    collector: 'operador-a',
    reviewedBy: 'responsable-b',
  };
  const file = path.join(directory, 'railway-evidence.json');
  fs.writeFileSync(file, JSON.stringify(evidence));
  hardenRestrictedFile(file);
  return { file, sha256: digest(file), evidence };
}

function writeUriFile(directory, uri, name = 'mongo-uri.txt') {
  hardenRestrictedDirectory(directory);
  const file = path.join(directory, name);
  fs.writeFileSync(file, uri, { flag: 'wx' });
  hardenRestrictedFile(file);
  return file;
}

function inventory(database = 'chaman') {
  return {
    schemaVersion: 1,
    database,
    serverVersion: '8.0.4',
    capturedAt: '2026-08-28T18:01:00.000Z',
    collections: [
      {
        name: 'lotes',
        type: 'collection',
        options: { validationAction: 'error' },
        count: 51,
        indexes: [
          { name: '_id_', key: { _id: 1 } },
          { name: 'tenant_name', key: { idProductor: 1, nombre: 1 }, unique: true },
        ],
      },
      {
        name: 'siembras',
        type: 'collection',
        options: {},
        count: 51,
        indexes: [{ name: '_id_', key: { _id: 1 } }],
      },
    ],
  };
}

function localRuntimeRaw(dbPath, capturedAt = NOW.toISOString()) {
  return {
    schemaVersion: 1,
    database: 'chaman_restore_drill_20260828_1800',
    capturedAt,
    hello: {
      setName: 'chamanDrill',
      me: '127.0.0.1:27019',
      primary: '127.0.0.1:27019',
      hosts: ['127.0.0.1:27019'],
      passives: [],
      arbiters: [],
      isWritablePrimary: true,
    },
    buildInfo: { version: '8.0.29' },
    commandLine: {
      net: { bindIp: '127.0.0.1', port: 27019 },
      replication: { replSetName: 'chamanDrill' },
      storage: { dbPath },
    },
    serverStatus: { process: 'mongod', pid: 4242 },
  };
}

test('acepta solo un congelamiento productivo completo, vigente y corto', () => {
  const result = validateSourceAttestation(sourceAttestation(), { now: NOW });
  assert.equal(result.database, 'chaman');
  assert.throws(
    () =>
      validateSourceAttestation(
        sourceAttestation({
          freezeControls: { ...sourceAttestation().freezeControls, backgroundWorkersStopped: false },
        }),
        { now: NOW },
      ),
    /backgroundWorkersStopped/,
  );
  assert.throws(
    () => validateSourceAttestation(sourceAttestation(), { now: new Date('2026-08-28T18:31:00Z') }),
    /no esta vigente/,
  );
});

test('destino exige instancia dedicada, descartable y nombre imposible de confundir con produccion', () => {
  assert.equal(validateTargetAttestation(targetAttestation(), { now: NOW }).database, 'chaman_restore_drill_20260828_1800');
  assert.throws(
    () => validateTargetAttestation(targetAttestation({ database: 'chaman' }), { now: NOW }),
    /debe comenzar/,
  );
  assert.throws(
    () => validateTargetAttestation(targetAttestation({ dedicatedInstance: false }), { now: NOW }),
    /dedicatedInstance/,
  );
});

test('atestaciones no admiten campos extra capaces de relajar controles', () => {
  assert.throws(
    () => validateSourceAttestation(sourceAttestation({ allowLiveWrites: true }), { now: NOW }),
    /campos no permitidos/,
  );
  assert.throws(
    () => validateTargetAttestation(targetAttestation({ allowProduction: true }), { now: NOW }),
    /campos no permitidos/,
  );
});

test('URI debe fijar base y nunca se confunde confirmacion de dump, restore y cleanup', () => {
  assert.equal(databaseFromMongoUri('mongodb://example.invalid:27017/chaman?authSource=admin'), 'chaman');
  assert.equal(databaseFromMongoUri('mongodb+srv://example.invalid/chaman_restore_drill_x1'), 'chaman_restore_drill_x1');
  assert.throws(() => databaseFromMongoUri('mongodb://example.invalid'), /fijar explicitamente/);
  assert.equal(expectedConfirmation('dump', 'run_12345678', 'chaman'), 'dump:run_12345678:chaman');
  assert.equal(
    expectedConfirmation('restore', 'run_12345678', 'chaman_restore_drill_x1'),
    'restore:run_12345678:chaman_restore_drill_x1',
  );
});

test('fingerprint normaliza host, puerto y orden, pero distingue Produccion de restore', () => {
  const first = mongoEndpointFingerprint('mongodb://B.example.invalid,a.example.invalid.:27017/chaman');
  const normalized = mongoEndpointFingerprint('mongodb://a.example.invalid:27017,b.example.invalid:27017/otra');
  assert.equal(first.endpointFingerprintSha256, normalized.endpointFingerprintSha256);
  assert.notEqual(first.endpointFingerprintSha256, mongoEndpointFingerprint(TARGET_URI).endpointFingerprintSha256);
});

test('fingerprint CLI no conecta ni imprime host, usuario o URI', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-fingerprint-'));
  const uriFile = writeUriFile(directory, SOURCE_URI);
  const result = spawnSync(
    process.execPath,
    [path.join(process.cwd(), 'scripts', 'mongo-recovery.js'), 'fingerprint', '--side=source', `--source-uri-file=${uriFile}`],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes('prod.example.invalid'), false);
  assert.equal(result.stdout.includes('mongodb://'), false);
  assert.match(JSON.parse(result.stdout).endpointFingerprintSha256, /^[0-9a-f]{64}$/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('identidad runtime debe coincidir y destino nunca puede compartir endpoint o instancia productiva', () => {
  const source = sourceAttestation().instanceIdentity;
  const target = targetAttestation().instanceIdentity;
  assert.doesNotThrow(() => assertRuntimeIdentity(SOURCE_URI, source, 'origen'));
  assert.doesNotThrow(() => assertDestinationIsolated(source, target));
  assert.throws(
    () =>
      assertDestinationIsolated(source, {
        ...target,
        endpointFingerprintSha256: source.endpointFingerprintSha256,
      }),
    /comparte host\/puerto/,
  );
  assert.throws(
    () =>
      assertDestinationIsolated(source, {
        ...target,
        provider: source.provider,
        instanceId: source.instanceId,
      }),
    /comparte identidad/,
  );
});

test('spawn args nunca contienen URI y usan config/archivo de script', () => {
  const dumpArgs = buildMongodumpArgs('C:\\secure\\mongo.yml', 'chaman', 'D:\\backup.archive.gz');
  const restoreArgs = buildMongorestoreArgs(
    'C:\\secure\\mongo.yml',
    'D:\\backup.archive.gz',
    'chaman',
    'chaman_restore_drill_x',
  );
  const shellArgs = buildMongoshArgs('C:\\safe\\inventory.mongosh.js');
  for (const args of [dumpArgs, restoreArgs, shellArgs]) {
    assert.equal(args.some((arg) => /mongodb(?:\+srv)?:\/\//i.test(arg)), false);
    assert.equal(args.some((arg) => arg === '--uri' || arg.startsWith('--uri=')), false);
  }
  assert.ok(dumpArgs.some((arg) => arg.startsWith('--config=')));
  assert.ok(restoreArgs.some((arg) => arg.startsWith('--config=')));
  assert.ok(shellArgs.includes('--norc'));
  assert.deepEqual(assertMongoToolsConfigVersion('mongodump version: 100.12.2'), {
    major: 100,
    minor: 12,
    patch: 2,
  });
  assert.throws(() => assertMongoToolsConfigVersion('mongodump version: 100.2.1'), /100.3/);
});

test('entorno hijo elimina toda URI y conserva solamente la ruta al secreto', () => {
  const env = safeChildEnv({ CHAMAN_RECOVERY_URI_FILE: 'C:\\secure\\uri.txt' }, {
    MONGO_URI: SOURCE_URI, MONGO_PUBLIC_URL: SOURCE_URI, DATABASE_URL: SOURCE_URI, SAFE: 'yes',
  });
  assert.equal(env.CHAMAN_RECOVERY_URI_FILE, 'C:\\secure\\uri.txt');
  assert.equal(env.SAFE, undefined);
  assert.equal(Object.values(env).includes(SOURCE_URI), false);
  assert.equal(env.MONGO_URI, undefined);
});

test('proceso principal rechaza cualquier URI MongoDB heredada por entorno', () => {
  assert.throws(() => assertNoMongoUriEnvironment({ MONGO_URI: SOURCE_URI, PATH: 'safe' }), /prohibida.*MONGO_URI/);
  assert.throws(
    () => assertNoMongoUriEnvironment({ APP_CONFIG: `{"uri":"${SOURCE_URI}"}` }),
    /prohibida.*APP_CONFIG/,
  );
  assert.doesNotThrow(() => assertNoMongoUriEnvironment({ CHAMAN_BACKUP_CONFIRM: 'dump:x:y' }));
});

test('hash de dbPath preserva mayusculas en POSIX y normaliza solo en Windows', () => {
  assert.notEqual(hashDbPath('/var/lib/chaman/Data', 'linux'), hashDbPath('/var/lib/chaman/data', 'linux'));
  assert.equal(hashDbPath('C:\\Chaman\\Data', 'win32'), hashDbPath('c:\\chaman\\data', 'win32'));
});

test('runtime proof acredita loopback, replica set, dbPath dedicado y processId', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-runtime-'));
  const root = path.join(directory, 'chaman-recovery-drill', 'runtime-proof-test');
  const dbPath = path.join(root, 'data');
  const unrelated = path.join(directory, 'unrelated', 'data');
  fs.mkdirSync(dbPath, { recursive: true });
  fs.mkdirSync(unrelated, { recursive: true });
  try {
    const proof = buildRuntimeProof(localRuntimeRaw(dbPath), { uri: LOCAL_URI, expectedDbPathRoot: root, now: NOW });
    const validated = validateRuntimeProof(proof, { now: NOW, expectedDatabase: proof.database });
    assert.equal(validated.replicaSet, 'chamanDrill');
    assert.equal(validated.processId, 4242);
    assert.equal(proof.mongo.process, 'mongod');
    assert.match(validated.instanceId, /^local-mongodb:[0-9a-f]{64}$/);

    assert.throws(() => buildRuntimeProof(localRuntimeRaw(dbPath), {
      uri: LOCAL_URI.replace('127.0.0.1', 'mongo.example.invalid'), expectedDbPathRoot: root, now: NOW,
    }), /loopback/);
    assert.throws(() => buildRuntimeProof({ ...localRuntimeRaw(dbPath), commandLine: {
      ...localRuntimeRaw(dbPath).commandLine, net: { bindIp: '0.0.0.0', port: 27019 },
    } }, { uri: LOCAL_URI, expectedDbPathRoot: root, now: NOW }), /loopback/);
    assert.throws(() => buildRuntimeProof({ ...localRuntimeRaw(dbPath), hello: {
      ...localRuntimeRaw(dbPath).hello, setName: undefined,
    } }, { uri: LOCAL_URI, expectedDbPathRoot: root, now: NOW }), /setName/);
    assert.throws(() => buildRuntimeProof({ ...localRuntimeRaw(dbPath), hello: {
      ...localRuntimeRaw(dbPath).hello, hosts: ['127.0.0.1:27019', '127.0.0.1:27020'],
    } }, { uri: LOCAL_URI, expectedDbPathRoot: root, now: NOW }), /solo nodo/);
    assert.throws(() => buildRuntimeProof(localRuntimeRaw(unrelated), {
      uri: LOCAL_URI, expectedDbPathRoot: root, now: NOW,
    }), /subdirectorio/);
    assert.throws(() => buildRuntimeProof({ ...localRuntimeRaw(dbPath), serverStatus: {
      process: 'mongos', pid: 4242,
    } }, { uri: LOCAL_URI, expectedDbPathRoot: root, now: NOW }), /mongod/);
    assert.throws(() => validateRuntimeProof({ ...proof, mongo: { ...proof.mongo, misleading: true } }, { now: NOW }), /inesperados/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('modo testing-local fija Testing/chaman_testing y permite cleanup con atestacion expirada', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-mode-'));
  const root = path.join(directory, 'chaman-recovery-drill', 'mode-test');
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  const proof = buildRuntimeProof(localRuntimeRaw(path.join(root, 'data')), { uri: LOCAL_URI, expectedDbPathRoot: root, now: NOW });
  const source = sourceAttestation({ drillMode: TESTING_LOCAL_MODE, sourceEnvironment: 'testing', database: 'chaman_testing' });
  assert.equal(validateSourceAttestation(source, { now: NOW }).drillMode, TESTING_LOCAL_MODE);
  assert.throws(() => validateSourceAttestation({ ...source, database: 'chaman' }, { now: NOW }), /chaman_testing/);
  const target = targetAttestation({
    drillMode: TESTING_LOCAL_MODE,
    environment: 'local-recovery-drill',
    instanceIdentity: {
      provider: 'local-mongodb',
      instanceId: proof.instanceId,
      endpointFingerprintSha256: proof.endpoint.endpointFingerprintSha256,
    },
    expiresAt: '2026-08-28T17:00:00.000Z',
  });
  assert.throws(() => validateTargetAttestation(target, { now: NOW }), /vencida/);
  assert.equal(validateTargetAttestation(target, { now: NOW, allowExpired: true }).drillMode, TESTING_LOCAL_MODE);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('cleanup liga recibo original, prueba runtime fresca y rescan negativo', () => {
  const hashes = {
    sourceManifestSha256: 'a'.repeat(64),
    targetAttestationSha256: 'b'.repeat(64),
    infrastructureEvidenceSha256: 'c'.repeat(64),
  };
  const receipt = {
    kind: 'chaman-mongo-restore-receipt',
    drillId: 'backup_20260828_1800',
    sourceDatabase: 'chaman_testing',
    targetDatabase: 'chaman_restore_drill_20260828_1800',
    sourceManifestSha256: hashes.sourceManifestSha256.toUpperCase(),
    targetAttestationSha256: hashes.targetAttestationSha256,
    infrastructureEvidenceSha256: hashes.infrastructureEvidenceSha256.toUpperCase(),
    targetRuntimeProofSha256: 'd'.repeat(64),
  };
  const expected = {
    drillId: receipt.drillId,
    sourceDatabase: receipt.sourceDatabase,
    targetDatabase: receipt.targetDatabase,
    ...hashes,
    targetRuntimeProofSha256: 'D'.repeat(64),
    expectedKind: 'chaman-mongo-restore-receipt',
  };
  assert.doesNotThrow(() => assertCleanupReceiptBindings(receipt, expected));
  assert.throws(() => assertCleanupReceiptBindings({ ...receipt, targetDatabase: 'otro' }, expected), /Artefacto original/);
  assert.throws(() => assertCleanupReceiptBindings({ ...receipt, targetRuntimeProofSha256: 'e'.repeat(64) }, expected), /runtime proof/);
  const runtime = {
    instanceId: `local-mongodb:${'e'.repeat(64)}`,
    endpointFingerprintSha256: 'f'.repeat(64),
    replicaSet: 'chamanDrill',
    dbPathSha256: '1'.repeat(64),
    processId: 4242,
  };
  assert.doesNotThrow(() => assertSameRuntimeForCleanup(runtime, { ...runtime }));
  assert.throws(() => assertSameRuntimeForCleanup(runtime, { ...runtime, processId: 4243 }), /reinicio/);
  assert.doesNotThrow(() => assertDropConfirmed({ ok: true, database: receipt.targetDatabase, rescanFound: false }, receipt.targetDatabase));
  assert.throws(() => assertDropConfirmed({ ok: true, database: receipt.targetDatabase, rescanFound: true }, receipt.targetDatabase), /rescan/);
});

test('collector conserva raw railway status, deriva el grafo y sella target local', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-collector-'));
  const projectId = 'abcdef12-3456-4789-8abc-def123456789';
  const environmentId = '44444444-4444-4444-8444-444444444444';
  const volumeId = '55555555-5555-4555-8555-555555555555';
  try {
    const proofDir = path.join(directory, 'proof');
    fs.mkdirSync(proofDir);
    hardenRestrictedDirectory(proofDir);
    const root = path.join(directory, 'chaman-recovery-drill', 'collector-test');
    fs.mkdirSync(path.join(root, 'data'), { recursive: true });
    const proof = buildRuntimeProof(localRuntimeRaw(path.join(root, 'data'), new Date().toISOString()), {
      uri: LOCAL_URI, expectedDbPathRoot: root,
    });
    const proofFile = path.join(proofDir, 'runtime-proof.json');
    fs.writeFileSync(proofFile, `${JSON.stringify(proof)}\n`);
    hardenRestrictedFile(proofFile);
    const raw = {
      id: projectId,
      name: 'CHAMAN2026',
      environments: [{ id: environmentId, name: 'Testing',
        services: [{ id: SOURCE_SERVICE, name: 'MongoDB' }],
        volumes: [{ id: volumeId, name: 'mongo-data', serviceId: SOURCE_SERVICE }] }],
    };
    const calls = [];
    const runner = (args) => {
      calls.push(args);
      return args[0] === '--version' ? 'railway 5.26.1\n' : `${JSON.stringify(raw)}\n`;
    };
    const outputDir = path.join(directory, 'evidence');
    const result = collectRailwayEvidence({
      outputDir, projectId: projectId.toUpperCase(), drillMode: TESTING_LOCAL_MODE, sourceEnvironment: 'testing',
      sourceService: 'MongoDB', runtimeProofFile: proofFile, evidenceId: 'testing_local_20260828',
      collector: 'operador-a', reviewedBy: 'responsable-b',
    }, { runner });
    assert.equal(result.rawCaptures, 1);
    const evidence = JSON.parse(fs.readFileSync(result.evidencePath, 'utf8'));
    assert.equal(evidence.source.serviceId, SOURCE_SERVICE);
    assert.equal(evidence.target.instanceId, proof.instanceId);
    assert.deepEqual(calls[1], ['status', '--project', projectId, '--environment', 'Testing', '--json']);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outputDir, 'railway-status-source.raw.json'), 'utf8')), raw);
    assert.throws(() => collectRailwayEvidence({
      outputDir: path.join(directory, 'production-evidence'), projectId, drillMode: PRODUCTION_MODE,
      sourceEnvironment: 'Production', sourceService: 'MongoDB', evidenceId: 'production_20260828',
      collector: 'operador-a', reviewedBy: 'responsable-b',
    }, { runner }), /Produccion permanece bloqueada/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('parser acepta el grafo real de Railway CLI con edges, serviceInstances y volumeInstances', () => {
  const projectId = '33333333-3333-4333-8333-333333333333';
  const environmentId = '44444444-4444-4444-8444-444444444444';
  const volumeId = '55555555-5555-4555-8555-555555555555';
  const raw = {
    id: projectId,
    name: 'CHAMAN2026',
    services: { edges: [{ node: { id: SOURCE_SERVICE, name: 'MongoDB' } }] },
    environments: { edges: [{ node: {
      id: environmentId,
      name: 'Testing',
      serviceInstances: { edges: [{ node: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', serviceId: SOURCE_SERVICE, serviceName: 'MongoDB',
      } }] },
      volumeInstances: { edges: [{ node: {
        serviceId: SOURCE_SERVICE, volume: { id: volumeId, name: 'mongo-volume' },
      } }] },
    } }] },
  };
  const derived = deriveRailwayAsset(raw, { projectId, environment: 'Testing', service: 'MongoDB' });
  assert.equal(derived.environmentId, environmentId);
  assert.equal(derived.serviceId, SOURCE_SERVICE);
  assert.deepEqual(derived.volumeIds, [volumeId]);
  const unlinked = structuredClone(raw);
  delete unlinked.environments.edges[0].node.volumeInstances.edges[0].node.serviceId;
  assert.throws(
    () => deriveRailwayAsset(unlinked, { projectId, environment: 'Testing', service: 'MongoDB' }),
    /exactamente un volumen/,
  );
});

test('evidencia Railway se deriva del raw, detecta adulteracion y auto-revision', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-evidence-'));
  try {
    const { evidence } = writeEvidence(directory);
    assert.doesNotThrow(() => validateInfrastructureEvidence(evidence, { baseDir: directory }));
    assert.throws(() => validateInfrastructureEvidence({ ...evidence, target: {
      ...evidence.target, volumeIds: evidence.source.volumeIds,
    } }, { baseDir: directory }), /captura cruda|volumen/);
    assert.throws(() => validateInfrastructureEvidence({ ...evidence, reviewedBy: evidence.collector }, { baseDir: directory }), /distintas/);
    assert.throws(() => validateInfrastructureEvidence({ ...evidence, collection: {
      ...evidence.collection,
      rawCaptures: evidence.collection.rawCaptures.map((capture, index) =>
        index === 0 ? { ...capture, commandSha256: 'f'.repeat(64) } : capture),
    } }, { baseDir: directory }), /comando Railway esperado/);
    assert.throws(() => validateInfrastructureEvidence({
      ...evidence,
      collectedAt: new Date(Date.now() + 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 61 * 60_000).toISOString(),
    }, { baseDir: directory }), /futuro/);
    fs.appendFileSync(path.join(directory, evidence.collection.rawCaptures[0].file), 'tampered');
    assert.throws(() => validateInfrastructureEvidence(evidence, { baseDir: directory }), /Checksum/);
    const fresh = writeEvidence(path.join(directory, 'fresh'));
    const loaded = { sha256: 'b'.repeat(64), validated: validateInfrastructureEvidence(fresh.evidence, { baseDir: path.dirname(fresh.file) }) };
    assert.throws(() => bindAttestationToEvidence(sourceAttestation(),
      validateSourceAttestation(sourceAttestation(), { now: NOW }), loaded, 'source'), /ligada/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('archivo secreto temporal se restringe y elimina incluso si el callback falla', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-secret-test-'));
  let capturedPath;
  try {
    assert.throws(
      () =>
        withMongoSecretFile(
          SOURCE_URI,
          'tools-yaml',
          (filePath) => {
            capturedPath = filePath;
            assert.match(fs.readFileSync(filePath, 'utf8'), /^uri: /);
            throw new Error('fallo simulado');
          },
          {
            tmpRoot: directory,
            hardenDirectory: (target) => {
              assert.deepEqual(fs.readdirSync(target), []);
              fs.chmodSync(target, 0o700);
            },
            hardenFile: (target) => fs.chmodSync(target, 0o600),
            verifyDirectory: () => ({ ok: true }),
          },
        ),
      /fallo simulado/,
    );
    assert.equal(fs.existsSync(capturedPath), false);
    assert.deepEqual(fs.readdirSync(directory), []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('hardening Windows usa script ACL antes de datos y exige evidencia efectiva', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-acl-test-'));
  const filePath = path.join(directory, 'secret.yml');
  const calls = [];
  try {
    fs.writeFileSync(filePath, 'secret');
    const spawn = (program, args, options) => {
      calls.push({ program, args, env: options.env });
      return {
        status: 0,
        stdout: JSON.stringify({ ok: true, kind: 'file', ownerSid: 'S-1-5-21-1', rules: 1, protected: true }),
        stderr: '',
      };
    };
    hardenRestrictedDirectory(directory, {
      platform: 'win32',
      spawn,
    });
    hardenRestrictedFile(filePath, { platform: 'win32', spawn });
    assert.deepEqual(
      calls.map((call) => call.args.at(-1)),
      ['HardenDirectory', 'VerifyDirectory', 'HardenFile', 'VerifyFile'],
    );
    assert.ok(calls.every((call) => call.program === 'powershell.exe'));
    assert.equal(calls[0].env.CHAMAN_ACL_TARGET_PATH, directory);
    assert.equal(calls[2].env.CHAMAN_ACL_TARGET_PATH, filePath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('ACL efectiva Windows protege directorio antes de archivo', { skip: process.platform !== 'win32' }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-acl-effective-'));
  try {
    hardenRestrictedDirectory(directory);
    assert.equal(verifyRestrictedDirectory(directory).ok, true);
    const file = path.join(directory, 'secret.txt');
    fs.writeFileSync(file, 'not-a-real-secret');
    hardenRestrictedFile(file);
    assert.equal(verifyRestrictedFile(file).ok, true);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('auditoria de semillas compara IDs unicos y acepta 51 siembras que comparten 30 variedades', () => {
  const sowings = Array.from({ length: 51 }, (_, index) => ({ idSemilla: `seed-${index % 30}` }));
  const seeds = Array.from({ length: 30 }, (_, index) => ({ _id: `seed-${index}` }));
  assert.deepEqual(summarizeSeedResolution(sowings, seeds), {
    referencedUniqueSeeds: 30,
    resolvedUniqueSeeds: 30,
    missingSeedReferences: 0,
    unresolvedUniqueSeeds: 0,
  });
});

test('manifiesto se sella con checksums y detecta cualquier manipulacion', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-mongo-recovery-'));
  try {
    const archivePath = path.join(directory, 'backup.archive.gz');
    const inventoryPath = path.join(directory, 'source-inventory.json');
    fs.writeFileSync(archivePath, 'archive-fixture');
    fs.writeFileSync(inventoryPath, `${JSON.stringify(inventory())}\n`);
    const manifest = buildBackupManifest({
      attestation: sourceAttestation(),
      inventory: inventory(),
      archivePath,
      inventoryPath,
      tools: { mongosh: '2.5.0', mongodump: '100.12.2' },
      gitSha: '901cfdae8732d06d34fb20ec9646b45ddf323c29',
      now: NOW,
    });
    validateBackupManifest(manifest, directory);
    fs.appendFileSync(archivePath, 'tampered');
    assert.throws(() => validateBackupManifest(manifest, directory), /Checksum del archive invalido/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('comparacion exige mismas colecciones, conteos, indices y major de MongoDB', () => {
  const restored = inventory('chaman_restore_drill_20260828_1800');
  assert.equal(compareInventories(inventory(), restored).ok, true);
  restored.collections[0].count = 50;
  assert.deepEqual(compareInventories(inventory(), restored).findings[0], {
    collection: 'lotes',
    issue: 'count_mismatch',
    expected: 51,
    actual: 50,
  });
  const wrongOptions = inventory('chaman_restore_drill_20260828_1800');
  wrongOptions.collections[0].options.validationAction = 'warn';
  assert.equal(compareInventories(inventory(), wrongOptions).findings[0].issue, 'options_mismatch');
  const wrongIndex = inventory('chaman_restore_drill_20260828_1800');
  wrongIndex.collections[0].indexes[1].hidden = true;
  wrongIndex.collections[0].indexes[1].wildcardProjection = { secretField: 0 };
  assert.equal(compareInventories(inventory(), wrongIndex).findings[0].issue, 'indexes_mismatch');
  const wrongVersion = inventory('chaman_restore_drill_20260828_1800');
  wrongVersion.serverVersion = '7.0.18';
  assert.throws(() => compareInventories(inventory(), wrongVersion), /incompatibles/);
  const futureOption = inventory('chaman_restore_drill_20260828_1800');
  futureOption.collections[0].indexes[0].futureSemanticOption = { enabled: true };
  assert.equal(compareInventories(inventory(), futureOption).ok, false);
  const generatedMetadata = inventory('chaman_restore_drill_20260828_1800');
  generatedMetadata.collections[0].indexes[0].v = 9;
  generatedMetadata.collections[0].indexes[0].ns = 'generated';
  assert.equal(compareInventories(inventory(), generatedMetadata).ok, true);
  const reversedCompound = inventory('chaman_restore_drill_20260828_1800');
  reversedCompound.collections[0].indexes[1].key = { nombre: 1, idProductor: 1 };
  assert.equal(compareInventories(inventory(), reversedCompound).ok, false);
});

test('manifiestos rechazan campos y valores que puedan filtrar secretos', () => {
  assert.throws(() => assertNoSecrets({ sourceUri: 'redacted' }), /campo sensible/);
  assert.throws(() => assertNoSecrets({ note: 'mongodb://example.invalid/chaman' }), /URI de MongoDB/);
});

test('artefactos deben vivir fuera del repo y nunca sobreescribirse', () => {
  assert.throws(() => safeArtifactDirectory(path.join(process.cwd(), 'mongo-recovery-artifacts'), process.cwd()), /fuera/);
  const outside = path.join(os.tmpdir(), 'chaman-safe-artifacts-not-created');
  assert.equal(safeArtifactDirectory(outside, process.cwd()), path.resolve(outside));
});

test('plan CLI es offline: valida gobierno sin URI ni conexion', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-mongo-plan-'));
  try {
    const attestationPath = path.join(directory, 'attestation.json');
    const evidence = writeTestingEvidence(directory);
    const dynamic = sourceAttestation({
      drillMode: TESTING_LOCAL_MODE,
      sourceEnvironment: 'testing',
      database: 'chaman_testing',
      instanceIdentity: identity('railway', SOURCE_SERVICE, TESTING_SOURCE_URI),
      infrastructureEvidenceSha256: evidence.sha256,
      frozenAt: new Date(Date.now() - 60_000).toISOString(),
      verifiedAt: new Date(Date.now() - 30_000).toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
    fs.writeFileSync(attestationPath, JSON.stringify(dynamic));
    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'scripts', 'mongo-recovery.js'),
        'plan',
        '--phase=dump',
        `--attestation=${attestationPath}`,
        `--infrastructure-evidence=${evidence.file}`,
        `--output-dir=${path.join(directory, 'new-backup')}`,
      ],
      { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, CHAMAN_MONGO_SOURCE_URI: '' } },
    );
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.connectsToMongo, false);
    assert.equal(plan.mutatesMongo, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('fallo posterior a crear output-dir deja recibo sin secretos y no conecta', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-mongo-failure-'));
  try {
    const attestationPath = path.join(directory, 'attestation.json');
    const outputDir = path.join(directory, 'backup-failed');
    const uriFile = writeUriFile(directory, TESTING_SOURCE_URI);
    const evidence = writeTestingEvidence(directory);
    const dynamic = sourceAttestation({
      drillMode: TESTING_LOCAL_MODE,
      sourceEnvironment: 'testing',
      database: 'chaman_testing',
      instanceIdentity: identity('railway', SOURCE_SERVICE, TESTING_SOURCE_URI),
      infrastructureEvidenceSha256: evidence.sha256,
      frozenAt: new Date(Date.now() - 60_000).toISOString(),
      verifiedAt: new Date(Date.now() - 30_000).toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
    fs.writeFileSync(attestationPath, JSON.stringify(dynamic));
    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'scripts', 'mongo-recovery.js'),
        'dump',
        `--attestation=${attestationPath}`,
        `--infrastructure-evidence=${evidence.file}`,
        `--source-uri-file=${uriFile}`,
        `--output-dir=${outputDir}`,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          CHAMAN_BACKUP_CONFIRM: `dump:${dynamic.attestationId}:${dynamic.database}`,
          CHAMAN_MONGOSH_BIN: 'definitely-missing-mongosh-for-test',
        },
      },
    );
    assert.notEqual(result.status, 0);
    const receipt = fs.readFileSync(path.join(outputDir, 'dump-failure-receipt.json'), 'utf8');
    assert.equal(receipt.includes(TESTING_SOURCE_URI), false);
    assert.equal(JSON.parse(receipt).status, 'failed');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
