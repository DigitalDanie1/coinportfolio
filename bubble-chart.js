// bubble-chart.js — Portfolio bubble / weight visualisation
(function(){
'use strict';

// Bubble fills are keyed by category id, which the user can add to or rename at any time.
function catColors(){const o={};for(const c of catList())o[c.id]=c.color;return o;}
function gradientId(cat){return 'bg'+String(cat).replace(/[^a-zA-Z0-9_-]/g,'_');}

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function fmt(n){
  if(n>=1e9) return (n/1e9).toFixed(1)+'B';
  if(n>=1e6) return (n/1e6).toFixed(1)+'M';
  if(n>=1e3) return (n/1e3).toFixed(1)+'K';
  return n.toFixed(n<1?4:2);
}

function gather(){
  const out=[];
  let hasHoldings=false;
  for(const c of coins){
    const h=holdings[c.id];
    const d=c.gecko?mkt[c.gecko]:null;
    const price=d?.current_price||(h?.manualPrice)||0;
    const mcap=d?.market_cap||0;
    const chg7d=d?.price_change_percentage_7d_in_currency??0;
    const chg24h=d?.price_change_percentage_24h??0;
    const qty=h?.qty||0;
    const val=qty*price;
    const cost=qty*(h?.avgPrice||0);
    const pnl=cost>0?((val-cost)/cost*100):0;
    if(qty>0) hasHoldings=true;
    out.push({id:c.id,ticker:c.ticker,name:c.name,cat:c.cat,price,mcap,chg7d,chg24h,qty,val,pnl,color:catColorOf(c.cat)});
  }
  return {items:out,hasHoldings};
}

function packCircles(items,W,H){
  const n=items.length;
  if(!n) return [];
  const maxVal=Math.max(...items.map(d=>d.size));
  const minR=18, maxR=Math.min(W,H)*0.22;
  const nodes=items.map((d,i)=>{
    const ratio=maxVal>0?d.size/maxVal:1/n;
    const r=minR+Math.sqrt(ratio)*(maxR-minR);
    const angle=(i/n)*Math.PI*2;
    return {...d,r,x:W/2+Math.cos(angle)*r*0.5,y:H/2+Math.sin(angle)*r*0.5};
  });

  for(let iter=0;iter<300;iter++){
    for(let i=0;i<n;i++){
      for(let j=i+1;j<n;j++){
        const a=nodes[i],b=nodes[j];
        let dx=b.x-a.x,dy=b.y-a.y;
        const dist=Math.sqrt(dx*dx+dy*dy)||1;
        const minDist=a.r+b.r+2;
        if(dist<minDist){
          const push=(minDist-dist)/2;
          const ux=dx/dist,uy=dy/dist;
          a.x-=ux*push; a.y-=uy*push;
          b.x+=ux*push; b.y+=uy*push;
        }
      }
      const a=nodes[i];
      const cx=W/2,cy=H/2;
      const dx=a.x-cx,dy=a.y-cy;
      a.x-=dx*0.01; a.y-=dy*0.01;
      a.x=Math.max(a.r+2,Math.min(W-a.r-2,a.x));
      a.y=Math.max(a.r+2,Math.min(H-a.r-2,a.y));
    }
  }
  return nodes;
}

function svgBubbles(data,mode,W,H){
  const sizeKey=mode==='mcap'?'mcap':'val';
  const items=data.filter(d=>d[sizeKey]>0).sort((a,b)=>b[sizeKey]-a[sizeKey]);
  if(!items.length) return `<div style="padding:80px;text-align:center;color:var(--text-3);font-size:.85rem">${mode==='val'?'보유 수량을 입력하면 버블이 표시됩니다':'시세 데이터가 없습니다'}</div>`;

  const sized=items.map(d=>({...d,size:d[sizeKey]}));
  const nodes=packCircles(sized,W,H);

  let s=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  s+='<defs>';
  for(const[cat,col]of Object.entries(catColors())){
    s+=`<radialGradient id="${gradientId(cat)}" cx="35%" cy="35%"><stop offset="0%" stop-color="${col}" stop-opacity=".25"/><stop offset="100%" stop-color="${col}" stop-opacity=".08"/></radialGradient>`;
  }
  s+='</defs>';

  for(const n of nodes){
    const chg=n.chg7d;
    const chgStr=(chg>=0?'+':'')+chg.toFixed(1)+'%';
    const chgColor=chg>=0?'#22c55e':'#ef4444';
    const showName=n.r>30;
    const showChg=n.r>24;
    const showSize=n.r>40;

    s+=`<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r.toFixed(1)}" fill="url(#${gradientId(n.cat)})" stroke="${n.color}" stroke-width="1.5" opacity=".9"/>`;

    s+=`<text x="${n.x.toFixed(1)}" y="${(n.y-(showChg?4:0)-(showSize?6:0)).toFixed(1)}" text-anchor="middle" dominant-baseline="central" fill="${n.color}" font-family="'JetBrains Mono',monospace" font-size="${Math.min(n.r*0.45,16).toFixed(0)}" font-weight="700">${esc(n.ticker)}</text>`;

    if(showChg){
      s+=`<text x="${n.x.toFixed(1)}" y="${(n.y+Math.min(n.r*0.3,14)).toFixed(1)}" text-anchor="middle" dominant-baseline="central" fill="${chgColor}" font-family="'JetBrains Mono',monospace" font-size="${Math.min(n.r*0.28,11).toFixed(0)}" font-weight="500">${chgStr}</text>`;
    }

    if(showSize){
      const sizeLabel=mode==='val'?'$'+fmt(n.val):fmt(n.mcap);
      s+=`<text x="${n.x.toFixed(1)}" y="${(n.y+Math.min(n.r*0.55,26)).toFixed(1)}" text-anchor="middle" dominant-baseline="central" fill="#969ea9" font-family="'JetBrains Mono',monospace" font-size="${Math.min(n.r*0.22,9).toFixed(0)}">${sizeLabel}</text>`;
    }
  }
  s+='</svg>';
  return s;
}

function render(){
  const panel=document.getElementById('bubble-panel');
  if(!panel) return;
  const {items,hasHoldings}=gather();
  const mode=hasHoldings?'val':'mcap';

  const W=1100,H=600;
  const svg=svgBubbles(items,mode,W,H);

  const totalVal=items.reduce((s,d)=>s+d.val,0);

  let legend='<div class="bubble-legend">';
  for(const[cat,col]of Object.entries(catColors())){
    const group=items.filter(d=>d.cat===cat);
    if(!group.length) continue;
    const catVal=group.reduce((s,d)=>s+(mode==='val'?d.val:d.mcap),0);
    legend+=`<span class="bubble-leg-item" style="--bc:${col}"><span class="bl-dot"></span>${esc(catLabelOf(cat))} <b>${group.length}</b></span>`;
  }
  legend+='</div>';

  const modeLabel=mode==='val'?'보유 가치 기준':'시가총액 기준 (보유 입력 시 전환)';

  panel.innerHTML=`<div class="sector-head"><div><h3>BUBBLE MAP</h3><p>${modeLabel} · 7일 변동률 표시</p></div></div><div class="bubble-wrap">${svg}</div>${legend}`;
}

window.renderBubbleChart=render;
})();
