const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const { MongoClient, ObjectId } = require('../sdc-datos/node_modules/mongodb');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'sdc-api-admin', 'src', 'auxiliares', 'inicial', 'datos');
const CRONO_DIR = path.join(DATA_DIR, 'crono');
const DEFAULT_EXCEL = 'C:\\Users\\lespinoza\\Downloads\\VARIEDADES TRIGO SOJA MAIZ 2026.xlsx';
const EXCEL_PATH = process.env.CHAMAN_VARIETIES_XLSX || DEFAULT_EXCEL;
const FALLBACK_EXCEL_PATH =
  process.env.CHAMAN_VARIETIES_FALLBACK_XLSX ||
  'C:\\Users\\lespinoza\\Downloads\\Variedades - Hibridos (6).xlsx';
const TRIGO_MODEL_PATH =
  process.env.CHAMAN_TRIGO_DISEASES_XLSX ||
  'C:\\Users\\lespinoza\\Downloads\\Enfermedades en TRIGO -V2.xlsx';
const MAIZ_BASE_PATH =
  process.env.CHAMAN_MAIZ_XLSX ||
  DEFAULT_EXCEL;
const CURRENT_CATALOG_PATH =
  process.env.CHAMAN_CURRENT_CATALOG_XLSX ||
  'C:\\Users\\lespinoza\\Downloads\\cultivo (3).xlsx';
const DB_URL = process.env.DB_URL || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'chaman';
const CAMPANIA = '2025-2026';
const DRY_RUN = ['true', '1'].includes(
  String(process.env.CHAMAN_MASTER_DATA_DRY_RUN || process.env.CHAMAN_DRY_RUN || '').toLowerCase(),
);
const SEEDS_ONLY = process.env.CHAMAN_MASTER_DATA_SEEDS_ONLY === 'true';

const PYTHON =
  process.env.CHAMAN_PYTHON ||
  'C:\\Users\\lespinoza\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';

function loadTsArray(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const body = source
    .replace(/import[\s\S]*?;\s*/g, '')
    .replace(/export const\s+\w+[\s\S]*?=\s*/, 'module.exports = ');
  const sandbox = { module: { exports: undefined }, exports: {} };
  vm.runInNewContext(body, sandbox, { filename: filePath });
  return sandbox.module.exports || [];
}

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
  let result = { upserted: 0, modified: 0, matched: 0 };
  for (const group of chunk(operations, size)) {
    if (!group.length) continue;
    const res = await collection.bulkWrite(group, { ordered: false });
    result.upserted += res.upsertedCount || 0;
    result.modified += res.modifiedCount || 0;
    result.matched += res.matchedCount || 0;
  }
  return result;
}

function upsertByIdDocs(docs, idFields = []) {
  return docs.map((doc) => {
    const normalized = { ...doc, _id: toObjectId(doc._id) };
    for (const field of idFields) {
      if (normalized[field]) normalized[field] = toObjectId(normalized[field]);
    }
    return {
      updateOne: {
        filter: { _id: normalized._id },
        update: { $set: normalized },
        upsert: true,
      },
    };
  });
}

function ratingToMultiplier(value) {
  const key = norm(value);
  const map = {
    R: 0.05,
    T: 0.05,
    MR: 0.5,
    MT: 0.5,
    MS: 0.75,
    S: 1,
    I: 1,
  };
  return map[key];
}

function ratingToResistanceIndex(value) {
  const key = norm(value);
  const map = {
    R: 1,
    T: 1,
    MR: 2 / 3,
    MT: 2 / 3,
    MS: 1 / 3,
    S: 0,
    I: 0,
  };
  return map[key];
}

function resistance(enfermedad, idEnfermedad, rating, metadata = {}) {
  const multiplicador = ratingToMultiplier(rating);
  const desconocida = multiplicador === undefined;
  return {
    enfermedad,
    idEnfermedad,
    multiplicador: desconocida ? 1 : multiplicador,
    indiceResistencia: desconocida ? 0 : ratingToResistanceIndex(rating),
    perfil: desconocida ? 'DESCONOCIDA' : norm(rating),
    estado: desconocida ? 'desconocida' : metadata.estado || 'observada',
    confianza: desconocida
      ? 'sin_datos'
      : metadata.confianza || 'alta',
    fuente: metadata.fuente,
    fuenteUrl: metadata.fuenteUrl,
    campaniaFuente: metadata.campaniaFuente,
    fechaFuente: metadata.fechaFuente,
    observaciones:
      metadata.observaciones ||
      (desconocida
        ? 'La fuente seleccionada no informa este perfil sanitario; no equivale a susceptible observado.'
        : undefined),
  };
}

