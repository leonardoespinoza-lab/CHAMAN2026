const fs = require('fs');
const path = require('path');

const REQUIRED_ASSETS = [
  'sdc-meteo-worker',
  'sdc-meteo-worker/Dockerfile',
  'sdc-meteo-worker/railway.json',
  'sdc-meteo-worker/requirements.txt',
  'scripts/migrations/20260828-chaman-meteo-v2-read-indexes.js',
  'scripts/tests/chaman-meteo-v2-read-indexes-migration.test.js',
];

function detectAssets(root = path.join(__dirname, '..')) {
  const status = REQUIRED_ASSETS.map((relativePath) => ({
    relativePath,
    present: fs.existsSync(path.join(root, relativePath)),
  }));
  const presentCount = status.filter((item) => item.present).length;

  if (presentCount === 0) {
    return { present: false, missing: REQUIRED_ASSETS };
  }

  const missing = status
    .filter((item) => !item.present)
    .map((item) => item.relativePath);
  if (missing.length) {
    throw new Error(
      `Chamán-Meteo fue incorporado parcialmente. Faltan: ${missing.join(', ')}`,
    );
  }

  return { present: true, missing: [] };
}

function writeGithubOutput(present) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    throw new Error('GITHUB_OUTPUT no está definido');
  }
  fs.appendFileSync(outputPath, `present=${present}\n`, 'utf8');
}

if (require.main === module) {
  try {
    const result = detectAssets();
    console.log(
      result.present
        ? 'Artefactos Chamán-Meteo completos; se ejecutará el gate estricto.'
        : 'Chamán-Meteo todavía no está presente en este ref.',
    );
    if (process.argv.includes('--github-output')) {
      writeGithubOutput(result.present);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  REQUIRED_ASSETS,
  detectAssets,
};
