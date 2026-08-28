const fs = require('fs');
const uriFile = process.env.CHAMAN_RECOVERY_URI_FILE;
const databaseName = process.env.CHAMAN_RECOVERY_DATABASE;
const drillId = process.env.CHAMAN_RECOVERY_DRILL_ID;
const confirmation = process.env.CHAMAN_RECOVERY_DROP_CONFIRM;
const expectedProcessId = Number(process.env.CHAMAN_RECOVERY_EXPECTED_PID);

if (!uriFile || !databaseName || !drillId || !confirmation ||
    !Number.isSafeInteger(expectedProcessId) || expectedProcessId < 1) {
  throw new Error('Faltan variables internas de cleanup.');
}
const uri = fs.readFileSync(uriFile, 'utf8');
if (!databaseName.startsWith('chaman_restore_drill_')) throw new Error('Destino no descartable.');
if (confirmation !== `cleanup:${drillId}:${databaseName}`) throw new Error('Confirmacion interna invalida.');

const connection = new Mongo(uri);
const database = connection.getDB(databaseName);
if (database.getName() !== databaseName) throw new Error('La base conectada no coincide con la solicitada.');
const runtime = database.adminCommand({ serverStatus: 1 });
if (runtime.ok !== 1 || runtime.process !== 'mongod' || runtime.pid !== expectedProcessId) {
  throw new Error('El proceso MongoDB cambio antes del drop; cleanup cancelado.');
}
const result = database.dropDatabase();
if (result.ok !== 1) throw new Error('dropDatabase no fue confirmado por MongoDB.');
const rescan = connection.getDB('admin').adminCommand({ listDatabases: 1, nameOnly: true });
if (rescan.ok !== 1) throw new Error('No se pudo reescanear bases luego del drop.');
const rescanFound = (rescan.databases || []).some((item) => item.name === databaseName);
if (rescanFound) throw new Error('La base descartable sigue presente despues del drop.');
print(JSON.stringify({ ok: true, database: databaseName, rescanFound }));
connection.close();
