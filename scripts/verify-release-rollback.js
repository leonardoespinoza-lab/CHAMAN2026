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

const { values } = parseArgs({
  options: {
    manifest: { type: 'string' },
    online: { type: 'boolean', default: false },
    'require-full-version-coverage': { type: 'boolean', default: false },
    'railway-evidence': { type: 'string' },
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
    console.log(
      `Rollback Git preparado: ${manifest.release.sha} -> ${manifest.rollback.sha}; deployments aún no comprobados y sin acciones remotas.`,
    );
    return;
  }

  const result = await collectVersionEvidence(manifest, { mode: 'rollback' });
  if (values['require-full-version-coverage'] && result.pendingRoles.length) {
    throw new Error(`Faltan endpoints /version para: ${result.pendingRoles.join(', ')}`);
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
      { mode: 'rollback' },
    );
  }
  console.log(
    `Rollback online confirmado por ${result.evidence.length} endpoints y ${railwayEvidence.evidence.length} deployments en ${result.expectedSha}.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
