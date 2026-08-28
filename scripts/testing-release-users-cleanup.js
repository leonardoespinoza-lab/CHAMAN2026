const DB_NAME = 'chaman_testing';
const PREFIX = 'codex-release-20260717-';
const crypto = require('node:crypto');

function prefixFilter() {
  return { $regex: `^${PREFIX}` };
}

async function cleanupTestingReleaseUsers(db) {
  if (!db || db.databaseName !== DB_NAME) {
    throw new Error('Cleanup rechazado: solo puede operar en chaman_testing.');
  }
  const tokens = db.collection('tokens');
  const users = db.collection('usuarios');
  const journals = db.collection('maintenance_cleanup_journals');
  const temporaryUsers = await users
    .find({ username: prefixFilter() })
    .project({ _id: 1 })
    .toArray();
  const userIds = temporaryUsers.map((user) => user._id).filter((id) => id != null);
  const cleanupId = crypto.randomUUID();
  await journals.insertOne({
    cleanupId, kind: 'testing-release-users-cleanup', status: 'planned',
    usernamePrefix: PREFIX, userIds: userIds.map(String), createdAt: new Date(),
  });
  const tokenFilter = {
    $or: [
      { 'user.username': prefixFilter() },
      { 'user._id': { $in: userIds } },
    ],
  };
  let tokenResult;
  let userResult;
  try {
    tokenResult = await tokens.deleteMany(tokenFilter);
    userResult = await users.deleteMany({ username: prefixFilter() });
  const [remainingTokens, remainingUsers] = await Promise.all([
    tokens.countDocuments(tokenFilter),
    users.countDocuments({ username: prefixFilter() }),
  ]);
    if (remainingTokens !== 0 || remainingUsers !== 0) {
    throw new Error(
      `Cleanup incompleto: quedan ${remainingTokens} token(s) y ${remainingUsers} usuario(s) temporales.`,
    );
    }
    await journals.updateOne({ cleanupId, status: 'planned' }, { $set: {
      status: 'completed', completedAt: new Date(), removedTokens: Number(tokenResult.deletedCount || 0),
      removedUsers: Number(userResult.deletedCount || 0), remainingTokens, remainingUsers,
    } });
    return {
      cleanupId,
      removedTokens: Number(tokenResult.deletedCount || 0),
      removedUsers: Number(userResult.deletedCount || 0),
      matchedTemporaryUserIds: userIds.length,
      remainingTokens,
      remainingUsers,
    };
  } catch (error) {
    await journals.updateOne({ cleanupId, status: 'planned' }, { $set: {
      status: 'failed', failedAt: new Date(),
      errorSha256: crypto.createHash('sha256').update(error.message).digest('hex'),
    } }).catch(() => {});
    throw error;
  }
}

module.exports = { DB_NAME, PREFIX, cleanupTestingReleaseUsers, prefixFilter };
