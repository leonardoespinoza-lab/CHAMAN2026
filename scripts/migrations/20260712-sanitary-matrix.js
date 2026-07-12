const path = require('path');
const { spawnSync } = require('child_process');
const { MongoClient } = require('../../sdc-datos/node_modules/mongodb');
const maizeSanitary = require('../data/sanitary/maiz-2025-2026.json');

const MIGRATION_ID = '20260712-sanitary-matrix-v1';
const DB_URL =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL ||
  process.env.DB_URL ||
  '';
const DB_NAME = process.env.DB_NAME || 'chaman';
const BACKUP_COLLECTION = 'migration_backup_items';
const MANIFEST_COLLECTION = 'migration_manifests';
const FILTER = {
  $or: [
    { cultivo: { $in: ['Trigo', 'Soja', 'Maiz'] }, campania: '2025-2026' },
    { cultivo: 'Cebada', campania: '2026-2027' },
    { cultivo: 'Arveja', campania: '2025-2026' },
  ],
};

const REQUIRED_DISEASES = {
  Trigo: [
    ['trigo.roya_hoja', 'Roya de la Hoja'],
    ['trigo.roya_tallo', 'Roya del Tallo'],
    ['trigo.roya_anaranjada', 'Roya Anaranjada'],
    ['trigo.mancha_amarilla', 'Mancha Amarilla'],
    ['trigo.fusarium_espiga', 'Fusarium de la Espiga'],
    ['trigo.mancha_hoja', 'Mancha de la Hoja'],
  ],
  Soja: [['soja.fin_ciclo', 'Fin de Ciclo']],
  Maiz: [
    ['maiz.roya', 'Roya del Maiz'],
    ['maiz.tizon_foliar', 'Tizon Foliar del Maiz'],
  ],
  Cebada: [
    ['cebada.mancha_red', 'Mancha en Red'],
    ['cebada.escaldadura', 'Escaldadura de la Cebada'],
    ['cebada.roya_hoja', 'Roya de la Hoja de Cebada'],
    ['cebada.fusariosis_espiga', 'Fusariosis de la Espiga de Cebada'],
  ],
  Arveja: [],
};

const WHEAT_SEPTORIA_2020 = {
  DESTELLO: 'MR',
  '602': 'MR',
  'SY200': 'MS',
  LAPACHO: 'MS',
  BIOINTA1006: 'S',
  NUTRIA: 'MS',
  ZAINO: 'MR',
  ARYAL: 'MR',
  '1008': 'R',
  ALAMO: 'MR',
};

const BARLEY_2024 = {
  ANDREIA: { escaldadura: 'S', manchaRed: 'I', royaHoja: 'R' },
  CHARLES: { escaldadura: 'R', manchaRed: 'I', royaHoja: 'R' },
  FATIMA: { escaldadura: 'I', manchaRed: 'I', royaHoja: 'R' },
  JENNIFER: { escaldadura: 'S', manchaRed: 'I', royaHoja: 'R' },
  'MILITZA INTA': { escaldadura: 'R', manchaRed: 'I', royaHoja: 'I' },
  MONTOYA: { escaldadura: 'R', manchaRed: 'R', royaHoja: 'R' },
  OVERTURE: { escaldadura: 'R', manchaRed: 'R', royaHoja: 'R' },
  SINFONIA: { escaldadura: 'I', manchaRed: 'R', royaHoja: 'R' },
};

const BARLEY_2017 = {
  DANIELLE: { escaldadura: 'S', manchaRed: 'MR' },
  SHAKIRA: { manchaRed: 'S' },
  TRAVELER: { manchaRed: 'S' },
};

const MAIZE_PROFILES = new Map(
  maizeSanitary.resistencias.map((row) => [
    `${norm(row.semillero)}|${norm(row.variedad)}|${norm(row.ciclo)}`,
    row,
  ]),
);

