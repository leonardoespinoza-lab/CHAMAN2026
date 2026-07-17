#!/usr/bin/env node

/**
 * Reconstruccion reversible del historial sanitario de trigo en Testing.
 *
 * El motor v5 corrige la compuerta termica/fenologica. Como las predicciones
 * diarias son materializadas, hay que retirar la serie v4 para que el servicio
 * la regenere desde la siembra con el nuevo contrato.
 *
 * Seguridad:
 * - solo acepta la base chaman_testing;
 * - el modo normal es plan (sin escrituras);
 * - --apply exige REPAIR_WHEAT_V5_CONFIRM=chaman_testing;
 * - cada documento se respalda por separado para evitar el limite Mongo de 16 MB;
 * - --rollback <backupId> elimina la reconstruccion y restaura la serie exacta.
 */

const { MongoClient, ObjectId } = require("../sdc-datos/node_modules/mongodb");

const DB_NAME = "chaman_testing";
const REPAIR_ID = "wheat-disease-v5-rebuild";
const BACKUPS = "maintenance_backups";
const BACKUP_ITEMS = "maintenance_backup_items";

function parseArgs(argv) {
  const rollbackIndex = argv.indexOf("--rollback");
  const sowingIndex = argv.indexOf("--sowing");
  return {
    apply: argv.includes("--apply"),
    rollbackId:
      rollbackIndex >= 0 && argv[rollbackIndex + 1]
        ? argv[rollbackIndex + 1]
        : undefined,
    sowingId:
      sowingIndex >= 0 && argv[sowingIndex + 1]
        ? argv[sowingIndex + 1]
        : undefined,
  };
}

function mongoUrl() {
  return (
    process.env.MONGO_PUBLIC_URL ||
    process.env.MONGO_URL ||
    process.env.MONGO_URI
  );
}

function assertTestingOnly(db, url) {
  if (db.databaseName !== DB_NAME) {
    throw new Error(
      `Base rechazada: ${db.databaseName}. Solo se permite ${DB_NAME}.`,
    );
  }
  if (/production|chaman_prod/i.test(String(url))) {
    throw new Error("URL rechazada: parece corresponder a produccion.");
  }
}

async function activeWheatSowings(db, requestedSowingId) {
  const wheatSeeds = await db
    .collection("semillas")
    .find({ cultivo: /^trigo$/i }, { projection: { _id: 1, variedad: 1 } })
    .toArray();
  const seedIds = wheatSeeds.map((seed) => seed._id);
  if (!seedIds.length) return [];

  const activeLotSowingIds = (
    await db
      .collection("lotes")
      .find(
        { idSiembra: { $exists: true, $ne: null } },
        { projection: { idSiembra: 1 } },
      )
      .toArray()
  ).map((lot) => lot.idSiembra);
  if (!activeLotSowingIds.length) return [];

  const query = {
    _id: { $in: activeLotSowingIds },
    idSemilla: { $in: seedIds },
  };
  if (requestedSowingId) {
    if (!ObjectId.isValid(requestedSowingId)) {
      throw new Error(`Id de siembra invalido: ${requestedSowingId}.`);
    }
    query._id = new ObjectId(requestedSowingId);
  }

  return db
    .collection("siembras")
    .find(query, {
      projection: { _id: 1, idLote: 1, idSemilla: 1, fechaSiembra: 1 },
    })
    .toArray();
}

async function inspect(db, requestedSowingId) {
  const sowings = await activeWheatSowings(db, requestedSowingId);
  const sowingIds = sowings.map((sowing) => sowing._id);
  const query = { idSiembra: { $in: sowingIds } };
  const predictionCount = sowingIds.length
    ? await db.collection("prediccions").countDocuments(query)
    : 0;
  const latest = sowingIds.length
    ? await db
        .collection("prediccions")
        .find(query, {
          projection: {
            idSiembra: 1,
            fecha: 1,
            "enfermedades.modelo.version": 1,
            "enfermedades.estado": 1,
          },
        })
        .sort({ fecha: -1 })
        .limit(Math.max(20, sowingIds.length))
        .toArray()
    : [];
  return { sowings, sowingIds, query, predictionCount, latest };
}

function publicSummary(state) {
  return {
    database: DB_NAME,
    activeWheatSowings: state.sowings.length,
    predictionDocumentsToRebuild: state.predictionCount,
    sowingIds: state.sowingIds.map(String),
    latest: state.latest.map((prediction) => ({
      id: String(prediction._id),
      idSiembra: String(prediction.idSiembra),
      fecha: prediction.fecha,
      enfermedades: (prediction.enfermedades || []).map((disease) => ({
        version: disease.modelo?.version,
        estado: disease.estado,
      })),
    })),
  };
}

