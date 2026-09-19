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

let selected=new Set();

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function getColor(idx){return PALETTE[idx % PALETTE.length];}

function gatherCoins(){
  const out=[];
  for(const coin of coins){
    const d=coin.gecko?mkt[coin.gecko]:null;
    const raw=priceSeries(d);
    if(!raw||raw.length<10){
      out.push({id:coin.id,ticker:coin.ticker,name:coin.name,cat:coin.cat,norm:null,last:0,noData:true});
      continue;
    }
    const base=raw[0]; if(!base||base<=0) continue;
    const norm=raw.map(p=>((p-base)/base)*100);
    out.push({id:coin.id,ticker:coin.ticker,name:coin.name,cat:coin.cat,norm,last:norm[norm.length-1]});
  }
  return out;
}

function downsample(arr,target){
  if(arr.length<=target) return arr;
  const step=arr.length/target;
  return Array.from({length:target},(_,i)=>arr[Math.round(i*step)]);
}

function svgChart(items){
  const W=1200,H=480;
  const p={t:28,r:100,b:46,l:28};
  const pw=W-p.l-p.r,ph=H-p.t-p.b;

  const vals=[];
  for(const c of items) for(const v of c.norm) vals.push(v);
  if(!vals.length) vals.push(0);

  let yMin=Math.min(0,...vals),yMax=Math.max(0,...vals);
  const span=(yMax-yMin)||1;
  yMin-=span*.08; yMax+=span*.08;

  let maxLen=1;
  for(const c of items) if(c.norm.length>maxLen) maxLen=c.norm.length;

  const tx=i=>p.l+(i/Math.max(maxLen-1,1))*pw;
  const ty=v=>p.t+((yMax-v)/(yMax-yMin))*ph;

  let s=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

  // grid
  const gn=8;
  for(let i=0;i<=gn;i++){
    const y=p.t+(i/gn)*ph;
    const v=yMax-(i/gn)*(yMax-yMin);
    s+=`<line x1="${p.l}" y1="${y}" x2="${W-p.r}" y2="${y}" stroke="#ffffff08"/>`;
    s+=`<text x="${W-p.r+6}" y="${y+4}" fill="#969ea9" font-family="'JetBrains Mono',monospace" font-size="10">${v>=0?'+':''}${v.toFixed(1)}%</text>`;
  }
  // zero line
  if(yMin<0&&yMax>0){
    const zy=ty(0);
    s+=`<line x1="${p.l}" y1="${zy}" x2="${W-p.r}" y2="${zy}" stroke="#ffffff1a" stroke-dasharray="5,4"/>`;
  }
  // time axis
  const now=new Date();
  for(let d=6;d>=0;d--){
    const dt=new Date(now-d*864e5);
    const x=p.l+((6-d)/6)*pw;
    s+=`<text x="${x}" y="${H-10}" fill="#969ea9" font-family="system-ui" font-size="12" text-anchor="middle">${dt.getMonth()+1}월 ${dt.getDate()}일</text>`;
  }

  // lines
  const endPts=[];
  items.forEach((c,idx)=>{
    const ds=downsample(c.norm,160);
    if(ds.length<2) return;
    const col=c._color;
    const pts=ds.map((v,i)=>`${tx(i*(maxLen-1)/(ds.length-1)).toFixed(1)},${ty(v).toFixed(1)}`);
    s+=`<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>`;
    const lx=tx(maxLen-1), ly=ty(ds[ds.length-1]);
    s+=`<circle cx="${lx}" cy="${ly}" r="3.5" fill="${col}"/>`;
    endPts.push({y:ly,x:lx,ticker:c.ticker,color:col,val:c.last});
  });

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

function render(){
  const panel=document.getElementById('compare-panel');
  if(!panel) return;
  const all=gatherCoins();

  // auto-init: if nothing selected, pick top 5 by absolute change
  if(!selected.size){
    const ranked=[...all].sort((a,b)=>Math.abs(b.last)-Math.abs(a.last));
    for(let i=0;i<Math.min(5,ranked.length);i++) selected.add(ranked[i].id);
  }

  // assign colors to selected coins (stable ordering)
  let colorIdx=0;
  const colorMap={};
  for(const c of all){
    if(selected.has(c.id)){
      colorMap[c.id]=getColor(colorIdx);
      colorIdx++;
    }
  }

  const items=all.filter(c=>selected.has(c.id)&&!c.noData).map(c=>({...c,_color:colorMap[c.id]}));
  items.sort((a,b)=>b.last-a.last);

  const svg=items.length?svgChart(items):'<div style="padding:60px;text-align:center;color:var(--text-3);font-size:.85rem">비교할 종목을 선택하세요</div>';

  // coin picker chips grouped by category
  const catOrder=['main','fomo','etc','stocks'];
  const catLabel={main:'메인',fomo:'포모·밈',etc:'기타',stocks:'주식'};
  let chips='<div class="compare-picker">';
  for(const cat of catOrder){
    const group=all.filter(c=>c.cat===cat);
    if(!group.length) continue;
    chips+=`<div class="compare-cat-group"><span class="compare-cat-label">${catLabel[cat]||cat}</span>`;
    for(const c of group){
      if(c.noData){
        chips+=`<button class="compare-coin no-data" onclick="if(typeof openEdit==='function')openEdit('${c.id}')" style="--cc:var(--text-3)"><span class="cc-dot"></span><strong>${esc(c.ticker)}</strong><span class="cc-chg" style="color:var(--text-3)">미연결</span></button>`;
        continue;
      }
      const on=selected.has(c.id);
      const col=on?colorMap[c.id]:'var(--text-3)';
      const vs=(c.last>=0?'+':'')+c.last.toFixed(1)+'%';
      chips+=`<button class="compare-coin${on?' on':''}" onclick="toggleCompare('${c.id}')" style="--cc:${col}"><span class="cc-dot"></span><strong>${esc(c.ticker)}</strong><span class="cc-chg ${c.last>=0?'up':'down'}">${vs}</span></button>`;
    }
    chips+='</div>';
  }
  chips+='</div>';

  // quick actions
  const pending=all.filter(c=>c.noData).length;
  const actions=`<div class="compare-actions">${pending?`<button class="btn btn-sm" id="auto-dex-btn" onclick="autoConnectDex()">미연결 ${pending}개 자동 연결</button>`:''}<button class="btn btn-sm" onclick="compareSelectAll()">전체 선택</button><button class="btn btn-sm" onclick="compareClear()">초기화</button></div>`;

  panel.innerHTML=`<div class="sector-head"><div><h3>COMPARE / INDIVIDUAL</h3><p>개별 종목을 선택해 누적 수익률을 비교하세요</p></div>${actions}</div>${chips}<div class="sector-svg">${svg}</div>`;
}

window.renderCompareChart=render;
window.toggleCompare=function(id){
  if(selected.has(id)) selected.delete(id); else selected.add(id);
  render();
};
window.compareSelectAll=function(){
  for(const c of gatherCoins()) if(!c.noData) selected.add(c.id);
  render();
};
window.compareClear=function(){
  selected.clear();
  render();
};
})();
