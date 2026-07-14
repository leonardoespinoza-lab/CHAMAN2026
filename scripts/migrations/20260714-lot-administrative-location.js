const { MongoClient } = require('../../sdc-datos/node_modules/mongodb');

const MIGRATION_ID = '20260714-lot-administrative-location-v1';
const DB_URL =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL ||
  process.env.DB_URL ||
  '';
const DB_NAME = process.env.DB_NAME || 'chaman';
const MANIFEST_COLLECTION = 'migration_manifests';

const DEFINITIONS = {
  georef_catalog_entities: [
    { key: { snapshotId: 1, resource: 1, entityId: 1 }, options: { unique: true, name: 'snapshot_resource_entity' } },
    { key: { geometry: '2dsphere' }, options: { name: 'catalog_geometry_2dsphere' } },
    { key: { snapshotId: 1, resource: 1, 'province.id': 1 }, options: { name: 'snapshot_resource_province' } },
  ],
  georef_catalog_snapshots: [
    { key: { snapshotId: 1 }, options: { unique: true, name: 'snapshot_id' } },
    { key: { status: 1, activatedAt: -1 }, options: { name: 'snapshot_status_activation' } },
  ],
  georef_catalog_state: [],
  lot_administrative_locations: [
    { key: { resolutionKey: 1 }, options: { unique: true, name: 'resolution_key' } },
    { key: { loteId: 1, isCurrent: 1 }, options: { name: 'lot_current_location' } },
    {
      key: { loteId: 1, geometryHash: 1, sourceVersion: 1, resolverVersion: 1 },
      options: { name: 'lot_geometry_source_resolver' },
    },
  ],
  lot_administrative_intersections: [
    {
      key: { resolutionKey: 1, recurso: 1, entityId: 1 },
      options: { unique: true, name: 'resolution_resource_entity' },
    },
    { key: { loteId: 1, recurso: 1 }, options: { name: 'lot_intersection_resource' } },
  ],
};

function requireConfirmation(mode) {
  if (process.env.CHAMAN_MIGRATION_CONFIRM !== `${MIGRATION_ID}:${mode}`) {
    throw new Error(`Confirmacion requerida: CHAMAN_MIGRATION_CONFIRM=${MIGRATION_ID}:${mode}`);
  }
}

async function exists(db, name) {
  return (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
}

function sameKey(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

async function ensureIndex(collection, definition) {
  const indexes = await collection.indexes();
  const sameName = indexes.find((item) => item.name === definition.options.name);
  if (sameName) {
    if (!sameKey(sameName.key, definition.key) || Boolean(sameName.unique) !== Boolean(definition.options.unique)) {
      throw new Error(`Indice incompatible: ${collection.collectionName}.${definition.options.name}`);
    }
    return;
  }
  const equivalent = indexes.find((item) => sameKey(item.key, definition.key));
  if (equivalent) return;
  await collection.createIndex(definition.key, definition.options);
}

async function plan(db) {
  const collections = {};
  for (const [name, indexes] of Object.entries(DEFINITIONS)) {
    const present = await exists(db, name);
    collections[name] = {
      exists: present,
      documents: present ? await db.collection(name).countDocuments() : 0,
      currentIndexes: present ? (await db.collection(name).indexes()).map((item) => item.name) : [],
      requiredIndexes: indexes.map((item) => item.options.name),
    };
  }
  console.log(JSON.stringify({ migrationId: MIGRATION_ID, mode: 'plan', collections }, null, 2));
}

async function apply(db) {
  requireConfirmation('apply');
  const manifest = db.collection(MANIFEST_COLLECTION);
  if (await manifest.findOne({ migrationId: MIGRATION_ID, status: 'applied' })) {
    console.log(JSON.stringify({ migrationId: MIGRATION_ID, status: 'already_applied' }, null, 2));
    return;
  }
  const createdCollections = [];
  for (const [name, indexes] of Object.entries(DEFINITIONS)) {
    if (!(await exists(db, name))) {
      await db.createCollection(name);
      createdCollections.push(name);
    }
    for (const index of indexes) await ensureIndex(db.collection(name), index);
  }
  await manifest.updateOne(
    { migrationId: MIGRATION_ID },
    { $set: { migrationId: MIGRATION_ID, status: 'applied', appliedAt: new Date(), createdCollections } },
    { upsert: true },
  );
  console.log(JSON.stringify({ migrationId: MIGRATION_ID, status: 'applied', createdCollections }, null, 2));
}

async function rollback(db) {
  requireConfirmation('rollback');
  const manifest = db.collection(MANIFEST_COLLECTION);
  const applied = await manifest.findOne({ migrationId: MIGRATION_ID });
  const preservedCollections = [];
  const droppedCollections = [];
  for (const [name, definitions] of Object.entries(DEFINITIONS)) {
    if (!(await exists(db, name))) continue;
    const collection = db.collection(name);
    const indexes = await collection.indexes();
    for (const definition of definitions) {
      if (indexes.some((item) => item.name === definition.options.name)) {
        await collection.dropIndex(definition.options.name);
      }
    }
    const wasCreated = applied?.createdCollections?.includes(name);
    if (wasCreated && (await collection.countDocuments()) === 0) {
      await collection.drop();
      droppedCollections.push(name);
    } else {
      preservedCollections.push(name);
    }
  }
  await manifest.updateOne(
    { migrationId: MIGRATION_ID },
    {
      $set: {
        status: 'rolled_back',
        rolledBackAt: new Date(),
        droppedCollections,
        preservedCollections,
      },
    },
    { upsert: true },
  );
  console.log(
    JSON.stringify(
      {
        migrationId: MIGRATION_ID,
        status: 'rolled_back',
        droppedCollections,
        preservedCollections,
        note: preservedCollections.length
          ? 'Se preservaron colecciones con datos para evitar perdida de snapshots o resoluciones.'
          : undefined,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const mode = process.argv[2] || 'plan';
  if (!['plan', 'apply', 'rollback'].includes(mode)) throw new Error('Modo valido: plan | apply | rollback');
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
