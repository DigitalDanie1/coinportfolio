const fs=require('fs'),vm=require('vm'),assert=require('assert');
const path=require('path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g)];
const nodes=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,innerHTML:'',textContent:'',children:[],handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},matches:()=>false});return nodes.get(id)};
let stored=null;
const ctx=vm.createContext({console,URL,Date,setTimeout,window:{addEventListener(){}},document:{activeElement:null,getElementById:node,querySelector:()=>({}),querySelectorAll:()=>[],addEventListener(){}},localStorage:{getItem:()=>stored,setItem:(k,v)=>{stored=v}}});
for(const [,src,code] of scripts){if(src==='auto-sync.js'||code.includes("startAutomatic();"))continue;const body=src?fs.readFileSync(path.join(root,src),'utf8'):code;new vm.Script(body);vm.runInContext(body,ctx);}
const run=s=>vm.runInContext(s,ctx);
run('load();renderAll()');const coinCount=run('coins.length');assert.equal(node('summary-all').textContent,coinCount);
assert.equal((node('tbody').innerHTML.match(/class="inline-thesis"/g)||[]).length,coinCount);
run("holdings.uni={qty:2,avgPrice:5,manualPrice:6,conviction:5,reason:'<script>bad</script>',newsNote:'A'};holdings.zec={conviction:1};sortBy('conviction')");
assert.equal(run('getFiltered()[0].coin.id'),'uni');
run("sortBy('conviction')");assert.equal(run('getFiltered().at(-1).coin.id'),'uni');
assert(node('tbody').innerHTML.includes('&lt;script&gt;bad&lt;/script&gt;'));
run("setHolding('uni',3,5,6,'new thesis')");assert.equal(run('holdings.uni.conviction'),5);assert.equal(run('holdings.uni.newsNote'),'A');
// Autosave event writes existing thesis storage immediately without rerender.
let hint={};
node('tbody').handlers.input({target:{dataset:{book:'spot',id:'uni',journal:'reason'},value:'edited inline',closest:()=>({querySelector:()=>hint})}});
assert.equal(JSON.parse(stored).holdings.uni.reason,'edited inline');assert.equal(hint.textContent,'저장됨');
run("options=[{id:'o1',ticker:'AAPL',kind:'call',side:'long',expiry:'2027-01-15',strike:200,contracts:2,multiplier:100,entry:5,mark:7,fees:2,conviction:4},{id:'o2',ticker:'BTC',kind:'put',side:'short',expiry:'2027-01-15',strike:50000,contracts:1,multiplier:1,entry:500,mark:400,fees:3,conviction:2}]");
assert.equal(run('optionPnL(options[0])'),398);assert.equal(run('optionPnL(options[1])'),97);
assert.equal(run('optionPnL({...options[0],mark:null})'),null);
assert.equal(run('optionPnL({...options[0],mark:0})'),-1002);
run("setTab('options');sortCol='conviction';sortAsc=false;renderAll()");assert(node('tbody').innerHTML.indexOf('AAPL')<node('tbody').innerHTML.indexOf('BTC'));
assert(node('book-summary').innerHTML.includes('495.00'));
run("farming=[{id:'f1',name:'DEX',ticker:'BTC-PERP',side:'neutral',collateral:1000,leverage:2,pnl:-20,funding:10,rewards:30,fees:5,points:'1000 points'}];setTab('farming');renderAll()");
assert.equal(run('farmingPnL(farming[0])'),15);assert(node('tbody').innerHTML.includes('1000 points'));assert(node('book-summary').innerHTML.includes('15.00'));
node('asset-search').value='none';run('renderTable()');assert(node('tbody').innerHTML.includes('아직 표시할 포지션이 없습니다'));
node('asset-search').value='';run('save()');const snapshot=stored;
run('coins=[];holdings={};options=[];farming=[];load()');assert.equal(run('options.length'),2);assert.equal(run('farming.length'),1);assert.equal(run('holdings.uni.reason'),'edited inline');
// User edits and deleted default symbols must survive reload.
run("removeCoin('zec');updateCoin(coins[0].id,{name:'Custom',edited:markEdited(coins[0].id,'name')});save();load()");assert.equal(run("coins.some(c=>c.id==='zec')"),false);assert.equal(run('coins[0].name'),'Custom');
assert.equal(run("safeNewsURL('javascript:alert(1)')"),null);assert.equal(run("safeNewsURL('https://example.com')"),'https://example.com/');assert(run("newsSearchURL('A&B','TEST')").includes('A%26B'));
assert.equal(JSON.parse(snapshot).options.length,2);
// Exercise position form submission through its registered handler, without a browser.
ctx.FormData=class {constructor(form){return Object.entries(form.values);}};
run("showModal=()=>{};closeModal=()=>{};");
run("openPosition('options')");
node('position-form').values={ticker:'ETH',venue:'Manual',kind:'put',side:'long',expiry:'2027-03-26',strike:'2000',contracts:'2',multiplier:'1',entry:'100',mark:'120',fees:'2',reason:'hedge',conviction:'3'};
node('position-form').reportValidity=()=>true;
node('position-form').handlers.submit({preventDefault(){},currentTarget:node('position-form')});
assert.equal(run('options.at(-1).ticker'),'ETH');assert.equal(run('optionPnL(options.at(-1))'),38);
run("openPosition('options',options.at(-1).id)");
node('position-form').values.mark='150';
node('position-form').handlers.submit({preventDefault(){},currentTarget:node('position-form')});
assert.equal(run('options.length'),3);assert.equal(run('optionPnL(options.at(-1))'),98);
run("openPosition('farming')");
node('position-form').values={name:'Farm',ticker:'ETH',venue:'L2',side:'neutral',collateral:'500',leverage:'1',pnl:'0',funding:'-5',rewards:'10',fees:'2',points:'20',reason:'farm thesis',conviction:'2'};
node('position-form').handlers.submit({preventDefault(){},currentTarget:node('position-form')});
assert.equal(run('farming.length'),2);assert.equal(run('farmingPnL(farming.at(-1))'),3);
assert.equal(JSON.parse(stored).farming.length,2);
console.log('PASS: syntax, inline thesis escaping/autosave, conviction both sort directions, metadata preservation, option long/short/multiplier/zero/missing mark, farming P&L, special tab search, saved data reload, edit/delete persistence, news URL validation, option add/edit and farming add form submission.');

