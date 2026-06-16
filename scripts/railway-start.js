const { spawnSync } = require('child_process');
const { resolveService } = require('./railway-services');
const { ensureSharedPackages } = require('./shared-packages');

const service = resolveService();

console.log(`Starting CHAMAN service: ${service.name}`);

ensureSharedPackages();

const cwd = service.name === 'sdc-app-chaman' ? process.cwd() : service.path;

const result = spawnSync(service.start, {
  cwd,
  shell: true,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status || 0);
