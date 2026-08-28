const uri = process.env.CHAMAN_RECOVERY_URI;
const databaseName = process.env.CHAMAN_RECOVERY_DATABASE;

if (!uri || !databaseName) throw new Error('Faltan variables internas del inventario.');

const connection = new Mongo(uri);
const database = connection.getDB(databaseName);
if (database.getName() !== databaseName) throw new Error('La base conectada no coincide con la solicitada.');

const buildInfo = database.adminCommand({ buildInfo: 1 });
if (buildInfo.ok !== 1) throw new Error('No se pudo leer buildInfo.');

const collections = database
  .getCollectionInfos({}, { nameOnly: false })
  .filter((item) => !String(item.name || '').startsWith('system.'))
  .sort((left, right) => left.name.localeCompare(right.name))
  .map((item) => {
    if (item.type === 'view') {
      return { name: item.name, type: 'view', options: item.options || {}, indexes: [] };
    }
    const collection = database.getCollection(item.name);
    return {
      name: item.name,
      type: 'collection',
      options: item.options || {},
      count: collection.countDocuments({}),
      indexes: collection
        .getIndexes()
        .map((index) => ({
          name: index.name,
          key: index.key,
          unique: index.unique === true,
          sparse: index.sparse === true,
          ...(index.expireAfterSeconds == null ? {} : { expireAfterSeconds: index.expireAfterSeconds }),
          ...(index.partialFilterExpression == null
            ? {}
            : { partialFilterExpression: index.partialFilterExpression }),
          ...(index.collation == null ? {} : { collation: index.collation }),
        })),
    };
  });

print(
  JSON.stringify({
    schemaVersion: 1,
    database: databaseName,
    serverVersion: buildInfo.version,
    capturedAt: new Date().toISOString(),
    collections,
  }),
);

connection.close();
