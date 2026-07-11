const cebadaCronos = require('./data/cebada/cebada-buenos-aires-cronos.json');
const cebadaVariedades = require('./data/cebada/cebada-variedades.json');
const { MongoClient, ObjectId } = require('../sdc-datos/node_modules/mongodb');

const DB_URL =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL ||
  process.env.DB_URL ||
  'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'chaman';
const DRY_RUN = ['true', '1'].includes(
  String(process.env.CHAMAN_CEBADA_DRY_RUN || process.env.CHAMAN_DRY_RUN || '').toLowerCase(),
);
const VALIDATE_ONLY = process.env.CHAMAN_CEBADA_VALIDATE_ONLY === 'true';
const ALLOW_PARTIAL = process.env.CHAMAN_CEBADA_ALLOW_PARTIAL === 'true';
const SERVER_SELECTION_TIMEOUT_MS = Number(
  process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000,
);
const CROP = 'Cebada';
const SOURCE = 'BASE CEBADA v1.xlsx';

const DEPARTMENT_ALIASES = {
  'ADOLFO GONZALEZ CHAVEZ': 'ADOLFO GONZALES CHAVES',
  'NUEVE DE JULIO': '9 DE JULIO',
  'VEINTICINCO DE MAYO': '25 DE MAYO',
};

const STAGE_KEYS = [
  'siembra_emergencia',
  'emergencia_primer_nudo',
  'primer_nudo_hoja_bandera',
  'hoja_bandera_espigazon',
  'espigazon_antesis',
  'antesis_llenado_granos',
  'llenado_granos_madurez_fisiologica',
];

const DISEASES = [
  {
    nombre: 'Mancha en Red',
    cultivo: CROP,
    etapas: [1, 2, 3, 4, 5],
    formula:
      'Cebada V2: F_Temp=(T-5)*(30-T)/150, F_Hum por HR >=90/80, tasa diaria x Kvar y severidad acumulada logistica.',
    tempMin: 10,
    tempMax: 27,
    rocioMin: 82,
    rocioMax: 100,
  },
  {
    nombre: 'Escaldadura de la Cebada',
    cultivo: CROP,
    etapas: [1, 2, 3, 4],
    formula:
      'Cebada V2: RI=f(T) trapezoidal 4-25 C x f(HMF) 12-24 h x f(PP) 1-5 mm x Kvar.',
    tempMin: 5,
    tempMax: 22,
    rocioMin: 85,
    rocioMax: 100,
  },
  {
    nombre: 'Roya de la Hoja de Cebada',
    cultivo: CROP,
    etapas: [2, 3, 4, 5, 6],
    formula:
      'Cebada V2: Sev%=4.42+0.61*GD+0.57*DHR-30.01*IR con GD/DHR acumulados.',
    tempMin: 10,
    tempMax: 27,
    rocioMin: 70,
    rocioMax: 100,
  },
  {
    nombre: 'Fusariosis de la Espiga de Cebada',
    cultivo: CROP,
    etapas: [4, 5, 6],
    formula:
      'Cebada V2: I%=20.37+8.63*PMoj-0.49*GDN, ponderado por perfil varietal.',
    tempMin: 15,
    tempMax: 30,
    rocioMin: 78,
    rocioMax: 100,
  },
];

const VARIETIES = cebadaVariedades.varieties || [];

function cleanText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

