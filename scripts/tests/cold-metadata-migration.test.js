const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { ObjectId } = require("../../sdc-datos/node_modules/mongodb");
const {
  FIELD_PREVIEW_MODEL,
  FIELD_PREVIEW_VERSION,
  MIGRATION_ID,
  MigrationWriteConflictError,
  apply,
  createBackupPayload,
  isLegacyHfeToCpRatio,
  normalizeDeviceColdMetadata,
  normalizeSeedColdMetadata,
  parseArgs,
  plan,
  requireConfirmation,
  resolveDbUrl,
  rollback,
  validateBackupPayload,
  valuesEqual,
  writeRows,
} = require("../migrations/20260716-cold-metadata-normalization");

function cleanupBackupDir(backupDir) {
  fs.rmSync(backupDir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50,
  });
}

test("el modo por defecto es plan y no admite flags destructivos fuera de contexto", () => {
  assert.deepEqual(parseArgs([]), {
    mode: "plan",
    backupPath: undefined,
    backupDir: undefined,
    forceConflicts: false,
  });
  assert.equal(parseArgs(["apply", "--backup-dir=./safe"]).mode, "apply");
  assert.throws(
    () => parseArgs(["plan", "--force-conflicts"]),
    /solo se admite/,
  );
  assert.throws(
    () => parseArgs(["apply", "--backup=x.json"]),
    /solo se admite/,
  );
});

test("apply y rollback exigen una confirmacion ligada a la migracion", () => {
  assert.doesNotThrow(() =>
    requireConfirmation("apply", `${MIGRATION_ID}:apply`),
  );
  assert.throws(
    () => requireConfirmation("apply", `${MIGRATION_ID}:rollback`),
    /Confirmacion requerida/,
  );
});

test("MONGO_PUBLIC_URL es fallback de conexion sin desplazar URI privadas", () => {
  assert.equal(
    resolveDbUrl({
      MONGO_PUBLIC_URL: "mongodb://public",
      DATABASE_URL: "mongodb://database",
    }),
    "mongodb://public",
  );
  assert.equal(
    resolveDbUrl({
      MONGO_URI: "mongodb://private",
      MONGO_PUBLIC_URL: "mongodb://public",
    }),
    "mongodb://private",
  );
});

test("plan inspecciona y resume sin necesitar metodos de escritura", async () => {
  const documents = {
    semillas: [
      {
        _id: "seed-1",
        cultivo: "Manzano",
        variedad: "Legacy",
        requerimientoFrio: {
          horasFrio: 900,
          horasFrioEfectivas: 738,
          porcionesFrio: 60,
          modelo: "HF + HFE + CP",
        },
      },
    ],
    dispositivos: [],
  };
  const db = {
    listCollections({ name }) {
      return {
        async toArray() {
          return hasOwn(documents, name) ? [{ name }] : [];
        },
      };
    },
    collection(name) {
      return {
        find() {
          return {
            async toArray() {
              return documents[name];
            },
          };
        },
      };
    },
  };
  const result = await plan(db);
  assert.equal(result.dryRun, true);
  assert.equal(result.writes, false);
  assert.equal(result.proposed.total, 1);
  assert.equal(result.proposed.byCollection.semillas, 1);
});

test("retira las conversiones mecanicas HF x 0,82 y HF / 15 sin perder el crudo", () => {
  const result = normalizeSeedColdMetadata({
    cultivo: "Manzano",
    variedad: "Ejemplo",
    fuenteBase: "CHAMAN2026 cultivos ampliados",
    requerimientoFrio: {
      horasFrio: 900,
      horasFrioEfectivas: 738,
      porcionesFrio: 60,
      modelo: "HF + HFE + CP",
    },
  });

  assert.equal(result.changed, true);
  assert.equal(result.replacementValue.horasFrio, 900);
  assert.equal(result.replacementValue.horasFrioEfectivas, undefined);
  assert.equal(result.replacementValue.porcionesFrio, undefined);
  assert.equal(result.replacementValue.modelo, "HF + Dynamic Model");
  assert.equal(result.replacementValue.modeloRector, "sin_calibrar");
  assert.equal(result.replacementValue.estado, "requiere_calibracion");
  assert.deepEqual(
    result.replacementValue.legacy.frio.raw,
    result.originalValue,
  );
  assert.ok(
    result.reasons.includes("mechanical_hfe_equals_round_hf_times_0_82"),
  );
  assert.ok(result.reasons.includes("mechanical_cp_equals_round_hf_div_15"));

  const repeated = normalizeSeedColdMetadata({
    cultivo: "Manzano",
    requerimientoFrio: result.replacementValue,
  });
  assert.equal(repeated.changed, false);
});

