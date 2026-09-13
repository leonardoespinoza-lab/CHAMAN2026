'use strict';

// Explicit maintenance operation only. Never imported by application startup.
// The caller must certify the target, backup and rehearsal before calling apply.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const collectionName = 'establecimientos';
const oldIndex = {
  name: 'uniq_establecimiento_productor_nombre_activo_v2',
  key: { nombre: 1, idProductor: 1 },
  unique: true,
  partialFilterExpression: { archivado: false },
};
const replacements = [
  {
    name: 'uniq_establecimiento_titular_nombre_activo_v3',
    key: { nombre: 1, idProductor: 1, idAsesorPropietario: 1 },
    unique: true,
    partialFilterExpression: { archivado: false },
  },
  {
    name: 'uniq_establecimiento_productor_nombre_activo_v3',
    key: { nombre: 1, idProductor: 1 },
    unique: true,
    partialFilterExpression: { archivado: false, idProductor: { $type: 'objectId' } },
  },
];
function exact(actual, expected) {
  assert(actual, 'Required index missing: ' + expected.name);
  const { v, ns, background, ...definition } = actual;
  assert.deepEqual(definition, expected, 'Unexpected index definition: ' + expected.name);
}
function fingerprint(indexes) {
  return createHash('sha256').update(JSON.stringify([...indexes].sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
}
async function plan(db) {
  const indexes = await db.collection(collectionName).listIndexes().toArray();
  const old = indexes.find(i=>i.name===oldIndex.name);
  if (old) exact(old, oldIndex);
  const missing = replacements.filter(expected=>{
    const actual = indexes.find(i=>i.name===expected.name);
    if (actual) exact(actual, expected);
    return !actual;
  });
  assert(old || missing.length===0, 'Neither the complete v3 protection nor the known v2 baseline exists');
  return { collection:collectionName, before:indexes, fingerprint:fingerprint(indexes),
    create:missing, retire:old ? oldIndex.name : null,
    ready:missing.length===0 && !old, documentWrites:0 };
}
async function apply(db, expectedPlan) {
  assert(expectedPlan?.fingerprint, 'An inspected plan is required');
  const current = await plan(db);
  assert.equal(current.fingerprint, expectedPlan.fingerprint, 'Index inventory changed since planning');
  if (current.ready) return { status:'already-applied', created:[], retired:null, documentWrites:0 };
  const collection = db.collection(collectionName);
  const created=[];
  for (const definition of current.create) {
    const {key,...options}=definition;
    await collection.createIndex(key,{...options,writeConcern:{w:'majority'}});
    created.push(definition.name);
  }
  // Even if one build fails, v2 remains in place. Never retire before both verify.
  const built=await collection.listIndexes().toArray();
  replacements.forEach(expected=>exact(built.find(i=>i.name===expected.name),expected));
  for (const before of current.before) assert.deepEqual(built.find(i=>i.name===before.name),before,'Concurrent index drift');
  assert.equal(built.length,current.before.length+created.length,'Unexpected concurrent index');
  if (current.retire) {
    exact(built.find(i=>i.name===oldIndex.name),oldIndex);
    await collection.dropIndex(oldIndex.name,{writeConcern:{w:'majority'}});
  }
  const after=await plan(db);
  assert(after.ready,'Index transition incomplete');
  for (const before of current.before.filter(i=>i.name!==oldIndex.name))
    assert.deepEqual(after.before.find(i=>i.name===before.name),before,'Unrelated index changed');
  return { status:'applied', created, retired:current.retire, beforeFingerprint:current.fingerprint,
    afterFingerprint:after.fingerprint, documentWrites:0 };
}
async function restoreV2Protection(db) {
  // A new own-field duplicate can make v2 impossible. Mongo must reject that;
  // never delete documents or remove v3 protections to force a rollback.
  const current=await plan(db);
  if (current.before.some(i=>i.name===oldIndex.name)) return {status:'already-protected',documentWrites:0};
  const {key,...options}=oldIndex;
  await db.collection(collectionName).createIndex(key,{...options,writeConcern:{w:'majority'}});
  const indexes=await db.collection(collectionName).listIndexes().toArray();
  exact(indexes.find(i=>i.name===oldIndex.name),oldIndex);
  replacements.forEach(expected=>exact(indexes.find(i=>i.name===expected.name),expected));
  return {status:'v2-restored-v3-retained',documentWrites:0};
}
module.exports={collectionName,oldIndex,replacements,plan,apply,restoreV2Protection};
