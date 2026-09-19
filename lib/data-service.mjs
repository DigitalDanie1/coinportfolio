import fs from 'node:fs/promises';
import path from 'node:path';

export const num = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
export const normal = value => String(value||'').toLowerCase().replace(/^the\s+/, '').replace(/[^\p{L}\p{N}]/gu,'');
const errorText = e => e.status===429?'요청 한도 초과':e.status===401||e.status===403?'접근 권한 필요':e.name==='TimeoutError'?'응답 시간 초과':'데이터 소스 응답 실패';
export function resolveAsset(coin,list) {
  // Prefer an exact unique project identity, never the first same-symbol meme coin.
  if(coin.providerId) {const item=list.find(x=>x.id===coin.providerId);if(item)return {item,method:'selected-id'};}
  const byName=list.filter(x=>normal(x.name)===normal(coin.name));
  const exact=byName.filter(x=>String(x.symbol).toUpperCase()===String(coin.ticker).toUpperCase());
  if(exact.length===1 && normal(coin.name)!==normal(coin.ticker)) return {item:exact[0],method:'name+symbol'};
  const specified=coin.gecko && list.find(x=>x.id===coin.gecko);
  if(specified && (normal(specified.name)===normal(coin.name) || normal(coin.name)!==normal(coin.ticker) && String(specified.symbol).toUpperCase()===String(coin.ticker).toUpperCase() && exact.length===0)) return {item:specified,method:'existing-id'};
  if(byName.length===1 && normal(coin.name)!==normal(coin.ticker)) return {item:byName[0],method:'unique-name'};
  const symbols=list.filter(x=>String(x.symbol).toUpperCase()===String(coin.ticker).toUpperCase());
  if(symbols.length===1 && (normal(symbols[0].name)===normal(coin.name) || normal(coin.name)===normal(coin.ticker))) return {item:symbols[0],method:'unique-symbol-name'};
  return {item:null,candidates:symbols.slice(0,12).map(x=>({id:x.id,name:x.name,symbol:x.symbol})),reason:symbols.length?'동일 티커의 자산이 여러 개이거나 이름이 일치하지 않습니다.':'공개 데이터 소스에서 종목을 식별하지 못했습니다.'};
}
export function parseRSS(xml) {
  const decode=s=>String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,'').replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code<=0x10ffff?String.fromCodePoint(code):''}).replace(/&(amp|lt|gt|quot|apos);/g,(_,k)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[k]));
  const field=(s,t)=>decode(s.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${t}>`,'i'))?.[1]).trim();
  const seen=new Set();
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(m=>({title:field(m[1],'title'),url:field(m[1],'link'),publishedAt:field(m[1],'pubDate'),source:field(m[1],'source')})).filter(x=>{
    if(!x.title || !/^https:\/\//.test(x.url)||seen.has(x.url))return false;
    seen.add(x.url);x.publishedAt=Number.isFinite(Date.parse(x.publishedAt))?new Date(x.publishedAt).toISOString():null;return true;
  }).sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)).slice(0,8);
}
export class DataService {
  constructor({fetcher=fetch,cacheDir=null,env=process.env}={}) {this.fetcher=fetcher;this.cacheDir=cacheDir;this.env=env;this.cache=new Map();this.pending=new Map();this.cooldown=new Map();this.historyBudget=0;}
  async restore() {if(!this.cacheDir)return;try{for(const [key,value] of JSON.parse(await fs.readFile(path.join(this.cacheDir,'public-cache.json'),'utf8')))this.cache.set(key,value);}catch{}}
  async persist() {
    if(!this.cacheDir)return;
    this.persistQueue=(this.persistQueue||Promise.resolve()).catch(()=>{}).then(async()=>{
      await fs.mkdir(this.cacheDir,{recursive:true,mode:0o700});
      const entries=[...this.cache].filter(([k])=>!k.startsWith('private:'));
      const target=path.join(this.cacheDir,'public-cache.json'),temp=target+'.tmp';
      await fs.writeFile(temp,JSON.stringify(entries),{mode:0o600});
      await fs.rename(temp,target);
    });
    return this.persistQueue;
  }
  async cached(key,ttl,fn) {
    const old=this.cache.get(key),now=Date.now();
    if(old && now-old.updatedAt<ttl)return {...old,stale:false};
    if(this.pending.has(key))return this.pending.get(key);
    if((this.cooldown.get(key)||0)>now){if(old)return {...old,stale:true,error:'재시도 대기'};throw new Error('재시도 대기');}
    const work=(async()=>{try{const data=await fn();const entry={data,updatedAt:Date.now()};this.cache.set(key,entry);this.cooldown.delete(key);return {...entry,stale:false};}catch(e){this.cooldown.set(key,Date.now()+(e.status===429?300000:60000));if(old)return {...old,stale:true,error:errorText(e)};throw e;}finally{this.pending.delete(key);}})();
    this.pending.set(key,work);return work;
  }
  async request(url,body,headers={}) {
    const r=await this.fetcher(url,{method:body?'POST':'GET',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
    if(!r.ok){const e=new Error(`Upstream HTTP ${r.status}`);e.status=r.status;throw e;}
    const data=await r.json();if(data.error)throw new Error('Upstream API error');return data;
  }
  dexIdentity(dex) {
    if(!dex||!/^[a-z0-9-]{1,40}$/.test(dex.chain)||!/^[a-zA-Z0-9]{1,100}$/.test(dex.pair)||!/^[a-zA-Z0-9]{1,100}$/.test(dex.token))throw new Error('Invalid DEX identity');
    return {key:`dex:${dex.chain}:${dex.pair}`,url:`https://dexscreener.com/${dex.chain}/${dex.pair}`};
  }
  // Server-side collectedHistory only grows while a process stays warm, which never happens on
  // serverless, so DEX pairs take their 7-day series from GeckoTerminal's candles instead.
  async dexHistory(dex) {
    if(!/^[a-z0-9_-]{1,40}$/.test(dex.chain)||!/^[a-zA-Z0-9]{1,100}$/.test(dex.pair))return [];
    const key=`gt:ohlcv:${dex.chain}:${dex.pair}`;
    const fresh=this.cache.get(key);
    const usable=rows=>Array.isArray(rows)?rows.map(x=>num(x[4])).filter(x=>x!=null&&x>0).reverse():[];
    // Candles arrive newest-first; the chart wants oldest-first closes.
    if(fresh&&Date.now()-fresh.updatedAt<3600000)return usable(fresh.data?.data?.attributes?.ohlcv_list);
    // GeckoTerminal throttles hard on a shared IP, so only a few coins refill per request and the
    // rest keep whatever they already have until a later cycle.
    if(this.historyBudget<=0)return usable(fresh?.data?.data?.attributes?.ohlcv_list);
    this.historyBudget--;
    const candles=pool=>this.request(`https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(dex.chain)}/pools/${encodeURIComponent(pool)}/ohlcv/hour?aggregate=1&limit=168`);
    const r=await this.cached(key,3600000,async()=>{
      try{return await candles(dex.pair);}catch(e){if(e.status!==404)throw e;}
      // GeckoTerminal indexes fewer pools than DEX Screener; fall back to its deepest pool for the token.
      if(!/^[a-zA-Z0-9]{1,100}$/.test(dex.token||''))throw Object.assign(new Error('Pool not indexed'),{status:404});
      const list=await this.request(`https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(dex.chain)}/tokens/${encodeURIComponent(dex.token)}/pools?page=1`);
      const best=(list.data||[]).map(p=>p.attributes).filter(a=>a?.address)
        .sort((a,b)=>Number(b.reserve_in_usd||0)-Number(a.reserve_in_usd||0))[0];
      if(!best)throw Object.assign(new Error('Pool not indexed'),{status:404});
      return candles(best.address);
    });
    return usable(r.data?.data?.attributes?.ohlcv_list);
  }
  async dexMarket(coin) {
    const dex=coin.dex,{key}=this.dexIdentity(dex);
    const same=(a,b)=>dex.chain==='solana'?a===b:String(a).toLowerCase()===String(b).toLowerCase();
    const r=await this.cached(key,60000,async()=>{
      const result=await this.request(`https://api.dexscreener.com/latest/dex/pairs/${dex.chain}/${dex.pair}`);
      const pair=result.pairs?.find(p=>p.chainId===dex.chain&&same(p.pairAddress,dex.pair)&&same(p.baseToken?.address,dex.token));
      if(!pair)throw new Error('DEX pool identity mismatch');
      return pair;
    });
    const p=r.data,price=num(p.priceUsd),historyKey=key+':history';
    const history=(this.cache.get(historyKey)?.data||[]).filter(x=>x.time>Date.now()-7*86400000);
    if(!r.stale&&price!=null&&history.at(-1)?.time!==r.updatedAt)history.push({time:r.updatedAt,price});
    this.cache.set(historyKey,{data:history.slice(-10080),updatedAt:Date.now()});
    let candles=[];
    try{candles=await this.dexHistory(dex);}catch{}
    const change7d=candles.length>1&&candles[0]>0?(candles[candles.length-1]/candles[0]-1)*100:null;
    return {canonicalId:key,canonicalName:p.baseToken.name,canonicalSymbol:p.baseToken.symbol,current_price:price,market_cap:num(p.marketCap),fdv:num(p.fdv),total_volume:num(p.volume?.h24),liquidity:num(p.liquidity?.usd),price_change_percentage_24h:num(p.priceChange?.h24),price_change_percentage_7d_in_currency:change7d,image:p.info?.imageUrl||null,sparkline_in_7d:{price:candles},collectedHistory:history,chartSource:candles.length?'GeckoTerminal · 1시간':'DEX Screener · 연결 이후 수집',source:`DEX Screener · ${dex.chain}`,updatedAt:r.updatedAt,stale:r.stale,status:r.stale?'stale':price==null?'metadata-only':'live'};
  }
  async dexSearch(query) {
    const q=String(query||'').trim().slice(0,40);
    if(!/^[\w .-]{1,40}$/.test(q))throw new Error('Invalid search query');
    const chains={ethereum:1,solana:1,base:1,arbitrum:1,bsc:1,polygon:1,optimism:1,avalanche:1,hyperevm:1,robinhood:1,berachain:1,sui:1,sonic:1,abstract:1,monad:1};
    const result=await this.cached('dex:search:'+q.toLowerCase(),300000,()=>this.request('https://api.dexscreener.com/latest/dex/search?q='+encodeURIComponent(q)));
    const want=q.toUpperCase();
    const pairs=(result.data.pairs||[])
      .filter(p=>chains[p.chainId]&&p.pairAddress&&p.baseToken?.address&&String(p.baseToken.symbol||'').toUpperCase()===want)
      .sort((a,b)=>((b.liquidity?.usd)||0)-((a.liquidity?.usd)||0));
    const seen=new Set(),out=[];
    for(const p of pairs){
      const key=p.chainId+':'+p.baseToken.address.toLowerCase();
      if(seen.has(key))continue;seen.add(key);
      out.push({chain:p.chainId,pair:p.pairAddress,token:p.baseToken.address,symbol:p.baseToken.symbol,name:p.baseToken.name,
        quote:p.quoteToken?.symbol||null,dexId:p.dexId||null,liquidity:num(p.liquidity?.usd),volume24h:num(p.volume?.h24),
        priceUsd:num(p.priceUsd),marketCap:num(p.marketCap),url:`https://dexscreener.com/${p.chainId}/${p.pairAddress}`});
      if(out.length===8)break;
    }
    return {query:q,candidates:out,updatedAt:result.updatedAt,stale:result.stale,source:'DEX Screener'};
  }
  // Equities are marked on the asset itself, never inferred from a category: a coin whose ticker
  // also trades as a stock (STX/Stacks vs Seagate) must never be priced as the stock.
  async equityMarket(coin) {
    const symbol=String(coin.equity?.symbol||'');
    if(!/^[A-Z]+:[A-Z0-9.-]{1,12}$/.test(symbol))throw new Error('Invalid equity symbol');
    const ticker=symbol.split(':')[1];
    const r=await this.cached('equity:'+ticker,60000,()=>this.request('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(ticker)+'?interval=1h&period1='+Math.floor((Date.now()-7*86400000)/1000)+'&period2='+Math.floor(Date.now()/1000),null,{'User-Agent':'Mozilla/5.0'}));
    const q=r.data.chart?.result?.[0],meta=q?.meta;
    if(!meta||meta.currency!=='USD')throw new Error('Unsupported equity quote currency');
    const history=(q.indicators?.quote?.[0]?.close||[]).map(num).filter(x=>x!=null);
    const price=num(meta.regularMarketPrice);
    return {status:r.stale?'stale':price==null?'metadata-only':'live',current_price:price,
      price_change_percentage_24h:num(meta.regularMarketChangePercent),
      market_cap:null,image:null,sparkline_in_7d:{price:history},
      price_change_percentage_7d_in_currency:history[0]>0?(price/history[0]-1)*100:null,
      source:'Yahoo Finance · 전일 대비',canonicalName:meta.longName||meta.shortName,
      canonicalSymbol:meta.symbol,chartSource:'Yahoo Finance · 1시간',
      updatedAt:r.updatedAt,providerUpdatedAt:meta.regularMarketTime*1000,stale:r.stale};
  }
  async markets(allCoins,nested=false) {
    if(!nested)this.historyBudget=6;
    const equities=allCoins.filter(c=>c.equity),coins=allCoins.filter(c=>!c.equity);
    if(equities.length){
      const rest=coins.length?await this.markets(coins,true):{data:{},unresolved:[],sources:{}};
      const data={...rest.data},unresolved=[...rest.unresolved];
      for(let i=0;i<equities.length;i+=4)await Promise.all(equities.slice(i,i+4).map(async c=>{
        try{data[c.id]=await this.equityMarket(c);}
        catch{data[c.id]={status:'unavailable',message:'주식 시세 미수신 · USD 상장 티커 확인'};unresolved.push(c.id);}
      }));
      return {data,unresolved,sources:{...rest.sources,'Yahoo Finance':'available'},updatedAt:Date.now()};
    }
    // Shuffled so the limited history budget is not always spent on whichever coins sort first;
    // on serverless every request is a cold cache, and a fixed order starves the tail forever.
    const dexCoins=coins.filter(c=>c.dex).map(c=>[Math.random(),c]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
    const others=coins.filter(c=>!c.dex);
    if(dexCoins.length){
      const normalResult=others.length?this.markets(others,true):Promise.resolve({data:{},unresolved:[],sources:{}});
      const data={},unresolved=[];
      for(let i=0;i<dexCoins.length;i+=4)await Promise.all(dexCoins.slice(i,i+4).map(async c=>{
        try{data[c.id]=await this.dexMarket(c);}catch{data[c.id]={status:'unavailable',message:'지정한 DEX 페어 응답 실패'};unresolved.push(c.id);}
      }));
      const rest=await normalResult;
      await this.persist().catch(()=>{});
      return {data:{...rest.data,...data},unresolved:[...rest.unresolved,...unresolved],sources:{...rest.sources,DexScreener:unresolved.length?'partial':'available'},updatedAt:Date.now()};
    }
    const [gecko,paprika]=await Promise.allSettled([
      this.cached('gecko:list',86400000,()=>this.request('https://api.coingecko.com/api/v3/coins/list')),
      this.cached('paprika:tickers',120000,()=>this.request('https://api.coinpaprika.com/v1/tickers'))
    ]);
    const gl=gecko.status==='fulfilled'&&Array.isArray(gecko.value.data)?gecko.value.data:[];
    const pl=paprika.status==='fulfilled'&&Array.isArray(paprika.value.data)?paprika.value.data:[];
    const identities=coins.map(c=>({c,g:resolveAsset(c,gl),p:resolveAsset({...c,gecko:null,providerId:null},pl)}));
    const ids=[...new Set(identities.map(x=>x.g.item?.id).filter(Boolean))].sort();
    let marketEntries=[];
    for(let i=0;i<ids.length;i+=100){const chunk=ids.slice(i,i+100);try{const response=await this.cached('gecko:markets:'+chunk.join(','),60000,()=>this.request('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&sparkline=true&price_change_percentage=7d&per_page=100&ids='+encodeURIComponent(chunk.join(','))));marketEntries.push(...response.data.map(d=>({d,response})));}catch{}}
    const data={},unresolved=[];
    // Bounded concurrency keeps discovery/chart calls below provider burst limits.
    for(let i=0;i<identities.length;i+=4) await Promise.all(identities.slice(i,i+4).map(async ({c,g,p})=>{
      const gm=marketEntries.find(x=>x.d.id===g.item?.id);
      let result=gm?{...gm.d,source:'CoinGecko',updatedAt:gm.response.updatedAt,stale:gm.response.stale,canonicalId:g.item.id,canonicalName:g.item.name,canonicalSymbol:g.item.symbol.toUpperCase()}:null;
      if((!result || result.stale || result.current_price==null) && p.item) {
        const quote=p.item.quotes?.USD;
        if(quote && (!result || !paprika.value.stale)) {
          const [meta,hist]=await Promise.allSettled([
            this.cached('paprika:meta:'+p.item.id,86400000,()=>this.request('https://api.coinpaprika.com/v1/coins/'+encodeURIComponent(p.item.id))),
            this.cached('paprika:history:'+p.item.id,3600000,()=>this.request('https://api.coinpaprika.com/v1/tickers/'+encodeURIComponent(p.item.id)+'/historical?start='+new Date(Date.now()-8*86400000).toISOString().slice(0,10)+'&interval=24h'))
          ]);
          const history=hist.status==='fulfilled'?hist.value.data:[];
          result={id:g.item?.id||p.item.id,canonicalId:g.item?.id||null,canonicalName:p.item.name,canonicalSymbol:p.item.symbol,current_price:num(quote.price),market_cap:num(quote.market_cap),total_volume:num(quote.volume_24h),price_change_percentage_24h:num(quote.percent_change_24h),price_change_percentage_7d_in_currency:num(quote.percent_change_7d),image:meta.status==='fulfilled'?meta.value.data.logo:gm?.d.image,sparkline_in_7d:{price:history.slice(-8).map(x=>num(x.price)).filter(x=>x!=null)},chartSource:'CoinPaprika · 일별',chartUpdatedAt:hist.status==='fulfilled'?hist.value.updatedAt:null,source:'CoinPaprika',updatedAt:paprika.value.updatedAt,providerUpdatedAt:p.item.last_updated,stale:paprika.value.stale};
        }
      }
      if(g.item && (!result?.image || !result?.sparkline_in_7d?.price?.length)) {
        try {
          const meta=await this.cached('gecko:detail:'+g.item.id,3600000,()=>this.request('https://api.coingecko.com/api/v3/coins/'+encodeURIComponent(g.item.id)+'?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=true'));
          const md=meta.data.market_data||{};
          if(!result)result={id:g.item.id,canonicalId:g.item.id,canonicalName:meta.data.name,canonicalSymbol:String(meta.data.symbol||'').toUpperCase(),current_price:num(md.current_price?.usd),market_cap:num(md.market_cap?.usd),total_volume:num(md.total_volume?.usd),price_change_percentage_24h:num(md.price_change_percentage_24h),price_change_percentage_7d_in_currency:num(md.price_change_percentage_7d),source:'CoinGecko',updatedAt:meta.updatedAt,stale:meta.stale};
          result.image ||= meta.data.image?.large||meta.data.image?.small;
          if(!result.sparkline_in_7d?.price?.length)result.sparkline_in_7d=md.sparkline_7d||{price:[]};
        }catch{}
      }
      if(result) {result.status=result.stale?'stale':result.current_price==null?'metadata-only':'live';data[c.id]=result;}
      else {data[c.id]={status:g.item?'unavailable':'unresolved',message:g.item?'시세 데이터 미제공':g.reason,candidates:g.candidates||[],canonicalId:g.item?.id||null};unresolved.push(c.id);}
    }));
    await this.persist().catch(()=>{});
    return {data,unresolved,updatedAt:Date.now(),sources:{CoinGecko:gecko.status==='fulfilled'?'available':'unavailable',CoinPaprika:paprika.status==='fulfilled'?'available':'unavailable'}};
  }
  async chartSources(coin) {
    if(coin.equity){
      const symbol=String(coin.equity.symbol||'');
      if(!/^[A-Z]+:[A-Z0-9.-]{1,12}$/.test(symbol))return {sources:[],message:'주식 종목 코드를 확인하지 못했습니다.'};
      return {sources:[{type:'tradingview',symbol,label:symbol,url:'https://www.tradingview.com/chart/?symbol='+encodeURIComponent(symbol)}],identity:symbol};
    }
    if(coin.dex){
      const {url,key}=this.dexIdentity(coin.dex);
      return {sources:[{type:'dex',label:`${coin.ticker} · ${coin.dex.chain}`,url,chain:coin.dex.chain,pair:coin.dex.pair,token:coin.dex.token}],identity:key};
    }
    const list=await this.cached('gecko:list',86400000,()=>this.request('https://api.coingecko.com/api/v3/coins/list'));
    const identity=resolveAsset(coin,list.data);
    if(!identity.item)return {sources:[],message:'먼저 정확한 종목을 연결해야 차트를 열 수 있습니다.'};
    const id=identity.item.id;
    const [ticks,meta]=await Promise.allSettled([
      this.cached('gecko:tickers:'+id,3600000,()=>this.request('https://api.coingecko.com/api/v3/coins/'+encodeURIComponent(id)+'/tickers?order=volume_desc&page=1')),
      this.cached('gecko:platforms:'+id,86400000,()=>this.request('https://api.coingecko.com/api/v3/coins/'+encodeURIComponent(id)+'?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false'))
    ]);
    const sources=[],seen=new Set(),exchanges={binance:'BINANCE','coinbase-exchange':'COINBASE',kraken:'KRAKEN',okx:'OKX',bybit_spot:'BYBIT',kucoin:'KUCOIN',gate:'GATEIO'};
    if(ticks.status==='fulfilled')for(const pair of ticks.value.data.tickers||[]){
      const exchange=exchanges[pair.market?.identifier],base=String(pair.base).toUpperCase(),target=String(pair.target).toUpperCase();
      if(!exchange||!['USD','USDT','USDC'].includes(target)||base!==identity.item.symbol.toUpperCase()||!/^[A-Z0-9]{2,15}$/.test(base)||pair.is_stale||pair.is_anomaly)continue;
      const symbol=exchange+':'+base+target;if(seen.has(symbol))continue;seen.add(symbol);
      sources.push({type:'tradingview',symbol,label:symbol,url:'https://www.tradingview.com/chart/?symbol='+encodeURIComponent(symbol)});
      if(sources.length===3)break;
    }
    if(meta.status==='fulfilled'){
      const chains={ethereum:'ethereum','arbitrum-one':'arbitrum',base:'base',solana:'solana','binance-smart-chain':'bsc','polygon-pos':'polygon',optimistic_ethereum:'optimism',avalanche:'avalanche',hyperevm:'hyperevm'};
      const platforms=Object.entries(meta.value.data.platforms||{}).filter(([chain,address])=>chains[chain]&&address).slice(0,3);
      const pools=await Promise.allSettled(platforms.map(async([chain,address])=>{
        const result=await this.cached('dex:pools:'+chain+':'+address,300000,()=>this.request('https://api.dexscreener.com/token-pairs/v1/'+chains[chain]+'/'+encodeURIComponent(address)));
        return result.data.filter(p=>p.chainId===chains[chain]&&(chain==='solana'?p.baseToken?.address===address:p.baseToken?.address?.toLowerCase()===address.toLowerCase())&&/^https:\/\/dexscreener\.com\//.test(p.url||'')).sort((a,b)=>{const preferred=p=>['USDC','USDT','USD','DAI','WETH','WBNB','SOL','WSOL','WAVAX','WBTC'].includes(String(p.quoteToken?.symbol).toUpperCase())?1:0;return preferred(b)-preferred(a)||(b.volume?.h24||0)-(a.volume?.h24||0)||(b.liquidity?.usd||0)-(a.liquidity?.usd||0);}).slice(0,1);
      }));
      for(const result of pools)if(result.status==='fulfilled')for(const p of result.value)sources.push({type:'dex',label:`${p.dexId} · ${p.chainId} · ${p.baseToken.symbol}/${p.quoteToken.symbol}`,url:p.url,chain:p.chainId,pair:p.pairAddress,token:p.baseToken.address});
    }
    return {sources,message:sources.length?'':'확인된 거래소 또는 DEX 페어가 없습니다.',identity:id};
  }
  async news(asset) {
    const query=`"${String(asset.name||asset.ticker).replace(/["<>]/g,'')}" crypto when:7d`;
    const result=await this.cached('news:'+query,900000,async()=>{
      const r=await this.fetcher('https://news.google.com/rss/search?'+new URLSearchParams({q:query,hl:'en-US',gl:'US',ceid:'US:en'}),{signal:AbortSignal.timeout(12000)});
      if(!r.ok){const e=new Error('News unavailable');e.status=r.status;throw e;}const xml=await r.text();if(!xml.includes('<rss'))throw new Error('Invalid RSS');return parseRSS(xml);
    });
    return {articles:result.data,updatedAt:result.updatedAt,stale:result.stale,source:'Google News',query};
  }
  async optionQuotes(positions) {
    const data={};
    for(const p of positions){
      if(!/^deribit$/i.test(p.venue||'')&&!p.instrument){data[p.id]={status:'connection-required',message:'거래소 또는 종목 코드 연결 필요'};continue;}
      const currency=String(p.ticker).toUpperCase();
      if(!['BTC','ETH','SOL','USDC'].includes(currency)){data[p.id]={status:'unavailable',message:'지원되지 않는 기초자산'};continue;}
      try {
        const list=await this.cached('deribit:instruments:'+currency,3600000,()=>this.request('https://www.deribit.com/api/v2/public/get_instruments?'+new URLSearchParams({currency:['BTC','ETH'].includes(currency)?currency:'USDC',kind:'option'})).then(d=>d.result));
        const matches=list.data.filter(x=>p.instrument?x.instrument_name===p.instrument:x.base_currency===currency&&new Date(x.expiration_timestamp).toISOString().slice(0,10)===p.expiry&&x.strike===Number(p.strike)&&x.option_type===p.kind);
        if(matches.length!==1){data[p.id]={status:'unavailable',message:'일치하는 활성 계약 없음 · 만기 또는 종목 코드 확인'};continue;}
        const instrument=matches[0];
        const tick=await this.cached('deribit:ticker:'+instrument.instrument_name,30000,()=>this.request('https://www.deribit.com/api/v2/public/ticker?instrument_name='+encodeURIComponent(instrument.instrument_name)).then(d=>d.result));
        const factor=['USD','USDC','USDT'].includes(instrument.quote_currency)?1:tick.data.index_price;
        data[p.id]={status:tick.stale?'stale':'live',source:'Deribit',instrument:instrument.instrument_name,mark:num(tick.data.mark_price)==null?null:tick.data.mark_price*factor,markNative:tick.data.mark_price,quoteCurrency:instrument.quote_currency,indexPrice:tick.data.index_price,contractSize:instrument.contract_size,iv:tick.data.mark_iv,greeks:tick.data.greeks,updatedAt:tick.updatedAt};
      } catch(e) {data[p.id]={status:'error',message:errorText(e)};}
    }
    return {data};
  }
  async perpMarkets() {
    const result=await this.cached('hyperliquid:markets',30000,()=>this.request('https://api.hyperliquid.xyz/info',{type:'metaAndAssetCtxs'}));
    const [meta,ctx]=result.data;
    return {data:meta.universe.map((x,i)=>({symbol:x.name,maxLeverage:x.maxLeverage,delisted:!!x.isDelisted,mark:num(ctx[i]?.markPx),fundingHourly:num(ctx[i]?.funding),openInterest:num(ctx[i]?.openInterest),volume24h:num(ctx[i]?.dayNtlVlm)})).filter(x=>!x.delisted),source:'Hyperliquid',updatedAt:result.updatedAt,stale:result.stale};
  }
  async hyperliquidAccount(address) {
    if(!/^0x[a-fA-F0-9]{40}$/.test(address))throw new Error('Invalid wallet address');
    const result=await this.cached('private:hyperliquid:'+address.toLowerCase(),30000,()=>this.request('https://api.hyperliquid.xyz/info',{type:'clearinghouseState',user:address}));
    const positions=result.data.assetPositions.map(({position:p})=>({id:'hl:'+address.toLowerCase()+':'+p.coin,source:'hyperliquid',name:'Hyperliquid',ticker:p.coin,venue:'Hyperliquid',side:Number(p.szi)>=0?'long':'short',quantity:Math.abs(Number(p.szi)),entry:num(p.entryPx),collateral:num(p.marginUsed),leverage:num(p.leverage?.value),apiPnL:num(p.unrealizedPnl),liquidationPrice:num(p.liquidationPx),funding:null,rewards:null,fees:null,points:null,pnl:null,updatedAt:result.updatedAt,stale:result.stale}));
    return {positions,accountValue:num(result.data.marginSummary?.accountValue),updatedAt:result.updatedAt,stale:result.stale,source:'Hyperliquid'};
  }
}
