/* Pair records reference account legs; they do not duplicate or place orders. */
// User-selected farming venues. Aliases cover names entered into pair legs.
const FARMING_VENUES=[
  {key:'risex',     name:'RiseX',       logo:'logos/risex.png',     site:'https://risex.exchange', aliases:['risex','rise x','rise']},
  {key:'truenorth', name:'Truenorth',   logo:'logos/truenorth.ico', site:'https://truenorth.xyz',  aliases:['truenorth','true north','tn']},
  {key:'arcus',     name:'Arcus',       logo:'logos/arcus.png',     site:'https://arcus.trade',    aliases:['arcus']},
  {key:'entropy',   name:'Entropy',     logo:'logos/entropy.png',   site:'https://entropy.trade',  aliases:['entropy']},
  {key:'hello',     name:'Hello Trade', logo:'logos/hello.svg',     site:'https://hello.trade',    aliases:['hello trade','hellotrade','hello']},
  {key:'mnx',       name:'MNX',         logo:'logos/mnx.ico',       site:'https://mnx.fi',         aliases:['mnx']},
  {key:'pacifica',  name:'Pacifica',    logo:'logos/pacifica.png',  site:'https://pacifica.fi',    aliases:['pacifica','pacfica','pacficia']},
  {key:'qfex',      name:'QFEX',        logo:'logos/qfex.svg',      site:'https://qfex.com',       aliases:['qfex']},
  {key:'quote',     name:'Quote',       logo:null,                  site:null,                     aliases:['quote']},
  {key:'n1',        name:'N1',          logo:'logos/n1.png',        site:'https://n1.xyz',         aliases:['n1','n 1','n1.xyz','01 exchange','01.xyz']},
  {key:'titanx', name:'TitanX', logo:'logos/titanx.ico', site:'https://waitlist.titanx.cc/', aliases:['titanx','titan x','titan']},
  {key:'derpetual', name:'Derpetual', logo:'logos/derpetual.ico', site:'https://www.derpetual.com/', aliases:['derpetual']}
];
const MAX_FARMING_PAIRS=Math.floor(FARMING_VENUES.length/2);
const PAIR_STRATEGY='공식 적립 조건 확인 → 양쪽 동일 기초자산 수량 설정 → 7일 포인트와 순비용 비교 → 순노출·비용 한도 초과 시 재검토';
let selectedVenue=null,pairPickerMessage='';
function activeFarmingPairs(){return (farmingPairs||[]).filter(p=>!p.archived);}
function venueKey(name){const value=String(name||'').trim().toLowerCase();return FARMING_VENUES.find(v=>v.aliases.includes(value))?.key||value;}
function venuePair(key){return activeFarmingPairs().find(p=>['long','short'].some(side=>venueKey(pairLeg(p,side).venue)===key));}
function venueUsage(){return FARMING_VENUES.map(v=>({...v,active:!!venuePair(v.key)}));}
function initFarmingPairs(){
  let changed=false;
  if(farmingPairs===null){farmingPairs=[];changed=true;}
  const used=new Set();
  for(const pair of activeFarmingPairs()){
    let slot=pair.colorSlot;
    if(!Number.isInteger(slot)||slot<0||slot>=MAX_FARMING_PAIRS||used.has(slot)){
      slot=Array.from({length:MAX_FARMING_PAIRS},(_,i)=>i).find(n=>!used.has(n));
      if(slot!==undefined){pair.colorSlot=slot;changed=true;}
    }
    if(slot!==undefined)used.add(slot);
  }
  if(changed)save();
}
function pairColorAttributes(pair){return Number.isInteger(pair?.colorSlot)?`data-pair-color="${pair.colorSlot}"`:'';}
function pairColorLabel(pair){return Number.isInteger(pair?.colorSlot)?`페어 ${pair.colorSlot+1}`:'페어 연결됨';}

