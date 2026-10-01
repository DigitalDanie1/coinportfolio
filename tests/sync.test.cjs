const assert=require('assert/strict'),crypto=require('crypto'),path=require('path'),os=require('os'),fs=require('fs');
const C=require('../sync-core.js');
const base=()=>({coins:[],holdings:{},farming:[],options:[],categories:[],farmingPairs:null,farmingExtra:{venueMeta:{},points:{},pnl:[],ui:{}},scenario:{text:'',updatedAt:null},reflections:null,removedDefaults:[],appliedImports:[],migrations:[]});
const st=(o)=>Object.assign(base(),o);
const legacy=S=>C.build(S,null,0);
const J=v=>JSON.parse(JSON.stringify(v));

(async()=>{
const {hashKey,storageKey,handleSync,FileStore,UpstashStore,storeFromEnv,MAX_BODY}=await import('../lib/sync-store.mjs');

// --- merge: legacy data ---
{ // richer legacy value beats empty, in both directions
  const a=legacy(st({holdings:{x:{qty:5,reason:'my thesis',conviction:4}}})),b=legacy(st({holdings:{x:{qty:0,reason:'',conviction:0}}}));
  for(const m of [C.merge(a,b),C.merge(b,a)]){const h=C.apply(m,base()).holdings.x;assert.equal(h.reason,'my thesis');assert.equal(h.qty,5);assert.equal(h.conviction,4);}
  assert.deepEqual(J(C.merge(a,b).recs),J(C.merge(b,a).recs),'merge converges regardless of order');
}
{ // different non-empty legacy values: the one with more content wins, deterministically
  const a=legacy(st({holdings:{x:{reason:'short'}}})),b=legacy(st({holdings:{x:{reason:'a much longer thesis'}}}));
  assert.equal(C.apply(C.merge(a,b),base()).holdings.x.reason,'a much longer thesis');
}
// --- timestamped vs legacy / newer wins ---
{
  const S1=st({holdings:{x:{reason:'old',conviction:3}}}),d0=legacy(S1);
  const S2=st({holdings:{x:{reason:'new',conviction:3}}}),dA=C.build(S2,d0,1000);
  const dLegacyOther=legacy(st({holdings:{x:{reason:'zzzzzzzzzzzzzz long legacy',conviction:3}}}));
  assert.equal(C.apply(C.merge(dA,dLegacyOther),base()).holdings.x.reason,'new','an edit made after sync beats legacy text');
  const S3=st({holdings:{x:{reason:'newest',conviction:3}}}),dB=C.build(S3,d0,2000);
  assert.equal(C.apply(C.merge(dA,dB),base()).holdings.x.reason,'newest');
  assert.equal(C.apply(C.merge(dB,dA),base()).holdings.x.reason,'newest');
}
// --- concurrent edits to different fields/records both survive ---
{
  const start=st({coins:[{id:'a',name:'A'},{id:'b',name:'B'}],holdings:{a:{reason:'',conviction:0,qty:1}}}),d0=legacy(start);
  const onA=C.build(st({coins:[{id:'a',name:'A'},{id:'b',name:'B'}],holdings:{a:{reason:'thesis from A',conviction:0,qty:1}}}),d0,1000);
  const onB=C.build(st({coins:[{id:'a',name:'A'},{id:'b',name:'B2'}],holdings:{a:{reason:'',conviction:5,qty:1}}}),d0,1500);
  const m=C.apply(C.merge(onA,onB),start);
  assert.equal(m.holdings.a.reason,'thesis from A');assert.equal(m.holdings.a.conviction,5);assert.equal(m.coins.find(c=>c.id==='b').name,'B2');
}
// --- empty never overwrites: a fresh empty shell created after sync stays legacy ---
{
  const d0=C.build(st({holdings:{x:{reason:'keep',qty:2}}}),null,0);
  const shell=C.build(st({holdings:{x:{reason:'keep',qty:2},y:{reason:'',qty:0}}}),d0,5000);
  assert.equal(shell.recs['holding:y'].t,0);
  const other=legacy(st({holdings:{y:{reason:'real',qty:3}}}));
  assert.equal(C.apply(C.merge(shell,other),base()).holdings.y.reason,'real');
}
// --- explicit clear after sync propagates (stamped edit beats older stamped value) ---
{
  const d0=legacy(st({holdings:{x:{reason:'text'}}}));
  const a=C.build(st({holdings:{x:{reason:'text2'}}}),d0,1000),b=C.build(st({holdings:{x:{reason:''}}}),a,2000);
  assert.equal(C.apply(C.merge(a,b),base()).holdings.x.reason,'');
}
// --- union by id, order kept, new appended ---
{
  const a=legacy(st({coins:[{id:'1'},{id:'2'}]})),b=legacy(st({coins:[{id:'3'},{id:'1'}]}));
  assert.deepEqual(C.apply(C.merge(a,b),st({coins:[{id:'1'},{id:'2'}]})).coins.map(c=>c.id),['1','2','3']);
}
// --- tombstones ---
{
  const start=st({coins:[{id:'a',n:1},{id:'b',n:1}]}),d0=legacy(start);
  const del=C.build(st({coins:[{id:'a',n:1}]}),d0,3000);
  assert.equal(del.tombs['coin:b'],3000);
  const m=C.merge(del,d0);
  assert.deepEqual(C.apply(m,start).coins.map(c=>c.id),['a'],'deleted record does not resurrect from a stale device');
  const edited=C.build(st({coins:[{id:'a',n:1},{id:'b',n:2}]}),d0,4000);
  assert.deepEqual(C.apply(C.merge(del,edited),start).coins.map(c=>c.id),['a','b'],'an edit after the delete wins');
  const recreated=C.build(st({coins:[{id:'a',n:1},{id:'b',n:9}]}),del,5000);
  assert.equal(recreated.tombs['coin:b'],undefined);
  assert.deepEqual(C.apply(C.merge(recreated,del),start).coins.map(c=>c.id),['a','b']);
  const old=C.build(st({coins:[{id:'a',n:1}]}),d0,1000);
  const pruned=C.build(st({coins:[{id:'a',n:1}]}),old,1000+C.TOMB_TTL+10);
  assert.equal(pruned.tombs['coin:b'],undefined,'tombstones pruned after 90 days');
}
// --- lists unioned, pairs keyed by strategy not random id ---
{
  const a=legacy(st({removedDefaults:['x'],migrations:['m1'],appliedImports:['i1'],farmingPairs:[{id:'pair_aa',gap:'xag',name:'A'}]}));
  const b=legacy(st({removedDefaults:['y'],migrations:['m1','m2'],farmingPairs:[{id:'pair_bb',gap:'xag',name:'A'}]}));
  const m=C.apply(C.merge(a,b),base());
  assert.deepEqual(m.removedDefaults,['x','y']);assert.deepEqual(m.migrations,['m1','m2']);assert.deepEqual(m.appliedImports,['i1']);assert.equal(m.farmingPairs.length,1);
}
// --- farmingExtra + scenario + reflections round trip ---
{
  const S=st({farmingExtra:{venueMeta:{v:{tier:'핵심'}},points:{v:{n:3}},pnl:[{id:'p1',date:'2026-01-01',gapPnl:1}],target:{min:100,max:200},ui:{open:true}},scenario:{text:'s',updatedAt:5},reflections:{text:'r'},farmingPairs:[]});
  const out=C.apply(C.merge(legacy(S),legacy(base())),base());
  assert.deepEqual(out.farmingExtra,S.farmingExtra);assert.deepEqual(out.scenario,S.scenario);assert.deepEqual(out.reflections,S.reflections);assert.deepEqual(out.farmingPairs,[]);
  assert.equal(C.apply(legacy(base()),base()).farmingPairs,null,'uninitialised pairs stay null');
}
// --- build keeps stamps for unchanged records ---
{
  const S=st({coins:[{id:'a',n:1}]}),d1=C.build(S,legacy(S),9);
  assert.equal(d1.recs['coin:a'].t,0);assert.ok(C.sameDoc(d1,legacy(S)));
}

// --- key hashing ---
{
  const key=crypto.randomBytes(16).toString('base64url');
  assert.equal(hashKey(key),crypto.createHash('sha256').update(key).digest('hex'));
  assert.equal(storageKey(key),'cp:sync:'+hashKey(key));assert.ok(!storageKey(key).includes(key));
}

// --- handler: not configured, auth, payload limit, rev conflict retry ---
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cpsync-')),store=new FileStore(dir);
const key=crypto.randomBytes(16).toString('base64url');
assert.deepEqual(await handleSync({method:'GET',key,text:'',store:null}),{status:503,body:{configured:false}});
assert.deepEqual(await handleSync({method:'PUT',key,text:'{}',store:null}),{status:503,body:{configured:false}});
assert.equal((await handleSync({method:'GET',key:'',text:'',store})).body.configured,true,'status probe needs no key');
assert.equal((await handleSync({method:'GET',key:'short',text:'',store:store})).status,401);
assert.equal((await handleSync({method:'PUT',key:'',text:'{}',store})).status,401);
assert.equal((await handleSync({method:'PUT',key,text:'x'.repeat(MAX_BODY+1),store})).status,413);
assert.equal((await handleSync({method:'PUT',key,text:'not json',store})).status,400);
assert.equal((await handleSync({method:'PUT',key,text:JSON.stringify({baseRev:0,doc:{}}),store})).status,400);
assert.equal((await handleSync({method:'GET',key,text:'',store})).body.doc,null);
const docA=legacy(st({coins:[{id:'a'}]})),docB=legacy(st({coins:[{id:'b'}]}));
let r=await handleSync({method:'PUT',key,text:JSON.stringify({baseRev:0,doc:docA}),store});assert.deepEqual(r,{status:200,body:{configured:true,rev:1}});
r=await handleSync({method:'PUT',key,text:JSON.stringify({baseRev:0,doc:docB}),store});
assert.equal(r.status,409);assert.equal(r.body.rev,1);assert.deepEqual(r.body.doc.recs['coin:a'].v,{id:'a'});
// client-style retry: merge the returned remote and push at the new rev, nothing lost
const merged=C.merge(docB,r.body.doc);
r=await handleSync({method:'PUT',key,text:JSON.stringify({baseRev:r.body.rev,doc:merged}),store});assert.equal(r.status,200);assert.equal(r.body.rev,2);
const got=(await handleSync({method:'GET',key,text:'',store})).body;
assert.deepEqual(C.apply(got.doc,base()).coins.map(c=>c.id).sort(),['a','b']);
const other=crypto.randomBytes(16).toString('base64url');
assert.equal((await handleSync({method:'GET',key:other,text:'',store})).body.doc,null,'keys are isolated');
// concurrent writers: exactly one wins per rev
const key2=crypto.randomBytes(16).toString('base64url');
const rs=await Promise.all([1,2,3,4].map(()=>handleSync({method:'PUT',key:key2,text:JSON.stringify({baseRev:0,doc:docA}),store})));
assert.equal(rs.filter(x=>x.status===200).length,1);assert.equal(rs.filter(x=>x.status===409).length,3);
// storage failure -> 502, no leak
const bad={get:async()=>{throw new Error('boom')},put:async()=>{throw new Error('boom')}};
assert.equal((await handleSync({method:'GET',key,text:'',store:bad})).status,502);

// --- env fallback + Upstash wire format ---
assert.equal(storeFromEnv({}),null);
assert.ok(storeFromEnv({KV_REST_API_URL:'https://a',KV_REST_API_TOKEN:'t'}) instanceof UpstashStore);
assert.ok(storeFromEnv({UPSTASH_REDIS_REST_URL:'https://a',UPSTASH_REDIS_REST_TOKEN:'t'}) instanceof UpstashStore);
assert.equal(storeFromEnv({KV_REST_API_URL:'https://a'}),null);
const calls=[];
const up=new UpstashStore('https://u.example/','tok',async(url,o)=>{calls.push({url,o,body:JSON.parse(o.body)});const cmd=JSON.parse(o.body)[0];return {ok:true,json:async()=>({result:cmd==='HMGET'?['3','{"recs":{}}']:[1,4,'']})};});
assert.deepEqual(await up.get('cp:sync:abc'),{rev:3,data:'{"recs":{}}'});
assert.deepEqual(await up.put('cp:sync:abc',3,'D'),{ok:true,rev:4,data:null});
assert.equal(calls[0].o.headers.Authorization,'Bearer tok');assert.equal(calls[1].body[0],'EVAL');assert.deepEqual(calls[1].body.slice(2),['1','cp:sync:abc','3','D']);
console.log('sync tests passed');
fs.rmSync(dir,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exit(1);});
