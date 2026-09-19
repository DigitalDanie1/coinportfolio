import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DataService} from './lib/data-service.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORTFOLIO_PORT||8787);
const service=new DataService({cacheDir:path.join(ROOT,'.data')});
await service.restore();
const publicFiles=new Map([['/','index.html'],['/index.html','index.html'],['/position-tools.js','position-tools.js'],['/auto-sync.js','auto-sync.js'],['/journal-view.js','journal-view.js'],['/dex-imports.js','dex-imports.js'],['/farming-pairs.js','farming-pairs.js'],['/refinement.css','refinement.css'],['/sector-chart.js','sector-chart.js'],['/compare-chart.js','compare-chart.js'],['/bubble-chart.js','bubble-chart.js']]);
const origins=new Set(['null',`http://127.0.0.1:${PORT}`,`http://localhost:${PORT}`]);
async function body(req) {let text='';for await(const part of req){text+=part;if(text.length>150000){const error=new Error('Request too large');error.status=413;throw error;}}return JSON.parse(text||'{}');}
function assets(list) {
  if(!Array.isArray(list)||list.length>150)throw new Error('Invalid asset list');
  return list.map(x=>({id:String(x.id||'').slice(0,150),name:String(x.name||'').slice(0,120),ticker:String(x.ticker||'').slice(0,50),gecko:typeof x.gecko==='string'?x.gecko.slice(0,150):null,providerId:typeof x.providerId==='string'?x.providerId.slice(0,150):null,dex:x.dex?{chain:String(x.dex.chain||'').slice(0,40),pair:String(x.dex.pair||'').slice(0,100),token:String(x.dex.token||'').slice(0,100)}:null,cat:String(x.cat||'')}));
}
const server=http.createServer(async(req,res)=>{
  const host=req.headers.host||'';
  if(![`127.0.0.1:${PORT}`,`localhost:${PORT}`].includes(host)){res.writeHead(403).end();return;}
  const origin=req.headers.origin;
  if(origin&&!origins.has(origin)){res.writeHead(403).end();return;}
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Portfolio-Client');res.setHeader('Access-Control-Allow-Private-Network','true');res.writeHead(204).end();return;}
  const url=new URL(req.url,`http://127.0.0.1:${PORT}`);
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  try{
    if(req.method==='GET'&&url.pathname==='/api/health'){json(200,{ok:true,service:'coin-portfolio',providers:['CoinGecko','CoinPaprika','Google News','Deribit public','Hyperliquid'],accountProviders:['Hyperliquid'],updatedAt:Date.now()});return;}
    if(req.method==='POST'&&url.pathname.startsWith('/api/')){
      if(req.headers['x-portfolio-client']!=='1'){json(403,{error:'Client header required'});return;}
      const input=await body(req);let result;
      if(url.pathname==='/api/markets')result=await service.markets(assets(input.coins));
      else if(url.pathname==='/api/chart'){const [asset]=assets([input.asset]);result=await service.chartSources(asset);}
      else if(url.pathname==='/api/news'){const [asset]=assets([input.asset]);result=await service.news(asset);}
      else if(url.pathname==='/api/options'){
        if(!Array.isArray(input.positions)||input.positions.length>100)throw new Error('Invalid positions');
        // Only contract identifiers are forwarded; balances, entry prices, thesis and conviction stay local.
        result=await service.optionQuotes(input.positions.map(p=>({id:String(p.id).slice(0,150),ticker:String(p.ticker).slice(0,30),venue:String(p.venue||'').slice(0,40),expiry:String(p.expiry||'').slice(0,10),strike:Number(p.strike),kind:p.kind==='put'?'put':'call',instrument:String(p.instrument||'').slice(0,100)})));
      }else if(url.pathname==='/api/perps')result=await service.perpMarkets();
      else if(url.pathname==='/api/account/hyperliquid')result=await service.hyperliquidAccount(String(input.address||''));
      else {json(404,{error:'Not found'});return;}
      json(200,result);return;
    }
    if(req.method==='GET'&&publicFiles.has(url.pathname)){
      const file=publicFiles.get(url.pathname),type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html';
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(await fs.readFile(path.join(ROOT,file)));return;
    }
    json(404,{error:'Not found'});
  }catch(e){json(e.status||502,{error:e.status===429?'데이터 소스 요청 제한':'자동 데이터 갱신 실패',detail:e.message?.startsWith('Invalid')?e.message:undefined});}
});
server.listen(PORT,'127.0.0.1',()=>console.log(`Coin portfolio data service: http://127.0.0.1:${PORT}`));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(()=>process.exit(0)));
