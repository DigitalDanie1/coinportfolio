/* 크로스 거래소 갭 트레이딩: 같은 자산의 두 거래소 가격 차이를 보고 진입 타이밍을 잡는다.
   다리 시세 출처: hl(하이퍼리퀴드·HIP-3 포함), vr(Variational 공개 통계), arcus(Arcus 공개 마켓), manual(공개 API 없음 → 직접 입력).
   Entropy의 OpenAI·Anthropic은 하이퍼리퀴드 io 덱스 마켓이라 hl로 읽는다. 갭 = A 가격 − B 가격. */
const GAP_STRATEGIES=[
  {id:'xag', name:'XAG 은 · Hyperliquid ↔ Variational', a:{venue:'Hyperliquid', label:'SILVER', src:{hl:'xyz:SILVER'}}, b:{venue:'Variational', label:'XAG', src:{vr:'XAG'}},
   why:'같은 은(silver) 가격이 두 거래소에서 벌어졌다 좁혀지는 것을 노린다. 갭이 벌어졌을 때 비싼 쪽 숏 / 싼 쪽 롱.'},
  {id:'btc', name:'BTC · Arcus 숏 ↔ Robinhood 롱', a:{venue:'Arcus', label:'BTC-USD', src:{arcus:'BTC-USD'}}, b:{venue:'Robinhood', label:'BTC', src:{manual:true}},
   why:'Arcus 숏 + Robinhood 롱. 펀딩이 거의 고정이라 갭이 벌어질 때 진입. Robinhood 퍼프는 공개 시세 API가 없어 가격을 직접 입력.'},
  {id:'openai', name:'OpenAI · Hyperliquid ↔ Entropy', a:{venue:'Hyperliquid', label:'vntl:OPENAI', src:{hl:'vntl:OPENAI'}}, b:{venue:'Entropy', label:'OpenAI', src:{hl:'io:OAI'}},
   why:'프리IPO 퍼프라 두 마켓 가격이 크게 출렁인다. 갭이 좁아지면 정리.'},
  {id:'anthropic', name:'Anthropic · Hyperliquid ↔ Entropy', a:{venue:'Hyperliquid', label:'vntl:ANTHROPIC', src:{hl:'vntl:ANTHROPIC'}}, b:{venue:'Entropy', label:'Anthropic', src:{hl:'io:ANTH'}},
   why:'OpenAI와 같은 방식. 펀딩과 갭 변동을 함께 본다.'},
];
const gapFeed={px:{},at:0,loading:false,error:'',failed:{}};
const GAP_STALE_MIN=30;

// ── 순수 계산 (테스트 대상)
// 갭($)과 갭(%): 퍼센트는 두 가격의 평균 기준이라 어느 쪽이 기준인지 정하지 않아도 된다.
function gapCalc(a,b){
  a=Number(a);b=Number(b);
  if(!(a>0)||!(b>0))return null;
  const gap=a-b;return {gap,pct:gap/((a+b)/2)*100};
}
// 트리거: 갭 절대값이 기준 이상이면 진입 구간. 기준은 $ 또는 %.
function gapTrigger(calc,trigger){
  const v=trigger&&Number(trigger.value);
  if(!calc||!(v>0))return {set:false,hit:false,ratio:null};
  const cur=Math.abs(trigger.unit==='$'?calc.gap:calc.pct);
  return {set:true,hit:cur>=v,ratio:cur/v};
}
// 진입 갭 대비 수렴 손익(단위당): 벌어진 방향으로 진입했다면 갭이 좁아질 때 이득.
function gapConvergence(entry,current){
  entry=Number(entry);current=Number(current);
  if(!Number.isFinite(entry)||!Number.isFinite(current)||entry===0)return null;
  return (entry-current)*Math.sign(entry);
}
function manualAge(m,now){
  if(!m||!(Number(m.price)>0)||!m.at)return null;
  const mins=Math.max(0,Math.floor((now-m.at)/60000));return {mins,stale:mins>=GAP_STALE_MIN};
}
const ageText=mins=>mins<1?'방금':mins<60?mins+'분 전':Math.floor(mins/60)+'시간 '+(mins%60)+'분 전';

