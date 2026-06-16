const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

  return result.status === 0;
}

function compileTypeScriptPackage(pkg, compilerCwd) {
  if (!compilerCwd) {
    return;
  }

  const tscName = process.platform === 'win32' ? 'tsc.cmd' : 'tsc';
  const tscPath = path.join(compilerCwd, 'node_modules', '.bin', tscName);
  const tsconfigPath = path.join(pkg.source, 'tsconfig.json');

  if (!fs.existsSync(tscPath) || !fs.existsSync(tsconfigPath)) {
    return;
  }

  console.log(`Compiling shared package: ${pkg.name}`);
  const command = `"${tscPath}" -p "${tsconfigPath}"`;
  if (!run(command, path.dirname(pkg.source))) {
    throw new Error(`Could not compile shared package ${pkg.name}`);
  }
}

function exposeCompiledSrc(sourcePackage, targetPackage = sourcePackage) {
  const distPath = path.join(sourcePackage, 'dist');
  const srcPath = path.join(targetPackage, 'src');

  if (!fs.existsSync(distPath) || !fs.existsSync(srcPath)) {
    return;
  }

  fs.cpSync(distPath, srcPath, { recursive: true });
}

function ensureSharedPackages(options = {}) {
  const root = options.root || process.cwd();
  const compilerCwd = options.compilerCwd
    ? path.resolve(root, options.compilerCwd)
    : undefined;

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

    compileTypeScriptPackage(pkg, compilerCwd);
    exposeCompiledSrc(pkg.source);
    copyDirectory(pkg.source, pkg.target);
    exposeCompiledSrc(pkg.target);

    if (compilerCwd) {
      const serviceTarget = path.join(compilerCwd, 'node_modules', pkg.name);
      exposeCompiledSrc(pkg.source, serviceTarget);
    }

    console.log(`Shared package ready: ${pkg.name}`);
  }
}

module.exports = {
  ensureSharedPackages,
};
