const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function assertSafeUri(uri) {
  if (typeof uri !== 'string' || !/^mongodb(?:\+srv)?:\/\//i.test(uri)) {
    throw new Error('URI MongoDB invalida para archivo temporal.');
  }
  if (/[\r\n\0]/.test(uri)) throw new Error('La URI MongoDB contiene caracteres de control.');
}

function runAcl(program, args, spawn = spawnSync) {
  const result = spawn(program, args, {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`No se pudo restringir ACL con ${program}.`);
  }
  return `${result.stdout || ''}${result.stderr || ''}`;
}

function hardenSecretFile(filePath, { platform = process.platform, spawn = spawnSync } = {}) {
  fs.chmodSync(filePath, 0o600);
  if (platform !== 'win32') {
    const mode = fs.statSync(filePath).mode & 0o777;
    if (mode !== 0o600) throw new Error('El archivo temporal no quedo con modo 0600.');
    return;
  }
  const identity = runAcl('whoami', ['/user', '/fo', 'csv', '/nh'], spawn);
  const sid = identity.match(/S-1-[0-9-]+/i)?.[0];
  if (!sid) throw new Error('No se pudo resolver el SID del operador.');
  runAcl('icacls', [filePath, '/inheritance:r', '/grant:r', `*${sid}:(R,W)`], spawn);
}

function withMongoSecretFile(
  uri,
  format,
  callback,
  { tmpRoot = os.tmpdir(), harden = hardenSecretFile } = {},
) {
  assertSafeUri(uri);
  if (!['tools-yaml', 'raw-uri'].includes(format)) throw new Error('Formato secreto temporal invalido.');
  const directory = fs.mkdtempSync(path.join(tmpRoot, 'chaman-mongo-secret-'));
  const filePath = path.join(directory, format === 'tools-yaml' ? 'mongo-tools.yml' : 'mongo-uri.txt');
  const content = format === 'tools-yaml' ? `uri: ${JSON.stringify(uri)}\n` : uri;
  let created = false;
  try {
    fs.writeFileSync(filePath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    created = true;
    harden(filePath);
    return callback(filePath);
  } finally {
    let cleanupError;
    if (created && fs.existsSync(filePath)) {
      try {
        const bytes = fs.statSync(filePath).size;
        if (bytes > 0) fs.writeFileSync(filePath, Buffer.alloc(bytes), { flag: 'r+' });
      } catch (error) {
        cleanupError = error;
      }
      try {
        fs.rmSync(filePath, { force: true });
      } catch (error) {
        cleanupError ||= error;
      }
    }
    try {
      fs.rmdirSync(directory);
    } catch (error) {
      cleanupError ||= error;
    }
    if (cleanupError) throw new Error(`No se pudo eliminar material secreto temporal: ${cleanupError.message}`);
  }
}

function buildMongodumpArgs(configPath, database, archivePath) {
  return [
    `--config=${configPath}`,
    `--db=${database}`,
    `--archive=${archivePath}`,
    '--gzip',
    '--readPreference=primary',
    '--numParallelCollections=1',
  ];
}

function buildMongorestoreArgs(configPath, archivePath, sourceDatabase, targetDatabase) {
  return [
    `--config=${configPath}`,
    `--archive=${archivePath}`,
    '--gzip',
    '--stopOnError',
    `--nsInclude=${sourceDatabase}.*`,
    `--nsFrom=${sourceDatabase}.*`,
    `--nsTo=${targetDatabase}.*`,
  ];
}

function buildMongoshArgs(scriptPath) {
  return ['--nodb', '--quiet', '--file', scriptPath];
}

function assertMongoToolsConfigVersion(versionText) {
  const match = String(versionText).match(/\b(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) throw new Error('No se pudo interpretar la version de MongoDB Database Tools.');
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major < 100 || (major === 100 && minor < 3)) {
    throw new Error('MongoDB Database Tools 100.3 o superior es obligatorio para --config seguro.');
  }
  return { major, minor, patch: Number(match[3] || 0) };
}

module.exports = {
  buildMongodumpArgs,
  buildMongorestoreArgs,
  buildMongoshArgs,
  assertMongoToolsConfigVersion,
  hardenSecretFile,
  withMongoSecretFile,
};
