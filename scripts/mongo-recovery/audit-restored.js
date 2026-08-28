#!/usr/bin/env node

const { MongoClient } = require('../../sdc-datos/node_modules/mongodb');
const { summarizeSeedResolution } = require('./lib');

async function exists(db, name) {
  return (await db.listCollections({ name }, { nameOnly: true }).toArray()).length === 1;
}

async function main() {
  const uri = process.env.MONGO_URI;
  const databaseName = process.env.DB_NAME;
  if (process.env.CHAMAN_RECOVERY_DRILL !== 'true') throw new Error('Falta CHAMAN_RECOVERY_DRILL=true.');
  if (!uri || !databaseName) throw new Error('Faltan MONGO_URI/DB_NAME.');
  if (!databaseName.startsWith('chaman_restore_drill_')) throw new Error('La auditoria exige una base descartable.');

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  try {
    const db = client.db(databaseName);
    if (db.databaseName !== databaseName) throw new Error('Base conectada inesperada.');
    const required = ['lotes', 'siembras', 'semillas', 'prediccions'];
    const missingCollections = [];
    for (const name of required) if (!(await exists(db, name))) missingCollections.push(name);
    if (missingCollections.length) {
      console.log(JSON.stringify({ ok: false, summary: { missingCollections } }, null, 2));
      return;
    }

    const activeLots = await db.collection('lotes').find({ idSiembra: { $exists: true, $ne: null } }).toArray();
    const sowingIds = activeLots.map((lot) => lot.idSiembra);
    const sowings = await db.collection('siembras').find({ _id: { $in: sowingIds } }).toArray();
    const seedIds = [...new Map(sowings.filter((sowing) => sowing.idSemilla != null).map((sowing) => [String(sowing.idSemilla), sowing.idSemilla])).values()];
    const [resolvedSeeds, duplicates, agrometAvailable] = await Promise.all([
      db.collection('semillas').find({ _id: { $in: seedIds } }, { projection: { _id: 1 } }).toArray(),
      db
        .collection('prediccions')
        .aggregate([
          { $match: { idSiembra: { $in: sowingIds } } },
          { $group: { _id: { idSiembra: '$idSiembra', fecha: '$fecha' }, count: { $sum: 1 } } },
          { $match: { count: { $gt: 1 } } },
          { $count: 'total' },
        ])
        .next(),
      (await exists(db, 'indicadores_agrometeorologicos_generados'))
        ? db.collection('indicadores_agrometeorologicos_generados').distinct('idSiembra', {
            idSiembra: { $in: sowingIds },
            esPronostico: false,
          })
        : [],
    ]);
    const seedResolution = summarizeSeedResolution(sowings, resolvedSeeds);
    const summary = {
      activeLots: activeLots.length,
      activeSowingsResolved: sowings.length,
      ...seedResolution,
      duplicatePredictionKeys: duplicates?.total || 0,
      agrometSowingsAvailable: agrometAvailable.length,
      unresolvedSowings: activeLots.length - sowings.length,
      missingCollections,
    };
    const ok =
      summary.unresolvedSowings === 0 &&
      summary.missingSeedReferences === 0 &&
      summary.unresolvedUniqueSeeds === 0 &&
      summary.duplicatePredictionKeys === 0 &&
      missingCollections.length === 0;
    console.log(JSON.stringify({ ok, database: databaseName, summary }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
