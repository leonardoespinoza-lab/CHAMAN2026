const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  MIGRATION_ID,
  MANIFEST_VERSION,
  MANIFEST_UNIQUE_INDEX,
  DEFINITIONS,
  acquireMigrationLease,
  activeMatch,
  apply,
  duplicatePipeline,
  resolveDbName,
  rollback,
} = require("../migrations/20260723-active-unique-indexes");

function clone(value) {
  return structuredClone(value);
}

function readPath(document, path) {
  return path
    .split(".")
    .reduce((value, segment) => value?.[segment], document);
}

function hasPath(document, path) {
  const segments = path.split(".");
  let value = document;
  for (const segment of segments) {
    if (
      value === null ||
      typeof value !== "object" ||
      !Object.hasOwn(value, segment)
    ) {
      return false;
    }
    value = value[segment];
  }
  return true;
}

function writePath(document, path, value) {
  const segments = path.split(".");
  const leaf = segments.pop();
  let target = document;
  for (const segment of segments) {
    if (!target[segment] || typeof target[segment] !== "object") {
      target[segment] = {};
    }
    target = target[segment];
  }
  target[leaf] = clone(value);
}

function deletePath(document, path) {
  const segments = path.split(".");
  const leaf = segments.pop();
  const target = segments.reduce(
    (value, segment) => value?.[segment],
    document,
  );
  if (target && typeof target === "object") delete target[leaf];
}

function matches(document, query = {}) {
  return Object.entries(query).every(([field, expected]) => {
    if (field === "$or") {
      return expected.some((condition) => matches(document, condition));
    }
    if (field === "$and") {
      return expected.every((condition) => matches(document, condition));
    }
    const actual = readPath(document, field);
    if (
      expected &&
      typeof expected === "object" &&
      !Array.isArray(expected)
    ) {
      if (Object.hasOwn(expected, "$exists")) {
        return hasPath(document, field) === expected.$exists;
      }
      if (Object.hasOwn(expected, "$lte")) {
        return actual <= expected.$lte;
      }
      if (Object.hasOwn(expected, "$type")) {
        if (expected.$type === "array") return Array.isArray(actual);
        if (expected.$type === "objectId") return actual?.__type === "objectId";
      }
    }
    return actual === expected;
  });
}

class FakeCursor {
  constructor(items) {
    this.items = items;
  }

  batchSize() {
    return this;
  }

  async toArray() {
    return clone(this.items);
  }

  async *[Symbol.asyncIterator]() {
    for (const item of this.items) yield clone(item);
  }
}

class FakeCollection {
  constructor(db, name) {
    this.db = db;
    this.name = name;
    this.documents = [];
    this.indexDefinitions = [{ name: "_id_", key: { _id: 1 }, unique: true }];
  }

  async findOne(query) {
    const item = this.documents.find((document) => matches(document, query));
    return item ? clone(item) : null;
  }

  async countDocuments(query) {
    return this.documents.filter((document) => matches(document, query)).length;
  }

  find(query, options = {}) {
    let items = this.documents.filter((document) => matches(document, query));
    if (options.projection) {
      const fields = Object.entries(options.projection)
        .filter(([, include]) => include)
        .map(([field]) => field);
      items = items.map((document) =>
        Object.fromEntries(
          fields
            .filter((field) => Object.hasOwn(document, field))
            .map((field) => [field, document[field]]),
        ),
      );
    }
    return new FakeCursor(clone(items));
  }

  aggregate() {
    return new FakeCursor([]);
  }

