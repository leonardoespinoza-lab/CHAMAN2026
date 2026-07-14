const { MongoClient } = require("../../sdc-datos/node_modules/mongodb");

const MIGRATION_ID = "20260713-agrometeorology-engine-v1";
const DB_URL =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL ||
  process.env.DB_URL ||
  "";
const DB_NAME = process.env.DB_NAME || "chaman";
const BACKUP_COLLECTION = "migration_backup_items";
const MANIFEST_COLLECTION = "migration_manifests";

const COLLECTIONS = {
  weather: "observaciones_meteorologicas",
  indicators: "indicadores_agrometeorologicos",
};

const INDEXES = {
  weather: [
    {
      key: { idEstablecimiento: 1, timestamp: 1, granularidad: 1 },
      options: { unique: true, name: "uniq_establishment_time_granularity" },
    },
    {
      key: { idEstablecimiento: 1, fechaLocal: 1, granularidad: 1 },
      options: { name: "establishment_local_date_granularity" },
    },
    { key: { actualizadoEn: -1 }, options: { name: "weather_updated_desc" } },
  ],
  indicators: [
    {
      key: { idSiembra: 1, fecha: 1, versionCalculo: 1 },
      options: { unique: true, name: "uniq_sowing_date_engine_version" },
    },
    { key: { idSiembra: 1, fecha: 1 }, options: { name: "sowing_date" } },
    {
      key: { idEstablecimiento: 1, fecha: 1 },
      options: { name: "establishment_indicator_date" },
    },
  ],
};

function requireConfirmation(mode) {
  if (process.env.CHAMAN_MIGRATION_CONFIRM !== `${MIGRATION_ID}:${mode}`) {
    throw new Error(
      `Confirmacion requerida: CHAMAN_MIGRATION_CONFIRM=${MIGRATION_ID}:${mode}`,
    );
  }
}

async function exists(db, name) {
  return (
    (await db.listCollections({ name }, { nameOnly: true }).toArray()).length >
    0
  );
}

async function ensureCollections(db) {
  for (const name of Object.values(COLLECTIONS)) {
    if (!(await exists(db, name))) await db.createCollection(name);
  }
}

