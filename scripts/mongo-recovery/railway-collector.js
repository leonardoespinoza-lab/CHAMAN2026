const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  EVIDENCE_KIND,
  TESTING_LOCAL_MODE,
  deriveRailwayAsset,
  loadInfrastructureEvidence,
} = require('./infrastructure-evidence');
const { loadRuntimeProof } = require('./runtime-proof');
const { hardenRestrictedDirectory, hardenRestrictedFile, safeChildEnv } = require('./secure-config');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function runRailway(args, { executable = 'railway', spawn = spawnSync } = {}) {
  const result = spawn(executable, args, {
    encoding: 'utf8',
    env: safeChildEnv(),
    shell: false,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`railway ${args[0]} fallo; no se generara evidencia.`);
  }
  return String(result.stdout || '');
}

function captureStatus({ projectId, environment, outputDir, label, runner = runRailway }) {
  const args = ['status', '--project', projectId, '--environment', environment, '--json'];
  const stdout = runner(args);
  try {
    JSON.parse(stdout);
  } catch {
    throw new Error(`railway status --json para ${label} no devolvio JSON valido.`);
  }
  const file = `railway-status-${label}.raw.json`;
  const filePath = path.join(outputDir, file);
  fs.writeFileSync(filePath, stdout, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  hardenRestrictedFile(filePath);
  return {
    environmentSelector: environment,
    file,
    sha256: sha256(fs.readFileSync(filePath)),
    commandSha256: sha256(`${JSON.stringify(['railway', ...args])}\n`),
    raw: JSON.parse(stdout),
  };
}

function collectRailwayEvidence(options, dependencies = {}) {
  const {
    outputDir,
    projectId,
    drillMode,
    sourceEnvironment,
    sourceService,
    runtimeProofFile,
    evidenceId,
    collector,
    reviewedBy,
  } = options;
  if (drillMode !== TESTING_LOCAL_MODE) {
    throw new Error('El collector operativo solo permite testing-local-drill; Produccion permanece bloqueada.');
  }
  const normalizedProjectId = String(projectId || '').trim().toLowerCase();
  if (!UUID.test(normalizedProjectId)) throw new Error('projectId debe ser UUID.');
  if (String(sourceEnvironment || '').trim().toLowerCase() !== 'testing') {
    throw new Error('testing-local-drill exige --source-environment=Testing.');
  }
  const normalizedSourceEnvironment = 'Testing';
  for (const [label, value] of Object.entries({ outputDir, sourceService, runtimeProofFile, evidenceId, collector, reviewedBy })) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Falta ${label}.`);
  }
  if (collector.trim().toLowerCase() === reviewedBy.trim().toLowerCase()) {
    throw new Error('collector y reviewedBy deben ser personas distintas.');
  }
  const proof = loadRuntimeProof(runtimeProofFile);
  if (fs.existsSync(outputDir)) throw new Error('El directorio de evidencia ya existe.');
  fs.mkdirSync(outputDir, { recursive: false, mode: 0o700 });
  hardenRestrictedDirectory(outputDir);
  const runner = dependencies.runner || ((args) => runRailway(args, dependencies));
  const version = runner(['--version']).trim();
  if (!/^railway\s+\d+\./i.test(version)) throw new Error('No se pudo acreditar la version de Railway CLI.');
  const sourceCapture = captureStatus({
    projectId: normalizedProjectId,
    environment: normalizedSourceEnvironment,
    outputDir,
    label: 'source',
    runner,
  });
  const sourceGraph = deriveRailwayAsset(sourceCapture.raw, {
    projectId: normalizedProjectId,
    environment: normalizedSourceEnvironment,
    service: sourceService,
  });
  const captures = [sourceCapture];
  const target = {
    provider: 'local-mongodb',
    instanceId: proof.validated.instanceId,
    endpointFingerprintSha256: proof.validated.endpointFingerprintSha256,
    runtimeProofSha256: proof.sha256,
    replicaSet: proof.validated.replicaSet,
    dbPathSha256: proof.validated.dbPathSha256,
  };
  const now = new Date();
  const evidence = {
    schemaVersion: 2,
    kind: EVIDENCE_KIND,
    evidenceId,
    drillMode,
    collection: {
      method: 'railway-cli-status-json',
      projectId: sourceGraph.projectId,
      railwayCliVersion: version,
      readOnly: true,
      rawCaptures: captures.map(({ raw, ...capture }) => capture),
    },
    collectedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(),
    source: {
      provider: 'railway',
      environmentId: sourceGraph.environmentId,
      environmentName: sourceGraph.environmentName,
      serviceId: sourceGraph.serviceId,
      serviceName: sourceGraph.serviceName,
      volumeIds: sourceGraph.volumeIds,
      graphSha256: sourceGraph.graphSha256,
    },
    target,
    collector,
    reviewedBy,
  };
  const evidencePath = path.join(outputDir, 'infrastructure-evidence.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx', mode: 0o600,
  });
  hardenRestrictedFile(evidencePath);
  loadInfrastructureEvidence(evidencePath);
  return { evidencePath, evidenceSha256: sha256(fs.readFileSync(evidencePath)), rawCaptures: captures.length };
}

module.exports = { captureStatus, collectRailwayEvidence, runRailway };
