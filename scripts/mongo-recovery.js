#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const {
  assertCompatibleMongoVersions,
  assertDestinationIsolated,
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
  validateBackupManifest,
  validateSourceAttestation,
  validateTargetAttestation,
} = require('./mongo-recovery/lib');
const {
  assertMongoToolsConfigVersion,
  assertNoMongoUriEnvironment,
  buildMongodumpArgs,
  buildMongorestoreArgs,
  buildMongoshArgs,
  hardenRestrictedDirectory,
  hardenRestrictedFile,
  verifyRestrictedDirectory,
  verifyRestrictedFile,
  safeChildEnv,
  withMongoSecretFile,
} = require('./mongo-recovery/secure-config');
const {
  bindAttestationToEvidence,
  loadInfrastructureEvidence,
  TESTING_LOCAL_MODE,
} = require('./mongo-recovery/infrastructure-evidence');
const {
  assertRuntimeProofMatchesEvidence,
  buildRuntimeProof,
  loadRuntimeProof,
  parseUriEndpoints,
  validateRuntimeProof,
} = require('./mongo-recovery/runtime-proof');
const { collectRailwayEvidence } = require('./mongo-recovery/railway-collector');
const {
  ARCHIVE_CERTIFICATION_STABILITY_DELAY_SECONDS,
  buildArchiveCertification,
  loadArchiveCertification,
} = require('./mongo-recovery/archive-certification');

const ROOT = path.resolve(__dirname, '..');
const INVENTORY_SCRIPT = path.join(__dirname, 'mongo-recovery', 'inventory.mongosh.js');
const DROP_SCRIPT = path.join(__dirname, 'mongo-recovery', 'drop-database.mongosh.js');
const AGRONOMIC_AUDIT = path.join(__dirname, 'mongo-recovery', 'audit-restored.js');
const RUNTIME_PROOF_SCRIPT = path.join(__dirname, 'mongo-recovery', 'runtime-proof.mongosh.js');
const RESTORE_STABILITY_DELAY_MS = ARCHIVE_CERTIFICATION_STABILITY_DELAY_SECONDS * 1000;

function assertRestoreStabilityDelay(completedAt, { now = new Date() } = {}) {
  if (typeof completedAt !== 'string' || !completedAt.trim()) {
    throw new Error('restore-receipt.completedAt no es una fecha ISO valida.');
  }
  const restoredAt = new Date(completedAt);
  const checkedAt = new Date(now);
  if (
    !Number.isFinite(restoredAt.getTime()) ||
    restoredAt.toISOString() !== completedAt ||
    !Number.isFinite(checkedAt.getTime())
  ) {
    throw new Error('restore-receipt.completedAt no es una fecha ISO valida.');
  }
  const delayMs = checkedAt.getTime() - restoredAt.getTime();
  if (delayMs < 0) throw new Error('restore-receipt.completedAt no puede estar en el futuro.');
  if (delayMs < RESTORE_STABILITY_DELAY_MS) {
    throw new Error('Verify exige al menos 130 segundos completos desde completedAt del restore.');
  }
  return {
    restoreCompletedAt: restoredAt.toISOString(),
    stabilityCheckedAt: checkedAt.toISOString(),
    stabilityDelaySeconds: delayMs / 1000,
    requiredStabilityDelaySeconds: RESTORE_STABILITY_DELAY_MS / 1000,
  };
}

function evaluateAuditInventoryStability(source, beforeAudits, afterAudits) {
  const sourceBeforeAudits = compareInventories(source, beforeAudits);
  const sourceAfterAudits = compareInventories(source, afterAudits);
  const beforeVsAfterAudits = compareInventories(beforeAudits, afterAudits);
  return {
    ok: sourceBeforeAudits.ok && sourceAfterAudits.ok && beforeVsAfterAudits.ok,
    sourceBeforeAudits,
    sourceAfterAudits,
    beforeVsAfterAudits,
  };
}

function usage() {
  return `Uso:
  node scripts/mongo-recovery.js plan --phase=dump|certify-archive-restore|certify-archive-verify|restore|verify|cleanup --attestation=<json> [--manifest=<json>] [--output-dir=<dir>]
  node scripts/mongo-recovery.js preflight --phase=dump|certify-archive-restore|certify-archive-verify|restore|verify|cleanup --attestation=<json> [--manifest=<json>] [--output-dir=<dir>]
  node scripts/mongo-recovery.js dump --attestation=<json> --infrastructure-evidence=<json> --output-dir=<dir>
  node scripts/mongo-recovery.js verify-backup --manifest=<json>
  node scripts/mongo-recovery.js certify-archive-restore --manifest=<json> --attestation=<json> --infrastructure-evidence=<json> --runtime-proof=<json> --output-dir=<dir>
  node scripts/mongo-recovery.js certify-archive-verify --manifest=<json> --attestation=<json> --infrastructure-evidence=<json> --runtime-proof=<json> --output-dir=<dir>
  node scripts/mongo-recovery.js restore --manifest=<json> --archive-certification=<json> --attestation=<json> --infrastructure-evidence=<json> --runtime-proof=<json> --output-dir=<dir>
  node scripts/mongo-recovery.js verify --manifest=<json> --archive-certification=<json> --attestation=<json> --infrastructure-evidence=<json> --runtime-proof=<json> --output-dir=<dir>
  node scripts/mongo-recovery.js cleanup --manifest=<json> --attestation=<json> --infrastructure-evidence=<json> --runtime-proof=<json> --output-dir=<dir>
  node scripts/mongo-recovery.js runtime-proof --target-uri-file=<acl> --output=<json> --expected-dbpath-root=<dir> [--purpose=operation|cleanup]
  node scripts/mongo-recovery.js collect-infrastructure-evidence --mode=testing-local-drill --project-id=<uuid> --source-environment=Testing --source-service=<MongoDB> --runtime-proof=<json> --output-dir=<dir> --evidence-id=<id> --collector=<persona> --reviewed-by=<otra>
  node scripts/mongo-recovery.js fingerprint --side=source|target --source-uri-file=<acl>|--target-uri-file=<acl>
  node scripts/mongo-recovery.js create-uri-file --output=<archivo fuera del repo> < URI por stdin

Secretos (solo archivos fuera del repo con ACL verificada, nunca entorno/argv):
  --source-uri-file, --target-uri-file
  CHAMAN_BACKUP_CONFIRM, CHAMAN_RESTORE_CONFIRM, CHAMAN_CLEANUP_CONFIRM`;
}

function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      phase: { type: 'string' },
      purpose: { type: 'string' },
      attestation: { type: 'string' },
      manifest: { type: 'string' },
      'archive-certification': { type: 'string' },
      'output-dir': { type: 'string' },
      'infrastructure-evidence': { type: 'string' },
      'source-uri-file': { type: 'string' },
      'target-uri-file': { type: 'string' },
      'runtime-proof': { type: 'string' },
      'expected-dbpath-root': { type: 'string' },
      mode: { type: 'string' },
      'project-id': { type: 'string' },
      'source-environment': { type: 'string' },
      'source-service': { type: 'string' },
      'target-environment': { type: 'string' },
      'target-service': { type: 'string' },
      'evidence-id': { type: 'string' },
      collector: { type: 'string' },
      'reviewed-by': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      side: { type: 'string' },
      output: { type: 'string' },
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
  hardenRestrictedFile(filePath);
}

function copyRestrictedFileExclusive(sourcePathValue, destinationPath) {
  const sourcePath = path.resolve(sourcePathValue);
  const resolvedDestination = path.resolve(destinationPath);
  if (sourcePath === resolvedDestination) throw new Error('Origen y destino del artefacto sellado no pueden coincidir.');
  fs.copyFileSync(sourcePath, resolvedDestination, fs.constants.COPYFILE_EXCL);
  hardenRestrictedFile(resolvedDestination);
  if (sha256File(sourcePath).toLowerCase() !== sha256File(resolvedDestination).toLowerCase()) {
    throw new Error(`La copia sellada de ${path.basename(destinationPath)} no coincide.`);
  }
  return resolvedDestination;
}

