'use strict';
// Solo lectura local: no fetch, push, checkout, deploy ni acceso a bases.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function validatePaths(policy, changedPaths) {
  assert.match(
    policy.baseline,
    /^[a-f0-9]{40}$/,
    'Base Git completa obligatoria',
  );
  assert.ok(policy.allowedChanges?.length, 'Falta alcance explicito');
  assert.ok(policy.protectedPaths?.length, 'Faltan archivos protegidos');
  for (const name of [
    ...policy.allowedChanges,
    ...policy.protectedPaths,
    ...changedPaths,
  ]) {
    assert.ok(
      name &&
        !name.startsWith('/') &&
        !name.includes('\\') &&
        !name.split('/').some((part) => ['..', '.', ''].includes(part)) &&
        !/[:*?\x00-\x1f]/.test(name),
      `Ruta no admisible: ${name}`,
    );
  }
  for (const name of changedPaths) {
    assert.ok(
      policy.allowedChanges.includes(name),
      `Cambio fuera del alcance: ${name}`,
    );
    assert.ok(
      !policy.protectedPaths.some(
        (p) => name === p || name.startsWith(p + '/'),
      ),
      `Regresion en ruta protegida: ${name}`,
    );
    assert.ok(
      !policy.protectStyles || !/\.(scss|css)$/i.test(name),
      `Estilo protegido: ${name}`,
    );
  }
}

function inspectContinuity(root, policy, { working = false } = {}) {
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    }).trim();
  const lines = (value) => value.split(/\r?\n/).filter(Boolean);
  validatePaths(policy, []);
  const head = git('rev-parse', 'HEAD');
  for (const ref of [policy.baseline, ...(policy.requiredAncestors || [])]) {
    assert.match(ref, /^[a-f0-9]{40}$/, 'Antecesor Git completo obligatorio');
    git('cat-file', '-e', ref + '^{commit}');
    git('merge-base', '--is-ancestor', ref, head);
  }
  if (!working)
    assert.equal(
      git('status', '--porcelain'),
      '',
      'La candidata debe estar limpia y versionada',
    );
  const comparison = [policy.baseline, ...(!working ? [head] : [])];
  const changed = lines(
    git('diff', '--name-only', '--no-renames', ...comparison, '--'),
  );
  if (working)
    changed.push(...lines(git('ls-files', '--others', '--exclude-standard')));
  const changedPaths = [...new Set(changed)].sort();
  validatePaths(policy, changedPaths);
  for (const name of policy.protectedPaths) {
    git('cat-file', '-e', `${policy.baseline}:${name}`);
    // No admitir una comprobacion vacia sobre una ruta mal escrita.
    assert.ok(
      git('ls-tree', '-r', policy.baseline, '--', name),
      `Proteccion vacia: ${name}`,
    );
    assert.equal(
      git('diff', '--name-only', ...comparison, '--', name),
      '',
      `Cambio protegido: ${name}`,
    );
  }
  return {
    baseline: policy.baseline,
    candidate: head,
    workingCopy: working,
    changedPaths,
    protectedPaths: policy.protectedPaths.length,
    remoteOrDeploymentVerified: false,
  };
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    assert.ok(
      args.length >= 1 &&
        args.length <= 2 &&
        (!args[1] || args[1] === '--working'),
      'Uso: node scripts/check-code-continuity.cjs <politica.json> [--working]',
    );
    const policy = JSON.parse(fs.readFileSync(path.resolve(args[0]), 'utf8'));
    console.log(
      JSON.stringify(
        inspectContinuity(path.resolve(__dirname, '..'), policy, {
          working: args[1] === '--working',
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { validatePaths, inspectContinuity };
