const uri = process.env.CHAMAN_RECOVERY_URI;
const databaseName = process.env.CHAMAN_RECOVERY_DATABASE;
const drillId = process.env.CHAMAN_RECOVERY_DRILL_ID;
const confirmation = process.env.CHAMAN_RECOVERY_DROP_CONFIRM;

if (!uri || !databaseName || !drillId || !confirmation) throw new Error('Faltan variables internas de cleanup.');
if (!databaseName.startsWith('chaman_restore_drill_')) throw new Error('Destino no descartable.');
if (confirmation !== `cleanup:${drillId}:${databaseName}`) throw new Error('Confirmacion interna invalida.');

const connection = new Mongo(uri);
const database = connection.getDB(databaseName);
if (database.getName() !== databaseName) throw new Error('La base conectada no coincide con la solicitada.');
const result = database.dropDatabase();
if (result.ok !== 1) throw new Error('dropDatabase no fue confirmado por MongoDB.');
print(JSON.stringify({ ok: true, database: databaseName }));
connection.close();