test("Vid 0/0/0 queda sin requisito rector y con el dato anterior auditable", () => {
  const result = normalizeSeedColdMetadata({
    cultivo: "Vid",
    variedad: "Malbec",
    requerimientoFrio: {
      horasFrio: 0,
      horasFrioEfectivas: 0,
      porcionesFrio: 0,
      modelo: "HF + HFE + CP",
    },
  });

  assert.equal(result.changed, true);
  assert.equal(result.replacementValue.horasFrio, undefined);
  assert.equal(result.replacementValue.horasFrioEfectivas, undefined);
  assert.equal(result.replacementValue.porcionesFrio, undefined);
  assert.equal(result.replacementValue.modeloRector, "sin_calibrar");
  assert.equal(result.replacementValue.estado, "requiere_calibracion");
  assert.equal(result.replacementValue.legacy.frio.raw.horasFrio, 0);
});

test("un CP declarado que no coincide con una conversion mecanica se conserva pero no se valida", () => {
  const result = normalizeSeedColdMetadata({
    cultivo: "Manzano",
    variedad: "Rosy Glow",
    requerimientoFrio: {
      horasFrio: 700,
      horasFrioEfectivas: 600,
      porcionesFrio: 42,
      modelo: "HF + HFE + CP",
      modeloRector: "CP",
      fuente: "Base varietal declarada",
    },
  });

  assert.equal(result.changed, true);
  assert.equal(result.replacementValue.horasFrio, 700);
  assert.equal(result.replacementValue.horasFrioEfectivas, undefined);
  assert.equal(result.replacementValue.porcionesFrio, 42);
  assert.equal(result.replacementValue.modeloRector, "CP");
  assert.equal(result.replacementValue.estado, "requiere_calibracion");
  assert.equal(result.replacementValue.legacy.frio.raw.porcionesFrio, 42);
});

test("una referencia ya normalizada no se reescribe", () => {
  const result = normalizeSeedColdMetadata({
    cultivo: "Peral",
    requerimientoFrio: {
      horasFrio: 800,
      porcionesFrio: 48,
      modelo: "HF + Dynamic Model",
      modeloRector: "CP",
      estado: "requiere_calibracion",
    },
  });
  assert.equal(result.changed, false);
});

test("CP igual a HFE/28 en dispositivo queda legacy y el dispositivo expone solo HF preview", () => {
  const original = {
    fechaInicio: "2026-05-01",
    horasFrio: 410,
    horasFrioEfectivas: 560,
    porcionesFrio: 20,
    factorEfectivoActual: 0.75,
    modelo: "HF <= 7C + HFE + CP simplificado",
    fuente: "Sensor LoRa",
  };
  assert.equal(isLegacyHfeToCpRatio(original), true);

  const result = normalizeDeviceColdMetadata({
    nombre: "K-01",
    deveui: "001122",
    frioAcumulado: original,
  });
  assert.equal(result.changed, true);
  assert.equal(result.replacementValue.horasFrio, 410);
  assert.equal(result.replacementValue.horasFrioEfectivas, undefined);
  assert.equal(result.replacementValue.porcionesFrio, undefined);
  assert.equal(result.replacementValue.factorEfectivoActual, undefined);
  assert.equal(result.replacementValue.modelo, FIELD_PREVIEW_MODEL);
  assert.equal(result.replacementValue.versionModelo, FIELD_PREVIEW_VERSION);
  assert.equal(result.replacementValue.estadoCalculo, "preview");
  assert.deepEqual(result.replacementValue.legacy.frio.raw, original);

  const repeated = normalizeDeviceColdMetadata({
    frioAcumulado: result.replacementValue,
  });
  assert.equal(repeated.changed, false);
});

