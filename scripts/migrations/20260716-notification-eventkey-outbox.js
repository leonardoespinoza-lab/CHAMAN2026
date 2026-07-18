const crypto = require("node:crypto");
const { MongoClient } = require("../../sdc-datos/node_modules/mongodb");

const MIGRATION_ID = "20260716-notification-eventkey-outbox-v1";
const COLLECTION = process.env.NOTIFICATION_COLLECTION || "notificacions";
const BACKUP_COLLECTION = "migration_notification_eventkey_backups";

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

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function identity(idUsuario, eventKey) {
  return crypto
    .createHash("sha256")
    .update(`${idUsuario}\u0000${eventKey}`)
    .digest("hex");
}

function compareDocuments(left, right) {
  const leftDate = new Date(left.fechaCreacion || 0).getTime();
  const rightDate = new Date(right.fechaCreacion || 0).getTime();
  if (leftDate !== rightDate) return leftDate - rightDate;
  return String(left._id).localeCompare(String(right._id));
}

/**
 * Solo promueve una fila por usuario+evento. Las copias historicas se
 * conservan legibles, pero quedan fuera del indice parcial unico.
 */
function buildPlan(candidates, canonicalIdentities = new Set()) {
  const groups = new Map();
  const invalid = [];

  for (const document of candidates || []) {
    const idUsuario = text(document?.tenant?.idUsuario);
    const eventKey = text(document?.data?.eventKey);
    if (!idUsuario || !eventKey || eventKey.length > 512) {
      invalid.push(document?._id);
      continue;
    }
    const key = identity(idUsuario, eventKey);
    const current = groups.get(key) || [];
    current.push(document);
    groups.set(key, current);
  }

  const updates = [];
  const duplicates = [];
  for (const [key, documents] of groups) {
    const ordered = [...documents].sort(compareDocuments);
    if (!canonicalIdentities.has(key)) {
      const canonical = ordered.shift();
      updates.push({
        _id: canonical._id,
        idUsuario: text(canonical.tenant.idUsuario),
        eventKey: text(canonical.data.eventKey),
      });
    }
    duplicates.push(...ordered.map((document) => document._id));
  }

  return {
    updates,
    duplicates,
    invalid,
    groups: groups.size,
  };
}

async function loadPlan(db) {
  const collection = db.collection(COLLECTION);
  const [candidates, canonical] = await Promise.all([
    collection
      .find(
        {
          eventKey: { $exists: false },
          "data.eventKey": { $type: "string" },
          "tenant.idUsuario": { $type: "string" },
        },
        {
          projection: {
            _id: 1,
            fechaCreacion: 1,
            tenant: 1,
            "data.eventKey": 1,
          },
        },
      )
      .toArray(),
    collection
      .find(
        {
          eventKey: { $type: "string" },
          "tenant.idUsuario": { $type: "string" },
        },
        { projection: { eventKey: 1, "tenant.idUsuario": 1 } },
      )
      .toArray(),
  ]);
  const canonicalIdentities = new Set(
    canonical.map((document) =>
      identity(text(document.tenant.idUsuario), text(document.eventKey)),
    ),
  );
  return buildPlan(candidates, canonicalIdentities);
}

async function apply(db, plan) {
  const collection = db.collection(COLLECTION);
  const backups = db.collection(BACKUP_COLLECTION);
  await backups.createIndex(
    { migrationId: 1, documentId: 1 },
    { unique: true, name: "uniq_notification_eventkey_backup" },
  );

  let modified = 0;
  for (const update of plan.updates) {
    await backups.updateOne(
      { migrationId: MIGRATION_ID, documentId: update._id },
      {
        $setOnInsert: {
          migrationId: MIGRATION_ID,
          documentId: update._id,
          eventKey: update.eventKey,
          backedUpAt: new Date(),
        },
      },
      { upsert: true },
    );
    const result = await collection.updateOne(
      {
        _id: update._id,
        eventKey: { $exists: false },
        "tenant.idUsuario": update.idUsuario,
        "data.eventKey": update.eventKey,
      },
      { $set: { eventKey: update.eventKey } },
    );
    if (result.modifiedCount !== 1) {
      throw new Error(
        `Compare-and-set fallo para la notificacion ${String(update._id)}`,
      );
    }
    modified += 1;
  }
  return modified;
}

async function rollback(db) {
  const collection = db.collection(COLLECTION);
  const backups = db.collection(BACKUP_COLLECTION);
  const rows = await backups.find({ migrationId: MIGRATION_ID }).toArray();
  let modified = 0;
  for (const row of rows) {
    const result = await collection.updateOne(
      { _id: row.documentId, eventKey: row.eventKey },
      { $unset: { eventKey: "" } },
    );
    modified += result.modifiedCount;
  }
  return { backedUp: rows.length, modified };
}

async function main() {
  const command = String(process.argv[2] || "plan").toLowerCase();
  if (!["plan", "apply", "rollback"].includes(command)) {
    throw new Error("Uso: node 20260716-notification-eventkey-outbox.js plan|apply|rollback");
  }
  const url = resolveDbUrl();
  if (!url) throw new Error("Falta MONGO_URI/MONGO_URL para la migracion");
  const client = new MongoClient(url);
  await client.connect();
  try {
    const db = client.db(process.env.DB_NAME || "chaman");
    if (command === "rollback") {
      console.log(JSON.stringify({ command, ...(await rollback(db)) }, null, 2));
      return;
    }
    const plan = await loadPlan(db);
    const summary = {
      command,
      collection: COLLECTION,
      groups: plan.groups,
      promote: plan.updates.length,
      legacyDuplicatesPreserved: plan.duplicates.length,
      invalidSkipped: plan.invalid.length,
    };
    if (command === "plan") {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    const modified = await apply(db, plan);
    console.log(JSON.stringify({ ...summary, modified }, null, 2));
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  MIGRATION_ID,
  buildPlan,
  compareDocuments,
  identity,
  resolveDbUrl,
};
