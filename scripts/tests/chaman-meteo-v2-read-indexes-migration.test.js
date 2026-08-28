const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  DEFINITIONS,
  MANIFEST_VERSION,
  MIGRATION_ID,
  apply,
  createManifest,
  inspectDesiredIndex,
  manifestIsCompatible,
  requireConfirmation,
  resolveDbName,
  resolveDbUrl,
  rollback,
} = require("../migrations/20260828-chaman-meteo-v2-read-indexes");

function clone(value) {
  return structuredClone(value);
}

function readPath(document, field) {
  return field
    .split(".")
    .reduce((value, segment) => value?.[segment], document);
}

function hasPath(document, field) {
  const parts = field.split(".");
  let current = document;
  for (const part of parts) {
    if (
      current === null ||
      typeof current !== "object" ||
      !Object.hasOwn(current, part)
    ) {
      return false;
    }
    current = current[part];
  }
  return true;
}

function writePath(document, field, value) {
  const parts = field.split(".");
  const leaf = parts.pop();
  let current = document;
  for (const part of parts) {
    if (!current[part] || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part];
  }
  current[leaf] = clone(value);
}

function deletePath(document, field) {
  const parts = field.split(".");
  const leaf = parts.pop();
  const current = parts.reduce(
    (value, part) => value?.[part],
    document,
  );
  if (current && typeof current === "object") delete current[leaf];
}

function matches(document, query = {}) {
  return Object.entries(query).every(([field, expected]) => {
    if (field === "$or") {
      return expected.some((condition) => matches(document, condition));
    }
    const actual = readPath(document, field);
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if (Object.hasOwn(expected, "$exists")) {
        return hasPath(document, field) === expected.$exists;
      }
      if (Object.hasOwn(expected, "$lte")) return actual <= expected.$lte;
    }
    return actual === expected;
  });
}

class FakeCursor {
  constructor(items) {
    this.items = items;
  }

  async toArray() {
    return clone(this.items);
  }
}

class FakeCollection {
  constructor(name) {
    this.name = name;
    this.documents = [];
    this.indexDefinitions = [
      { name: "_id_", key: { _id: 1 }, unique: true },
    ];
  }

  async indexes() {
    return clone(this.indexDefinitions);
  }

  async createIndex(key, options) {
    const named = this.indexDefinitions.find(
      (index) => index.name === options.name,
    );
    if (named) {
      assert.deepEqual(named.key, key);
      return named.name;
    }
    this.indexDefinitions.push({ key: clone(key), ...clone(options) });
    return options.name;
  }

  async dropIndex(name) {
    this.indexDefinitions = this.indexDefinitions.filter(
      (index) => index.name !== name,
    );
  }

  async findOne(query) {
    const found = this.documents.find((document) => matches(document, query));
    return found ? clone(found) : null;
  }

  async findOneAndUpdate(filter, update, options = {}) {
    await this.updateOne(filter, update, { upsert: options.upsert });
    const found = this.documents.find(
      (document) => document.migrationId === filter.migrationId,
    );
    return found ? clone(found) : null;
  }

  async updateOne(filter, update, options = {}) {
    let document = this.documents.find((item) => matches(item, filter));
    if (!document && options.upsert) {
      if (
        this.documents.some(
          (item) => item.migrationId === filter.migrationId,
        )
      ) {
        const error = new Error("E11000 duplicate key");
        error.code = 11000;
        throw error;
      }
      document = { migrationId: filter.migrationId };
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
}

class FakeDb {
  constructor() {
    this.collections = new Map();
    for (const name of [
      "weather_hourly_derived",
      "weather_daily",
      "weather_import_jobs",
      "weather_grid_coverage",
    ]) {
      this.collection(name);
    }
    this.collection("weather_grid_coverage").indexDefinitions.push({
      name: "uniq_weather_grid_coverage",
      key: { gridPointKey: 1 },
      unique: true,
    });
    this.collection("weather_grid_coverage").documents.push({
      _id: "coverage-legacy",
      gridPointKey: "argentina:-38.8:-68.1",
      hourlyRawCount: 10,
    });
    const jobDefinition = DEFINITIONS.find(
      (item) => item.id === "job-version-status-read",
    );
    this.collection("weather_import_jobs").indexDefinitions.push({
      key: clone(jobDefinition.key),
      ...clone(jobDefinition.options),
    });
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new FakeCollection(name));
    }
    return this.collections.get(name);
  }

