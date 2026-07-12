const { MongoClient } = require('../../sdc-datos/node_modules/mongodb');
const recsoCurrent = require('../data/sanitary/soja-recso-2024-2025');
const recsoHistorical = require('../data/sanitary/soja-recso-2023-2024');

const MIGRATION_ID = '20260712-soja-recso-matrix-v2';
const DB_URL =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL ||
  process.env.DB_URL ||
  '';
const DB_NAME = process.env.DB_NAME || 'chaman';
const FILTER = { cultivo: 'Soja', campania: '2025-2026' };
const BACKUP_COLLECTION = 'migration_backup_items';
const MANIFEST_COLLECTION = 'migration_manifests';
const SOURCE_META = {
  fuente: recsoCurrent.fuente,
  fuenteUrl: recsoCurrent.fuenteUrl,
  campaniaFuente: recsoCurrent.campania,
  fechaFuente: '2025-07-03',
};

const DISEASES = [
  ['soja.cancro_tallo', 'Cancro del Tallo de la Soja'],
  ['soja.phytophthora', 'Podredumbre de Raiz y Tallo por Phytophthora'],
  ['soja.muerte_repentina', 'Sindrome de Muerte Repentina'],
  ['soja.mancha_ojo_rana', 'Mancha Ojo de Rana'],
];

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function varietyKey(value) {
  return norm(value)
    .replace(/^(ACA|DM|BIOCERES|BIO|STINE)/, '')
    .replace(/(NK|NS)$/, '');
}

const PROFILES = new Map();
for (const source of [recsoCurrent, recsoHistorical]) {
  for (const row of source.rows) {
    const key = varietyKey(row[0]);
    if (!PROFILES.has(key)) PROFILES.set(key, { row, source });
  }
}

function unknownResistance(enfermedad, idEnfermedad, reason) {
  return {
    enfermedad,
    idEnfermedad,
    multiplicador: 1,
    indiceResistencia: 0,
    perfil: 'DESCONOCIDA',
    estado: 'desconocida',
    confianza: 'sin_datos',
    ...SOURCE_META,
    observaciones: reason,
  };
}

function splitPathotypes(value) {
  const result = { resistentes: [], susceptibles: [] };
  String(value || '')
    .split(';')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .forEach((item) => {
      if (/^R\d+$/.test(item)) result.resistentes.push(item.slice(1));
      if (/^S\d+$/.test(item)) result.susceptibles.push(item.slice(1));
    });
  return result;
}

function buildProfileEntries(profile) {
  const { row, source } = profile;
  const [cultivar, empresa, gm, cancro, phytophthora, smr, mor, page] = row;
  const common = {
    fuente: source.fuente,
    fuenteUrl: source.fuenteUrl,
    campaniaFuente: source.campania,
    fechaFuente: source.campania === '2024-2025' ? '2025-07-03' : '2024-07-02',
    estado: 'historica',
    confianza: source.campania === '2024-2025' ? 'alta' : 'media',
    observaciones: `Cultivar ${cultivar}, empresa ${empresa}, GM ${gm}; cuadro en pagina ${page}. Evidencia ${source.campania} aplicada como antecedente al catalogo 2025/26.`,
  };
  const ph = splitPathotypes(phytophthora);
  const ojoRana = splitPathotypes(mor);

  return [
    cancro
      ? {
          enfermedad: 'Cancro del Tallo de la Soja',
          idEnfermedad: 'soja.cancro_tallo',
          multiplicador: cancro === 'R' ? 0.05 : 1,
          indiceResistencia: cancro === 'R' ? 1 : 0,
          perfil: cancro,
          ...common,
          detalleSanitario: {
            metodo: 'Respuesta cualitativa RECSO',
            interpretacion: cancro,
          },
        }
      : unknownResistance(
          'Cancro del Tallo de la Soja',
          'soja.cancro_tallo',
          `${common.observaciones} La celda CAN esta en blanco.`,
        ),
    phytophthora
      ? {
          enfermedad: 'Podredumbre de Raiz y Tallo por Phytophthora',
          idEnfermedad: 'soja.phytophthora',
          perfil: 'DESCONOCIDA',
          ...common,
          detalleSanitario: {
            metodo: 'Diferencial por patotipos de Phytophthora sojae',
            patotiposResistentes: ph.resistentes,
            patotiposSusceptibles: ph.susceptibles,
            interpretacion:
              'No se calcula una categoria unica sin conocer el patotipo predominante local.',
          },
        }
      : unknownResistance(
          'Podredumbre de Raiz y Tallo por Phytophthora',
          'soja.phytophthora',
          `${common.observaciones} La celda PH esta en blanco.`,
        ),
    Number.isFinite(Number(smr))
      ? {
          enfermedad: 'Sindrome de Muerte Repentina',
          idEnfermedad: 'soja.muerte_repentina',
          perfil: 'DESCONOCIDA',
          ...common,
          detalleSanitario: {
            metodo: 'Indice de campo RECSO',
            valorCampo: Number(smr),
            unidad: 'indice de campo publicado',
            interpretacion:
              'Menor valor observado implica menor expresion en esos ensayos; no se extrapola como probabilidad.',
          },
        }
      : unknownResistance(
          'Sindrome de Muerte Repentina',
          'soja.muerte_repentina',
          `${common.observaciones} La celda SMR esta en blanco.`,
        ),
    mor
      ? {
          enfermedad: 'Mancha Ojo de Rana',
          idEnfermedad: 'soja.mancha_ojo_rana',
          perfil: 'DESCONOCIDA',
          ...common,
          detalleSanitario: {
            metodo: 'Diferencial por patotipos de Cercospora sojina',
            patotiposResistentes: ojoRana.resistentes,
            patotiposSusceptibles: ojoRana.susceptibles,
            interpretacion:
              'No se calcula una categoria unica sin conocer el patotipo predominante local.',
          },
        }
      : unknownResistance(
          'Mancha Ojo de Rana',
          'soja.mancha_ojo_rana',
          `${common.observaciones} La celda MOR esta en blanco.`,
        ),
  ];
}