// ── 시세 읽기: 소스 하나가 막혀도 나머지는 보여준다.
const gapKey=src=>src.hl?'hl:'+src.hl:src.vr?'vr:'+src.vr:src.arcus?'arcus:'+src.arcus:'';
async function loadGapFeed(force){
  if(gapFeed.loading||(!force&&Date.now()-gapFeed.at<60000))return;
  gapFeed.loading=true;gapFeed.error='';
  const legs=activeFarmingPairs().filter(p=>p.gap).map(p=>GAP_STRATEGIES.find(s=>s.id===p.gap)).filter(Boolean).flatMap(s=>[s.a,s.b]);
  const want=k=>legs.some(l=>l.src[k]);
  const keys=new Set(legs.map(l=>gapKey(l.src)).filter(Boolean));
  const put=(key,mark,funding)=>{if(mark>0&&keys.has(key))gapFeed.px[key]={mark,funding,at:Date.now()};};
  const task=(name,fn)=>fn().then(()=>{delete gapFeed.failed[name];}).catch(()=>{gapFeed.failed[name]=true;});
  const jobs=[];
  const dexes=[...new Set(legs.filter(l=>l.src.hl).map(l=>l.src.hl.includes(':')?l.src.hl.split(':')[0]:''))];
  for(const dex of dexes)jobs.push(task('hl:'+dex,async()=>{
    const [meta,ctxs]=await hlInfo(dex?{type:'metaAndAssetCtxs',dex}:{type:'metaAndAssetCtxs'});
    meta.universe.forEach((u,i)=>put('hl:'+u.name,+ctxs[i].markPx,+ctxs[i].funding*8760*100));// 시간당 펀딩 → 연환산 %
  }));
  if(want('vr'))jobs.push(task('vr',async()=>{
    const r=await fetch('https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats');if(!r.ok)throw 0;
    for(const x of (await r.json()).listings||[])put('vr:'+x.ticker,+x.mark_price,x.funding_rate==null?null:+x.funding_rate*100);// 연환산 소수 → %
  }));
  if(want('arcus'))jobs.push(task('arcus',async()=>{
    const r=await fetch('https://api.arcus.xyz/v1/markets');if(!r.ok)throw 0;
    for(const m of (await r.json()).markets||[])put('arcus:'+m.marketDisplayName,+m.markPrice,m.fundingRate==null?null:+m.fundingRate*8760*100);// 시간당 펀딩 → 연환산 %
  }));
  await Promise.all(jobs);
  gapFeed.at=Date.now();gapFeed.loading=false;
  const bad=Object.keys(gapFeed.failed);
  gapFeed.error=bad.length?'일부 시세를 불러오지 못했습니다 · 마지막 값을 표시합니다':'';
  if(currentTab==='farming')renderPairBoard();
}

