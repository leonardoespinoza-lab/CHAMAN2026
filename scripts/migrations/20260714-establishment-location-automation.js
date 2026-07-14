const { MongoClient } = require('../../sdc-datos/node_modules/mongodb');

const MIGRATION_ID = '20260714-establishment-location-automation-v1';
const DB_URL =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL ||
  process.env.DB_URL ||
  '';
const DB_NAME = process.env.DB_NAME || 'chaman';
const MANIFEST_COLLECTION = 'migration_manifests';
const HISTORY_COLLECTION = 'establishment_administrative_locations';
const INDEXES = [
  {
    key: { resolutionKey: 1 },
    options: { unique: true, name: 'establishment_resolution_key' },
  },
  {
    key: {
      establecimientoId: 1,
      geometryHash: 1,
      sourceVersion: 1,
      resolverVersion: 1,
    },
    options: { name: 'establishment_geometry_source_resolver' },
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
    await db.listCollections({ name }, { nameOnly: true }).toArray()
  ).length > 0;
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
  if (indexes.some((item) => sameKey(item.key, definition.key))) return;
  await collection.createIndex(definition.key, definition.options);
}

async function plan(db) {
  const establishments = db.collection('establecimientos');
  const legacyCandidates = await establishments.countDocuments({
    ubicacionAdministrativa: { $exists: true, $ne: null },
    ubicacionAdministrativaLegada: { $exists: false },
  });
  const historyExists = await exists(db, HISTORY_COLLECTION);
  console.log(
    JSON.stringify(
      {
        migrationId: MIGRATION_ID,
        mode: 'plan',
        legacyCandidates,
        history: {
          exists: historyExists,
          documents: historyExists
            ? await db.collection(HISTORY_COLLECTION).countDocuments()
            : 0,
          requiredIndexes: INDEXES.map((item) => item.options.name),
        },
        note: 'La referencia manual se copia como legado de solo lectura; no se elimina ni se usa como fuente oficial.',
      },
      null,
      2,
    ),
  );
}

async function apply(db) {
  requireConfirmation('apply');
  const manifest = db.collection(MANIFEST_COLLECTION);
  if (await manifest.findOne({ migrationId: MIGRATION_ID, status: 'applied' })) {
    console.log(
      JSON.stringify({ migrationId: MIGRATION_ID, status: 'already_applied' }, null, 2),
    );
    return;
  }

  const createdCollection = !(await exists(db, HISTORY_COLLECTION));
  if (createdCollection) await db.createCollection(HISTORY_COLLECTION);
  for (const index of INDEXES) {
    await ensureIndex(db.collection(HISTORY_COLLECTION), index);
  }

  const now = new Date().toISOString();
  const result = await db.collection('establecimientos').updateMany(
    {
      ubicacionAdministrativa: { $exists: true, $ne: null },
      ubicacionAdministrativaLegada: { $exists: false },
    },
    [
      {
        $set: {
          ubicacionAdministrativaLegada: {
            valor: '$ubicacionAdministrativa',
            origen: 'desconocido',
            fechaPreservacion: now,
            soloLectura: true,
            migracionId: MIGRATION_ID,
          },
        },
      },
    ],
  );

  await manifest.updateOne(
    { migrationId: MIGRATION_ID },
    {
      $set: {
        migrationId: MIGRATION_ID,
        status: 'applied',
        appliedAt: new Date(),
        createdCollection,
        legacyPreserved: result.modifiedCount,
      },
    },
    { upsert: true },
  );
  console.log(
    JSON.stringify(
      {
        migrationId: MIGRATION_ID,
        status: 'applied',
        createdCollection,
        legacyPreserved: result.modifiedCount,
      },
      null,
      2,
    ),
  );
}

async function rollback(db) {
  requireConfirmation('rollback');
  const manifest = db.collection(MANIFEST_COLLECTION);
  const applied = await manifest.findOne({ migrationId: MIGRATION_ID });
  const legacyRollback = await db.collection('establecimientos').updateMany(
    { 'ubicacionAdministrativaLegada.migracionId': MIGRATION_ID },
    { $unset: { ubicacionAdministrativaLegada: '' } },
  );
  let historyAction = 'absent';
  if (await exists(db, HISTORY_COLLECTION)) {
    const history = db.collection(HISTORY_COLLECTION);
    for (const definition of INDEXES) {
      const indexes = await history.indexes();
      if (indexes.some((item) => item.name === definition.options.name)) {
        await history.dropIndex(definition.options.name);
      }
    }
    if (applied?.createdCollection && (await history.countDocuments()) === 0) {
      await history.drop();
      historyAction = 'dropped_empty';
    } else {
      historyAction = 'preserved_with_data';
    }
  }
  await manifest.updateOne(
    { migrationId: MIGRATION_ID },
    {
      $set: {
        status: 'rolled_back',
        rolledBackAt: new Date(),
        legacyRollback: legacyRollback.modifiedCount,
        historyAction,
      },
    },
    { upsert: true },
  );
  console.log(
    JSON.stringify(
      {
        migrationId: MIGRATION_ID,
        status: 'rolled_back',
        legacyRollback: legacyRollback.modifiedCount,
        historyAction,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const mode = process.argv[2] || 'plan';
  if (!['plan', 'apply', 'rollback'].includes(mode)) {
    throw new Error('Modo valido: plan | apply | rollback');
  }
  if (!DB_URL) throw new Error('Falta MONGO_URI/MONGO_URL/DATABASE_URL/DB_URL.');
  const client = new MongoClient(DB_URL);
  await client.connect();
  try {
    const db = client.db(DB_NAME);
    if (mode === 'plan') await plan(db);
    if (mode === 'apply') await apply(db);
    if (mode === 'rollback') await rollback(db);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