// Market images/charts must survive journal rendering and failed refreshes.
run("mkt.uniswap={id:'uniswap',current_price:6,image:'https://coin-images.coingecko.com/coins/images/12504/large/uniswap.png',market_cap:1000000,price_change_percentage_24h:2,price_change_percentage_7d_in_currency:4,sparkline_in_7d:{price:[5,5.5,6]}};setTab('all');renderAll()");
assert(node('tbody').innerHTML.includes('<img src="https://coin-images.coingecko.com/'));
assert(node('tbody').innerHTML.includes('최근 7일 가격 추이'));
assert(node('tbody').innerHTML.includes('<polyline'));
assert(node('tbody').innerHTML.includes('차트 미수신'));
assert(node('table-head').innerHTML.includes('마켓캡'));
assert(!run("sparkSVG([5], 'single')").includes('NaN'));
assert.equal(run("sparkSVG([NaN, Infinity], 'bad')"),'');
assert(!run("marketLogo({ticker:'A',name:'A',cat:'main'},{image:'javascript:alert(1)'})").includes('<img'));
(async()=>{
  run("marketUpdatedAt=Date.now();fetchMarkets=async()=>{throw new Error('429')}");
  await run('loadData()');
  assert(run('mkt.uniswap.image'));
  assert(node('status').innerHTML.includes('저장 데이터 표시'));
  assert(node('tbody').innerHTML.includes('<polyline'));
  run("fetchMarkets=async()=>({uniswap:{id:'uniswap',current_price:7,image:'https://example.com/logo.png',sparkline_in_7d:{price:[6,7]}}})");
  await run('loadData()');
  assert.equal(run('mkt.uniswap.current_price'),7);
  run('mkt={};restoreMarketCache()');
  assert.equal(run('mkt.uniswap.current_price'),7);
  console.log('PASS: actual image/chart markup, missing data, invalid chart samples, API failure retention, successful refresh and cache reload.');
})().catch(e=>{console.error(e);process.exitCode=1});
