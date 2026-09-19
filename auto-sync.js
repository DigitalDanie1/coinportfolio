/* Public market automation. Only identifiers go to data providers; journal text stays local. */
const AUTO_CACHE_KEY='coin-portfolio-auto-cache-v1';
const CONNECTION_KEY='coin-portfolio-connections-v1';
let marketByCoin={},newsByAsset={},optionQuotes={},perpFeed={data:[]};
let autoConnections={hyperliquid:''};
let autoBusy=false,autoFailures=0,lastNewsSync=0,nextAutoSync=0,automaticTimer=null;
let activeNews=null;
const serviceBase=location.protocol==='file:'?'http://127.0.0.1:8787':location.origin;
function restoreAutomaticCache(){
  try{const d=JSON.parse(localStorage.getItem(AUTO_CACHE_KEY));if(d){marketByCoin=d.markets||{};newsByAsset=d.news||{};optionQuotes=d.options||{};perpFeed=d.perps||{data:[]};}}catch{}
  for(const c of coins){const d=marketByCoin[c.id];if(d&&c.gecko)mkt[c.gecko]=d;}
  try{autoConnections=JSON.parse(localStorage.getItem(CONNECTION_KEY))||autoConnections;}catch{}
}
function saveAutomaticCache(){try{localStorage.setItem(AUTO_CACHE_KEY,JSON.stringify({markets:marketByCoin,news:newsByAsset,options:optionQuotes,perps:perpFeed}));}catch{}}
async function dataAPI(endpoint,payload){
  const response=await fetch(serviceBase+endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Portfolio-Client':'1'},body:JSON.stringify(payload),signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw new Error(`자동 데이터 서비스 오류 (${response.status})`);
  return response.json();
}
function assetKey(book,id){return book+':'+id;}
function assetDescriptor(book,asset){return {id:asset.id,name:(book==='spot'?marketByCoin[asset.id]?.canonicalName:null)||asset.name||asset.ticker,ticker:asset.ticker,cat:book==='spot'?asset.cat:book};}
function syncLabel(d){
  if(!d)return '연결 대기';
  if(!d.updatedAt)return d.message||'연결 필요';
  const old=d.stale || Date.now()-d.updatedAt>300000;
  return `${d.source||'자동'} · ${old?'저장 데이터 · ':''}${new Date(d.updatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
}
function newsBadge(book,id){
  const data=newsByAsset[assetKey(book,id)];
  return data?.articles?.length?`뉴스 ${data.articles.length}`:data?.error?'뉴스 재시도':data?.updatedAt?'뉴스 없음':'뉴스 연결 중';
}
function marketStatus(coin){return syncLabel(marketByCoin[coin.id]);}
function positionAutoInfo(book,p){
  if(p.source==='hyperliquid')return syncLabel({source:'Hyperliquid 계좌',updatedAt:p.updatedAt,stale:p.stale});
  if(book==='options')return syncLabel(optionQuotes[p.id]);
  if(/^hyperliquid$/i.test(p.name||'')||/^hyperliquid$/i.test(p.venue||'')){
    const symbol=String(p.ticker||'').replace(/[-/]?(PERP|USD[CT]?)$/i,'').toUpperCase();
    const d=perpFeed.data?.find(x=>x.symbol===symbol);
    return d?`마크 ${money(d.mark)} · 펀딩 ${((d.fundingHourly||0)*100).toFixed(4)}%/h`:'시장 연결 대기';
  }
  return '계좌 연결 필요';
}
function autoOptionMark(p){const quote=optionQuotes[p.id];return quote?.mark!=null?quote.mark:p.mark;}
// Existing USD-cost records retain their cost basis; exchange positions use reported P&L.
optionPnL = function(p){if(p.apiPnL!=null)return p.apiPnL;const mark=autoOptionMark(p);return mark==null?null:(mark-p.entry)*p.contracts*(optionQuotes[p.id]?.contractSize??p.multiplier)*(p.side==='long'?1:-1)-(p.fees||0);};
farmingPnL = function(p){if(p.source==='hyperliquid')return p.apiPnL;return p.pnl==null?null:p.pnl+(p.funding||0)+(p.rewards||0)-(p.fees||0);};
const localCoinData=coinData;
coinData = function(c){
  const remote=marketByCoin[c.id];
  if(!remote)return localCoinData(c);
  const h=holdings[c.id],price=remote.current_price??h?.manualPrice??null;
  return {coin:{...c,ticker:remote.canonicalSymbol||c.ticker,name:remote.canonicalName||c.name},d:remote,has:remote.current_price!=null,h,price,chg:remote.price_change_percentage_24h,mc:remote.market_cap,holdVal:h?.qty?price*h.qty:0};
};
// The data service shares one datacentre IP, which GeckoTerminal throttles far below what this
// book needs, so DEX candles are fetched from the browser where each user has their own limit.
const DEX_HISTORY_TTL=3600000;
const dexHistoryCache={};
async function fetchDexCandles(dex){
  if(!dex||!/^[a-z0-9_-]{1,40}$/.test(dex.chain)||!/^[a-zA-Z0-9]{1,100}$/.test(dex.pair))return null;
  const key=dex.chain+':'+dex.pair,hit=dexHistoryCache[key];
  if(hit&&Date.now()-hit.at<DEX_HISTORY_TTL)return hit.prices;
  const ohlcv=async pool=>{
    const r=await fetch(`https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(dex.chain)}/pools/${encodeURIComponent(pool)}/ohlcv/hour?aggregate=1&limit=168`,{signal:AbortSignal.timeout(15000)});
    if(!r.ok)return null;
    const rows=(await r.json())?.data?.attributes?.ohlcv_list;
    if(!Array.isArray(rows))return null;
    const prices=rows.map(x=>Number(x[4])).filter(x=>Number.isFinite(x)&&x>0).reverse();
    return prices.length?prices:null;
  };
  let prices=await ohlcv(dex.pair);
  if(!prices&&/^[a-zA-Z0-9]{1,100}$/.test(dex.token||'')){
    // GeckoTerminal indexes fewer pools than DEX Screener; use its deepest pool for the token.
    try{
      const r=await fetch(`https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(dex.chain)}/tokens/${encodeURIComponent(dex.token)}/pools?page=1`,{signal:AbortSignal.timeout(15000)});
      if(r.ok){
        const best=((await r.json())?.data||[]).map(p=>p.attributes).filter(a=>a?.address)
          .sort((a,b)=>Number(b.reserve_in_usd||0)-Number(a.reserve_in_usd||0))[0];
        if(best)prices=await ohlcv(best.address);
      }
    }catch{}
  }
  if(prices)dexHistoryCache[key]={at:Date.now(),prices};
  return prices;
}
async function fillDexHistories(){
  const pending=coins.filter(c=>c.dex&&(marketByCoin[c.id]?.sparkline_in_7d?.price||[]).length<10);
  if(!pending.length)return false;
  let changed=false,misses=0;
  // Paced and capped per round: GeckoTerminal rejects bursts, and a rejection reads as a network
  // failure in the browser. The rest are picked up by later rounds and then cached for an hour.
  for(const c of pending.slice(0,6)){
    let prices=null;
    try{prices=await fetchDexCandles(c.dex);}catch{}
    const d=marketByCoin[c.id];
    if(prices&&d){
      const change=prices[0]>0?(prices[prices.length-1]/prices[0]-1)*100:null;
      marketByCoin[c.id]={...d,sparkline_in_7d:{price:prices},price_change_percentage_7d_in_currency:change,chartSource:'GeckoTerminal · 1시간'};
      if(c.gecko)mkt[c.gecko]=marketByCoin[c.id];
      changed=true;misses=0;
    }else if(++misses>=3)break;
    await new Promise(r=>setTimeout(r,500));
  }
  if(changed)saveAutomaticCache();
  return changed;
}
function applyMarketResponse(response){
  for(const [id,incoming] of Object.entries(response.data||{})){
    const previous=marketByCoin[id];
    if(incoming.current_price==null&&previous?.current_price!=null)marketByCoin[id]={...previous,stale:true,message:incoming.message};
    else marketByCoin[id]=incoming;
    // The service refills only a few DEX histories per request and forgets them between cold
    // starts, so keep the longer series we already hold rather than dropping back to none.
    const kept=previous?.sparkline_in_7d?.price||[],fresh=marketByCoin[id]?.sparkline_in_7d?.price||[];
    if(kept.length>fresh.length){
      marketByCoin[id]={...marketByCoin[id],sparkline_in_7d:{price:kept},
        price_change_percentage_7d_in_currency:marketByCoin[id].price_change_percentage_7d_in_currency??previous.price_change_percentage_7d_in_currency,
        chartSource:marketByCoin[id].chartSource||previous.chartSource};
    }
    const c=coins.find(x=>x.id===id);if(!c)continue;
    const d=marketByCoin[id];
    if(d.canonicalName)c.name=d.canonicalName;
    if(d.canonicalSymbol){c.originalTicker ||= c.ticker;c.ticker=d.canonicalSymbol;}
    if(d.canonicalId||d.current_price!=null){
      // Synthetic local keys do not alter provider identities or user journal IDs.
      const key=d.canonicalId||c.gecko||'auto:'+id;
      mkt[key]=d;c.gecko=key;
    }
  }
  // Only connection metadata changes. Thesis and conviction are never in the response.
  save();saveAutomaticCache();renderAll();
}
function mergeAccountPositions(response){
  if(response.stale){for(const p of farming.filter(p=>p.source==='hyperliquid'))p.stale=true;return;}
  const ids=new Set(response.positions.map(p=>p.id));
  for(const p of farming.filter(p=>p.source==='hyperliquid'))if(!ids.has(p.id)){p.closed=true;p.quantity=0;p.apiPnL=null;}
  for(const remote of response.positions){
    const index=farming.findIndex(p=>p.id===remote.id),previous=index>=0?farming[index]:{};
    const value={...previous,...remote,closed:false,reason:previous.reason||'',conviction:previous.conviction||0};
    if(index>=0)farming[index]=value;else farming.push(value);
  }
  save();renderAll();
}
async function syncNews(force=false){
  if(!force&&Date.now()-lastNewsSync<900000)return;
  const jobs=[...coins.map(c=>({book:'spot',asset:c})),...farming.filter(p=>!p.closed).map(asset=>({book:'farming',asset})),...options.map(asset=>({book:'options',asset}))];
  for(let i=0;i<jobs.length;i+=3)await Promise.all(jobs.slice(i,i+3).map(async({book,asset})=>{
    const key=assetKey(book,asset.id),prior=newsByAsset[key];
    if(!force&&prior?.updatedAt&&Date.now()-prior.updatedAt<900000)return;
    try{newsByAsset[key]=await dataAPI('/api/news',{asset:assetDescriptor(book,asset)});}catch{newsByAsset[key]={...prior,stale:true,error:'뉴스 수신 실패 · 자동 재시도'};}
  }));
  lastNewsSync=Date.now();saveAutomaticCache();renderTable();
  if(activeNews&&document.getElementById('news-feed'))renderNewsFeed(activeNews.book,activeNews.id);
}
async function syncAutomatic(force=false){
  if(autoBusy)return;autoBusy=true;
  const status=document.getElementById('auto-status');status.textContent='자동 업데이트 중…';
  setStatus('load','시세 · 차트 · 뉴스 자동 동기화 중');
  try{
    const tasks=[
      dataAPI('/api/markets',{coins:coins.map(c=>({id:c.id,ticker:c.ticker,name:c.name,gecko:c.gecko,providerId:c.providerId,dex:c.dex,equity:c.equity,cat:c.cat}))}).then(applyMarketResponse),
      dataAPI('/api/options',{positions:options.filter(p=>!p.closed).map(p=>({id:p.id,ticker:p.ticker,venue:p.venue,expiry:p.expiry,strike:p.strike,kind:p.kind,instrument:p.instrument}))}).then(result=>{for(const [id,d]of Object.entries(result.data)){optionQuotes[id]=d.mark==null&&optionQuotes[id]?.mark!=null?{...optionQuotes[id],stale:true,message:d.message}:d;}saveAutomaticCache();renderTable();}),
      dataAPI('/api/perps',{}).then(result=>{perpFeed=result;saveAutomaticCache();renderTable();}),
    ];
    if(autoConnections.hyperliquid)tasks.push(dataAPI('/api/account/hyperliquid',{address:autoConnections.hyperliquid}).then(mergeAccountPositions));
    const results=await Promise.allSettled(tasks);
    const failed=results.filter(r=>r.status==='rejected').length;
    if(failed===tasks.length)throw new Error('데이터 서비스 연결 실패');
    await syncNews(force);
    if(await fillDexHistories())renderAll();
    autoFailures=0;nextAutoSync=Date.now()+60000;
    const live=coins.filter(c=>marketByCoin[c.id]?.current_price!=null&&!marketByCoin[c.id]?.stale).length;
    status.textContent=`자동 갱신 켜짐 · 시세 ${live}/${coins.length} · 뉴스 15분 · ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
    setStatus(failed||(!live&&coins.length)?'err':'ok',failed?`${failed}개 연결 실패 · 자동 재시도`:`1분 자동 갱신 · ${autoConnections.hyperliquid?'Hyperliquid 계좌 연결':'보유·진입가 동기화는 계좌 연결 필요'}`);
  }catch{
    autoFailures++;nextAutoSync=Date.now()+Math.min(300000,30000*2**(autoFailures-1));
    for(const d of Object.values(marketByCoin))d.stale=true;
    status.textContent='자동 데이터 서비스 연결 대기 · 기존 데이터 유지';
    setStatus('err','start.command로 데이터 서비스를 실행하세요. 자동으로 다시 연결합니다.');renderTable();
  }finally{autoBusy=false;}
}
loadData = ()=>syncAutomatic();
refresh = async()=>{lastNewsSync=0;await syncAutomatic(true);updateClock();};
function startAutomatic(){
  syncAutomatic();
  automaticTimer=setInterval(()=>{if(Date.now()>=nextAutoSync&&!document.hidden)syncAutomatic();},10000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()>=nextAutoSync)syncAutomatic();});
  window.addEventListener('online',()=>syncAutomatic());
}
function renderNewsFeed(book,id){
  const target=document.getElementById('news-feed');if(!target)return;
  const data=newsByAsset[assetKey(book,id)];
  if(!data){target.innerHTML='<p class="form-help">최신 기사를 자동으로 가져오고 있습니다…</p>';return;}
  const articles=(data.articles||[]).filter(a=>safeNewsURL(a.url));
  target.innerHTML=`<p class="form-help">${data.error?escapeHTML(data.error):data.stale?'저장된 기사 · 새 기사 재시도 중':'Google News · 15분 자동 갱신'}${data.updatedAt?' · '+new Date(data.updatedAt).toLocaleString():''}</p>`+(articles.length?articles.map(a=>`<article class="news-article"><a href="${escapeHTML(a.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(a.title)}</a><p>${escapeHTML(a.source||'출처 미표기')}${a.publishedAt?' · '+new Date(a.publishedAt).toLocaleString():''}</p></article>`).join(''):'<p class="form-help">최근 7일의 검색 결과가 없습니다. 다음 갱신 때 다시 확인합니다.</p>');
}
openNews = async function(book,id){
  const asset=(book==='spot'?coins:bookItems(book)).find(x=>x.id===id);if(!asset)return;
  activeNews={book,id};
  document.getElementById('modal-body').innerHTML=`<div class="modal-head"><div class="minfo"><div class="ticker">${escapeHTML(asset.name||asset.ticker)} · News</div><div class="name">최신 기사 자동 업데이트</div></div><button class="modal-close" aria-label="닫기" onclick="closeModal()">×</button></div><div id="news-feed"></div>`;
  showModal();renderNewsFeed(book,id);
  const key=assetKey(book,id);
  if(!newsByAsset[key]||Date.now()-newsByAsset[key].updatedAt>=900000){
    try{newsByAsset[key]=await dataAPI('/api/news',{asset:assetDescriptor(book,asset)});saveAutomaticCache();}catch{newsByAsset[key]={...newsByAsset[key],error:'뉴스 연결 실패 · 다음 주기에 재시도',stale:true};}
    if(activeNews?.id===id&&activeNews.book===book)renderNewsFeed(book,id);renderTable();
  }
};
function openAutoConnections(){
  document.getElementById('modal-body').innerHTML=`<div class="modal-head"><div class="minfo"><div class="ticker">자동 데이터 연결</div><div class="name">Thesis · Conviction은 동기화해도 유지됩니다.</div></div><button class="modal-close" aria-label="닫기" onclick="closeModal()">×</button></div>
  <div class="connection-list"><p><strong>시세 · 차트 · 로고</strong><span>CoinGecko / CoinPaprika · 1분</span></p><p><strong>News</strong><span>Google News 기사 · 15분</span></p><p><strong>옵션 현재가 · IV · Greeks</strong><span>Deribit 계약 · 1분 (거래소·만기·행사가 일치 시)</span></p><p><strong>PERP 마크 · 펀딩</strong><span>Hyperliquid · 1분</span></p></div>
  ${renderUnresolvedConnections()}<form id="connection-form"><div class="field"><label for="hl-address">Hyperliquid 공개 계좌 주소</label><input id="hl-address" value="${escapeHTML(autoConnections.hyperliquid||'')}" pattern="0x[a-fA-F0-9]{40}" placeholder="0x…" autocomplete="off"><p class="form-help">이 주소를 Hyperliquid 공개 API로 조회해 포지션·수량·진입가·증거금·미실현 손익을 자동으로 가져옵니다. 서명이나 주문 권한은 사용하지 않습니다.</p></div><button class="btn-save" type="submit">연결하고 자동 동기화</button></form>
  <p class="form-help" style="margin-top:20px">다른 거래소의 보유 수량·진입가·보상·포인트·옵션 계좌는 해당 서비스 연결이 필요합니다. 아직 연결되지 않은 값은 기존 기록을 유지합니다. 비밀키를 이 화면이나 채팅에 입력하지 마세요.</p>`;
  showModal();
  document.querySelectorAll('[data-provider-choice]').forEach(select=>select.addEventListener('change',()=>{const c=coins.find(x=>x.id===select.dataset.providerChoice);if(c&&select.value){c.providerId=select.value;c.gecko=select.value;save();closeModal();syncAutomatic();}}));
  document.getElementById('connection-form').addEventListener('submit',e=>{e.preventDefault();if(!e.currentTarget.reportValidity())return;autoConnections.hyperliquid=document.getElementById('hl-address').value.trim();localStorage.setItem(CONNECTION_KEY,JSON.stringify(autoConnections));closeModal();syncAutomatic();});
}
const openRecordedPosition=openPosition;
openPosition=function(book,id){
  openRecordedPosition(book,id);
  const p=bookItems(book).find(x=>x.id===id);if(!p)return;
  const form=document.getElementById('position-form');
  if(p.source==='hyperliquid'){
    for(const input of form.querySelectorAll('input,select,textarea'))if(!['reason','conviction'].includes(input.name))input.disabled=true;
    const remove=document.getElementById('delete-position');if(remove){remove.disabled=true;remove.title='연결된 포지션은 거래소 상태와 자동 동기화됩니다.';}
    const note=document.createElement('p');note.className='form-help';note.textContent='Hyperliquid에서 자동 동기화된 포지션입니다. Thesis와 Conviction만 수정할 수 있습니다.';form.prepend(note);
  }
  if(book==='options'&&optionQuotes[id]?.mark!=null){
    const quote=optionQuotes[id],mark=document.getElementById('p-mark'),multiplier=document.getElementById('p-multiplier');
    if(mark){mark.value=quote.mark;mark.readOnly=true;}
    if(multiplier&&quote.contractSize!=null){multiplier.value=quote.contractSize;multiplier.readOnly=true;}
    const note=document.createElement('p');note.className='form-help';note.textContent=`${quote.instrument} · 현재 프리미엄·승수 자동 연결 · IV ${quote.iv??'미제공'}% · Δ ${quote.greeks?.delta??'미제공'}`;form.prepend(note);
  }
};

function renderUnresolvedConnections(){
  const items=coins.filter(c=>marketByCoin[c.id]?.status==='unresolved');
  if(!items.length)return '';
  return '<div class="connection-list"><p><strong>종목 식별 필요</strong><span>같은 티커의 다른 코인을 자동 선택하지 않습니다. 정확한 종목 연결은 한 번만 설정합니다.</span></p>'+items.map(c=>{const d=marketByCoin[c.id];return `<div class="field"><label>${escapeHTML(c.ticker)} · ${escapeHTML(c.note||c.name)}</label>${d.candidates?.length?`<select aria-label="${escapeHTML(c.ticker)} 데이터 연결" data-provider-choice="${escapeHTML(c.id)}"><option value="">정확한 종목 선택</option>${d.candidates.map(x=>`<option value="${escapeHTML(x.id)}">${escapeHTML(x.name)} · ${escapeHTML(x.id)}</option>`).join('')}</select>`:`<p class="form-help">${escapeHTML(d.message||'토큰 주소 또는 정확한 프로젝트 식별자가 필요합니다.')}</p>`}</div>`}).join('')+'</div>';
}
