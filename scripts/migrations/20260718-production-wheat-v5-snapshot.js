#!/usr/bin/env node

/**
 * Snapshot y verificacion reversible del cierre sanitario v5 de trigo.
 *
 * Este script nunca reconstruye ni elimina datos por si solo. Primero guarda
 * una copia BSON exacta de todas las colecciones que puede tocar el reproceso
 * y luego permite verificar el resultado. El rollback es explicito y exige
 * una confirmacion ligada al identificador del respaldo.
 */

const { MongoClient, ObjectId } = require('../../sdc-datos/node_modules/mongodb');

const DATABASE = 'chaman';
const MIGRATION_ID = 'production-wheat-v5-20260718';
const MANIFESTS = 'maintenance_backups';
const ITEMS = 'maintenance_backup_items';
const COLLECTIONS = [
  'prediccions',
  'indicadores_agrometeorologicos',
  'indicadores_agrometeorologicos_generaciones',
  'indicadores_agrometeorologicos_generados',
  'siembras',
];

function args(argv) {
  const mode = argv[2] || 'plan';
  const backupArg = argv.find((value) => value.startsWith('--backup='));
  if (!['plan', 'snapshot', 'verify', 'rollback'].includes(mode)) {
    throw new Error('Modo valido: plan | snapshot | verify | rollback');
  }
  return { mode, backupId: backupArg?.slice('--backup='.length) };
}

function mongoUrl() {
  return process.env.MONGO_PUBLIC_URL || process.env.MONGO_URI || process.env.MONGO_URL;
}

function assertProduction(db) {
  if (db.databaseName !== DATABASE || process.env.RAILWAY_ENVIRONMENT_NAME !== 'production') {
    throw new Error('Operacion rechazada: se exige Railway production y base chaman.');
  }
}

async function activeWheatSowings(db) {
  const lots = await db
    .collection('lotes')
    .find({ idSiembra: { $exists: true, $ne: null } }, { projection: { idSiembra: 1 } })
    .toArray();
  const sowings = await db
    .collection('siembras')
    .find({ _id: { $in: lots.map((lot) => lot.idSiembra) } })
    .toArray();
  const seeds = await db
    .collection('semillas')
    .find(
      { _id: { $in: sowings.map((sowing) => sowing.idSemilla) }, cultivo: /^trigo$/i },
      { projection: { _id: 1 } },
    )
    .toArray();
  const wheatSeedIds = new Set(seeds.map((seed) => String(seed._id)));
  return sowings.filter((sowing) => wheatSeedIds.has(String(sowing.idSemilla)));
}

function queryFor(collection, sowingIds) {
  return collection === 'siembras'
    ? { _id: { $in: sowingIds } }
    : { idSiembra: { $in: sowingIds } };
}

async function state(db) {
  const sowings = await activeWheatSowings(db);
  const sowingIds = sowings.map((sowing) => sowing._id);
  const counts = {};
  for (const collection of COLLECTIONS) {
    counts[collection] = await db
      .collection(collection)
      .countDocuments(queryFor(collection, sowingIds));
  }
  return { sowings, sowingIds, counts };
}

async function latestStatus(db, sowingIds) {
  const predictions = await db
    .collection('prediccions')
    .find(
      { idSiembra: { $in: sowingIds } },
      {
        projection: {
          idSiembra: 1,
          fecha: 1,
          'enfermedades.modelo.version': 1,
          'enfermedades.estado': 1,
        },
      },
    )
    .sort({ fecha: -1 })
    .toArray();
  const latest = new Map();
  for (const prediction of predictions) {
    const key = String(prediction.idSiembra);
    if (!latest.has(key)) latest.set(key, prediction);
  }
  const rows = sowingIds.map((id) => {
    const prediction = latest.get(String(id));
    const versions = (prediction?.enfermedades || []).map((disease) => disease.modelo?.version);
    const isV5 =
      versions.length > 0 &&
      versions.every((version) => ['5', 'v5'].includes(String(version).toLowerCase()));
    return {
      idSiembra: String(id),
      fecha: prediction?.fecha,
      versions: [...new Set(versions.filter(Boolean).map(String))],
      status: !prediction ? 'sin-lectura' : isV5 ? 'v5' : 'obsoleta',
    };
  });
  return {
    rows,
    v5: rows.filter((row) => row.status === 'v5').length,
    stale: rows.filter((row) => row.status === 'obsoleta').length,
    missing: rows.filter((row) => row.status === 'sin-lectura').length,
  };
}

async function plan(db) {
  const current = await state(db);
  return {
    database: DATABASE,
    migrationId: MIGRATION_ID,
    activeWheatSowings: current.sowings.length,
    sowingIds: current.sowingIds.map(String),
    documentsToSnapshot: current.counts,
    latest: await latestStatus(db, current.sowingIds),
  };
}

