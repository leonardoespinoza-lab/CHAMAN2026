const IDENTITIES = Object.freeze({
  ios: Object.freeze({ appId: 'com.chamanagro.app', appName: 'Chamán' }),
  android: Object.freeze({ appId: 'ar.chamanagro.app', appName: 'Chamán Agro' }),
});

function resolveNativeIdentity(argv = process.argv.slice(2)) {
  const targets = [...new Set(argv.filter((arg) => arg === 'ios' || arg === 'android'))];
  if (targets.length > 1) {
    throw new Error('Sincronizar cada plataforma por separado para conservar sus identidades.');
  }
  const mutatingCommands = ['add', 'copy', 'sync', 'update', 'build', 'run'];
  if (!targets.length && argv.some((arg) => mutatingCommands.includes(arg))) {
    throw new Error('Indicar la plataforma: npx cap sync android o npx cap sync ios.');
  }
  // Non-mutating/default reads retain the existing Apple identity.
  return IDENTITIES[targets[0] || 'ios'];
}

module.exports = { resolveNativeIdentity };
