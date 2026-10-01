/* 파밍 탭 부가 기능: 거래소 메타(티어·TGE·메모)와 포인트 목표, 참고 플레이북, 일별 손익 로그.
   모든 값은 farmingExtra에 저장되고 백업에 포함된다. 참고 플레이북의 수치는 다른 사람의 메모이며 내 데이터와 섞지 않는다. */
const VENUE_TIERS=['','핵심','보조','헷지 전용'];
const tierClass=t=>t==='핵심'?'core':t==='보조'?'sub':t==='헷지 전용'?'hedge':'';
const fxNum=v=>v===''||v==null||!Number.isFinite(Number(v))?null:Number(v);
const fxSave=()=>save();

// ── 거래소 메타: 기본값은 FARMING_VENUES, 사용자가 고친 값은 키별로 덮어쓴다.
function venueMeta(key){
  const v=FARMING_VENUES.find(x=>x.key===key)||{},o=farmingExtra.venueMeta[key]||{};
  const pick=f=>f in o?String(o[f]??''):v[f]||'';
  return {tier:pick('tier'),tgeEta:pick('tgeEta'),note:pick('note')};
}
function venuePoints(key){
  const p=farmingExtra.points[key]||{},cur=fxNum(p.cur),goal=fxNum(p.goal);
  return {cur,goal,pct:goal>0&&cur!==null?Math.max(0,Math.min(100,cur/goal*100)):null};
}
function saveVenueMeta(key,values){
  if(!FARMING_VENUES.some(v=>v.key===key))return false;
  const tier=VENUE_TIERS.includes(values.tier)?values.tier:'';
  farmingExtra.venueMeta[key]={tier,tgeEta:String(values.tgeEta||'').trim().slice(0,30),note:String(values.note||'').trim().slice(0,140)};
  const cur=fxNum(values.cur),goal=fxNum(values.goal);
  if(cur===null&&goal===null)delete farmingExtra.points[key];else farmingExtra.points[key]={cur,goal};
  return fxSave();
}
function resetVenueMeta(key){delete farmingExtra.venueMeta[key];delete farmingExtra.points[key];return fxSave();}
// 칩 안의 작은 티어 배지와 포인트 진행 막대.
function venueChipExtras(v){
  const m=venueMeta(v.key),p=venuePoints(v.key);
  return (m.tier?`<small class="tier-badge ${tierClass(m.tier)}">${escapeHTML(m.tier)}</small>`:'')+(p.pct!==null?`<i class="venue-prog" style="--p:${p.pct.toFixed(0)}%" title="포인트 ${p.cur.toLocaleString()} / ${p.goal.toLocaleString()}"></i>`:'');
}
function venueMetaPanel(){
  const open=farmingExtra.ui.metaOpen!==false;
  const rows=FARMING_VENUES.map(v=>{
    const m=venueMeta(v.key),p=venuePoints(v.key);
    const prog=p.goal>0?`<div class="vm-prog" title="${p.cur===null?'현재 포인트 미입력':''}"><span style="width:${(p.pct??0).toFixed(0)}%"></span></div><small>${p.cur===null?'—':p.cur.toLocaleString()} / ${p.goal.toLocaleString()}${p.pct!==null?` · ${p.pct.toFixed(0)}%`:''}</small>`:`<small class="vm-none">포인트 목표 없음</small>`;
    return `<div class="vm-row"><span class="vm-name"><span class="venue-mark">${v.logo?`<img src="${escapeHTML(v.logo)}" alt="" loading="lazy" onerror="this.remove()">`:''}<b>${escapeHTML(v.name.slice(0,2).toUpperCase())}</b></span><strong>${escapeHTML(v.name)}</strong>${m.tier?`<small class="tier-badge ${tierClass(m.tier)}">${escapeHTML(m.tier)}</small>`:''}</span><span class="vm-eta">${escapeHTML(m.tgeEta||'—')}</span><span class="vm-note" title="${escapeHTML(m.note)}">${escapeHTML(m.note||'')}</span><span class="vm-pts">${prog}</span><button type="button" class="btn" data-venue-edit="${v.key}" aria-label="${escapeHTML(v.name)} 메타·포인트 편집">편집</button></div>`;
  }).join('');
  return `<details class="venue-meta" data-fx-details="metaOpen" ${open?'open':''}><summary>거래소 티어 · TGE · 포인트 목표 <span>${FARMING_VENUES.filter(v=>venuePoints(v.key).goal>0).length}곳 목표 설정</span></summary><div class="vm-list">${rows}</div></details>`;
}
function openVenueMeta(key){
  const v=FARMING_VENUES.find(x=>x.key===key);if(!v)return;
  const m=venueMeta(key),p=venuePoints(key);
  document.getElementById('modal-body').innerHTML=`<div class="modal-head"><div class="minfo"><div class="ticker">${escapeHTML(v.name)}</div><div class="name">티어 · TGE 전망 · 메모 · 포인트 목표</div></div><button class="modal-close" onclick="closeModal()" aria-label="닫기">×</button></div><form id="venue-form">${selectField('tier','티어',VENUE_TIERS.map(t=>[t,t||'미지정']),m.tier)}${field('tgeEta','TGE 전망',m.tgeEta,'text','maxlength="30" placeholder="예: TGE 임박 기대, 1년+"')}${field('note','한 줄 메모',m.note,'text','maxlength="140"')}<div class="pair-form-legs">${field('cur','현재 포인트',p.cur,'number','step="any" min="0"')}${field('goal','목표 포인트',p.goal,'number','step="any" min="0"')}</div><p class="form-help">포인트는 내가 직접 기록하는 값입니다. 비워 두면 진행 막대가 표시되지 않습니다.</p><div class="modal-actions"><button class="btn-save" type="submit">저장</button><button class="btn-del" type="button" id="reset-venue">기본값으로</button></div></form>`;
  showModal();
  document.getElementById('venue-form').addEventListener('submit',e=>{e.preventDefault();if(saveVenueMeta(key,Object.fromEntries(new FormData(e.currentTarget)))){closeModal();renderPairBoard();}});
  document.getElementById('reset-venue').addEventListener('click',()=>{if(confirm('이 거래소의 티어·메모·포인트를 기본값으로 되돌릴까요?')&&resetVenueMeta(key)){closeModal();renderPairBoard();}});
}

