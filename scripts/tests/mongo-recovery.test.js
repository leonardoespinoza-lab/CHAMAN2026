const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
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
const { bindAttestationToEvidence, validateInfrastructureEvidence } = require('../mongo-recovery/infrastructure-evidence');

const NOW = new Date('2026-08-28T18:00:00.000Z');
const SOURCE_URI = 'mongodb://prod.example.invalid:27017/chaman';
const TARGET_URI = 'mongodb://restore.example.invalid:27018/chaman_restore_drill_20260828_1800';
const EVIDENCE_HASH = 'a'.repeat(64);
const SOURCE_SERVICE = '11111111-1111-4111-8111-111111111111';
const TARGET_SERVICE = '22222222-2222-4222-8222-222222222222';

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
  const file = path.join(directory, 'railway-evidence.json');
  const evidence = {
    schemaVersion: 1, kind: 'chaman-railway-mongo-isolation-evidence', evidenceId: 'evidence_20260828',
    collection: { method: 'railway-read-only-api', projectId: '33333333-3333-4333-8333-333333333333', readOnly: true },
    collectedAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    source: { environmentId: '44444444-4444-4444-8444-444444444444', serviceId: SOURCE_SERVICE,
      volumeId: '55555555-5555-4555-8555-555555555555', networkIdentityId: '66666666-6666-4666-8666-666666666666',
      endpointFingerprintsSha256: [mongoEndpointFingerprint(SOURCE_URI).endpointFingerprintSha256] },
    target: { environmentId: '77777777-7777-4777-8777-777777777777', serviceId: TARGET_SERVICE,
      volumeId: '88888888-8888-4888-8888-888888888888', networkIdentityId: '99999999-9999-4999-8999-999999999999',
      endpointFingerprintsSha256: [mongoEndpointFingerprint(TARGET_URI).endpointFingerprintSha256] },
    assertions: { distinctEnvironment: true, distinctService: true, distinctVolume: true,
      distinctNetworkIdentity: true, targetHasNoProductionConsumers: true },
    collector: 'operador-a', reviewedBy: 'responsable-b',
  };
  fs.writeFileSync(file, JSON.stringify(evidence));
  return { file, sha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex'), evidence };
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
  const result = spawnSync(
    process.execPath,
    [path.join(process.cwd(), 'scripts', 'mongo-recovery.js'), 'fingerprint', '--side=source'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, CHAMAN_MONGO_SOURCE_URI: SOURCE_URI },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes('prod.example.invalid'), false);
  assert.equal(result.stdout.includes('mongodb://'), false);
  assert.match(JSON.parse(result.stdout).endpointFingerprintSha256, /^[0-9a-f]{64}$/);
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
  assert.equal(env.SAFE, 'yes');
  assert.equal(Object.values(env).includes(SOURCE_URI), false);
  assert.equal(env.MONGO_URI, undefined);
});

test('evidencia Railway rechaza aliases compartidos y auto-revision', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chaman-evidence-'));
  try {
    const { evidence } = writeEvidence(directory);
    assert.doesNotThrow(() => validateInfrastructureEvidence(evidence));
    assert.throws(() => validateInfrastructureEvidence({ ...evidence, target: {
      ...evidence.target, endpointFingerprintsSha256: evidence.source.endpointFingerprintsSha256,
    } }), /alias/);
    assert.throws(() => validateInfrastructureEvidence({ ...evidence, reviewedBy: evidence.collector }), /distintas/);
    const loaded = { sha256: 'b'.repeat(64), validated: validateInfrastructureEvidence(evidence) };
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
    const evidence = writeEvidence(directory);
    const dynamic = sourceAttestation({
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
    const evidence = writeEvidence(directory);
    const dynamic = sourceAttestation({
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
        `--output-dir=${outputDir}`,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          CHAMAN_MONGO_SOURCE_URI: SOURCE_URI,
          CHAMAN_BACKUP_CONFIRM: `dump:${dynamic.attestationId}:${dynamic.database}`,
          CHAMAN_MONGOSH_BIN: 'definitely-missing-mongosh-for-test',
        },
      },
    );
    assert.notEqual(result.status, 0);
    const receipt = fs.readFileSync(path.join(outputDir, 'dump-failure-receipt.json'), 'utf8');
    assert.equal(receipt.includes(SOURCE_URI), false);
    assert.equal(JSON.parse(receipt).status, 'failed');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