// ── 카드
function gapLegView(leg,pair,now){
  const k=gapKey(leg.src);
  if(k){const x=gapFeed.px[k],stale=!x||now-x.at>180000;return {mark:x?.mark??null,funding:x?.funding??null,live:true,stale,at:x?.at,failed:!x&&!gapFeed.loading&&!!gapFeed.at};}
  const age=manualAge(pair.manual,now);
  return {mark:age?Number(pair.manual.price):null,funding:null,live:false,stale:age?age.stale:false,age,at:pair.manual?.at};
}
const gapNum=v=>v==null?'—':Math.abs(v)<1?v.toFixed(4):v.toLocaleString('en-US',{maximumFractionDigits:2,minimumFractionDigits:2});
const gapSigned=(v,suffix='')=>v==null?'—':(v>=0?'+':'−')+gapNum(Math.abs(v))+suffix;
function gapPairCard(pair){
  const s=GAP_STRATEGIES.find(x=>x.id===pair.gap);if(!s)return '';
  const now=Date.now(),A=gapLegView(s.a,pair,now),B=gapLegView(s.b,pair,now);
  const calc=gapCalc(A.mark,B.mark),trig=gapTrigger(calc,pair.trigger),entry=pair.entryGap==null||pair.entryGap===''?null:Number(pair.entryGap);
  const conv=calc&&entry!==null?gapConvergence(entry,calc.gap):null;
  const legHTML=(leg,v,side)=>{
    const f=v.funding==null?'펀딩 '+(v.live?'없음':'수동 입력 안 함'):`펀딩 ${v.funding>=0?'+':''}${v.funding.toFixed(1)}%/년`;
    const tag=v.live?(v.stale?'<em class="gap-tag warn">지연</em>':'<em class="gap-tag live">실시간</em>'):`<em class="gap-tag ${v.stale?'warn':''}">${v.age?(v.stale?'입력 '+ageText(v.age.mins)+' · 오래됨':'입력 '+ageText(v.age.mins)):'수동 입력'}</em>`;
    const price=v.live?`<b>${v.mark==null?'—':'$'+gapNum(v.mark)}</b>`:`<b>${v.mark==null?'—':'$'+gapNum(v.mark)}</b>`;
    const input=v.live?'':`<span class="gap-manual"><input type="number" step="any" min="0" inputmode="decimal" placeholder="가격 입력" data-gap-manual="${escapeHTML(pair.id)}" aria-label="${escapeHTML(leg.venue)} 가격 직접 입력" value="${v.mark==null?'':v.mark}"></span>`;
    return `<span class="gap-leg"><span class="gap-leg-head"><strong>${escapeHTML(leg.venue)}</strong><small>${escapeHTML(leg.label)}</small>${tag}</span>${price}<small>${f}</small>${input}</span>`;
  };
  const warn=[A,B].some(v=>!v.live&&v.stale)?`<p class="gap-warn" role="alert">직접 입력한 가격이 ${GAP_STALE_MIN}분 넘게 지났습니다. 갭이 실제와 다를 수 있어요.</p>`:'';
  const cls=trig.hit?' gap-hit':'';
  const trigText=trig.set?`갭 ≥ ${pair.trigger.value}${pair.trigger.unit==='$'?'$':'%'}면 진입 · ${trig.hit?'<b class="gap-hit-text">진입 구간</b>':`<span>${Math.min(999,trig.ratio*100).toFixed(0)}% 도달</span>`}`:'진입 기준 미설정';
  const dir=calc?(calc.gap>0?`${escapeHTML(s.a.venue)} 고평가 → ${escapeHTML(s.a.venue)} 숏 / ${escapeHTML(s.b.venue)} 롱 쪽`:calc.gap<0?`${escapeHTML(s.b.venue)} 고평가 → ${escapeHTML(s.b.venue)} 숏 / ${escapeHTML(s.a.venue)} 롱 쪽`:'갭 없음'):'';
  return `<article class="pair-card pair-card-compact gap-card${cls}"><div class="pair-card-head"><div><span class="pair-color-label">갭 트레이딩${trig.hit?' · 진입 구간':''}</span><h3>${escapeHTML(pair.name)}</h3></div><button class="btn" data-gap-edit="${escapeHTML(pair.id)}">설정</button></div><div class="gap-main"><small>현재 갭 (${escapeHTML(s.a.venue)} − ${escapeHTML(s.b.venue)})</small><strong class="${calc?calc.gap>=0?'up':'down':''}">${calc?gapSigned(calc.gap,' $'):'—'}<span>${calc?gapSigned(calc.pct,'%'):''}</span></strong>${dir?`<small>${dir}</small>`:''}</div><div class="gap-legs">${legHTML(s.a,A,'a')}${legHTML(s.b,B,'b')}</div>${warn}<div class="gap-rows"><span>진입 갭 <b>${entry===null?'미입력':gapSigned(entry,' $')}</b></span><span>진입 대비 수렴 <b class="${conv==null?'':conv>=0?'up':'down'}">${conv==null?'—':gapSigned(conv,' $/단위')}</b></span></div><div class="gap-trigger${cls}">${trigText}</div></article>`;
}
function gapSection(pairs){
  const list=(pairs||[]).filter(p=>p.gap);if(!list.length)return '';
  return `<section class="oi-section gap-section"><div class="oi-head"><div><h2>크로스 거래소 갭 트레이딩 · ${list.length}</h2><p>같은 자산의 두 거래소 가격 차이를 보고 진입 기준(트리거)을 넘으면 알려줍니다.</p></div><button class="btn" data-gap-refresh>${gapFeed.loading?'불러오는 중…':'시세 새로고침'}</button></div>${gapFeed.error?`<p class="down" role="alert">${escapeHTML(gapFeed.error)}</p>`:''}<div class="pair-grid oi-pair-grid">${list.map(gapPairCard).join('')}</div><p class="oi-foot">실시간: Hyperliquid(xyz·vntl·io 덱스), Variational 공개 통계, Arcus 공개 마켓. Entropy의 OpenAI·Anthropic은 Hyperliquid io 덱스 마켓입니다. Robinhood 퍼프는 공개 API가 없어 가격을 직접 입력하며 ${GAP_STALE_MIN}분이 지나면 경고합니다. 펀딩은 연환산 %.</p></section>`;
}

