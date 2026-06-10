const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const { MongoClient, ObjectId } = require('../sdc-datos/node_modules/mongodb');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'sdc-api-admin', 'src', 'auxiliares', 'inicial', 'datos');
const CRONO_DIR = path.join(DATA_DIR, 'crono');
const DEFAULT_EXCEL = 'C:\\Users\\lespinoza\\Downloads\\Variedades - Hibridos (5).xlsx';
const EXCEL_PATH = process.env.CHAMAN_VARIETIES_XLSX || DEFAULT_EXCEL;
const DB_URL = process.env.DB_URL || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'chaman';
const CAMPANIA = '2025-2026';

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

function resistance(enfermedad, rating) {
  const multiplicador = ratingToMultiplier(rating);
  if (multiplicador === undefined) return undefined;
  return { enfermedad, multiplicador };
}

function readVarietiesFromExcel() {
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`No se encontro el Excel de variedades: ${EXCEL_PATH}`);
  }

  const code = `
import json
import math
import pandas as pd

path = r'''${EXCEL_PATH.replace(/\\/g, '\\\\')}'''

def clean(value):
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    text = str(value).strip()
    if text.endswith('.0'):
        text = text[:-2]
    return text if text else None

def records(sheet):
    df = pd.read_excel(path, sheet_name=sheet)
    df.columns = [str(c).strip() for c in df.columns]
    out = []
    for row in df.to_dict(orient='records'):
        cleaned = {str(k).strip(): clean(v) for k, v in row.items()}
        if any(cleaned.values()):
            out.append(cleaned)
    return out

print(json.dumps({
    'trigo': records('TRIGO 25-26'),
    'soja': records('SOJA 25-26'),
    'maiz': records('MAIZ 25-26'),
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

function buildSeedsFromExcel(data) {
  const semillas = [];

  for (const row of data.trigo) {
    const resistencia = [
      resistance('Roya de la Hoja', row['ROYA DE LA HOJA']),
      resistance('Roya del Tallo', row['ROYA DEL TALLO']),
      resistance('Roya Anaranjada', row['ROYA AMARILLA']),
      resistance('Mancha Amarilla', row['MANCHA AMARILLA']),
      resistance('Fusarium de la Espiga', row['FUSARIUM DE LA ESPIGA']),
    ].filter(Boolean);

    semillas.push({
      semillero: cleanText(row.SEMILLERO),
      cultivo: 'Trigo',
      variedad: cleanText(row.VARIEDAD),
      ciclo: norm(row.CICLO),
      resistencia,
      campania: CAMPANIA,
    });
  }

  for (const row of data.soja) {
    semillas.push({
      semillero: cleanText(row.SEMILLERO),
      cultivo: 'Soja',
      variedad: cleanText(row.VARIEDAD),
      ciclo: norm(row['GRUPO DE MADUREZ']),
      resistencia: [],
      campania: CAMPANIA,
    });
  }

  for (const row of data.maiz) {
    const resistencia = [resistance('Roya del Maiz', row.ROYA)].filter(Boolean);
    semillas.push({
      semillero: cleanText(row.EMPRESA),
      cultivo: 'Maiz',
      variedad: cleanText(row.HIBRIDO),
      ciclo: maizeCycle(row['GRUPO DE MADUREZ']),
      resistencia,
      campania: CAMPANIA,
    });
  }

  const unique = new Map();
  for (const semilla of semillas) {
    if (!semilla.semillero || !semilla.cultivo || !semilla.variedad || !semilla.ciclo) continue;
    const key = [semilla.cultivo, norm(semilla.semillero), norm(semilla.variedad), norm(semilla.ciclo), semilla.campania].join('|');
    unique.set(key, semilla);
  }
  return [...unique.values()];
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
  const client = await MongoClient.connect(DB_URL);
  const db = client.db(DB_NAME);

  try {
    const provincias = loadTsArray(path.join(DATA_DIR, 'provincias.ts'));
    const departamentos = loadTsArray(path.join(DATA_DIR, 'departamentos.ts'));
    const enfermedades = loadTsArray(path.join(DATA_DIR, 'enfermedad.ts'));
    const excelData = readVarietiesFromExcel();
    const semillas = buildSeedsFromExcel(excelData);
    const cronos = buildCronos(departamentos, provincias);

    console.log(`Cargando provincias: ${provincias.length}`);
    const provinciasRes = await bulkWrite(db.collection('provincias'), upsertByIdDocs(provincias));

    console.log(`Cargando departamentos: ${departamentos.length}`);
    const departamentosRes = await bulkWrite(db.collection('departamentos'), upsertByIdDocs(departamentos, ['idProvincia']));

    console.log(`Cargando enfermedades: ${enfermedades.length}`);
    const enfermedadesOps = enfermedades.map((doc) => ({
      updateOne: {
        filter: { nombre: doc.nombre, cultivo: doc.cultivo },
        update: { $set: doc },
        upsert: true,
      },
    }));
    const enfermedadesRes = await bulkWrite(db.collection('enfermedads'), enfermedadesOps);

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
    const cronosRes = await bulkWrite(db.collection('cronos'), cronosOps);

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
