/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const shapefile = require('shapefile');

const FUENTE = 'INTA Atlas de Suelos de la Republica Argentina 1:500.000/1:1.000.000';
const COLLECTION = 'suelos_inta';
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 250);

function resolveShapefilePath() {
  const input = process.argv[2] || process.env.SUELOS_INTA_SHP;
  if (!input) {
    throw new Error(
      'Indica el .shp con SUELOS_INTA_SHP o como primer argumento. Ej: npm run import:suelos-inta -- "C:\\\\...\\\\suelos_argentina_1_500.shp"',
    );
  }
  const resolved = path.resolve(input);
  if (!fs.existsSync(resolved)) {
    throw new Error(`No existe el shapefile: ${resolved}`);
  }
  return resolved;
}

function cleanValue(value) {
  if (typeof value === 'string') {
    return value.replace(/\u0000/g, '').trim();
  }
  if (Array.isArray(value)) {
    return value.map(cleanValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cleanValue(entry)]),
    );
  }
  return value;
}

function normalizeFeature(feature) {
  const properties = cleanValue(feature.properties || {});
  return {
    ogcFid: Number(properties.ogc_fid) || undefined,
    fuente: FUENTE,
    provincia: properties.provincia || undefined,
    carta: Number(properties.new_ncart) || undefined,
    unidadCartografica: properties.simbc || undefined,
    tipoUnidad: properties.tipo_uc || undefined,
    geometry: feature.geometry,
    properties,
    fechaImportacion: new Date().toISOString(),
  };
}

async function flush(collection, docs, stats) {
  if (!docs.length) return;
  try {
    await collection.insertMany(docs, { ordered: false });
  } catch (error) {
    if (error?.writeErrors?.length) {
      stats.skipped += error.writeErrors.length;
      console.warn(
        `\nSe omitieron ${error.writeErrors.length} geometria(s) invalidas del shapefile para Mongo 2dsphere.`,
      );
    } else {
      throw error;
    }
  } finally {
    docs.length = 0;
  }
}

async function main() {
  const shpPath = resolveShapefilePath();
  const mongoUri = process.env.MONGO_URI || process.env.MONGO_URL || process.env.DATABASE_URL || 'mongodb://localhost:27017';
  const dbName = process.env.DB_NAME || (process.env.DATABASE_URL ? undefined : 'chaman');
  const connectionOptions = dbName ? { dbName } : {};

  console.log(`Importando suelos INTA desde ${shpPath}`);
  console.log(`Destino Mongo: ${mongoUri}${dbName ? ` / ${dbName}` : ''}`);
  await mongoose.connect(mongoUri, connectionOptions);
  const collection = mongoose.connection.db.collection(COLLECTION);

  console.log('Preparando coleccion e indices geoespaciales...');
  await collection.deleteMany({ fuente: FUENTE });
  await collection.createIndex({ geometry: '2dsphere' });
  await collection.createIndex({ provincia: 1, unidadCartografica: 1 });
  await collection.createIndex({ ogcFid: 1 });

  const source = await shapefile.open(shpPath);
  const batch = [];
  const stats = { skipped: 0 };
  let count = 0;

  while (true) {
    const result = await source.read();
    if (result.done) break;
    if (!result.value?.geometry) continue;
    batch.push(normalizeFeature(result.value));
    count += 1;
    if (batch.length >= BATCH_SIZE) {
      await flush(collection, batch, stats);
      process.stdout.write(`\rImportados ${count} registros...`);
    }
  }

  await flush(collection, batch, stats);
  console.log(
    `\nImportacion finalizada: ${count - stats.skipped} unidades de suelo cargadas, ${stats.skipped} omitidas.`,
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
