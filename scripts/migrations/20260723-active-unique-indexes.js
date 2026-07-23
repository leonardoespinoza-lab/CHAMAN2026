const { randomUUID } = require("node:crypto");
const { hostname } = require("node:os");
const { MongoClient } = require("../../sdc-datos/node_modules/mongodb");

const MIGRATION_ID = "20260723-active-unique-indexes-v1";
const DB_URL =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL ||
  process.env.DB_URL ||
  "";
const MANIFEST_COLLECTION = "migration_manifests";
const BACKUP_COLLECTION = "migration_active_unique_index_backups";
const MANIFEST_VERSION = 2;
const MANIFEST_UNIQUE_INDEX = "uniq_migration_manifest_id_v1";
const DEFAULT_LEASE_MS = 15 * 60 * 1000;
const DEFAULT_HEARTBEAT_MS = 60 * 1000;

function resolveDbName(env = process.env) {
  const explicitName = String(env.DB_NAME || "").trim();
  return explicitName || undefined;
}

const DEFINITIONS = [
  {
    collection: "usuarios",
    key: { username: 1 },
    options: {
      name: "uniq_usuario_username_activo_v2",
      unique: true,
      partialFilterExpression: { archivado: false },
    },
    legacyNames: ["username_1"],
  },
  {
    collection: "tenants",
    key: { slug: 1 },
    options: {
      name: "uniq_tenant_slug_activo_v2",
      unique: true,
      partialFilterExpression: { archivado: false },
    },
    legacyNames: ["slug_1"],
  },
  {
    collection: "tenants",
    key: { dominios: 1 },
    options: {
      name: "uniq_tenant_dominio_activo_v2",
      unique: true,
      partialFilterExpression: {
        archivado: false,
        dominios: { $type: "array" },
      },
    },
    legacyNames: ["dominios_1"],
    unwind: "dominios",
  },
  {
    collection: "productors",
    key: { nombre: 1, idDistribuidor: 1 },
    options: {
      name: "uniq_productor_distribuidor_nombre_activo_v3",
      unique: true,
      partialFilterExpression: {
        idDistribuidor: { $type: "objectId" },
        archivado: false,
      },
    },
    legacyNames: [
      "nombre_1_idDistribuidor_1",
      "uniq_productor_distribuidor_nombre_v2",
    ],
    requiredType: { idDistribuidor: "objectId" },
  },
  {
    collection: "productors",
    key: { nombre: 1, idAsesorPropietario: 1 },
    options: {
      name: "uniq_productor_asesor_nombre_activo_v3",
      unique: true,
      partialFilterExpression: {
        idAsesorPropietario: { $type: "objectId" },
        archivado: false,
      },
    },
    legacyNames: ["uniq_productor_asesor_nombre_v2"],
    requiredType: { idAsesorPropietario: "objectId" },
  },
  {
    collection: "establecimientos",
    key: { nombre: 1, idProductor: 1 },
    options: {
      name: "uniq_establecimiento_productor_nombre_activo_v2",
      unique: true,
      partialFilterExpression: { archivado: false },
    },
    legacyNames: ["nombre_1_idProductor_1"],
  },
  {
    collection: "lotes",
    key: { nombre: 1, idEstablecimiento: 1 },
    options: {
      name: "uniq_lote_establecimiento_nombre_activo_v2",
      unique: true,
      partialFilterExpression: { archivado: false },
    },
    legacyNames: ["nombre_1_idEstablecimiento_1"],
  },
  {
    collection: "distribuidors",
    key: { nombre: 1, idQuimica: 1 },
    options: {
      name: "uniq_distribuidor_quimica_nombre_activo_v2",
      unique: true,
      partialFilterExpression: { archivado: false },
    },
    legacyNames: ["nombre_1_idQuimica_1"],
  },
  {
    collection: "quimicas",
    key: { nombre: 1 },
    options: {
      name: "uniq_quimica_nombre_activo_v2",
      unique: true,
      partialFilterExpression: { archivado: false },
    },
    legacyNames: ["nombre_1"],
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

function same(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

function indexStepId(collectionName, indexName) {
  return `${collectionName}:${indexName}`;
}

function rollbackIndexOptions(index) {
  const supportedOptions = [
    "name",
    "unique",
    "sparse",
    "partialFilterExpression",
    "expireAfterSeconds",
    "collation",
    "weights",
    "default_language",
    "language_override",
    "textIndexVersion",
    "2dsphereIndexVersion",
    "bits",
    "min",
    "max",
    "bucketSize",
    "wildcardProjection",
    "hidden",
  ];
  return Object.fromEntries(
    supportedOptions
      .filter((name) => index[name] !== undefined)
      .map((name) => [name, index[name]]),
  );
}

function indexMatches(index, key, options = {}) {
  if (!same(index?.key, key)) return false;
  return Object.entries(options).every(([name, expected]) => {
    if (name === "name") return index.name === expected;
    if (name === "unique" || name === "sparse" || name === "hidden") {
      return Boolean(index[name]) === Boolean(expected);
    }
    return JSON.stringify(index[name]) === JSON.stringify(expected);
  });
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function isDuplicateKeyError(error) {
  return (
    error?.code === 11000 ||
    error?.codeName === "DuplicateKey" ||
    /E11000|duplicate key/i.test(String(error?.message || ""))
  );
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

async function acquireMigrationLease(db, mode, options = {}) {
  await ensureManifestUniqueIndex(db);
  const collection = db.collection(MANIFEST_COLLECTION);
  const owner =
    options.owner || `${hostname()}:${process.pid}:${randomUUID()}`;
  const leaseMs = normalizePositiveInteger(
    options.leaseMs,
    DEFAULT_LEASE_MS,
  );
  const heartbeatMs = Math.min(
    normalizePositiveInteger(options.heartbeatMs, DEFAULT_HEARTBEAT_MS),
    Math.max(1, Math.floor(leaseMs / 3)),
  );
  const nowProvider = options.now || (() => new Date());
  const now = nowProvider();
  const expiresAt = new Date(now.getTime() + leaseMs);
  let claimed;

  try {
    const result = await collection.findOneAndUpdate(
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
          status: "pending",
          createdAt: now,
        },
        $set: {
          lease: {
            owner,
            mode,
            acquiredAt: now,
            heartbeatAt: now,
            expiresAt,
          },
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    claimed =
      result && Object.hasOwn(result, "value") ? result.value : result;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new Error(
        "Migracion ocupada por otra instancia. No se ejecutara un segundo runner; espere el vencimiento del lease o la finalizacion del job singleton.",
      );
    }
    throw error;
  }

  if (claimed?.lease?.owner !== owner) {
    throw new Error(
      "No fue posible adquirir el lease atomico de la migracion. No se modifico ningun indice.",
    );
  }

  let stopped = false;
  let renewalPromise = null;
  let lostError = null;

  const renew = async () => {
    if (stopped) return;
    if (lostError) throw lostError;
    if (renewalPromise) return renewalPromise;
    renewalPromise = (async () => {
      const heartbeatAt = nowProvider();
      const renewed = await collection.updateOne(
        {
          migrationId: MIGRATION_ID,
          "lease.owner": owner,
        },
        {
          $set: {
            "lease.heartbeatAt": heartbeatAt,
            "lease.expiresAt": new Date(heartbeatAt.getTime() + leaseMs),
          },
        },
      );
      if (renewed.matchedCount !== 1) {
        throw new Error(
          "Se perdio el lease de la migracion; el runner se detiene antes del siguiente paso.",
        );
      }
    })()
      .catch((error) => {
        lostError = error;
        throw error;
      })
      .finally(() => {
        renewalPromise = null;
      });
    return renewalPromise;
  };

  const timer =
    options.startHeartbeat === false
      ? null
      : setInterval(() => {
          renew().catch(() => {
            // The error is retained and raised synchronously by assertOwned
            // before another migration step can mutate data or indexes.
          });
        }, heartbeatMs);
  timer?.unref?.();

  return {
    owner,
    async assertOwned() {
      if (lostError) throw lostError;
      await renew();
      if (lostError) throw lostError;
    },
    async release() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (renewalPromise) {
        try {
          await renewalPromise;
        } catch {
          // A lost lease belongs to another runner now; never unset its lock.
        }
      }
      await collection.updateOne(
        { migrationId: MIGRATION_ID, "lease.owner": owner },
        { $unset: { lease: "" } },
      );
    },
  };
}

function createInitialManifest(result, previousManifest) {
  const now = new Date();
  const existingDefinitions = result.definitions.filter((item) => item.exists);
  const rollbackInventory = [];
  const seenLegacyIndexes = new Set();

  for (const definition of existingDefinitions) {
    for (const legacyName of definition.legacyNames) {
      const legacy = (definition.currentIndexes || []).find(
        (item) => item.name === legacyName,
      );
      if (!legacy) continue;
      const id = indexStepId(definition.collection, legacyName);
      if (seenLegacyIndexes.has(id)) continue;
      seenLegacyIndexes.add(id);
      rollbackInventory.push({
        id,
        collection: definition.collection,
        key: legacy.key,
        options: rollbackIndexOptions(legacy),
        status: "prepared",
        preparedAt: now,
      });
    }
  }

  const seenCollections = new Set();
  const backfillSteps = [];
  for (const definition of existingDefinitions) {
    if (seenCollections.has(definition.collection)) continue;
    seenCollections.add(definition.collection);
    backfillSteps.push({
      collection: definition.collection,
      status: "pending",
      backedUpCount: 0,
    });
  }

  return {
    migrationId: MIGRATION_ID,
    manifestVersion: MANIFEST_VERSION,
    attempt: Number(previousManifest?.attempt || 0) + 1,
    status: "applying",
    applyStartedAt: now,
    updatedAt: now,
    dataDeletion: false,
    backfillSteps,
    desiredIndexSteps: existingDefinitions.map((definition) => ({
      id: indexStepId(definition.collection, definition.options.name),
      collection: definition.collection,
      key: definition.key,
      options: definition.options,
      existedBefore: (definition.currentIndexes || []).some(
        (item) => item.name === definition.options.name,
      ),
      status: "pending",
    })),
    // This complete rollback inventory is persisted before the first legacy
    // index is dropped. It is never rebuilt while an apply is being resumed.
    rollbackInventory,
    backfilled: {},
    droppedIndexes: [],
  };
}

async function persistManifest(db, manifest, fields, lease) {
  await lease.assertOwned();
  const updatedAt = new Date();
  Object.assign(manifest, fields, { updatedAt });
  const result = await db.collection(MANIFEST_COLLECTION).updateOne(
    { migrationId: MIGRATION_ID, "lease.owner": lease.owner },
    { $set: { ...fields, updatedAt } },
  );
  if (result.matchedCount !== 1) {
    throw new Error(
      "Se perdio el lease antes de persistir el progreso de la migracion.",
    );
  }
}

function requireCrashSafeManifest(manifest) {
  if (
    manifest?.manifestVersion !== MANIFEST_VERSION ||
    !Array.isArray(manifest.backfillSteps) ||
    !Array.isArray(manifest.desiredIndexSteps) ||
    !Array.isArray(manifest.rollbackInventory) ||
    !manifest.backfilled ||
    typeof manifest.backfilled !== "object"
  ) {
    throw new Error(
      "Manifest de apply incompleto o de una version anterior. No se continuara sin inventario durable de rollback.",
    );
  }
}

function activeMatch(definition) {
  return {
    $and: [
      {
        $or: [
          { archivado: false },
          { archivado: { $exists: false } },
        ],
      },
      ...Object.entries(definition.requiredType || {}).map(([field, type]) => ({
        [field]: { $type: type },
      })),
    ],
  };
}

function duplicatePipeline(definition) {
  const keyFields = Object.keys(definition.key);
  const groupId = Object.fromEntries(
    keyFields.map((field) => [field, `$${field}`]),
  );
  const pipeline = [{ $match: activeMatch(definition) }];
  if (definition.unwind) {
    pipeline.push({ $unwind: `$${definition.unwind}` });
  }
  pipeline.push(
    { $group: { _id: groupId, count: { $sum: 1 }, ids: { $push: "$_id" } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 20 },
  );
  return pipeline;
}

async function inspectDefinition(db, definition) {
  if (!(await exists(db, definition.collection))) {
    return { ...definition, exists: false, duplicates: [] };
  }
  const collection = db.collection(definition.collection);
  return {
    ...definition,
    exists: true,
    missingArchived: await collection.countDocuments({
      archivado: { $exists: false },
    }),
    duplicates: await collection
      .aggregate(duplicatePipeline(definition), { allowDiskUse: true })
      .toArray(),
    currentIndexes: await collection.indexes(),
  };
}

async function buildPlan(db) {
  const definitions = [];
  for (const definition of DEFINITIONS) {
    definitions.push(await inspectDefinition(db, definition));
  }
  return {
    migrationId: MIGRATION_ID,
    mode: "plan",
    safeToApply: definitions.every((item) => !item.duplicates.length),
    definitions,
  };
}

async function plan(db) {
  const result = await buildPlan(db);
  console.log(
    JSON.stringify(
      {
        migrationId: result.migrationId,
        mode: result.mode,
        safeToApply: result.safeToApply,
        collections: result.definitions.map((item) => ({
          collection: item.collection,
          desiredIndex: item.options.name,
          exists: item.exists,
          missingArchived: item.missingArchived || 0,
          duplicateGroups: item.duplicates.length,
          currentIndexes: (item.currentIndexes || []).map((index) => index.name),
        })),
        note:
          "Plan de solo lectura. Apply aborta ante duplicados y no elimina documentos.",
      },
      null,
      2,
    ),
  );
}

async function backfillArchived(db, collectionName, attempt) {
  const collection = db.collection(collectionName);
  const cursor = collection
    .find({ archivado: { $exists: false } }, { projection: { _id: 1 } })
    .batchSize(500);
  let batch = [];
  let count = 0;
  for await (const item of cursor) {
    batch.push({
      updateOne: {
        filter: {
          migrationId: MIGRATION_ID,
          attempt,
          collection: collectionName,
          documentId: item._id,
        },
        update: {
          $setOnInsert: {
            migrationId: MIGRATION_ID,
            attempt,
            collection: collectionName,
            documentId: item._id,
          },
        },
        upsert: true,
      },
    });
    if (batch.length === 500) {
      await db.collection(BACKUP_COLLECTION).bulkWrite(batch, {
        ordered: false,
      });
      count += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await db.collection(BACKUP_COLLECTION).bulkWrite(batch, {
      ordered: false,
    });
    count += batch.length;
  }
  await collection.updateMany(
    { archivado: { $exists: false } },
    { $set: { archivado: false } },
  );
  // The backup collection, rather than this invocation's cursor count, is the
  // durable source of truth. If the process crashed after updateMany but
  // before marking the step complete, a retry still reports the full count.
  if (typeof db.collection(BACKUP_COLLECTION).countDocuments === "function") {
    return db.collection(BACKUP_COLLECTION).countDocuments({
      migrationId: MIGRATION_ID,
      attempt,
      collection: collectionName,
    });
  }
  return count;
}

async function ensureDesiredIndex(collection, definition) {
  const indexes = await collection.indexes();
  const named = indexes.find((item) => item.name === definition.options.name);
  if (named) {
    if (
      !same(named.key, definition.key) ||
      !named.unique ||
      !same(
        named.partialFilterExpression,
        definition.options.partialFilterExpression,
      )
    ) {
      throw new Error(
        `Indice incompatible: ${definition.collection}.${definition.options.name}`,
      );
    }
    return false;
  }
  await collection.createIndex(definition.key, definition.options);
  return true;
}

async function applyWithLease(db, lease) {
  let current = await db
    .collection(MANIFEST_COLLECTION)
    .findOne({ migrationId: MIGRATION_ID });
  if (current?.status === "applied") {
    console.log(JSON.stringify({ migrationId: MIGRATION_ID, status: "already_applied" }));
    return;
  }
  if (current?.status === "rolling_back") {
    throw new Error(
      "La migracion tiene un rollback interrumpido. Complete rollback antes de reintentar apply.",
    );
  }
  if (
    current &&
    !["applying", "pending", "rolled_back"].includes(current.status)
  ) {
    throw new Error(
      `Estado de manifest no apto para apply: ${current.status || "desconocido"}. No se reemplazara el inventario de recuperacion.`,
    );
  }

  const result = await buildPlan(db);
  if (!result.safeToApply) {
    throw new Error(
      "Preflight bloqueado: existen claves activas duplicadas. No se modifico ningun documento.",
    );
  }

  let manifest;
  if (current?.status === "applying") {
    requireCrashSafeManifest(current);
    manifest = current;
  } else {
    manifest = createInitialManifest(result, current);
    // Persist the complete recovery contract before any data backfill or index
    // deletion. A failed write here leaves the database untouched.
    await lease.assertOwned();
    const initialized = await db.collection(MANIFEST_COLLECTION).updateOne(
      { migrationId: MIGRATION_ID, "lease.owner": lease.owner },
      {
        $set: manifest,
        $unset: {
          appliedAt: "",
          rolledBackAt: "",
          rollbackStartedAt: "",
          rollbackCompletedAt: "",
        },
      },
    );
    if (initialized.matchedCount !== 1) {
      throw new Error(
        "Se perdio el lease antes de persistir el inventario inicial. No se modifico ningun indice.",
      );
    }
  }

  for (const step of manifest.backfillSteps) {
    if (step.status === "completed") continue;
    step.status = "running";
    step.startedAt = step.startedAt || new Date();
    await persistManifest(db, manifest, {
      status: "applying",
      backfillSteps: manifest.backfillSteps,
    }, lease);
    step.backedUpCount = await backfillArchived(
      db,
      step.collection,
      manifest.attempt,
    );
    step.status = "completed";
    step.completedAt = new Date();
    manifest.backfilled[step.collection] = step.backedUpCount;
    await persistManifest(db, manifest, {
      backfillSteps: manifest.backfillSteps,
      backfilled: manifest.backfilled,
    }, lease);
  }

  for (const step of manifest.desiredIndexSteps) {
    const collection = db.collection(step.collection);
    step.status = "ensuring";
    step.startedAt = step.startedAt || new Date();
    await persistManifest(db, manifest, {
      desiredIndexSteps: manifest.desiredIndexSteps,
    }, lease);
    await ensureDesiredIndex(collection, {
      collection: step.collection,
      key: step.key,
      options: step.options,
    });
    step.status = "completed";
    step.completedAt = new Date();
    await persistManifest(db, manifest, {
      desiredIndexSteps: manifest.desiredIndexSteps,
    }, lease);
  }

  for (const step of manifest.rollbackInventory) {
    const collection = db.collection(step.collection);
    const indexes = await collection.indexes();
    const legacy = indexes.find((item) => item.name === step.options.name);
    if (!legacy) {
      // A crash can occur after dropIndex succeeds but before the manifest is
      // updated. The durable inventory still lets us infer and record success.
      step.status = "dropped";
      step.droppedAt = step.droppedAt || new Date();
      await persistManifest(db, manifest, {
        rollbackInventory: manifest.rollbackInventory,
      }, lease);
      continue;
    }
    if (!indexMatches(legacy, step.key, step.options)) {
      throw new Error(
        `Indice legacy incompatible: ${step.collection}.${step.options.name}`,
      );
    }
    step.status = "dropping";
    step.dropStartedAt = step.dropStartedAt || new Date();
    await persistManifest(db, manifest, {
      rollbackInventory: manifest.rollbackInventory,
    }, lease);
    await lease.assertOwned();
    await collection.dropIndex(step.options.name);
    await lease.assertOwned();
    step.status = "dropped";
    step.droppedAt = new Date();
    await persistManifest(db, manifest, {
      rollbackInventory: manifest.rollbackInventory,
    }, lease);
  }

  const droppedIndexes = manifest.rollbackInventory.map((item) => ({
    collection: item.collection,
    key: item.key,
    options: item.options,
  }));
  await persistManifest(db, manifest, {
    status: "applied",
    appliedAt: new Date(),
    backfilled: manifest.backfilled,
    droppedIndexes,
    dataDeletion: false,
  }, lease);
  console.log(
    JSON.stringify({
      migrationId: MIGRATION_ID,
      status: "applied",
      backfilled: manifest.backfilled,
      droppedIndexes: droppedIndexes.map((item) => `${item.collection}.${item.options.name}`),
      dataDeletion: false,
    }),
  );
}

async function rollbackWithLease(db, lease) {
  const manifest = await db
    .collection(MANIFEST_COLLECTION)
    .findOne({ migrationId: MIGRATION_ID });
  if (!manifest) {
    throw new Error("No existe una aplicacion activa de esta migracion.");
  }
  if (manifest.status === "rolled_back") {
    console.log(JSON.stringify({ migrationId: MIGRATION_ID, status: "already_rolled_back" }));
    return;
  }
  if (!["applying", "applied", "rolling_back"].includes(manifest.status)) {
    throw new Error(
      `Estado de manifest no apto para rollback: ${manifest.status || "desconocido"}`,
    );
  }

  let rollbackInventory = manifest.rollbackInventory;
  if (!Array.isArray(rollbackInventory)) {
    // Compatibility with a fully applied v1 manifest. An interrupted v1 apply
    // cannot be recovered safely because that version persisted no inventory.
    if (manifest.status !== "applied" || !Array.isArray(manifest.droppedIndexes)) {
      throw new Error(
        "Manifest interrumpido sin inventario durable. Se requiere revision manual; no se eliminaran indices.",
      );
    }
    rollbackInventory = manifest.droppedIndexes.map((item) => ({
      id: indexStepId(item.collection, item.options.name),
      collection: item.collection,
      key: item.key,
      options: item.options,
      status: "dropped",
    }));
    manifest.rollbackInventory = rollbackInventory;
  }

  await persistManifest(db, manifest, {
    status: "rolling_back",
    rollbackStartedAt: manifest.rollbackStartedAt || new Date(),
    rollbackInventory,
  }, lease);

  // Restaurar primero los indices anteriores. Si Mongo rechaza alguno, el
  // rollback se detiene antes de retirar la proteccion vigente.
  for (const item of rollbackInventory) {
    const options = Object.fromEntries(
      Object.entries(item.options || {}).filter(([, value]) => value !== undefined),
    );
    const collection = db.collection(item.collection);
    const indexes = await collection.indexes();
    const existing = indexes.find((index) => index.name === options.name);
    if (existing && !indexMatches(existing, item.key, options)) {
      throw new Error(
        `No se puede restaurar el indice legacy incompatible: ${item.collection}.${options.name}`,
      );
    }
    if (!existing) {
      await collection.createIndex(item.key, options);
    }
    item.rollbackStatus = "restored";
    item.restoredAt = item.restoredAt || new Date();
    await persistManifest(db, manifest, {
      rollbackInventory,
    }, lease);
  }

  const desiredIndexSteps = Array.isArray(manifest.desiredIndexSteps)
    ? manifest.desiredIndexSteps
    : DEFINITIONS.map((definition) => ({
        collection: definition.collection,
        key: definition.key,
        options: definition.options,
        // A v1 manifest only existed after apply, and v1 always attempted to
        // create these migration-owned names.
        existedBefore: false,
      }));
  manifest.desiredIndexSteps = desiredIndexSteps;
  for (const step of desiredIndexSteps) {
    if (step.existedBefore || !(await exists(db, step.collection))) continue;
    const collection = db.collection(step.collection);
    const indexes = await collection.indexes();
    const desired = indexes.find((item) => item.name === step.options.name);
    if (desired && !indexMatches(desired, step.key, step.options)) {
      throw new Error(
        `No se eliminara un indice deseado incompatible: ${step.collection}.${step.options.name}`,
      );
    }
    if (desired) {
      await lease.assertOwned();
      await collection.dropIndex(step.options.name);
      await lease.assertOwned();
    }
    step.rollbackStatus = "removed";
    step.removedAt = step.removedAt || new Date();
    await persistManifest(db, manifest, {
      desiredIndexSteps,
    }, lease);
  }

  const backfillSteps = Array.isArray(manifest.backfillSteps)
    ? manifest.backfillSteps
    : Object.keys(manifest.backfilled || {}).map((collection) => ({
        collection,
        status: "completed",
      }));
  manifest.backfillSteps = backfillSteps;
  for (const step of backfillSteps) {
    if (step.rollbackStatus === "restored") continue;
    const backupQuery = {
      migrationId: MIGRATION_ID,
      collection: step.collection,
    };
    if (manifest.manifestVersion === MANIFEST_VERSION) {
      backupQuery.attempt = manifest.attempt;
    }
    const cursor = db.collection(BACKUP_COLLECTION).find(backupQuery);
    for await (const item of cursor) {
      await db.collection(item.collection).updateOne(
        { _id: item.documentId, archivado: false },
        { $unset: { archivado: "" } },
      );
    }
    step.rollbackStatus = "restored";
    step.restoredAt = new Date();
    await persistManifest(db, manifest, {
      backfillSteps,
    }, lease);
  }
  await persistManifest(db, manifest, {
    status: "rolled_back",
    rolledBackAt: new Date(),
    rollbackCompletedAt: new Date(),
  }, lease);
  console.log(JSON.stringify({ migrationId: MIGRATION_ID, status: "rolled_back" }));
}

async function runWithMigrationLease(db, mode, operation, options = {}) {
  const lease = await acquireMigrationLease(db, mode, options.leaseOptions);
  let operationError = null;
  try {
    return await operation(lease);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await lease.release();
    } catch (releaseError) {
      if (!operationError) throw releaseError;
      console.error(
        `No se pudo liberar el lease; vencera por TTL: ${releaseError.message}`,
      );
    }
  }
}

async function apply(db, options = {}) {
  requireConfirmation("apply");
  return runWithMigrationLease(
    db,
    "apply",
    (lease) => applyWithLease(db, lease),
    options,
  );
}

async function rollback(db, options = {}) {
  requireConfirmation("rollback");
  return runWithMigrationLease(
    db,
    "rollback",
    (lease) => rollbackWithLease(db, lease),
    options,
  );
}

async function main() {
  const mode = process.argv[2] || "plan";
  if (!["plan", "apply", "rollback"].includes(mode)) {
    throw new Error("Modo invalido. Use plan, apply o rollback.");
  }
  if (!DB_URL) throw new Error("Falta MONGO_URI/MONGO_URL/DATABASE_URL/DB_URL.");
  const client = new MongoClient(DB_URL);
  try {
    await client.connect();
    // When DB_NAME is absent, leaving the argument undefined makes the Mongo
    // driver honor the database embedded in MONGO_URI/MONGO_URL. This mirrors
    // sdc-datos, which likewise does not override a full Mongo URI.
    const explicitDbName = resolveDbName();
    const db = explicitDbName ? client.db(explicitDbName) : client.db();
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
  MIGRATION_ID,
  MANIFEST_VERSION,
  MANIFEST_UNIQUE_INDEX,
  DEFINITIONS,
  acquireMigrationLease,
  activeMatch,
  apply,
  createInitialManifest,
  duplicatePipeline,
  indexMatches,
  resolveDbName,
  rollback,
  rollbackIndexOptions,
};
