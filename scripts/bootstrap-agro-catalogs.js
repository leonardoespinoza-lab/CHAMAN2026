const { spawnSync } = require('child_process');
const path = require('path');
const { MongoClient } = require('../sdc-datos/node_modules/mongodb');

const DB_URL =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL ||
  process.env.DB_URL ||
  '';
const DB_NAME = process.env.DB_NAME || 'chaman';
const SERVER_SELECTION_TIMEOUT_MS = Number(
  process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000,
);
const STRICT = process.env.CHAMAN_BOOTSTRAP_STRICT === 'true';

const CEBADA_EXPECTED = {
  semillas: 12,
  enfermedades: 4,
  cronosMin: 12000,
};

function log(message, extra) {
  if (extra) {
    console.log(`[catalog-bootstrap] ${message}`, extra);
    return;
  }
  console.log(`[catalog-bootstrap] ${message}`);
}

function warn(message, error) {
  const detail = error?.message ? ` ${error.message}` : '';
  console.warn(`[catalog-bootstrap] ${message}${detail}`);
}

function runSeed(scriptName) {
  const scriptPath = path.join(__dirname, scriptName);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: path.join(__dirname, '..'),
    shell: false,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`${scriptName} fallo con codigo ${result.status || 1}`);
  }
}

async function getCebadaCounts(db) {
  const [semillas, enfermedades, cronos] = await Promise.all([
    db.collection('semillas').countDocuments({ cultivo: 'Cebada' }),
    db.collection('enfermedads').countDocuments({ cultivo: 'Cebada' }),
    db.collection('cronos').countDocuments({ cultivo: 'Cebada' }),
  ]);

  return { semillas, enfermedades, cronos };
}

function isCebadaComplete(counts) {
  return (
    counts.semillas >= CEBADA_EXPECTED.semillas &&
    counts.enfermedades >= CEBADA_EXPECTED.enfermedades &&
    counts.cronos >= CEBADA_EXPECTED.cronosMin
  );
}

async function main() {
  if (process.env.CHAMAN_BOOTSTRAP_CATALOGS === 'false') {
    log('omitido por CHAMAN_BOOTSTRAP_CATALOGS=false');
    return;
  }

  if (!DB_URL) {
    log('omitido: no hay MONGO_URI/MONGO_URL/DATABASE_URL/DB_URL disponible');
    return;
  }

  const client = await MongoClient.connect(DB_URL, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
  });
  let clientClosed = false;

  try {
    const db = client.db(DB_NAME);
    const before = await getCebadaCounts(db);

    if (isCebadaComplete(before)) {
      log('Cebada completo', before);
      return;
    }

    log('Cebada incompleto; ejecutando seed idempotente', before);
    await client.close();
    clientClosed = true;

    runSeed('seed-cebada-local.js');

    const verifyClient = await MongoClient.connect(DB_URL, {
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    });
    try {
      const after = await getCebadaCounts(verifyClient.db(DB_NAME));
      if (!isCebadaComplete(after)) {
        throw new Error(`Cebada sigue incompleto: ${JSON.stringify(after)}`);
      }
      log('Cebada cargado correctamente', after);
    } finally {
      await verifyClient.close();
    }
  } finally {
    if (!clientClosed) {
      await client.close();
    }
  }
}

main().catch((error) => {
  if (STRICT) {
    console.error('[catalog-bootstrap] error critico:', error);
    process.exit(1);
  }

  warn('no se pudo validar/cargar catalogos; el servicio continua.', error);
});