function copyRestrictedFileOnce(sourcePathValue, destinationPath) {
  if (!fs.existsSync(destinationPath)) return copyRestrictedFileExclusive(sourcePathValue, destinationPath);
  verifyRestrictedFile(destinationPath);
  if (sha256File(sourcePathValue).toLowerCase() !== sha256File(destinationPath).toLowerCase()) {
    throw new Error(`El artefacto previo ${path.basename(destinationPath)} no coincide.`);
  }
  return path.resolve(destinationPath);
}

function writeJsonOnce(filePath, value) {
  if (!fs.existsSync(filePath)) {
    writeJsonExclusive(filePath, value);
    return filePath;
  }
  verifyRestrictedFile(filePath);
  if (sha256Json(readJson(filePath)).toLowerCase() !== sha256Json(value).toLowerCase()) {
    throw new Error(`El artefacto previo ${path.basename(filePath)} no coincide.`);
  }
  return filePath;
}

function recordFailureReceipt(outputDirValue, phase, error) {
  if (!outputDirValue) return { written: false, reason: 'output-dir no informado' };
  const outputDir = safeArtifactDirectory(outputDirValue, ROOT);
  if (!fs.existsSync(outputDir) || !fs.statSync(outputDir).isDirectory()) {
    return { written: false, reason: 'output-dir no existe' };
  }
  verifyRestrictedDirectory(outputDir);
  const receiptPath = path.join(outputDir, `${phase}-failure-receipt.json`);
  if (fs.existsSync(receiptPath)) throw new Error(`${path.basename(receiptPath)} ya existe.`);
  const knownArtifacts = new Set([
    'backup.archive.gz',
    'source-inventory.json',
    'source-inventory-before.json',
    'source-inventory-after.json',
    'manifest.json',
    'target-inventory-before.json',
    'target-inventory-after-restore.json',
    'target-inventory-after.json',
    'target-inventory-before-audits.json',
    'target-inventory-after-audits.json',
    'target-runtime-proof-restore.json',
    'target-runtime-proof-verify.json',
    'target-runtime-proof-live-after-restore.json',
    'target-runtime-proof-live-before-audits.json',
    'target-runtime-proof-live-after-audits.json',
    'target-runtime-proof-cleanup.json',
    'target-runtime-proof-live-cleanup.json',
    'target-attestation.json',
    'infrastructure-evidence.json',
    'restore-intent.json',
    'restore-receipt.json',
    'verification.json',
    'archive-certification.json',
    'audit-restored-agronomic-data.json',
    'audit-lote-data-integrity.json',
    'cleanup-receipt.json',
  ]);
  const partialArtifacts = fs
    .readdirSync(outputDir)
    .filter((name) =>
      knownArtifacts.has(name) || /^target-runtime-proof-(?:live-)?cleanup-[0-9a-f]{16}\.json$/i.test(name))
    .sort();
  const safeMessage = redact(error?.message || String(error), []);
  writeJsonExclusive(receiptPath, {
    schemaVersion: 1,
    kind: 'chaman-mongo-recovery-failure-receipt',
    phase,
    failedAt: new Date().toISOString(),
    errorFingerprintSha256: sha256Json({ name: error?.name || 'Error', message: safeMessage }),
    partialArtifacts,
    status: 'failed',
  });
  return { written: true, receiptPath };
}

function withFailureReceipt(phase, values, action) {
  try {
    return action();
  } catch (error) {
    try {
      const receipt = recordFailureReceipt(values['output-dir'], phase, error);
      if (!receipt.written) error.message = `${error.message} [sin failure receipt: ${receipt.reason}]`;
    } catch (receiptError) {
      error.message = `${error.message} [fallo adicional al registrar failure receipt: ${receiptError.message}]`;
    }
    throw error;
  }
}

function executable(name) {
  const overrides = {
    mongosh: process.env.CHAMAN_MONGOSH_BIN,
    mongodump: process.env.CHAMAN_MONGODUMP_BIN,
    mongorestore: process.env.CHAMAN_MONGORESTORE_BIN,
  };
  return overrides[name] || name;
}

