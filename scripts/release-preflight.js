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
    offline: { type: 'boolean', default: false },
    'skip-git': { type: 'boolean', default: false },
    'require-full-version-coverage': { type: 'boolean', default: false },
    'railway-evidence': { type: 'string' },
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
    console.log(
      `Validación estática OK: ${manifest.services.length} servicios fijados a ${manifest.release.sha}; deployments aún no comprobados.`,
    );
    return;
  }

  const result = await collectVersionEvidence(manifest);
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
    );
  }
  console.log(
    `Preflight online OK: ${result.evidence.length} endpoints y ${railwayEvidence.evidence.length} deployments confirman ${result.expectedSha}.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
