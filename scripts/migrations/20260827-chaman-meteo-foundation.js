const { MongoClient } = require("../../sdc-datos/node_modules/mongodb");

const MIGRATION_ID = "20260827-chaman-meteo-foundation-v1";
const DB_URL =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL ||
  process.env.DB_URL ||
  "";
const DB_NAME = process.env.DB_NAME || "chaman";
const MANIFEST_COLLECTION = "migration_manifests";

const DEFINITIONS = {
  weather_grid_points: [
    [{ key: 1 }, { unique: true, name: "uniq_weather_grid_point_key" }],
    [{ enabled: 1, countryCode: 1 }, { name: "weather_grid_enabled_country" }],
  ],
  weather_location_bindings: [
    [
      { locationType: 1, locationId: 1 },
      { unique: true, name: "uniq_weather_location_binding" },
    ],
    [{ gridPointKey: 1, active: 1 }, { name: "weather_binding_grid_active" }],
  ],
  weather_hourly_raw: [
    [
      { gridPointKey: 1, timestamp: 1 },
      { unique: true, name: "uniq_weather_hourly_raw_grid_time" },
    ],
  ],
  weather_hourly_derived: [
    [
      { gridPointKey: 1, timestamp: 1, calculationVersion: 1 },
      {
        unique: true,
        name: "uniq_weather_hourly_derived_grid_time_version",
      },
    ],
  ],
  weather_daily: [
    [
      { gridPointKey: 1, date: 1, calculationVersion: 1 },
      { unique: true, name: "uniq_weather_daily_grid_date_version" },
    ],
  ],
  weather_grid_coverage: [
    [{ gridPointKey: 1 }, { unique: true, name: "uniq_weather_grid_coverage" }],
  ],
  weather_import_jobs: [
    [{ jobKey: 1 }, { unique: true, name: "uniq_weather_import_job_key" }],
    [{ status: 1, actualizadoEn: -1 }, { name: "weather_job_status_updated" }],
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

function sameKey(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

async function ensureIndex(collection, [key, options]) {
  const indexes = await collection.indexes();
  const sameName = indexes.find((index) => index.name === options.name);
  if (sameName) {
    if (
      !sameKey(sameName.key, key) ||
      Boolean(sameName.unique) !== Boolean(options.unique)
    ) {
      throw new Error(
        `El indice ${options.name} existe con una definicion incompatible.`,
      );
    }
    return false;
  }
  const equivalent = indexes.find((index) => sameKey(index.key, key));
  if (equivalent) {
    if (Boolean(equivalent.unique) !== Boolean(options.unique)) {
      throw new Error(
        `Existe un indice equivalente incompatible: ${equivalent.name}.`,
      );
    }
    return false;
  }
  await collection.createIndex(key, options);
  return true;
}

async function plan(db) {
  const collections = {};
  for (const [name, definitions] of Object.entries(DEFINITIONS)) {
    const present = await exists(db, name);
    const collection = present ? db.collection(name) : undefined;
    collections[name] = {
      exists: present,
      documents: present ? await collection.countDocuments() : 0,
      currentIndexes: present
        ? (await collection.indexes()).map((index) => index.name)
        : [],
      requiredIndexes: definitions.map(([, options]) => options.name),
    };
  }
  console.log(
    JSON.stringify(
      { migrationId: MIGRATION_ID, mode: "plan", collections },
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
  const createdCollections = [];
  const createdIndexes = [];
  for (const [name, definitions] of Object.entries(DEFINITIONS)) {
    if (!(await exists(db, name))) {
      await db.createCollection(name);
      createdCollections.push(name);
    }
    const collection = db.collection(name);
    for (const definition of definitions) {
      if (await ensureIndex(collection, definition)) {
        createdIndexes.push(`${name}.${definition[1].name}`);
      }
    }
  }
  await manifest.updateOne(
    { migrationId: MIGRATION_ID },
    {
      $set: {
        migrationId: MIGRATION_ID,
        status: "applied",
        appliedAt: new Date(),
        createdCollections,
        createdIndexes,
      },
    },
    { upsert: true },
  );
  console.log(
    JSON.stringify(
      {
        migrationId: MIGRATION_ID,
        status: "applied",
        createdCollections,
        createdIndexes,
      },
      null,
      2,
    ),
  );
}

async function rollback(db) {
  requireConfirmation("rollback");
  const manifestCollection = db.collection(MANIFEST_COLLECTION);
  const applied = await manifestCollection.findOne({
    migrationId: MIGRATION_ID,
    status: "applied",
  });
  if (!applied) {
    console.log(
      JSON.stringify(
        {
          migrationId: MIGRATION_ID,
          status: "not_applied",
          dataPreserved: true,
        },
        null,
        2,
      ),
    );
    return;
  }
  const createdIndexes = new Set(applied.createdIndexes || []);
  const removedIndexes = [];
  for (const [name, definitions] of Object.entries(DEFINITIONS)) {
    if (!(await exists(db, name))) continue;
    const collection = db.collection(name);
    const indexes = await collection.indexes();
    for (const [, options] of definitions) {
      if (
        createdIndexes.has(`${name}.${options.name}`) &&
        indexes.some((index) => index.name === options.name)
      ) {
        await collection.dropIndex(options.name);
        removedIndexes.push(`${name}.${options.name}`);
      }
    }
  }
  // Deliberadamente no elimina colecciones ni datos meteorologicos.
  await manifestCollection.updateOne(
    { migrationId: MIGRATION_ID },
    {
      $set: {
        status: "rolled_back",
        rolledBackAt: new Date(),
        removedIndexes,
      },
    },
  );
  console.log(
    JSON.stringify(
      {
        migrationId: MIGRATION_ID,
        status: "rolled_back",
        removedIndexes,
        dataPreserved: true,
      },
      null,
      2,
    ),
  );
}

async function main() {
  if (!DB_URL) throw new Error("MONGO_URI/MONGO_URL/DATABASE_URL requerido.");
  const mode = process.argv[2] || "plan";
  if (!["plan", "apply", "rollback"].includes(mode)) {
    throw new Error("Modo valido: plan, apply o rollback.");
  }
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

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { MIGRATION_ID, DEFINITIONS, sameKey };
