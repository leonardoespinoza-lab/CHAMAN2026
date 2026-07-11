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
  cronosMin: process.env.CHAMAN_CEBADA_ALLOW_PARTIAL === 'true' ? 300 : 12000,
  enfermedadesV2: 4,
};
const ARVEJA_EXPECTED = { semillas: 19 };
const BASE_EXPECTED = {
  provincias: 1,
  departamentos: 1,
  semillasAnuales: 1,
  cronos: 1,
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
  const [semillas, enfermedades, enfermedadesV2, cronos] = await Promise.all([
    db.collection('semillas').countDocuments({ cultivo: 'Cebada' }),
    db.collection('enfermedads').countDocuments({ cultivo: 'Cebada' }),
    db.collection('enfermedads').countDocuments({
      cultivo: 'Cebada',
      formula: /Cebada V2/,
    }),
    db.collection('cronos').countDocuments({ cultivo: 'Cebada' }),
  ]);

  return { semillas, enfermedades, enfermedadesV2, cronos };
}

async function getArvejaCounts(db) {
  const semillas = await db.collection('semillas').countDocuments({
    cultivo: 'Arveja',
    campania: '2025-2026',
  });
  return { semillas };
}

async function getBaseCounts(db) {
  const [provincias, departamentos, semillasAnuales, cronos] = await Promise.all([
    db.collection('provincias').countDocuments(),
    db.collection('departamentos').countDocuments(),
    db.collection('semillas').countDocuments({ cultivo: { $in: ['Trigo', 'Soja', 'Maiz'] } }),
    db.collection('cronos').countDocuments(),
  ]);
  return { provincias, departamentos, semillasAnuales, cronos };
}

function isCebadaComplete(counts) {
  return (
    counts.semillas >= CEBADA_EXPECTED.semillas &&
    counts.enfermedades >= CEBADA_EXPECTED.enfermedades &&
    counts.enfermedadesV2 >= CEBADA_EXPECTED.enfermedadesV2 &&
    counts.cronos >= CEBADA_EXPECTED.cronosMin
  );
}

function isArvejaComplete(counts) {
  return counts.semillas >= ARVEJA_EXPECTED.semillas;
}

function isBaseComplete(counts) {
  return Object.entries(BASE_EXPECTED).every(
    ([key, expected]) => Number(counts[key] || 0) >= expected,
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
    const [baseBefore, cebadaBefore, arvejaBefore] = await Promise.all([
      getBaseCounts(db),
      getCebadaCounts(db),
      getArvejaCounts(db),
    ]);

    if (
      isBaseComplete(baseBefore) &&
      isCebadaComplete(cebadaBefore) &&
      isArvejaComplete(arvejaBefore)
    ) {
      log('Catalogos completos', { base: baseBefore, cebada: cebadaBefore, arveja: arvejaBefore });
      return;
    }

    log('Catalogos incompletos; ejecutando seeds idempotentes', {
      base: baseBefore,
      cebada: cebadaBefore,
      arveja: arvejaBefore,
    });
    await client.close();
    clientClosed = true;

    if (!isBaseComplete(baseBefore)) {
      runSeed(
        process.env.CHAMAN_TESTING_BOOTSTRAP === 'true'
          ? 'seed-testing-base.js'
          : 'seed-master-data-local.js',
      );
    }
    if (!isCebadaComplete(cebadaBefore)) {
      runSeed('seed-cebada-local.js');
    }
    if (!isArvejaComplete(arvejaBefore)) {
      runSeed('seed-arveja-local.js');
    }

    const verifyClient = await MongoClient.connect(DB_URL, {
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    });
    try {
      const verifyDb = verifyClient.db(DB_NAME);
      const [baseAfter, cebadaAfter, arvejaAfter] = await Promise.all([
        getBaseCounts(verifyDb),
        getCebadaCounts(verifyDb),
        getArvejaCounts(verifyDb),
      ]);
      if (
        !isBaseComplete(baseAfter) ||
        !isCebadaComplete(cebadaAfter) ||
        !isArvejaComplete(arvejaAfter)
      ) {
        throw new Error(
          `Catalogos siguen incompletos: ${JSON.stringify({ base: baseAfter, cebada: cebadaAfter, arveja: arvejaAfter })}`,
        );
      }
      log('Catalogos cargados correctamente', {
        base: baseAfter,
        cebada: cebadaAfter,
        arveja: arvejaAfter,
      });
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