test("un Dynamic Model horario canonico no se degrada a preview", () => {
  const result = normalizeDeviceColdMetadata({
    frioAcumulado: {
      horasFrio: 480,
      porcionesFrio: 38.2,
      modelo: "Dynamic Model Fishman horario",
      versionModelo: "dynamic-model-hourly-v1.0.0",
      estadoCalculo: "canonico",
    },
  });
  assert.equal(result.changed, false);
});

test("el backup JSON tiene checksum, BSON exacto y detecta manipulaciones", () => {
  const date = new Date("2026-07-16T12:00:00.000Z");
  const rows = [
    {
      collection: "dispositivos",
      field: "frioAcumulado",
      originalId: new ObjectId("64b000000000000000000001"),
      existed: true,
      originalValue: { fechaUltimoCalculo: date, horasFrio: 10 },
      replacementValue: { fechaUltimoCalculo: date, horasFrio: 10 },
      reasons: ["device_hfe_legacy"],
      context: { nombre: "K-01" },
    },
  ];
  const payload = createBackupPayload(rows, "2026-07-16T12:30:00.000Z");
  const restored = validateBackupPayload(payload);
  assert.equal(restored.length, 1);
  assert.ok(restored[0].originalId instanceof ObjectId);
  assert.ok(restored[0].originalValue.fechaUltimoCalculo instanceof Date);
  assert.equal(
    restored[0].originalValue.fechaUltimoCalculo.toISOString(),
    date.toISOString(),
  );

  const tampered = structuredClone(payload);
  tampered.entries[0].reasons.push("alterado");
  assert.throws(() => validateBackupPayload(tampered), /checksum/);
});

test("writeRows aplica y revierte solo contra el valor exacto esperado", async () => {
  const row = {
    collection: "semillas",
    field: "requerimientoFrio",
    originalId: "seed-cas",
    existed: true,
    originalValue: { horasFrio: 900, modelo: "legacy" },
    replacementValue: { horasFrio: 900, modelo: "normalizado" },
  };
  const document = {
    _id: row.originalId,
    requerimientoFrio: structuredClone(row.originalValue),
  };
  const db = createSingleDocumentDb(document);

  const applied = await writeRows(db, [row], "apply");
  assert.equal(applied.modified, 1);
  assert.equal(applied.alreadyComplete, 0);
  assert.deepEqual(document.requerimientoFrio, row.replacementValue);

  const repeatedApply = await writeRows(db, [row], "apply");
  assert.equal(repeatedApply.modified, 0);
  assert.equal(repeatedApply.alreadyComplete, 1);
  assert.equal(repeatedApply.completed, 1);

  const rolledBack = await writeRows(db, [row], "rollback");
  assert.equal(rolledBack.modified, 1);
  assert.equal(rolledBack.alreadyComplete, 0);
  assert.deepEqual(document.requerimientoFrio, row.originalValue);

  const repeatedRollback = await writeRows(db, [row], "rollback");
  assert.equal(repeatedRollback.modified, 0);
  assert.equal(repeatedRollback.alreadyComplete, 1);
  assert.equal(repeatedRollback.completed, 1);
});

test("rollback compare-and-set conserva una edicion posterior al apply", async () => {
  const row = {
    collection: "semillas",
    field: "requerimientoFrio",
    originalId: "seed-rollback-race",
    existed: true,
    originalValue: { horasFrio: 900, modelo: "legacy" },
    replacementValue: { horasFrio: 900, modelo: "normalizado" },
  };
  const adminValue = {
    horasFrio: 850,
    modelo: "ajuste posterior validado por administrador",
  };
  const document = {
    _id: row.originalId,
    requerimientoFrio: structuredClone(adminValue),
  };

  await assert.rejects(
    writeRows(createSingleDocumentDb(document), [row], "rollback"),
    (error) =>
      error instanceof MigrationWriteConflictError &&
      error.code === "MIGRATION_COMPARE_AND_SET_CONFLICT",
  );
  assert.deepEqual(document.requerimientoFrio, adminValue);
});