function clean(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function norm(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function wheatVarietyKey(value) {
  return norm(value)
    .replace(/^(LIMA GRAIN|LIMAGRAIN|LG|BUCK|ACA|KLEIN|BIOCERES|BIOSEMINIS|NIDERA|DON MARIO|DM|MS INTA)\s+/, '')
    .replace(/[^A-Z0-9]/g, '');
}

function requireConfirmation(mode) {
  if (process.env.CHAMAN_MIGRATION_CONFIRM !== `${MIGRATION_ID}:${mode}`) {
    throw new Error(
      `Confirmacion requerida: CHAMAN_MIGRATION_CONFIRM=${MIGRATION_ID}:${mode}`,
    );
  }
}

function runSeed(script, extraEnv) {
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', script)], {
    cwd: path.join(__dirname, '..', '..'),
    shell: false,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    throw new Error(`${script} fallo con codigo ${result.status || 1}`);
  }
}

function unknownResistance(enfermedad, idEnfermedad, metadata = {}) {
  return {
    enfermedad,
    idEnfermedad,
    multiplicador: 1,
    indiceResistencia: 0,
    perfil: 'DESCONOCIDA',
    estado: 'desconocida',
    confianza: 'sin_datos',
    fuente: metadata.fuente || 'Matriz sanitaria CHAMAN; revision al 2026-07-12',
    fuenteUrl: metadata.fuenteUrl,
    campaniaFuente: metadata.campaniaFuente || '2025-2026',
    fechaFuente: metadata.fechaFuente || '2026-07-12',
    observaciones:
      metadata.observaciones ||
      'La fuente seleccionada no informa este perfil; no equivale a susceptibilidad observada.',
  };
}

function wheatResistance(rating) {
  const values = {
    R: { multiplicador: 0.05, indiceResistencia: 1 },
    MR: { multiplicador: 0.5, indiceResistencia: 2 / 3 },
    MS: { multiplicador: 0.75, indiceResistencia: 1 / 3 },
    S: { multiplicador: 1, indiceResistencia: 0 },
  };
  return {
    enfermedad: 'Mancha de la Hoja',
    idEnfermedad: 'trigo.mancha_hoja',
    ...values[rating],
    perfil: rating,
    estado: 'historica',
    confianza: 'baja',
    fuente: 'Enfermedades en TRIGO -V2.xlsx / VARIEDADES 20-21 / SH',
    campaniaFuente: '2020-2021',
    fechaFuente: '2021-12-31',
    observaciones:
      'Antecedente historico usado porque la campania 2025-2026 y los RET oficiales revisados no publican Septoriosis para esta variedad.',
  };
}

function observedResistance(enfermedad, idEnfermedad, rating, crop) {
  const values = {
    R: { multiplicador: 0.05, indiceResistencia: 1 },
    MR: { multiplicador: 0.5, indiceResistencia: 2 / 3 },
    MS: { multiplicador: 0.75, indiceResistencia: 1 / 3 },
    S: { multiplicador: 1, indiceResistencia: 0 },
  };
  const source =
    crop === 'Trigo'
      ? {
          fuente: 'VARIEDADES TRIGO SOJA MAIZ 2026.xlsx / TRIGO 25-26',
          fuenteUrl:
            'https://www.argentina.gob.ar/sites/default/files/2026/04/inta_crcordoba_eeamarcosjuarez_alberione_e_comportamiento.pdf',
        }
      : {
          fuente: 'VARIEDADES TRIGO SOJA MAIZ 2026.xlsx / MAIZ 25-26',
        };
  return {
    enfermedad,
    idEnfermedad,
    ...values[rating],
    perfil: rating,
    estado: 'observada',
    confianza: 'alta',
    ...source,
    campaniaFuente: '2025-2026',
    fechaFuente: '2026-07-12',
  };
}

function ratingFromLegacy(entry) {
  if (['R', 'MR', 'MS', 'S'].includes(norm(entry?.perfil))) return norm(entry.perfil);
  const value = Number(entry?.multiplicador);
  if (Math.abs(value - 0.05) < 0.001) return 'R';
  if (Math.abs(value - 0.5) < 0.001) return 'MR';
  if (Math.abs(value - 0.75) < 0.001) return 'MS';
  if (Math.abs(value - 1) < 0.001) return 'S';
  return undefined;
}

function normalizeLegacyEntries(seed) {
  const entries = Array.isArray(seed.resistencia) ? seed.resistencia : [];
  const required = REQUIRED_DISEASES[seed.cultivo] || [];
  const canonicalNames = new Set(required.map(([, name]) => norm(name)));
  const extras = entries.filter(
    (entry) =>
      !required.some(
        ([id, name]) =>
          entry?.idEnfermedad === id || norm(entry?.enfermedad) === norm(name),
      ),
  );
  const normalized = [];
  for (const [idEnfermedad, enfermedad] of required) {
    const existing = entries.find(
      (entry) =>
        entry?.idEnfermedad === idEnfermedad ||
        norm(entry?.enfermedad) === norm(enfermedad),
    );
    if (!existing) continue;
    if (existing.idEnfermedad === idEnfermedad && existing.estado) {
      normalized.push(existing);
      continue;
    }
    const rating = ratingFromLegacy(existing);
    normalized.push(
      rating
        ? observedResistance(enfermedad, idEnfermedad, rating, seed.cultivo)
        : unknownResistance(enfermedad, idEnfermedad, {
            observaciones:
              'Entrada heredada sin escala sanitaria interpretable; requiere validacion de fuente.',
          }),
    );
  }
  return [...extras.filter((entry) => !canonicalNames.has(norm(entry?.enfermedad))), ...normalized];
}

function barleyResistance(enfermedad, idEnfermedad, rating, historical2017 = false) {
  if (!rating) {
    return unknownResistance(enfermedad, idEnfermedad, {
      campaniaFuente: '2026-2027',
      observaciones:
        idEnfermedad === 'cebada.fusariosis_espiga'
          ? 'Las fuentes INTA 2024 y Red Nacional 2017 revisadas no publican respuesta varietal a Fusariosis de la Espiga.'
          : 'No se encontro un perfil varietal publicado en las fuentes oficiales revisadas; se mantiene escenario conservador.',
    });
  }
  const values = {
    R: { multiplicador: 0.3, indiceResistencia: 1 },
    MR: { multiplicador: 0.5, indiceResistencia: 2 / 3 },
    I: { multiplicador: 0.625, indiceResistencia: 0.5 },
    S: { multiplicador: 1, indiceResistencia: 0 },
  };
  return {
    enfermedad,
    idEnfermedad,
    ...values[rating],
    perfil: rating,
    estado: 'historica',
    confianza: historical2017 ? 'baja' : rating === 'I' ? 'media' : 'alta',
    fuente: historical2017
      ? 'Red Nacional de Cebada Cervecera, valoracion del perfil sanitario 2017'
      : 'INTA EEA Marcos Juarez, Evaluacion de cultivares de cebada cervecera 2024, Cuadro 5',
    fuenteUrl: historical2017
      ? 'https://cebadacervecera.com.ar/wp-content/uploads/2018/05/2017-Aspecto-sanitario.pdf'
      : 'https://www.argentina.gob.ar/sites/default/files/2025/03/inta_crcordoba_eeamarcosjuarez_donaire_g_evaluacion_cebc.pdf',
    campaniaFuente: historical2017 ? '2017-2018' : '2024-2025',
    fechaFuente: historical2017 ? '2018-05-08' : '2025-03-01',
    observaciones: historical2017
      ? 'Antecedente cualitativo historico de baja confianza.'
      : rating === 'I'
        ? 'La fuente informa un rango MR-MS; se usa su punto medio para calculo y se conserva confianza media.'
        : 'Perfil sanitario publicado por INTA para la campania evaluada.',
  };
}

function replaceDisease(entries, replacement) {
  const filtered = (entries || []).filter(
    (item) => item?.idEnfermedad !== replacement.idEnfermedad,
  );
  return [...filtered, replacement];
}

function ensureDisease(entries, idEnfermedad, enfermedad, metadata) {
  if ((entries || []).some((item) => item?.idEnfermedad === idEnfermedad)) return entries;
  return [...(entries || []), unknownResistance(enfermedad, idEnfermedad, metadata)];
}

function buildResistanceMatrix(seed) {
  let entries = normalizeLegacyEntries(seed);
  if (seed.cultivo === 'Trigo') {
    const rating = WHEAT_SEPTORIA_2020[wheatVarietyKey(seed.variedad)];
    entries = replaceDisease(
      entries,
      rating
        ? wheatResistance(rating)
        : unknownResistance('Mancha de la Hoja', 'trigo.mancha_hoja', {
            fuente: 'INTA Trigo 2025-2026 e INASE RET 2024-2026; sin dato varietal de Septoriosis',
            fuenteUrl:
              'https://www.argentina.gob.ar/sites/default/files/2026/04/inta_crcordoba_eeamarcosjuarez_alberione_e_comportamiento.pdf',
            observaciones:
              'La campania 2025-2026 y los RET oficiales revisados no informan Septoriosis/Mancha de la Hoja para esta variedad.',
          }),
    );
  } else if (seed.cultivo === 'Maiz') {
    const profile = MAIZE_PROFILES.get(
      `${norm(seed.semillero)}|${norm(seed.variedad)}|${norm(seed.ciclo)}`,
    );
    entries = entries.filter(
      (entry) =>
        !['maiz.roya', 'maiz.tizon_foliar'].includes(entry?.idEnfermedad),
    );
    if (profile?.roya) {
      entries = replaceDisease(
        entries,
        observedResistance('Roya del Maiz', 'maiz.roya', profile.roya, 'Maiz'),
      );
    }
    if (profile?.tizon) {
      entries = replaceDisease(
        entries,
        observedResistance(
          'Tizon Foliar del Maiz',
          'maiz.tizon_foliar',
          profile.tizon,
          'Maiz',
        ),
      );
    }
  } else if (seed.cultivo === 'Cebada') {
    const current = BARLEY_2024[norm(seed.variedad)];
    const historical = BARLEY_2017[norm(seed.variedad)];
    const profile = current || historical || {};
    const old = Boolean(!current && historical);
    entries = [
      barleyResistance('Mancha en Red', 'cebada.mancha_red', profile.manchaRed, old),
      barleyResistance('Escaldadura de la Cebada', 'cebada.escaldadura', profile.escaldadura, old),
      barleyResistance('Roya de la Hoja de Cebada', 'cebada.roya_hoja', profile.royaHoja, old),
      barleyResistance('Fusariosis de la Espiga de Cebada', 'cebada.fusariosis_espiga'),
    ];
  }

  for (const [idEnfermedad, enfermedad] of REQUIRED_DISEASES[seed.cultivo] || []) {
    entries = ensureDisease(entries, idEnfermedad, enfermedad, {
      observaciones:
        'La matriz requiere esta entrada, pero el catalogo fuente no informa un perfil varietal validado.',
    });
  }
  return entries;
}

async function matrixSummary(db) {
  const documents = await db.collection('semillas').find(FILTER).toArray();
  const grouped = new Map();
  for (const document of documents) {
    const row = grouped.get(document.cultivo) || {
      cultivo: document.cultivo,
      semillas: 0,
      filasMatriz: 0,
      desconocidas: 0,
      validadas: 0,
      faltantesEstructurales: 0,
    };
    const entries = Array.isArray(document.resistencia) ? document.resistencia : [];
    const required = REQUIRED_DISEASES[document.cultivo] || [];
    row.semillas += 1;
    row.filasMatriz += entries.length;
    row.desconocidas += entries.filter((item) => item.estado === 'desconocida').length;
    row.validadas += entries.filter((item) =>
      ['observada', 'historica'].includes(item.estado),
    ).length;
    row.faltantesEstructurales += required.filter(
      ([id]) => !entries.some((item) => item.idEnfermedad === id),
    ).length;
    grouped.set(document.cultivo, row);
  }
  return [...grouped.values()].sort((a, b) => a.cultivo.localeCompare(b.cultivo));
}

function assertStructuralCoverage(summary) {
  for (const row of summary) {
    if (row.faltantesEstructurales > 0) {
      throw new Error(
        `${row.cultivo}: matriz incompleta (${row.faltantesEstructurales} entradas requeridas ausentes)`,
      );
    }
  }
}

async function plan(db) {
  const affected = await db.collection('semillas').countDocuments(FILTER);
  const affectedIds = await db.collection('semillas').distinct('_id', FILTER);
  const activeReferences = await db.collection('siembras').countDocuments({
    idSemilla: { $in: affectedIds },
  });
  return {
    ok: true,
    migrationId: MIGRATION_ID,
    mode: 'plan',
    affectedSeeds: affected,
    sowingsReferencingAffectedSeeds: activeReferences,
    identityStrategy: 'actualizacion en sitio; no reemplaza _id de semillas existentes',
    matrixBefore: await matrixSummary(db),
    writes: false,
  };
}

async function apply(db) {
  requireConfirmation('apply');
  const existing = await db.collection(MANIFEST_COLLECTION).findOne({
    migrationId: MIGRATION_ID,
    status: 'applied',
  });
  if (existing) {
    throw new Error(`La migracion ya fue aplicada el ${existing.appliedAt}`);
  }

  const originals = await db.collection('semillas').find(FILTER).toArray();
  await db.collection(BACKUP_COLLECTION).deleteMany({ migrationId: MIGRATION_ID });
  if (originals.length) {
    await db.collection(BACKUP_COLLECTION).insertMany(
      originals.map((document) => ({
        migrationId: MIGRATION_ID,
        collection: 'semillas',
        originalId: document._id,
        document,
        createdAt: new Date(),
      })),
    );
  }

  await db.collection(MANIFEST_COLLECTION).updateOne(
    { migrationId: MIGRATION_ID },
    {
      $set: {
        migrationId: MIGRATION_ID,
        status: 'backed_up',
        backupItems: originals.length,
        backedUpAt: new Date(),
      },
    },
    { upsert: true },
  );

  if (originals.length) {
    await db.collection('semillas').bulkWrite(
      originals.map((seed) => ({
        updateOne: {
          filter: { _id: seed._id },
          update: { $set: { resistencia: buildResistanceMatrix(seed) } },
        },
      })),
      { ordered: false },
    );
  }

  // Arveja usa un catalogo JSON normalizado y versionado; no depende del Excel local en Railway.
  runSeed('seed-arveja-local.js', { CHAMAN_ARVEJA_DRY_RUN: 'false' });

  const summary = await matrixSummary(db);
  assertStructuralCoverage(summary);
  await db.collection(MANIFEST_COLLECTION).updateOne(
    { migrationId: MIGRATION_ID },
    {
      $set: {
        status: 'applied',
        appliedAt: new Date(),
        matrixAfter: summary,
      },
    },
  );
  return { ok: true, migrationId: MIGRATION_ID, mode: 'apply', matrixAfter: summary };
}

async function rollback(db) {
  requireConfirmation('rollback');
  const backups = await db
    .collection(BACKUP_COLLECTION)
    .find({ migrationId: MIGRATION_ID, collection: 'semillas' })
    .toArray();
  if (!backups.length) throw new Error('No existe backup para restaurar.');

  await db.collection('semillas').deleteMany(FILTER);
  await db.collection('semillas').insertMany(backups.map((item) => item.document));
  await db.collection(MANIFEST_COLLECTION).updateOne(
    { migrationId: MIGRATION_ID },
    { $set: { status: 'rolled_back', rolledBackAt: new Date() } },
  );
  return {
    ok: true,
    migrationId: MIGRATION_ID,
    mode: 'rollback',
    restored: backups.length,
    matrixAfter: await matrixSummary(db),
  };
}

async function main() {
  if (!DB_URL) throw new Error('Falta MONGO_URI/MONGO_URL/DATABASE_URL/DB_URL.');
  const mode = process.argv[2] || 'plan';
  if (!['plan', 'apply', 'rollback'].includes(mode)) {
    throw new Error('Modo invalido. Usar plan, apply o rollback.');
  }
  const client = await MongoClient.connect(DB_URL, {
    serverSelectionTimeoutMS: Number(
      process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000,
    ),
  });
  try {
    const db = client.db(DB_NAME);
    const result =
      mode === 'apply'
        ? await apply(db)
        : mode === 'rollback'
          ? await rollback(db)
          : await plan(db);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`[${MIGRATION_ID}]`, error);
  process.exit(1);
});