function runProcess(program, args, { env = safeChildEnv(), secrets = [], cwd = ROOT } = {}) {
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
  const result = runProcess(executable(tool), ['--version'], { env: safeChildEnv() });
  const line = `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  if (!line) throw new Error(`${tool} no informo version.`);
  if (tool === 'mongodump' || tool === 'mongorestore') assertMongoToolsConfigVersion(line);
  return line.slice(0, 200);
}

function toolVersions(names) {
  return Object.fromEntries(names.map((name) => [name, toolVersion(name)]));
}

function assertCleanGitStatus(statusOutput) {
  if (typeof statusOutput !== 'string') throw new Error('No se pudo acreditar el estado del worktree Git.');
  if (statusOutput.trim()) {
    throw new Error('El dump/certificado exige un worktree Git limpio para que el SHA represente el codigo ejecutado.');
  }
}

function gitSha() {
  const sha = runProcess('git', ['rev-parse', 'HEAD'], { env: safeChildEnv() }).stdout.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Git no devolvio un SHA completo valido.');
  const status = runProcess('git', ['status', '--porcelain', '--untracked-files=normal'], {
    env: safeChildEnv(),
  }).stdout;
  assertCleanGitStatus(status);
  return sha;
}

function readProtectedUri(filePath, label, {
  verifyDirectory = verifyRestrictedDirectory,
  verifyFile = verifyRestrictedFile,
} = {}) {
  if (!filePath) throw new Error(`Falta --${label}-uri-file.`);
  const resolved = path.resolve(filePath);
  verifyDirectory(path.dirname(resolved));
  verifyFile(resolved);
  const uri = fs.readFileSync(resolved, 'utf8').trim();
  if (!/^mongodb(?:\+srv)?:\/\//i.test(uri) || /[\r\n\0]/.test(uri)) {
    throw new Error(`Archivo URI ${label} invalido.`);
  }
  return uri;
}

function inventory(uri, database) {
  const result = withMongoSecretFile(uri, 'raw-uri', (uriFile) =>
    runProcess(executable('mongosh'), buildMongoshArgs(INVENTORY_SCRIPT), {
      env: safeChildEnv({
        CHAMAN_RECOVERY_URI_FILE: uriFile,
        CHAMAN_RECOVERY_DATABASE: database,
      }),
      secrets: [uri],
    }),
  );
  let parsed;
  try {
    parsed = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error('mongosh no devolvio un inventario JSON valido.');
  }
  return normalizeInventory(parsed);
}

function captureRuntimeProof(uri, database, expectedDbPathRoot, { purpose = 'operation' } = {}) {
  const result = withMongoSecretFile(uri, 'raw-uri', (uriFile) =>
    runProcess(executable('mongosh'), buildMongoshArgs(RUNTIME_PROOF_SCRIPT), {
      env: safeChildEnv({
        CHAMAN_RECOVERY_URI_FILE: uriFile,
        CHAMAN_RECOVERY_DATABASE: database,
        CHAMAN_RECOVERY_RUNTIME_PURPOSE: purpose,
      }),
      secrets: [uri],
    }),
  );
  let raw;
  try {
    raw = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error('mongosh no devolvio runtime proof JSON valido.');
  }
  return buildRuntimeProof(raw, { uri, expectedDbPathRoot, purpose });
}

function assertOperationalDrillMode(drillMode) {
  if (drillMode !== TESTING_LOCAL_MODE) {
    throw new Error('Esta version operativa solo permite testing-local-drill; Produccion permanece bloqueada.');
  }
}

function sourceContext(attestationFile, { requireUri = true, evidenceFile, uriFile } = {}) {
  if (!attestationFile) throw new Error('Falta --attestation.');
  const attestation = readJson(attestationFile);
  const validated = validateSourceAttestation(attestation);
  assertOperationalDrillMode(validated.drillMode);
  const evidence = loadInfrastructureEvidence(evidenceFile);
  bindAttestationToEvidence(attestation, validated, evidence, 'source');
  const uri = requireUri ? readProtectedUri(uriFile, 'source') : null;
  if (uri && databaseFromMongoUri(uri) !== validated.database) {
    throw new Error('La base del archivo URI origen no coincide con la atestacion.');
  }
  if (uri) assertRuntimeIdentity(uri, validated.instanceIdentity, 'origen');
  return { attestation, validated, uri, evidence };
}

function targetContext(attestationFile, {
  requireUri = true,
  evidenceFile,
  uriFile,
  runtimeProofFile,
  allowExpired = false,
  requireSealedRuntimeProof = false,
  runtimeProofPurpose = 'operation',
} = {}) {
  if (!attestationFile) throw new Error('Falta --attestation.');
  const attestation = readJson(attestationFile);
  const validated = validateTargetAttestation(attestation, { allowExpired });
  assertOperationalDrillMode(validated.drillMode);
  const evidence = loadInfrastructureEvidence(evidenceFile, { allowExpired });
  bindAttestationToEvidence(attestation, validated, evidence, 'target');
  const uri = requireUri ? readProtectedUri(uriFile, 'target') : null;
  if (uri && databaseFromMongoUri(uri) !== validated.database) {
    throw new Error('La base del archivo URI destino no coincide con la atestacion.');
  }
  if (uri) assertRuntimeIdentity(uri, validated.instanceIdentity, 'destino');
  if (uri && validated.drillMode === TESTING_LOCAL_MODE) parseUriEndpoints(uri);
  let runtimeProof = null;
  if (validated.drillMode === TESTING_LOCAL_MODE) {
    runtimeProof = loadRuntimeProof(runtimeProofFile, {
      expectedDatabase: validated.database,
      purpose: runtimeProofPurpose,
    });
    assertRuntimeProofMatchesEvidence(runtimeProof, evidence.validated.target, {
      requireSealedHash: requireSealedRuntimeProof,
    });
    if (runtimeProof.validated.instanceId !== validated.instanceIdentity.instanceId.toLowerCase()) {
      throw new Error('Runtime proof no coincide con instanceIdentity del destino.');
    }
    if (uri && runtimeProof.validated.endpointFingerprintSha256 !== mongoEndpointFingerprint(uri).endpointFingerprintSha256) {
      throw new Error('URI destino no coincide con runtime proof local.');
    }
  }
  return { attestation, validated, uri, evidence, runtimeProof };
}

function assertTargetAgainstManifest(target, source) {
  if (target.validated.drillId !== source.manifest.drillId) {
    throw new Error('drillId del destino no coincide con el manifiesto de backup.');
  }
  if (target.validated.drillMode !== source.manifest.drillMode) {
    throw new Error('drillMode del destino no coincide con el manifiesto.');
  }
  assertDestinationIsolated(source.manifest.sourceInstance, target.validated.instanceIdentity);
  if (source.manifest.schemaVersion === 1) {
    if (
      target.evidence.sha256.toLowerCase() !== source.manifest.infrastructureEvidenceSha256.toLowerCase() ||
      target.validated.infrastructureEvidenceSha256.toLowerCase() !== source.manifest.infrastructureEvidenceSha256.toLowerCase()
    ) {
      throw new Error('Destino y manifiesto legacy no comparten la misma evidencia Railway inmutable.');
    }
    return;
  }
  const evidenceSource = target.evidence.validated.source;
  if (
    evidenceSource.provider !== source.manifest.sourceInstance.provider ||
    evidenceSource.serviceId !== source.manifest.sourceInstance.instanceId.toLowerCase()
  ) {
    throw new Error('La evidencia target no acredita la misma instancia source sellada en el manifiesto.');
  }
}

function manifestContext(manifestFile, { requireRestrictedAcl = false } = {}) {
  if (!manifestFile) throw new Error('Falta --manifest.');
  const manifestPath = path.resolve(manifestFile);
  const backupDir = path.dirname(manifestPath);
  if (requireRestrictedAcl) {
    verifyRestrictedDirectory(backupDir);
    verifyRestrictedFile(manifestPath);
  }
  const manifest = readJson(manifestPath);
  const verified = validateBackupManifest(manifest, backupDir);
  assertOperationalDrillMode(manifest.drillMode);
  if (requireRestrictedAcl) {
    for (const artifactPath of verified.artifactPaths) verifyRestrictedFile(artifactPath);
  }
  return {
    manifest,
    manifestPath,
    backupDir,
    verified,
  };
}

function describePlan(phase, values, checkTools) {
  const phases = ['dump', 'certify-archive-restore', 'certify-archive-verify', 'restore', 'verify', 'cleanup'];
  if (!phases.includes(phase)) {
    throw new Error(`--phase debe ser ${phases.join(', ')}.`);
  }
  const result = {
    status: 'plan-only',
    phase,
    connectsToMongo: false,
    mutatesMongo: false,
    secretsReadFromAclFilesOnly: true,
    protections: [],
  };
  if (phase === 'dump') {
    const { validated } = sourceContext(values.attestation, {
      requireUri: false,
      evidenceFile: values['infrastructure-evidence'],
    });
    if (!values['output-dir']) throw new Error('Falta --output-dir.');
    safeArtifactDirectory(values['output-dir'], ROOT, { mustNotExist: false });
    result.database = validated.database;
    result.protections = [
      'write-freeze attestation vigente',
      'cinco controles de escritores en true',
      'confirmacion exacta por variable de entorno',
      'observaciones source antes y despues del dump',
      'archive gzip sin sobreescritura',
      'deriva source explicita sin fingir point-in-time',
      'SHA-256 y manifiesto candidato sin secretos',
    ];
    if (checkTools) result.tools = toolVersions(['mongosh', 'mongodump']);
  } else {
    const targetPlan = targetContext(values.attestation, {
      requireUri: false,
      evidenceFile: values['infrastructure-evidence'],
      runtimeProofFile: values['runtime-proof'],
      allowExpired: phase === 'cleanup',
      runtimeProofPurpose: phase === 'cleanup' ? 'cleanup' : 'operation',
    });
    const { validated } = targetPlan;
    if (!values['output-dir']) throw new Error('Falta --output-dir.');
    safeArtifactDirectory(values['output-dir'], ROOT, { mustNotExist: false });
    result.database = validated.database;
    result.protections = [
      'destino dedicado, descartable y sin trafico productivo',
      'nombre de base con prefijo de recovery drill',
      'confirmacion exacta por variable de entorno para escrituras',
    ];
    const source = manifestContext(values.manifest);
    assertTargetAgainstManifest(targetPlan, source);
    if (phase !== 'cleanup' && source.manifest.schemaVersion !== 2) {
      throw new Error('Las fases nuevas exigen manifiesto candidato schema v2.');
    }
    if (['restore', 'verify'].includes(phase)) {
      const certification = loadArchiveCertification(values['archive-certification'], source);
      if (certification.validated.certificationDatabase === validated.database) {
        throw new Error('El segundo restore debe usar otra base distinta de la certificacion.');
      }
      result.archiveCertificationSha256 = certification.sha256;
    } else if (['certify-archive-restore', 'certify-archive-verify'].includes(phase) && values['archive-certification']) {
      throw new Error('La primera restauracion no acepta un certificado preexistente.');
    }
    result.sourceDatabase = source.manifest.database;
    if (checkTools) {
      result.tools = toolVersions(
        ['restore', 'certify-archive-restore'].includes(phase)
          ? ['mongosh', 'mongorestore']
          : ['mongosh'],
      );
    }
  }
  return result;
}

function dumpCommand(values) {
  const { attestation, validated, uri } = sourceContext(values.attestation, {
    evidenceFile: values['infrastructure-evidence'],
    uriFile: values['source-uri-file'],
  });
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
  hardenRestrictedDirectory(outputDir);
  const archivePath = path.join(outputDir, 'backup.archive.gz');
  const inventoryBeforePath = path.join(outputDir, 'source-inventory-before.json');
  const inventoryAfterPath = path.join(outputDir, 'source-inventory-after.json');
  const manifestPath = path.join(outputDir, 'manifest.json');
  try {
    const sourceGitSha = gitSha();
    const tools = toolVersions(['mongosh', 'mongodump']);
    const sourceInventoryBefore = inventory(uri, validated.database);
    writeJsonExclusive(inventoryBeforePath, sourceInventoryBefore);
    withMongoSecretFile(uri, 'tools-yaml', (configPath) =>
      runProcess(executable('mongodump'), buildMongodumpArgs(configPath, validated.database, archivePath), {
        env: safeChildEnv(),
        secrets: [uri],
      }),
    );
    if (!fs.existsSync(archivePath) || fs.statSync(archivePath).size === 0) {
      throw new Error('mongodump no produjo un archive no vacio.');
    }
    hardenRestrictedFile(archivePath);
    const sourceInventoryAfter = inventory(uri, validated.database);
    writeJsonExclusive(inventoryAfterPath, sourceInventoryAfter);
    const manifest = buildBackupManifest({
      attestation,
      inventoryBefore: sourceInventoryBefore,
      inventoryAfter: sourceInventoryAfter,
      archivePath,
      inventoryBeforePath,
      inventoryAfterPath,
      tools,
      gitSha: sourceGitSha,
    });
    writeJsonExclusive(manifestPath, manifest);
    validateBackupManifest(manifest, outputDir);
    return {
      status: 'candidate-sealed',
      drillId: validated.id,
      database: validated.database,
      manifest: manifestPath,
      archiveSha256: manifest.archive.sha256,
      sourcePointInTimeGuaranteed: manifest.sourceObservation.sourcePointInTimeGuaranteed,
      sourceDrift: manifest.sourceObservation.comparison,
      reminder: 'El archive es candidato hasta completar certificacion local y segundo restore exacto; source before/after no describen por si solos su contenido.',
    };
  } catch (error) {
    throw new Error(`Backup no sellado; no usar sus artefactos. ${error.message}`);
  }
}

function verifyBackupCommand(values) {
  const context = manifestContext(values.manifest, { requireRestrictedAcl: true });
  return {
    status: context.manifest.schemaVersion === 2 ? 'archive-candidate-verified' : 'legacy-backup-verified',
    drillId: context.manifest.drillId,
    database: context.manifest.database,
    archiveSha256: context.manifest.archive.sha256,
    certificationRequired: context.manifest.schemaVersion === 2,
    sourcePointInTimeGuaranteed: context.verified.sourcePointInTimeGuaranteed,
  };
}

function ensureEmptyTarget(targetInventory) {
  if (targetInventory.collections.length !== 0) {
    throw new Error(`El destino no esta vacio: contiene ${targetInventory.collections.length} colecciones.`);
  }
}

function restoreCommand(values, { restoreRole = 'final' } = {}) {
  if (!['certification', 'final'].includes(restoreRole)) throw new Error('restoreRole invalido.');
  if (restoreRole === 'certification' && values['archive-certification']) {
    throw new Error('La primera restauracion no acepta un certificado preexistente.');
  }
  const target = targetContext(values.attestation, {
    evidenceFile: values['infrastructure-evidence'],
    uriFile: values['target-uri-file'],
    runtimeProofFile: values['runtime-proof'],
  });
  const source = manifestContext(values.manifest, { requireRestrictedAcl: true });
  if (source.manifest.schemaVersion !== 2 || source.manifest.certificationRequired !== true) {
    throw new Error('Los restores nuevos exigen manifiesto candidato schema v2. Legacy queda disponible solo para cleanup.');
  }
  assertTargetAgainstManifest(target, source);
  const certification = restoreRole === 'final'
    ? loadArchiveCertification(values['archive-certification'], source)
    : null;
  if (restoreRole === 'final' && certification.validated.certificationDatabase === target.validated.database) {
    throw new Error('El segundo restore debe usar otra base vacia distinta de la usada para certificar.');
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
  hardenRestrictedDirectory(outputDir);
  const beforePath = path.join(outputDir, 'target-inventory-before.json');
  const restoreRuntimeProofPath = path.join(outputDir, 'target-runtime-proof-restore.json');
  const targetAttestationPath = path.join(outputDir, 'target-attestation.json');
  const infrastructureEvidencePath = path.join(outputDir, 'infrastructure-evidence.json');
  const intentPath = path.join(outputDir, 'restore-intent.json');
  const receiptPath = path.join(outputDir, 'restore-receipt.json');
  if (fs.existsSync(restoreRuntimeProofPath) || fs.existsSync(intentPath) || fs.existsSync(receiptPath)) {
    throw new Error('Ya existe runtime proof/intent/receipt de restore; no se repetira el restore.');
  }
  toolVersions(['mongosh', 'mongorestore']);
  const before = inventory(target.uri, target.validated.database);
  ensureEmptyTarget(before);
  assertCompatibleMongoVersions(source.manifest.mongoServerVersion, before.serverVersion);
  writeJsonExclusive(beforePath, before);
  copyRestrictedFileExclusive(target.runtimeProof.path, restoreRuntimeProofPath);
  copyRestrictedFileExclusive(path.resolve(values.attestation), targetAttestationPath);
  copyRestrictedFileExclusive(target.evidence.path, infrastructureEvidencePath);
  for (const capture of target.evidence.validated.captures) {
    copyRestrictedFileExclusive(
      path.join(path.dirname(target.evidence.path), capture.file),
      path.join(outputDir, capture.file),
    );
  }
  if (sha256File(restoreRuntimeProofPath).toLowerCase() !== target.runtimeProof.sha256.toLowerCase()) {
    throw new Error('La copia sellada del runtime proof de restore no coincide.');
  }
  const intent = {
    schemaVersion: 2,
    kind: 'chaman-mongo-restore-intent',
    restoreRole,
    drillId: target.validated.drillId,
    sourceManifestSha256: sha256File(source.manifestPath),
    targetAttestationSha256: sha256File(targetAttestationPath),
    infrastructureEvidenceSha256: sha256File(infrastructureEvidencePath),
    targetRuntimeProofSha256: sha256File(restoreRuntimeProofPath),
    archiveCertificationSha256: certification?.sha256 || null,
    sourceDatabase: source.manifest.database,
    targetDatabase: target.validated.database,
    emptyInventorySha256: sha256File(beforePath),
    authorizedAt: new Date().toISOString(),
    status: 'restore-authorized',
  };
  writeJsonExclusive(intentPath, intent);
  const liveRuntime = captureRuntimeProof(
    target.uri,
    target.validated.database,
    path.dirname(target.runtimeProof.value.mongo.dbPath),
  );
  const liveValidated = validateRuntimeProof(liveRuntime, { expectedDatabase: target.validated.database });
  assertSameRuntimeForCleanup(target.runtimeProof.validated, liveValidated);
  const startedAt = new Date().toISOString();
  withMongoSecretFile(target.uri, 'tools-yaml', (configPath) =>
    runProcess(
      executable('mongorestore'),
      buildMongorestoreArgs(
        configPath,
        source.verified.archivePath,
        source.manifest.database,
        target.validated.database,
      ),
      { env: safeChildEnv(), secrets: [target.uri] },
    ),
  );
  const postRestoreRuntime = captureRuntimeProof(
    target.uri,
    target.validated.database,
    path.dirname(target.runtimeProof.value.mongo.dbPath),
  );
  const postRestoreValidated = validateRuntimeProof(postRestoreRuntime, {
    expectedDatabase: target.validated.database,
  });
  assertSameRuntimeForCleanup(liveValidated, postRestoreValidated);
  const postRestoreRuntimePath = path.join(outputDir, 'target-runtime-proof-live-after-restore.json');
  writeJsonExclusive(postRestoreRuntimePath, postRestoreRuntime);
  const afterRestore = inventory(target.uri, target.validated.database);
  const afterRestorePath = path.join(outputDir, 'target-inventory-after-restore.json');
  writeJsonExclusive(afterRestorePath, afterRestore);
  const restoreComparison = certification
    ? compareInventories(certification.validated.inventory, afterRestore)
    : null;
  if (certification && !restoreComparison.ok) {
    throw new Error('El segundo restore no coincide exactamente con el inventario certificado del archive.');
  }
  const receipt = {
    schemaVersion: 2,
    kind: 'chaman-mongo-restore-receipt',
    restoreRole,
    drillId: target.validated.drillId,
    sourceManifestSha256: sha256File(source.manifestPath),
    targetAttestationSha256: sha256File(targetAttestationPath),
    infrastructureEvidenceSha256: sha256File(infrastructureEvidencePath),
    targetRuntimeProofSha256: sha256File(restoreRuntimeProofPath),
    archiveCertificationSha256: certification?.sha256 || null,
    restoreIntentSha256: sha256File(intentPath),
    sourceDatabase: source.manifest.database,
    targetDatabase: target.validated.database,
    targetMongoVersion: before.serverVersion,
    startedAt,
    completedAt: new Date().toISOString(),
    postRestoreRuntime: {
      file: path.basename(postRestoreRuntimePath),
      sha256: sha256File(postRestoreRuntimePath),
      valueSha256: sha256Json(postRestoreRuntime),
    },
    restoredInventory: {
      file: path.basename(afterRestorePath),
      sha256: sha256File(afterRestorePath),
      collections: afterRestore.collections.length,
      documents: afterRestore.collections.reduce((sum, item) => sum + (item.count || 0), 0),
      certifiedComparison: restoreComparison,
    },
    status: 'restored-unverified',
  };
  writeJsonExclusive(receiptPath, receipt);
  return { status: receipt.status, receipt: receiptPath, targetDatabase: target.validated.database };
}

function runAudit(program, args, env, secrets, outputPath) {
  const result = runProcess(program, args, { env, secrets });
  fs.writeFileSync(outputPath, result.stdout, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  hardenRestrictedFile(outputPath);
  return { file: path.basename(outputPath), sha256: sha256File(outputPath) };
}

function verifyCommand(values, { restoreRole = 'final' } = {}) {
  if (!['certification', 'final'].includes(restoreRole)) throw new Error('restoreRole invalido.');
  const certifierGitSha = restoreRole === 'certification' ? gitSha() : null;
  if (restoreRole === 'certification' && values['archive-certification']) {
    throw new Error('La verificacion de certificacion no acepta un certificado preexistente.');
  }
  const target = targetContext(values.attestation, {
    evidenceFile: values['infrastructure-evidence'],
    uriFile: values['target-uri-file'],
    runtimeProofFile: values['runtime-proof'],
  });
  const source = manifestContext(values.manifest, { requireRestrictedAcl: true });
  if (source.manifest.schemaVersion !== 2 || source.manifest.certificationRequired !== true) {
    throw new Error('Verify nuevo exige manifiesto candidato schema v2. Legacy queda disponible solo para cleanup.');
  }
  assertTargetAgainstManifest(target, source);
  const certification = restoreRole === 'final'
    ? loadArchiveCertification(values['archive-certification'], source)
    : null;
  if (restoreRole === 'final' && certification.validated.certificationDatabase === target.validated.database) {
    throw new Error('Verify final debe corresponder al segundo restore en otra base.');
  }
  if (!values['output-dir']) throw new Error('Falta --output-dir.');
  const outputDir = safeArtifactDirectory(values['output-dir'], ROOT);
  verifyRestrictedDirectory(outputDir);
  const receiptPath = path.join(outputDir, 'restore-receipt.json');
  const intentPath = path.join(outputDir, 'restore-intent.json');
  const beforePath = path.join(outputDir, 'target-inventory-before.json');
  const restoreRuntimeProofPath = path.join(outputDir, 'target-runtime-proof-restore.json');
  const receipt = readJson(receiptPath);
  const intent = readJson(intentPath);
  const originalRuntimeProof = loadRuntimeProof(restoreRuntimeProofPath, {
    expectedDatabase: target.validated.database,
    allowExpired: true,
  });
  assertRuntimeProofMatchesEvidence(originalRuntimeProof, target.evidence.validated.target, {
    requireSealedHash: false,
  });
  const bindingExpectation = {
    drillId: target.validated.drillId,
    sourceDatabase: source.manifest.database,
    targetDatabase: target.validated.database,
    sourceManifestSha256: sha256File(source.manifestPath),
    targetAttestationSha256: sha256File(path.resolve(values.attestation)),
    infrastructureEvidenceSha256: target.evidence.sha256,
    targetRuntimeProofSha256: originalRuntimeProof.sha256,
  };
  assertCleanupReceiptBindings(intent, { ...bindingExpectation, expectedKind: 'chaman-mongo-restore-intent' });
  assertCleanupReceiptBindings(receipt, { ...bindingExpectation, expectedKind: 'chaman-mongo-restore-receipt' });
  const expectedCertificationSha256 = certification?.sha256 || null;
  if (
    intent.restoreRole !== restoreRole ||
    receipt.restoreRole !== restoreRole ||
    intent.archiveCertificationSha256 !== expectedCertificationSha256 ||
    receipt.archiveCertificationSha256 !== expectedCertificationSha256
  ) {
    throw new Error('Intent/receipt no coinciden con el rol y certificado esperados.');
  }
  if (String(receipt.restoreIntentSha256 || '').toLowerCase() !== sha256File(intentPath).toLowerCase()) {
    throw new Error('El recibo de restore no coincide con el intent original.');
  }
  if (
    String(intent.emptyInventorySha256 || '').toLowerCase() !== sha256File(beforePath).toLowerCase()
  ) {
    throw new Error('El intent de restore no coincide con el inventario vacío original.');
  }
  const stability = assertRestoreStabilityDelay(receipt.completedAt);
  ensureEmptyTarget(normalizeInventory(readJson(beforePath)));
  const restoredInventoryFile = receipt.restoredInventory?.file;
  if (
    restoredInventoryFile !== 'target-inventory-after-restore.json' ||
    !/^[0-9a-f]{64}$/i.test(receipt.restoredInventory?.sha256 || '')
  ) {
    throw new Error('El recibo no contiene inventario post-restore verificable.');
  }
  const restoredInventoryPath = path.join(outputDir, restoredInventoryFile);
  if (
    !fs.existsSync(restoredInventoryPath) ||
    sha256File(restoredInventoryPath).toLowerCase() !== receipt.restoredInventory.sha256.toLowerCase()
  ) {
    throw new Error('El inventario post-restore fue alterado o falta.');
  }
  const immediateInventory = normalizeInventory(readJson(restoredInventoryPath));
  const expectedInventory = certification?.validated.inventory || immediateInventory;
  const immediateComparison = compareInventories(expectedInventory, immediateInventory);
  if (!immediateComparison.ok) {
    throw new Error('El inventario inmediato no coincide con la referencia inmutable esperada.');
  }
  const verifyRuntimeProofPath = path.join(outputDir, 'target-runtime-proof-verify.json');
  copyRestrictedFileExclusive(target.runtimeProof.path, verifyRuntimeProofPath);
  const liveRuntime = captureRuntimeProof(
    target.uri,
    target.validated.database,
    path.dirname(target.runtimeProof.value.mongo.dbPath),
  );
  const liveValidated = validateRuntimeProof(liveRuntime, { expectedDatabase: target.validated.database });
  assertSameRuntimeForCleanup(target.runtimeProof.validated, liveValidated);
  const liveRuntimePath = path.join(outputDir, 'target-runtime-proof-live-before-audits.json');
  writeJsonExclusive(liveRuntimePath, liveRuntime);
  const beforeAudits = inventory(target.uri, target.validated.database);
  const beforeAuditsPath = path.join(outputDir, 'target-inventory-before-audits.json');
  writeJsonExclusive(beforeAuditsPath, beforeAudits);
  const { auditMatrix, auditLotes } = withMongoSecretFile(target.uri, 'raw-uri', (uriFile) => {
    const auditEnv = safeChildEnv({
      CHAMAN_RECOVERY_URI_FILE: uriFile,
      DB_NAME: target.validated.database,
      CHAMAN_RECOVERY_DRILL: 'true',
    });
    return {
      auditMatrix: runAudit(process.execPath, [AGRONOMIC_AUDIT], auditEnv, [target.uri],
        path.join(outputDir, 'audit-restored-agronomic-data.json')),
      auditLotes: runAudit(process.execPath,
        [path.join(ROOT, 'scripts', 'audit-lote-data-integrity.js')],
        { ...auditEnv, CHAMAN_AUDIT_STRICT: 'false' }, [target.uri],
        path.join(outputDir, 'audit-lote-data-integrity.json')),
    };
  });
  const agronomic = readJson(path.join(outputDir, auditMatrix.file));
  const lotIntegrity = readJson(path.join(outputDir, auditLotes.file));
  const lotIssueTypes = Object.fromEntries(
    (lotIntegrity.issueSamples || []).reduce((counts, issue) => {
      counts.set(issue.type, (counts.get(issue.type) || 0) + 1);
      return counts;
    }, new Map()),
  );
  const postAuditRuntime = captureRuntimeProof(
    target.uri,
    target.validated.database,
    path.dirname(target.runtimeProof.value.mongo.dbPath),
  );
  const postAuditValidated = validateRuntimeProof(postAuditRuntime, {
    expectedDatabase: target.validated.database,
  });
  assertSameRuntimeForCleanup(liveValidated, postAuditValidated);
  const postAuditRuntimePath = path.join(outputDir, 'target-runtime-proof-live-after-audits.json');
  writeJsonExclusive(postAuditRuntimePath, postAuditRuntime);
  const afterAudits = inventory(target.uri, target.validated.database);
  const afterAuditsPath = path.join(outputDir, 'target-inventory-after-audits.json');
  writeJsonExclusive(afterAuditsPath, afterAudits);
  const inventoryStability = evaluateAuditInventoryStability(
    expectedInventory,
    beforeAudits,
    afterAudits,
  );
  const verification = {
    schemaVersion: 2,
    kind: 'chaman-mongo-restore-verification',
    restoreRole,
    drillId: target.validated.drillId,
    sourceManifestSha256: sha256File(source.manifestPath),
    archiveCertificationSha256: certification?.sha256 || null,
    restoreReceiptSha256: sha256File(receiptPath),
    sourceDatabase: source.manifest.database,
    targetDatabase: target.validated.database,
    currentRuntimeProofSha256: sha256File(verifyRuntimeProofPath),
    liveRuntimeValueSha256: sha256Json(liveRuntime),
    postAuditRuntimeValueSha256: sha256Json(postAuditRuntime),
    runtimeProcessId: liveValidated.processId,
    verifiedAt: new Date().toISOString(),
    ...stability,
    inventory: {
      ...inventoryStability.sourceAfterAudits,
      file: path.basename(afterAuditsPath),
      sha256: sha256File(afterAuditsPath),
    },
    auditWindowInventory: {
      ok: inventoryStability.ok,
      immediate: {
        file: path.basename(restoredInventoryPath),
        sha256: sha256File(restoredInventoryPath),
        expectedComparison: immediateComparison,
      },
      beforeAudits: {
        file: path.basename(beforeAuditsPath),
        sha256: sha256File(beforeAuditsPath),
        sourceComparison: inventoryStability.sourceBeforeAudits,
      },
      afterAudits: {
        file: path.basename(afterAuditsPath),
        sha256: sha256File(afterAuditsPath),
        sourceComparison: inventoryStability.sourceAfterAudits,
      },
      beforeVsAfter: inventoryStability.beforeVsAfterAudits,
    },
    audits: {
      agronomicMatrix: { ...auditMatrix, ok: agronomic.ok === true, summary: agronomic.summary },
      lotIntegrity: {
        ...auditLotes,
        ok: lotIntegrity.ok === true,
        counters: lotIntegrity.counters,
        issueTypes: lotIssueTypes,
        blockingForRestoreEquality: true,
      },
    },
    status: inventoryStability.ok && agronomic.ok === true && lotIntegrity.ok === true ? 'passed' : 'failed',
  };
  const verificationPath = path.join(outputDir, 'verification.json');
  writeJsonExclusive(verificationPath, verification);
  if (verification.status !== 'passed') {
    throw new Error(`El simulacro no paso. Evidencia: ${verificationPath}`);
  }
  if (restoreRole === 'certification') {
    const certificatePath = path.join(outputDir, 'archive-certification.json');
    const certificate = buildArchiveCertification({
      drillId: target.validated.drillId,
      drillMode: target.validated.drillMode,
      sourceDatabase: source.manifest.database,
      certificationDatabase: target.validated.database,
      sourceManifestSha256: sha256File(source.manifestPath),
      archiveSha256: source.manifest.archive.sha256,
      certificationTarget: {
        targetAttestationSha256: sha256File(path.join(outputDir, 'target-attestation.json')),
        infrastructureEvidenceSha256: sha256File(path.join(outputDir, 'infrastructure-evidence.json')),
        targetRuntimeProofSha256: originalRuntimeProof.sha256,
        verificationRuntimeProofSha256: sha256File(verifyRuntimeProofPath),
        instanceId: originalRuntimeProof.validated.instanceId,
        endpointFingerprintSha256: originalRuntimeProof.validated.endpointFingerprintSha256,
        replicaSet: originalRuntimeProof.validated.replicaSet,
        dbPathSha256: originalRuntimeProof.validated.dbPathSha256,
        processId: originalRuntimeProof.validated.processId,
        verificationProcessId: target.runtimeProof.validated.processId,
      },
      restoreArtifacts: {
        intent: { file: path.basename(intentPath), sha256: sha256File(intentPath) },
        receipt: { file: path.basename(receiptPath), sha256: sha256File(receiptPath) },
        verification: { file: path.basename(verificationPath), sha256: sha256File(verificationPath) },
        runtimeProof: {
          file: path.basename(restoreRuntimeProofPath),
          sha256: sha256File(restoreRuntimeProofPath),
        },
        verifyRuntimeProof: {
          file: path.basename(verifyRuntimeProofPath),
          sha256: sha256File(verifyRuntimeProofPath),
        },
        postRestoreRuntime: {
          file: 'target-runtime-proof-live-after-restore.json',
          sha256: sha256File(path.join(outputDir, 'target-runtime-proof-live-after-restore.json')),
        },
        liveBeforeAuditsRuntime: {
          file: path.basename(liveRuntimePath),
          sha256: sha256File(liveRuntimePath),
        },
        liveAfterAuditsRuntime: {
          file: path.basename(postAuditRuntimePath),
          sha256: sha256File(postAuditRuntimePath),
        },
        targetAttestation: {
          file: 'target-attestation.json',
          sha256: sha256File(path.join(outputDir, 'target-attestation.json')),
        },
        infrastructureEvidence: {
          file: 'infrastructure-evidence.json',
          sha256: sha256File(path.join(outputDir, 'infrastructure-evidence.json')),
        },
        emptyInventory: {
          file: path.basename(beforePath),
          sha256: sha256File(beforePath),
        },
        beforeAuditsInventory: {
          file: path.basename(beforeAuditsPath),
          sha256: sha256File(beforeAuditsPath),
        },
      },
      inventory: {
        file: path.basename(afterAuditsPath),
        sha256: sha256File(afterAuditsPath),
        collections: afterAudits.collections.length,
        documents: afterAudits.collections.reduce((sum, item) => sum + (item.count || 0), 0),
        serverVersion: afterAudits.serverVersion,
        capturedAt: afterAudits.capturedAt,
      },
      audits: {
        agronomic: { file: auditMatrix.file, sha256: auditMatrix.sha256 },
        lotIntegrity: { file: auditLotes.file, sha256: auditLotes.sha256 },
      },
      sourceObservation: {
        sourcePointInTimeGuaranteed: source.verified.sourcePointInTimeGuaranteed,
        comparison: source.verified.sourceComparison,
        beforeToCertified: compareInventories(source.verified.sourceBefore, afterAudits),
        afterToCertified: compareInventories(source.verified.sourceAfter, afterAudits),
      },
      certifierGitSha,
      tools: toolVersions(['mongosh', 'mongorestore']),
      certifiedAt: verification.verifiedAt,
      status: 'certified',
    });
    writeJsonExclusive(certificatePath, certificate);
    loadArchiveCertification(certificatePath, source, { requireCleanup: false });
    return {
      status: 'certified',
      certificate: certificatePath,
      sourcePointInTimeGuaranteed: source.verified.sourcePointInTimeGuaranteed,
      targetDatabase: target.validated.database,
    };
  }
  return {
    status: 'passed',
    evidence: verificationPath,
    archiveCertificationSha256: certification.sha256,
    targetDatabase: target.validated.database,
  };
}

function assertCleanupReceiptBindings(receipt, {
  drillId,
  sourceDatabase,
  targetDatabase,
  sourceManifestSha256,
  targetAttestationSha256,
  infrastructureEvidenceSha256,
  targetRuntimeProofSha256,
  expectedKind,
}) {
  if (
    receipt.kind !== expectedKind ||
    receipt.drillId !== drillId ||
    receipt.sourceDatabase !== sourceDatabase ||
    receipt.targetDatabase !== targetDatabase ||
    String(receipt.sourceManifestSha256 || '').toLowerCase() !== sourceManifestSha256.toLowerCase() ||
    String(receipt.targetAttestationSha256 || '').toLowerCase() !== targetAttestationSha256.toLowerCase() ||
    String(receipt.infrastructureEvidenceSha256 || '').toLowerCase() !== infrastructureEvidenceSha256.toLowerCase() ||
    String(receipt.targetRuntimeProofSha256 || '').toLowerCase() !== targetRuntimeProofSha256.toLowerCase()
  ) {
    throw new Error('Artefacto original de restore no coincide con manifiesto, atestacion, evidencia y runtime proof.');
  }
}

function assertSameRuntimeForCleanup(provided, live) {
  for (const key of ['instanceId', 'endpointFingerprintSha256', 'replicaSet', 'dbPathSha256']) {
    if (String(live[key]).toLowerCase() !== String(provided[key]).toLowerCase()) {
      throw new Error(`Cleanup rechazado: la prueba runtime nueva difiere en ${key}.`);
    }
  }
  if (live.processId !== provided.processId) {
    throw new Error('Cleanup rechazado: Mongo reinicio desde que se capturo la prueba runtime fresca.');
  }
}

function assertDropConfirmed(dropped, database) {
  if (dropped.database !== database || dropped.ok !== true || dropped.rescanFound !== false) {
    throw new Error('MongoDB no confirmo drop + rescan del destino esperado.');
  }
}

function assertCleanupRuntimeSchema(manifestSchemaVersion, currentRuntimeSchemaVersion) {
  if (manifestSchemaVersion === 2 && currentRuntimeSchemaVersion !== 2) {
    throw new Error('Cleanup de una cadena v2 exige runtime proof corriente schema v2 antes del drop.');
  }
}

function cleanupCommand(values) {
  const target = targetContext(values.attestation, {
    evidenceFile: values['infrastructure-evidence'],
    uriFile: values['target-uri-file'],
    runtimeProofFile: values['runtime-proof'],
    allowExpired: true,
    requireSealedRuntimeProof: false,
    runtimeProofPurpose: 'cleanup',
  });
  const source = manifestContext(values.manifest, { requireRestrictedAcl: true });
  assertTargetAgainstManifest(target, source);
  assertCleanupRuntimeSchema(source.manifest.schemaVersion, target.runtimeProof?.validated.schemaVersion);
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
  verifyRestrictedDirectory(outputDir);
  const receiptPath = path.join(outputDir, 'cleanup-receipt.json');
  if (fs.existsSync(receiptPath)) throw new Error('Ya existe cleanup-receipt.json; no se repetira el drop.');
  const restoreReceiptPath = path.join(outputDir, 'restore-receipt.json');
  const restoreIntentPath = path.join(outputDir, 'restore-intent.json');
  const beforePath = path.join(outputDir, 'target-inventory-before.json');
  const restoreRuntimeProofPath = path.join(outputDir, 'target-runtime-proof-restore.json');
  const restoreIntent = readJson(restoreIntentPath);
  const originalRuntimeProof = loadRuntimeProof(restoreRuntimeProofPath, {
    expectedDatabase: target.validated.database,
    allowExpired: true,
    purpose: 'cleanup',
  });
  assertRuntimeProofMatchesEvidence(originalRuntimeProof, target.evidence.validated.target, {
    requireSealedHash: false,
  });
  const bindingExpectation = {
    drillId: target.validated.drillId,
    sourceDatabase: source.manifest.database,
    targetDatabase: target.validated.database,
    sourceManifestSha256: sha256File(source.manifestPath),
    targetAttestationSha256: sha256File(path.resolve(values.attestation)),
    infrastructureEvidenceSha256: target.evidence.sha256,
    targetRuntimeProofSha256: originalRuntimeProof.sha256,
  };
  assertCleanupReceiptBindings(restoreIntent, {
    ...bindingExpectation,
    expectedKind: 'chaman-mongo-restore-intent',
  });
  if (String(restoreIntent.emptyInventorySha256 || '').toLowerCase() !== sha256File(beforePath).toLowerCase()) {
    throw new Error('Cleanup rechazado: restore intent no coincide con el inventario vacío original.');
  }
  ensureEmptyTarget(normalizeInventory(readJson(beforePath)));
  let restoreReceiptSha256 = null;
  if (fs.existsSync(restoreReceiptPath)) {
    const restoreReceipt = readJson(restoreReceiptPath);
    assertCleanupReceiptBindings(restoreReceipt, {
      ...bindingExpectation,
      expectedKind: 'chaman-mongo-restore-receipt',
    });
    if (String(restoreReceipt.restoreIntentSha256 || '').toLowerCase() !== sha256File(restoreIntentPath).toLowerCase()) {
      throw new Error('Cleanup rechazado: restore receipt no coincide con restore intent original.');
    }
    restoreReceiptSha256 = sha256File(restoreReceiptPath);
  }
  let liveRuntime = null;
  let liveValidated = null;
  if (target.validated.drillMode === TESTING_LOCAL_MODE) {
    const expectedRoot = path.dirname(target.runtimeProof.value.mongo.dbPath);
    liveRuntime = captureRuntimeProof(target.uri, target.validated.database, expectedRoot, {
      purpose: 'cleanup',
    });
    liveValidated = validateRuntimeProof(liveRuntime, {
      expectedDatabase: target.validated.database,
      purpose: 'cleanup',
    });
    assertSameRuntimeForCleanup(target.runtimeProof.validated, liveValidated);
  }
  const result = withMongoSecretFile(target.uri, 'raw-uri', (uriFile) =>
    runProcess(executable('mongosh'), buildMongoshArgs(DROP_SCRIPT), {
      env: safeChildEnv({
        CHAMAN_RECOVERY_URI_FILE: uriFile,
        CHAMAN_RECOVERY_DATABASE: target.validated.database,
        CHAMAN_RECOVERY_DRILL_ID: target.validated.drillId,
        CHAMAN_RECOVERY_EXPECTED_PID: String(liveValidated.processId),
        CHAMAN_RECOVERY_DROP_CONFIRM: expectedConfirmation(
          'cleanup',
          target.validated.drillId,
          target.validated.database,
        ),
      }),
      secrets: [target.uri],
    }),
  );
  const dropped = JSON.parse(result.stdout.trim());
  assertDropConfirmed(dropped, target.validated.database);
  const freshRuntimeProofSha256 = target.runtimeProof.sha256.toLowerCase();
  const liveRuntimeValueSha256 = sha256Json(liveRuntime).toLowerCase();
  const cleanupRuntimeProofPath = path.join(
    outputDir,
    `target-runtime-proof-cleanup-${freshRuntimeProofSha256.slice(0, 16)}.json`,
  );
  const liveCleanupRuntimeProofPath = path.join(
    outputDir,
    `target-runtime-proof-live-cleanup-${liveRuntimeValueSha256.slice(0, 16)}.json`,
  );
  copyRestrictedFileOnce(target.runtimeProof.path, cleanupRuntimeProofPath);
  writeJsonOnce(liveCleanupRuntimeProofPath, liveRuntime);
  const completedAt = new Date();
  writeJsonExclusive(receiptPath, {
    schemaVersion: 1,
    kind: 'chaman-mongo-cleanup-receipt',
    drillId: target.validated.drillId,
    database: target.validated.database,
    sourceManifestSha256: sha256File(source.manifestPath),
    targetAttestationSha256: sha256File(path.resolve(values.attestation)),
    infrastructureEvidenceSha256: target.evidence.sha256,
    restoreIntentSha256: sha256File(restoreIntentPath),
    restoreReceiptSha256,
    originalTargetRuntimeProofSha256: originalRuntimeProof.sha256,
    freshRuntimeProofFile: path.basename(cleanupRuntimeProofPath),
    freshRuntimeProofSha256: sha256File(cleanupRuntimeProofPath),
    liveRuntimeProofFile: path.basename(liveCleanupRuntimeProofPath),
    liveRuntimeProofSha256: sha256File(liveCleanupRuntimeProofPath),
    runtimeProcessId: target.runtimeProof?.validated.processId || null,
    liveRuntimeValueSha256,
    originalAttestationExpired: completedAt >= target.validated.expiresAt,
    rescanFound: false,
    completedAt: completedAt.toISOString(),
    status: 'dropped',
  });
  return { status: 'dropped', database: target.validated.database, receipt: receiptPath };
}

function main() {
  assertNoMongoUriEnvironment();
  const { command, values } = parseCli(process.argv.slice(2));
  let result;
  if (command === 'help') {
    console.log(usage());
    return;
  }
  if (command === 'create-uri-file') {
    if (!values.output) throw new Error('Falta --output.');
    const output = path.resolve(values.output);
    safeArtifactDirectory(path.dirname(output), ROOT);
    if (fs.existsSync(output)) throw new Error('El archivo URI ya existe.');
    const secretDir = path.dirname(output);
    if (fs.existsSync(secretDir)) {
      verifyRestrictedDirectory(secretDir);
    } else {
      if (!fs.existsSync(path.dirname(secretDir))) throw new Error('El padre del directorio secreto debe existir.');
      fs.mkdirSync(secretDir, { recursive: false, mode: 0o700 });
      hardenRestrictedDirectory(secretDir);
    }
    const uri = fs.readFileSync(0, 'utf8').trim();
    if (!/^mongodb(?:\+srv)?:\/\//i.test(uri) || /[\r\n\0]/.test(uri)) throw new Error('URI stdin invalida.');
    fs.writeFileSync(output, uri, { flag: 'wx', mode: 0o600 });
    hardenRestrictedFile(output);
    console.log(JSON.stringify({ status: 'created', file: output }));
    return;
  }
  if (command === 'runtime-proof') {
    if (!values.output) throw new Error('Falta --output.');
    if (!values['expected-dbpath-root']) throw new Error('Falta --expected-dbpath-root.');
    const output = path.resolve(values.output);
    safeArtifactDirectory(path.dirname(output), ROOT);
    if (!fs.existsSync(path.dirname(output))) throw new Error('El directorio padre de output debe existir.');
    verifyRestrictedDirectory(path.dirname(output));
    if (fs.existsSync(output)) throw new Error('El runtime proof ya existe.');
    const uri = readProtectedUri(values['target-uri-file'], 'target');
    const database = databaseFromMongoUri(uri);
    const purpose = values.purpose || 'operation';
    if (!['operation', 'cleanup'].includes(purpose)) {
      throw new Error('--purpose debe ser operation o cleanup.');
    }
    const proof = captureRuntimeProof(uri, database, values['expected-dbpath-root'], { purpose });
    writeJsonExclusive(output, proof);
    const loaded = loadRuntimeProof(output, { expectedDatabase: database, purpose });
    console.log(JSON.stringify({ status: 'captured', file: output, sha256: loaded.sha256 }, null, 2));
    return;
  }
  if (command === 'collect-infrastructure-evidence') {
    if (!values['output-dir']) throw new Error('Falta --output-dir.');
    const outputDir = safeArtifactDirectory(values['output-dir'], ROOT, { mustNotExist: true });
    const collected = collectRailwayEvidence({
      outputDir,
      projectId: values['project-id'],
      drillMode: values.mode,
      sourceEnvironment: values['source-environment'],
      sourceService: values['source-service'],
      targetEnvironment: values['target-environment'],
      targetService: values['target-service'],
      runtimeProofFile: values['runtime-proof'],
      evidenceId: values['evidence-id'],
      collector: values.collector,
      reviewedBy: values['reviewed-by'],
    });
    console.log(JSON.stringify({ status: 'collected', ...collected }, null, 2));
    return;
  }
  if (command === 'fingerprint') {
    if (!['source', 'target'].includes(values.side)) throw new Error('--side debe ser source o target.');
    const uri = readProtectedUri(values[`${values.side}-uri-file`], values.side);
    const fingerprint = mongoEndpointFingerprint(uri);
    result = {
      side: values.side,
      database: databaseFromMongoUri(uri),
      scheme: fingerprint.scheme,
      endpointCount: fingerprint.endpointCount,
      endpointFingerprintSha256: fingerprint.endpointFingerprintSha256,
    };
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === 'plan' || command === 'preflight') {
    result = describePlan(values.phase, values, command === 'preflight');
  } else if (command === 'dump') result = withFailureReceipt('dump', values, () => dumpCommand(values));
  else if (command === 'verify-backup') result = verifyBackupCommand(values);
  else if (command === 'certify-archive-restore') {
    result = withFailureReceipt('certify-archive-restore', values, () =>
      restoreCommand(values, { restoreRole: 'certification' }));
  } else if (command === 'certify-archive-verify') {
    result = withFailureReceipt('certify-archive-verify', values, () =>
      verifyCommand(values, { restoreRole: 'certification' }));
  } else if (command === 'restore') {
    result = withFailureReceipt('restore', values, () => restoreCommand(values, { restoreRole: 'final' }));
  } else if (command === 'verify') {
    result = withFailureReceipt('verify', values, () => verifyCommand(values, { restoreRole: 'final' }));
  }
  else if (command === 'cleanup') result = withFailureReceipt('cleanup', values, () => cleanupCommand(values));
  else throw new Error(`Comando desconocido: ${command}.\n${usage()}`);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(redact(error.message, []));
    process.exitCode = 1;
  }
}

module.exports = {
  RESTORE_STABILITY_DELAY_MS,
  assertCleanGitStatus,
  assertCleanupRuntimeSchema,
  assertCleanupReceiptBindings,
  assertDropConfirmed,
  assertRestoreStabilityDelay,
  assertSameRuntimeForCleanup,
  evaluateAuditInventoryStability,
  readProtectedUri,
};
