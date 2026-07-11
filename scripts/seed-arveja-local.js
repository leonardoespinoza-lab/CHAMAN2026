const fs = require('fs');
const { spawnSync } = require('child_process');
const { MongoClient } = require('../sdc-datos/node_modules/mongodb');

const EXCEL_PATH =
  process.env.CHAMAN_ARVEJA_XLSX ||
  'C:\\Users\\lespinoza\\Downloads\\ARVEJA.xlsx';
const DB_URL = process.env.DB_URL || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'chaman';
const CAMPANIA = process.env.CHAMAN_ARVEJA_CAMPANIA || '2025-2026';
const DRY_RUN = ['true', '1'].includes(
  String(process.env.CHAMAN_ARVEJA_DRY_RUN || process.env.CHAMAN_DRY_RUN || '').toLowerCase(),
);
const PYTHON =
  process.env.CHAMAN_PYTHON ||
  'C:\\Users\\lespinoza\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';

const RANGOS_POR_CICLO = {
  CORTO: { 'S-E': { min: 110, max: 125 }, 'E-R1': { min: 600, max: 650 }, 'R1-MF': { min: 500, max: 550 }, 'S-MF': { min: 1210, max: 1325 } },
  'INTERMEDIO-CORTO': { 'S-E': { min: 115, max: 130 }, 'E-R1': { min: 625, max: 685 }, 'R1-MF': { min: 525, max: 585 }, 'S-MF': { min: 1265, max: 1400 } },
  INTERMEDIO: { 'S-E': { min: 120, max: 135 }, 'E-R1': { min: 650, max: 720 }, 'R1-MF': { min: 550, max: 620 }, 'S-MF': { min: 1320, max: 1475 } },
  'INTERMEDIO-LARGO': { 'S-E': { min: 125, max: 140 }, 'E-R1': { min: 685, max: 760 }, 'R1-MF': { min: 585, max: 660 }, 'S-MF': { min: 1395, max: 1560 } },
  LARGO: { 'S-E': { min: 130, max: 145 }, 'E-R1': { min: 720, max: 800 }, 'R1-MF': { min: 620, max: 700 }, 'S-MF': { min: 1470, max: 1645 } },
};

function clean(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function norm(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function readVarieties() {
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`No se encontro la base de Arveja: ${EXCEL_PATH}`);
  }
  const code = `
import json
import pandas as pd

path = r'''${EXCEL_PATH.replace(/\\/g, '\\\\')}'''
df = pd.read_excel(path, sheet_name='VARIEDADES', dtype=str).fillna('')
df.columns = [str(column).strip() for column in df.columns]
rows = []
for row in df.to_dict(orient='records'):
    semillero = str(row.get('SEMILLERO', '')).strip()
    variedad = str(row.get('VARIEDAD', '')).strip()
    ciclo = str(row.get('CICLO', '')).strip()
    if semillero and variedad and ciclo:
        rows.append({'semillero': semillero, 'variedad': variedad, 'ciclo': ciclo})
print(json.dumps(rows, ensure_ascii=False))
`;
  const result = spawnSync(PYTHON, ['-c', code], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 5,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Error leyendo ARVEJA.xlsx:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function buildSeeds(rows) {
  const sourceDate = fs.statSync(EXCEL_PATH).mtime.toISOString().slice(0, 10);
  const unique = new Map();
  for (const row of rows) {
    const ciclo = norm(row.ciclo);
    const rangosTermicos = RANGOS_POR_CICLO[ciclo];
    if (!rangosTermicos) throw new Error(`Ciclo de Arveja sin referencia termica: ${row.ciclo}`);
    const semilla = {
      codigoCarga: `ARVEJA|${norm(row.semillero)}|${norm(row.variedad)}|${ciclo}|${CAMPANIA}`,
      fuenteBase: 'ARVEJA.xlsx / VARIEDADES y PYTHON',
      semillero: clean(row.semillero),
      cultivo: 'Arveja',
      variedad: clean(row.variedad),
      ciclo,
      resistencia: [],
      campania: CAMPANIA,
      tipoCultivo: 'Anual',
      fenologiaReferencia: {
        unidadEtapas: 'grados_dia',
        temperaturaBaseC: 0,
        rangosTermicos,
        etapasObservables: [
          'S (Siembra)',
          'E (Emergencia)',
          'R1 (Inicio de floracion)',
          'R3 (Formacion de vainas)',
          'MF (Madurez fisiologica)',
        ],
        estadoModelo: 'referencia',
        fuente: `ARVEJA.xlsx / PYTHON; archivo recibido ${sourceDate}; Field pea Tb=0 C: Ontario Agronomy Guide y Bueckert et al. 2021`,
        editable: true,
        observacionesModelo:
          'Se adopta temperatura base 0 C para arveja de campo. Coincide con el texto agronomico del Excel y con bibliografia de field pea; se descarta el bloque de 4 C porque nombra una funcion de avena y no es consistente con la especie. Los registros observados del lote deben usarse para ajustar la respuesta varietal local.',
      },
      observaciones:
        'Catalogo habilitado para crear lotes y registrar fenologia. La fuente no incluye perfiles de resistencia ni un modelo validado de enfermedades para Arveja.',
    };
    const key = [semilla.cultivo, norm(semilla.semillero), norm(semilla.variedad), ciclo, CAMPANIA].join('|');
    unique.set(key, semilla);
  }
  return [...unique.values()];
}

async function main() {
  const semillas = buildSeeds(readVarieties());
  const ciclos = semillas.reduce((acc, semilla) => {
    acc[semilla.ciclo] = (acc[semilla.ciclo] || 0) + 1;
    return acc;
  }, {});

  if (semillas.length !== 19) {
    throw new Error(`Se esperaban 19 variedades unicas de Arveja y se obtuvieron ${semillas.length}.`);
  }

  if (DRY_RUN) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      fuente: EXCEL_PATH,
      campania: CAMPANIA,
      semillas: semillas.length,
      cronos: 0,
      enfermedades: 0,
      ciclos,
      advertencia:
        'No se crean cronos en dias ni enfermedades: la base no trae fechas completas. Se adopta Tb=0 C para arveja de campo y se conservan los umbrales GDD como referencia operativa.',
      muestras: semillas.slice(0, 3),
    }, null, 2));
    return;
  }

  const client = await MongoClient.connect(DB_URL);
  try {
    const collection = client.db(DB_NAME).collection('semillas');
    const operations = semillas.map((doc) => ({
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
    const result = await collection.bulkWrite(operations, { ordered: false });
    console.log(JSON.stringify({
      ok: true,
      fuente: EXCEL_PATH,
      semillas: semillas.length,
      upserted: result.upsertedCount || 0,
      modified: result.modifiedCount || 0,
      matched: result.matchedCount || 0,
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
