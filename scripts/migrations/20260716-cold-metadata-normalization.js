const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  BSON,
  MongoClient,
  ObjectId,
} = require("../../sdc-datos/node_modules/mongodb");

const MIGRATION_ID = "20260716-cold-metadata-normalization-v1";
function resolveDbUrl(env = process.env) {
  return (
    env.MONGO_URI ||
    env.MONGO_URL ||
    env.MONGO_PUBLIC_URL ||
    env.DATABASE_URL ||
    env.DB_URL ||
    ""
  );
}

const DB_URL = resolveDbUrl();
const DB_NAME = process.env.DB_NAME || "chaman";
const BACKUP_COLLECTION = "migration_backup_items";
const MANIFEST_COLLECTION = "migration_manifests";
const BACKUP_FORMAT = "chaman-cold-metadata-backup-v1";
const FIELD_PREVIEW_VERSION = "hf-field-preview-1.0.0";
const FIELD_PREVIEW_MODEL = "HF 0-7,2 C: vista previa del dispositivo";
const NORMALIZED_MODEL = "HF + Dynamic Model";
const NORMALIZATION_NOTE =
  "Normalizacion 2026: HFE queda solo como dato legacy; Chill Portions no se deriva de HF ni de HFE y debe calcularse con el Dynamic Model horario.";

class MigrationWriteConflictError extends Error {
  constructor(direction, conflicts, processed = 0) {
    super(
      `${direction === "apply" ? "Apply" : "Rollback"} cancelado por compare-and-set: ` +
        `${conflicts.length} conflicto(s) detectado(s) despues de ${processed} escritura(s). ` +
        JSON.stringify(conflicts.slice(0, 10)),
    );
    this.name = "MigrationWriteConflictError";
    this.code = "MIGRATION_COMPARE_AND_SET_CONFLICT";
    this.direction = direction;
    this.conflicts = conflicts;
    this.processed = processed;
  }
}

const TARGETS = [
  {
    collection: "semillas",
    field: "requerimientoFrio",
    query: { requerimientoFrio: { $exists: true, $ne: null } },
    projection: {
      cultivo: 1,
      variedad: 1,
      fuenteBase: 1,
      requerimientoFrio: 1,
    },
    transform: normalizeSeedColdMetadata,
  },
  {
    collection: "dispositivos",
    field: "frioAcumulado",
    query: { frioAcumulado: { $exists: true, $ne: null } },
    projection: {
      nombre: 1,
      deveui: 1,
      frioAcumulado: 1,
    },
    transform: normalizeDeviceColdMetadata,
  },
];

function hasOwn(value, key) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  if (value === undefined) return undefined;
  return structuredClone(value);
}

function withoutLegacy(value) {
  const raw = clone(value) || {};
  delete raw.legacy;
  return raw;
}

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof ObjectId) return value.toHexString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (isPlainObject(value)) {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (value[key] !== undefined) result[key] = stableValue(value[key]);
        return result;
      }, {});
  }
  return value;
}

