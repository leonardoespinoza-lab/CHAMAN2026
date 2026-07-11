const { spawnSync } = require('child_process');
const { resolveService } = require('./railway-services');
const { ensureSharedPackages } = require('./shared-packages');

const service = resolveService();

console.log(`Starting CHAMAN service: ${service.name}`);

const cwd = service.name === 'sdc-app-chaman' ? process.cwd() : service.path;

ensureSharedPackages({ compilerCwd: cwd });

if (service.name === 'sdc-datos') {
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