async function snapshot(db) {
  if (process.env.CHAMAN_PRODUCTION_REPAIR_CONFIRM !== `${MIGRATION_ID}:snapshot`) {
    throw new Error('Snapshot cancelado: falta confirmacion productiva exacta.');
  }
  const current = await state(db);
  const manifest = {
    migrationId: MIGRATION_ID,
    database: DATABASE,
    status: 'preparing',
    createdAt: new Date(),
    sowingIds: current.sowingIds,
    counts: current.counts,
  };
  const { insertedId } = await db.collection(MANIFESTS).insertOne(manifest);
  try {
    const written = {};
    for (const collection of COLLECTIONS) {
      const cursor = db.collection(collection).find(queryFor(collection, current.sowingIds));
      let batch = [];
      let count = 0;
      for await (const document of cursor) {
        batch.push({ backupId: insertedId, migrationId: MIGRATION_ID, collection, document });
        if (batch.length >= 200) {
          await db.collection(ITEMS).insertMany(batch, { ordered: true });
          count += batch.length;
          batch = [];
        }
      }
      if (batch.length) {
        await db.collection(ITEMS).insertMany(batch, { ordered: true });
        count += batch.length;
      }
      // Los cron meteorologicos pueden anexar indicadores mientras se recorre
      // la coleccion. El cursor representa el snapshot realmente preservado;
      // por eso el manifiesto registra lo escrito y no exige que coincida con
      // un countDocuments tomado algunos segundos antes.
      written[collection] = count;
    }
    await db.collection(MANIFESTS).updateOne(
      { _id: insertedId },
      { $set: { status: 'ready', readyAt: new Date(), counts: written, plannedCounts: current.counts, written } },
    );
    return { backupId: String(insertedId), status: 'ready', written };
  } catch (error) {
    await db.collection(MANIFESTS).updateOne(
      { _id: insertedId },
      { $set: { status: 'failed', failedAt: new Date(), error: String(error) } },
    );
    throw error;
  }
}

async function verify(db) {
  const current = await state(db);
  const latest = await latestStatus(db, current.sowingIds);
  return {
    activeWheatSowings: current.sowings.length,
    documents: current.counts,
    latest,
    ok: latest.v5 === current.sowings.length && latest.stale === 0 && latest.missing === 0,
  };
}

async function rollback(db, backupId) {
  if (!ObjectId.isValid(backupId || '')) throw new Error('Backup invalido.');
  if (process.env.CHAMAN_PRODUCTION_REPAIR_CONFIRM !== `${MIGRATION_ID}:rollback:${backupId}`) {
    throw new Error('Rollback cancelado: falta confirmacion productiva exacta.');
  }
  const id = new ObjectId(backupId);
  const manifest = await db.collection(MANIFESTS).findOne({
    _id: id,
    migrationId: MIGRATION_ID,
    database: DATABASE,
    status: 'ready',
  });
  if (!manifest) throw new Error('No existe un snapshot listo con ese identificador.');

  const restored = {};
  for (const collection of COLLECTIONS) {
    const items = await db
      .collection(ITEMS)
      .find({ backupId: id, migrationId: MIGRATION_ID, collection })
      .sort({ _id: 1 })
      .toArray();
    if (items.length !== manifest.counts[collection]) {
      throw new Error(`Rollback cancelado: snapshot incompleto en ${collection}.`);
    }
    const documents = items.map((item) => item.document);
    if (collection === 'siembras') {
      for (const document of documents) {
        await db.collection(collection).replaceOne({ _id: document._id }, document, { upsert: true });
      }
    } else {
      await db.collection(collection).deleteMany(queryFor(collection, manifest.sowingIds));
      if (documents.length) await db.collection(collection).insertMany(documents, { ordered: true });
    }
    restored[collection] = documents.length;
  }
  await db.collection(MANIFESTS).updateOne(
    { _id: id },
    { $set: { status: 'rolled-back', rolledBackAt: new Date(), restored } },
  );
  return { backupId, restored };
}

(async () => {
  const options = args(process.argv);
  const url = mongoUrl();
  if (!url) throw new Error('No se encontro una URL de MongoDB.');
  const client = new MongoClient(url);
  try {
    await client.connect();
    const db = client.db(DATABASE);
    assertProduction(db);
    const result =
      options.mode === 'snapshot'
        ? await snapshot(db)
        : options.mode === 'verify'
          ? await verify(db)
          : options.mode === 'rollback'
            ? await rollback(db, options.backupId)
            : await plan(db);
    console.log(JSON.stringify({ mode: options.mode, result }, null, 2));
  } finally {
    await client.close();
  }
})().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
