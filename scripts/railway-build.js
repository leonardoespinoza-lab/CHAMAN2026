const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { resolveService } = require('./railway-services');

function run(command, cwd) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      NPM_CONFIG_PRODUCTION: 'false',
      npm_config_production: 'false',
    },
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function copyDirectory(source, target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, {
    recursive: true,
    filter: (entry) => {
      const name = path.basename(entry);
      return name !== 'node_modules' && name !== '.git';
    },
  });
}

function ensureSharedPackages() {
  const root = process.cwd();
  const packages = [
    {
      source: path.join(root, 'sdc-modelos'),
      target: path.join(root, 'node_modules', 'modelos'),
      name: 'modelos',
    },
  ];

  for (const pkg of packages) {
    if (!fs.existsSync(pkg.source)) {
      console.warn(`Shared package ${pkg.name} not found at ${pkg.source}`);
      continue;
    }

    copyDirectory(pkg.source, pkg.target);
    console.log(`Shared package ready: ${pkg.name}`);
  }
}

const service = resolveService();

console.log(`Building CHAMAN service: ${service.name}`);

ensureSharedPackages();

const nodeModulesPath = path.join(process.cwd(), service.path, 'node_modules');
if (fs.existsSync(nodeModulesPath) && !process.env.RAILWAY_ENVIRONMENT_NAME) {
  console.log(`Using existing dependencies at ${nodeModulesPath}`);
} else {
  run(service.install, service.path);
}

run(service.build, service.path);
