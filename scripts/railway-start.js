const { spawnSync } = require('child_process');
const { resolveService } = require('./railway-services');
const { ensureSharedPackages } = require('./shared-packages');

const service = resolveService();

console.log(`Starting CHAMAN service: ${service.name}`);

const cwd = service.name === 'sdc-app-chaman' ? process.cwd() : service.path;

ensureSharedPackages({ compilerCwd: cwd });

const runtimeEnv = String(process.env.ENV || process.env.NODE_ENV || '').toLowerCase();
const validatedServices = new Set([
  'sdc-app-chaman',
  'sdc-api-cliente',
  'sdc-auth',
  'sdc-datos',
  'sdc-api-predicciones',
  'sdc-api-clima',
  'sdc-api-lora',
  'sdc-api-externa',
  'sdc-websocket',
  'sdc-ndvi-worker',
]);
if (
  runtimeEnv === 'production' &&
  validatedServices.has(service.name) &&
  process.env.CHAMAN_SKIP_STARTUP_VALIDATION !== 'true'
) {
  const validation = spawnSync(
    process.execPath,
    ['scripts/validate-production-config.js'],
    {
      cwd: process.cwd(),
      shell: false,
      stdio: 'inherit',
      env: process.env,
    },
  );
  if (validation.status !== 0) {
    process.exit(validation.status || 1);
  }
}

// Las migraciones de catalogo son una operacion de release explicita. Nunca se
// ejecutan por el mero reinicio de una replica o por un redeploy sin opt-in.
if (
  service.name === 'sdc-datos' &&
  process.env.CHAMAN_RUN_CATALOG_MIGRATION_ON_START === 'true'
) {
  const bootstrap = spawnSync(process.execPath, ['scripts/bootstrap-agro-catalogs.js'], {
    cwd: process.cwd(),
    shell: false,
    stdio: 'inherit',
    env: process.env,
  });

  if (bootstrap.status !== 0) {
    process.exit(bootstrap.status || 1);
  }

  if (process.env.CHAMAN_TESTING_BOOTSTRAP === 'true') {
    const bootstrapAdmin = spawnSync(
      process.execPath,
      ['scripts/seed-testing-admin.js'],
      {
        cwd: process.cwd(),
        shell: false,
        stdio: 'inherit',
        env: process.env,
      },
    );

    if (bootstrapAdmin.status !== 0) {
      process.exit(bootstrapAdmin.status || 1);
    }
  }
}

const result = spawnSync(service.start, {
  cwd,
  shell: true,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status || 0);
