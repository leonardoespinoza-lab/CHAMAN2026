const { MongoClient } = require("../../sdc-datos/node_modules/mongodb");

const MIGRATION_ID = "20260714-soil-intelligence-v1";
const DB_URL =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL ||
  process.env.DB_URL ||
  "";
const DB_NAME = process.env.DB_NAME || "chaman";
const MANIFEST_COLLECTION = "migration_manifests";
const ASSESSMENTS = "lot_soil_assessments";

const INDEXES = [
  {
    key: { loteId: 1 },
    options: { unique: true, name: "lot_soil_lote_unique" },
  },
  {
    key: { resolutionKey: 1 },
    options: { sparse: true, name: "lot_soil_resolution" },
  },
  { key: { geometryHash: 1 }, options: { name: "lot_soil_geometry" } },
  {
    key: { status: 1, requestedAt: 1 },
    options: { name: "lot_soil_status_requested" },
  },
];

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

function sameKey(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

async function ensureIndex(collection, definition) {
  const indexes = await collection.indexes();
  const sameName = indexes.find(
    (item) => item.name === definition.options.name,
  );
  if (sameName) {
    if (
      !sameKey(sameName.key, definition.key) ||
      Boolean(sameName.unique) !== Boolean(definition.options.unique)
    ) {
      throw new Error(
        `Indice incompatible: ${collection.collectionName}.${definition.options.name}`,
      );
    }
    return;
  }
  const equivalent = indexes.find((item) => sameKey(item.key, definition.key));
  if (equivalent) return;
  await collection.createIndex(definition.key, definition.options);
}

async function plan(db) {
  const present = await exists(db, ASSESSMENTS);
  const lotsPresent = await exists(db, "lotes");
  const candidateLots = lotsPresent
    ? await db.collection("lotes").countDocuments({
        $or: [
          { "ubicacion.geojson.coordinates.0": { $exists: true } },
          { "ubicacion.poligono.2": { $exists: true } },
        ],
      })
    : 0;
  const protectedLegacyValues = lotsPresent
    ? await db.collection("lotes").countDocuments({
        $or: [
          { texturaLixiviacion: { $exists: true, $ne: null } },
          { texturaEscorrentia: { $exists: true, $ne: null } },
          { "suelos.0.textura": { $exists: true, $ne: null } },
        ],
      })
    : 0;
  console.log(
    JSON.stringify(
      {
        migrationId: MIGRATION_ID,
        mode: "plan",
        collection: {
          name: ASSESSMENTS,
          exists: present,
          documents: present
            ? await db.collection(ASSESSMENTS).countDocuments()
            : 0,
          currentIndexes: present
            ? (await db.collection(ASSESSMENTS).indexes()).map(
                (item) => item.name,
              )
            : [],
          requiredIndexes: INDEXES.map((item) => item.options.name),
        },
        candidateLots,
        protectedLegacyValues,
        note: "Apply crea solamente persistencia e indices. No modifica lotes ni dispara consultas externas.",
      },
      null,
      2,
    ),
  );
}

async function apply(db) {
  requireConfirmation("apply");
  const manifest = db.collection(MANIFEST_COLLECTION);
  if (
    await manifest.findOne({ migrationId: MIGRATION_ID, status: "applied" })
  ) {
    console.log(
      JSON.stringify(
        { migrationId: MIGRATION_ID, status: "already_applied" },
        null,
        2,
      ),
    );
    return;
  }
  let createdCollection = false;
  if (!(await exists(db, ASSESSMENTS))) {
    await db.createCollection(ASSESSMENTS);
    createdCollection = true;
  }
  const collection = db.collection(ASSESSMENTS);
  for (const index of INDEXES) await ensureIndex(collection, index);
  await manifest.updateOne(
    { migrationId: MIGRATION_ID },
    {
      $set: {
        migrationId: MIGRATION_ID,
        status: "applied",
        appliedAt: new Date(),
        createdCollection,
        dataMutation: false,
      },
    },
    { upsert: true },
  );
  console.log(
    JSON.stringify(
      {
        migrationId: MIGRATION_ID,
        status: "applied",
        createdCollection,
        note: "No se modificaron valores manuales ni perfiles existentes.",
      },
      null,
      2,
    ),
  );
}

async function rollback(db) {
  requireConfirmation("rollback");
  const manifest = db.collection(MANIFEST_COLLECTION);
  const applied = await manifest.findOne({ migrationId: MIGRATION_ID });
  let droppedCollection = false;
  let preservedCollection = false;
  if (await exists(db, ASSESSMENTS)) {
    const collection = db.collection(ASSESSMENTS);
    if (
      applied?.createdCollection &&
      (await collection.countDocuments()) === 0
    ) {
      await collection.drop();
      droppedCollection = true;
    } else {
      preservedCollection = true;
      const indexes = await collection.indexes();
      for (const definition of INDEXES) {
        if (indexes.some((item) => item.name === definition.options.name)) {
          await collection.dropIndex(definition.options.name);
        }
      }
    }
  }
  await manifest.updateOne(
    { migrationId: MIGRATION_ID },
    {
      $set: {
        status: "rolled_back",
        rolledBackAt: new Date(),
        droppedCollection,
        preservedCollection,
      },
    },
    { upsert: true },
  );
  console.log(
    JSON.stringify(
      {
        migrationId: MIGRATION_ID,
        status: "rolled_back",
        droppedCollection,
        preservedCollection,
        note: preservedCollection
          ? "La colección contiene assessments y se preservó para evitar pérdida de datos."
          : undefined,
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
