const DB_NAME = 'chaman_testing';
const PREFIX = 'codex-release-20260717-';

function prefixFilter() {
  return { $regex: `^${PREFIX}` };
}

async function cleanupTestingReleaseUsers(db) {
  if (!db || db.databaseName !== DB_NAME) {
    throw new Error('Cleanup rechazado: solo puede operar en chaman_testing.');
  }
  const tokens = db.collection('tokens');
  const users = db.collection('usuarios');
  const tokenResult = await tokens.deleteMany({ 'user.username': prefixFilter() });
  const userResult = await users.deleteMany({ username: prefixFilter() });
  const [remainingTokens, remainingUsers] = await Promise.all([
    tokens.countDocuments({ 'user.username': prefixFilter() }),
    users.countDocuments({ username: prefixFilter() }),
  ]);
  if (remainingTokens !== 0 || remainingUsers !== 0) {
    throw new Error(
      `Cleanup incompleto: quedan ${remainingTokens} token(s) y ${remainingUsers} usuario(s) temporales.`,
    );
  }
  return {
    removedTokens: Number(tokenResult.deletedCount || 0),
    removedUsers: Number(userResult.deletedCount || 0),
    remainingTokens,
    remainingUsers,
  };
}

module.exports = { DB_NAME, PREFIX, cleanupTestingReleaseUsers, prefixFilter };
