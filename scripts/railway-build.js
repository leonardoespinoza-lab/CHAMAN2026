const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { resolveService } = require('./railway-services');

function run(command, cwd) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const service = resolveService();

console.log(`Building CHAMAN service: ${service.name}`);

const nodeModulesPath = path.join(process.cwd(), service.path, 'node_modules');
if (fs.existsSync(nodeModulesPath) && !process.env.RAILWAY_ENVIRONMENT_NAME) {
  console.log(`Using existing dependencies at ${nodeModulesPath}`);
} else {
  run(service.install, service.path);
}

run(service.build, service.path);