  async updateOne(filter, update, options = {}) {
    let document = this.documents.find((item) => matches(item, filter));
    if (!document && options.upsert) {
      const uniqueMigrationId = filter.migrationId;
      if (
        uniqueMigrationId !== undefined &&
        this.documents.some(
          (item) => item.migrationId === uniqueMigrationId,
        )
      ) {
        const error = new Error("E11000 duplicate key");
        error.code = 11000;
        throw error;
      }
      document = {
        ...Object.fromEntries(
          Object.entries(filter).filter(([field, value]) => {
            return (
              !field.startsWith("$") &&
              !field.includes(".") &&
              (value === null || typeof value !== "object")
            );
          }),
        ),
      };
      this.documents.push(document);
      Object.assign(document, clone(update.$setOnInsert || {}));
    }
    if (!document) return { matchedCount: 0, modifiedCount: 0 };
    for (const [field, value] of Object.entries(update.$set || {})) {
      writePath(document, field, value);
    }
    for (const field of Object.keys(update.$unset || {})) {
      deletePath(document, field);
    }
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async findOneAndUpdate(filter, update, options = {}) {
    await this.updateOne(filter, update, { upsert: options.upsert });
    const migrationId = filter.migrationId;
    const document = this.documents.find(
      (item) => item.migrationId === migrationId,
    );
    return document ? clone(document) : null;
  }

  async updateMany(filter, update) {
    let modifiedCount = 0;
    for (const document of this.documents) {
      if (!matches(document, filter)) continue;
      for (const [field, value] of Object.entries(update.$set || {})) {
        writePath(document, field, value);
      }
      for (const field of Object.keys(update.$unset || {})) {
        deletePath(document, field);
      }
      modifiedCount += 1;
    }
    return { modifiedCount };
  }

  async bulkWrite(operations) {
    for (const operation of operations) {
      await this.updateOne(
        operation.updateOne.filter,
        operation.updateOne.update,
        { upsert: operation.updateOne.upsert },
      );
    }
  }

  async indexes() {
    return clone(this.indexDefinitions);
  }

  async createIndex(key, options) {
    const existing = this.indexDefinitions.find(
      (index) => index.name === options.name,
    );
    if (existing) {
      assert.deepEqual(existing.key, key);
      return options.name;
    }
    this.indexDefinitions.push({ key: clone(key), ...clone(options) });
    return options.name;
  }

  async dropIndex(name) {
    if (this.db.dropFailure?.name === name) {
      const failure = this.db.dropFailure;
      this.db.dropFailure = null;
      if (failure.phase === "before") {
        throw new Error("simulated crash before drop");
      }
      this.indexDefinitions = this.indexDefinitions.filter(
        (index) => index.name !== name,
      );
      throw new Error("simulated crash after drop");
    }
    this.indexDefinitions = this.indexDefinitions.filter(
      (index) => index.name !== name,
    );
    return { ok: 1 };
  }
}

class FakeDb {
  constructor() {
    this.collections = new Map();
    const usuarios = this.collection("usuarios");
    usuarios.documents.push({ _id: "u1", username: "persona" });
    usuarios.indexDefinitions.push({
      name: "username_1",
      key: { username: 1 },
      unique: true,
    });
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new FakeCollection(this, name));
    }
    return this.collections.get(name);
  }

  listCollections(filter) {
    const names = Array.from(this.collections.keys())
      .filter((name) => !filter?.name || name === filter.name)
      .map((name) => ({ name }));
    return new FakeCursor(names);
  }

  manifest() {
    return this.collection("migration_manifests").documents.find(
      (item) => item.migrationId === MIGRATION_ID,
    );
  }
}

async function confirmed(mode, callback) {
  const previous = process.env.CHAMAN_MIGRATION_CONFIRM;
  process.env.CHAMAN_MIGRATION_CONFIRM = `${MIGRATION_ID}:${mode}`;
  try {
    return await callback();
  } finally {
    if (previous === undefined) {
      delete process.env.CHAMAN_MIGRATION_CONFIRM;
    } else {
      process.env.CHAMAN_MIGRATION_CONFIRM = previous;
    }
  }
}

