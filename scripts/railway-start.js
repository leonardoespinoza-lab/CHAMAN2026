const { spawnSync } = require('child_process');
const { resolveService } = require('./railway-services');

const service = resolveService();

console.log(`Starting CHAMAN service: ${service.name}`);

const result = spawnSync(service.start, {
  cwd: process.cwd(),
  shell: true,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status || 0);