function fingerprint(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function valuesEqual(left, right) {
  return fingerprint(left) === fingerprint(right);
}

function near(left, right, tolerance) {
  const leftNumber = finiteNumber(left);
  const rightNumber = finiteNumber(right);
  if (leftNumber === undefined || rightNumber === undefined) return false;
  return Math.abs(leftNumber - rightNumber) <= tolerance;
}

function appendNote(existing, note) {
  const text = String(existing || "").trim();
  if (!text) return note;
  if (normalizeText(text).includes(normalizeText(note))) return text;
  return `${text} ${note}`;
}

function buildLegacyBlock(original, reasons) {
  const existing = isPlainObject(original?.legacy) ? clone(original.legacy) : {};
  return {
    ...existing,
    frio: {
      esquema: "cold-metadata-legacy-v1",
      migrationId: MIGRATION_ID,
      noCanonico: true,
      motivos: [...new Set(reasons)].sort(),
      raw: withoutLegacy(original),
    },
  };
}

function isMechanicalExpandedSeed(requirement) {
  const hf = finiteNumber(requirement?.horasFrio);
  if (hf === undefined || hf <= 0) {
    return { hfe: false, cp: false, complete: false };
  }
  const hfe = near(requirement?.horasFrioEfectivas, Math.round(hf * 0.82), 0.01);
  const cp = near(requirement?.porcionesFrio, Math.round(hf / 15), 0.01);
  return { hfe, cp, complete: hfe && cp };
}

function isZeroVidRequirement(document, requirement) {
  if (normalizeText(document?.cultivo) !== "VID") return false;
  return (
    hasOwn(requirement, "horasFrio") &&
    hasOwn(requirement, "horasFrioEfectivas") &&
    hasOwn(requirement, "porcionesFrio") &&
    finiteNumber(requirement.horasFrio) === 0 &&
    finiteNumber(requirement.horasFrioEfectivas) === 0 &&
    finiteNumber(requirement.porcionesFrio) === 0
  );
}

function normalizeSeedColdMetadata(document) {
  const original = document?.requerimientoFrio;
  if (!isPlainObject(original)) return { changed: false, reasons: [] };

  const mechanical = isMechanicalExpandedSeed(original);
  const zeroVid = isZeroVidRequirement(document, original);
  const legacyHfe =
    hasOwn(original, "horasFrioEfectivas") ||
    /\bHFE\b/i.test(String(original.modelo || ""));
  const reasons = [];

  if (zeroVid) reasons.push("vid_zero_triplet_without_calibration");
  if (mechanical.hfe) reasons.push("mechanical_hfe_equals_round_hf_times_0_82");
  if (mechanical.cp) reasons.push("mechanical_cp_equals_round_hf_div_15");
  if (legacyHfe) reasons.push("hfe_legacy_non_rector");

  if (!reasons.length) return { changed: false, reasons: [] };

  const next = clone(original);
  delete next.horasFrioEfectivas;

  if (zeroVid) {
    delete next.horasFrio;
    delete next.porcionesFrio;
  } else if (mechanical.complete) {
    delete next.porcionesFrio;
  }

  next.modelo = NORMALIZED_MODEL;
  next.estado = "requiere_calibracion";
  if (zeroVid || mechanical.complete) {
    next.modeloRector = "sin_calibrar";
  } else if (
    finiteNumber(next.porcionesFrio) !== undefined &&
    finiteNumber(next.porcionesFrio) > 0
  ) {
    next.modeloRector =
      next.modeloRector === "CP" || next.modeloRector === "HF"
        ? next.modeloRector
        : "CP";
  } else if (
    finiteNumber(next.horasFrio) !== undefined &&
    finiteNumber(next.horasFrio) > 0
  ) {
    next.modeloRector =
      next.modeloRector === "CP" || next.modeloRector === "HF"
        ? next.modeloRector
        : "HF";
  } else {
    next.modeloRector = "sin_calibrar";
  }
  next.confianza = next.confianza || "estimada";
  next.observaciones = appendNote(next.observaciones, NORMALIZATION_NOTE);
  next.legacy = buildLegacyBlock(original, reasons);

  return {
    changed: !valuesEqual(original, next),
    reasons,
    originalValue: clone(original),
    replacementValue: next,
    context: {
      cultivo: document.cultivo,
      variedad: document.variedad,
      fuenteBase: document.fuenteBase,
    },
  };
}

function isCanonicalDynamicDevice(cold) {
  const descriptor = `${cold?.versionModelo || ""} ${cold?.modelo || ""}`;
  return (
    cold?.estadoCalculo === "canonico" &&
    /(DYNAMIC|FISHMAN|CHILL[-_\s]?PORTION)/i.test(descriptor)
  );
}

function isLegacyHfeToCpRatio(cold) {
  const hfe = finiteNumber(cold?.horasFrioEfectivas);
  const cp = finiteNumber(cold?.porcionesFrio);
  if (hfe === undefined || cp === undefined) return false;
  return near(cp, Number((hfe / 28).toFixed(2)), 0.011);
}

function normalizeDeviceColdMetadata(document) {
  const original = document?.frioAcumulado;
  if (!isPlainObject(original)) return { changed: false, reasons: [] };

  const canonicalDynamic = isCanonicalDynamicDevice(original);
  const ratioHfe28 = isLegacyHfeToCpRatio(original);
  const hasHfe = hasOwn(original, "horasFrioEfectivas");
  const hasLegacyFactor = hasOwn(original, "factorEfectivoActual");
  const cpWithoutCanonicalModel =
    hasOwn(original, "porcionesFrio") && !canonicalDynamic;
  const simplifiedDescriptor =
    !canonicalDynamic &&
    /(SIMPLIFIC|HFE|CP)/i.test(
      `${original.modelo || ""} ${original.versionModelo || ""}`,
    );
  const reasons = [];

  if (ratioHfe28) reasons.push("device_cp_equals_hfe_div_28");
  if (hasHfe) reasons.push("device_hfe_legacy");
  if (hasLegacyFactor) reasons.push("device_effective_factor_legacy");
  if (cpWithoutCanonicalModel) {
    reasons.push("device_cp_without_canonical_dynamic_model");
  }
  if (simplifiedDescriptor) reasons.push("device_simplified_cold_model");

  if (!reasons.length) return { changed: false, reasons: [] };

  const next = clone(original);
  delete next.horasFrioEfectivas;
  delete next.factorEfectivoActual;

  if (!canonicalDynamic) {
    delete next.porcionesFrio;
    next.modelo = FIELD_PREVIEW_MODEL;
    next.versionModelo = FIELD_PREVIEW_VERSION;
    next.estadoCalculo = "preview";
    next.fuente = next.fuente || "Sensor LoRa";
  }

  next.observaciones = appendNote(
    next.observaciones,
    "El dispositivo conserva solo la vista previa HF. Utah y Chill Portions se recalculan desde la serie horaria en el motor canonico.",
  );
  next.legacy = buildLegacyBlock(original, reasons);

  return {
    changed: !valuesEqual(original, next),
    reasons,
    originalValue: clone(original),
    replacementValue: next,
    context: {
      nombre: document.nombre,
      deveui: document.deveui,
    },
  };
}

function encodeId(value) {
  if (value instanceof ObjectId) {
    return { type: "objectId", value: value.toHexString() };
  }
  return { type: typeof value, value: String(value) };
}

function decodeId(encoded) {
  if (!encoded || typeof encoded.value !== "string") {
    throw new Error("Backup invalido: identificador ausente.");
  }
  if (encoded.type === "objectId") return new ObjectId(encoded.value);
  return encoded.value;
}

function backupRowToJson(row) {
  return {
    collection: row.collection,
    field: row.field,
    id: encodeId(row.originalId),
    existed: row.existed !== false,
    originalValue: BSON.EJSON.serialize(row.originalValue, { relaxed: false }),
    replacementValue: BSON.EJSON.serialize(row.replacementValue, {
      relaxed: false,
    }),
    reasons: [...(row.reasons || [])].sort(),
    context: BSON.EJSON.serialize(row.context || {}, { relaxed: false }),
  };
}

function backupJsonToRow(entry) {
  return {
    migrationId: MIGRATION_ID,
    collection: entry.collection,
    field: entry.field,
    originalId: decodeId(entry.id),
    existed: entry.existed !== false,
    originalValue: BSON.EJSON.deserialize(entry.originalValue),
    replacementValue: BSON.EJSON.deserialize(entry.replacementValue),
    reasons: [...(entry.reasons || [])],
    context: BSON.EJSON.deserialize(entry.context || {}),
  };
}

function createBackupPayload(rows, createdAt = new Date().toISOString()) {
  const entries = rows
    .map(backupRowToJson)
    .sort((left, right) =>
      `${left.collection}:${left.id.value}`.localeCompare(
        `${right.collection}:${right.id.value}`,
      ),
    );
  const unsigned = {
    format: BACKUP_FORMAT,
    migrationId: MIGRATION_ID,
    createdAt,
    entries,
  };
  return {
    ...unsigned,
    checksumSha256: fingerprint(unsigned),
  };
}

function validateBackupPayload(payload) {
  if (!isPlainObject(payload)) throw new Error("Backup JSON invalido.");
  if (payload.format !== BACKUP_FORMAT) {
    throw new Error(`Formato de backup no soportado: ${payload.format || "sin formato"}.`);
  }
  if (payload.migrationId !== MIGRATION_ID) {
    throw new Error(`El backup pertenece a ${payload.migrationId || "otra migracion"}.`);
  }
  if (!Array.isArray(payload.entries)) {
    throw new Error("Backup invalido: entries debe ser un arreglo.");
  }
  const { checksumSha256, ...unsigned } = payload;
  if (!checksumSha256 || fingerprint(unsigned) !== checksumSha256) {
    throw new Error("Backup invalido: checksum SHA-256 no coincide.");
  }
  return payload.entries.map(backupJsonToRow);
}

function writeBackupJson(rows, backupDir) {
  const directory = path.resolve(
    backupDir ||
      process.env.CHAMAN_MIGRATION_BACKUP_DIR ||
      path.join(process.cwd(), "migration-backups"),
  );
  fs.mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(directory, `${MIGRATION_ID}-${stamp}.json`);
  const temporary = `${destination}.tmp`;
  const payload = createBackupPayload(rows);
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  fs.renameSync(temporary, destination);
  return {
    path: destination,
    checksumSha256: payload.checksumSha256,
    entries: payload.entries.length,
  };
}

function readBackupJson(backupPath) {
  const absolutePath = path.resolve(backupPath);
  const payload = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  return {
    path: absolutePath,
    rows: validateBackupPayload(payload),
    checksumSha256: payload.checksumSha256,
  };
}

async function collectionExists(db, name) {
  return (
    (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0
  );
}

async function collectChanges(db) {
  const changes = [];
  const inspected = {};
  for (const target of TARGETS) {
    if (!(await collectionExists(db, target.collection))) {
      inspected[target.collection] = 0;
      continue;
    }
    const documents = await db
      .collection(target.collection)
      .find(target.query, { projection: target.projection })
      .toArray();
    inspected[target.collection] = documents.length;
    for (const document of documents) {
      const result = target.transform(document);
      if (!result.changed) continue;
      changes.push({
        migrationId: MIGRATION_ID,
        collection: target.collection,
        field: target.field,
        originalId: document._id,
        existed: true,
        originalValue: result.originalValue,
        replacementValue: result.replacementValue,
        reasons: result.reasons,
        context: result.context,
      });
    }
  }
  return { changes, inspected };
}

function summarizeRows(rows) {
  const byCollection = {};
  const byReason = {};
  for (const row of rows) {
    byCollection[row.collection] = (byCollection[row.collection] || 0) + 1;
    for (const reason of row.reasons || []) {
      byReason[reason] = (byReason[reason] || 0) + 1;
    }
  }
  return {
    total: rows.length,
    byCollection,
    byReason,
    samples: rows.slice(0, 12).map((row) => ({
      collection: row.collection,
      id: encodeId(row.originalId).value,
      reasons: row.reasons,
      context: row.context,
    })),
  };
}

function requireConfirmation(mode, confirmation = process.env.CHAMAN_MIGRATION_CONFIRM) {
  if (confirmation !== `${MIGRATION_ID}:${mode}`) {
    throw new Error(
      `Confirmacion requerida: CHAMAN_MIGRATION_CONFIRM=${MIGRATION_ID}:${mode}`,
    );
  }
}

async function plan(db) {
  const { changes, inspected } = await collectChanges(db);
  return {
    ok: true,
    migrationId: MIGRATION_ID,
    mode: "plan",
    dryRun: true,
    writes: false,
    inspected,
    proposed: summarizeRows(changes),
    rules: {
      seedMechanicalHfe: "round(HF * 0.82)",
      seedMechanicalCp: "round(HF / 15)",
      deviceLegacyCp: "round(HFE / 28, 2)",
      canonicalDevicePreviewVersion: FIELD_PREVIEW_VERSION,
      cpPolicy:
        "No se convierte HF/HFE a CP. CP solo permanece si fue declarado y no coincide con una firma mecanica; siempre queda sujeto a calibracion.",
    },
  };
}

async function persistBackups(db, rows) {
  if (!rows.length) return;
  const now = new Date();
  await db.collection(BACKUP_COLLECTION).bulkWrite(
    rows.map((row) => ({
      updateOne: {
        filter: {
          migrationId: MIGRATION_ID,
          collection: row.collection,
          originalId: row.originalId,
          field: row.field,
        },
        update: {
          $setOnInsert: {
            ...row,
            backedAt: now,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

async function readPersistedBackups(db) {
  return await db
    .collection(BACKUP_COLLECTION)
    .find({ migrationId: MIGRATION_ID })
    .sort({ collection: 1, originalId: 1 })
    .toArray();
}

function rowValueMatches(document, row, value, shouldExist) {
  return shouldExist
    ? hasOwn(document, row.field) && valuesEqual(document[row.field], value)
    : !hasOwn(document, row.field);
}

function classifyRowState(document, row, direction) {
  if (!document) {
    return {
      state: "conflict",
      conflict: {
        collection: row.collection,
        id: encodeId(row.originalId).value,
        field: row.field,
        reason: "document_missing",
      },
    };
  }

  const sourceValue = expectedValue(row, direction);
  const sourceExists = direction === "rollback" || row.existed;
  const targetValue =
    direction === "apply" ? row.replacementValue : row.originalValue;
  const targetExists = direction === "apply" || row.existed;

  if (rowValueMatches(document, row, targetValue, targetExists)) {
    return { state: "complete" };
  }
  if (rowValueMatches(document, row, sourceValue, sourceExists)) {
    return { state: "pending" };
  }

  return {
    state: "conflict",
    conflict: {
      collection: row.collection,
      id: encodeId(row.originalId).value,
      field: row.field,
      reason: "compare_and_set_precondition_failed",
      expectedSourceFingerprint: sourceExists
        ? fingerprint(sourceValue)
        : null,
      expectedTargetFingerprint: targetExists
        ? fingerprint(targetValue)
        : null,
      currentFingerprint: hasOwn(document, row.field)
        ? fingerprint(document[row.field])
        : null,
    },
  };
}

async function inspectRows(db, rows, direction) {
  if (!["apply", "rollback"].includes(direction)) {
    throw new Error(`Direccion de inspeccion invalida: ${direction}`);
  }
  const pending = [];
  const complete = [];
  const conflicts = [];
  for (const collectionName of [...new Set(rows.map((row) => row.collection))]) {
    const collectionRows = rows.filter(
      (row) => row.collection === collectionName,
    );
    if (!(await collectionExists(db, collectionName))) {
      conflicts.push(
        ...collectionRows.map((row) => ({
          collection: collectionName,
          id: encodeId(row.originalId).value,
          field: row.field,
          reason: "collection_missing",
        })),
      );
      continue;
    }

    const fields = [...new Set(collectionRows.map((row) => row.field))];
    const projection = fields.reduce(
      (result, field) => ({ ...result, [field]: 1 }),
      {},
    );
    const documents = await db
      .collection(collectionName)
      .find(
        { _id: { $in: collectionRows.map((row) => row.originalId) } },
        { projection },
      )
      .toArray();
    const documentsById = new Map(
      documents.map((document) => [
        encodeId(document._id).value,
        document,
      ]),
    );

    for (const row of collectionRows) {
      const id = encodeId(row.originalId).value;
      const document = documentsById.get(id);
      const classification = classifyRowState(document, row, direction);
      if (classification.state === "pending") {
        pending.push(row);
      } else if (classification.state === "complete") {
        complete.push(row);
      } else {
        conflicts.push(classification.conflict);
      }
    }
  }
  return { pending, complete, conflicts };
}

async function findConflicts(db, rows, direction) {
  return (await inspectRows(db, rows, direction)).conflicts;
}

function expectedValue(row, direction) {
  return direction === "apply" ? row.originalValue : row.replacementValue;
}

function compareAndSetFilter(row, direction) {
  const expected = expectedValue(row, direction);
  const expectedExists = direction === "rollback" || row.existed;
  return {
    _id: row.originalId,
    [row.field]: expectedExists ? expected : { $exists: false },
  };
}

function migrationUpdate(row, direction) {
  if (direction === "apply") {
    return { $set: { [row.field]: row.replacementValue } };
  }
  return row.existed
    ? { $set: { [row.field]: row.originalValue } }
    : { $unset: { [row.field]: "" } };
}

async function writeRows(db, rows, direction) {
  if (!["apply", "rollback"].includes(direction)) {
    throw new Error(`Direccion de escritura invalida: ${direction}`);
  }
  const inspection = await inspectRows(db, rows, direction);
  if (inspection.conflicts.length) {
    throw new MigrationWriteConflictError(
      direction,
      inspection.conflicts,
      0,
    );
  }

  let matched = 0;
  let modified = 0;
  let alreadyComplete = inspection.complete.length;
  for (const collectionName of [
    ...new Set(inspection.pending.map((row) => row.collection)),
  ]) {
    const collectionRows = inspection.pending.filter(
      (row) => row.collection === collectionName,
    );
    if (!collectionRows.length) continue;
    const collection = db.collection(collectionName);
    for (const row of collectionRows) {
      let result;
      try {
        result = await collection.updateOne(
          compareAndSetFilter(row, direction),
          migrationUpdate(row, direction),
        );
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          error.processed === undefined
        ) {
          error.processed = modified;
        }
        throw error;
      }
      const matchedCount = Number(result?.matchedCount || 0);
      const modifiedCount = Number(result?.modifiedCount || 0);
      if (matchedCount !== 1 || modifiedCount !== 1) {
        const current = await collection.findOne(
          { _id: row.originalId },
          { projection: { [row.field]: 1 } },
        );
        const classification = classifyRowState(current, row, direction);
        if (classification.state === "complete") {
          alreadyComplete += 1;
          continue;
        }
        throw new MigrationWriteConflictError(
          direction,
          [
            classification.conflict || {
              collection: collectionName,
              id: encodeId(row.originalId).value,
              field: row.field,
              reason:
                matchedCount !== 1
                  ? "compare_and_set_mismatch"
                  : "compare_and_set_not_modified",
              expectedFingerprint: fingerprint(expectedValue(row, direction)),
            },
          ],
          modified,
        );
      }
      matched += matchedCount;
      modified += modifiedCount;
    }
  }
  return {
    attempted: rows.length,
    matched,
    modified,
    alreadyComplete,
    completed: modified + alreadyComplete,
    conflicts: [],
  };
}

async function recordWriteFailure(manifest, mode, error) {
  const prefix = mode === "apply" ? "apply" : "rollback";
  const failure = {
    code: error?.code || "MIGRATION_WRITE_FAILED",
    message: String(error?.message || error).slice(0, 1200),
    conflicts: Array.isArray(error?.conflicts)
      ? error.conflicts.slice(0, 25)
      : [],
    processed: Number(error?.processed || 0),
  };
  try {
    const update = {
      $set: {
        status: mode === "apply" ? "apply_failed" : "rollback_failed",
        [`${prefix}FailedAt`]: new Date(),
        [`${prefix}Failure`]: failure,
      },
    };
    if (mode === "apply") {
      update.$unset = { applyingAt: "" };
    }
    await manifest.updateOne(
      { migrationId: MIGRATION_ID },
      update,
      { upsert: true },
    );
  } catch {
    // La falla original de compare-and-set debe conservarse aunque el
    // manifiesto no pueda registrar el diagnostico.
  }
}

async function apply(db, options = {}) {
  requireConfirmation("apply", options.confirmation);
  const manifest = db.collection(MANIFEST_COLLECTION);
  const previous = await manifest.findOne({
    migrationId: MIGRATION_ID,
    status: "applied",
  });
  if (previous) {
    return {
      ok: true,
      migrationId: MIGRATION_ID,
      mode: "apply",
      alreadyApplied: true,
      appliedAt: previous.appliedAt,
      changed: previous.changed || 0,
      backupPath: previous.backupPath,
    };
  }

  const { changes, inspected } = await collectChanges(db);
  await persistBackups(db, changes);
  const rows = await readPersistedBackups(db);
  const conflicts = await findConflicts(db, rows, "apply");
  if (conflicts.length) {
    throw new Error(
      `Apply cancelado: ${conflicts.length} documento(s) cambiaron despues del backup. Ejecutar rollback o revisar manualmente. ${JSON.stringify(conflicts.slice(0, 10))}`,
    );
  }

  const backup = writeBackupJson(rows, options.backupDir);
  await manifest.updateOne(
    { migrationId: MIGRATION_ID },
    {
      $set: {
        migrationId: MIGRATION_ID,
        status: "applying",
        applyingAt: new Date(),
        inspected,
        changed: rows.length,
        backupPath: backup.path,
        backupChecksumSha256: backup.checksumSha256,
      },
    },
    { upsert: true },
  );

  let writeResult;
  try {
    writeResult = await writeRows(db, rows, "apply");
  } catch (error) {
    await recordWriteFailure(manifest, "apply", error);
    throw error;
  }
  const result = {
    ok: true,
    migrationId: MIGRATION_ID,
    mode: "apply",
    changed: writeResult.completed,
    modifiedThisRun: writeResult.modified,
    alreadyAppliedRows: writeResult.alreadyComplete,
    resumed: writeResult.alreadyComplete > 0,
    summary: summarizeRows(rows),
    backupPath: backup.path,
    backupChecksumSha256: backup.checksumSha256,
  };
  await manifest.updateOne(
    { migrationId: MIGRATION_ID },
    {
      $set: {
        status: "applied",
        appliedAt: new Date(),
        result,
      },
      $unset: { applyingAt: "" },
    },
  );
  return result;
}

async function rollback(db, options = {}) {
  requireConfirmation("rollback", options.confirmation);
  const backupFromFile = options.backupPath
    ? readBackupJson(options.backupPath)
    : undefined;
  const rows = backupFromFile?.rows || (await readPersistedBackups(db));
  if (!rows.length) {
    throw new Error(
      "No existe backup para restaurar. Indicar --backup=<archivo.json> o verificar migration_backup_items.",
    );
  }

  const conflicts = await findConflicts(db, rows, "rollback");
  if (conflicts.length) {
    const forceNote = options.forceConflicts
      ? " --force-conflicts no puede omitir la precondicion atomica de seguridad."
      : "";
    throw new Error(
      `Rollback cancelado: ${conflicts.length} documento(s) no conservan exactamente el valor aplicado.${forceNote} ${JSON.stringify(conflicts.slice(0, 10))}`,
    );
  }
  const manifest = db.collection(MANIFEST_COLLECTION);
  let writeResult;
  try {
    writeResult = await writeRows(db, rows, "rollback");
  } catch (error) {
    await recordWriteFailure(manifest, "rollback", error);
    throw error;
  }
  const result = {
    ok: true,
    migrationId: MIGRATION_ID,
    mode: "rollback",
    restored: writeResult.completed,
    modifiedThisRun: writeResult.modified,
    alreadyRestoredRows: writeResult.alreadyComplete,
    resumed: writeResult.alreadyComplete > 0,
    forcedConflicts: 0,
    backupPath: backupFromFile?.path,
    backupChecksumSha256: backupFromFile?.checksumSha256,
  };
  await manifest.updateOne(
    { migrationId: MIGRATION_ID },
    {
      $set: {
        status: "rolled_back",
        rolledBackAt: new Date(),
        rollbackResult: result,
      },
    },
    { upsert: true },
  );
  return result;
}

function parseArgs(argv) {
  const args = [...argv];
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const mode = positional[0] || "plan";
  if (!["plan", "apply", "rollback"].includes(mode)) {
    throw new Error("Modo valido: plan | apply | rollback");
  }
  if (positional.length > 1) {
    throw new Error(`Argumento posicional no reconocido: ${positional[1]}`);
  }

  let backupPath;
  let backupDir;
  let forceConflicts = false;
  for (const arg of args.filter((value) => value.startsWith("--"))) {
    if (arg.startsWith("--backup=")) {
      backupPath = arg.slice("--backup=".length);
      continue;
    }
    if (arg.startsWith("--backup-dir=")) {
      backupDir = arg.slice("--backup-dir=".length);
      continue;
    }
    if (arg === "--force-conflicts") {
      forceConflicts = true;
      continue;
    }
    throw new Error(`Opcion no reconocida: ${arg}`);
  }
  if (forceConflicts && mode !== "rollback") {
    throw new Error("--force-conflicts solo se admite en rollback.");
  }
  if (backupPath && mode !== "rollback") {
    throw new Error("--backup solo se admite en rollback.");
  }
  if (backupDir && mode !== "apply") {
    throw new Error("--backup-dir solo se admite en apply.");
  }
  return { mode, backupPath, backupDir, forceConflicts };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!DB_URL) {
    throw new Error(
      "Falta MONGO_URI/MONGO_URL/MONGO_PUBLIC_URL/DATABASE_URL/DB_URL.",
    );
  }
  const client = new MongoClient(DB_URL, {
    serverSelectionTimeoutMS: Number(
      process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000,
    ),
  });
  await client.connect();
  try {
    const db = client.db(DB_NAME);
    const result =
      options.mode === "plan"
        ? await plan(db)
        : options.mode === "apply"
          ? await apply(db, options)
          : await rollback(db, options);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.close();
  }
}

module.exports = {
  BACKUP_FORMAT,
  FIELD_PREVIEW_MODEL,
  FIELD_PREVIEW_VERSION,
  MIGRATION_ID,
  MigrationWriteConflictError,
  NORMALIZED_MODEL,
  apply,
  compareAndSetFilter,
  createBackupPayload,
  isCanonicalDynamicDevice,
  isLegacyHfeToCpRatio,
  isMechanicalExpandedSeed,
  normalizeDeviceColdMetadata,
  normalizeSeedColdMetadata,
  parseArgs,
  plan,
  readBackupJson,
  requireConfirmation,
  resolveDbUrl,
  rollback,
  validateBackupPayload,
  valuesEqual,
  writeRows,
  writeBackupJson,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`[${MIGRATION_ID}]`, error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
