const {test}=require('node:test');
const assert=require('node:assert/strict');
const m=require('../migrations/20260913-advisor-owned-field-indexes.cjs');
function fake(indexes=[{name:'_id_',key:{_id:1}},m.oldIndex]) {
  const state={indexes:structuredClone(indexes),calls:[],failCreate:null,corruptCreate:false};
  const col={
    listIndexes:()=>({toArray:async()=>structuredClone(state.indexes)}),
    createIndex:async(key,options)=>{
      state.calls.push(['create',options.name]);
      if(state.failCreate===options.name)throw Error('Index build rejected');
      const {writeConcern,...definition}=options;
      assert.deepEqual(writeConcern,{w:'majority'});
      state.indexes.push({...definition,key,unique:!state.corruptCreate});
    },
    dropIndex:async(name)=>{state.calls.push(['drop',name]);state.indexes=state.indexes.filter(i=>i.name!==name);},
  };
  return {state,db:{collection:name=>{assert.equal(name,'establecimientos');return col;}}};
}
test('v3 verifies before retiring v2; retries are no-ops; documents never edited',async()=>{
  const {db,state}=fake();const p=await m.plan(db);const r=await m.apply(db,p);
  assert.equal(r.documentWrites,0);assert.equal(r.retired,m.oldIndex.name);
  assert.deepEqual(state.calls,[...m.replacements.map(i=>['create',i.name]),['drop',m.oldIndex.name]]);
  assert.equal((await m.apply(db,await m.plan(db))).status,'already-applied');
  assert.equal(state.calls.length,3);
});
test('rejects an incompatible v2 definition',async()=>{
  const {db}=fake([{...m.oldIndex,unique:false}]);await assert.rejects(()=>m.plan(db),/Unexpected index/);
});
test('rejects an incompatible existing v3 definition',async()=>{
  const {db}=fake([m.oldIndex,{...m.replacements[0],sparse:true}]);await assert.rejects(()=>m.plan(db),/Unexpected index/);
});
test('stale index plan refuses any writes',async()=>{
  const {db,state}=fake();const p=await m.plan(db);state.indexes.push({name:'new',key:{new:1}});
  await assert.rejects(()=>m.apply(db,p),/inventory changed/);assert.equal(state.calls.length,0);
});
test('partial build failure retains v2, then safely resumes',async()=>{
  const {db,state}=fake();state.failCreate=m.replacements[1].name;
  await assert.rejects(()=>m.apply(db,undefined),/inspected plan/); // No implicit plan/apply shortcut.
  const p=await m.plan(db);await assert.rejects(()=>m.apply(db,p),/build rejected/);
  assert(state.indexes.some(i=>i.name===m.oldIndex.name));assert(!state.calls.some(c=>c[0]==='drop'));
  state.failCreate=null;await m.apply(db,await m.plan(db));assert((await m.plan(db)).ready);
});
test('a build returning a wrong definition cannot remove v2',async()=>{
  const {db,state}=fake();state.corruptCreate=true;
  await assert.rejects(()=>m.plan(db).then(p=>m.apply(db,p)),/Unexpected index/);
  assert(!state.calls.some(c=>c[0]==='drop'));
});
test('rollback restores v2 without removing v3 or documents',async()=>{
  const {db,state}=fake(m.replacements);assert.equal((await m.restoreV2Protection(db)).status,'v2-restored-v3-retained');
  assert.equal(state.indexes.length,3);assert.equal((await m.restoreV2Protection(db)).status,'already-protected');
});
test('rollback conflict preserves every current protection',async()=>{
  const {db,state}=fake(m.replacements);state.failCreate=m.oldIndex.name;
  await assert.rejects(()=>m.restoreV2Protection(db),/build rejected/);
  assert.equal(state.indexes.length,2);assert(!state.calls.some(c=>c[0]==='drop'));
});
test('unknown unprotected baseline fails closed',async()=>{
  const {db}=fake([]);await assert.rejects(()=>m.plan(db),/baseline exists/);
});