// ── 참고 플레이북: 다른 사람의 메모. 접힘 상태를 기억한다.
const PLAYBOOK={
  principles:[
    '포인트는 보너스다. 갭과 펀딩으로 본전 이상을 만드는 것이 먼저.',
    '목표는 하루 $100–200 생활비 수준의 수익. 그래야 오래 한다.',
    'Variational을 빼면 TGE까지 1년 이상을 예상하고 움직인다.',
    '진입 전 호가창(오더북) 깊이와 펀딩을 먼저 본다.'],
  venues:[
    ['Variational (핵심)','TGE가 가장 빠를 것으로 기대. Hyperliquid ↔ Variational XAG(은) 갭 트레이딩으로 벌면서 파밍. 작성자 포인트 9,000 → 10,000 목표.'],
    ['Entropy','OpenAI·Anthropic 프리IPO 퍼프, 약 $600K 유지. 갭이 ±$100 출렁여 펀딩+갭 수익. 갭이 좁아지면 OpenAI는 정리했다고 함.'],
    ['Arcus','초기 단계. 메이저 페어는 퍼프-퍼프 갭이 좋음. BTC 펀딩은 거의 고정(약 0.0013%). Arcus 숏 + Robinhood 롱, 갭이 벌어질 때 진입.'],
    ['RiseX','쉽지만 포인트는 가치 없다고 보고 헷지 다리로만 사용.'],
    ['Robinhood · Lighter','서로 다른 두 거래소. 9월에 둘 다 파밍.']],
  lighter:'Lighter 선례: 프리마켓 최고 $4, TGE 당일 $2.5 이상. 에어드롭이 실제로 값을 한 기준선(보장은 아님).',
  edge:'Edge: 작성자가 뒤통수를 맞은 사례. 포인트·보상은 약속이 아니므로 한 곳에 비중을 몰지 않는다.'
};
function playbookCard(){
  const open=!farmingExtra.ui.playbookCollapsed,li=a=>a.map(x=>`<li>${escapeHTML(x)}</li>`).join('');
  return `<details class="playbook" data-fx-details="playbook" ${open?'open':''}><summary><span class="pb-title">참고 플레이북</span><span class="pb-tag">커뮤니티 메모 · 다른 사람의 경험</span></summary><p class="pb-warn">아래 수치와 판단은 다른 사람의 글 요약입니다. 내 보유·포인트 데이터와 무관하며 참고용입니다.</p><div class="pb-grid"><section><h4>원칙</h4><ul>${li(PLAYBOOK.principles)}</ul></section><section><h4>거래소별 메모</h4><ul>${PLAYBOOK.venues.map(([n,t])=>`<li><b>${escapeHTML(n)}</b> ${escapeHTML(t)}</li>`).join('')}</ul></section><section><h4>기준선 · 주의</h4><ul><li>${escapeHTML(PLAYBOOK.lighter)}</li><li class="pb-edge">${escapeHTML(PLAYBOOK.edge)}</li></ul></section></div></details>`;
}

