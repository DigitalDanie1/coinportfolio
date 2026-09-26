/* 퍼프덱스 OI 채굴: 상관된 두 자산을 롱/숏으로 묶어 방향 노출을 줄이고 미결제약정만 쌓는다.
   시세·펀딩은 하이퍼리퀴드(HIP-3 xyz 포함)를 기준 가격으로 쓰고, XAUT만 CoinGecko에서 읽는다. */
const OI_STRATEGIES=[
  {id:'xyz100-mag7', long:{label:'XYZ100', desc:'나스닥100', hl:'xyz:XYZ100'}, short:{label:'Mag7', desc:'매그니피센트7', hl:'xyz:MAGS'},
   why:'나스닥100 안의 빅테크 7개를 빼고 나머지를 산다. 빅테크 쏠림이 풀릴 때 이득.'},
  {id:'xyz100-sp500', long:{label:'XYZ100', desc:'나스닥100', hl:'xyz:XYZ100'}, short:{label:'SP500', desc:'S&P 500', hl:'xyz:SP500'},
   why:'기술주가 시장 전체보다 강할 때 이득. 두 지수 상관이 높아 흔들림이 작다.'},
  {id:'eth-btc', name:'BTC Short / ETH Long', long:{label:'ETH', desc:'이더리움', hl:'ETH'}, short:{label:'BTC', desc:'비트코인', hl:'BTC'},
   why:'ETH/BTC 비율에 베팅. 코인 시장 전체 방향은 상쇄된다.'},
  {id:'xau-xaut', long:{label:'XAU', desc:'금 현물가', hl:'xyz:GOLD'}, short:{label:'XAUT', desc:'테더 골드', okx:'XAUT-USDT', cg:'tether-gold'},
   why:'같은 금이라 가격 차이(베이시스)만 남는다. 가장 중립에 가까운 OI 채굴.'},
];
const oiFeed={ctx:{},series:{},at:0,loading:false,error:''};

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
    // 소스 하나가 막혀도 나머지는 보여준다.
    const each=(list,fn)=>Promise.all(list.map(x=>fn(x).catch(()=>{})));
    await each(dexes,async dex=>{
      const [meta,ctxs]=await hlInfo(dex?{type:'metaAndAssetCtxs',dex}:{type:'metaAndAssetCtxs'});
      meta.universe.forEach((u,i)=>{ctx[u.name]={mark:+ctxs[i].markPx,prev:+ctxs[i].prevDayPx,funding:+ctxs[i].funding,oi:+ctxs[i].openInterest*+ctxs[i].markPx};});
    });
    const end=Date.now(),start=end-7*864e5,series={};
    await each([...new Set(legs.filter(l=>l.hl).map(l=>l.hl))],async coin=>{
      const c=await hlInfo({type:'candleSnapshot',req:{coin,interval:'1h',startTime:start,endTime:end}});
      series[coin]=c.map(x=>[x.t,+x.c]);
    });
    // XAUT: OKX 현물 1시간봉이 먼저, 막히면 CoinGecko.
    const okxCandles=async id=>{const r=await fetch(`https://www.okx.com/api/v5/market/history-candles?instId=${id}&bar=1H&limit=168`);if(!r.ok)throw 0;const d=await r.json();return (d.data||[]).map(x=>[+x[0],+x[4]]).reverse();};
    const cgChart=async id=>{const r=await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=7`);if(!r.ok)throw 0;return (await r.json()).prices||[];};
    await each(legs.filter(l=>l.cg),async l=>{
      let p=[];try{if(l.okx)p=await okxCandles(l.okx);}catch{}
      if(p.length<10)p=await cgChart(l.cg);
      series['cg:'+l.cg]=p;
      if(p.length){const last=p[p.length-1][1],day=p.find(x=>x[0]>=p[p.length-1][0]-864e5)?.[1];ctx['cg:'+l.cg]={mark:last,prev:day,funding:null,oi:null};}
    });
    if(!Object.keys(ctx).length)throw new Error('empty');
    oiFeed.ctx=ctx;oiFeed.series=series;oiFeed.at=Date.now();
  }catch(e){oiFeed.error='시세를 불러오지 못했습니다 · 잠시 후 다시 시도';}
  oiFeed.loading=false;
  if(currentTab==='farming')renderPairBoard();
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
// 페어 카드 안에 들어가는 실시세 블록: 7일 상대수익 차트 + 양쪽 가격·펀딩 + 순 캐리.
function oiPairLive(pair){
  const s=OI_STRATEGIES.find(x=>x.id===pair.oi);if(!s)return '';
  // 카드에서 롱/숏을 뒤집었으면 계산도 뒤집는다.
  const flipped=(pair.long?.asset||'').toUpperCase()===s.short.label.toUpperCase();
  const L=flipped?s.short:s.long,S=flipped?s.long:s.short,view={long:L,short:S};
  const sp=oiSpread(view),last=sp?sp[sp.length-1][1]:null;
  const lc=oiFeed.ctx[legKey(L)],sc=oiFeed.ctx[legKey(S)];
  // 롱은 양(+) 펀딩을 내고 숏은 받는다. 순 캐리 = 숏이 받는 몫 − 롱이 내는 몫.
  const carry=lc&&sc&&lc.funding!=null?apr((sc.funding??0)-lc.funding):null;
  const leg=(l,c)=>{const chg=c?.prev?(c.mark/c.prev-1)*100:null,f=apr(c?.funding);return `<span><b>${escapeHTML(l.label)}</b> ${c?fP(c.mark):'—'} <em class="${chg==null?'':chg>=0?'up':'down'}">${fPct(chg)}</em><small>펀딩 ${f==null?'없음':(f>=0?'+':'')+f.toFixed(1)+'%/년'}</small></span>`;};
  return `<div class="oi-live"><div class="oi-rel"><small>7일 상대수익</small><strong class="${last==null?'':last>=0?'up':'down'}">${last==null?'—':(last>=0?'+':'')+last.toFixed(2)+'%'}</strong></div>${sp?oiSpark(sp):`<div class="oi-spark oi-spark-empty">${oiFeed.loading||!oiFeed.at?'차트 불러오는 중':'차트 데이터 없음'}</div>`}<div class="oi-prices">${leg(L,lc)}${leg(S,sc)}</div><div class="oi-carry">순 펀딩 캐리 <b class="${carry==null?'':carry>=0?'up':'down'}">${carry==null?'—':(carry>=0?'+':'')+carry.toFixed(1)+'%/년'}</b></div></div>`;
}
// 사용자가 정한 OI 채굴 전략 4개를 페어로 한 번만 심는다. 해제·삭제한 뒤 다시 살아나지 않는다.
function seedOiPairs(){
  if(migrations.includes('oi-pairs-v1'))return;
  if(farmingPairs===null)farmingPairs=[];
  for(const s of OI_STRATEGIES){
    if(farmingPairs.some(p=>p.oi===s.id))continue;
    farmingPairs.push({id:genId('pair'),oi:s.id,name:s.name||`${s.long.label} Long / ${s.short.label} Short`,ticker:'',long:{asset:s.long.label},short:{asset:s.short.label},reason:s.why,conviction:0,strategy:'퍼프덱스 OI 채굴 전략'});
  }
  migrations.push('oi-pairs-v1');save();
}
const initBeforeOi=initFarmingPairs;
initFarmingPairs=function(){seedOiPairs();initBeforeOi();};
document.addEventListener('click',e=>{if(e.target.closest('[data-oi-refresh]')){oiFeed.at=0;loadOiFeed();}});
const renderBeforeOi=renderTable;
renderTable=function(){renderBeforeOi();if(currentTab==='farming')loadOiFeed();};
