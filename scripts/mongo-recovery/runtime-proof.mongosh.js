const fs = require('fs');

const uriFile = process.env.CHAMAN_RECOVERY_URI_FILE;
const databaseName = process.env.CHAMAN_RECOVERY_DATABASE;
const runtimePurpose = process.env.CHAMAN_RECOVERY_RUNTIME_PURPOSE || 'operation';
if (!uriFile || !databaseName) throw new Error('Faltan variables internas de runtime proof.');
if (!['operation', 'cleanup'].includes(runtimePurpose)) throw new Error('Proposito interno de runtime proof invalido.');

const uri = fs.readFileSync(uriFile, 'utf8').trim();
const connection = new Mongo(uri);
const database = connection.getDB(databaseName);
if (database.getName() !== databaseName) throw new Error('La base conectada no coincide con la solicitada.');

const hello = database.adminCommand({ hello: 1 });
const buildInfo = database.adminCommand({ buildInfo: 1 });
const commandLine = database.adminCommand({ getCmdLineOpts: 1 });
const serverStatus = database.adminCommand({ serverStatus: 1 });
const getParameter = database.adminCommand({ getParameter: 1, ttlMonitorEnabled: 1 });
for (const [name, result] of Object.entries({ hello, buildInfo, commandLine, serverStatus, getParameter })) {
  if (result.ok !== 1) throw new Error(`${name} no fue confirmado por MongoDB.`);
}
if (typeof getParameter.ttlMonitorEnabled !== 'boolean') {
  throw new Error('getParameter.ttlMonitorEnabled no devolvio un booleano.');
}
if (runtimePurpose !== 'cleanup' && getParameter.ttlMonitorEnabled !== false) {
  throw new Error('El monitor TTL debe estar deshabilitado para preservar la fotografia restaurada.');
}
const processId = Number(serverStatus.pid);
if (!Number.isSafeInteger(processId) || processId < 1) {
  throw new Error('serverStatus.pid no puede convertirse a un entero seguro.');
}

print(JSON.stringify({
  schemaVersion: 2,
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
  getParameter: { ttlMonitorEnabled: getParameter.ttlMonitorEnabled },
  serverStatus: { process: serverStatus.process, pid: processId },
}));

connection.close();
