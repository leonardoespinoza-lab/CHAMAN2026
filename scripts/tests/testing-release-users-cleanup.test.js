const assert = require('node:assert/strict');
const test = require('node:test');
const {
  PREFIX,
  cleanupTestingReleaseUsers,
} = require('../testing-release-users-cleanup');

function fakeDb(databaseName = 'chaman_testing') {
  const calls = [];
  const collections = {
    tokens: {
      async deleteMany(filter) {
        calls.push({ collection: 'tokens', operation: 'deleteMany', filter });
        return { deletedCount: 14 };
      },
      async countDocuments(filter) {
        calls.push({ collection: 'tokens', operation: 'countDocuments', filter });
        return 0;
      },
    },
    usuarios: {
      find(filter) {
        calls.push({ collection: 'usuarios', operation: 'find', filter });
        return {
          project(projection) {
            calls.push({ collection: 'usuarios', operation: 'project', projection });
            return { async toArray() { return [{ _id: 'user-1' }, { _id: 'user-2' }]; } };
          },
        };
      },
      async deleteMany(filter) {
        calls.push({ collection: 'usuarios', operation: 'deleteMany', filter });
        return { deletedCount: 8 };
      },
      async countDocuments(filter) {
        calls.push({ collection: 'usuarios', operation: 'countDocuments', filter });
        return 0;
      },
    },
    maintenance_cleanup_journals: {
      async insertOne(document) { calls.push({ collection: 'journal', operation: 'insertOne', document }); },
      async updateOne(filter, update) { calls.push({ collection: 'journal', operation: 'updateOne', filter, update }); },
    },
  };
  return {
    databaseName,
    calls,
    collection(name) {
      return collections[name];
    },
  };
}

test('cleanup revoca tokens por username y user._id legacy antes de usuarios, y verifica residuo cero', async () => {
  const db = fakeDb();
  const result = await cleanupTestingReleaseUsers(db);
  assert.match(result.cleanupId, /^[0-9a-f-]{36}$/);
  assert.deepEqual({ ...result, cleanupId: undefined }, {
    cleanupId: undefined,
    removedTokens: 14,
    removedUsers: 8,
    matchedTemporaryUserIds: 2,
    remainingTokens: 0,
    remainingUsers: 0,
  });
  const journal = db.calls.find((call) => call.operation === 'insertOne');
  assert.deepEqual(journal.document.userIds, ['user-1', 'user-2']);
  assert.ok(db.calls.indexOf(journal) < db.calls.findIndex((call) => call.operation === 'deleteMany'));
  assert.deepEqual(
    db.calls.filter(({ operation }) => operation === 'deleteMany').map(({ collection, operation }) => `${collection}:${operation}`),
    ['tokens:deleteMany', 'usuarios:deleteMany'],
  );
  const tokenDelete = db.calls.find((call) => call.collection === 'tokens' && call.operation === 'deleteMany');
  const userDelete = db.calls.find((call) => call.collection === 'usuarios' && call.operation === 'deleteMany');
  assert.equal(tokenDelete.filter.$or[0]['user.username'].$regex, `^${PREFIX}`);
  assert.deepEqual(tokenDelete.filter.$or[1]['user._id'].$in, ['user-1', 'user-2']);
  assert.equal(userDelete.filter.username.$regex, `^${PREFIX}`);
});

test('cleanup rechaza cualquier base que no sea chaman_testing antes de tocar colecciones', async () => {
  const db = fakeDb('chaman');
  await assert.rejects(() => cleanupTestingReleaseUsers(db), /solo puede operar en chaman_testing/);
  assert.equal(db.calls.length, 0);
});

test('cleanup falla cerrado si quedan tokens o usuarios temporales', async () => {
  const db = fakeDb();
  const originalCollection = db.collection.bind(db);
  db.collection = (name) => {
    const collection = originalCollection(name);
    if (name === 'tokens') return { ...collection, countDocuments: async () => 1 };
    return collection;
  };
  await assert.rejects(() => cleanupTestingReleaseUsers(db), /Cleanup incompleto/);
});
