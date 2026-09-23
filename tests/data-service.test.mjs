import test from 'node:test';
import assert from 'node:assert/strict';
import {DataService,resolveAsset,parseRSS} from '../lib/data-service.mjs';
const response=(data,status=200)=>({ok:status===200,status,json:async()=>data,text:async()=>data});
test('asset identity prefers the matching name, refuses ambiguous symbols, corrects stale default IDs',()=>{
  const list=[{id:'wrong',name:'Manifold Finance',symbol:'fold'},{id:'interfold',name:'The Interfold',symbol:'fold'},{id:'stonk-a',name:'STONK',symbol:'stonk'},{id:'stonk-b',name:'STONK',symbol:'stonk'}];
  assert.equal(resolveAsset({ticker:'FOLD',name:'Interfold',gecko:'wrong'},list).item.id,'interfold');
  assert.equal(resolveAsset({ticker:'STONK',name:'STONK'},list).item,null);
  assert.equal(resolveAsset({ticker:'STONK',name:'STONK',providerId:'stonk-b'},list).item.id,'stonk-b');
});
test('provider cache de-duplicates requests and backs off without losing stale data',async()=>{
  const d=new DataService();let calls=0;
  const fn=async()=>{calls++;return {price:10}};
  await Promise.all([d.cached('test',1000,fn),d.cached('test',1000,fn)]);assert.equal(calls,1);
  const fail=async()=>{calls++;const e=new Error('rate limit');e.status=429;throw e};
  const a=await d.cached('test',-1,fail);assert.equal(a.stale,true);assert.equal(a.data.price,10);
  await d.cached('test',-1,fail);assert.equal(calls,2);
});
test('RSS extracts text, dates and source, deduplicates links and rejects javascript',()=>{
  const xml='<rss><item><title><![CDATA[A &amp; B]]></title><link>https://example.com/a</link><pubDate>Wed, 16 Sep 2026 10:00:00 GMT</pubDate><source url="https://example.com">Publisher</source></item><item><title>duplicate</title><link>https://example.com/a</link></item><item><title>bad</title><link>javascript:alert(1)</link></item></rss>';
  const data=parseRSS(xml);assert.equal(data.length,1);assert.equal(data[0].title,'A & B');assert.equal(data[0].source,'Publisher');assert.equal(data[0].publishedAt,'2026-09-16T10:00:00.000Z');
});
test('CoinPaprika supplies real history and metadata when Gecko is limited',async()=>{
  const d=new DataService({fetcher:async url=>{
    if(url.includes('coingecko'))return response({},429);
    if(url.endsWith('/tickers'))return response([{id:'zec-zcash',name:'Zcash',symbol:'ZEC',quotes:{USD:{price:30,market_cap:100,percent_change_24h:2,percent_change_7d:5}},last_updated:'2026-09-18T10:00:00Z'}]);
    if(url.includes('/historical'))return response([{price:20},{price:25},{price:30}]);
    if(url.includes('/coins/zec'))return response({logo:'https://example.com/logo.png'});
    throw new Error('Unexpected endpoint '+url);
  }});
  const data=(await d.markets([{id:'zec',name:'Zcash',ticker:'ZEC',gecko:'zcash'}])).data.zec;
  assert.equal(data.source,'CoinPaprika');assert.equal(data.current_price,30);assert.deepEqual(data.sparkline_in_7d.price,[20,25,30]);assert.equal(data.image,'https://example.com/logo.png');
});
test('news batches every asset into one call per RSS query and isolates per-asset failures',async()=>{
  let calls=0;
  const d=new DataService({fetcher:async url=>{
    calls++;
    if(url.includes('BadTicker'))return response('',500);
    return response('<rss><item><title>A</title><link>https://example.com/a</link></item></rss>');
  }});
  const result=await d.newsBatch([{key:'spot:uni',name:'Uniswap',ticker:'UNI'},{key:'spot:bad',name:'BadTicker',ticker:'BAD'}]);
  assert.equal(calls,2);
  assert.equal(result.data['spot:uni'].articles.length,1);
  assert.equal(result.data['spot:bad'].status,'error');
  const cached=await d.newsBatch([{key:'spot:uni',name:'Uniswap',ticker:'UNI'}]);
  assert.equal(calls,2,'same query should hit the shared cache, not refetch');
  assert.equal(cached.data['spot:uni'].articles.length,1);
});
test('Deribit premiums convert with spot index, not underlying futures price; no entry data sent',async()=>{
  const urls=[];const d=new DataService({fetcher:async(url)=>{
    urls.push(url);
    if(url.includes('get_instruments'))return response({result:[{instrument_name:'BTC-25SEP26-80000-C',base_currency:'BTC',quote_currency:'BTC',strike:80000,option_type:'call',contract_size:1,expiration_timestamp:Date.parse('2026-09-25T08:00:00Z')}]});
    return response({result:{mark_price:.02,index_price:80000,underlying_price:81000,mark_iv:40,greeks:{delta:.4}}});
  }});
  const result=await d.optionQuotes([{id:'a',venue:'Deribit',ticker:'BTC',expiry:'2026-09-25',strike:80000,kind:'call',entry:99,reason:'private thesis'}]);
  assert.equal(result.data.a.mark,1600);assert.equal(result.data.a.contractSize,1);assert(!urls.join().includes('private thesis'));assert(!urls.join().includes('entry'));
});
test('Hyperliquid account sync uses reported positions without inventing rewards or fees',async()=>{
  const address='0x'+'a'.repeat(40);let payload;
  const d=new DataService({fetcher:async(url,opts)=>{payload=JSON.parse(opts.body);return response({assetPositions:[{position:{coin:'BTC',szi:'-0.2',entryPx:'80000',marginUsed:'2000',leverage:{value:8},unrealizedPnl:'-20',liquidationPx:'90000'}}],marginSummary:{accountValue:'3000'}});}});
  const result=await d.hyperliquidAccount(address);assert.equal(payload.user,address);assert.equal(payload.type,'clearinghouseState');assert.equal(result.positions[0].side,'short');assert.equal(result.positions[0].apiPnL,-20);assert.equal(result.positions[0].fees,null);assert.equal(result.positions[0].rewards,null);
});
test('chart discovery uses exact contracts and ignores counterfeit same-symbol pools',async()=>{
  const d=new DataService({fetcher:async url=>{
    if(url.endsWith('/coins/list'))return response([{id:'uniswap',name:'Uniswap',symbol:'uni'}]);
    if(url.includes('/tickers?'))return response({tickers:[{base:'UNI',target:'USDT',market:{identifier:'binance'}},{base:'FAKE',target:'USDT',market:{identifier:'binance'}}]});
    if(url.includes('/coins/uniswap?'))return response({platforms:{ethereum:'0xabc'}});
    if(url.includes('dexscreener'))return response([{chainId:'ethereum',baseToken:{address:'0xabc',symbol:'UNI'},quoteToken:{symbol:'WETH'},pairAddress:'0xpool',dexId:'uniswap',url:'https://dexscreener.com/ethereum/0xpool',liquidity:{usd:100}},{chainId:'ethereum',baseToken:{address:'0xfake',symbol:'UNI'},quoteToken:{symbol:'WETH'},pairAddress:'0xfakepool',dexId:'uniswap',url:'https://dexscreener.com/ethereum/0xfakepool',liquidity:{usd:1000000}}]);
    throw new Error('Unexpected URL '+url);
  }});
  const result=await d.chartSources({name:'Uniswap',ticker:'UNI',gecko:'uniswap'});
  assert.equal(result.sources[0].symbol,'BINANCE:UNIUSDT');assert.equal(result.sources[1].token,'0xabc');assert.equal(result.sources.length,2);
});
test('explicit DEX pools bypass symbol discovery, preserve cap semantics and collect only real observations',async()=>{
  const dex={chain:'solana',pair:'AbC123',token:'Token123'};let calls=0;
  const d=new DataService({fetcher:async url=>{
    calls++;
    if(url.includes('geckoterminal'))return response({data:{attributes:{ohlcv_list:[]}}});
    assert.equal(url,'https://api.dexscreener.com/latest/dex/pairs/solana/AbC123');
    return response({pairs:[{chainId:'solana',pairAddress:'AbC123',baseToken:{address:'Token123',name:'Hypurr',symbol:'PURR'},priceUsd:'0.02',fdv:500,image:null,info:{imageUrl:'https://example.com/logo.png'},priceChange:{h24:2},volume:{h24:100}}]});
  }});
  const coin={id:'purr-sol',ticker:'PURR',dex};
  const a=(await d.markets([coin])).data[coin.id];
  assert.equal(a.current_price,.02);assert.equal(a.market_cap,null);assert.equal(a.fdv,500);assert.equal(a.image,'https://example.com/logo.png');assert.deepEqual(a.sparkline_in_7d.price,[]);assert.equal(a.collectedHistory.length,1);
  const callsAfterFirst=calls;
  await d.markets([coin]);assert.equal(calls,callsAfterFirst,'a second call should reuse the cached pair and candle data');assert.equal(d.cache.get(a.canonicalId+':history').data.length,1);
  const chart=await d.chartSources(coin);assert.equal(chart.sources[0].url,'https://dexscreener.com/solana/AbC123');assert.equal(calls,callsAfterFirst);
  await assert.rejects(()=>d.chartSources({...coin,dex:{...dex,pair:'../evil'}}));
  const bad=new DataService({fetcher:async()=>response({pairs:[{chainId:'solana',pairAddress:'abc123',baseToken:{address:'Token123'}}]})});
  assert.equal((await bad.markets([coin])).data[coin.id].status,'unavailable');
});