// ── 일별 손익 로그
const dayStr=d=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
function dayShift(date,n){const [y,m,d]=date.split('-').map(Number),t=new Date(Date.UTC(y,m-1,d+n));return dayStr(t);}
const pnlNet=e=>(fxNum(e.gapPnl)||0)+(fxNum(e.funding)||0)-(fxNum(e.fees)||0);
// 일별 합계, 오늘 순손익, 최근 7일 평균(기록 시작 후 7일 미만이면 시작일부터), 목표 구간 대비 상태.
function pnlAggregate(entries,today,target){
  const by={};
  for(const e of entries||[]){const d=by[e.date]||={date:e.date,gap:0,funding:0,fees:0,net:0,n:0};d.gap+=fxNum(e.gapPnl)||0;d.funding+=fxNum(e.funding)||0;d.fees+=fxNum(e.fees)||0;d.net+=pnlNet(e);d.n++;}
  const dates=Object.keys(by).sort(),first=dates[0];
  let days=0,sum=0;
  if(first&&first<=today){for(let i=0;i<7;i++){const d=dayShift(today,-i);if(d<first)break;days++;sum+=by[d]?.net||0;}}
  const avg7=days?sum/days:null,t=target||{min:100,max:200};
  const status=avg7===null?'none':avg7<t.min?'below':avg7>t.max?'above':'in';
  return {days:by,list:dates.reverse().map(d=>by[d]),todayNet:by[today]?.net??null,avg7,avgDays:days,status,target:t};
}
const fxMoney=v=>v==null?'—':(v<0?'−':'')+'$'+Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2});
const fxSigned=v=>`<b class="${v>0?'up':v<0?'down':''}">${fxMoney(v)}</b>`;
function pnlSection(){
  const a=pnlAggregate(farmingExtra.pnl,localDate(),farmingExtra.target),t=a.target,open=farmingExtra.ui.pnlOpen!==false;
  const scale=Math.max(t.max*1.5,a.avg7||0,a.todayNet||0,1),pc=v=>Math.max(0,Math.min(100,v/scale*100)).toFixed(1);
  const label={none:'기록 없음',below:'목표 구간 미달',in:'목표 구간 안',above:'목표 구간 초과'}[a.status];
  const entries=[...farmingExtra.pnl].sort((x,y)=>y.date.localeCompare(x.date)).slice(0,24);
  const names=[...new Set([...activeFarmingPairs().map(p=>p.name),...FARMING_VENUES.map(v=>v.name)])];
  const rows=entries.map(e=>`<div class="pnl-row"><span class="pnl-date">${escapeHTML(e.date)}</span><span class="pnl-what">${escapeHTML(e.pair||'—')}${e.note?`<small>${escapeHTML(e.note)}</small>`:''}</span><span class="pnl-parts"><small>갭 ${fxMoney(fxNum(e.gapPnl)||0)} · 펀딩 ${fxMoney(fxNum(e.funding)||0)} · 수수료 ${fxMoney(-(fxNum(e.fees)||0))}</small></span><span class="pnl-net">${fxSigned(pnlNet(e))}</span><button type="button" class="btn" data-pnl-edit="${escapeHTML(e.id||'')}">수정</button></div>`).join('');
  return `<details class="pnl-card" data-fx-details="pnlOpen" ${open?'open':''}><summary>일별 손익 로그 <span>목표 $${t.min}–${t.max}/일 · 7일 평균 ${a.avg7===null?'—':fxMoney(a.avg7)}</span></summary><div class="pnl-top"><div class="pnl-stat"><small>오늘 순손익</small><strong>${a.todayNet===null?'—':fxSigned(a.todayNet)}</strong></div><div class="pnl-stat"><small>7일 평균${a.avgDays&&a.avgDays<7?` (${a.avgDays}일)`:''}</small><strong>${a.avg7===null?'—':fxSigned(a.avg7)}</strong></div><div class="pnl-stat"><small>목표 대비</small><strong class="pnl-st-${a.status}">${label}</strong></div></div><div class="pnl-band" role="img" aria-label="일 목표 $${t.min}–${t.max}"><i class="pnl-target" style="left:${pc(t.min)}%;width:${(pc(t.max)-pc(t.min)).toFixed(1)}%"></i>${a.avg7===null?'':`<i class="pnl-mark" style="left:${pc(a.avg7)}%" title="7일 평균"></i>`}${a.todayNet===null?'':`<i class="pnl-mark pnl-mark-today" style="left:${pc(a.todayNet)}%" title="오늘"></i>`}</div><div class="pnl-legend"><span>$0</span><span>목표 띠 $${t.min}–${t.max}</span><span>$${Math.round(scale)}</span></div><div class="pnl-actions"><button type="button" class="btn" data-pnl-add>+ 오늘 손익 기록</button><label class="pnl-target-edit">목표 $<input type="number" data-pnl-target="min" value="${t.min}" min="0" step="10" aria-label="일 목표 최소"> – <input type="number" data-pnl-target="max" value="${t.max}" min="0" step="10" aria-label="일 목표 최대"></label></div>${rows?`<div class="pnl-list">${rows}</div>${farmingExtra.pnl.length>entries.length?`<p class="oi-foot">최근 ${entries.length}건만 표시 · 전체 ${farmingExtra.pnl.length}건은 백업에 포함됩니다.</p>`:''}`:'<p class="oi-foot">아직 기록이 없습니다. 갭 손익·펀딩·수수료를 적으면 일별 순손익을 계산합니다.</p>'}<datalist id="pnl-names">${names.map(n=>`<option value="${escapeHTML(n)}">`).join('')}</datalist></details>`;
}
function savePnlEntry(entry){
  const e={id:entry.id||genId('pnl'),date:String(entry.date||'').slice(0,10),pair:String(entry.pair||'').trim().slice(0,60),gapPnl:fxNum(entry.gapPnl),funding:fxNum(entry.funding),fees:fxNum(entry.fees),note:String(entry.note||'').trim().slice(0,140)};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(e.date))return null;
  const i=farmingExtra.pnl.findIndex(x=>x.id===e.id);
  if(i>=0)farmingExtra.pnl[i]=e;else farmingExtra.pnl.push(e);
  return fxSave()?e:null;
}
function deletePnlEntry(id){const n=farmingExtra.pnl.length;farmingExtra.pnl=farmingExtra.pnl.filter(e=>e.id!==id);return farmingExtra.pnl.length<n&&fxSave();}
function openPnlEntry(id){
  const e=farmingExtra.pnl.find(x=>x.id===id)||{date:localDate()};
  document.getElementById('modal-body').innerHTML=`<div class="modal-head"><div class="minfo"><div class="ticker">${id?'손익 수정':'손익 기록'}</div><div class="name">갭 손익 + 펀딩 − 수수료 = 순손익 (USD)</div></div><button class="modal-close" onclick="closeModal()" aria-label="닫기">×</button></div><form id="pnl-form">${field('date','날짜',e.date,'date','required')}${field('pair','거래소 / 페어 (선택)',e.pair,'text','maxlength="60" list="pnl-names"')}<div class="pair-form-legs">${field('gapPnl','갭 손익 $',e.gapPnl,'number','step="any"')}${field('funding','펀딩 $',e.funding,'number','step="any"')}${field('fees','수수료 $ (비용은 양수)',e.fees,'number','step="any"')}</div>${field('note','메모',e.note,'text','maxlength="140"')}<p id="pnl-error" role="alert" class="down"></p><div class="modal-actions"><button class="btn-save" type="submit">저장</button>${id?'<button class="btn-del" type="button" id="delete-pnl">삭제</button>':''}</div></form>`;
  showModal();
  document.getElementById('pnl-form').addEventListener('submit',ev=>{ev.preventDefault();const r=savePnlEntry({...Object.fromEntries(new FormData(ev.currentTarget)),id});if(r){closeModal();renderPairBoard();}else document.getElementById('pnl-error').textContent='날짜를 확인하거나 저장 공간을 확인하세요.';});
  document.getElementById('delete-pnl')?.addEventListener('click',()=>{if(confirm('이 손익 기록을 삭제할까요?')&&deletePnlEntry(id)){closeModal();renderPairBoard();}});
}

