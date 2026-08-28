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
      async deleteMany(filter) {
        calls.push({ collection: 'usuarios', operation: 'deleteMany', filter });
        return { deletedCount: 8 };
      },
      async countDocuments(filter) {
        calls.push({ collection: 'usuarios', operation: 'countDocuments', filter });
        return 0;
      },
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

test('cleanup revoca primero tokens temporales, luego usuarios, y verifica residuo cero', async () => {
  const db = fakeDb();
  const result = await cleanupTestingReleaseUsers(db);
  assert.deepEqual(result, {
    removedTokens: 14,
    removedUsers: 8,
    remainingTokens: 0,
    remainingUsers: 0,
  });
  assert.deepEqual(
    db.calls.slice(0, 2).map(({ collection, operation }) => `${collection}:${operation}`),
    ['tokens:deleteMany', 'usuarios:deleteMany'],
  );
  assert.equal(db.calls[0].filter['user.username'].$regex, `^${PREFIX}`);
  assert.equal(db.calls[1].filter.username.$regex, `^${PREFIX}`);
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
