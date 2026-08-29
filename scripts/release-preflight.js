const path = require('path');
const { spawnSync } = require('child_process');
const { parseArgs } = require('util');
const {
  collectRailwayDeploymentEvidence,
  collectVersionEvidence,
  loadJson,
  loadTopology,
  validateReleaseManifest,
} = require('./release-safety');
const { verifyFrozenServicesLive } = require('./verify-frozen-services-live');

const { values } = parseArgs({
  options: {
    manifest: { type: 'string' },
    offline: { type: 'boolean', default: false },
    'skip-git': { type: 'boolean', default: false },
    'require-full-version-coverage': { type: 'boolean', default: false },
    'railway-evidence': { type: 'string' },
    'railway-cli': { type: 'string' },
  },
});

function currentHead(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) throw new Error('No se pudo resolver el HEAD local');
  return result.stdout.trim().toLowerCase();
}

async function main() {
  if (!values.manifest) throw new Error('Falta --manifest');
  const root = path.join(__dirname, '..');
  const manifest = loadJson(path.resolve(values.manifest));
  validateReleaseManifest(manifest, loadTopology(root));

  if (!values['skip-git']) {
    const head = currentHead(root);
    if (head !== manifest.release.sha) {
      throw new Error(`HEAD ${head} no coincide con release.sha ${manifest.release.sha}`);
    }
  }

  if (values.offline) {
    const promoted = manifest.services.filter((service) => service.deploymentMode === 'promote');
    const frozen = manifest.services.filter((service) => service.deploymentMode === 'frozen');
    console.log(
      `Validación estática OK: ${promoted.length} servicios promovidos fijados a ${manifest.release.sha}; ${frozen.length} ${frozen.length === 1 ? 'congelado' : 'congelados'} sin deploy; deployments aún no comprobados.`,
    );
    return;
  }

  const frozenLive = verifyFrozenServicesLive(manifest, {
    root,
    railwayCli: values['railway-cli'] || process.env.CHAMAN_RAILWAY_CLI || 'railway',
  });
  const result = await collectVersionEvidence(manifest);
  if (values['require-full-version-coverage'] && result.missingVersionRoles.length) {
    throw new Error(`Faltan endpoints /version para: ${result.missingVersionRoles.join(', ')}`);
  }
  let railwayEvidence = { evidence: [] };
  if (result.pendingRoles.length) {
    if (!values['railway-evidence']) {
      throw new Error(
        `Falta --railway-evidence para verificar: ${result.pendingRoles.join(', ')}`,
      );
    }
    railwayEvidence = collectRailwayDeploymentEvidence(
      manifest,
      loadJson(path.resolve(values['railway-evidence'])),
    );
  }
  console.log(
    `Preflight online OK: ${result.evidence.length} endpoints y ${railwayEvidence.evidence.length} deployments confirman el release ${result.expectedSha}; ${frozenLive.length} servicios congelados fueron verificados live por identidad binaria y procedencia SHA Railway/Git.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
