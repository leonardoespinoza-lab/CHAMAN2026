const fs = require('fs');
const path = require('path');

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

function ensureSharedPackages(root = process.cwd()) {
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

module.exports = {
  ensureSharedPackages,
};
