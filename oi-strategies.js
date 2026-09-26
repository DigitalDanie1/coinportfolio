/* 퍼프덱스 OI 채굴: 상관된 두 자산을 롱/숏으로 묶어 방향 노출을 줄이고 미결제약정만 쌓는다.
   시세·펀딩은 하이퍼리퀴드(HIP-3 xyz 포함)를 기준 가격으로 쓰고, XAUT만 CoinGecko에서 읽는다. */
const OI_STRATEGIES=[
  {id:'xyz100-mag7', long:{label:'XYZ100', desc:'나스닥100', hl:'xyz:XYZ100'}, short:{label:'Mag7', desc:'매그니피센트7', hl:'xyz:MAGS'},
   why:'나스닥100 안의 빅테크 7개를 빼고 나머지를 산다. 빅테크 쏠림이 풀릴 때 이득.'},
  {id:'xyz100-sp500', long:{label:'XYZ100', desc:'나스닥100', hl:'xyz:XYZ100'}, short:{label:'SP500', desc:'S&P 500', hl:'xyz:SP500'},
   why:'기술주가 시장 전체보다 강할 때 이득. 두 지수 상관이 높아 흔들림이 작다.'},
  {id:'eth-btc', long:{label:'ETH', desc:'이더리움', hl:'ETH'}, short:{label:'BTC', desc:'비트코인', hl:'BTC'},
   why:'ETH/BTC 비율에 베팅. 코인 시장 전체 방향은 상쇄된다.'},
  {id:'xau-xaut', long:{label:'XAU', desc:'금 현물가', hl:'xyz:GOLD'}, short:{label:'XAUT', desc:'테더 골드', cg:'tether-gold'},
   why:'같은 금이라 가격 차이(베이시스)만 남는다. 가장 중립에 가까운 OI 채굴.'},
];
const OI_STORE='coin-portfolio-oi-v1';
const oiFeed={ctx:{},series:{},at:0,loading:false,error:''};
function oiState(){try{return JSON.parse(localStorage.getItem(OI_STORE))||{};}catch{return {};}}
function oiSave(state){try{localStorage.setItem(OI_STORE,JSON.stringify(state));return true;}catch{return false;}}

