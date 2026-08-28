const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  assertNoSecrets,
  buildBackupManifest,
  compareInventories,
  databaseFromMongoUri,
  expectedConfirmation,
  safeArtifactDirectory,
  validateBackupManifest,
  validateSourceAttestation,
  validateTargetAttestation,
} = require('../mongo-recovery/lib');

const NOW = new Date('2026-08-28T18:00:00.000Z');

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
    ...overrides,
  };
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
  const wrongVersion = inventory('chaman_restore_drill_20260828_1800');
  wrongVersion.serverVersion = '7.0.18';
  assert.throws(() => compareInventories(inventory(), wrongVersion), /incompatibles/);
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
    const dynamic = sourceAttestation({
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
