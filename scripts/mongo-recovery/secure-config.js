const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const WINDOWS_ACL_SCRIPT = path.join(__dirname, 'windows-acl.ps1');

function minimalChildEnv(extra = {}, base = process.env) {
  const allowed = [
    'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP',
    'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'HOME', 'XDG_CONFIG_HOME',
  ];
  const env = Object.fromEntries(allowed.filter((key) => base[key]).map((key) => [key, base[key]]));
  return { ...env, ...extra };
}

function assertNoMongoUriEnvironment(base = process.env) {
  const offenders = Object.entries(base)
    .filter(([, value]) => /mongodb(?:\+srv)?:\/\//i.test(String(value || '')))
    .map(([key]) => key)
    .sort();
  if (offenders.length) {
    throw new Error(
      `URI MongoDB prohibida en el entorno del proceso (${offenders.join(', ')}); use stdin + archivo ACL.`,
    );
  }
}

function assertSafeUri(uri) {
  if (typeof uri !== 'string' || !/^mongodb(?:\+srv)?:\/\//i.test(uri)) {
    throw new Error('URI MongoDB invalida para archivo temporal.');
  }
  if (/[\r\n\0]/.test(uri)) throw new Error('La URI MongoDB contiene caracteres de control.');
}

function runWindowsAcl(action, targetPath, spawn = spawnSync) {
  const result = spawn('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    WINDOWS_ACL_SCRIPT,
    '-Action',
    action,
  ], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env: minimalChildEnv({ CHAMAN_ACL_TARGET_PATH: targetPath }),
  });
  if (result.error || result.status !== 0) {
    throw new Error(`No se pudo aplicar/verificar ACL Windows (${action}).`);
  }
  const line = String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean).at(-1);
  let evidence;
  try {
    evidence = JSON.parse(line);
  } catch {
    throw new Error(`ACL Windows no devolvio evidencia JSON (${action}).`);
  }
  if (evidence.ok !== true || evidence.protected !== true || evidence.rules !== 1) {
    throw new Error(`ACL Windows efectiva no es restrictiva (${action}).`);
  }
  return evidence;
}

function verifyRestrictedDirectory(directoryPath, { platform = process.platform, spawn = spawnSync } = {}) {
  if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
    throw new Error('El directorio restringido no existe.');
  }
  if (platform === 'win32') return runWindowsAcl('VerifyDirectory', directoryPath, spawn);
  const mode = fs.statSync(directoryPath).mode & 0o777;
  if (mode !== 0o700) throw new Error('El directorio no tiene modo 0700.');
  return { ok: true, kind: 'directory', mode: '0700' };
}

function hardenRestrictedDirectory(directoryPath, options = {}) {
  if (options.platform === 'win32' || (!options.platform && process.platform === 'win32')) {
    runWindowsAcl('HardenDirectory', directoryPath, options.spawn || spawnSync);
  } else {
    fs.chmodSync(directoryPath, 0o700);
  }
  return verifyRestrictedDirectory(directoryPath, options);
}

function verifyRestrictedFile(filePath, { platform = process.platform, spawn = spawnSync } = {}) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error('El archivo restringido no existe.');
  }
  if (platform === 'win32') return runWindowsAcl('VerifyFile', filePath, spawn);
  const mode = fs.statSync(filePath).mode & 0o777;
  if (mode !== 0o600) throw new Error('El archivo no tiene modo 0600.');
  return { ok: true, kind: 'file', mode: '0600' };
}

function hardenRestrictedFile(filePath, options = {}) {
  if (options.platform === 'win32' || (!options.platform && process.platform === 'win32')) {
    runWindowsAcl('HardenFile', filePath, options.spawn || spawnSync);
  } else {
    fs.chmodSync(filePath, 0o600);
  }
  return verifyRestrictedFile(filePath, options);
}

function withMongoSecretFile(
  uri,
  format,
  callback,
  {
    tmpRoot = os.tmpdir(),
    hardenDirectory = hardenRestrictedDirectory,
    hardenFile = hardenRestrictedFile,
    verifyDirectory = verifyRestrictedDirectory,
  } = {},
) {
  assertSafeUri(uri);
  if (!['tools-yaml', 'raw-uri'].includes(format)) throw new Error('Formato secreto temporal invalido.');
  const directory = fs.mkdtempSync(path.join(tmpRoot, 'chaman-mongo-secret-'));
  const filePath = path.join(directory, format === 'tools-yaml' ? 'mongo-tools.yml' : 'mongo-uri.txt');
  const content = format === 'tools-yaml' ? `uri: ${JSON.stringify(uri)}\n` : uri;
  let created = false;
  try {
    hardenDirectory(directory);
    fs.writeFileSync(filePath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    created = true;
    hardenFile(filePath);
    verifyDirectory(directory);
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
  return ['--nodb', '--quiet', '--norc', '--file', scriptPath];
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

const safeChildEnv = minimalChildEnv;

module.exports = {
  buildMongodumpArgs,
  buildMongorestoreArgs,
  buildMongoshArgs,
  assertMongoToolsConfigVersion,
  assertNoMongoUriEnvironment,
  safeChildEnv,
  minimalChildEnv,
  hardenRestrictedDirectory,
  hardenRestrictedFile,
  verifyRestrictedDirectory,
  verifyRestrictedFile,
  withMongoSecretFile,
};
