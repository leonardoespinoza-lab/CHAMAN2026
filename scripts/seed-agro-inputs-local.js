const fs = require('fs');
const { spawnSync } = require('child_process');
const { MongoClient } = require('../sdc-datos/node_modules/mongodb');

const DEFAULT_EXCEL = 'C:\\Users\\lespinoza\\Downloads\\BASE DE DATOS DE AGROQUIMICOS Y FERTILIZANTES.xlsx';
const EXCEL_PATH = process.env.CHAMAN_AGRO_INPUTS_XLSX || DEFAULT_EXCEL;
const DB_URL =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL ||
  process.env.DB_URL ||
  'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'chaman';
const DRY_RUN = process.env.CHAMAN_AGRO_INPUTS_DRY_RUN === 'true';
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

function concentrationToPercent(value) {
  const number = toNumber(value);
  if (number === undefined) return undefined;
  return number > 0 && number <= 1 ? Math.round(number * 10000) / 100 : number;
}

function formatPercent(value) {
  if (value === undefined) return '';
  return Number.isInteger(value) ? String(value) : String(value).replace(/0+$/, '').replace(/\.$/, '');
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
agroquimicos = []

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
        nombre = clean(values[0])
        if nombre:
            agroquimicos.append({
                'nombre': nombre,
                'concentracion': num(values[1]) if len(values) > 1 else None,
                'koc': num(values[2]) if len(values) > 2 else None,
                'persistencia': num(values[3]) if len(values) > 3 else None,
                'volatilidad': clean(values[4]) if len(values) > 4 else None,
            })
    if len(values) >= 8:
        add_principio(values[5], values[6], values[7])

print(json.dumps({
    'fertilizantes': fertilizantes,
    'principiosActivos': list(principios.values()),
    'agroquimicos': agroquimicos,
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

function dedupeAgrochemicals(items) {
  const map = new Map();
  for (const item of items) {
    const ingrediente = cleanText(item.nombre);
    if (!ingrediente) continue;
    const concentracion = concentrationToPercent(item.concentracion);
    const nombre = concentracion === undefined ? ingrediente : `${ingrediente} ${formatPercent(concentracion)}%`;
    map.set(norm(`${ingrediente}|${concentracion ?? ''}`), {
      ...item,
      ingrediente,
      nombre,
      concentracion,
    });
  }
  return [...map.values()];
}

function buildAgrochemicalOps(items, principiosByNorm) {
  return dedupeAgrochemicals(items).map((item) => {
    const principioActivo = principiosByNorm.get(norm(item.ingrediente));
    const volatilidad = cleanText(item.volatilidad);
    const set = {
      nombre: item.nombre,
      concentracion: item.concentracion,
      koc: toNumber(item.koc),
      persistencia: toNumber(item.persistencia),
      segmento: 'Agroquimico',
      subsegmentos: volatilidad ? [volatilidad] : [],
      fuente: 'BASE DE DATOS DE AGROQUIMICOS Y FERTILIZANTES.xlsx',
    };
    if (principioActivo?._id) set.idPrincipioActivo = principioActivo._id;
    if (volatilidad) set.volatilidad = volatilidad;
    return {
      updateOne: {
        filter: { nombre: item.nombre },
        update: {
          $set: set,
        },
        upsert: true,
      },
    };
  });
}

async function main() {
  const data = readWorkbook();
  if (DRY_RUN) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          sourceExcel: EXCEL_PATH,
          read: {
            fertilizantes: dedupeByName(data.fertilizantes || []).length,
            principiosActivos: dedupeByName(data.principiosActivos || []).length,
            agroquimicos: dedupeAgrochemicals(data.agroquimicos || []).length,
          },
          samples: {
            fertilizantes: dedupeByName(data.fertilizantes || []).slice(0, 3),
            principiosActivos: dedupeByName(data.principiosActivos || []).slice(0, 3),
            agroquimicos: dedupeAgrochemicals(data.agroquimicos || []).slice(0, 3),
          },
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
    const fertilizantesOps = buildFertilizerOps(data.fertilizantes || []);
    const principiosOps = buildActiveIngredientOps(data.principiosActivos || []);

    const fertilizantesRes = fertilizantesOps.length
      ? await db.collection('fertilizantes').bulkWrite(fertilizantesOps, { ordered: false })
      : undefined;
    const principiosRes = principiosOps.length
      ? await db.collection('principioactivos').bulkWrite(principiosOps, { ordered: false })
      : undefined;

    const principioNombres = dedupeByName(data.principiosActivos || []).map((item) => item.nombre);
    const principioDocs = principioNombres.length
      ? await db.collection('principioactivos').find({ nombre: { $in: principioNombres } }).toArray()
      : [];
    const principiosByNorm = new Map(principioDocs.map((doc) => [norm(doc.nombre), doc]));
    const agroquimicosOps = buildAgrochemicalOps(data.agroquimicos || [], principiosByNorm);
    const agroquimicosRes = agroquimicosOps.length
      ? await db.collection('agroquimicos').bulkWrite(agroquimicosOps, { ordered: false })
      : undefined;

    const counts = {
      fertilizantes: await db.collection('fertilizantes').countDocuments(),
      principioactivos: await db.collection('principioactivos').countDocuments(),
      agroquimicos: await db.collection('agroquimicos').countDocuments(),
    };

    console.log(
      JSON.stringify(
        {
          ok: true,
          sourceExcel: EXCEL_PATH,
          imported: {
            fertilizantes: fertilizantesOps.length,
            principiosActivos: principiosOps.length,
            agroquimicos: agroquimicosOps.length,
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
            agroquimicos: agroquimicosRes && {
              upserted: agroquimicosRes.upsertedCount,
              modified: agroquimicosRes.modifiedCount,
              matched: agroquimicosRes.matchedCount,
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
