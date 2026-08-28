#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const {
  assertCompatibleMongoVersions,
  buildBackupManifest,
  compareInventories,
  databaseFromMongoUri,
  expectedConfirmation,
  normalizeInventory,
  readJson,
  redact,
  requireConfirmation,
  safeArtifactDirectory,
  sha256File,
  validateBackupManifest,
  validateSourceAttestation,
  validateTargetAttestation,
} = require('./mongo-recovery/lib');

const ROOT = path.resolve(__dirname, '..');
const INVENTORY_SCRIPT = path.join(__dirname, 'mongo-recovery', 'inventory.mongosh.js');
const DROP_SCRIPT = path.join(__dirname, 'mongo-recovery', 'drop-database.mongosh.js');
const AGRONOMIC_AUDIT = path.join(__dirname, 'mongo-recovery', 'audit-restored.js');

function usage() {
  return `Uso:
  node scripts/mongo-recovery.js plan --phase=dump|restore|verify|cleanup --attestation=<json> [--manifest=<json>] [--output-dir=<dir>]
  node scripts/mongo-recovery.js preflight --phase=dump|restore|verify|cleanup --attestation=<json> [--manifest=<json>] [--output-dir=<dir>]
  node scripts/mongo-recovery.js dump --attestation=<json> --output-dir=<dir>
  node scripts/mongo-recovery.js verify-backup --manifest=<json>
  node scripts/mongo-recovery.js restore --manifest=<json> --attestation=<json> --output-dir=<dir>
  node scripts/mongo-recovery.js verify --manifest=<json> --attestation=<json> --output-dir=<dir>
  node scripts/mongo-recovery.js cleanup --attestation=<json> --output-dir=<dir>

Secretos (solo variables de entorno, nunca argumentos ni archivos versionados):
  CHAMAN_MONGO_SOURCE_URI, CHAMAN_MONGO_RESTORE_URI
  CHAMAN_BACKUP_CONFIRM, CHAMAN_RESTORE_CONFIRM, CHAMAN_CLEANUP_CONFIRM`;
}

function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      phase: { type: 'string' },
      attestation: { type: 'string' },
      manifest: { type: 'string' },
      'output-dir': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) return { command: 'help', values };
  if (positionals.length !== 1) throw new Error(usage());
  return { command: positionals[0], values };
}

function writeJsonExclusive(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
}

function executable(name) {
  const overrides = {
    mongosh: process.env.CHAMAN_MONGOSH_BIN,
    mongodump: process.env.CHAMAN_MONGODUMP_BIN,
    mongorestore: process.env.CHAMAN_MONGORESTORE_BIN,
  };
  return overrides[name] || name;
}