function readVarietiesFromExcel() {
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`No se encontro el Excel de variedades: ${EXCEL_PATH}`);
  }

  const code = `
import json
import math
import os
import pandas as pd

path = r'''${EXCEL_PATH.replace(/\\/g, '\\\\')}'''
fallback_path = r'''${FALLBACK_EXCEL_PATH.replace(/\\/g, '\\\\')}'''
trigo_model_path = r'''${TRIGO_MODEL_PATH.replace(/\\/g, '\\\\')}'''
maiz_path = r'''${MAIZ_BASE_PATH.replace(/\\/g, '\\\\')}'''
catalog_path = r'''${CURRENT_CATALOG_PATH.replace(/\\/g, '\\\\')}'''

def clean(value):
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    text = str(value).strip()
    if text.endswith('.0'):
        text = text[:-2]
    return text if text else None

def records(source_path, sheet):
    df = pd.read_excel(source_path, sheet_name=sheet)
    df.columns = [str(c).strip() for c in df.columns]
    out = []
    for index, row in enumerate(df.to_dict(orient='records')):
        cleaned = {str(k).strip(): clean(v) for k, v in row.items()}
        if any(cleaned.values()):
            cleaned['__excelRow'] = index + 2
            out.append(cleaned)
    return out

def has_sheet(source_path, sheet):
    if not os.path.exists(source_path):
        return False
    return sheet in pd.ExcelFile(source_path).sheet_names

def soy_records():
    if has_sheet(path, 'SOJA 25-26'):
        return records(path, 'SOJA 25-26')
    if has_sheet(fallback_path, 'SOJA 25-26'):
        return records(fallback_path, 'SOJA 25-26')
    if has_sheet(catalog_path, 'Semillas'):
        return [row for row in records(catalog_path, 'Semillas') if str(row.get('cultivo') or '').strip().upper() == 'SOJA']
    return []

def maize_records():
    if has_sheet(maiz_path, 'MAIZ 25-26'):
        return records(maiz_path, 'MAIZ 25-26')
    if has_sheet(maiz_path, 'Hoja1'):
        return records(maiz_path, 'Hoja1')
    return []

print(json.dumps({
    'trigo': records(path, 'TRIGO 25-26'),
    'trigoHistorico': records(trigo_model_path, 'VARIEDADES 20-21'),
    'soja': soy_records(),
    'maiz': maize_records(),
}, ensure_ascii=False))
`;

  const res = spawnSync(PYTHON, ['-c', code], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`Error leyendo Excel con Python:\n${res.stderr}`);
  }
  return JSON.parse(res.stdout);
}

function maizeCycle(grupoMadurez) {
  const n = Number(cleanText(grupoMadurez).replace(',', '.'));
  if (!Number.isFinite(n)) return 'INTERMEDIO';
  if (n <= 117) return 'PRECOZ';
  if (n <= 120) return 'INTERMEDIO';
  return 'LARGO';
}

function varietyMatchKey(semillero, variedad) {
  const seedCompany = norm(semillero);
  let cultivar = norm(variedad);
  if (seedCompany && cultivar.startsWith(`${seedCompany} `)) {
    cultivar = cultivar.slice(seedCompany.length + 1);
  }
  return `${seedCompany}|${cultivar}`;
}

function varietyNameKey(variedad) {
  return norm(variedad)
    .replace(/^(LIMA GRAIN|LIMAGRAIN|LG|BUCK|ACA|KLEIN|BIOCERES|BIOSEMINIS|NIDERA|DON MARIO|DM|MS INTA)\s+/, '')
    .replace(/[^A-Z0-9]/g, '');
}