function buildResistance(seed) {
  const existing = Array.isArray(seed.resistencia) ? seed.resistencia : [];
  const preserved = existing.filter(
    (entry) => !DISEASES.some(([id]) => entry?.idEnfermedad === id),
  );
  const profile = PROFILES.get(varietyKey(seed.variedad));
  const sanitary = profile
    ? buildProfileEntries(profile)
    : DISEASES.map(([id, name]) =>
        unknownResistance(
          name,
          id,
          'No se encontro coincidencia inequívoca del cultivar 2025/26 en los cuadros sanitarios RECSO 2023/24; no se infiere susceptibilidad.',
        ),
      );
  return [...preserved, ...sanitary];
}

function requireConfirmation(mode) {
  if (process.env.CHAMAN_MIGRATION_CONFIRM !== `${MIGRATION_ID}:${mode}`) {
    throw new Error(
      `Confirmacion requerida: CHAMAN_MIGRATION_CONFIRM=${MIGRATION_ID}:${mode}`,
    );
  }
}

async function summary(db) {
  const seeds = await db.collection('semillas').find(FILTER).toArray();
  let matched = 0;
  let observedRows = 0;
  for (const seed of seeds) {
    if (PROFILES.has(varietyKey(seed.variedad))) matched += 1;
    observedRows += (seed.resistencia || []).filter((entry) =>
      DISEASES.some(([id]) => id === entry.idEnfermedad) &&
      ['observada', 'historica'].includes(entry.estado),
    ).length;
  }
  return {
    semillas: seeds.length,
    cultivaresConAntecedenteRecso: matched,
    cultivaresSinCoincidencia: seeds.length - matched,
    filasSanitariasConEvidencia: observedRows,
  };
}

async function plan(db) {
  return {
    ok: true,
    migrationId: MIGRATION_ID,
    mode: 'plan',
    writes: false,
    sourceRows: {
      campania2024_2025: recsoCurrent.rows.length,
      fallback2023_2024: recsoHistorical.rows.length,
      cultivaresUnicos: PROFILES.size,
    },
    matrixBefore: await summary(db),
  };
}

async function apply(db) {
  requireConfirmation('apply');
  const applied = await db.collection(MANIFEST_COLLECTION).findOne({
    migrationId: MIGRATION_ID,
    status: 'applied',
  });
  if (applied) throw new Error(`La migracion ya fue aplicada el ${applied.appliedAt}`);

  const seeds = await db.collection('semillas').find(FILTER).toArray();
  await db.collection(BACKUP_COLLECTION).deleteMany({ migrationId: MIGRATION_ID });
  if (seeds.length) {
    await db.collection(BACKUP_COLLECTION).insertMany(
      seeds.map((seed) => ({
        migrationId: MIGRATION_ID,
        collection: 'semillas',
        originalId: seed._id,
        resistencia: seed.resistencia || [],
        createdAt: new Date(),
      })),
    );
    await db.collection('semillas').bulkWrite(
      seeds.map((seed) => ({
        updateOne: {
          filter: { _id: seed._id },
          update: { $set: { resistencia: buildResistance(seed) } },
        },
      })),
      { ordered: false },
    );
  }
  const matrixAfter = await summary(db);
  await db.collection(MANIFEST_COLLECTION).updateOne(
    { migrationId: MIGRATION_ID },
    {
      $set: {
        migrationId: MIGRATION_ID,
        status: 'applied',
        appliedAt: new Date(),
        matrixAfter,
      },
    },
    { upsert: true },
  );
  return { ok: true, migrationId: MIGRATION_ID, mode: 'apply', matrixAfter };
}

async function rollback(db) {
  requireConfirmation('rollback');
  const backups = await db
    .collection(BACKUP_COLLECTION)
    .find({ migrationId: MIGRATION_ID, collection: 'semillas' })
    .toArray();
  if (!backups.length) throw new Error('No existe backup para restaurar.');
  await db.collection('semillas').bulkWrite(
    backups.map((item) => ({
      updateOne: {
        filter: { _id: item.originalId },
        update: { $set: { resistencia: item.resistencia } },
      },
    })),
    { ordered: false },
  );
  await db.collection(MANIFEST_COLLECTION).updateOne(
    { migrationId: MIGRATION_ID },
    { $set: { status: 'rolled_back', rolledBackAt: new Date() } },
  );
  return { ok: true, migrationId: MIGRATION_ID, mode: 'rollback', restored: backups.length };
}

async function main() {
  if (!DB_URL) throw new Error('Falta MONGO_URI/MONGO_URL/DATABASE_URL/DB_URL.');
  const mode = process.argv[2] || 'plan';
  if (!['plan', 'apply', 'rollback'].includes(mode)) {
    throw new Error('Modo invalido. Usar plan, apply o rollback.');
  }
  const client = await MongoClient.connect(DB_URL, {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000),
  });
  try {
    const db = client.db(DB_NAME);
    console.log(JSON.stringify(await ({ plan, apply, rollback }[mode])(db), null, 2));
  } finally {
    await client.close();
  }
}

module.exports = { DISEASES, PROFILES, buildProfileEntries, buildResistance, varietyKey };

if (require.main === module) {
  main().catch((error) => {
    console.error(`[${MIGRATION_ID}]`, error);
    process.exit(1);
  });
}
