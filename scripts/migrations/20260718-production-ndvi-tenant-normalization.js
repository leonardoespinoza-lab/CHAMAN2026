#!/usr/bin/env node

/** Normaliza metadatos tenant NDVI contra el lote canonico, con rollback exacto. */

const { MongoClient, ObjectId } = require('../../sdc-datos/node_modules/mongodb');

const DATABASE = 'chaman';
const MIGRATION_ID = 'production-ndvi-tenant-normalization-20260718';
const MANIFESTS = 'maintenance_backups';
const ITEMS = 'maintenance_backup_items';
const COLLECTION = 'reportendvis';
const TENANT_FIELDS = [
  'idQuimica',
  'idDistribuidor',
  'idProductor',
  'idEstablecimiento',
  'idDepartamento',
];

const id = (value) => (value == null ? '' : String(value));

function parseArgs(argv) {
  const mode = argv[2] || 'plan';
  const backupArg = argv.find((value) => value.startsWith('--backup='));
  if (!['plan', 'snapshot', 'apply', 'verify', 'rollback'].includes(mode)) {
    throw new Error('Modo valido: plan | snapshot | apply | verify | rollback');
  }
  return { mode, backupId: backupArg?.slice('--backup='.length) };
}

function assertProduction(db) {
  if (db.databaseName !== DATABASE || process.env.RAILWAY_ENVIRONMENT_NAME !== 'production') {
    throw new Error('Operacion rechazada: se exige Railway production y base chaman.');
  }
}

async function mismatches(db) {
  const lots = await db.collection('lotes').find({}).toArray();
  const lotById = new Map(lots.map((lot) => [id(lot._id), lot]));
  const reports = await db
    .collection(COLLECTION)
    .find({ idLote: { $in: lots.map((lot) => lot._id) } })
    .toArray();
  const rows = [];
  for (const report of reports) {
    const lot = lotById.get(id(report.idLote));
    if (!lot) continue;
    const fields = TENANT_FIELDS.filter(
      (field) => id(report[field]) !== id(lot[field]),
    );
    if (!fields.length) continue;
    rows.push({ report, lot, fields });
  }
  return rows;
}

function publicRows(rows) {
  return rows.map(({ report, lot, fields }) => ({
    idReporte: id(report._id),
    idLote: id(lot._id),
    lote: lot.nombre,
    fecha: report.fechaDeLaImagen || report.fechaDelReporte,
    diferencias: fields.map((field) => ({
      campo: field,
      actual: id(report[field]),
      canonico: id(lot[field]),
    })),
  }));
}

async function snapshot(db) {
  if (process.env.CHAMAN_PRODUCTION_REPAIR_CONFIRM !== `${MIGRATION_ID}:snapshot`) {
    throw new Error('Snapshot cancelado: falta confirmacion productiva exacta.');
  }
  const rows = await mismatches(db);
  const manifest = {
    migrationId: MIGRATION_ID,
    database: DATABASE,
    collection: COLLECTION,
    status: 'preparing',
    createdAt: new Date(),
    counts: { [COLLECTION]: rows.length },
    reportIds: rows.map(({ report }) => report._id),
  };
  const { insertedId } = await db.collection(MANIFESTS).insertOne(manifest);
  try {
    if (rows.length) {
      await db.collection(ITEMS).insertMany(
        rows.map(({ report }) => ({
          backupId: insertedId,
          migrationId: MIGRATION_ID,
          collection: COLLECTION,
          document: report,
        })),
        { ordered: true },
      );
    }
    await db.collection(MANIFESTS).updateOne(
      { _id: insertedId },
      { $set: { status: 'ready', readyAt: new Date() } },
    );
    return { backupId: id(insertedId), status: 'ready', rows: publicRows(rows) };
  } catch (error) {
    await db.collection(MANIFESTS).updateOne(
      { _id: insertedId },
      { $set: { status: 'failed', failedAt: new Date(), error: String(error) } },
    );
    throw error;
  }
}

async function getManifest(db, backupId) {
  if (!ObjectId.isValid(backupId || '')) throw new Error('Backup invalido.');
  const manifest = await db.collection(MANIFESTS).findOne({
    _id: new ObjectId(backupId),
    migrationId: MIGRATION_ID,
    database: DATABASE,
    status: { $in: ['ready', 'applied'] },
  });
  if (!manifest) throw new Error('No existe un snapshot utilizable con ese identificador.');
  return manifest;
}

async function apply(db, backupId) {
  if (process.env.CHAMAN_PRODUCTION_REPAIR_CONFIRM !== `${MIGRATION_ID}:apply:${backupId}`) {
    throw new Error('Aplicacion cancelada: falta confirmacion productiva exacta.');
  }
  const manifest = await getManifest(db, backupId);
  if (manifest.status !== 'ready') throw new Error('El snapshot ya fue aplicado.');
  const rows = await mismatches(db);
  const expected = new Set((manifest.reportIds || []).map(id));
  const current = new Set(rows.map(({ report }) => id(report._id)));
  if (expected.size !== current.size || [...expected].some((value) => !current.has(value))) {
    throw new Error('El alcance cambio despues del snapshot; se cancela la normalizacion.');
  }
  for (const { report, lot, fields } of rows) {
    const set = {};
    const unset = {};
    for (const field of fields) {
      if (lot[field] == null) unset[field] = '';
      else set[field] = lot[field];
    }
    const update = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;
    await db.collection(COLLECTION).updateOne({ _id: report._id }, update);
  }
  await db.collection(MANIFESTS).updateOne(
    { _id: manifest._id },
    { $set: { status: 'applied', appliedAt: new Date(), updated: rows.length } },
  );
  return { backupId, updated: rows.length };
}

async function rollback(db, backupId) {
  if (process.env.CHAMAN_PRODUCTION_REPAIR_CONFIRM !== `${MIGRATION_ID}:rollback:${backupId}`) {
    throw new Error('Rollback cancelado: falta confirmacion productiva exacta.');
  }
  const manifest = await getManifest(db, backupId);
  const items = await db
    .collection(ITEMS)
    .find({ backupId: manifest._id, migrationId: MIGRATION_ID, collection: COLLECTION })
    .toArray();
  if (items.length !== manifest.counts[COLLECTION]) {
    throw new Error('Rollback cancelado: snapshot incompleto.');
  }
  for (const item of items) {
    await db.collection(COLLECTION).replaceOne({ _id: item.document._id }, item.document, {
      upsert: true,
    });
  }
  await db.collection(MANIFESTS).updateOne(
    { _id: manifest._id },
    { $set: { status: 'rolled-back', rolledBackAt: new Date() } },
  );
  return { backupId, restored: items.length };
}

(async () => {
  const options = parseArgs(process.argv);
  const url = process.env.MONGO_PUBLIC_URL || process.env.MONGO_URI || process.env.MONGO_URL;
  if (!url) throw new Error('No se encontro una URL de MongoDB.');
  const client = new MongoClient(url);
  try {
    await client.connect();
    const db = client.db(DATABASE);
    assertProduction(db);
    const rows = await mismatches(db);
    const result =
      options.mode === 'snapshot'
        ? await snapshot(db)
        : options.mode === 'apply'
          ? await apply(db, options.backupId)
          : options.mode === 'rollback'
            ? await rollback(db, options.backupId)
            : {
                database: DATABASE,
                migrationId: MIGRATION_ID,
                mismatches: rows.length,
                rows: publicRows(rows),
                ok: rows.length === 0,
              };
    console.log(JSON.stringify({ mode: options.mode, result }, null, 2));
  } finally {
    await client.close();
  }
})().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