test("compare-and-set no pisa una edicion concurrente y apply nunca queda marcado applied", async () => {
  const backupDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "chaman-cold-migration-"),
  );
  const adminValue = {
    horasFrio: 777,
    modelo: "edicion administrativa concurrente",
  };
  const db = createMigrationDb({
    semillas: [
      {
        _id: "seed-race",
        cultivo: "Manzano",
        variedad: "Carrera",
        requerimientoFrio: {
          horasFrio: 900,
          horasFrioEfectivas: 738,
          porcionesFrio: 60,
          modelo: "HF + HFE + CP",
        },
      },
    ],
    beforeFirstTargetUpdate(state) {
      state.semillas[0].requerimientoFrio = structuredClone(adminValue);
    },
  });

  try {
    await assert.rejects(
      apply(db, {
        confirmation: `${MIGRATION_ID}:apply`,
        backupDir,
      }),
      (error) =>
        error instanceof MigrationWriteConflictError &&
        error.code === "MIGRATION_COMPARE_AND_SET_CONFLICT",
    );
    assert.deepEqual(db.state.semillas[0].requerimientoFrio, adminValue);
    assert.equal(db.state.manifest.status, "apply_failed");
    assert.notEqual(db.state.manifest.status, "applied");
    assert.equal(
      db.state.manifest.applyFailure.code,
      "MIGRATION_COMPARE_AND_SET_CONFLICT",
    );
    assert.equal(db.state.backups.length, 1);
  } finally {
    cleanupBackupDir(backupDir);
  }
});

test("apply reanuda de forma segura despues de una falla a mitad de las filas", async () => {
  const backupDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "chaman-cold-migration-resume-apply-"),
  );
  const db = createMigrationDb({
    semillas: [
      legacySeed("seed-resume-apply-1", "Primera"),
      legacySeed("seed-resume-apply-2", "Segunda"),
    ],
  });
  db.failAfterSuccessfulTargetUpdates(1);

  try {
    await assert.rejects(
      apply(db, {
        confirmation: `${MIGRATION_ID}:apply`,
        backupDir,
      }),
      /falla simulada de escritura/,
    );
    assert.equal(db.state.manifest.status, "apply_failed");
    assert.equal(db.state.manifest.applyFailure.processed, 1);
    assert.equal(
      db.state.semillas[0].requerimientoFrio.modelo,
      "HF + Dynamic Model",
    );
    assert.equal(
      db.state.semillas[1].requerimientoFrio.modelo,
      "HF + HFE + CP",
    );

    const resumed = await apply(db, {
      confirmation: `${MIGRATION_ID}:apply`,
      backupDir,
    });
    assert.equal(resumed.changed, 2);
    assert.equal(resumed.modifiedThisRun, 1);
    assert.equal(resumed.alreadyAppliedRows, 1);
    assert.equal(resumed.resumed, true);
    assert.equal(db.state.manifest.status, "applied");
    assert.ok(
      db.state.semillas.every(
        (seed) => seed.requerimientoFrio.modelo === "HF + Dynamic Model",
      ),
    );
  } finally {
    cleanupBackupDir(backupDir);
  }
});

