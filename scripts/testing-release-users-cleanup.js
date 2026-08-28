const DB_NAME = 'chaman_testing';
const PREFIX = 'codex-release-20260717-';
const crypto = require('node:crypto');

function prefixFilter() {
  return { $regex: `^${PREFIX}` };
}

function assertOneJournalMutation(result, action) {
  if (result?.matchedCount !== 1 || result?.modifiedCount !== 1) {
    throw new Error(`Journal ${action} no modifico exactamente un documento.`);
  }
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
  const planned = await journals.insertOne({
    cleanupId, kind: 'testing-release-users-cleanup', status: 'planned',
    usernamePrefix: PREFIX, userIds: userIds.map(String), createdAt: new Date(),
  });
  if (planned?.acknowledged !== true) throw new Error('No se pudo crear el journal previo al cleanup.');
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
    const userFilter = { $or: [{ username: prefixFilter() }, { _id: { $in: userIds } }] };
    userResult = await users.deleteMany(userFilter);
    const [remainingTokens, remainingUsers] = await Promise.all([
      tokens.countDocuments(tokenFilter),
      users.countDocuments(userFilter),
    ]);
    if (remainingTokens !== 0 || remainingUsers !== 0) {
      throw new Error(
        `Cleanup incompleto: quedan ${remainingTokens} token(s) y ${remainingUsers} usuario(s) temporales.`,
      );
    }
    const journalResult = await journals.updateOne({ cleanupId, status: 'planned' }, { $set: {
      status: 'completed', completedAt: new Date(), removedTokens: Number(tokenResult.deletedCount || 0),
      removedUsers: Number(userResult.deletedCount || 0), remainingTokens, remainingUsers,
    } });
    assertOneJournalMutation(journalResult, 'completed');
    return {
      cleanupId,
      removedTokens: Number(tokenResult.deletedCount || 0),
      removedUsers: Number(userResult.deletedCount || 0),
      matchedTemporaryUserIds: userIds.length,
      remainingTokens,
      remainingUsers,
    };
  } catch (error) {
    let journalError;
    try {
      const failedResult = await journals.updateOne({ cleanupId, status: 'planned' }, { $set: {
        status: 'failed', failedAt: new Date(),
        errorSha256: crypto.createHash('sha256').update(error.message).digest('hex'),
      } });
      assertOneJournalMutation(failedResult, 'failed');
    } catch (failure) {
      journalError = failure;
    }
    if (journalError) throw new AggregateError([error, journalError], 'Cleanup fallo y el journal no pudo sellarse.');
    throw error;
  }
}

module.exports = { DB_NAME, PREFIX, assertOneJournalMutation, cleanupTestingReleaseUsers, prefixFilter };