// ── 보드 연결
const fxBoard=document.getElementById('pair-board');
fxBoard.addEventListener('click',e=>{
  const b=e.target.closest('[data-venue-edit],[data-pnl-add],[data-pnl-edit]');if(!b)return;
  if(b.dataset.venueEdit)openVenueMeta(b.dataset.venueEdit);
  else if(b.hasAttribute('data-pnl-add'))openPnlEntry();
  else openPnlEntry(b.dataset.pnlEdit);
});
// 접힘 상태 기억 (toggle은 버블링하지 않아 캡처로 받는다).
fxBoard.addEventListener('toggle',e=>{
  const k=e.target.dataset?.fxDetails;if(!k)return;
  const f=k==='playbook'?'playbookCollapsed':k,v=k==='playbook'?!e.target.open:e.target.open;
  if((k==='playbook'?!!farmingExtra.ui[f]:farmingExtra.ui[f]!==false)===v)return;
  farmingExtra.ui[f]=v;fxSave();
},true);
fxBoard.addEventListener('change',e=>{
  const k=e.target.dataset?.pnlTarget;if(!k)return;
  const v=fxNum(e.target.value);if(v===null||v<0)return renderPairBoard();
  farmingExtra.target[k]=v;
  if(farmingExtra.target.min>farmingExtra.target.max)farmingExtra.target[k==='min'?'max':'min']=v;
  fxSave();renderPairBoard();
});
function farmingTop(){return playbookCard();}