  listCollections(filter) {
    return new FakeCursor(
      [...this.collections.keys()]
        .filter((name) => !filter?.name || name === filter.name)
        .map((name) => ({ name })),
    );
  }
}

function confirmed(mode, callback) {
  return callback({
    env: { CHAMAN_MIGRATION_CONFIRM: `${MIGRATION_ID}:${mode}` },
    leaseOptions: { owner: `test-${mode}` },
  });
}

test("define indices aditivos v2 sin reemplazar indices legacy", () => {
  assert.equal(MIGRATION_ID, "20260828-chaman-meteo-v2-read-indexes-v1");
  assert.equal(DEFINITIONS.length, 11);
  assert.deepEqual(
    DEFINITIONS.map(({ collection, key }) => ({ collection, key })),
    [
      {
        collection: "weather_hourly_derived",
        key: { gridPointKey: 1, calculationVersion: 1, timestamp: -1 },
      },
      {
        collection: "weather_hourly_derived",
        key: { calculationVersion: 1 },
      },
      {
        collection: "weather_daily",
        key: { gridPointKey: 1, calculationVersion: 1, date: -1 },
      },
      {
        collection: "weather_daily",
        key: { calculationVersion: 1 },
      },
      {
        collection: "weather_import_jobs",
        key: {
          calculationVersion: 1,
          sourceVersion: 1,
          status: 1,
          actualizadoEn: -1,
        },
      },
      {
        collection: "weather_import_jobs",
        key: {
          calculationVersion: 1,
          sourceVersion: 1,
          actualizadoEn: -1,
        },
      },
      {
        collection: "weather_hourly_raw_versions",
        key: { gridPointKey: 1, sourceVersion: 1, timestamp: 1 },
      },
      {
        collection: "weather_hourly_raw_versions",
        key: { gridPointKey: 1, sourceVersion: 1, timestamp: -1 },
      },
      {
        collection: "weather_hourly_raw_versions",
        key: { sourceVersion: 1 },
      },
      {
        collection: "weather_grid_coverage_versions",
        key: {
          gridPointKey: 1,
          calculationVersion: 1,
          sourceVersion: 1,
        },
      },
      {
        collection: "weather_grid_coverage_versions",
        key: {
          calculationVersion: 1,
          sourceVersion: 1,
          lastSuccessfulImportAt: -1,
        },
      },
    ],
  );
  assert.equal(
    DEFINITIONS.some(
      (definition) => definition.collection === "weather_grid_coverage",
    ),
    false,
  );
  assert.deepEqual(
    DEFINITIONS.filter((definition) => definition.options.unique).map(
      (definition) => definition.id,
    ),
    ["hourly-raw-version-unique", "coverage-version-unique"],
  );
});

test("clasifica create, keep, equivalente y conflicto sin mutar definiciones", () => {
  const definition = DEFINITIONS[0];
  assert.deepEqual(inspectDesiredIndex(definition, []), { action: "create" });
  assert.deepEqual(
    inspectDesiredIndex(definition, [
      { key: definition.key, ...definition.options },
    ]),
    { action: "keep", existingName: definition.options.name },
  );
  assert.deepEqual(
    inspectDesiredIndex(definition, [
      { key: definition.key, name: "equivalente" },
    ]),
    { action: "keep_equivalent", existingName: "equivalente" },
  );
  assert.equal(
    inspectDesiredIndex(definition, [
      { key: definition.key, name: definition.options.name, unique: true },
    ]).action,
    "blocked",
  );
});

