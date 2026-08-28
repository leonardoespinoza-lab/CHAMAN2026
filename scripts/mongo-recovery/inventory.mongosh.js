const fs = require('fs');
const uriFile = process.env.CHAMAN_RECOVERY_URI_FILE;
const databaseName = process.env.CHAMAN_RECOVERY_DATABASE;

if (!uriFile || !databaseName) throw new Error('Faltan variables internas del inventario.');
const uri = fs.readFileSync(uriFile, 'utf8');

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
          hidden: index.hidden === true,
          ...(index.expireAfterSeconds == null ? {} : { expireAfterSeconds: index.expireAfterSeconds }),
          ...(index.partialFilterExpression == null
            ? {}
            : { partialFilterExpression: index.partialFilterExpression }),
          ...(index.collation == null ? {} : { collation: index.collation }),
          ...(index.wildcardProjection == null ? {} : { wildcardProjection: index.wildcardProjection }),
          ...(index.weights == null ? {} : { weights: index.weights }),
          ...Object.fromEntries(
            [
              'default_language',
              'language_override',
              'textIndexVersion',
              '2dsphereIndexVersion',
              'bits',
              'min',
              'max',
              'bucketSize',
              'storageEngine',
            ]
              .filter((key) => index[key] != null)
              .map((key) => [key, index[key]]),
          ),
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
