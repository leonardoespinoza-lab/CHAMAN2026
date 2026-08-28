const fs = require('fs');
const uriFile = process.env.CHAMAN_RECOVERY_URI_FILE;
const databaseName = process.env.CHAMAN_RECOVERY_DATABASE;
const drillId = process.env.CHAMAN_RECOVERY_DRILL_ID;
const confirmation = process.env.CHAMAN_RECOVERY_DROP_CONFIRM;

if (!uriFile || !databaseName || !drillId || !confirmation) throw new Error('Faltan variables internas de cleanup.');
const uri = fs.readFileSync(uriFile, 'utf8');
if (!databaseName.startsWith('chaman_restore_drill_')) throw new Error('Destino no descartable.');
if (confirmation !== `cleanup:${drillId}:${databaseName}`) throw new Error('Confirmacion interna invalida.');

const connection = new Mongo(uri);
const database = connection.getDB(databaseName);
if (database.getName() !== databaseName) throw new Error('La base conectada no coincide con la solicitada.');
const result = database.dropDatabase();
if (result.ok !== 1) throw new Error('dropDatabase no fue confirmado por MongoDB.');
print(JSON.stringify({ ok: true, database: databaseName }));
connection.close();
