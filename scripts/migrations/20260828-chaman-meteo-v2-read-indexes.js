const { randomUUID } = require("node:crypto");
const { hostname } = require("node:os");
const { MongoClient } = require("../../sdc-datos/node_modules/mongodb");

const MIGRATION_ID = "20260828-chaman-meteo-v2-read-indexes-v1";
const MANIFEST_VERSION = 1;
const MANIFEST_COLLECTION = "migration_manifests";
const MANIFEST_UNIQUE_INDEX = "uniq_migration_manifest_id_v1";
const DEFAULT_LEASE_MS = 60 * 60 * 1000;

// Additive v2 read/storage indexes only. The legacy weather_hourly_raw and
// weather_grid_coverage collections (and their unique indexes) are never
// changed, so a v1 binary can be restored without observing v2 progress.
const DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "hourly-derived-version-read",
    collection: "weather_hourly_derived",
    key: Object.freeze({
      gridPointKey: 1,
      calculationVersion: 1,
      timestamp: -1,
    }),
    options: Object.freeze({
      name: "weather_hourly_derived_grid_version_timestamp_desc",
    }),
  }),
  Object.freeze({
    id: "hourly-derived-version-count",
    collection: "weather_hourly_derived",
    key: Object.freeze({ calculationVersion: 1 }),
    options: Object.freeze({
      name: "weather_hourly_derived_calculation_version",
    }),
  }),
  Object.freeze({
    id: "daily-version-read",
    collection: "weather_daily",
    key: Object.freeze({
      gridPointKey: 1,
      calculationVersion: 1,
      date: -1,
    }),
    options: Object.freeze({
      name: "weather_daily_grid_version_date_desc",
    }),
  }),
  Object.freeze({
    id: "daily-version-count",
    collection: "weather_daily",
    key: Object.freeze({ calculationVersion: 1 }),
    options: Object.freeze({
      name: "weather_daily_calculation_version",
    }),
  }),
  Object.freeze({
    id: "job-version-status-read",
    collection: "weather_import_jobs",
    key: Object.freeze({
      calculationVersion: 1,
      sourceVersion: 1,
      status: 1,
      actualizadoEn: -1,
    }),
    options: Object.freeze({
      name: "weather_job_calculation_source_status_updated",
    }),
  }),
  Object.freeze({
    id: "job-version-latest-read",
    collection: "weather_import_jobs",
    key: Object.freeze({
      calculationVersion: 1,
      sourceVersion: 1,
      actualizadoEn: -1,
    }),
    options: Object.freeze({
      name: "weather_job_calculation_source_updated",
    }),
  }),
  Object.freeze({
    id: "hourly-raw-version-unique",
    collection: "weather_hourly_raw_versions",
    key: Object.freeze({
      gridPointKey: 1,
      sourceVersion: 1,
      timestamp: 1,
    }),
    options: Object.freeze({
      name: "uniq_weather_hourly_raw_version",
      unique: true,
    }),
  }),
  Object.freeze({
    id: "hourly-raw-version-read",
    collection: "weather_hourly_raw_versions",
    key: Object.freeze({
      gridPointKey: 1,
      sourceVersion: 1,
      timestamp: -1,
    }),
    options: Object.freeze({
      name: "weather_hourly_raw_version_timestamp_desc",
    }),
  }),
  Object.freeze({
    id: "hourly-raw-version-count",
    collection: "weather_hourly_raw_versions",
    key: Object.freeze({ sourceVersion: 1 }),
    options: Object.freeze({
      name: "weather_hourly_raw_source_version",
    }),
  }),
  Object.freeze({
    id: "coverage-version-unique",
    collection: "weather_grid_coverage_versions",
    key: Object.freeze({
      gridPointKey: 1,
      calculationVersion: 1,
      sourceVersion: 1,
    }),
    options: Object.freeze({
      name: "uniq_weather_grid_coverage_version",
      unique: true,
    }),
  }),
  Object.freeze({
    id: "coverage-version-latest",
    collection: "weather_grid_coverage_versions",
    key: Object.freeze({
      calculationVersion: 1,
      sourceVersion: 1,
      lastSuccessfulImportAt: -1,
    }),
    options: Object.freeze({
      name: "weather_grid_coverage_version_latest",
    }),
  }),
]);

function resolveDbUrl(env = process.env) {
  return (
    env.MONGO_URI ||
    env.MONGO_URL ||
    env.DATABASE_URL ||
    env.DB_URL ||
    ""
  );
}

function resolveDbName(env = process.env) {
  const explicit = String(env.DB_NAME || "").trim();
  return explicit || undefined;
}