test("el manifest registra solo indices y declara cobertura/datos intactos", () => {
  const snapshot = {
    definitions: DEFINITIONS.map((definition, index) => ({
      definition,
      inspection:
        definition.id === "job-version-status-read"
          ? { action: "keep", existingName: definition.options.name }
          : { action: "create" },
    })),
  };
  const manifest = createManifest(snapshot);
  assert.equal(manifest.manifestVersion, MANIFEST_VERSION);
  assert.equal(manifest.dataDeletion, false);
  assert.equal(manifest.weatherDocumentsMutated, false);
  assert.equal(manifest.coverageTouched, false);
  assert.equal(manifest.legacyRawTouched, false);
  assert.equal(manifest.legacyCoverageTouched, false);
  assert.equal(manifest.desiredIndexes[0].existedBefore, false);
  assert.equal(
    manifest.desiredIndexes.find(
      (step) => step.id === "job-version-status-read",
    ).existedBefore,
    true,
  );
  assert.equal(manifestIsCompatible(manifest), true);

  manifest.desiredIndexes[0].key = { otro: 1 };
  assert.equal(manifestIsCompatible(manifest), false);
});

test("apply y rollback son idempotentes y no tocan coverage ni documentos", async () => {
  const db = new FakeDb();
  const coverage = db.collection("weather_grid_coverage");
  const coverageIndexesBefore = clone(coverage.indexDefinitions);
  const coverageDocumentsBefore = clone(coverage.documents);

  const firstApply = await confirmed("apply", (options) => apply(db, options));
  assert.equal(firstApply.status, "applied");
  const secondApply = await confirmed("apply", (options) => apply(db, options));
  assert.equal(secondApply.status, "already_applied");

  for (const definition of DEFINITIONS) {
    assert.equal(
      db
        .collection(definition.collection)
        .indexDefinitions.filter(
          (index) => index.name === definition.options.name,
        ).length,
      1,
    );
  }
  assert.deepEqual(coverage.indexDefinitions, coverageIndexesBefore);
  assert.deepEqual(coverage.documents, coverageDocumentsBefore);

  const firstRollback = await confirmed("rollback", (options) =>
    rollback(db, options),
  );
  assert.equal(firstRollback.status, "rolled_back");
  const secondRollback = await confirmed("rollback", (options) =>
    rollback(db, options),
  );
  assert.equal(secondRollback.status, "already_rolled_back");

  assert.equal(
    db
      .collection("weather_import_jobs")
      .indexDefinitions.some(
        (index) =>
          index.name ===
          "weather_job_calculation_source_status_updated",
      ),
    true,
  );
  assert.equal(
    db
      .collection("weather_hourly_derived")
      .indexDefinitions.some(
        (index) =>
          index.name ===
          "weather_hourly_derived_grid_version_timestamp_desc",
      ),
    false,
  );
  assert.deepEqual(coverage.indexDefinitions, coverageIndexesBefore);
  assert.deepEqual(coverage.documents, coverageDocumentsBefore);
});

test("apply y rollback requieren la confirmacion exacta", () => {
  assert.throws(() => requireConfirmation("apply", {}), /Confirmacion/);
  assert.throws(
    () =>
      requireConfirmation("rollback", {
        CHAMAN_MIGRATION_CONFIRM: `${MIGRATION_ID}:apply`,
      }),
    /Confirmacion/,
  );
  assert.doesNotThrow(() =>
    requireConfirmation("apply", {
      CHAMAN_MIGRATION_CONFIRM: `${MIGRATION_ID}:apply`,
    }),
  );
});

test("respeta DB_NAME explicito o la base embebida en la URI", () => {
  assert.equal(
    resolveDbUrl({ MONGO_URI: "mongodb://host/chaman_testing" }),
    "mongodb://host/chaman_testing",
  );
  assert.equal(
    resolveDbName({ MONGO_URI: "mongodb://host/chaman_testing" }),
    undefined,
  );
  assert.equal(resolveDbName({ DB_NAME: "chaman_override" }), "chaman_override");
});

test("la implementacion no contiene operaciones sobre coverage ni datos", () => {
  const source = fs.readFileSync(
    path.resolve(
      __dirname,
      "../migrations/20260828-chaman-meteo-v2-read-indexes.js",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /db\.collection\(["']weather_grid_coverage/);
  assert.doesNotMatch(source, /deleteMany|deleteOne|updateMany|bulkWrite/);
  assert.doesNotMatch(source, /dropCollection|dropDatabase/);
});
