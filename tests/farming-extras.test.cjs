const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const nodes=new Map(),storage=new Map();const el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,innerHTML:'',textContent:'',addEventListener(){},matches(){return false}});return nodes.get(id)};
const ctx=vm.createContext({console,URL,Date,AbortSignal,location:{protocol:'file:',origin:'null'},window:{addEventListener(){},scrollTo(){}},setTimeout,setInterval:()=>1,document:{activeElement:null,hidden:false,getElementById:el,querySelector:()=>({}),querySelectorAll:()=>[],addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
for(const [,src,code]of html.matchAll(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g)){if(code.includes('startAutomatic();'))continue;vm.runInContext(src?fs.readFileSync(path.join(root,src),'utf8'):code,ctx);}
const run=s=>vm.runInContext(s,ctx),J=v=>JSON.parse(JSON.stringify(v));

// 갭 계산
assert.deepEqual(J(run('gapCalc(110,100)')),{gap:10,pct:10/105*100});
assert.equal(run('gapCalc(0,100)'),null);assert.equal(run('gapCalc(null,5)'),null);
assert(Math.abs(run('gapCalc(100,110).pct')+run('gapCalc(110,100).pct'))<1e-9,'부호만 뒤집힌다');
// 트리거 상태 (절대값, 단위 % / $)
const calc='gapCalc(105,100)';
assert.equal(run(`gapTrigger(${calc},{value:4,unit:'%'}).hit`),true);
assert.equal(run(`gapTrigger(${calc},{value:6,unit:'%'}).hit`),false);
assert.equal(run(`gapTrigger(${calc},{value:5,unit:'$'}).hit`),true,'경계값은 진입 구간');
assert.equal(run(`gapTrigger(gapCalc(100,105),{value:5,unit:'$'}).hit`),true,'음의 갭도 절대값으로 본다');
assert.equal(run(`gapTrigger(${calc},null).set`),false);assert.equal(run('gapTrigger(null,{value:1,unit:"%"}).hit'),false);
// 수렴 손익
assert.equal(run('gapConvergence(10,4)'),6);assert.equal(run('gapConvergence(-10,-4)'),6);assert.equal(run('gapConvergence(10,14)'),-4);assert.equal(run('gapConvergence(0,3)'),null);assert.equal(run('gapConvergence(null,3)'),null);
// 수동 가격 경과
assert.deepEqual(J(run('manualAge({price:5,at:1000000},1000000+5*60000)')),{mins:5,stale:false});
assert.equal(run('manualAge({price:5,at:1000},31*60000+1000)').stale,true);assert.equal(run('manualAge(null,1)'),null);assert.equal(run('manualAge({price:0,at:1},2)'),null);

// 시드: 한 번만, 삭제 후 되살아나지 않음
run('load();initFarmingPairs()');
assert.equal(run('farmingPairs.filter(p=>p.gap).length'),4);assert.equal(run('farmingPairs.filter(p=>p.oi).length'),4);
assert.deepEqual(J(run('farmingPairs.filter(p=>p.gap).map(p=>p.gap)')),['xag','btc','openai','anthropic']);
assert(run("migrations.includes('gap-pairs-v1')"));
assert.equal(run('venueFarmingPairs().length'),0,'갭 페어는 거래소 슬롯을 쓰지 않는다');
run("farmingPairs=farmingPairs.filter(p=>p.gap!=='btc');save();load();initFarmingPairs();initFarmingPairs()");
assert.equal(run('farmingPairs.filter(p=>p.gap).length'),3,'삭제한 갭 페어는 다시 심기지 않는다');
// 기존 저장 데이터(migrations 없음)에서도 기존 페어를 건드리지 않고 시드
storage.set('coin-portfolio-v2',JSON.stringify({coins:[],farmingPairs:[{id:'keep',name:'Mine',long:{venue:'A'},short:{venue:'B'},reason:'x'}],migrations:['oi-pairs-v1']}));
run('load();initFarmingPairs()');assert.equal(run('farmingPairs[0].id'),'keep');assert.equal(run('farmingPairs.filter(p=>p.gap).length'),4);assert.equal(run('farmingExtra.pnl.length'),0,'새 상태는 기본값');
assert.equal(run('farmingExtra.target.min'),100);assert.equal(run('farmingExtra.target.max'),200);

// 거래소 메타: 기본값 시드 + 덮어쓰기 영속
assert.equal(run("venueMeta('variational').tier"),'핵심');assert.equal(run("venueMeta('risex').tier"),'헷지 전용');assert.equal(run("venueMeta('hello').tier"),'');
assert.equal(run("['arcus','entropy','robinhood','lighter'].every(k=>venueMeta(k).tier==='보조')"),true);
assert.equal(run("venueMeta('variational').tgeEta"),'TGE 임박 기대');
run("saveVenueMeta('hello',{tier:'보조',tgeEta:'6개월',note:'메모 <b>',cur:'120',goal:'1000'})");
run('load()');assert.equal(run("venueMeta('hello').tier"),'보조');assert.equal(run("venuePoints('hello').pct"),12);
assert.equal(run("venueMeta('variational').note.length>0"),true,'다른 거래소 기본값은 그대로');
run("saveVenueMeta('variational',{tier:'',tgeEta:'',note:''})");assert.equal(run("venueMeta('variational').tier"),'','빈 값 덮어쓰기는 기본값을 지운다');
run("resetVenueMeta('variational')");assert.equal(run("venueMeta('variational').tier"),'핵심');
assert.equal(run("saveVenueMeta('nope',{})"),false);
assert.equal(run("venuePoints('mnx').pct"),null,'포인트는 기본적으로 비어 있다');
run("renderVenueRoster()");const roster=run('renderVenueRoster()');assert(roster.includes('tier-badge core'));assert(roster.includes('venue-prog'));assert(roster.includes('&lt;b&gt;'),'메모는 이스케이프');assert(!roster.includes('메모 <b>'));

// 일별 손익 집계
const E=[{date:'2026-10-01',gapPnl:120,funding:30,fees:10},{date:'2026-10-01',gapPnl:-20,funding:0,fees:5},{date:'2026-09-30',gapPnl:80,funding:20,fees:0},{date:'2026-09-20',gapPnl:999,funding:0,fees:0}];
run('globalThis.E='+JSON.stringify(E));
let a=J(run("pnlAggregate(E,'2026-10-01',{min:100,max:200})"));
assert.equal(a.days['2026-10-01'].net,115);assert.equal(a.todayNet,115);assert.equal(a.days['2026-09-30'].net,100);
assert.equal(a.avgDays,7);assert(Math.abs(a.avg7-(115+100)/7)<1e-9,'7일 창 밖(9/20)은 제외, 기록 없는 날은 0');assert.equal(a.status,'below');
a=J(run("pnlAggregate([{date:'2026-10-01',gapPnl:150},{date:'2026-09-30',gapPnl:150}],'2026-10-01',{min:100,max:200})"));
assert.equal(a.avgDays,2);assert.equal(a.avg7,150);assert.equal(a.status,'in','기록 시작 후 7일 미만이면 시작일부터 평균');
assert.equal(J(run("pnlAggregate([{date:'2026-10-01',gapPnl:500}],'2026-10-01',{min:100,max:200})")).status,'above');
a=J(run("pnlAggregate([],'2026-10-01',{min:100,max:200})"));assert.equal(a.avg7,null);assert.equal(a.status,'none');assert.equal(a.todayNet,null);
assert.equal(run("dayShift('2026-03-01',-1)"),'2026-02-28');assert.equal(run("dayShift('2026-01-01',-1)"),'2025-12-31');
// 추가·수정·삭제·영속
run('farmingExtra.pnl=[]');
const e1=run("savePnlEntry({date:'2026-10-01',pair:'XAG',gapPnl:'50',funding:'10',fees:'5',note:'n'})");assert.equal(e1.gapPnl,50);
assert.equal(run("savePnlEntry({date:'bad'})"),null);
run(`savePnlEntry({id:'${e1.id}',date:'2026-10-01',gapPnl:70,funding:10,fees:5})`);assert.equal(run('farmingExtra.pnl.length'),1);assert.equal(run('pnlNet(farmingExtra.pnl[0])'),75);
run('farmingExtra=normFarmingExtra();load()');assert.equal(run('farmingExtra.pnl.length'),1,'저장·재로드 후 유지');
assert(run('pnlSection()').includes('목표 $100–200/일'));
assert.equal(run(`deletePnlEntry('${e1.id}')`),true);assert.equal(run('farmingExtra.pnl.length'),0);assert.equal(run("deletePnlEntry('x')"),false);

// 플레이북: 접힘 상태 기억, 라벨
assert(run('playbookCard()').includes('커뮤니티 메모 · 다른 사람의 경험'));assert(!/<details[^>]*open/.test(run('playbookCard()')),'collapsed by default');
run('farmingExtra.ui.playbookOpen=true');assert(/<details[^>]*open/.test(run('playbookCard()')));
run('save();farmingExtra=normFarmingExtra();load()');assert.equal(run('farmingExtra.ui.playbookOpen'),true);
// 플레이북 수치는 내 데이터에 들어가지 않는다
assert(!JSON.stringify(run('farmingExtra')).includes('9,000'));

// 정상화: 손상된 입력
assert.deepEqual(J(run("normFarmingExtra({venueMeta:[],points:5,pnl:'x',target:{min:'a'},ui:null})")),{venueMeta:{},points:{},pnl:[],target:{min:100,max:200},ui:{}});
// 백업 포함
assert(/exportBackup[\s\S]*?farmingPairs, farmingExtra,/.test(html),'export에 farmingExtra');assert(html.includes('farmingExtra = normFarmingExtra(data.farmingExtra)'),'import에 farmingExtra');

// 카드 렌더: 실시간/수동, 트리거 강조, 경고
run("farmingPairs=[];migrations=[];initFarmingPairs();gapFeed.px={'hl:xyz:SILVER':{mark:61,funding:0,at:Date.now()},'vr:XAG':{mark:60,funding:0,at:Date.now()},'hl:vntl:OPENAI':{mark:1300,funding:1,at:Date.now()},'hl:io:OAI':{mark:1600,funding:2,at:Date.now()},'arcus:BTC-USD':{mark:83700,funding:11,at:Date.now()}};gapFeed.at=Date.now()");
const xag=run("gapPairCard(farmingPairs.find(p=>p.gap==='xag'))");assert(xag.includes('+1.00 $'),xag);assert(xag.includes('실시간'));assert(!xag.includes('gap-hit'),'트리거 없으면 강조 없음');
run("saveGapPair(farmingPairs.find(p=>p.gap==='xag').id,{entryGap:'2',trigValue:'1.5',trigUnit:'%'})");
const hit=run("gapPairCard(farmingPairs.find(p=>p.gap==='xag'))");assert(hit.includes('gap-hit'));assert(hit.includes('진입 구간'));assert(hit.includes('+1.00 $/단위'),'진입 갭 2 → 현재 1 = +1');
const btc=run("gapPairCard(farmingPairs.find(p=>p.gap==='btc'))");assert(btc.includes('data-gap-manual'));assert(btc.includes('수동 입력'),'Robinhood는 수동');assert(btc.includes('—'));
run("saveGapManual(farmingPairs.find(p=>p.gap==='btc').id,'83650')");
let b=run("gapPairCard(farmingPairs.find(p=>p.gap==='btc'))");assert(b.includes('+50.00 $'),b);assert(b.includes('입력 방금'));assert(!b.includes('gap-warn'));
run("farmingPairs.find(p=>p.gap==='btc').manual.at=Date.now()-45*60000");
b=run("gapPairCard(farmingPairs.find(p=>p.gap==='btc'))");assert(b.includes('gap-warn'));assert(b.includes('오래됨'));assert(b.includes('45분 전'));
assert(run("gapSection(activeFarmingPairs())").includes('크로스 거래소 갭 트레이딩 · 4'));
console.log('PASS: gap seeding once, gap/trigger/convergence math, manual staleness, venue meta overrides, points progress, P&L aggregation/CRUD, playbook collapse state, backup fields and safe markup.');
