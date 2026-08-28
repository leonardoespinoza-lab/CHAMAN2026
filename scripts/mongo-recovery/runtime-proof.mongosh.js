const fs = require('fs');

const uriFile = process.env.CHAMAN_RECOVERY_URI_FILE;
const databaseName = process.env.CHAMAN_RECOVERY_DATABASE;
if (!uriFile || !databaseName) throw new Error('Faltan variables internas de runtime proof.');

const uri = fs.readFileSync(uriFile, 'utf8').trim();
const connection = new Mongo(uri);
const database = connection.getDB(databaseName);
if (database.getName() !== databaseName) throw new Error('La base conectada no coincide con la solicitada.');

const hello = database.adminCommand({ hello: 1 });
const buildInfo = database.adminCommand({ buildInfo: 1 });
const commandLine = database.adminCommand({ getCmdLineOpts: 1 });
const serverStatus = database.adminCommand({ serverStatus: 1 });
for (const [name, result] of Object.entries({ hello, buildInfo, commandLine, serverStatus })) {
  if (result.ok !== 1) throw new Error(`${name} no fue confirmado por MongoDB.`);
}
const processId = Number(serverStatus.pid);
if (!Number.isSafeInteger(processId) || processId < 1) {
  throw new Error('serverStatus.pid no puede convertirse a un entero seguro.');
}

print(JSON.stringify({
  schemaVersion: 1,
  database: databaseName,
  capturedAt: new Date().toISOString(),
  hello: {
    setName: hello.setName,
    me: hello.me,
    primary: hello.primary,
    hosts: hello.hosts || [],
    passives: hello.passives || [],
    arbiters: hello.arbiters || [],
    isWritablePrimary: hello.isWritablePrimary === true,
  },
  buildInfo: { version: buildInfo.version },
  commandLine: {
    net: commandLine.parsed?.net || {},
    replication: commandLine.parsed?.replication || {},
    storage: commandLine.parsed?.storage || {},
  },
  serverStatus: { process: serverStatus.process, pid: processId },
}));

connection.close();