async function apply(db, state) {
  if (process.env.REPAIR_WHEAT_V5_CONFIRM !== DB_NAME) {
    throw new Error(
      `Confirmacion ausente. Defina REPAIR_WHEAT_V5_CONFIRM=${DB_NAME}.`,
    );
  }
  if (!state.sowingIds.length || !state.predictionCount) {
    return {
      applied: false,
      reason: "No hay series activas de trigo para reconstruir.",
    };
  }

  const metadata = {
    repairId: REPAIR_ID,
    database: DB_NAME,
    status: "preparing",
    createdAt: new Date(),
    sowingIds: state.sowingIds,
    originalCount: state.predictionCount,
  };
  const { insertedId: backupId } = await db
    .collection(BACKUPS)
    .insertOne(metadata);

  try {
    const cursor = db.collection("prediccions").find(state.query);
    let buffered = [];
    let backedUp = 0;
    for await (const document of cursor) {
      buffered.push({ backupId, repairId: REPAIR_ID, document });
      if (buffered.length >= 250) {
        await db
          .collection(BACKUP_ITEMS)
          .insertMany(buffered, { ordered: true });
        backedUp += buffered.length;
        buffered = [];
      }
    }
    if (buffered.length) {
      await db.collection(BACKUP_ITEMS).insertMany(buffered, { ordered: true });
      backedUp += buffered.length;
    }
    if (backedUp !== state.predictionCount) {
      throw new Error(
        `Respaldo incompleto: ${backedUp}/${state.predictionCount} documentos.`,
      );
    }

    const deleted = await db.collection("prediccions").deleteMany(state.query);
    if (deleted.deletedCount !== state.predictionCount) {
      throw new Error(
        `Borrado incompleto: ${deleted.deletedCount}/${state.predictionCount} documentos.`,
      );
    }
    await db.collection(BACKUPS).updateOne(
      { _id: backupId },
      {
        $set: {
          status: "applied",
          appliedAt: new Date(),
          backedUp,
          deleted: deleted.deletedCount,
        },
      },
    );
    return {
      applied: true,
      backupId: String(backupId),
      backedUp,
      deleted: deleted.deletedCount,
    };
  } catch (error) {
    await db.collection(BACKUPS).updateOne(
      { _id: backupId },
      {
        $set: {
          status: "failed",
          failedAt: new Date(),
          error: String(error),
        },
      },
    );
    throw error;
  }
}

async function rollback(db, value) {
  const backupId = new ObjectId(value);
  const backup = await db.collection(BACKUPS).findOne({
    _id: backupId,
    repairId: REPAIR_ID,
    database: DB_NAME,
  });
  if (!backup) throw new Error(`No existe el respaldo ${value}.`);
  if (backup.status !== "applied") {
    throw new Error(
      `El respaldo ${value} no esta aplicado (${backup.status}).`,
    );
  }

  await db.collection("prediccions").deleteMany({
    idSiembra: { $in: backup.sowingIds || [] },
  });
  const cursor = db
    .collection(BACKUP_ITEMS)
    .find({ backupId })
    .sort({ _id: 1 });
  let buffered = [];
  let restored = 0;
  for await (const item of cursor) {
    buffered.push(item.document);
    if (buffered.length >= 250) {
      await db
        .collection("prediccions")
        .insertMany(buffered, { ordered: true });
      restored += buffered.length;
      buffered = [];
    }
  }
  if (buffered.length) {
    await db.collection("prediccions").insertMany(buffered, { ordered: true });
    restored += buffered.length;
  }
  if (restored !== backup.originalCount) {
    throw new Error(
      `Restauracion incompleta: ${restored}/${backup.originalCount}.`,
    );
  }
  await db
    .collection(BACKUPS)
    .updateOne(
      { _id: backupId },
      { $set: { status: "rolled_back", rolledBackAt: new Date(), restored } },
    );
  return { backupId: value, restored };
}

(async () => {
  const args = parseArgs(process.argv);
  const url = mongoUrl();
  if (!url) throw new Error("No se encontro una URL de MongoDB.");
  const client = new MongoClient(url);
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME || DB_NAME);
    assertTestingOnly(db, url);
    if (args.rollbackId) {
      console.log(
        JSON.stringify(
          { mode: "rollback", result: await rollback(db, args.rollbackId) },
          null,
          2,
        ),
      );
      return;
    }
    const state = await inspect(db, args.sowingId);
    console.log(
      JSON.stringify(
        { mode: args.apply ? "apply" : "plan", plan: publicSummary(state) },
        null,
        2,
      ),
    );
    if (args.apply) {
      console.log(JSON.stringify({ result: await apply(db, state) }, null, 2));
    }
  } finally {
    await client.close();
  }
})().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