async function hlInfo(body){
  const r=await fetch('https://api.hyperliquid.xyz/info',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok)throw new Error('hyperliquid '+r.status);return r.json();
}
async function loadOiFeed(){
  if(oiFeed.loading||Date.now()-oiFeed.at<60000)return;
  oiFeed.loading=true;oiFeed.error='';
  try{
    const legs=OI_STRATEGIES.flatMap(s=>[s.long,s.short]);
    const dexes=[...new Set(legs.filter(l=>l.hl).map(l=>l.hl.includes(':')?l.hl.split(':')[0]:''))];
    const ctx={};
    await Promise.all(dexes.map(async dex=>{
      const [meta,ctxs]=await hlInfo(dex?{type:'metaAndAssetCtxs',dex}:{type:'metaAndAssetCtxs'});
      meta.universe.forEach((u,i)=>{ctx[u.name]={mark:+ctxs[i].markPx,prev:+ctxs[i].prevDayPx,funding:+ctxs[i].funding,oi:+ctxs[i].openInterest*+ctxs[i].markPx};});
    }));
    const end=Date.now(),start=end-7*864e5,series={};
    await Promise.all([...new Set(legs.filter(l=>l.hl).map(l=>l.hl))].map(async coin=>{
      const c=await hlInfo({type:'candleSnapshot',req:{coin,interval:'1h',startTime:start,endTime:end}});
      series[coin]=c.map(x=>[x.t,+x.c]);
    }));
    await Promise.all(legs.filter(l=>l.cg).map(async l=>{
      const r=await fetch(`https://api.coingecko.com/api/v3/coins/${l.cg}/market_chart?vs_currency=usd&days=7`);
      if(!r.ok)return;const d=await r.json(),p=d.prices||[];
      series['cg:'+l.cg]=p;
      if(p.length){const last=p[p.length-1][1],day=p.find(x=>x[0]>=p[p.length-1][0]-864e5)?.[1];ctx['cg:'+l.cg]={mark:last,prev:day,funding:null,oi:null};}
    }));
    oiFeed.ctx=ctx;oiFeed.series=series;oiFeed.at=Date.now();
  }catch(e){oiFeed.error='시세를 불러오지 못했습니다 · 잠시 후 다시 시도';}
  oiFeed.loading=false;
  if(currentTab==='farming')renderOiBoard();
}
const legKey=l=>l.hl||'cg:'+l.cg;
// 시간축을 롱 다리에 맞추고 숏 다리는 가장 가까운 이전 값으로 맞춘다.
function oiSpread(s){
  const a=oiFeed.series[legKey(s.long)]||[],b=oiFeed.series[legKey(s.short)]||[];
  if(a.length<10||b.length<10)return null;
  const out=[];let j=0;
  for(const [t,pa] of a){while(j+1<b.length&&b[j+1][0]<=t)j++;if(b[j][0]>t+3600e3)continue;out.push([t,pa,b[j][1]]);}
  if(out.length<10)return null;
  const [,a0,b0]=out[0];
  return out.map(([t,pa,pb])=>[t,((pa/a0)/(pb/b0)-1)*100]);
}
const apr=f=>f==null?null:f*24*365*100;
function oiSpark(points){
  const w=280,h=64,vals=points.map(p=>p[1]),lo=Math.min(0,...vals),hi=Math.max(0,...vals),span=hi-lo||1;
  const x=i=>i/(points.length-1)*w,y=v=>h-4-(v-lo)/span*(h-8);
  const line=points.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
  const last=vals[vals.length-1],tone=last>=0?'var(--green)':'var(--red)';
  return `<svg class="oi-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="7일 상대수익 ${last>=0?'+':''}${last.toFixed(2)}%"><line x1="0" x2="${w}" y1="${y(0)}" y2="${y(0)}" class="oi-zero"/><path d="${line}L${w},${y(0)}L0,${y(0)}Z" fill="${tone}" opacity=".12"/><path d="${line}" fill="none" stroke="${tone}" stroke-width="1.8" vector-effect="non-scaling-stroke"/></svg>`;
}
function renderOiBoard(){
  let el=document.getElementById('oi-board');
  if(!el){el=document.createElement('section');el.id='oi-board';document.getElementById('pair-board').after(el);}
  el.hidden=currentTab!=='farming';if(el.hidden)return;
  if(el.contains(document.activeElement)&&document.activeElement.matches('input'))return;
  const state=oiState();
  const legHTML=(leg,side)=>{
    const c=oiFeed.ctx[legKey(leg)],chg=c?.prev?(c.mark/c.prev-1)*100:null,f=apr(c?.funding);
    return `<div class="oi-leg"><span class="oi-side ${side==='long'?'up':'down'}">${side==='long'?'LONG':'SHORT'}</span><strong>${escapeHTML(leg.label)}</strong><small>${escapeHTML(leg.desc)}</small><b class="oi-mark">${c?fP(c.mark):'—'}</b><span class="${chg==null?'':chg>=0?'up':'down'}">${fPct(chg)} <small>24H</small></span><span class="oi-fund">펀딩 ${f==null?'없음':(f>=0?'+':'')+f.toFixed(1)+'%/년'}</span></div>`;
  };
  el.innerHTML=`<div class="oi-head"><div><h2>퍼프덱스 OI 채굴 전략</h2><p>상관된 두 자산을 롱/숏으로 묶어 방향 노출 없이 미결제약정(OI)을 쌓습니다.</p></div><button class="btn" data-oi-refresh>${oiFeed.loading?'불러오는 중…':'새로고침'}</button></div>${oiFeed.error?`<p class="oi-error" role="alert">${escapeHTML(oiFeed.error)}</p>`:''}<div class="oi-grid">${OI_STRATEGIES.map(s=>{
    const sp=oiSpread(s),last=sp?sp[sp.length-1][1]:null;
    const lc=oiFeed.ctx[legKey(s.long)],sc=oiFeed.ctx[legKey(s.short)];
    // 롱은 양(+) 펀딩을 내고 숏은 받는다. 순 캐리 = 숏이 받는 몫 − 롱이 내는 몫.
    const carry=lc&&sc&&lc.funding!=null?apr((sc.funding??0)-lc.funding):null;
    const mine=state[s.id]||{},notional=Number(mine.notional)||0;
    const daily=carry!=null&&notional>0?notional*carry/100/365:null;
    return `<article class="oi-card"><div class="oi-card-head"><h3>${escapeHTML(s.long.label)} <span class="up">Long</span> / ${escapeHTML(s.short.label)} <span class="down">Short</span></h3><div class="oi-rel"><small>7일 상대수익</small><strong class="${last==null?'':last>=0?'up':'down'}">${last==null?'—':(last>=0?'+':'')+last.toFixed(2)+'%'}</strong></div></div>${sp?oiSpark(sp):`<div class="oi-spark oi-spark-empty">${oiFeed.loading?'차트 불러오는 중':'차트 데이터 없음'}</div>`}<div class="oi-legs">${legHTML(s.long,'long')}${legHTML(s.short,'short')}</div><div class="oi-carry"><span>순 펀딩 캐리 <b class="${carry==null?'':carry>=0?'up':'down'}">${carry==null?'—':(carry>=0?'+':'')+carry.toFixed(1)+'%/년'}</b></span><span>하루 ${daily==null?'—':`<b class="${daily>=0?'up':'down'}">${daily>=0?'+':'−'}$${Math.abs(daily).toFixed(2)}</b>`}</span></div><div class="oi-inputs"><label>다리당 명목가 $<input type="text" inputmode="decimal" data-oi="${s.id}" data-oi-field="notional" value="${escapeHTML(mine.notional?groupNumber(String(mine.notional)):'')}" placeholder="10,000"></label><label>거래소<input type="text" data-oi="${s.id}" data-oi-field="venue" value="${escapeHTML(mine.venue||'')}" maxlength="60" placeholder="RiseX, QFEX…"></label></div><p class="oi-why">${escapeHTML(s.why)}</p></article>`;
  }).join('')}</div><p class="oi-foot">기준 시세: 하이퍼리퀴드 (XYZ100·SP500·MAGS·GOLD는 trade.xyz 마켓), XAUT는 CoinGecko · 순 캐리는 하이퍼리퀴드 펀딩 기준이라 실제 거래소와 다를 수 있습니다.</p>`;
  el.querySelectorAll('[data-oi-field="notional"]').forEach(attachNumberGrouping);
}
document.addEventListener('click',e=>{if(e.target.closest('[data-oi-refresh]')){oiFeed.at=0;loadOiFeed();renderOiBoard();}});
document.addEventListener('input',e=>{
  const i=e.target.closest('[data-oi]');if(!i)return;
  const state=oiState(),row=state[i.dataset.oi]||={};
  row[i.dataset.oiField]=i.dataset.oiField==='notional'?parseNumInput(i.value):i.value.slice(0,60);oiSave(state);
});
document.addEventListener('change',e=>{if(e.target.closest('[data-oi]')){e.target.blur();renderOiBoard();}});
const renderBeforeOi=renderTable;
renderTable=function(){renderBeforeOi();renderOiBoard();if(currentTab==='farming')loadOiFeed();};
