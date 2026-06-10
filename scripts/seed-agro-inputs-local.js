const fs = require('fs');
const { spawnSync } = require('child_process');
const { MongoClient } = require('../sdc-datos/node_modules/mongodb');

const DEFAULT_EXCEL = 'C:\\Users\\lespinoza\\Downloads\\BASE DE DATOS DE AGROQUIMICOS Y FERTILIZANTES.xlsx';
const EXCEL_PATH = process.env.CHAMAN_AGRO_INPUTS_XLSX || DEFAULT_EXCEL;
const DB_URL = process.env.DB_URL || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'chaman';
const PYTHON =
  process.env.CHAMAN_PYTHON ||
  'C:\\Users\\lespinoza\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';

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

function toNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : undefined;
}

function readWorkbook() {
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`No se encontro el Excel: ${EXCEL_PATH}`);
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
    return text or None

def num(value):
    value = clean(value)
    if value is None:
        return None
    try:
        return float(str(value).replace(',', '.'))
    except Exception:
        return None

fert_df = pd.read_excel(path, sheet_name='BASE DE FERTILIZANTES')
fertilizantes = []
for row in fert_df.to_dict(orient='records'):
    nombre = clean(row.get('FERTILIZANTES'))
    if not nombre:
        continue
    fertilizantes.append({
        'nombre': nombre,
        'porcentajeN': num(row.get('%N')),
        'porcentajeP': num(row.get('%P')),
    })

agro_df = pd.read_excel(path, sheet_name='BASE AGROQUIMICOS')
principios = {}

def add_principio(nombre, koc, persistencia):
    nombre = clean(nombre)
    if not nombre:
        return
    key = nombre.upper()
    principios[key] = {
        'nombre': nombre,
        'koc': num(koc),
        'persistencia': num(persistencia),
    }

for row in agro_df.itertuples(index=False):
    values = list(row)
    if len(values) >= 4:
        add_principio(values[0], values[2], values[3])
    if len(values) >= 8:
        add_principio(values[5], values[6], values[7])

print(json.dumps({
    'fertilizantes': fertilizantes,
    'principiosActivos': list(principios.values()),
}, ensure_ascii=False))
`;

  const result = spawnSync(PYTHON, ['-c', code], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Error leyendo Excel con Python:\n${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function dedupeByName(items) {
  const map = new Map();
  for (const item of items) {
    const nombre = cleanText(item.nombre);
    if (!nombre) continue;
    map.set(norm(nombre), { ...item, nombre });
  }
  return [...map.values()];
}

function buildFertilizerOps(items) {
  return dedupeByName(items).map((item) => ({
    updateOne: {
      filter: { nombre: item.nombre },
      update: {
        $set: {
          nombre: item.nombre,
          porcentajeN: toNumber(item.porcentajeN),
          porcentajeP: toNumber(item.porcentajeP),
        },
      },
      upsert: true,
    },
  }));
}

function buildActiveIngredientOps(items) {
  return dedupeByName(items).map((item) => ({
    updateOne: {
      filter: { nombre: item.nombre },
      update: {
        $set: {
          nombre: item.nombre,
          koc: toNumber(item.koc),
          persistencia: toNumber(item.persistencia),
        },
      },
      upsert: true,
    },
  }));
}

async function main() {
  const data = readWorkbook();
  const client = await MongoClient.connect(DB_URL);
  const db = client.db(DB_NAME);

  try {
    const fertilizantesOps = buildFertilizerOps(data.fertilizantes || []);
    const principiosOps = buildActiveIngredientOps(data.principiosActivos || []);

    const fertilizantesRes = fertilizantesOps.length
      ? await db.collection('fertilizantes').bulkWrite(fertilizantesOps, { ordered: false })
      : undefined;
    const principiosRes = principiosOps.length
      ? await db.collection('principioactivos').bulkWrite(principiosOps, { ordered: false })
      : undefined;

    const counts = {
      fertilizantes: await db.collection('fertilizantes').countDocuments(),
      principioactivos: await db.collection('principioactivos').countDocuments(),
    };

    console.log(
      JSON.stringify(
        {
          ok: true,
          sourceExcel: EXCEL_PATH,
          imported: {
            fertilizantes: fertilizantesOps.length,
            principiosActivos: principiosOps.length,
          },
          results: {
            fertilizantes: fertilizantesRes && {
              upserted: fertilizantesRes.upsertedCount,
              modified: fertilizantesRes.modifiedCount,
              matched: fertilizantesRes.matchedCount,
            },
            principiosActivos: principiosRes && {
              upserted: principiosRes.upsertedCount,
              modified: principiosRes.modifiedCount,
              matched: principiosRes.matchedCount,
            },
          },
          counts,
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
