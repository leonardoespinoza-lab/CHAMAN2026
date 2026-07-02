const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('../../sdc-datos/node_modules/mongodb');

const ARGENTINA_BOUNDS = {
  latMin: -56,
  latMax: -21,
  lonMin: -74,
  lonMax: -53,
};

function parseArgs(argv) {
  const args = {
    payload: path.join(
      process.cwd(),
      'Testing',
      'corteva-distribuidores',
      'corteva_distribuidores_import_payload.json',
    ),
    geocoded: path.join(
      process.cwd(),
      'Testing',
      'corteva-distribuidores',
      'corteva_distribuidores_geocoded.json',
    ),
    apply: false,
    createCompany: false,
    allowApproximate: false,
    skipApproximate: false,
    dbName: process.env.DB_NAME || 'chaman',
    companyId: process.env.CORTEVA_ID || '',
    companyName: process.env.CORTEVA_NAME || 'Corteva',
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--create-company') {
      args.createCompany = true;
    } else if (arg === '--allow-approximate') {
      args.allowApproximate = true;
    } else if (arg === '--skip-approximate') {
      args.skipApproximate = true;
    } else if (arg === '--payload') {
      args.payload = argv[++index];
    } else if (arg === '--geocoded') {
      args.geocoded = argv[++index];
    } else if (arg === '--db') {
      args.dbName = argv[++index];
    } else if (arg === '--company-id') {
      args.companyId = argv[++index];
    } else if (arg === '--company-name') {
      args.companyName = argv[++index];
    } else if (arg === '--help') {
      args.help = true;
    } else {
      throw new Error(`Argumento no reconocido: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Uso:
  node scripts/corteva/import_corteva_distribuidores.js --payload <payload.json>
  MONGO_URI=<uri> CORTEVA_ID=<id> node scripts/corteva/import_corteva_distribuidores.js --apply

Por seguridad, el modo por defecto es dry-run y no escribe en la base.
Tambien bloquea ubicaciones aproximadas CENTROIDE_LOCALIDAD, salvo que se use --allow-approximate.
Usar --skip-approximate para cargar solo las sucursales con punto confiable y dejar afuera los centroides.
Para aplicar, crear primero la compania Corteva en Chaman y pasar su _id con --company-id o CORTEVA_ID.
Tambien se puede usar --create-company para crear la compania si no existe.
`);
}

function normalize(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function isArgentinaPoint(geojson) {
  if (!geojson || geojson.type !== 'Point' || !Array.isArray(geojson.coordinates)) {
    return false;
  }
  const [lon, lat] = geojson.coordinates;
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= ARGENTINA_BOUNDS.latMin &&
    lat <= ARGENTINA_BOUNDS.latMax &&
    lon >= ARGENTINA_BOUNDS.lonMin &&
    lon <= ARGENTINA_BOUNDS.lonMax
  );
}

function loadPayload(payloadPath) {
  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  if (!Array.isArray(payload)) {
    throw new Error('El payload debe ser un array de distribuidores.');
  }
  return payload;
}

function loadGeocodedRows(geocodedPath) {
  if (!geocodedPath || !fs.existsSync(geocodedPath)) {
    return [];
  }
  const rows = JSON.parse(fs.readFileSync(geocodedPath, 'utf8'));
  return Array.isArray(rows) ? rows : [];
}

function validatePayload(payload, geocodedRows, args) {
  const errors = [];
  const names = new Map();
  let withGeojson = 0;
  const statusByName = new Map();

  geocodedRows.forEach((row) => {
    if (row.nombre_chaman) {
      statusByName.set(normalize(row.nombre_chaman), row.estado_coordenada_chaman || '');
    }
  });

  payload.forEach((item, index) => {
    const row = index + 1;
    if (!item.nombre || !String(item.nombre).trim()) {
      errors.push(`Fila ${row}: falta nombre.`);
    }
    const normalizedName = normalize(item.nombre);
    if (names.has(normalizedName)) {
      errors.push(`Fila ${row}: nombre duplicado con fila ${names.get(normalizedName)} (${item.nombre}).`);
    } else {
      names.set(normalizedName, row);
    }
    if (!item.direccion || !String(item.direccion).trim()) {
      errors.push(`Fila ${row}: falta direccion.`);
    }
    if (!isArgentinaPoint(item.geojson)) {
      errors.push(`Fila ${row}: geojson ausente o fuera de Argentina (${item.nombre}).`);
    } else {
      withGeojson += 1;
    }
    const status = statusByName.get(normalizedName);
    if (!args.allowApproximate && status === 'CENTROIDE_LOCALIDAD') {
      errors.push(`Fila ${row}: ubicacion aproximada por centroide; no se carga como definitiva (${item.nombre}).`);
    }
  });

  return {
    total: payload.length,
    uniqueNames: names.size,
    withGeojson,
    approximateBlocked: errors.filter((error) => error.includes('centroide')).length,
    errors,
  };
}

function filterPayload(payload, geocodedRows, args) {
  if (!args.skipApproximate) {
    return {
      payload,
      skipped: [],
    };
  }

  const statusByName = new Map();
  geocodedRows.forEach((row) => {
    if (row.nombre_chaman) {
      statusByName.set(normalize(row.nombre_chaman), row.estado_coordenada_chaman || '');
    }
  });

  const filtered = [];
  const skipped = [];
  payload.forEach((item) => {
    const status = statusByName.get(normalize(item.nombre));
    if (status === 'CENTROIDE_LOCALIDAD') {
      skipped.push({ nombre: item.nombre, status });
    } else {
      filtered.push(item);
    }
  });

  return {
    payload: filtered,
    skipped,
  };
}

async function resolveCompanyId(db, args) {
  if (args.companyId) {
    if (!ObjectId.isValid(args.companyId)) {
      throw new Error(`CORTEVA_ID/--company-id no es un ObjectId valido: ${args.companyId}`);
    }
    const id = new ObjectId(args.companyId);
    const company = await db.collection('quimicas').findOne({ _id: id });
    if (!company) {
      throw new Error(`No existe compania con _id ${args.companyId}. Crear Corteva primero desde el admin.`);
    }
    return id;
  }

  const company = await db.collection('quimicas').findOne({ nombre: args.companyName });
  if (!company) {
    if (args.createCompany) {
      const result = await db.collection('quimicas').insertOne({
        nombre: args.companyName,
        logo: '',
        fechaCreacion: new Date(),
      });
      return result.insertedId;
    }
    throw new Error(`No existe la compania "${args.companyName}". Crear Corteva primero desde el admin.`);
  }
  return company._id;
}

async function applyImport(payload, args) {
  const uri =
    process.env.MONGO_PUBLIC_URL ||
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.MONGO_URL ||
    process.env.DATABASE_URL ||
    process.env.DB_URL;
  if (!uri) {
    throw new Error('MONGO_URI/MONGO_URL/DATABASE_URL/DB_URL es requerido para --apply.');
  }

  const client = await MongoClient.connect(uri);
  try {
    const db = client.db(args.dbName);
    const companyId = await resolveCompanyId(db, args);
    const now = new Date();
    const operations = payload.map((item) => ({
      updateOne: {
        filter: {
          nombre: item.nombre,
          idQuimica: companyId,
        },
        update: {
          $set: {
            nombre: item.nombre,
            idQuimica: companyId,
            direccion: item.direccion,
            geojson: item.geojson,
          },
          $setOnInsert: {
            fechaCreacion: now,
          },
        },
        upsert: true,
      },
    }));

    const result = await db.collection('distribuidors').bulkWrite(operations, { ordered: false });
    console.log(
      JSON.stringify(
        {
          modo: 'apply',
          companyId: String(companyId),
          matched: result.matchedCount,
          modified: result.modifiedCount,
          upserted: result.upsertedCount,
          total: payload.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const rawPayload = loadPayload(args.payload);
  const geocodedRows = loadGeocodedRows(args.geocoded);
  const filtered = filterPayload(rawPayload, geocodedRows, args);
  const payload = filtered.payload;
  const validation = validatePayload(payload, geocodedRows, args);
  console.log(
    JSON.stringify(
      {
        modo: args.apply ? 'apply' : 'dry-run',
        inputTotal: rawPayload.length,
        skippedApproximate: filtered.skipped.length,
        skipped: filtered.skipped,
        ...validation,
      },
      null,
      2,
    ),
  );

  if (validation.errors.length > 0) {
    process.exitCode = 1;
    return;
  }

  if (!args.apply) {
    console.log('Dry-run OK. No se escribio en la base.');
    console.log('Para aplicar: crear Corteva en Chaman y ejecutar con --apply --company-id <_id>.');
    return;
  }

  await applyImport(payload, args);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
