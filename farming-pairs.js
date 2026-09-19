/* Pair records reference account legs; they do not duplicate or place orders. */
// The nine pre-TGE venues being farmed. Aliases cover how each is typed into a pair leg.
const FARMING_VENUES=[
  {key:'risex',     name:'RiseX',       logo:'logos/risex.png',     site:'https://risex.exchange', aliases:['risex','rise x','rise']},
  {key:'truenorth', name:'Truenorth',   logo:'logos/truenorth.ico', site:'https://truenorth.xyz',  aliases:['truenorth','true north','tn']},
  {key:'arcus',     name:'Arcus',       logo:'logos/arcus.png',     site:'https://arcus.trade',    aliases:['arcus']},
  {key:'entropy',   name:'Entropy',     logo:'logos/entropy.png',   site:'https://entropy.trade',  aliases:['entropy']},
  {key:'hello',     name:'Hello Trade', logo:'logos/hello.svg',     site:'https://hello.trade',    aliases:['hello trade','hellotrade','hello']},
  {key:'mnx',       name:'MNX',         logo:'logos/mnx.ico',       site:'https://mnx.fi',         aliases:['mnx']},
  {key:'pacifica',  name:'Pacifica',    logo:'logos/pacifica.png',  site:'https://pacifica.fi',    aliases:['pacifica','pacfica','pacficia']},
  {key:'qfex',      name:'QFEX',        logo:'logos/qfex.svg',      site:'https://qfex.com',       aliases:['qfex']},
  {key:'quote',     name:'Quote',       logo:null,                  site:null,                     aliases:['quote']}
];
function venueUsage(){
  const typed=new Set(farmingPairs.flatMap(p=>{const m=pairMetrics(p);return [m.long.venue,m.short.venue];}).filter(Boolean).map(v=>v.trim().toLowerCase()));
  return FARMING_VENUES.map(v=>({...v,active:[...typed].some(t=>v.aliases.some(a=>t===a||t.includes(a)))}));
}
function renderVenueRoster(){
  const venues=venueUsage(),done=venues.filter(v=>v.active).length;
  const chip=v=>{
    const mark=`<span class="venue-mark">${v.logo?`<img src="${escapeHTML(v.logo)}" alt="" loading="lazy" onerror="this.remove()">`:''}<b>${escapeHTML(v.name.slice(0,2).toUpperCase())}</b></span><span>${escapeHTML(v.name)}</span>`;
    return v.site
      ? `<a class="venue-chip${v.active?' on':''}" href="${escapeHTML(v.site)}" target="_blank" rel="noopener noreferrer">${mark}</a>`
      : `<span class="venue-chip${v.active?' on':''}">${mark}</span>`;
  };
  return `<div class="venue-roster"><div class="venue-roster-head"><strong>파밍 대상 ${FARMING_VENUES.length}곳</strong><span>${done}곳 페어에 연결됨 · ${FARMING_VENUES.length-done}곳 미연결</span></div><div class="venue-grid">${venues.map(chip).join('')}</div></div>`;
}
const PAIR_PLAN=[
  {id:'pair-quote-truenorth', name:'Quote × Truenorth', long:'Quote',  short:'Truenorth'},
  {id:'pair-qfex-risex',      name:'QFEX × RiseX',      long:'QFEX',   short:'RiseX'},
  {id:'pair-arcus-entropy',   name:'Arcus × Entropy',   long:'Arcus',  short:'Entropy'}
];
const PAIR_STRATEGY='공식 적립 조건 확인 → 양쪽 동일 기초자산 수량 설정 → 7일 포인트와 순비용 비교 → 순노출·비용 한도 초과 시 재검토';
function planPair(p){
  return {id:p.id,name:p.name,ticker:'',
    long:{venue:p.long,side:'long',manual:true},
    short:{venue:p.short,side:'short',manual:true},
    reason:'',conviction:0,strategy:PAIR_STRATEGY};
}
function initFarmingPairs(){
  if(farmingPairs===null){farmingPairs=PAIR_PLAN.map(planPair);save();return;}
  // Seed any planned pair a saved book predates, leaving the user's own pairs alone.
  let changed=false;
  for(const p of PAIR_PLAN)if(!farmingPairs.some(x=>x.id===p.id)){farmingPairs.push(planPair(p));changed=true;}
  if(changed){
    // Drop the original unnamed placeholders, but only while still untouched.
    const blank=p=>/^pair-[123]$/.test(p.id)&&!p.ticker&&!p.reason&&!p.conviction&&!p.long?.venue&&!p.short?.venue&&!p.long?.positionId&&!p.short?.positionId;
    farmingPairs=farmingPairs.filter(p=>!blank(p));
    save();
  }
}
function pairNumber(value){return value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);}
function pairLeg(pair,side){
  const saved=pair[side]||{};
  if(!saved.positionId)return {...saved,side,ticker:pair.ticker,manual:true};
  const live=farming.find(p=>p.id===saved.positionId);
  if(!live||live.closed)return {...saved,quantity:null,mark:null,invalid:'연결 포지션 없음 / 종료됨'};
  const quote=live.source==='hyperliquid'?perpFeed.data?.find(x=>x.symbol===live.ticker):null;
  return {...saved,...live,venue:live.name||live.venue,mark:quote?.mark??null,stale:live.stale||perpFeed.stale,points7:saved.points7,cost7:saved.cost7,asOf:saved.asOf,ruleUrl:saved.ruleUrl};
}
function pairMetrics(pair){
  const long=pairLeg(pair,'long'),short=pairLeg(pair,'short');
  const norm=s=>String(s||'').toUpperCase().replace(/[-/]?PERP$/,'');
  const ql=pairNumber(long.quantity),qs=pairNumber(short.quantity);
  const valid=!long.invalid&&!short.invalid&&long.side==='long'&&short.side==='short'&&norm(long.ticker)&&norm(long.ticker)===norm(short.ticker)&&ql>0&&qs>0&&long.venue&&short.venue&&long.venue.trim().toLowerCase()!==short.venue.trim().toLowerCase();
  const net=valid?ql-qs:null,imbalance=valid?Math.abs(net)/Math.max(ql,qs)*100:null;
  const lm=pairNumber(long.mark),sm=pairNumber(short.mark);
  const gross=valid&&lm>0&&sm>0?ql*lm+qs*sm:null;
  const stale=!!(long.stale||short.stale);
  return {long,short,net,imbalance,gross,stale,status:!valid?'구성 확인 필요':stale?'저장 데이터 · 노출 재확인':imbalance<.01?'수량 균형':`수량 차이 ${imbalance.toFixed(2)}%`};
}
function pairEfficiency(leg){const points=pairNumber(leg.points7),cost=pairNumber(leg.cost7);return points>0&&cost!==null?cost/points:null;}
function renderPairBoard(){
  initFarmingPairs();
  const query=document.getElementById('asset-search').value.trim().toLowerCase(),held=document.getElementById('held-only').checked;
  const pairs=farmingPairs.filter(p=>{const m=pairMetrics(p);return (!query||[p.name,p.ticker,m.long.venue,m.short.venue,p.reason,p.strategy].join(' ').toLowerCase().includes(query))&&(!held||pairNumber(m.long.quantity)>0||pairNumber(m.short.quantity)>0);}).sort((a,b)=>{const diff=sortCol==='conviction'?(a.conviction||0)-(b.conviction||0):sortCol==='name'?a.name.localeCompare(b.name):0;return sortAsc?diff:-diff;});
  const venueNames=new Set(farmingPairs.flatMap(p=>{const m=pairMetrics(p);return [m.long.venue,m.short.venue].filter(Boolean).map(x=>x.trim().toLowerCase());}));
  const legHTML=(leg,side)=>{const efficiency=pairEfficiency(leg);return `<div class="pair-leg"><div class="pair-leg-heading"><span class="${side==='long'?'up':'down'}">${side==='long'?'LONG':'SHORT'}</span><strong>${escapeHTML(leg.venue||'거래소 미연결')}</strong></div><div class="pair-leg-values"><span>수량 <b>${pairNumber(leg.quantity)??'—'}</b></span><span>마크 <b>${pairNumber(leg.mark)===null?'—':fP(Number(leg.mark))}</b></span><span>7일 포인트 <b>${pairNumber(leg.points7)??'—'}</b></span><span>7일 순비용 <b>${pairNumber(leg.cost7)===null?'—':money(Number(leg.cost7))}</b></span></div><small>${efficiency===null?'포인트당 비용 · 데이터 필요':`포인트당 비용 $${efficiency.toFixed(4)}`} · ${leg.asOf?escapeHTML(leg.asOf)+' 기준':'집계일 미입력'}</small><small>${leg.invalid?escapeHTML(leg.invalid):leg.manual?'계좌 미연결 · 수동 기록':escapeHTML(syncLabel(leg))}</small></div>`;};
  document.getElementById('pair-board').innerHTML=`${renderVenueRoster()}<div class="pair-overview"><strong>${farmingPairs.length} 페어 <span>· ${venueNames.size}/${FARMING_VENUES.length} 거래소 설정</span></strong><p>동일 기초자산의 롱 + 숏 · 거래소별 포인트와 유지 비용을 함께 비교</p></div><div class="pair-sort"><button class="btn" onclick="sortBy('conviction')">Conviction ${sortCol==='conviction'?(sortAsc?'↑':'↓'):'↕'}</button></div><div class="pair-grid">${pairs.map(p=>{const m=pairMetrics(p);return `<article class="pair-card"><div class="pair-card-head"><div><h3>${escapeHTML(p.name)} <small>${escapeHTML(p.ticker||'마켓 미설정')}</small></h3><span class="pair-balance">${escapeHTML(m.status)}</span></div><button class="btn" data-pair-edit="${escapeHTML(p.id)}">페어 설정</button></div><div class="pair-legs">${legHTML(m.long,'long')}${legHTML(m.short,'short')}</div><div class="pair-net"><span>순수량 <b>${m.net===null?'—':Number(m.net.toPrecision(8))+' '+escapeHTML(p.ticker)}</b></span><span>총 명목가치 <b>${m.gross===null?'—':money(m.gross)}</b></span></div><p class="pair-strategy">${escapeHTML(p.strategy||'포인트 전략: 거래소별 적립 기준과 비용을 확인한 뒤 작성하세요.')}</p><p class="pair-thesis">${escapeHTML(p.reason||'Thesis 미작성')} <span>· Conviction ${p.conviction||'—'}/5</span></p></article>`;}).join('')||'<p class="form-help">조건에 맞는 페어가 없습니다.</p>'}</div><p class="form-help">선형 PERP의 기초자산 수량 기준입니다. 수량 균형은 청산·거래소·베이시스 위험을 없애지 않습니다. 포인트 단위는 거래소마다 달라 합산하거나 거래소 간 단순 순위를 매기지 않습니다.</p><button class="btn" onclick="openPosition('farming')">+ 개별 포지션 기록</button><p class="form-help">기존 개별 포지션은 아래에 보존되며, 페어 설정에서 연결할 수 있습니다.</p>`;
  document.getElementById('book-title').textContent='DEX PERP · 델타 뉴트럴 페어';
  document.getElementById('book-description').textContent=`${farmingPairs.length}페어 · ${FARMING_VENUES.length}거래소의 노출 균형과 포인트 효율 관리`;
  document.getElementById('add-position').textContent='+ 페어 추가';
}
const renderBeforePairs=renderTable;
renderTable=function(){renderBeforePairs();const board=document.getElementById('pair-board');if(!board)return;board.hidden=currentTab!=='farming';if(currentTab==='farming')renderPairBoard();};
const addBeforePairs=addCurrentPosition;
addCurrentPosition=function(){if(currentTab==='farming')openFarmingPair();else addBeforePairs();};
document.getElementById('pair-board').addEventListener('click',event=>{const button=event.target.closest('[data-pair-edit]');if(button)openFarmingPair(button.dataset.pairEdit);});
function openFarmingPair(id){
  initFarmingPairs();const pair=farmingPairs.find(p=>p.id===id)||{name:'페어 '+(farmingPairs.length+1),long:{},short:{}};
  const legFields=side=>{const leg=pair[side]||{};return `<fieldset class="pair-fieldset"><legend>${side==='long'?'LONG · 거래소 A':'SHORT · 거래소 B'}</legend>${selectField(side+'-positionId','기존 계좌 포지션 연결',[['','직접 기록 / 계좌 연결 전'],...farming.filter(p=>!p.closed).map(p=>[p.id,`${p.name} · ${p.ticker||''} · ${p.side}`])],leg.positionId||'')}${field(side+'-venue','거래소 이름',leg.venue,'text','maxlength="80"')}${field(side+'-quantity','수량 · 기초자산 단위',leg.quantity,'number','min="0" step="any"')}${field(side+'-mark','현재 마크 · USD',leg.mark,'number','min="0" step="any"')}${field(side+'-points7','최근 7일 획득 포인트',leg.points7,'number','min="0" step="any"')}${field(side+'-cost7','동일 7일 순비용 · USD',leg.cost7,'number','step="any" placeholder="수수료 + 슬리피지 + 지급 펀딩 − 수취 펀딩"')}${field(side+'-asOf','7일 집계 종료일',leg.asOf,'date')}${field(side+'-ruleUrl','공식 포인트 규칙 링크',leg.ruleUrl,'url','placeholder="https://…"')}</fieldset>`;};
  document.getElementById('modal-body').innerHTML=`<div class="modal-head"><div class="minfo"><div class="ticker">${id?'페어 설정':'페어 추가'}</div><div class="name">두 거래소의 동일 기초자산 · 롱 / 숏</div></div><button class="modal-close" onclick="closeModal()" aria-label="닫기">×</button></div><form id="pair-form">${field('name','페어 이름',pair.name,'text','required maxlength="80"')}${field('ticker','공통 기초자산',pair.ticker,'text','maxlength="30" placeholder="BTC, ETH…"')}<div class="pair-form-legs">${legFields('long')}${legFields('short')}</div><p class="form-help">계좌 포지션을 연결하면 거래소·방향·수량은 계좌 값을 사용합니다. 지원되는 마크는 자동 갱신됩니다. 포인트 API 연결 전에는 동일 기간의 실제 적립 내역을 기록하세요. 미입력은 0으로 계산하지 않습니다.</p><div class="field"><label for="pair-strategy">포인트 전략 · 적립 조건 / 비용 한도 / 중단 조건</label><textarea id="pair-strategy" name="strategy">${escapeHTML(pair.strategy||'')}</textarea></div><div class="field"><label for="pair-reason">Thesis</label><textarea id="pair-reason" name="reason">${escapeHTML(pair.reason||'')}</textarea></div>${selectField('conviction','Conviction',[[0,'미지정'],[1,'1'],[2,'2'],[3,'3'],[4,'4'],[5,'5']].map(([v,l])=>[String(v),l]),String(pair.conviction||0))}<p id="pair-error" role="alert" class="down"></p><div class="modal-actions"><button class="btn-save" type="submit">페어 저장</button>${id?'<button class="btn-del" type="button" id="delete-pair">페어 삭제</button>':''}</div></form>`;
  showModal();
  document.getElementById('pair-form').addEventListener('submit',event=>{
    event.preventDefault();if(!event.currentTarget.reportValidity())return;
    const values=Object.fromEntries(new FormData(event.currentTarget)),next={...pair,id:pair.id||genId('pair'),name:values.name.trim(),ticker:values.ticker.trim().toUpperCase(),reason:values.reason,strategy:values.strategy,conviction:Number(values.conviction)};
    for(const side of ['long','short']){next[side]={};for(const key of ['positionId','venue','quantity','mark','points7','cost7','asOf','ruleUrl']){const value=values[side+'-'+key];next[side][key]=['quantity','mark','points7','cost7'].includes(key)?pairNumber(value):value.trim();}}
    const errors=validateFarmingPair(next);
    if(errors){document.getElementById('pair-error').textContent=errors;return;}
    const index=farmingPairs.findIndex(p=>p.id===id);if(index>=0)farmingPairs[index]=next;else farmingPairs.push(next);
    if(save()){closeModal();renderAll();}
  });
  document.getElementById('delete-pair')?.addEventListener('click',()=>{if(confirm('페어 연결을 삭제할까요? 개별 포지션 기록은 유지됩니다.')){farmingPairs=farmingPairs.filter(p=>p.id!==id);if(save()){closeModal();renderAll();}}});
}
function validateFarmingPair(pair){
  for(const side of ['long','short']){
    const leg=pair[side],live=leg.positionId&&farming.find(p=>p.id===leg.positionId);
    if(leg.positionId&&(!live||live.closed||live.side!==side))return '연결할 포지션의 롱 / 숏 방향과 활성 상태를 확인하세요.';
    if(leg.positionId&&farmingPairs.some(p=>p.id!==pair.id&&[p.long?.positionId,p.short?.positionId].includes(leg.positionId)))return '이 포지션은 이미 다른 페어에 연결되어 있습니다.';
    if(leg.ruleUrl&&!/^https:\/\//i.test(leg.ruleUrl))return '공식 규칙 링크는 https 주소를 사용하세요.';
  }
  const a=pairLeg(pair,'long'),b=pairLeg(pair,'short');
  if(a.venue&&b.venue&&a.venue.trim().toLowerCase()===b.venue.trim().toLowerCase())return '서로 다른 두 거래소를 선택하세요.';
  const norm=s=>String(s||'').toUpperCase().replace(/[-/]?PERP$/,'');
  if((a.positionId||b.positionId)&&(!pair.ticker||norm(a.ticker)!==norm(pair.ticker)||norm(b.ticker)!==norm(pair.ticker)))return '페어와 양쪽 포지션의 기초자산이 같아야 합니다.';
  return '';
}
