// compare-chart.js — Individual coin comparison chart
(function(){
'use strict';

const PALETTE=[
  '#c8ff00','#ff6b35','#5b8def','#a78bfa','#22c55e',
  '#ef4444','#f59e0b','#06b6d4','#ec4899','#84cc16',
  '#14b8a6','#f97316','#8b5cf6','#10b981','#e879f9',
  '#facc15','#38bdf8','#fb923c','#a3e635','#2dd4bf',
  '#818cf8','#fbbf24','#34d399','#f472b6','#67e8f9',
  '#d946ef','#4ade80','#fca5a5','#93c5fd','#fde047',
];

let selected=new Set(),selectionInitialized=false;
let rankingPeriod='7d',rankingOrder='desc';
let chartView='all';
const hiddenByScope=new Map();

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function getColor(idx){return idx<PALETTE.length?PALETTE[idx]:`hsl(${Math.round(idx*137.508)%360} 65% 48%)`;}

function gatherCoins(){
  const out=[];
  for(const coin of coins){
    const d=coin.gecko?mkt[coin.gecko]:null;
    const raw=(priceSeries(d)||[]).filter(p=>Number.isFinite(p)&&p>0);
    const norm=raw.length>=2?raw.map(p=>(p/raw[0]-1)*100):null;
    const value=rankingPeriod==='24h'?d?.price_change_percentage_24h:d?.price_change_percentage_7d_in_currency;
    const change=value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
    const stale=!!d?.stale||!!(d?.updatedAt&&Date.now()-d.updatedAt>300000);
    out.push({id:coin.id,ticker:coin.ticker,name:coin.name,cat:coin.cat,norm,last:norm?.at(-1)??0,noData:!norm,change,stale});
  }
  return out;
}
function rankedGroup(group){return [...group].sort((a,b)=>{
  const av=a.change!==null&&!a.stale,bv=b.change!==null&&!b.stale;
  if(av!==bv)return av?-1:1;
  if(!av)return a.ticker.localeCompare(b.ticker);
  return (rankingOrder==='desc'?b.change-a.change:a.change-b.change)||a.ticker.localeCompare(b.ticker);
});}
function rate(value){const n=Math.abs(value)<.05?0:value;return (n>0?'+':'')+n.toFixed(1)+'%';}
function coinAction(c){return `comparePick(${esc(JSON.stringify(c.id))})`;}

function downsample(arr,target){
  if(arr.length<=target) return arr;
  return Array.from({length:target},(_,i)=>arr[Math.round(i*(arr.length-1)/(target-1))]);
}

function svgChart(items,compact=false){
  const W=compact?720:1200,H=compact?360:480;
  const p={t:28,r:100,b:46,l:28};
  const pw=W-p.l-p.r,ph=H-p.t-p.b;

  const vals=[];
  for(const c of items) for(const v of c.norm) vals.push(v);
  if(!vals.length) vals.push(0);

  let yMin=0,yMax=0;for(const v of vals){yMin=Math.min(yMin,v);yMax=Math.max(yMax,v);}
  const span=(yMax-yMin)||1;
  yMin-=span*.08; yMax+=span*.08;

  let maxLen=1;
  for(const c of items) if(c.norm.length>maxLen) maxLen=c.norm.length;

  const tx=i=>p.l+(i/Math.max(maxLen-1,1))*pw;
  const ty=v=>p.t+((yMax-v)/(yMax-yMin))*ph;

  let s=`<svg role="img" aria-label="다중 종목 가격 기록 비교 차트" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

  // grid
  const gn=8;
  for(let i=0;i<=gn;i++){
    const y=p.t+(i/gn)*ph;
    const v=yMax-(i/gn)*(yMax-yMin);
    s+=`<line x1="${p.l}" y1="${y}" x2="${W-p.r}" y2="${y}" stroke="var(--grid)"/>`;
    s+=`<text x="${W-p.r+6}" y="${y+4}" fill="var(--text-3)" font-family="'JetBrains Mono',monospace" font-size="10">${v>=0?'+':''}${v.toFixed(1)}%</text>`;
  }
  // zero line
  if(yMin<0&&yMax>0){
    const zy=ty(0);
    s+=`<line x1="${p.l}" y1="${zy}" x2="${W-p.r}" y2="${zy}" stroke="var(--grid-strong)" stroke-dasharray="5,4"/>`;
  }
  // Relative progress only: providers return different history windows.
  for(const [progress,label] of [[0,'기록 시작'],[.5,'기록 중간'],[1,'최근 수신']]){
    const x=p.l+progress*pw;
    s+=`<text x="${x}" y="${H-10}" fill="var(--text-3)" font-family="system-ui" font-size="12" text-anchor="middle">${label}</text>`;
  }

  // lines
  const endPts=[];
  items.forEach((c,idx)=>{
    const ds=downsample(c.norm,160);
    if(ds.length<2) return;
    const col=c._color;
    const pts=ds.map((v,i)=>`${tx(i*(maxLen-1)/(ds.length-1)).toFixed(1)},${ty(v).toFixed(1)}`);
    s+=`<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity=".85" ${c.stale?'stroke-dasharray="6 4"':''}><title>${esc(c.ticker)} · ${esc(c.name)} · ${rate(c.last)}${c.stale?' · 지연 데이터':''}</title></polyline>`;
    const lx=tx(maxLen-1), ly=ty(ds[ds.length-1]);
    s+=`<circle cx="${lx}" cy="${ly}" r="3.5" fill="${col}"/>`;
    endPts.push({y:ly,x:lx,ticker:c.ticker,color:col,val:c.last});
  });

  // Dense charts use the full legend rather than overlapping endpoint labels.
  if(endPts.length>18)endPts.length=0;
  // end labels with collision avoidance
  endPts.sort((a,b)=>a.y-b.y);
  const minGap=13;
  for(let i=1;i<endPts.length;i++){
    if(endPts[i].y-endPts[i-1].y<minGap) endPts[i].y=endPts[i-1].y+minGap;
  }
  // push back up if overflowing bottom
  const maxY=H-p.b;
  if(endPts.length&&endPts[endPts.length-1].y>maxY){
    endPts[endPts.length-1].y=maxY;
    for(let i=endPts.length-2;i>=0;i--){
      if(endPts[i+1].y-endPts[i].y<minGap) endPts[i].y=endPts[i+1].y-minGap;
    }
  }
  for(const el of endPts){
    const labelX=W-p.r+6;
    s+=`<line x1="${el.x}" y1="${el.y}" x2="${labelX-2}" y2="${el.y}" stroke="${el.color}" stroke-width=".5" opacity=".4"/>`;
    const vs=(el.val>=0?'+':'')+el.val.toFixed(1)+'%';
    s+=`<text x="${labelX}" y="${el.y+3.5}" fill="${el.color}" font-family="'JetBrains Mono',monospace" font-size="9.5" font-weight="600">${esc(el.ticker)}</text>`;
  }

  s+='</svg>';
  return s;
}

function chartCard(title,scope,pool,colorMap,compact=false){
  const hidden=hiddenByScope.get(scope)||new Set();
  const visible=c=>!c.noData&&(scope==='selected'?selected.has(c.id):!hidden.has(c.id));
  const items=pool.filter(visible).map(c=>({...c,_color:colorMap[c.id]}));
  const unavailable=pool.filter(c=>c.noData).length,stale=items.filter(c=>c.stale).length;
  const action=(fn,...args)=>`${fn}(${args.map(v=>esc(JSON.stringify(v))).join(',')})`;
  const legend=pool.map(c=>`<button type="button" class="chart-ticker${visible(c)?' on':''}" style="--cc:${colorMap[c.id]}" aria-pressed="${visible(c)}" ${c.noData?'disabled':''} onclick="${action('toggleScopedCompare',scope,c.id)}" title="${esc(c.name)} · ${esc(catLabelOf(c.cat))}${c.stale?' · 지연 데이터':''}"><span class="cc-dot"></span><strong>${esc(c.ticker)}</strong><span>${c.noData?'차트 없음':rate(c.last)+(c.stale?' · 지연':'')}</span></button>`).join('');
  return `<section class="multi-chart-card" data-chart-scope="${esc(scope)}"><div class="multi-chart-head"><div><h4>${esc(title)}</h4><p>${items.length}/${pool.length}종목 표시${unavailable?' · 차트 미수신 '+unavailable:''}${stale?' · 지연 '+stale:''}</p></div><div><button class="btn btn-sm" onclick="${action('setScopedCompare',scope,true)}">모두 보기</button><button class="btn btn-sm" onclick="${action('setScopedCompare',scope,false)}">모두 숨김</button></div></div><div class="sector-svg">${items.length?svgChart(items,compact):'<div class="compare-empty-chart">비교할 종목을 선택하세요</div>'}</div><div class="chart-ticker-legend" aria-label="${esc(title)} 티커 표시 선택">${legend}</div></section>`;
}
function chartWorkspace(all,groups,colorMap){
  const tabs=[['all','종합 · 전체 종목'],['selected','내가 선택한 종목'],['categories','카테고리별 차트']];
  const nav=`<div class="multi-chart-tabs" role="group" aria-label="차트 보기 방식">${tabs.map(([key,label])=>`<button class="btn" aria-pressed="${chartView===key}" onclick="setCompareView('${key}')">${label}</button>`).join('')}</div>`;
  let charts;
  if(chartView==='categories')charts=`<div class="category-charts-grid">${groups.map(cat=>{const pool=all.filter(c=>c.cat===cat);return pool.length?chartCard(catLabelOf(cat),'cat:'+cat,pool,colorMap,true):'';}).join('')}</div>`;
  else charts=chartCard(chartView==='all'?'종합 · 전체 종목':'내가 선택한 종목',chartView,all,colorMap);
  return `<div class="multi-chart-workspace"><h3>다중 종목 차트</h3>${nav}<p class="category-ranking-note">각 수신 시계열의 첫 가격 = 0%. 기록 기간은 소스별로 달라 위 기간별 순위와 수치가 다를 수 있습니다. 티커를 눌러 표시를 켜고 끄세요. 지연 데이터는 점선입니다.</p>${charts}</div>`;
}

function render(){
  const panel=document.getElementById('compare-panel');
  if(!panel) return;
  const all=gatherCoins();

  // auto-init: if nothing selected, pick top 5 by absolute change
  if(!selectionInitialized){
    selectionInitialized=true;
    const ranked=all.filter(c=>!c.noData&&!c.stale).sort((a,b)=>Math.abs(b.change??0)-Math.abs(a.change??0));
    for(let i=0;i<Math.min(5,ranked.length);i++) selected.add(ranked[i].id);
  }

  // A ticker keeps the same color across overview, custom and category views.
  const colorMap=Object.fromEntries(all.map((c,i)=>[c.id,getColor(i)]));

  // Ranking uses the provider's named interval, never a partial collected sparkline.
  const expanded=new Set([...panel.querySelectorAll('details[data-compare-category][open]')].map(el=>el.dataset.compareCategory));
  const groupsInOrder=[...catList().map(c=>c.id),...new Set(all.map(c=>c.cat).filter(id=>!catList().some(x=>x.id===id)))];
  const leader=(c,label,kind)=>c?`<button class="category-leader ${kind}" onclick="${coinAction(c)}" title="${esc(c.name)}" aria-pressed="${selected.has(c.id)}"><span>${label}</span><strong>${esc(c.ticker)}</strong><b>${rate(c.change)}</b></button>`:`<div class="category-leader empty"><span>${label}</span><strong>${kind==='gainer'?'상승 종목 없음':'하락 종목 없음'}</strong></div>`;
  let chips='<div class="category-movers-grid">';
  for(const cat of groupsInOrder){
    const group=all.filter(c=>c.cat===cat);if(!group.length)continue;
    const valid=group.filter(c=>c.change!==null&&!c.stale);
    const up=valid.filter(c=>c.change>0).sort((a,b)=>b.change-a.change);
    const down=valid.filter(c=>c.change<0).sort((a,b)=>a.change-b.change);
    const neutral=valid.length-up.length-down.length;
    chips+=`<section class="category-movers"><div class="category-movers-head"><h4>${esc(catLabelOf(cat))}</h4><span>${valid.length}/${group.length}개 집계</span></div><div class="category-leaders">${leader(up[0],'최대 상승','gainer')}${leader(down[0],'최대 하락','loser')}</div><div class="category-breadth"><span class="up">상승 ${up.length}</span><span class="down">하락 ${down.length}</span><span>보합 ${neutral}</span>${group.length-valid.length?`<span>미수신·지연 ${group.length-valid.length}</span>`:''}</div><details data-compare-category="${esc(cat)}" ${expanded.has(cat)?'open':''}><summary>전체 ${group.length}개 · ${rankingOrder==='desc'?'상승률 높은 순':'하락률 큰 순'}</summary><div class="compare-cat-ranked">`;
    for(const c of rankedGroup(group)){
      const on=selected.has(c.id),col=on?colorMap[c.id]:'var(--text-3)';
      const usable=c.change!==null&&!c.stale;
      chips+=`<button class="compare-coin${on?' on':''}${usable?'':' no-data'}" onclick="${coinAction(c)}" title="${esc(c.name)}" aria-pressed="${on}" style="--cc:${col}"><span class="cc-dot"></span><strong>${esc(c.ticker)}</strong><span class="cc-chg ${usable?(c.change>0?'up':c.change<0?'down':''):''}">${c.change===null?'기간 데이터 없음':c.stale?'지연 · '+rate(c.change):rate(c.change)}</span></button>`;
    }
    chips+='</div></details></section>';
  }
  chips+='</div>';
  const controls=`<div class="category-ranking-controls"><div role="group" aria-label="수익률 기준 기간"><button class="btn btn-sm" aria-pressed="${rankingPeriod==='24h'}" onclick="setCompareRanking('24h',null)">24시간</button><button class="btn btn-sm" aria-pressed="${rankingPeriod==='7d'}" onclick="setCompareRanking('7d',null)">7일</button></div><div role="group" aria-label="카테고리 내 정렬"><button class="btn btn-sm" aria-pressed="${rankingOrder==='desc'}" onclick="setCompareRanking(null,'desc')">상승률 높은 순 ↓</button><button class="btn btn-sm" aria-pressed="${rankingOrder==='asc'}" onclick="setCompareRanking(null,'asc')">하락률 큰 순 ↑</button></div></div>`;

  // quick actions
  const pending=all.filter(c=>c.noData).length;
  const actions=`<div class="compare-actions">${pending?`<button class="btn btn-sm" id="auto-dex-btn" onclick="autoConnectDex()">미연결 ${pending}개 자동 연결</button>`:''}<button class="btn btn-sm" onclick="compareSelectAll()">전체 선택</button><button class="btn btn-sm" onclick="compareClear()">초기화</button></div>`;

  panel.innerHTML=`<div class="sector-head"><div><h3>카테고리별 상승 · 하락</h3><p>${rankingPeriod==='24h'?'최근 24시간':'최근 7일'} 변동률 · 내 목록에 있는 종목 기준</p></div>${actions}</div>${controls}${chips}<p class="category-ranking-note">미수신·지연 데이터는 순위에서 제외합니다. 주식의 24시간 수치는 전일 종가 대비입니다. 종목을 누르면 아래 ‘내가 선택한 종목’ 차트에 추가됩니다.</p>${chartWorkspace(all,groupsInOrder,colorMap)}`;
}

window.renderCompareChart=render;
window.setCompareView=function(view){if(['all','selected','categories'].includes(view)){chartView=view;render();}};
window.toggleScopedCompare=function(scope,id){
  if(scope==='selected'){window.toggleCompare(id);return;}
  const hidden=hiddenByScope.get(scope)||new Set();
  if(hidden.has(id))hidden.delete(id);else hidden.add(id);
  hiddenByScope.set(scope,hidden);render();
};
window.setScopedCompare=function(scope,show){
  const pool=gatherCoins().filter(c=>scope.startsWith('cat:')?c.cat===scope.slice(4):true);
  if(scope==='selected'){selected=show?new Set(pool.filter(c=>!c.noData).map(c=>c.id)):new Set();selectionInitialized=true;}
  else hiddenByScope.set(scope,show?new Set():new Set(pool.map(c=>c.id)));
  render();
};
window.setCompareRanking=function(period,order){
  if(['24h','7d'].includes(period))rankingPeriod=period;
  if(['asc','desc'].includes(order))rankingOrder=order;
  render();
};
window.comparePick=function(id){
  const coin=gatherCoins().find(c=>c.id===id);if(!coin)return;
  if(coin.noData){if(typeof openDetail==='function')openDetail(id);return;}
  window.toggleCompare(id);
};
window.toggleCompare=function(id){
  chartView='selected';selectionInitialized=true;
  if(selected.has(id)) selected.delete(id); else selected.add(id);
  render();
};
window.compareSelectAll=function(){
  chartView='selected';selectionInitialized=true;
  for(const c of gatherCoins()) if(!c.noData) selected.add(c.id);
  render();
};
window.compareClear=function(){
  chartView='selected';selectionInitialized=true;
  selected.clear();
  render();
};
})();