function requireConfirmation(mode, env = process.env) {
  const expected = `${MIGRATION_ID}:${mode}`;
  if (env.CHAMAN_MIGRATION_CONFIRM !== expected) {
    throw new Error(
      `Confirmacion requerida: CHAMAN_MIGRATION_CONFIRM=${expected}`,
    );
  }
}

function sameKey(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

function comparableOptions(indexOrOptions = {}) {
  return {
    unique: Boolean(indexOrOptions.unique),
    sparse: Boolean(indexOrOptions.sparse),
    partialFilterExpression:
      indexOrOptions.partialFilterExpression === undefined
        ? undefined
        : indexOrOptions.partialFilterExpression,
    collation:
      indexOrOptions.collation === undefined
        ? undefined
        : indexOrOptions.collation,
  };
}

function sameIndexSemantics(index, definition) {
  return (
    sameKey(index?.key, definition.key) &&
    JSON.stringify(comparableOptions(index)) ===
      JSON.stringify(comparableOptions(definition.options))
  );
}

function inspectDesiredIndex(definition, currentIndexes = []) {
  const named = currentIndexes.find(
    (index) => index.name === definition.options.name,
  );
  if (named) {
    return sameIndexSemantics(named, definition)
      ? { action: "keep", existingName: named.name }
      : {
          action: "blocked",
          existingName: named.name,
          reason: "same_name_incompatible",
        };
  }

  const equivalent = currentIndexes.find((index) =>
    sameKey(index.key, definition.key),
  );
  if (!equivalent) return { action: "create" };
  if (sameIndexSemantics(equivalent, definition)) {
    return {
      action: "keep_equivalent",
      existingName: equivalent.name,
    };
  }
  return {
    action: "blocked",
    existingName: equivalent.name,
    reason: "same_key_incompatible",
  };
}

function createManifest(planSnapshot, previousManifest = undefined) {
  const now = new Date();
  return {
    migrationId: MIGRATION_ID,
    manifestVersion: MANIFEST_VERSION,
    attempt: Number(previousManifest?.attempt || 0) + 1,
    status: "applying",
    applyStartedAt: now,
    updatedAt: now,
    dataDeletion: false,
    weatherDocumentsMutated: false,
    coverageTouched: false,
    legacyRawTouched: false,
    legacyCoverageTouched: false,
    desiredIndexes: planSnapshot.definitions.map((item) => ({
      id: item.definition.id,
      collection: item.definition.collection,
      key: structuredClone(item.definition.key),
      options: structuredClone(item.definition.options),
      existedBefore: ["keep", "keep_equivalent"].includes(
        item.inspection.action,
      ),
      existingName: item.inspection.existingName,
      status: ["keep", "keep_equivalent"].includes(item.inspection.action)
        ? "preserved"
        : "pending",
    })),
  };
}

function manifestIsCompatible(manifest) {
  if (manifest?.manifestVersion !== MANIFEST_VERSION) return false;
  if (!Array.isArray(manifest.desiredIndexes)) return false;
  return DEFINITIONS.every((definition) => {
    const step = manifest.desiredIndexes.find(
      (candidate) => candidate.id === definition.id,
    );
    return (
      step &&
      step.collection === definition.collection &&
      sameKey(step.key, definition.key) &&
      step.options?.name === definition.options.name
    );
  });
}

async function collectionExists(db, name) {
  return (
    (await db.listCollections({ name }, { nameOnly: true }).toArray()).length >
    0
  );
}

async function currentIndexes(db, collectionName) {
  if (!(await collectionExists(db, collectionName))) return [];
  return db.collection(collectionName).indexes();
}

async function inspect(db) {
  const indexCache = new Map();
  for (const definition of DEFINITIONS) {
    if (!indexCache.has(definition.collection)) {
      indexCache.set(
        definition.collection,
        await currentIndexes(db, definition.collection),
      );
    }
  }
  return {
    migrationId: MIGRATION_ID,
    mode: "plan",
    definitions: DEFINITIONS.map((definition) => ({
      definition,
      collectionExists: indexCache.get(definition.collection).length > 0,
      inspection: inspectDesiredIndex(
        definition,
        indexCache.get(definition.collection),
      ),
    })),
    safety: {
      additiveOnly: true,
      dataDeletion: false,
      weatherDocumentsMutated: false,
      coverageTouched: false,
      legacyRawTouched: false,
      legacyCoverageTouched: false,
    },
  };
}

function serializablePlan(snapshot) {
  return {
    migrationId: snapshot.migrationId,
    mode: snapshot.mode,
    definitions: snapshot.definitions.map((item) => ({
      id: item.definition.id,
      collection: item.definition.collection,
      collectionExists: item.collectionExists,
      key: item.definition.key,
      options: item.definition.options,
      ...item.inspection,
    })),
    safety: snapshot.safety,
  };
}

async function plan(db) {
  const output = serializablePlan(await inspect(db));
  console.log(JSON.stringify(output, null, 2));
  return output;
}

async function ensureManifestUniqueIndex(db) {
  await db.collection(MANIFEST_COLLECTION).createIndex(
    { migrationId: 1 },
    {
      name: MANIFEST_UNIQUE_INDEX,
      unique: true,
      partialFilterExpression: { migrationId: { $type: "string" } },
    },
  );
}

async function acquireLease(db, mode, options = {}) {
  await ensureManifestUniqueIndex(db);
  const owner =
    options.owner || `${hostname()}:${process.pid}:${randomUUID()}`;
  const now = options.now ? options.now() : new Date();
  const leaseMs = Number(options.leaseMs || DEFAULT_LEASE_MS);
  let claimed;
  try {
    const result = await db.collection(MANIFEST_COLLECTION).findOneAndUpdate(
      {
        migrationId: MIGRATION_ID,
        $or: [
          { lease: { $exists: false } },
          { "lease.expiresAt": { $lte: now } },
          { "lease.owner": owner },
        ],
      },
      {
        $setOnInsert: {
          migrationId: MIGRATION_ID,
          manifestVersion: MANIFEST_VERSION,
          status: "pending",
          createdAt: now,
        },
        $set: {
          lease: {
            owner,
            mode,
            acquiredAt: now,
            expiresAt: new Date(now.getTime() + leaseMs),
          },
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    claimed = result && Object.hasOwn(result, "value") ? result.value : result;
  } catch (error) {
    if (
      error?.code === 11000 ||
      /E11000|duplicate key/i.test(String(error?.message || ""))
    ) {
      throw new Error(
        "La migracion ya esta siendo ejecutada por otra instancia.",
      );
    }
    throw error;
  }
  if (claimed?.lease?.owner !== owner) {
    throw new Error("No fue posible adquirir el lease de la migracion.");
  }
  return {
    owner,
    async release() {
      await db.collection(MANIFEST_COLLECTION).updateOne(
        { migrationId: MIGRATION_ID, "lease.owner": owner },
        { $unset: { lease: "" } },
      );
    },
  };
}

async function persistManifest(db, lease, fields) {
  const result = await db.collection(MANIFEST_COLLECTION).updateOne(
    { migrationId: MIGRATION_ID, "lease.owner": lease.owner },
    { $set: { ...fields, updatedAt: new Date() } },
  );
  if (result.matchedCount !== 1) {
    throw new Error("Se perdio el lease antes de persistir el progreso.");
  }
}

function assertApplyPreflight(snapshot) {
  const blocked = snapshot.definitions.filter(
    (item) => item.inspection.action === "blocked",
  );
  if (blocked.length) {
    throw new Error(
      `Indices incompatibles: ${blocked
        .map(
          (item) =>
            `${item.definition.collection}.${item.inspection.existingName}`,
        )
        .join(", ")}`,
    );
  }
}

async function applyWithLease(db, lease) {
  const snapshot = await inspect(db);
  assertApplyPreflight(snapshot);
  const manifestCollection = db.collection(MANIFEST_COLLECTION);
  const previous = await manifestCollection.findOne({
    migrationId: MIGRATION_ID,
  });
  const resumable =
    previous && ["applying", "applied"].includes(previous.status);
  if (resumable && !manifestIsCompatible(previous)) {
    throw new Error(
      "Manifest incompatible; apply se cancela sin modificar indices ni datos.",
    );
  }
  const manifest = resumable
    ? previous
    : createManifest(snapshot, previous);
  if (!resumable) await persistManifest(db, lease, manifest);

  for (const step of manifest.desiredIndexes) {
    const definition = DEFINITIONS.find((item) => item.id === step.id);
    const indexes = await currentIndexes(db, definition.collection);
    const state = inspectDesiredIndex(definition, indexes);
    if (state.action === "blocked") {
      throw new Error(
        `Indice incompatible durante apply: ${definition.collection}.${state.existingName}`,
      );
    }
    if (state.action === "create") {
      await db
        .collection(definition.collection)
        .createIndex(definition.key, definition.options);
    }
    step.status = step.existedBefore ? "preserved" : "available";
    step.actualName = state.existingName || definition.options.name;
    step.completedAt = new Date();
    await persistManifest(db, lease, { desiredIndexes: manifest.desiredIndexes });
  }

  const alreadyApplied = previous?.status === "applied";
  const result = {
    status: alreadyApplied ? "already_applied" : "applied",
    appliedAt: previous?.appliedAt || new Date(),
    dataDeletion: false,
    weatherDocumentsMutated: false,
    coverageTouched: false,
    legacyRawTouched: false,
    legacyCoverageTouched: false,
  };
  await persistManifest(db, lease, {
    ...result,
    // Persist the canonical state even when the response says already_applied.
    status: "applied",
  });
  console.log(JSON.stringify({ migrationId: MIGRATION_ID, ...result }, null, 2));
  return result;
}

async function apply(db, options = {}) {
  requireConfirmation("apply", options.env || process.env);
  const lease = await acquireLease(db, "apply", options.leaseOptions);
  try {
    return await applyWithLease(db, lease);
  } finally {
    await lease.release();
  }
}

async function rollbackWithLease(db, lease) {
  const manifest = await db.collection(MANIFEST_COLLECTION).findOne({
    migrationId: MIGRATION_ID,
  });
  if (!manifest || !["applying", "applied", "rolled_back"].includes(manifest.status)) {
    const result = { status: "not_applied", dataPreserved: true };
    console.log(
      JSON.stringify({ migrationId: MIGRATION_ID, ...result }, null, 2),
    );
    return result;
  }
  if (manifest.status === "rolled_back") {
    const result = { status: "already_rolled_back", dataPreserved: true };
    console.log(
      JSON.stringify({ migrationId: MIGRATION_ID, ...result }, null, 2),
    );
    return result;
  }
  if (!manifestIsCompatible(manifest)) {
    throw new Error(
      "Manifest incompatible; rollback se cancela sin modificar indices ni datos.",
    );
  }

  for (const step of manifest.desiredIndexes) {
    if (step.existedBefore) {
      step.rollbackStatus = "preserved";
      continue;
    }
    const indexes = await currentIndexes(db, step.collection);
    const current = indexes.find(
      (index) => index.name === step.options.name,
    );
    if (!current) {
      step.rollbackStatus = "absent";
    } else {
      const definition = DEFINITIONS.find((item) => item.id === step.id);
      if (!sameIndexSemantics(current, definition)) {
        throw new Error(
          `Indice ${step.collection}.${step.options.name} cambio de definicion; rollback se detiene.`,
        );
      }
      await db.collection(step.collection).dropIndex(step.options.name);
      step.rollbackStatus = "removed";
    }
    step.rolledBackAt = new Date();
    await persistManifest(db, lease, { desiredIndexes: manifest.desiredIndexes });
  }

  const result = {
    status: "rolled_back",
    rolledBackAt: new Date(),
    dataPreserved: true,
    weatherDocumentsMutated: false,
    coverageTouched: false,
    legacyRawTouched: false,
    legacyCoverageTouched: false,
  };
  await persistManifest(db, lease, result);
  console.log(JSON.stringify({ migrationId: MIGRATION_ID, ...result }, null, 2));
  return result;
}

async function rollback(db, options = {}) {
  requireConfirmation("rollback", options.env || process.env);
  const lease = await acquireLease(db, "rollback", options.leaseOptions);
  try {
    return await rollbackWithLease(db, lease);
  } finally {
    await lease.release();
  }
}

async function main() {
  const mode = process.argv[2] || "plan";
  if (!["plan", "apply", "rollback"].includes(mode)) {
    throw new Error("Modo valido: plan, apply o rollback.");
  }
  const dbUrl = resolveDbUrl();
  if (!dbUrl) {
    throw new Error("MONGO_URI/MONGO_URL/DATABASE_URL/DB_URL requerido.");
  }
  const client = new MongoClient(dbUrl);
  try {
    await client.connect();
    const dbName = resolveDbName();
    const db = dbName ? client.db(dbName) : client.db();
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

module.exports = {
  DEFAULT_LEASE_MS,
  DEFINITIONS,
  MANIFEST_COLLECTION,
  MANIFEST_UNIQUE_INDEX,
  MANIFEST_VERSION,
  MIGRATION_ID,
  acquireLease,
  apply,
  assertApplyPreflight,
  createManifest,
  inspectDesiredIndex,
  manifestIsCompatible,
  requireConfirmation,
  resolveDbName,
  resolveDbUrl,
  rollback,
  sameIndexSemantics,
  sameKey,
};
