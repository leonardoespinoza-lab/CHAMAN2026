const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../ops/reconcile-license-catalog.mongosh.js'), 'utf8');
const clone = (x) => structuredClone(x);

function fixture() {
  const individual = { maxDistribuidores: 1, maxProductores: 1, maxEstablecimientos: 1, maxLotes: 1, maxHectareas: 10000 };
  return {
    licencias: [
      { _id: 'a', ...individual }, { _id: 'b', ...individual },
      { _id: 'c', maxDistribuidores: 10, maxProductores: 50, maxEstablecimientos: 100, maxLotes: 500 },
      { _id: 'd', maxProductores: 25, maxEstablecimientos: 50, maxLotes: 250 },
      { _id: 'e', maxProductores: 25, maxEstablecimientos: 50, maxLotes: 250, modulos: { Riego: true } },
    ],
    licenciaporentidads: [
      { _id: 'contract1', idLicencia: 'a', fechaExpiracion: '2020-01-01', idEntidad: 'producer1' },
      { _id: 'contract2', idLicencia: 'b', fechaExpiracion: '2020-01-01', estado: 'vencida', idEntidad: 'producer2' },
    ],
    license_catalog_reconciliation_backups: [],
  };
}

async function execute(data, { apply = false, hash = '', failDelete = false } = {}) {
  let writes = 0;
  const output = [];
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) =>
    value && typeof value === 'object' && '$in' in value ? value.$in.includes(row[key]) : JSON.stringify(row[key]) === JSON.stringify(value));
  const database = { getName: () => 'chaman' };
  for (const name of Object.keys(data)) {
    database[name] = {
      find: async (filter = {}) => ({ toArray: async () => clone(data[name].filter(x => matches(x, filter))) }),
      countDocuments: async (filter = {}) => data[name].filter(x => matches(x, filter)).length,
      insertOne: async (row) => { writes++; data[name].push(clone(row)); },
      updateOne: async (filter, update) => {
        writes++;
        const row = data[name].find(x => matches(x, filter));
        if (row) Object.assign(row, clone(update.$set));
        return { matchedCount: row ? 1 : 0 };
      },
      updateMany: async (filter, update) => {
        writes++;
        const rows = data[name].filter(x => matches(x, filter));
        rows.forEach(x => Object.assign(x, clone(update.$set)));
        return { matchedCount: rows.length };
      },
      deleteMany: async (filter) => {
        writes++;
        if (failDelete) throw new Error('simulated storage failure');
        data[name] = data[name].filter(x => !matches(x, filter));
      },
      replaceOne: async (filter, row) => {
        writes++;
        const index = data[name].findIndex(x => matches(x, filter));
        if (index < 0) data[name].push(clone(row)); else data[name][index] = clone(row);
      },
    };
  }
  function ObjectId(value) { if (!new.target) return value; this.value = 'backup'; }
  await vm.runInNewContext(source, {
    process: { env: { CHAMAN_LICENSE_CATALOG_APPLY: String(apply), CHAMAN_LICENSE_CATALOG_PLAN_HASH: hash } },
    db: { getSiblingDB: () => database }, require, Date, JSON, EJSON: JSON, ObjectId,
    print: (text) => { try { output.push(JSON.parse(text)); } catch { output.push(text); } },
    quit: code => { if (code) throw new Error(output.at(-1)); },
  });
  return { writes, output };
}

test('preview only reads, reports exact duplicates and references', async () => {
  const data = fixture(); const before = clone(data);
  const result = await execute(data);
  assert.equal(result.writes, 0);
  assert.deepEqual(data, before);
  assert.equal(result.output[0].plan.targetLicenseCount, 4);
  assert.equal(result.output[0].plan.assignmentsToRepoint, 1);
});
test('a stale plan hash aborts before writing', async () => {
  const data = fixture(); const before = clone(data);
  await assert.rejects(execute(data, { apply: true, hash: 'wrong' }), /Plan hash invalido/);
  assert.deepEqual(data, before);
});
test('apply awaits writes and preserves all contractual fields', async () => {
  const data = fixture(); const contracts = clone(data.licenciaporentidads);
  const preview = await execute(data);
  const result = await execute(data, { apply: true, hash: preview.output[0].planHash });
  assert.equal(data.licencias.length, 4);
  assert.deepEqual(data.licenciaporentidads, contracts.map(x => ({ ...x, idLicencia: 'a' })));
  assert.equal(data.license_catalog_reconciliation_backups[0].status, 'applied');
  assert.equal(result.output.at(-1).orphanAssignments, 0);
});
test('failed storage operation restores original plans and contracts', async () => {
  const data = fixture(); const before = clone(data);
  const preview = await execute(data);
  await assert.rejects(execute(data, { apply: true, hash: preview.output[0].planHash, failDelete: true }), /simulated storage failure/);
  assert.deepEqual(data.licencias, before.licencias);
  assert.deepEqual(data.licenciaporentidads, before.licenciaporentidads);
  assert.equal(data.license_catalog_reconciliation_backups[0].status, 'rolled_back');
});