function renderVenueRoster(){
  const venues=venueUsage(),done=venues.filter(v=>v.active).length;
  const selected=FARMING_VENUES.find(v=>v.key===selectedVenue);
  const hint=pairPickerMessage||(selected?`${selected.name} 선택됨 · 함께 묶을 두 번째 거래소를 선택하세요`:'거래소 심볼 2개를 누르면 즉시 페어가 만들어집니다.');
  return `<div class="venue-roster" id="venue-picker"><div class="venue-roster-head"><strong>거래소 선택 · ${activeFarmingPairs().length}/${MAX_FARMING_PAIRS} 페어</strong><span>${done}/${FARMING_VENUES.length} 거래소 연결</span></div><p class="pair-picker-hint" role="status" aria-live="polite">${escapeHTML(hint)}</p><div class="venue-grid">${venues.map(v=>{
    const pair=venuePair(v.key),chosen=selectedVenue===v.key;
    return `<button type="button" class="venue-chip${v.active?' on':''}${chosen?' selected':''}" ${pairColorAttributes(pair)} data-venue-pick="${v.key}" aria-pressed="${chosen}" aria-label="${escapeHTML(v.name)}${pair?' · '+pairColorLabel(pair)+' · '+escapeHTML(pair.name)+'에 연결됨':' 선택'}"><span class="venue-mark">${v.logo?`<img src="${escapeHTML(v.logo)}" alt="" loading="lazy" onerror="this.remove()">`:''}<b>${escapeHTML(v.name.slice(0,2).toUpperCase())}</b></span><span>${escapeHTML(v.name)}<small>${chosen?'첫 번째 선택':pair?pairColorLabel(pair):'선택 가능'}</small></span></button>`;
  }).join('')}</div><div class="pair-picker-footer"><span>먼저 고른 거래소는 Long, 다음은 Short로 시작합니다. 방향은 페어에서 바꿀 수 있습니다.</span>${selected?'<button class="btn" data-pair-cancel>선택 취소</button>':''}</div></div>`;
}
function selectFarmingVenue(key){
  initFarmingPairs();const venue=FARMING_VENUES.find(v=>v.key===key);if(!venue)return;
  pairPickerMessage='';
  if(key===selectedVenue){selectedVenue=null;renderPairBoard();return;}
  const existing=venuePair(key);
  if(existing){if(!selectedVenue){openFarmingPair(existing.id);return;}pairPickerMessage='이미 연결된 거래소입니다. 페어를 해제하면 다시 선택할 수 있습니다.';renderPairBoard();return;}
  if(activeFarmingPairs().length>=MAX_FARMING_PAIRS){pairPickerMessage=`${MAX_FARMING_PAIRS}개 페어가 모두 구성되었습니다. 기존 페어를 해제해 조합을 바꿔보세요.`;renderPairBoard();return;}
  if(!selectedVenue){selectedVenue=key;renderPairBoard();return;}
  const first=FARMING_VENUES.find(v=>v.key===selectedVenue);
  if(!first||venuePair(first.key)){selectedVenue=null;pairPickerMessage='거래소 연결이 변경되었습니다. 다시 선택하세요.';renderPairBoard();return;}
  const pair={id:genId('pair'),name:first.name+' × '+venue.name,ticker:'',long:{venue:first.name},short:{venue:venue.name},reason:'',conviction:0,strategy:PAIR_STRATEGY};
  farmingPairs.push(pair);
  if(!save()){farmingPairs.pop();pairPickerMessage='저장하지 못했습니다. 다시 선택해 주세요.';renderPairBoard();return;}
  selectedVenue=null;pairPickerMessage=pair.name+' 페어를 만들었습니다. 종목·수량은 나중에 설정할 수 있습니다.';
  document.getElementById('asset-search').value='';document.getElementById('held-only').checked=false;
  renderAll();
}
function unpairFarming(id){
  const pair=activeFarmingPairs().find(p=>p.id===id);if(!pair)return;
  pair.archived=true;
  if(!save()){delete pair.archived;return;}
  selectedVenue=null;pairPickerMessage=pair.name+' 연결을 해제했습니다. 기존 기록은 보관함에 남아 있습니다.';renderAll();
}
function swapFarmingSides(id){
  const pair=activeFarmingPairs().find(p=>p.id===id);if(!pair)return;
  if(pair.long.positionId||pair.short.positionId){pairPickerMessage='계좌에 연결된 포지션은 실제 방향을 따릅니다. 페어 설정에서 연결을 변경하세요.';renderPairBoard();return;}
  [pair.long,pair.short]=[pair.short,pair.long];
  if(!save()){[pair.long,pair.short]=[pair.short,pair.long];return;}renderAll();
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
  if(document.activeElement?.matches?.('[data-pair-wallet]'))return;
  const expanded=new Set([...document.querySelectorAll('details[data-pair-details][open]')].map(x=>x.dataset.pairDetails));
  initFarmingPairs();
  const query=document.getElementById('asset-search').value.trim().toLowerCase(),held=document.getElementById('held-only').checked;
  const pairs=activeFarmingPairs().filter(p=>{const m=pairMetrics(p);return (!query||[p.name,p.ticker,m.long.venue,m.short.venue,m.long.wallet,m.short.wallet,p.reason,p.strategy].join(' ').toLowerCase().includes(query))&&(!held||pairNumber(m.long.quantity)>0||pairNumber(m.short.quantity)>0);}).sort((a,b)=>{const diff=sortCol==='conviction'?(a.conviction||0)-(b.conviction||0):sortCol==='name'?a.name.localeCompare(b.name):0;return sortAsc?diff:-diff;});
  const venueNames=new Set(activeFarmingPairs().flatMap(p=>{const m=pairMetrics(p);return [m.long.venue,m.short.venue].filter(Boolean).map(x=>x.trim().toLowerCase());}));
  const legHTML=(leg,side)=>{const efficiency=pairEfficiency(leg);return `<div class="pair-leg"><div class="pair-leg-heading"><span class="${side==='long'?'up':'down'}">${side==='long'?'LONG':'SHORT'}</span><strong>${escapeHTML(leg.venue||'거래소 미연결')}</strong></div><div class="pair-leg-values"><span>수량 <b>${pairNumber(leg.quantity)??'—'}</b></span><span>마크 <b>${pairNumber(leg.mark)===null?'—':fP(Number(leg.mark))}</b></span><span>7일 포인트 <b>${pairNumber(leg.points7)??'—'}</b></span><span>7일 순비용 <b>${pairNumber(leg.cost7)===null?'—':money(Number(leg.cost7))}</b></span></div><small>${efficiency===null?'포인트당 비용 · 데이터 필요':`포인트당 비용 $${efficiency.toFixed(4)}`} · ${leg.asOf?escapeHTML(leg.asOf)+' 기준':'집계일 미입력'}</small><small>${leg.invalid?escapeHTML(leg.invalid):leg.manual?'계좌 미연결 · 수동 기록':escapeHTML(syncLabel(leg))}</small></div>`;};
  const compactLeg=(p,leg,side)=>`<div class="pair-compact-leg"><div class="pair-leg-heading"><span class="${side==='long'?'up':'down'}">${side==='long'?'LONG':'SHORT'}</span><strong>${escapeHTML(leg.venue||'미연결')}</strong><span class="pair-quantity">${pairNumber(leg.quantity)??'—'} ${escapeHTML(p.ticker||'')}</span></div><label class="pair-wallet-label"><span>사용 지갑</span><input type="text" data-pair-wallet="${escapeHTML(p.id)}" data-side="${side}" value="${escapeHTML(p[side]?.wallet||'')}" maxlength="200" placeholder="지갑 이름 또는 주소" aria-label="${escapeHTML(leg.venue||side)} 사용 지갑" autocomplete="off" spellcheck="false"></label></div>`;
  document.getElementById('pair-board').innerHTML=`${renderVenueRoster()}<div class="pair-dashboard-heading"><strong>${activeFarmingPairs().length}/${MAX_FARMING_PAIRS} 페어 <span>· ${venueNames.size}/${FARMING_VENUES.length} 거래소</span></strong><button class="btn" onclick="sortBy('conviction')">Conviction ${sortCol==='conviction'?(sortAsc?'↑':'↓'):'↕'}</button></div><div class="pair-grid">${pairs.map(p=>{const m=pairMetrics(p);return `<article class="pair-card pair-card-compact" ${pairColorAttributes(p)}><div class="pair-card-head"><div><span class="pair-color-label">${pairColorLabel(p)}</span><h3>${escapeHTML(p.name)}</h3></div><button class="btn" data-pair-edit="${escapeHTML(p.id)}">설정</button></div><div class="pair-compact-legs">${compactLeg(p,m.long,'long')}${compactLeg(p,m.short,'short')}</div><div class="pair-compact-summary"><span>${escapeHTML(p.ticker||'마켓 미설정')} · ${escapeHTML(m.status)}</span><strong>순수량 ${m.net===null?'—':Number(m.net.toPrecision(8))}</strong></div><small class="pair-wallet-status" data-wallet-status="${escapeHTML(p.id)}" role="status">지갑 입력 시 자동 저장</small><details class="pair-details" data-pair-details="${escapeHTML(p.id)}" ${expanded.has(p.id)?'open':''}><summary>포인트 · 비용 · 전략 보기 <span>Conviction ${p.conviction||'—'}/5</span></summary><div class="pair-legs">${legHTML(m.long,'long')}${legHTML(m.short,'short')}</div><div class="pair-net"><span>총 명목가치 <b>${m.gross===null?'—':money(m.gross)}</b></span></div><p class="pair-strategy">${escapeHTML(p.strategy||'전략 미작성')}</p><p class="pair-thesis">${escapeHTML(p.reason||'Thesis 미작성')}</p><div class="pair-card-actions"><button class="btn" data-pair-swap="${escapeHTML(p.id)}">Long / Short 전환</button><button class="btn" data-pair-unlink="${escapeHTML(p.id)}">페어 해제</button></div></details></article>`;}).join('')}${!query&&!held?Array.from({length:Math.max(0,MAX_FARMING_PAIRS-activeFarmingPairs().length)},()=>`<div class="pair-empty-slot"><strong>새 페어</strong><span>위에서 거래소 2개를 선택하세요.</span></div>`).join(''):''}</div><details class="pair-board-help"><summary>계산 기준 · 개별 포지션</summary><p class="form-help">선형 PERP의 기초자산 수량 기준입니다. 수량 균형은 청산·거래소·베이시스 위험을 없애지 않습니다. 포인트는 거래소별로 비교하세요.</p><button class="btn" onclick="openPosition('farming')">+ 개별 포지션 기록</button><p class="form-help">지갑 메모는 이 브라우저에 저장되며 계좌 자동 연결과 별개입니다. 기존 개별 포지션은 아래에 보존됩니다.</p></details>${farmingPairs.some(p=>p.archived)?`<details class="pair-archive"><summary>해제한 페어 기록 ${farmingPairs.filter(p=>p.archived).length}개</summary>${farmingPairs.filter(p=>p.archived).map(p=>`<button class="btn" data-pair-edit="${escapeHTML(p.id)}">${escapeHTML(p.name)} · 기록 보기</button>`).join('')}</details>`:''}`;
  document.getElementById('book-title').textContent='DEX PERP · 델타 뉴트럴 페어';
  document.getElementById('book-description').textContent=`${activeFarmingPairs().length}/${MAX_FARMING_PAIRS}페어 · ${FARMING_VENUES.length}거래소의 노출 균형과 포인트 효율 관리`;
  document.getElementById('add-position').textContent='거래소 2개 선택';
}
const renderBeforePairs=renderTable;
renderTable=function(){renderBeforePairs();const board=document.getElementById('pair-board');if(!board)return;board.hidden=currentTab!=='farming';if(currentTab==='farming')renderPairBoard();};
const addBeforePairs=addCurrentPosition;
addCurrentPosition=function(){if(currentTab==='farming'){selectedVenue=null;pairPickerMessage='심볼 두 개를 선택하세요.';renderPairBoard();document.getElementById('venue-picker')?.scrollIntoView({block:'center'});document.querySelector('[data-venue-pick]')?.focus();}else addBeforePairs();};
document.getElementById('pair-board').addEventListener('click',event=>{
  const b=event.target.closest('[data-venue-pick],[data-pair-edit],[data-pair-unlink],[data-pair-swap],[data-pair-cancel]');if(!b)return;
  if(b.dataset.venuePick)selectFarmingVenue(b.dataset.venuePick);
  else if(b.dataset.pairEdit)openFarmingPair(b.dataset.pairEdit);
  else if(b.dataset.pairUnlink)unpairFarming(b.dataset.pairUnlink);
  else if(b.dataset.pairSwap)swapFarmingSides(b.dataset.pairSwap);
  else {selectedVenue=null;pairPickerMessage='';renderPairBoard();}
});
function openFarmingPair(id){
  initFarmingPairs();const pair=farmingPairs.find(p=>p.id===id)||{name:'페어 '+(farmingPairs.length+1),long:{},short:{}};
  const legFields=side=>{const leg=pair[side]||{};return `<fieldset class="pair-fieldset"><legend>${side==='long'?'LONG · 거래소 A':'SHORT · 거래소 B'}</legend>${selectField(side+'-positionId','기존 계좌 포지션 연결',[['','직접 기록 / 계좌 연결 전'],...farming.filter(p=>!p.closed).map(p=>[p.id,`${p.name} · ${p.ticker||''} · ${p.side}`])],leg.positionId||'')}${field(side+'-venue','거래소 이름',leg.venue,'text','maxlength="80"')}${field(side+'-wallet','사용 지갑 · 이름 또는 주소',leg.wallet,'text','maxlength="200" placeholder="예: 메인 Rabby / 0x…"')}${field(side+'-quantity','수량 · 기초자산 단위',leg.quantity,'number','min="0" step="any"')}${field(side+'-mark','현재 마크 · USD',leg.mark,'number','min="0" step="any"')}${field(side+'-points7','최근 7일 획득 포인트',leg.points7,'number','min="0" step="any"')}${field(side+'-cost7','동일 7일 순비용 · USD',leg.cost7,'number','step="any" placeholder="수수료 + 슬리피지 + 지급 펀딩 − 수취 펀딩"')}${field(side+'-asOf','7일 집계 종료일',leg.asOf,'date')}${field(side+'-ruleUrl','공식 포인트 규칙 링크',leg.ruleUrl,'url','placeholder="https://…"')}</fieldset>`;};
  document.getElementById('modal-body').innerHTML=`<div class="modal-head"><div class="minfo"><div class="ticker">${id?'페어 설정':'페어 추가'}</div><div class="name">두 거래소의 동일 기초자산 · 롱 / 숏</div></div><button class="modal-close" onclick="closeModal()" aria-label="닫기">×</button></div><form id="pair-form">${field('name','페어 이름',pair.name,'text','required maxlength="80"')}${field('ticker','공통 기초자산',pair.ticker,'text','maxlength="30" placeholder="BTC, ETH…"')}<div class="pair-form-legs">${legFields('long')}${legFields('short')}</div><p class="form-help">계좌 포지션을 연결하면 거래소·방향·수량은 계좌 값을 사용합니다. 지원되는 마크는 자동 갱신됩니다. 포인트 API 연결 전에는 동일 기간의 실제 적립 내역을 기록하세요. 미입력은 0으로 계산하지 않습니다.</p><div class="field"><label for="pair-strategy">포인트 전략 · 적립 조건 / 비용 한도 / 중단 조건</label><textarea id="pair-strategy" name="strategy">${escapeHTML(pair.strategy||'')}</textarea></div><div class="field"><label for="pair-reason">Thesis</label><textarea id="pair-reason" name="reason">${escapeHTML(pair.reason||'')}</textarea></div>${selectField('conviction','Conviction',[[0,'미지정'],[1,'1'],[2,'2'],[3,'3'],[4,'4'],[5,'5']].map(([v,l])=>[String(v),l]),String(pair.conviction||0))}<p id="pair-error" role="alert" class="down"></p><div class="modal-actions"><button class="btn-save" type="submit">페어 저장</button>${id?'<button class="btn-del" type="button" id="delete-pair">페어 삭제</button>':''}</div></form>`;
  showModal();
  document.getElementById('pair-form').addEventListener('submit',event=>{
    event.preventDefault();if(!event.currentTarget.reportValidity())return;
    const values=Object.fromEntries(new FormData(event.currentTarget)),next={...pair,id:pair.id||genId('pair'),name:values.name.trim(),ticker:values.ticker.trim().toUpperCase(),reason:values.reason,strategy:values.strategy,conviction:Number(values.conviction)};
    for(const side of ['long','short']){next[side]={...pair[side]};for(const key of ['positionId','venue','wallet','quantity','mark','points7','cost7','asOf','ruleUrl']){const value=values[side+'-'+key]??'';next[side][key]=['quantity','mark','points7','cost7'].includes(key)?pairNumber(value):value.trim();}}
    const errors=validateFarmingPair(next);
    if(errors){document.getElementById('pair-error').textContent=errors;return;}
    const index=farmingPairs.findIndex(p=>p.id===id);if(index>=0)farmingPairs[index]=next;else farmingPairs.push(next);
    if(save()){closeModal();renderAll();}
  });
  document.getElementById('delete-pair')?.addEventListener('click',()=>{if(confirm('페어 연결을 삭제할까요? 개별 포지션 기록은 유지됩니다.')){farmingPairs=farmingPairs.filter(p=>p.id!==id);if(save()){closeModal();renderAll();}}});
}
function validateFarmingPair(pair){
  if(!pair.archived){
    if(!activeFarmingPairs().some(p=>p.id===pair.id)&&activeFarmingPairs().length>=MAX_FARMING_PAIRS)return `최대 ${MAX_FARMING_PAIRS}페어까지 만들 수 있습니다.`;
    for(const side of ['long','short']){
      const key=venueKey(pairLeg(pair,side).venue);
      if(key&&activeFarmingPairs().some(p=>p.id!==pair.id&&['long','short'].some(s=>venueKey(pairLeg(p,s).venue)===key)))return '이미 다른 페어에 연결된 거래소입니다.';
    }
  }

  for(const side of ['long','short']){
    const leg=pair[side],live=leg.positionId&&farming.find(p=>p.id===leg.positionId);
    if(leg.positionId&&(!live||live.closed||live.side!==side))return '연결할 포지션의 롱 / 숏 방향과 활성 상태를 확인하세요.';
    if(leg.positionId&&farmingPairs.some(p=>!p.archived&&p.id!==pair.id&&[p.long?.positionId,p.short?.positionId].includes(leg.positionId)))return '이 포지션은 이미 다른 페어에 연결되어 있습니다.';
    if(leg.ruleUrl&&!/^https:\/\//i.test(leg.ruleUrl))return '공식 규칙 링크는 https 주소를 사용하세요.';
  }
  const a=pairLeg(pair,'long'),b=pairLeg(pair,'short');
  if(a.venue&&b.venue&&a.venue.trim().toLowerCase()===b.venue.trim().toLowerCase())return '서로 다른 두 거래소를 선택하세요.';
  const norm=s=>String(s||'').toUpperCase().replace(/[-/]?PERP$/,'');
  if((a.positionId||b.positionId)&&(!pair.ticker||norm(a.ticker)!==norm(pair.ticker)||norm(b.ticker)!==norm(pair.ticker)))return '페어와 양쪽 포지션의 기초자산이 같아야 합니다.';
  return '';
}

function savePairWallet(id,side,value){
  const pair=farmingPairs.find(p=>p.id===id);
  if(!pair||!['long','short'].includes(side))return false;
  pair[side] ||= {};
  pair[side].wallet=String(value).slice(0,200);
  return save();
}
document.getElementById('pair-board').addEventListener('input',event=>{
  const input=event.target;if(!input.dataset.pairWallet)return;
  const ok=savePairWallet(input.dataset.pairWallet,input.dataset.side,input.value);
  const status=input.closest('.pair-card')?.querySelector('[data-wallet-status]');
  if(status)status.textContent=ok?'지갑 저장됨':'저장 실패 · 입력 내용을 별도로 보관하세요';
});