async function duplicateGroups(collection, groupId) {
  return await collection
    .aggregate([
      { $sort: { actualizadoEn: -1, creadoEn: -1, _id: -1 } },
      { $group: { _id: groupId, ids: { $push: "$_id" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();
}

async function backupAndRemoveDuplicates(db, collectionName, groups) {
  if (!groups.length) return 0;
  const collection = db.collection(collectionName);
  const backup = db.collection(BACKUP_COLLECTION);
  let removed = 0;
  for (const group of groups) {
    const ids = group.ids.slice(1);
    const documents = await collection.find({ _id: { $in: ids } }).toArray();
    if (documents.length) {
      await backup.insertMany(
        documents.map((document) => ({
          migrationId: MIGRATION_ID,
          collection: collectionName,
          originalId: document._id,
          document,
          backedAt: new Date(),
        })),
      );
      const result = await collection.deleteMany({ _id: { $in: ids } });
      removed += result.deletedCount;
    }
  }
  return removed;
}

async function safeDropIndex(collection, name) {
  const indexes = await collection.indexes();
  if (indexes.some((index) => index.name === name))
    await collection.dropIndex(name);
}

function sameIndexKey(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

async function ensureIndex(collection, definition) {
  const indexes = await collection.indexes();
  const sameName = indexes.find(
    (index) => index.name === definition.options.name,
  );
  if (sameName) {
    if (
      !sameIndexKey(sameName.key, definition.key) ||
      Boolean(sameName.unique) !== Boolean(definition.options.unique)
    ) {
      throw new Error(
        `El indice ${definition.options.name} existe con una definicion incompatible.`,
      );
    }
    return sameName.name;
  }

  const equivalent = indexes.find((index) =>
    sameIndexKey(index.key, definition.key),
  );
  if (equivalent) {
    if (definition.options.unique && !equivalent.unique) {
      await collection.dropIndex(equivalent.name);
    } else {
      return equivalent.name;
    }
  }
  return await collection.createIndex(definition.key, definition.options);
}

async function plan(db) {
  const output = { migrationId: MIGRATION_ID, mode: "plan", collections: {} };
  for (const [key, name] of Object.entries(COLLECTIONS)) {
    const present = await exists(db, name);
    const collection = present ? db.collection(name) : undefined;
    output.collections[key] = {
      name,
      exists: present,
      documents: present ? await collection.countDocuments() : 0,
      indexes: present
        ? (await collection.indexes()).map((index) => index.name)
        : [],
    };
  }
  if (await exists(db, COLLECTIONS.weather)) {
    output.collections.weather.duplicateIntervals = (
      await duplicateGroups(db.collection(COLLECTIONS.weather), {
        idEstablecimiento: "$idEstablecimiento",
        timestamp: "$timestamp",
        granularidad: "$granularidad",
      })
    ).length;
  }
  if (await exists(db, COLLECTIONS.indicators)) {
    output.collections.indicators.duplicateResults = (
      await duplicateGroups(db.collection(COLLECTIONS.indicators), {
        idSiembra: "$idSiembra",
        fecha: "$fecha",
        versionCalculo: "$versionCalculo",
      })
    ).length;
  }
  console.log(JSON.stringify(output, null, 2));
}

async function apply(db) {
  requireConfirmation("apply");
  await ensureCollections(db);
  const manifest = db.collection(MANIFEST_COLLECTION);
  const previous = await manifest.findOne({
    migrationId: MIGRATION_ID,
    status: "applied",
  });
  if (previous) {
    console.log(
      JSON.stringify(
        { migrationId: MIGRATION_ID, status: "already_applied" },
        null,
        2,
      ),
    );
    return;
  }

  const weather = db.collection(COLLECTIONS.weather);
  const indicators = db.collection(COLLECTIONS.indicators);
  await safeDropIndex(weather, "uniq_establishment_time_granularity_kind");

  const weatherDuplicates = await duplicateGroups(weather, {
    idEstablecimiento: "$idEstablecimiento",
    timestamp: "$timestamp",
    granularidad: "$granularidad",
  });
  const indicatorDuplicates = await duplicateGroups(indicators, {
    idSiembra: "$idSiembra",
    fecha: "$fecha",
    versionCalculo: "$versionCalculo",
  });
  const removedWeather = await backupAndRemoveDuplicates(
    db,
    COLLECTIONS.weather,
    weatherDuplicates,
  );
  const removedIndicators = await backupAndRemoveDuplicates(
    db,
    COLLECTIONS.indicators,
    indicatorDuplicates,
  );

  for (const index of INDEXES.weather) await ensureIndex(weather, index);
  for (const index of INDEXES.indicators) await ensureIndex(indicators, index);
  await manifest.updateOne(
    { migrationId: MIGRATION_ID },
    {
      $set: {
        migrationId: MIGRATION_ID,
        status: "applied",
        appliedAt: new Date(),
        removedWeather,
        removedIndicators,
      },
    },
    { upsert: true },
  );
  console.log(
    JSON.stringify(
      {
        migrationId: MIGRATION_ID,
        status: "applied",
        removedWeather,
        removedIndicators,
      },
      null,
      2,
    ),
  );
}

async function rollback(db) {
  requireConfirmation("rollback");
  await ensureCollections(db);
  const weather = db.collection(COLLECTIONS.weather);
  const indicators = db.collection(COLLECTIONS.indicators);
  for (const index of INDEXES.weather)
    await safeDropIndex(weather, index.options.name);
  for (const index of INDEXES.indicators)
    await safeDropIndex(indicators, index.options.name);

  const backups = await db
    .collection(BACKUP_COLLECTION)
    .find({ migrationId: MIGRATION_ID })
    .toArray();
  for (const item of backups) {
    await db
      .collection(item.collection)
      .replaceOne({ _id: item.document._id }, item.document, { upsert: true });
  }
  await db
    .collection(BACKUP_COLLECTION)
    .deleteMany({ migrationId: MIGRATION_ID });
  await db
    .collection(MANIFEST_COLLECTION)
    .updateOne(
      { migrationId: MIGRATION_ID },
      { $set: { status: "rolled_back", rolledBackAt: new Date() } },
      { upsert: true },
    );
  console.log(
    JSON.stringify(
      {
        migrationId: MIGRATION_ID,
        status: "rolled_back",
        restored: backups.length,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const mode = process.argv[2] || "plan";
  if (!["plan", "apply", "rollback"].includes(mode)) {
    throw new Error("Modo valido: plan | apply | rollback");
  }
  if (!DB_URL)
    throw new Error("Falta MONGO_URI/MONGO_URL/DATABASE_URL/DB_URL.");
  const client = new MongoClient(DB_URL);
  await client.connect();
  try {
    const db = client.db(DB_NAME);
    if (mode === "plan") await plan(db);
    if (mode === "apply") await apply(db);
    if (mode === "rollback") await rollback(db);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