// ── 편집·입력
function saveGapPair(id,v){
  const p=farmingPairs.find(x=>x.id===id&&x.gap);if(!p)return false;
  const n=x=>x===''||x==null||!Number.isFinite(Number(x))?null:Number(x);
  p.entryGap=n(v.entryGap);
  const tv=n(v.trigValue);p.trigger=tv>0?{value:tv,unit:v.trigUnit==='$'?'$':'%'}:null;
  if('manualPrice' in v){const mp=n(v.manualPrice);p.manual=mp>0?{price:mp,at:Date.now()}:null;}
  return save();
}
function saveGapManual(id,value){
  const p=farmingPairs.find(x=>x.id===id&&x.gap);if(!p)return false;
  const n=value===''||!Number.isFinite(Number(value))?null:Number(value);
  p.manual=n>0?{price:n,at:Date.now()}:null;return save();
}
function openGapPair(id){
  const p=farmingPairs.find(x=>x.id===id&&x.gap),s=p&&GAP_STRATEGIES.find(x=>x.id===p.gap);if(!s)return;
  const manual=!gapKey(s.b.src)||!gapKey(s.a.src);
  document.getElementById('modal-body').innerHTML=`<div class="modal-head"><div class="minfo"><div class="ticker">갭 페어 설정</div><div class="name">${escapeHTML(p.name)}</div></div><button class="modal-close" onclick="closeModal()" aria-label="닫기">×</button></div><form id="gap-form">${field('entryGap','진입 갭 $ ('+escapeHTML(s.a.venue)+' − '+escapeHTML(s.b.venue)+')',p.entryGap,'number','step="any"')}<div class="pair-form-legs">${field('trigValue','진입 기준 (갭 ≥ X)',p.trigger?.value,'number','step="any" min="0"')}${selectField('trigUnit','기준 단위',[['%','% (평균가 대비)'],['$','$ (달러 차이)']],p.trigger?.unit||'%')}</div>${manual?field('manualPrice','직접 입력 가격 $',p.manual?.price,'number','step="any" min="0"'):''}<p class="form-help">갭의 절대값이 기준 이상이면 카드가 강조됩니다. 방향은 갭 부호로 판단하세요. 진입 갭은 실제로 진입했을 때의 갭을 기록해 수렴 손익을 봅니다.</p><div class="modal-actions"><button class="btn-save" type="submit">저장</button><button class="btn-del" type="button" id="delete-gap">페어 삭제</button></div></form>`;
  showModal();
  document.getElementById('gap-form').addEventListener('submit',e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget));if(v.manualPrice!==undefined&&(v.manualPrice===String(p.manual?.price??'')))delete v.manualPrice;if(saveGapPair(id,v)){closeModal();renderPairBoard();}});
  document.getElementById('delete-gap').addEventListener('click',()=>{if(confirm('이 갭 페어를 삭제할까요? 다시 심어지지 않습니다.')){farmingPairs=farmingPairs.filter(x=>x.id!==id);if(save()){closeModal();renderAll();}}});
}
document.getElementById('pair-board').addEventListener('click',e=>{
  const b=e.target.closest('[data-gap-edit],[data-gap-refresh]');if(!b)return;
  if(b.dataset.gapEdit)openGapPair(b.dataset.gapEdit);else loadGapFeed(true);
});
document.getElementById('pair-board').addEventListener('change',e=>{
  const id=e.target.dataset?.gapManual;if(!id)return;
  saveGapManual(id,e.target.value.trim());renderPairBoard();
});

// 갭 페어 4개를 한 번만 심는다. 삭제한 뒤 다시 살아나지 않는다.
function seedGapPairs(){
  if(migrations.includes('gap-pairs-v1'))return;
  if(farmingPairs===null)farmingPairs=[];
  for(const s of GAP_STRATEGIES){
    if(farmingPairs.some(p=>p.gap===s.id))continue;
    farmingPairs.push({id:genId('pair'),gap:s.id,name:s.name,ticker:'',long:{venue:s.a.venue,asset:s.a.label},short:{venue:s.b.venue,asset:s.b.label},reason:s.why,conviction:0,strategy:'크로스 거래소 갭 트레이딩',entryGap:null,trigger:null,manual:null});
  }
  migrations.push('gap-pairs-v1');save();
}
const initBeforeGap=initFarmingPairs;
initFarmingPairs=function(){seedGapPairs();initBeforeGap();};
const renderBeforeGap=renderTable;
renderTable=function(){renderBeforeGap();if(currentTab==='farming')loadGapFeed();};
// 파밍 탭을 보고 있는 동안 1분마다 시세를 새로 읽는다.
setInterval(()=>{if(currentTab==='farming'&&!document.hidden)loadGapFeed(true);},60000);