function runProcess(program, args, { env = process.env, secrets = [], cwd = ROOT } = {}) {
  const result = spawnSync(program, args, {
    cwd,
    env,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${path.basename(program)} no pudo iniciarse: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = redact(result.stderr || result.stdout, secrets).trim().slice(0, 2000);
    throw new Error(`${path.basename(program)} termino con codigo ${result.status}${detail ? `: ${detail}` : '.'}`);
  }
  return { stdout: result.stdout, stderr: redact(result.stderr, secrets) };
}

function toolVersion(tool) {
  const result = runProcess(executable(tool), ['--version']);
  const line = `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  if (!line) throw new Error(`${tool} no informo version.`);
  return line.slice(0, 200);
}

function toolVersions(names) {
  return Object.fromEntries(names.map((name) => [name, toolVersion(name)]));
}

function gitSha() {
  return runProcess('git', ['rev-parse', 'HEAD']).stdout.trim().toLowerCase();
}

function inventory(uri, database) {
  const result = runProcess(executable('mongosh'), ['--nodb', '--quiet', '--file', INVENTORY_SCRIPT], {
    env: {
      ...process.env,
      CHAMAN_RECOVERY_URI: uri,
      CHAMAN_RECOVERY_DATABASE: database,
    },
    secrets: [uri],
  });
  let parsed;
  try {
    parsed = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error('mongosh no devolvio un inventario JSON valido.');
  }
  return normalizeInventory(parsed);
}

function sourceContext(attestationFile, { requireUri = true } = {}) {
  if (!attestationFile) throw new Error('Falta --attestation.');
  const attestation = readJson(attestationFile);
  const validated = validateSourceAttestation(attestation);
  const uri = process.env.CHAMAN_MONGO_SOURCE_URI;
  if (requireUri && !uri) throw new Error('Falta CHAMAN_MONGO_SOURCE_URI.');
  if (uri && databaseFromMongoUri(uri) !== validated.database) {
    throw new Error('La base de CHAMAN_MONGO_SOURCE_URI no coincide con la atestacion.');
  }
  return { attestation, validated, uri };
}

function targetContext(attestationFile, { requireUri = true } = {}) {
  if (!attestationFile) throw new Error('Falta --attestation.');
  const attestation = readJson(attestationFile);
  const validated = validateTargetAttestation(attestation);
  const uri = process.env.CHAMAN_MONGO_RESTORE_URI;
  if (requireUri && !uri) throw new Error('Falta CHAMAN_MONGO_RESTORE_URI.');
  if (uri && databaseFromMongoUri(uri) !== validated.database) {
    throw new Error('La base de CHAMAN_MONGO_RESTORE_URI no coincide con la atestacion.');
  }
  if (uri && process.env.CHAMAN_MONGO_SOURCE_URI && uri === process.env.CHAMAN_MONGO_SOURCE_URI) {
    throw new Error('Origen y destino no pueden usar la misma URI.');
  }
  return { attestation, validated, uri };
}

function manifestContext(manifestFile) {
  if (!manifestFile) throw new Error('Falta --manifest.');
  const manifestPath = path.resolve(manifestFile);
  const manifest = readJson(manifestPath);
  const backupDir = path.dirname(manifestPath);
  return {
    manifest,
    manifestPath,
    backupDir,
    verified: validateBackupManifest(manifest, backupDir),
  };
}

function describePlan(phase, values, checkTools) {
  if (!['dump', 'restore', 'verify', 'cleanup'].includes(phase)) {
    throw new Error('--phase debe ser dump, restore, verify o cleanup.');
  }
  const result = {
    status: 'plan-only',
    phase,
    connectsToMongo: false,
    mutatesMongo: false,
    secretsReadFromEnvironmentOnly: true,
    protections: [],
  };
  if (phase === 'dump') {
    const { validated } = sourceContext(values.attestation, { requireUri: false });
    if (!values['output-dir']) throw new Error('Falta --output-dir.');
    safeArtifactDirectory(values['output-dir'], ROOT, { mustNotExist: false });
    result.database = validated.database;
    result.protections = [
      'write-freeze attestation vigente',
      'cinco controles de escritores en true',
      'confirmacion exacta por variable de entorno',
      'inventario antes del dump',
      'archive gzip sin sobreescritura',
      'SHA-256 y manifiesto sin secretos',
    ];
    if (checkTools) result.tools = toolVersions(['mongosh', 'mongodump']);
  } else {
    const { validated } = targetContext(values.attestation, { requireUri: false });
    if (!values['output-dir']) throw new Error('Falta --output-dir.');
    safeArtifactDirectory(values['output-dir'], ROOT, { mustNotExist: false });
    result.database = validated.database;
    result.protections = [
      'destino dedicado, descartable y sin trafico productivo',
      'nombre de base con prefijo de recovery drill',
      'confirmacion exacta por variable de entorno para escrituras',
    ];
    if (phase !== 'cleanup') {
      const { manifest } = manifestContext(values.manifest);
      result.sourceDatabase = manifest.database;
    }
    if (checkTools) {
      result.tools = toolVersions(
        phase === 'restore' ? ['mongosh', 'mongorestore'] : phase === 'verify' ? ['mongosh'] : ['mongosh'],
      );
    }
  }
  return result;
}

function dumpCommand(values) {
  const { attestation, validated, uri } = sourceContext(values.attestation);
  requireConfirmation(
    process.env.CHAMAN_BACKUP_CONFIRM,
    expectedConfirmation('dump', validated.id, validated.database),
    'CHAMAN_BACKUP_CONFIRM',
  );
  if (!values['output-dir']) throw new Error('Falta --output-dir.');
  const outputDir = safeArtifactDirectory(values['output-dir'], ROOT, { mustNotExist: true });
  const parent = path.dirname(outputDir);
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) {
    throw new Error('El directorio padre de output-dir debe existir.');
  }
  fs.mkdirSync(outputDir, { recursive: false, mode: 0o700 });
  const archivePath = path.join(outputDir, 'backup.archive.gz');
  const inventoryPath = path.join(outputDir, 'source-inventory.json');
  const manifestPath = path.join(outputDir, 'manifest.json');
  try {
    const tools = toolVersions(['mongosh', 'mongodump']);
    const sourceInventory = inventory(uri, validated.database);
    writeJsonExclusive(inventoryPath, sourceInventory);
    runProcess(
      executable('mongodump'),
      [
        '--uri',
        uri,
        `--db=${validated.database}`,
        `--archive=${archivePath}`,
        '--gzip',
        '--readPreference=primary',
        '--numParallelCollections=1',
      ],
      { secrets: [uri] },
    );
    if (!fs.existsSync(archivePath) || fs.statSync(archivePath).size === 0) {
      throw new Error('mongodump no produjo un archive no vacio.');
    }
    const manifest = buildBackupManifest({
      attestation,
      inventory: sourceInventory,
      archivePath,
      inventoryPath,
      tools,
      gitSha: gitSha(),
    });
    writeJsonExclusive(manifestPath, manifest);
    validateBackupManifest(manifest, outputDir);
    return {
      status: 'sealed',
      drillId: validated.id,
      database: validated.database,
      manifest: manifestPath,
      archiveSha256: manifest.archive.sha256,
      reminder: 'Mantener las escrituras congeladas hasta registrar el cierre del dump; luego descongelar por el procedimiento operativo.',
    };
  } catch (error) {
    throw new Error(`Backup no sellado; no usar sus artefactos. ${error.message}`);
  }
}

function verifyBackupCommand(values) {
  const context = manifestContext(values.manifest);
  return {
    status: 'backup-verified',
    drillId: context.manifest.drillId,
    database: context.manifest.database,
    archiveSha256: context.manifest.archive.sha256,
  };
}

function ensureEmptyTarget(targetInventory) {
  if (targetInventory.collections.length !== 0) {
    throw new Error(`El destino no esta vacio: contiene ${targetInventory.collections.length} colecciones.`);
  }
}

function restoreCommand(values) {
  const target = targetContext(values.attestation);
  const source = manifestContext(values.manifest);
  if (target.validated.drillId !== source.manifest.drillId) {
    throw new Error('drillId del destino no coincide con el manifiesto de backup.');
  }
  requireConfirmation(
    process.env.CHAMAN_RESTORE_CONFIRM,
    expectedConfirmation('restore', target.validated.drillId, target.validated.database),
    'CHAMAN_RESTORE_CONFIRM',
  );
  if (!values['output-dir']) throw new Error('Falta --output-dir.');
  const outputDir = safeArtifactDirectory(values['output-dir'], ROOT);
  if (!fs.existsSync(outputDir) || !fs.statSync(outputDir).isDirectory()) {
    throw new Error('output-dir del simulacro debe existir.');
  }
  const beforePath = path.join(outputDir, 'target-inventory-before.json');
  const receiptPath = path.join(outputDir, 'restore-receipt.json');
  if (fs.existsSync(receiptPath)) throw new Error('Ya existe restore-receipt.json; no se repetira el restore.');
  toolVersions(['mongosh', 'mongorestore']);
  const before = inventory(target.uri, target.validated.database);
  ensureEmptyTarget(before);
  assertCompatibleMongoVersions(source.verified.inventory.serverVersion, before.serverVersion);
  writeJsonExclusive(beforePath, before);
  const startedAt = new Date().toISOString();
  runProcess(
    executable('mongorestore'),
    [
      '--uri',
      target.uri,
      `--archive=${source.verified.archivePath}`,
      '--gzip',
      '--stopOnError',
      `--nsInclude=${source.manifest.database}.*`,
      `--nsFrom=${source.manifest.database}.*`,
      `--nsTo=${target.validated.database}.*`,
    ],
    { secrets: [target.uri] },
  );
  const receipt = {
    schemaVersion: 1,
    kind: 'chaman-mongo-restore-receipt',
    drillId: target.validated.drillId,
    sourceManifestSha256: sha256File(source.manifestPath),
    sourceDatabase: source.manifest.database,
    targetDatabase: target.validated.database,
    targetMongoVersion: before.serverVersion,
    startedAt,
    completedAt: new Date().toISOString(),
    status: 'restored-unverified',
  };
  writeJsonExclusive(receiptPath, receipt);
  return { status: receipt.status, receipt: receiptPath, targetDatabase: target.validated.database };
}

function runAudit(program, args, env, secrets, outputPath) {
  const result = runProcess(program, args, { env, secrets });
  fs.writeFileSync(outputPath, result.stdout, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { file: path.basename(outputPath), sha256: sha256File(outputPath) };
}

function verifyCommand(values) {
  const target = targetContext(values.attestation);
  const source = manifestContext(values.manifest);
  if (target.validated.drillId !== source.manifest.drillId) {
    throw new Error('drillId del destino no coincide con el manifiesto de backup.');
  }
  if (!values['output-dir']) throw new Error('Falta --output-dir.');
  const outputDir = safeArtifactDirectory(values['output-dir'], ROOT);
  const receiptPath = path.join(outputDir, 'restore-receipt.json');
  const receipt = readJson(receiptPath);
  if (
    receipt.kind !== 'chaman-mongo-restore-receipt' ||
    receipt.drillId !== target.validated.drillId ||
    receipt.targetDatabase !== target.validated.database ||
    receipt.sourceManifestSha256 !== sha256File(source.manifestPath)
  ) {
    throw new Error('El recibo de restore no coincide con el manifiesto y destino actuales.');
  }
  const after = inventory(target.uri, target.validated.database);
  const afterPath = path.join(outputDir, 'target-inventory-after.json');
  writeJsonExclusive(afterPath, after);
  const comparison = compareInventories(source.verified.inventory, after);
  const auditEnv = {
    ...process.env,
    MONGO_URI: target.uri,
    DB_NAME: target.validated.database,
    CHAMAN_RECOVERY_DRILL: 'true',
  };
  for (const key of ['MONGO_PUBLIC_URL', 'MONGO_URL', 'DATABASE_URL', 'DB_URL']) delete auditEnv[key];
  const auditMatrix = runAudit(
    process.execPath,
    [AGRONOMIC_AUDIT],
    auditEnv,
    [target.uri],
    path.join(outputDir, 'audit-restored-agronomic-data.json'),
  );
  const auditLotes = runAudit(
    process.execPath,
    [path.join(ROOT, 'scripts', 'audit-lote-data-integrity.js')],
    { ...auditEnv, CHAMAN_AUDIT_STRICT: 'false' },
    [target.uri],
    path.join(outputDir, 'audit-lote-data-integrity.json'),
  );
  const agronomic = readJson(path.join(outputDir, auditMatrix.file));
  const lotIntegrity = readJson(path.join(outputDir, auditLotes.file));
  const lotIssueTypes = Object.fromEntries(
    (lotIntegrity.issueSamples || []).reduce((counts, issue) => {
      counts.set(issue.type, (counts.get(issue.type) || 0) + 1);
      return counts;
    }, new Map()),
  );
  const verification = {
    schemaVersion: 1,
    kind: 'chaman-mongo-restore-verification',
    drillId: target.validated.drillId,
    sourceManifestSha256: sha256File(source.manifestPath),
    sourceDatabase: source.manifest.database,
    targetDatabase: target.validated.database,
    verifiedAt: new Date().toISOString(),
    inventory: {
      ...comparison,
      file: path.basename(afterPath),
      sha256: sha256File(afterPath),
    },
    audits: {
      agronomicMatrix: { ...auditMatrix, ok: agronomic.ok === true, summary: agronomic.summary },
      lotIntegrity: {
        ...auditLotes,
        ok: lotIntegrity.ok === true,
        counters: lotIntegrity.counters,
        issueTypes: lotIssueTypes,
        blockingForRestoreEquality: false,
      },
    },
    status: comparison.ok && agronomic.ok === true ? 'passed' : 'failed',
  };
  const verificationPath = path.join(outputDir, 'verification.json');
  writeJsonExclusive(verificationPath, verification);
  if (verification.status !== 'passed') {
    throw new Error(`El simulacro no paso. Evidencia: ${verificationPath}`);
  }
  return { status: 'passed', evidence: verificationPath, targetDatabase: target.validated.database };
}

function cleanupCommand(values) {
  const target = targetContext(values.attestation);
  requireConfirmation(
    process.env.CHAMAN_CLEANUP_CONFIRM,
    expectedConfirmation('cleanup', target.validated.drillId, target.validated.database),
    'CHAMAN_CLEANUP_CONFIRM',
  );
  if (!values['output-dir']) throw new Error('Falta --output-dir.');
  const outputDir = safeArtifactDirectory(values['output-dir'], ROOT);
  if (!fs.existsSync(outputDir) || !fs.statSync(outputDir).isDirectory()) {
    throw new Error('output-dir del simulacro no existe.');
  }
  const receiptPath = path.join(outputDir, 'cleanup-receipt.json');
  if (fs.existsSync(receiptPath)) throw new Error('Ya existe cleanup-receipt.json; no se repetira el drop.');
  const result = runProcess(executable('mongosh'), ['--nodb', '--quiet', '--file', DROP_SCRIPT], {
    env: {
      ...process.env,
      CHAMAN_RECOVERY_URI: target.uri,
      CHAMAN_RECOVERY_DATABASE: target.validated.database,
      CHAMAN_RECOVERY_DRILL_ID: target.validated.drillId,
      CHAMAN_RECOVERY_DROP_CONFIRM: expectedConfirmation(
        'cleanup',
        target.validated.drillId,
        target.validated.database,
      ),
    },
    secrets: [target.uri],
  });
  const dropped = JSON.parse(result.stdout.trim());
  if (dropped.database !== target.validated.database || dropped.ok !== true) {
    throw new Error('MongoDB no confirmo el drop del destino esperado.');
  }
  writeJsonExclusive(receiptPath, {
    schemaVersion: 1,
    kind: 'chaman-mongo-cleanup-receipt',
    drillId: target.validated.drillId,
    database: target.validated.database,
    completedAt: new Date().toISOString(),
    status: 'dropped',
  });
  return { status: 'dropped', database: target.validated.database, receipt: receiptPath };
}

function main() {
  const { command, values } = parseCli(process.argv.slice(2));
  let result;
  if (command === 'help') {
    console.log(usage());
    return;
  }
  if (command === 'plan' || command === 'preflight') {
    result = describePlan(values.phase, values, command === 'preflight');
  } else if (command === 'dump') result = dumpCommand(values);
  else if (command === 'verify-backup') result = verifyBackupCommand(values);
  else if (command === 'restore') result = restoreCommand(values);
  else if (command === 'verify') result = verifyCommand(values);
  else if (command === 'cleanup') result = cleanupCommand(values);
  else throw new Error(`Comando desconocido: ${command}.\n${usage()}`);
  console.log(JSON.stringify(result, null, 2));
}

try {
  main();
} catch (error) {
  console.error(redact(error.message, [process.env.CHAMAN_MONGO_SOURCE_URI, process.env.CHAMAN_MONGO_RESTORE_URI]));
  process.exitCode = 1;
}
