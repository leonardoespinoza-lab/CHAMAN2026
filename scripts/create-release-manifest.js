const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');
const {
  buildReleaseManifest,
  loadJson,
  loadTopology,
} = require('./release-safety');

const { values } = parseArgs({
  options: {
    sha: { type: 'string' },
    'previous-sha': { type: 'string' },
    version: { type: 'string' },
    'built-at': { type: 'string' },
    environment: { type: 'string' },
    migrations: { type: 'string' },
    'backup-evidence': { type: 'string' },
    'restore-rehearsal-evidence': { type: 'string' },
    'branch-protection-verified': { type: 'boolean', default: false },
    'railway-wait-for-ci-verified': { type: 'boolean', default: false },
    'production-auto-deploy-paused': { type: 'boolean', default: false },
    output: { type: 'string' },
    'deployment-baseline': { type: 'string' },
    force: { type: 'boolean', default: false },
  },
});

function required(name) {
  const value = values[name];
  if (!value) throw new Error(`Falta --${name}`);
  return value;
}

try {
  const root = path.join(__dirname, '..');
  const outputPath = path.resolve(required('output'));
  if (fs.existsSync(outputPath) && !values.force) {
    throw new Error(`El archivo ya existe: ${outputPath}. Use --force para reemplazarlo.`);
  }
  const migrations = values.migrations
    ? loadJson(path.resolve(values.migrations)).migrations
    : [];
  const deploymentBaseline = loadJson(path.resolve(required('deployment-baseline')));
  const manifest = buildReleaseManifest({
    topology: loadTopology(root),
    sha: required('sha'),
    previousSha: required('previous-sha'),
    version: required('version'),
    builtAt: required('built-at'),
    environment: required('environment'),
    migrations,
    backupEvidence: values['backup-evidence'] || null,
    restoreRehearsalEvidence: values['restore-rehearsal-evidence'] || null,
    branchProtectionVerified: values['branch-protection-verified'],
    railwayWaitForCiVerified: values['railway-wait-for-ci-verified'],
    productionAutoDeployPaused: values['production-auto-deploy-paused'],
    deploymentBaseline,
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Manifiesto creado: ${outputPath}`);
  console.log(`Release SHA: ${manifest.release.sha}`);
  console.log(`Rollback SHA: ${manifest.rollback.sha}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