function norm(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function departmentKey(departamento, provincia) {
  const normalizedDepartment =
    DEPARTMENT_ALIASES[norm(departamento)] || norm(departamento);
  return `${normalizedDepartment}|${norm(provincia)}`;
}

function toObjectId(value) {
  if (!value) return value;
  if (value instanceof ObjectId) return value;
  return new ObjectId(String(value));
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function bulkWrite(collection, operations, size = 1000) {
  const result = { upserted: 0, modified: 0, matched: 0 };
  for (const group of chunk(operations, size)) {
    if (!group.length) continue;
    const res = await collection.bulkWrite(group, { ordered: false });
    result.upserted += res.upsertedCount || 0;
    result.modified += res.modifiedCount || 0;
    result.matched += res.matchedCount || 0;
  }
  return result;
}

async function ensureCronoVarietyIndex(db) {
  const collection = db.collection('cronos');
  const oldKey = {
    cultivo: 1,
    idDepartamento: 1,
    ciclo: 1,
    mesSiembra: 1,
    diaSiembra: 1,
  };
  const indexes = await collection.indexes();
  const oldIndex = indexes.find((idx) => JSON.stringify(idx.key) === JSON.stringify(oldKey));
  if (oldIndex) {
    await collection.dropIndex(oldIndex.name);
  }
  await collection.createIndex(
    {
      cultivo: 1,
      idDepartamento: 1,
      ciclo: 1,
      variedad: 1,
      mesSiembra: 1,
      diaSiembra: 1,
    },
    {
      unique: true,
      name: 'cultivo_1_idDepartamento_1_ciclo_1_variedad_1_mesSiembra_1_diaSiembra_1',
    },
  );
}

async function loadDepartmentMap(db) {
  const [provincias, departamentos] = await Promise.all([
    db.collection('provincias').find({}).project({ nombre: 1 }).toArray(),
    db
      .collection('departamentos')
      .find({})
      .project({ nombre: 1, idProvincia: 1 })
      .toArray(),
  ]);
  const provinceById = new Map(provincias.map((p) => [String(p._id), p]));
  const byNameProvince = new Map();
  const byName = new Map();

  for (const departamento of departamentos) {
    const provincia = provinceById.get(String(departamento.idProvincia));
    const nameKey = norm(departamento.nombre);
    if (!byName.has(nameKey)) byName.set(nameKey, departamento);
    if (provincia) {
      byNameProvince.set(`${nameKey}|${norm(provincia.nombre)}`, departamento);
    }
  }

  return { byNameProvince, byName };
}

function resolveDepartment(record, departmentMap) {
  const key = departmentKey(record.departamento, record.provincia);
  return (
    departmentMap.byNameProvince.get(key) ||
    departmentMap.byName.get(DEPARTMENT_ALIASES[norm(record.departamento)] || norm(record.departamento))
  );
}

function cronoDoc(record, idDepartamento) {
  const doc = {
    cultivo: CROP,
    variedad: norm(record.cultivar),
    ciclo: norm(record.ciclo),
    diaSiembra: Number(record.diaSiembra),
    mesSiembra: Number(record.mesSiembra),
    etapas: record.etapas,
  };
  if (idDepartamento) doc.idDepartamento = toObjectId(idDepartamento);
  return doc;
}

function buildDepartmentCronos(records, departmentMap) {
  const cronos = [];
  const missing = new Map();

  for (const record of records) {
    const department = resolveDepartment(record, departmentMap);
    if (!department) {
      const key = `${record.departamento}|${record.provincia}`;
      missing.set(key, (missing.get(key) || 0) + 1);
      continue;
    }
    cronos.push(cronoDoc(record, department._id));
  }

  return { cronos: uniqueCronos(cronos), missing };
}

function buildGenericCronos(records) {
  const groups = new Map();
  for (const record of records) {
    const key = [
      norm(record.cultivar),
      norm(record.ciclo),
      Number(record.mesSiembra),
      Number(record.diaSiembra),
    ].join('|');
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(record);
  }

  const cronos = [];
  for (const rows of groups.values()) {
    const base = rows[0];
    const etapas = {};
    for (const stage of STAGE_KEYS) {
      const avg = rows.reduce((sum, row) => sum + Number(row.etapas[stage] || 0), 0) / rows.length;
      etapas[stage] = Math.round(avg);
    }
    cronos.push(
      cronoDoc(
        {
          ...base,
          etapas,
        },
        undefined,
      ),
    );
  }
  return uniqueCronos(cronos);
}

function uniqueCronos(cronos) {
  const unique = new Map();
  for (const crono of cronos) {
    const key = [
      crono.cultivo,
      crono.idDepartamento ? String(crono.idDepartamento) : 'GEN',
      crono.ciclo,
      crono.variedad || 'GEN',
      crono.mesSiembra,
      crono.diaSiembra,
    ].join('|');
    unique.set(key, crono);
  }
  return [...unique.values()];
}

function buildCronoOps(cronos) {
  return cronos.map((doc) => {
    const filter = {
      cultivo: doc.cultivo,
      ciclo: doc.ciclo,
      variedad: doc.variedad,
      mesSiembra: doc.mesSiembra,
      diaSiembra: doc.diaSiembra,
    };
    if (doc.idDepartamento) {
      filter.idDepartamento = doc.idDepartamento;
    } else {
      filter.idDepartamento = { $exists: false };
    }

    return {
      updateOne: {
        filter,
        update: doc.idDepartamento
          ? { $set: doc }
          : { $set: doc, $unset: { idDepartamento: '' } },
        upsert: true,
      },
    };
  });
}

function buildDiseaseOps() {
  return DISEASES.map((doc) => ({
    updateOne: {
      filter: { nombre: doc.nombre, cultivo: doc.cultivo },
      update: { $set: doc },
      upsert: true,
    },
  }));
}

function buildSeedOps() {
  const resistenciasDesconocidas = DISEASES.map((enfermedad) => ({
    enfermedad: enfermedad.nombre,
    idEnfermedad:
      enfermedad.nombre === 'Mancha en Red'
        ? 'cebada.mancha_red'
        : enfermedad.nombre === 'Escaldadura de la Cebada'
          ? 'cebada.escaldadura'
          : enfermedad.nombre === 'Roya de la Hoja de Cebada'
            ? 'cebada.roya_hoja'
            : 'cebada.fusariosis_espiga',
    multiplicador: 1,
    indiceResistencia: 0,
    perfil: 'DESCONOCIDA',
    estado: 'desconocida',
    confianza: 'sin_datos',
    fuente: 'BASE CEBADA v1.xlsx no contiene resistencia varietal',
    campaniaFuente: '2026-2027',
    fechaFuente: '2026-07-01',
    observaciones:
      'Escenario conservador para cálculo; no equivale a susceptibilidad observada.',
  }));
  return VARIETIES.map((item) => {
    const doc = {
      codigoCarga: `CEBADA-${norm(item.variedad).replace(/[^A-Z0-9]+/g, '-')}`,
      fuenteBase: SOURCE,
      semillero: 'Base Cebada CHAMAN',
      cultivo: CROP,
      variedad: norm(item.variedad),
      ciclo: norm(item.ciclo),
      campania: '2026-2027',
      tipoCultivo: 'Anual',
      resistencia: resistenciasDesconocidas,
      fenologiaReferencia: {
        brotacion: 'Emergencia segun crono por zona, fecha de siembra, ciclo y variedad.',
        floracion: 'Espigazon/antesis segun crono de la base Cebada v1.',
        cosecha: 'Madurez fisiologica segun acumulacion fenologica del crono.',
        fuente: SOURCE,
        editable: true,
      },
      observaciones:
        item.ciclo === 'SIN DEFINIR'
          ? 'Variedad registrada desde la hoja VARIEDADES; falta ciclo fenologico validado para activar prediccion robusta.'
          : `Variedad ${item.tipo || 'cebada'} con crono fenologico cargado desde ${SOURCE}.`,
    };
    return {
      updateOne: {
        filter: {
          cultivo: doc.cultivo,
          semillero: doc.semillero,
          variedad: doc.variedad,
          ciclo: doc.ciclo,
          campania: doc.campania,
        },
        update: { $set: doc },
        upsert: true,
      },
    };
  });
}

async function main() {
  const records = cebadaCronos.records || [];
  if (VALIDATE_ONLY) {
    const genericCronos = buildGenericCronos(records);
    console.log(
      JSON.stringify(
        {
          ok: true,
          validateOnly: true,
          source: cebadaCronos.metadata,
          seedSource: cebadaVariedades.metadata,
          invalidRows: cebadaCronos.invalidRows?.length || 0,
          semillas: VARIETIES.length,
          enfermedades: DISEASES.length,
          cronosFuente: records.length,
          cronosGenericos: genericCronos.length,
          variedadesConCrono: [...new Set(records.map((row) => row.cultivar))],
        },
        null,
        2,
      ),
    );
    return;
  }

  const client = await MongoClient.connect(DB_URL, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
  });
  const db = client.db(DB_NAME);

  try {
    const departmentMap = await loadDepartmentMap(db);
    const { cronos: departmentCronos, missing } = buildDepartmentCronos(records, departmentMap);
    const genericCronos = buildGenericCronos(records);
    const cronos = [...departmentCronos, ...genericCronos];

    const summary = {
      ok: true,
      dryRun: DRY_RUN,
      source: cebadaCronos.metadata,
      seedSource: cebadaVariedades.metadata,
      semillas: VARIETIES.length,
      enfermedades: DISEASES.length,
      cronosDepartamentales: departmentCronos.length,
      cronosGenericos: genericCronos.length,
      missingDepartamentos: [...missing.entries()].map(([key, count]) => ({ key, count })),
      varieties: VARIETIES.map((item) => `${item.variedad} (${item.ciclo})`),
    };

    if (missing.size && !ALLOW_PARTIAL) {
      console.log(JSON.stringify(summary, null, 2));
      throw new Error('Hay departamentos de Cebada sin mapear. Revisar aliases antes de cargar.');
    }

    if (missing.size) {
      console.warn(
        `[cebada] ${missing.size} departamentos sin mapear; se cargaran semillas, enfermedades, cronos genericos y los cronos departamentales disponibles.`,
      );
    }

    if (DRY_RUN) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    await ensureCronoVarietyIndex(db);
    const semillasRes = await bulkWrite(db.collection('semillas'), buildSeedOps());
    const enfermedadesRes = await bulkWrite(db.collection('enfermedads'), buildDiseaseOps());
    const cronosRes = await bulkWrite(db.collection('cronos'), buildCronoOps(cronos));

    console.log(
      JSON.stringify(
        {
          ...summary,
          results: {
            semillas: semillasRes,
            enfermedades: enfermedadesRes,
            cronos: cronosRes,
          },
          counts: {
            semillasCebada: await db.collection('semillas').countDocuments({ cultivo: CROP }),
            enfermedadesCebada: await db.collection('enfermedads').countDocuments({ cultivo: CROP }),
            cronosCebada: await db.collection('cronos').countDocuments({ cultivo: CROP }),
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