function buildSeedsFromExcel(data) {
  const semillas = [];
  const fechaCatalogo = fs.statSync(EXCEL_PATH).mtime.toISOString().slice(0, 10);
  const fechaMaiz = fs.statSync(MAIZ_BASE_PATH).mtime.toISOString().slice(0, 10);
  const trigoHistorico = new Map(
    (data.trigoHistorico || []).map((row) => [
      varietyMatchKey(row.SEMILLERO, row.VARIEDAD),
      row,
    ]),
  );
  const historicosPorNombre = new Map();
  for (const row of data.trigoHistorico || []) {
    const key = varietyNameKey(row.VARIEDAD);
    if (!key) continue;
    if (historicosPorNombre.has(key)) {
      historicosPorNombre.set(key, undefined);
    } else {
      historicosPorNombre.set(key, row);
    }
  }
  const fuenteTrigoReciente = {
    fuente: `${path.basename(EXCEL_PATH)} / TRIGO 25-26`,
    fuenteUrl: 'https://www.argentina.gob.ar/sites/default/files/2026/04/inta_crcordoba_eeamarcosjuarez_alberione_e_comportamiento.pdf',
    campaniaFuente: '2025-2026',
    fechaFuente: fechaCatalogo,
  };

  for (const row of data.trigo) {
    const historica =
      trigoHistorico.get(varietyMatchKey(row.SEMILLERO, row.VARIEDAD)) ||
      historicosPorNombre.get(varietyNameKey(row.VARIEDAD));
    const resistencia = [
      resistance('Roya de la Hoja', 'trigo.roya_hoja', row.RH ?? row['ROYA DE LA HOJA'], fuenteTrigoReciente),
      resistance('Roya del Tallo', 'trigo.roya_tallo', row.RT ?? row['ROYA DEL TALLO'], fuenteTrigoReciente),
      resistance('Roya Anaranjada', 'trigo.roya_anaranjada', row.RA ?? row['ROYA AMARILLA'], fuenteTrigoReciente),
      resistance('Mancha Amarilla', 'trigo.mancha_amarilla', row.MA ?? row['MANCHA AMARILLA'], fuenteTrigoReciente),
      resistance('Fusarium de la Espiga', 'trigo.fusarium_espiga', row.FE ?? row['FUSARIUM DE LA ESPIGA'], fuenteTrigoReciente),
      resistance(
        'Mancha de la Hoja',
        'trigo.mancha_hoja',
        historica?.SH,
        historica?.SH
          ? {
              fuente: 'Enfermedades en TRIGO -V2.xlsx / VARIEDADES 20-21 / SH',
              campaniaFuente: '2020-2021',
              fechaFuente: '2021-12-31',
              estado: 'historica',
              confianza: 'baja',
              observaciones: 'Fallback histórico usado solo porque la campaña 2025-2026 no informa Septoria/Mancha de la Hoja.',
            }
          : {
              ...fuenteTrigoReciente,
              observaciones: historica
                ? 'La campaña 2025-2026 no informa Septoria/Mancha de la Hoja; la variedad coincide con 2020-2021, pero esa fila tampoco contiene SH.'
                : 'La campaña 2025-2026 no informa Septoria/Mancha de la Hoja y no se encontró coincidencia histórica.',
            },
      ),
    ];

    semillas.push({
      semillero: cleanText(row.SEMILLERO),
      cultivo: 'Trigo',
      variedad: cleanText(row.VARIEDAD),
      ciclo: norm(row.CICLO),
      resistencia,
      campania: CAMPANIA,
      __sourceRows: [row.__excelRow],
    });
  }

  for (const row of data.soja) {
    const semillero = row.SEMILLERO ?? row.semillero;
    const variedad = row.VARIEDAD ?? row.variedad;
    const ciclo = row['GRUPO DE MADUREZ'] ?? row.ciclo;
    const campania = row.campania || CAMPANIA;
    semillas.push({
      semillero: cleanText(semillero),
      cultivo: 'Soja',
      variedad: cleanText(variedad),
      ciclo: norm(ciclo),
      resistencia: [
        resistance('Fin de Ciclo', 'soja.fin_ciclo', undefined, {
          fuente: 'Catálogo de variedades de Soja; sin columna sanitaria específica',
          campaniaFuente: campania,
          fechaFuente: fechaCatalogo,
        }),
      ],
      campania,
      __sourceRows: [row.__excelRow],
    });
  }

  for (const row of data.maiz) {
    const fuenteMaiz = {
      fuente: `${path.basename(MAIZ_BASE_PATH)} / ${path.resolve(MAIZ_BASE_PATH) === path.resolve(EXCEL_PATH) ? 'MAIZ 25-26' : 'Hoja1'}`,
      campaniaFuente: row.campania || '2025-2026',
      fechaFuente: fechaMaiz,
    };
    const resistencia = [
      resistance('Roya del Maiz', 'maiz.roya', row.ROYA, fuenteMaiz),
      resistance('Tizon Foliar del Maiz', 'maiz.tizon_foliar', row.TIZON, fuenteMaiz),
    ];
    semillas.push({
      semillero: cleanText(row.EMPRESA ?? row.semillero),
      cultivo: 'Maiz',
      variedad: cleanText(row.HIBRIDO ?? row.variedad),
      ciclo: maizeCycle(row['GRUPO DE MADUREZ'] ?? row.ciclo),
      resistencia,
      campania: row.campania || CAMPANIA,
      __sourceRows: [row.__excelRow],
    });
  }

  const unique = new Map();
  for (const semilla of semillas) {
    if (!semilla.semillero || !semilla.cultivo || !semilla.variedad || !semilla.ciclo) continue;
    const key = [semilla.cultivo, norm(semilla.semillero), norm(semilla.variedad), norm(semilla.ciclo), semilla.campania].join('|');
    const existing = unique.get(key);
    unique.set(key, existing ? mergeDuplicateSeeds(existing, semilla) : semilla);
  }
  return [...unique.values()].map(({ __sourceRows, ...semilla }) => semilla);
}