test("la migracion es explicita y todos los indices protegen solo activos", () => {
  assert.equal(MIGRATION_ID, "20260723-active-unique-indexes-v1");
  assert.ok(DEFINITIONS.length >= 8);
  for (const definition of DEFINITIONS) {
    assert.equal(definition.options.unique, true);
    assert.equal(
      definition.options.partialFilterExpression.archivado,
      false,
    );
    assert.match(definition.options.name, /activo/);
  }
});

test("el preflight considera activos tanto false como documentos legacy", () => {
  const match = activeMatch(DEFINITIONS[0]);
  assert.deepEqual(match.$and[0], {
    $or: [{ archivado: false }, { archivado: { $exists: false } }],
  });
});

test("el preflight de cada indice detecta grupos duplicados antes de apply", () => {
  for (const definition of DEFINITIONS) {
    const pipeline = duplicatePipeline(definition);
    assert.equal(pipeline[0].$match != null, true);
    assert.equal(
      pipeline.some((stage) => stage.$match?.count?.$gt === 1),
      true,
    );
    assert.equal(pipeline.at(-1).$limit, 20);
  }
});

test("el arranque de Productor no muta ni elimina indices Mongo", () => {
  const repository = fs.readFileSync(
    path.resolve(
      __dirname,
      "../../sdc-datos/src/entidades/productor/repository.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(repository, /onModuleInit|dropIndex|createIndexes/);
});

test("railway:start solo permite el plan y deriva apply a un job singleton", () => {
  const startup = fs.readFileSync(
    path.resolve(__dirname, "../railway-start.js"),
    "utf8",
  );
  assert.match(startup, /mode !== "plan"/);
  assert.match(startup, /job singleton separado/);
  assert.doesNotMatch(
    startup,
    /CHAMAN_ACTIVE_INDEX_MIGRATION_CONFIRM/,
  );
});

test("respeta la base embebida en la URI cuando DB_NAME no esta definido", () => {
  assert.equal(
    resolveDbName({
      MONGO_URI: "mongodb://mongo.internal:27017/chaman_testing",
    }),
    undefined,
  );
});

test("DB_NAME explicito conserva prioridad sobre la base embebida en la URI", () => {
  assert.equal(
    resolveDbName({
      DB_NAME: "chaman_override",
      MONGO_URI: "mongodb://mongo.internal:27017/chaman_testing",
    }),
    "chaman_override",
  );
});

test("un crash antes del drop conserva inventario y apply se reanuda sin perder metadata", async () => {
  const db = new FakeDb();
  db.dropFailure = { name: "username_1", phase: "before" };

  await assert.rejects(
    confirmed("apply", () => apply(db)),
    /simulated crash before drop/,
  );

  const interrupted = db.manifest();
  assert.equal(interrupted.status, "applying");
  assert.equal(interrupted.manifestVersion, MANIFEST_VERSION);
  assert.equal(interrupted.rollbackInventory.length, 1);
  assert.equal(interrupted.rollbackInventory[0].options.name, "username_1");
  assert.equal(interrupted.rollbackInventory[0].status, "dropping");
  assert.ok(
    (await db.collection("usuarios").indexes()).some(
      (index) => index.name === "username_1",
    ),
  );

  await confirmed("apply", () => apply(db));
  const resumed = db.manifest();
  assert.equal(resumed.status, "applied");
  assert.equal(resumed.rollbackInventory[0].status, "dropped");
  assert.equal(resumed.backfillSteps[0].backedUpCount, 1);
  assert.equal(
    (await db.collection("migration_active_unique_index_backups").countDocuments({
      migrationId: MIGRATION_ID,
      collection: "usuarios",
    })),
    1,
  );
  assert.deepEqual(
    (await db.collection("usuarios").indexes()).map((index) => index.name),
    ["_id_", "uniq_usuario_username_activo_v2"],
  );
});

test("rollback recupera un apply interrumpido despues del drop y es reentrante", async () => {
  const db = new FakeDb();
  db.dropFailure = { name: "username_1", phase: "after" };

  await assert.rejects(
    confirmed("apply", () => apply(db)),
    /simulated crash after drop/,
  );

  const interrupted = db.manifest();
  assert.equal(interrupted.status, "applying");
  assert.equal(interrupted.rollbackInventory[0].status, "dropping");
  assert.equal(
    (await db.collection("usuarios").indexes()).some(
      (index) => index.name === "username_1",
    ),
    false,
  );

  await confirmed("rollback", () => rollback(db));
  const rolledBack = db.manifest();
  assert.equal(rolledBack.status, "rolled_back");
  assert.equal(
    rolledBack.rollbackInventory[0].rollbackStatus,
    "restored",
  );
  assert.equal(
    rolledBack.backfillSteps[0].rollbackStatus,
    "restored",
  );
  assert.deepEqual(
    (await db.collection("usuarios").indexes()).map((index) => index.name),
    ["_id_", "username_1"],
  );
  assert.equal(
    Object.hasOwn(db.collection("usuarios").documents[0], "archivado"),
    false,
  );

  // A repeated operator command after a lost terminal response is harmless.
  await confirmed("rollback", () => rollback(db));
  assert.equal(db.manifest().status, "rolled_back");
});

test("apply infiere un drop ya ejecutado al reanudar despues del crash", async () => {
  const db = new FakeDb();
  db.dropFailure = { name: "username_1", phase: "after" };

  await assert.rejects(
    confirmed("apply", () => apply(db)),
    /simulated crash after drop/,
  );
  assert.equal(db.manifest().rollbackInventory[0].status, "dropping");

  await confirmed("apply", () => apply(db));
  assert.equal(db.manifest().status, "applied");
  assert.equal(db.manifest().rollbackInventory[0].status, "dropped");
  assert.deepEqual(
    (await db.collection("usuarios").indexes()).map((index) => index.name),
    ["_id_", "uniq_usuario_username_activo_v2"],
  );
});

test("dos runners concurrentes no pueden ejecutar apply en paralelo", async () => {
  const db = new FakeDb();
  const results = await confirmed("apply", () =>
    Promise.allSettled([
      apply(db, {
        leaseOptions: { owner: "runner-a", startHeartbeat: false },
      }),
      apply(db, {
        leaseOptions: { owner: "runner-b", startHeartbeat: false },
      }),
    ]),
  );

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const rejected = results.find((result) => result.status === "rejected");
  assert.match(rejected.reason.message, /ocupada por otra instancia/);
  assert.equal(db.manifest().status, "applied");
  assert.ok(
    db
      .collection("migration_manifests")
      .indexDefinitions.some(
        (index) =>
          index.name === MANIFEST_UNIQUE_INDEX && index.unique === true,
      ),
  );
});

test("el lease vencido puede recuperarse y el owner anterior no libera el nuevo", async () => {
  const db = new FakeDb();
  const firstInstant = new Date("2026-07-23T12:00:00.000Z");
  const first = await acquireMigrationLease(db, "apply", {
    owner: "runner-vencido",
    leaseMs: 1000,
    now: () => firstInstant,
    startHeartbeat: false,
  });

  await assert.rejects(
    acquireMigrationLease(db, "apply", {
      owner: "runner-bloqueado",
      leaseMs: 1000,
      now: () => new Date("2026-07-23T12:00:00.500Z"),
      startHeartbeat: false,
    }),
    /ocupada por otra instancia/,
  );

  const replacement = await acquireMigrationLease(db, "apply", {
    owner: "runner-reemplazo",
    leaseMs: 1000,
    now: () => new Date("2026-07-23T12:00:01.001Z"),
    startHeartbeat: false,
  });
  await first.release();
  assert.equal(db.manifest().lease.owner, "runner-reemplazo");
  await replacement.release();
  assert.equal(Object.hasOwn(db.manifest(), "lease"), false);
});