test("rollback revierte de forma segura un apply parcialmente restaurado", async () => {
  const backupDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "chaman-cold-migration-resume-rollback-"),
  );
  const db = createMigrationDb({
    semillas: [
      legacySeed("seed-resume-rollback-1", "Primera"),
      legacySeed("seed-resume-rollback-2", "Segunda"),
    ],
  });

  try {
    await apply(db, {
      confirmation: `${MIGRATION_ID}:apply`,
      backupDir,
    });
    db.failAfterSuccessfulTargetUpdates(1);

    await assert.rejects(
      rollback(db, {
        confirmation: `${MIGRATION_ID}:rollback`,
      }),
      /falla simulada de escritura/,
    );
    assert.equal(db.state.manifest.status, "rollback_failed");
    assert.equal(db.state.manifest.rollbackFailure.processed, 1);
    assert.equal(
      db.state.semillas[0].requerimientoFrio.modelo,
      "HF + HFE + CP",
    );
    assert.equal(
      db.state.semillas[1].requerimientoFrio.modelo,
      "HF + Dynamic Model",
    );

    const resumed = await rollback(db, {
      confirmation: `${MIGRATION_ID}:rollback`,
    });
    assert.equal(resumed.restored, 2);
    assert.equal(resumed.modifiedThisRun, 1);
    assert.equal(resumed.alreadyRestoredRows, 1);
    assert.equal(resumed.resumed, true);
    assert.equal(db.state.manifest.status, "rolled_back");
    assert.ok(
      db.state.semillas.every(
        (seed) => seed.requerimientoFrio.modelo === "HF + HFE + CP",
      ),
    );
  } finally {
    cleanupBackupDir(backupDir);
  }
});

test("apply puede reparar hacia adelante un rollback que quedo parcial", async () => {
  const backupDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "chaman-cold-migration-reapply-"),
  );
  const db = createMigrationDb({
    semillas: [
      legacySeed("seed-reapply-1", "Primera"),
      legacySeed("seed-reapply-2", "Segunda"),
    ],
  });

  try {
    await apply(db, {
      confirmation: `${MIGRATION_ID}:apply`,
      backupDir,
    });
    db.failAfterSuccessfulTargetUpdates(1);
    await assert.rejects(
      rollback(db, {
        confirmation: `${MIGRATION_ID}:rollback`,
      }),
      /falla simulada de escritura/,
    );
    assert.equal(db.state.manifest.status, "rollback_failed");

    const repaired = await apply(db, {
      confirmation: `${MIGRATION_ID}:apply`,
      backupDir,
    });
    assert.equal(repaired.changed, 2);
    assert.equal(repaired.modifiedThisRun, 1);
    assert.equal(repaired.alreadyAppliedRows, 1);
    assert.equal(repaired.resumed, true);
    assert.equal(db.state.manifest.status, "applied");
    assert.ok(
      db.state.semillas.every(
        (seed) => seed.requerimientoFrio.modelo === "HF + Dynamic Model",
      ),
    );
  } finally {
    cleanupBackupDir(backupDir);
  }
});

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function createSingleDocumentDb(document, beforeUpdate) {
  return {
    listCollections() {
      return {
        async toArray() {
          return [{ name: "semillas" }];
        },
      };
    },
    collection() {
      return {
        async findOne(filter) {
          return matchesFilter(document, filter)
            ? structuredClone(document)
            : null;
        },
        find(filter) {
          return {
            async toArray() {
              return matchesFilter(document, filter)
                ? [structuredClone(document)]
                : [];
            },
          };
        },
        async updateOne(filter, update) {
          if (beforeUpdate) beforeUpdate(document);
          if (!matchesFilter(document, filter)) {
            return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
          }
          applyMongoUpdate(document, update);
          return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
        },
      };
    },
  };
}

function legacySeed(id, variedad) {
  return {
    _id: id,
    cultivo: "Manzano",
    variedad,
    requerimientoFrio: {
      horasFrio: 900,
      horasFrioEfectivas: 738,
      porcionesFrio: 60,
      modelo: "HF + HFE + CP",
    },
  };
}