function buildSeedsFromBundledCatalog() {
  const bundled = loadTsArray(path.join(DATA_DIR, 'semillas.ts'));
  return bundled
    .filter((semilla) => ['Trigo', 'Soja', 'Maiz'].includes(semilla.cultivo))
    .map((semilla) => ({
      ...semilla,
      ciclo: norm(semilla.ciclo),
      campania: semilla.campania || CAMPANIA,
      fuenteBase: semilla.fuenteBase || 'Catalogo base incluido en el repositorio',
    }));
}

function mergeDuplicateSeeds(existing, incoming) {
  const sourceRows = [...new Set([...(existing.__sourceRows || []), ...(incoming.__sourceRows || [])])];
  const existingByDisease = new Map(
    (existing.resistencia || []).map((item) => [item.idEnfermedad || item.enfermedad, item]),
  );
  for (const item of incoming.resistencia || []) {
    const key = item.idEnfermedad || item.enfermedad;
    const previous = existingByDisease.get(key);
    if (!previous) {
      existingByDisease.set(key, item);
      continue;
    }
    const previousKnown = previous.estado !== 'desconocida';
    const incomingKnown = item.estado !== 'desconocida';
    const previousConflict = String(previous.observaciones || '').startsWith('Conflicto entre filas');
    if (previousConflict) continue;
    if (previousKnown && incomingKnown && previous.perfil !== item.perfil) {
      existingByDisease.set(key, resistance(item.enfermedad, item.idEnfermedad, undefined, {
        fuente: item.fuente,
        campaniaFuente: item.campaniaFuente,
        fechaFuente: item.fechaFuente,
        observaciones: `Conflicto entre filas ${sourceRows.join(', ')} de la fuente: perfiles ${previous.perfil} y ${item.perfil}. Se conserva como desconocido hasta validacion.`,
      }));
    } else if (!previousKnown && incomingKnown) {
      existingByDisease.set(key, item);
    }
  }
  return {
    ...existing,
    resistencia: [...existingByDisease.values()],
    __sourceRows: sourceRows,
    observaciones: sourceRows.length > 1
      ? `Identidad consolidada desde filas ${sourceRows.join(', ')}; los conflictos sanitarios se marcan como desconocidos.`
      : existing.observaciones,
  };
}

function buildCronos(departamentos, provincias) {
  const provinceById = new Map(provincias.map((p) => [String(p._id), p]));
  const departmentByName = new Map();
  const departmentByNameProvince = new Map();

  for (const d of departamentos) {
    const nameKey = norm(d.nombre);
    if (!departmentByName.has(nameKey)) departmentByName.set(nameKey, d);
    const provincia = provinceById.get(String(d.idProvincia));
    if (provincia) departmentByNameProvince.set(`${nameKey}|${norm(provincia.nombre)}`, d);
  }

  const cronos = [];
  for (const file of fs.readdirSync(CRONO_DIR).filter((f) => f.endsWith('.ts'))) {
    const rows = loadTsArray(path.join(CRONO_DIR, file));
    for (const row of rows) {
      const nameKey = norm(row.departamento);
      const department =
        (row.provincia && departmentByNameProvince.get(`${nameKey}|${norm(row.provincia)}`)) ||
        departmentByName.get(nameKey);
      if (!department) continue;
      cronos.push({
        cultivo: row.cultivo || 'Trigo',
        idDepartamento: toObjectId(department._id),
        ciclo: norm(row.ciclo),
        diaSiembra: Number(row.diaSiembra),
        mesSiembra: Number(row.mesSiembra),
        etapas: row.etapas,
      });
    }
  }

  const unique = new Map();
  for (const crono of cronos) {
    const key = [crono.cultivo, crono.idDepartamento.toHexString(), crono.ciclo, crono.mesSiembra, crono.diaSiembra].join('|');
    unique.set(key, crono);
  }
  return [...unique.values()];
}

