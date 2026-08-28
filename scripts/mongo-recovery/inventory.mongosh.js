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
      // Conservar el documento completo de listIndexes/getIndexes. La normalizacion
      // elimina exclusivamente metadatos de servidor conocidos (v/ns).
      indexes: collection.getIndexes(),
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
