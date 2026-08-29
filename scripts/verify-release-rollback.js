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
    online: { type: 'boolean', default: false },
    'require-full-version-coverage': { type: 'boolean', default: false },
    'railway-evidence': { type: 'string' },
    'railway-cli': { type: 'string' },
    'rollback-started-at': { type: 'string' },
  },
});

function git(root, args, message) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) throw new Error(message);
  return result.stdout.trim();
}

async function main() {
  if (!values.manifest) throw new Error('Falta --manifest');
  const root = path.join(__dirname, '..');
  const manifest = loadJson(path.resolve(values.manifest));
  validateReleaseManifest(manifest, loadTopology(root));

  git(root, ['cat-file', '-e', `${manifest.release.sha}^{commit}`], 'release.sha no existe localmente');
  git(root, ['cat-file', '-e', `${manifest.rollback.sha}^{commit}`], 'rollback.sha no existe localmente');
  git(
    root,
    ['merge-base', '--is-ancestor', manifest.rollback.sha, manifest.release.sha],
    'rollback.sha no es ancestro de release.sha',
  );

  if (!values.online) {
    const promoted = manifest.services.filter((service) => service.deploymentMode === 'promote');
    const frozen = manifest.services.filter((service) => service.deploymentMode === 'frozen');
    console.log(
      `Rollback Git preparado para ${promoted.length} servicios: ${manifest.release.sha} -> ${manifest.rollback.sha}; ${frozen.length} ${frozen.length === 1 ? 'congelado queda' : 'congelados quedan'} sin acción; deployments aún no comprobados.`,
    );
    return;
  }

  if (!values['rollback-started-at']) {
    throw new Error('Rollback online exige --rollback-started-at con la hora registrada antes de revertir');
  }

  const frozenLive = verifyFrozenServicesLive(manifest, {
    root,
    railwayCli: values['railway-cli'] || process.env.CHAMAN_RAILWAY_CLI || 'railway',
  });
  const result = await collectVersionEvidence(manifest, { mode: 'rollback' });
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
      { mode: 'rollback', evidenceNotBefore: values['rollback-started-at'] },
    );
  }
  console.log(
    `Rollback online confirmado por ${result.evidence.length} endpoints y ${railwayEvidence.evidence.length} deployments para ${result.expectedSha}; ${frozenLive.length} servicios congelados fueron verificados live por identidad binaria y procedencia SHA Railway/Git.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