function createMigrationDb({
  semillas = [],
  dispositivos = [],
  beforeFirstTargetUpdate,
}) {
  const state = {
    semillas: structuredClone(semillas),
    dispositivos: structuredClone(dispositivos),
    backups: [],
    manifest: undefined,
    targetUpdateAttempts: 0,
    failTargetUpdateOnAttempt: undefined,
  };
  let targetUpdateStarted = false;

  const db = {
    state,
    failAfterSuccessfulTargetUpdates(count) {
      state.failTargetUpdateOnAttempt =
        state.targetUpdateAttempts + Number(count || 0) + 1;
    },
    listCollections({ name }) {
      return {
        async toArray() {
          return hasOwn(state, name) && Array.isArray(state[name])
            ? [{ name }]
            : [];
        },
      };
    },
    collection(name) {
      if (name === "migration_backup_items") {
        return {
          async bulkWrite(operations) {
            for (const operation of operations) {
              const { filter, update } = operation.updateOne;
              const exists = state.backups.some((row) =>
                matchesFilter(row, filter),
              );
              if (!exists) {
                state.backups.push(structuredClone(update.$setOnInsert));
              }
            }
            return {
              acknowledged: true,
              matchedCount: 0,
              modifiedCount: 0,
              upsertedCount: operations.length,
            };
          },
          find(filter) {
            return {
              sort() {
                return {
                  async toArray() {
                    return state.backups
                      .filter((row) => matchesFilter(row, filter))
                      .map((row) => structuredClone(row));
                  },
                };
              },
            };
          },
        };
      }

      if (name === "migration_manifests") {
        return {
          async findOne(filter) {
            return state.manifest && matchesFilter(state.manifest, filter)
              ? structuredClone(state.manifest)
              : null;
          },
          async updateOne(filter, update, options = {}) {
            if (!state.manifest) {
              if (!options.upsert) {
                return {
                  acknowledged: true,
                  matchedCount: 0,
                  modifiedCount: 0,
                };
              }
              state.manifest = { migrationId: MIGRATION_ID };
            }
            if (!matchesFilter(state.manifest, filter)) {
              return {
                acknowledged: true,
                matchedCount: 0,
                modifiedCount: 0,
              };
            }
            applyMongoUpdate(state.manifest, update);
            return {
              acknowledged: true,
              matchedCount: 1,
              modifiedCount: 1,
            };
          },
        };
      }

      if (name === "semillas" || name === "dispositivos") {
        return {
          async findOne(filter) {
            const document = state[name].find((row) =>
              matchesFilter(row, filter),
            );
            return document ? structuredClone(document) : null;
          },
          find(filter) {
            return {
              async toArray() {
                return state[name]
                  .filter((row) => matchesFilter(row, filter))
                  .map((row) => structuredClone(row));
              },
            };
          },
          async updateOne(filter, update) {
            if (!targetUpdateStarted) {
              targetUpdateStarted = true;
              beforeFirstTargetUpdate?.(state);
            }
            state.targetUpdateAttempts += 1;
            if (
              state.failTargetUpdateOnAttempt === state.targetUpdateAttempts
            ) {
              state.failTargetUpdateOnAttempt = undefined;
              throw new Error("falla simulada de escritura");
            }
            const document = state[name].find((row) =>
              matchesFilter(row, filter),
            );
            if (!document) {
              return {
                acknowledged: true,
                matchedCount: 0,
                modifiedCount: 0,
              };
            }
            applyMongoUpdate(document, update);
            return {
              acknowledged: true,
              matchedCount: 1,
              modifiedCount: 1,
            };
          },
        };
      }

      throw new Error(`Coleccion fake no soportada: ${name}`);
    },
  };
  return db;
}

function matchesFilter(document, filter) {
  return Object.entries(filter || {}).every(([key, expected]) => {
    if (
      expected &&
      typeof expected === "object" &&
      !Array.isArray(expected) &&
      hasOwn(expected, "$in")
    ) {
      return expected.$in.some((value) => valuesEqual(document[key], value));
    }
    if (
      expected &&
      typeof expected === "object" &&
      !Array.isArray(expected) &&
      hasOwn(expected, "$exists")
    ) {
      return hasOwn(document, key) === Boolean(expected.$exists);
    }
    return valuesEqual(document[key], expected);
  });
}

function applyMongoUpdate(document, update) {
  for (const [key, value] of Object.entries(update.$set || {})) {
    document[key] = structuredClone(value);
  }
  for (const key of Object.keys(update.$unset || {})) {
    delete document[key];
  }
}