async function main() {
  const provincias = loadTsArray(path.join(DATA_DIR, 'provincias.ts'));
  const departamentos = loadTsArray(path.join(DATA_DIR, 'departamentos.ts'));
  const enfermedades = loadTsArray(path.join(DATA_DIR, 'enfermedad.ts'));
  const usandoExcel = fs.existsSync(EXCEL_PATH);
  const semillas = usandoExcel
    ? buildSeedsFromExcel(readVarietiesFromExcel())
    : buildSeedsFromBundledCatalog();
  const cronos = buildCronos(departamentos, provincias);

  if (DRY_RUN) {
    const resistencia = semillas.flatMap((semilla) =>
      (semilla.resistencia || []).map((item) => ({
        cultivo: semilla.cultivo,
        enfermedad: item.enfermedad,
        estado: item.estado,
        campaniaFuente: item.campaniaFuente,
      })),
    );
    const resumen = resistencia.reduce((acc, item) => {
      const key = `${item.cultivo}|${item.enfermedad}|${item.estado}|${item.campaniaFuente}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          fuentes: {
            variedades: EXCEL_PATH,
            variedadesFallback: FALLBACK_EXCEL_PATH,
            trigoHistorico: TRIGO_MODEL_PATH,
            maiz: MAIZ_BASE_PATH,
            catalogoActual: CURRENT_CATALOG_PATH,
            catalogoBundled: usandoExcel
              ? undefined
              : path.join(DATA_DIR, 'semillas.ts'),
          },
          semillas: semillas.length,
          cronos: cronos.length,
          resumenResistencias: resumen,
          muestras: semillas.slice(0, 3),
        },
        null,
        2,
      ),
    );
    return;
  }

  const client = await MongoClient.connect(DB_URL);
  const db = client.db(DB_NAME);

  try {
    let provinciasRes = { skipped: SEEDS_ONLY };
    let departamentosRes = { skipped: SEEDS_ONLY };
    let enfermedadesRes = { skipped: SEEDS_ONLY };
    let cronosRes = { skipped: SEEDS_ONLY };
    if (!SEEDS_ONLY) {
      console.log(`Cargando provincias: ${provincias.length}`);
      provinciasRes = await bulkWrite(db.collection('provincias'), upsertByIdDocs(provincias));

      console.log(`Cargando departamentos: ${departamentos.length}`);
      departamentosRes = await bulkWrite(db.collection('departamentos'), upsertByIdDocs(departamentos, ['idProvincia']));

      console.log(`Cargando enfermedades: ${enfermedades.length}`);
      const enfermedadesOps = enfermedades.map((doc) => ({
        updateOne: {
          filter: { nombre: doc.nombre, cultivo: doc.cultivo },
          update: { $set: doc },
          upsert: true,
        },
      }));
      enfermedadesRes = await bulkWrite(db.collection('enfermedads'), enfermedadesOps);

      console.log(`Cargando cronos/fenologias: ${cronos.length}`);
      const cronosOps = cronos.map((doc) => ({
        updateOne: {
          filter: {
            cultivo: doc.cultivo,
            idDepartamento: doc.idDepartamento,
            ciclo: doc.ciclo,
            mesSiembra: doc.mesSiembra,
            diaSiembra: doc.diaSiembra,
          },
          update: { $set: doc },
          upsert: true,
        },
      }));
      cronosRes = await bulkWrite(db.collection('cronos'), cronosOps);
    }

    console.log(`Cargando semillas ${CAMPANIA}: ${semillas.length}`);
    const semillasOps = semillas.map((doc) => ({
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
    }));
    const semillasRes = await bulkWrite(db.collection('semillas'), semillasOps);

    const counts = {};
    for (const name of ['provincias', 'departamentos', 'enfermedads', 'cronos', 'semillas']) {
      counts[name] = await db.collection(name).countDocuments();
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          sourceExcel: EXCEL_PATH,
          campania: CAMPANIA,
          seedsOnly: SEEDS_ONLY,
          results: {
            provincias: provinciasRes,
            departamentos: departamentosRes,
            enfermedades: enfermedadesRes,
            cronos: cronosRes,
            semillas: semillasRes,
          },
          counts,
          semillasPorCultivo: {
            Trigo: semillas.filter((s) => s.cultivo === 'Trigo').length,
            Soja: semillas.filter((s) => s.cultivo === 'Soja').length,
            Maiz: semillas.filter((s) => s.cultivo === 'Maiz').length,
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
