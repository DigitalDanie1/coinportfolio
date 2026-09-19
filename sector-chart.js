// sector-chart.js — Category cumulative-return comparison chart
(function(){
'use strict';

const CATS={
  main:{label:'메인',color:'#c8ff00',order:0},
  fomo:{label:'포모·밈',color:'#ff6b35',order:1},
  etc:{label:'기타',color:'#5b8def',order:2},
  stocks:{label:'주식',color:'#a78bfa',order:3},
};
// Per-coin colours so individual lines stay identifiable; category colour alone makes them one blur.
const PALETTE=[
  '#c8ff00','#ff6b35','#5b8def','#a78bfa','#22c55e',
  '#ef4444','#f59e0b','#06b6d4','#ec4899','#84cc16',
  '#14b8a6','#f97316','#8b5cf6','#10b981','#e879f9',
  '#facc15','#38bdf8','#fb923c','#a3e635','#2dd4bf',
  '#818cf8','#fbbf24','#34d399','#f472b6','#67e8f9',
  '#d946ef','#4ade80','#fca5a5','#93c5fd','#fde047',
];
let vis={main:true,fomo:true,etc:true,stocks:true};
let mode='sector';

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function build(){
  const groups={};
  for(const[cat,m]of Object.entries(CATS)) groups[cat]={...m,coins:[],series:[],avg:[],change:0};
  for(const coin of coins){
    const d=coin.gecko?mkt[coin.gecko]:null;
    const raw=d?.collectedHistory?.map(p=>p.price)||d?.sparkline_in_7d?.price;
    if(!raw||raw.length<10) continue;
    const cat=coin.cat; if(!groups[cat]) continue;
    const base=raw[0]; if(!base||base<=0) continue;
    const norm=raw.map(p=>((p-base)/base)*100);
    groups[cat].coins.push({id:coin.id,ticker:coin.ticker,name:coin.name,color:groups[cat].color,norm,last:norm[norm.length-1]});
    groups[cat].series.push(norm);
  }
  let n=0;
  for(const g of Object.values(groups))for(const c of g.coins)c.lineColor=PALETTE[n++ % PALETTE.length];
  for(const g of Object.values(groups)){
    if(!g.series.length) continue;
    const maxLen=Math.max(...g.series.map(s=>s.length));
    const step=Math.max(1,Math.floor(maxLen/140));
    const avg=[];
    for(let i=0;i<maxLen;i+=step){
      let sum=0,cnt=0;
      for(const s of g.series){sum+=s[Math.min(i,s.length-1)];cnt++;}
      avg.push(sum/cnt);
    }
    g.avg=avg;
    g.change=avg[avg.length-1]||0;
  }
  return groups;
}

function downsample(arr,target){
  if(arr.length<=target) return arr;
  const step=arr.length/target;
  return Array.from({length:target},(_,i)=>arr[Math.round(i*step)]);
}

function svgChart(groups){
  const W=1200,H=460;
  const p={t:28,r:74,b:46,l:28};
  const pw=W-p.l-p.r,ph=H-p.t-p.b;

  const vals=[];
  if(mode==='coins'){
    for(const[cat,g]of Object.entries(groups)){if(!vis[cat])continue;for(const c of g.coins)for(const v of c.norm)vals.push(v);}
  }else{
    for(const[cat,g]of Object.entries(groups)){if(!vis[cat]||!g.avg.length)continue;for(const v of g.avg)vals.push(v);}
  }
  if(!vals.length) vals.push(0);

  let yMin=Math.min(0,...vals),yMax=Math.max(0,...vals);
  const span=(yMax-yMin)||1;
  yMin-=span*.08; yMax+=span*.08;

  let maxLen=1;
  if(mode==='coins'){
    for(const[cat,g]of Object.entries(groups)){if(!vis[cat])continue;for(const c of g.coins)if(c.norm.length>maxLen)maxLen=c.norm.length;}
  }else{
    for(const[cat,g]of Object.entries(groups)){if(vis[cat]&&g.avg.length>maxLen)maxLen=g.avg.length;}
  }

  const tx=i=>p.l+(i/Math.max(maxLen-1,1))*pw;
  const ty=v=>p.t+((yMax-v)/(yMax-yMin))*ph;

  let s=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  s+='<defs>';
  for(const[cat,g]of Object.entries(CATS)){
    s+=`<linearGradient id="sg${cat}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${g.color}" stop-opacity=".12"/><stop offset="100%" stop-color="${g.color}" stop-opacity="0"/></linearGradient>`;
  }
  s+='</defs>';

  // grid
  const gn=8;
  for(let i=0;i<=gn;i++){
    const y=p.t+(i/gn)*ph;
    const v=yMax-(i/gn)*(yMax-yMin);
    s+=`<line x1="${p.l}" y1="${y}" x2="${W-p.r}" y2="${y}" stroke="#ffffff08"/>`;
    s+=`<text x="${W-p.r+8}" y="${y+4}" fill="#969ea9" font-family="'JetBrains Mono',monospace" font-size="11">${v>=0?'+':''}${v.toFixed(1)}%</text>`;
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

  function line(data,color,w,catKey,op){
    if(data.length<2) return;
    const pts=data.map((v,i)=>`${tx(i).toFixed(1)},${ty(v).toFixed(1)}`);
    if(mode==='sector'&&catKey){
      s+=`<path d="M${pts[0]} ${pts.slice(1).map(q=>'L'+q).join(' ')} L${tx(data.length-1).toFixed(1)},${ty(yMin).toFixed(1)} L${tx(0).toFixed(1)},${ty(yMin).toFixed(1)} Z" fill="url(#sg${catKey})" opacity="${op||.6}"/>`;
    }
    s+=`<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"${op&&op<1?' opacity="'+op+'"':''}/>`;
    const lx=tx(data.length-1),ly=ty(data[data.length-1]);
    s+=`<circle cx="${lx}" cy="${ly}" r="${w+1}" fill="${color}"${op&&op<1?' opacity="'+op+'"':''}/>`;
  }

  const sorted=Object.entries(groups).filter(([c])=>vis[c]).sort((a,b)=>b[1].order-a[1].order);

  if(mode==='coins'){
    for(const[cat,g]of sorted){
      for(const c of g.coins){
        const ds=downsample(c.norm,140);
        line(ds,c.lineColor,1.5,null,.9);
      }
    }
    // draw sector avg as dashed overlay
    for(const[cat,g]of sorted){
      if(g.avg.length<2) continue;
      const pts=g.avg.map((v,i)=>`${tx(i).toFixed(1)},${ty(v).toFixed(1)}`);
      s+=`<polyline points="${pts.join(' ')}" fill="none" stroke="${g.color}" stroke-width="2.5" stroke-dasharray="6,4" stroke-linejoin="round" opacity=".55"/>`;
    }
  }else{
    for(const[cat,g]of sorted){
      if(g.avg.length>1) line(g.avg,g.color,2.5,cat);
    }
  }

  // end labels (right side)
  const endLabels=[];
  for(const[cat,g]of sorted){
    if(mode==='sector'){
      if(g.avg.length>1) endLabels.push({y:ty(g.avg[g.avg.length-1]),label:g.label,color:g.color});
    }else{
      for(const c of g.coins) endLabels.push({y:ty(c.last),label:c.ticker,color:c.lineColor});
    }
  }
  endLabels.sort((a,b)=>a.y-b.y);
  // Nudge collided labels apart, then pull the stack back inside the plot if it overran.
  const gap=mode==='coins'?11:16;
  for(let i=1;i<endLabels.length;i++){
    if(endLabels[i].y-endLabels[i-1].y<gap) endLabels[i].y=endLabels[i-1].y+gap;
  }
  const overflow=endLabels.length?endLabels[endLabels.length-1].y-(H-p.b):0;
  if(overflow>0)for(const el of endLabels)el.y-=overflow;
  for(const el of endLabels){
    s+=`<text x="${W-p.r+8}" y="${el.y+3}" fill="${el.color}" font-family="${mode==='coins'?"'JetBrains Mono',monospace":'system-ui'}" font-size="${mode==='coins'?9:10}" font-weight="600">${esc(el.label)}</text>`;
  }

  s+='</svg>';
  return s;
}

function render(){
  const panel=document.getElementById('sector-panel');
  if(!panel) return;
  const groups=build();
  const svg=svgChart(groups);

  let chips='<div class="sector-legend">';
  for(const[cat,g]of Object.entries(groups).sort((a,b)=>a[1].order-b[1].order)){
    if(!g.coins.length) continue;
    const on=vis[cat];
    const ch=g.change,cs=(ch>=0?'+':'')+ch.toFixed(1)+'%';
    chips+=`<button class="sector-chip${on?'':' off'}" onclick="toggleSector('${cat}')" style="--chip:${g.color}"><span class="chip-dot"></span><strong>${esc(g.label)}</strong><span class="chip-chg ${ch>=0?'up':'down'}">${cs}</span><small>${g.coins.length}종목</small></button>`;
  }
  chips+='</div>';

  // individual coin ranking (shown in coins mode)
  let ranking='';
  if(mode==='coins'){
    ranking='<div class="sector-ranking">';
    for(const[cat,g]of Object.entries(groups).sort((a,b)=>a[1].order-b[1].order)){
      if(!vis[cat]||!g.coins.length) continue;
      const sorted=[...g.coins].sort((a,b)=>b.last-a.last);
      ranking+=`<div class="rank-group"><span class="rank-label" style="color:${g.color}">${esc(g.label)}</span><div class="rank-items">`;
      for(const c of sorted){
        const v=c.last,vs=(v>=0?'+':'')+v.toFixed(1)+'%';
        ranking+=`<span class="rank-item ${v>=0?'up':'down'}"><i class="rank-dot" style="background:${c.lineColor}"></i>${esc(c.ticker)} <b>${vs}</b></span>`;
      }
      ranking+='</div></div>';
    }
    ranking+='</div>';
  }

  panel.innerHTML=`<div class="sector-head"><div><h3>TREND / CUMULATIVE PATH</h3><p>카테고리 대표 종목 평균의 기간 내 누적 추이</p></div><div class="sector-modes"><button class="btn${mode==='sector'?' active':''}" onclick="setSectorMode('sector')">섹터 평균</button><button class="btn${mode==='coins'?' active':''}" onclick="setSectorMode('coins')">개별 종목</button></div></div><div class="sector-svg">${svg}</div><p class="sector-hint">클릭해 선을 켜고 끕니다 · 체크된 항목이 차트에 표시 중</p>${chips}${ranking}`;
}

window.renderSectorChart=render;
window.toggleSector=function(cat){vis[cat]=!vis[cat];render();};
window.setSectorMode=function(m){mode=m;render();};
})();
