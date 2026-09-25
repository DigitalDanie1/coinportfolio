function initScenario(){
  document.getElementById('market-scenario').value=scenario.text;
  renderScenarioFramework();
  const legacy=document.getElementById('scenario-legacy');if(legacy)legacy.open=!!scenario.text;
  updateScenarioStatus(false);
}
function updateScenarioStatus(saved){
  document.getElementById('scenario-count').textContent=Array.from([scenario.text,...Object.values(scenario.fields||{})].join('')).length.toLocaleString()+'자';
  document.getElementById('scenario-status').textContent=scenario.updatedAt?`${saved?'저장됨 · ':''}${new Date(scenario.updatedAt).toLocaleString()}`:'직접 작성 · 자동 저장';
}
function saveScenario(text){
  scenario={...scenario,text,updatedAt:new Date().toISOString()};
  const ok=save();
  updateScenarioStatus(true);
  if(!ok)document.getElementById('scenario-status').textContent='저장 실패 · 작성 내용을 복사해 보관하세요';
}
let chartRequest=0,chartChoices=[];
function tvChartSource(symbol){
  const s=String(symbol||'').trim().toUpperCase().replace(/\s+/g,'');
  if(!/^[A-Z0-9_]+:[A-Z0-9_.!-]+$/.test(s))return null;
  return {type:'tradingview',symbol:s,label:s,url:'https://www.tradingview.com/chart/?symbol='+encodeURIComponent(s)};
}
// Accepts a TradingView symbol (BINANCE:BTCUSDT), a TradingView link, or a DEX Screener pair link.
function parseChartInput(value){
  const raw=String(value||'').trim();
  if(!raw)return null;
  if(/^[a-z]+:\/\//i.test(raw)||/^(www\.)?(dexscreener\.com|tradingview\.com)/i.test(raw)){
    let url;try{url=new URL(/^[a-z]+:\/\//i.test(raw)?raw:'https://'+raw);}catch{return null;}
    if(url.protocol!=='https:'&&url.protocol!=='http:')return null;
    const host=url.hostname.replace(/^www\./,'').toLowerCase();
    if(host==='dexscreener.com'){
      const seg=url.pathname.split('/').filter(Boolean);
      if(seg.length<2||!/^[a-z0-9-]{1,40}$/.test(seg[0])||!/^[a-zA-Z0-9]{1,100}$/.test(seg[1]))return null;
      return {type:'dex',chain:seg[0],pair:seg[1],label:`${seg[0]} · ${seg[1].slice(0,8)}…`,url:`https://dexscreener.com/${seg[0]}/${seg[1]}`};
    }
    if(host==='tradingview.com'){
      const query=url.searchParams.get('symbol');
      if(query)return tvChartSource(query);
      // TradingView symbol pages spell the pair as EXCHANGE-TICKER rather than EXCHANGE:TICKER.
      const slug=url.pathname.match(/\/symbols\/([^/]+)/)?.[1];
      return slug?tvChartSource(decodeURIComponent(slug).replace('-',':')):null;
    }
    return null;
  }
  return tvChartSource(raw);
}
function manualChartSource(coin){
  const src=parseChartInput(coin?.chartSrc);
  if(src)src.label='직접 입력 · '+src.label;
  return src;
}
function applyManualChart(id){
  const coin=coins.find(x=>x.id===id);if(!coin)return;
  const raw=(document.getElementById('chart-manual-input')?.value||'').trim();
  const msg=document.getElementById('chart-manual-msg');
  if(!raw){updateCoin(id,{chartSrc:''});openMarketChart(id);return;}
  if(!parseChartInput(raw)){
    if(msg){msg.textContent='인식할 수 없는 형식이다. 예: BINANCE:BTCUSDT · https://dexscreener.com/solana/<페어주소>';msg.classList.add('chart-manual-err');}
    return;
  }
  updateCoin(id,{chartSrc:raw});
  openMarketChart(id);
}
function clearManualChart(id){updateCoin(id,{chartSrc:''});openMarketChart(id);}
function chartFrameURL(source){
  if(source.type==='tradingview'&&/^[A-Z0-9_]+:[A-Z0-9_.!-]+$/i.test(source.symbol)){
    // Same iframe URL/settings format emitted by TradingView's official embed script.
    const url=new URL('https://www.tradingview-widget.com/embed-widget/advanced-chart/');
    url.searchParams.set('locale','kr');url.searchParams.set('symbol',source.symbol);
    url.hash=encodeURIComponent(JSON.stringify({symbol:source.symbol,interval:'60',timezone:'Asia/Singapore',theme:'dark',style:'1',locale:'kr',allow_symbol_change:true,hide_side_toolbar:false,withdateranges:true,save_image:false,autosize:true}));
    return url.href;
  }
  if(source.type==='dex'){
    const url=new URL(source.url);if(url.protocol!=='https:'||url.hostname!=='dexscreener.com')return null;
    url.searchParams.set('embed','1');url.searchParams.set('theme','dark');url.searchParams.set('trades','0');url.searchParams.set('info','0');return url.href;
  }
  return null;
}
function selectChart(index){
  const source=chartChoices[Number(index)];if(!source)return;
  const target=document.getElementById('chart-viewer');if(!target)return;
  let url;try{url=chartFrameURL(source);}catch{return;}if(!url)return;
  const iframe=document.createElement('iframe');iframe.src=url;iframe.title=source.label+' 차트';iframe.setAttribute('allowfullscreen','');iframe.referrerPolicy='no-referrer';
  target.replaceChildren(iframe);
  const link=document.getElementById('chart-external');link.href=source.url;link.textContent=`${source.type==='dex'?'DEX Screener':'TradingView'}에서 열기 ↗`;link.hidden=false;
  document.getElementById('chart-caption').textContent=source.type==='dex'?`컨트랙트 주소를 확인한 DEX 페어 · ${source.chain} · ${source.token}`:`확인된 거래소 페어 · ${source.symbol} · TradingView 제공`;
}
async function openMarketChart(id){
  const coin=coins.find(x=>x.id===id);if(!coin)return;
  const request=++chartRequest;chartChoices=[];
  const manual=manualChartSource(coin);
  document.getElementById('modal-body').innerHTML=`<div class="chart-dialog"><div class="modal-head"><div class="minfo"><div class="ticker">${escapeHTML(coin.ticker)} · 차트</div><div class="name">${escapeHTML(coin.name)}</div></div><button class="modal-close" aria-label="닫기" onclick="closeModal()">×</button></div><div class="chart-controls"><label for="chart-source-select">차트 소스</label><select id="chart-source-select" onchange="selectChart(this.value)" disabled><option>거래소·DEX 페어 확인 중…</option></select><a id="chart-external" class="btn" target="_blank" rel="noopener noreferrer" hidden>외부에서 열기 ↗</a></div><div class="chart-manual"><label for="chart-manual-input">직접 입력</label><input type="text" id="chart-manual-input" value="${escapeHTML(coin.chartSrc||'')}" placeholder="BINANCE:BTCUSDT 또는 dexscreener.com 링크" onkeydown="if(event.key==='Enter')applyManualChart('${id}')"><button class="btn" onclick="applyManualChart('${id}')">적용</button>${coin.chartSrc?`<button class="btn" onclick="clearManualChart('${id}')">지우기</button>`:''}</div><p id="chart-manual-msg" class="form-help">TradingView 심볼(거래소:페어) 또는 DEX Screener 페어 링크를 넣으면 이 종목의 기본 차트가 된다.</p><div id="chart-viewer" class="chart-viewer"><p>정확한 종목과 거래 페어를 연결하고 있습니다…</p></div><p id="chart-caption" class="form-help">차트가 표시되지 않으면 외부에서 열기 버튼을 이용하세요.</p></div>`;
  showModal();
  const fill=(list,message)=>{
    chartChoices=list;
    const selector=document.getElementById('chart-source-select');
    if(!chartChoices.length){selector.innerHTML='<option>연결된 차트 없음</option>';document.getElementById('chart-viewer').textContent=message||'정확한 종목 연결이 필요합니다.';return;}
    selector.innerHTML=chartChoices.map((s,i)=>`<option value="${i}">${escapeHTML(s.type==='dex'&&!s.label.startsWith('직접 입력')?'DEX · '+s.label:s.label)}</option>`).join('');selector.disabled=false;
    const preferred=manual?0:(coin.cat==='fomo'?chartChoices.findIndex(x=>x.type==='dex'):0);
    selector.value=String(preferred>=0?preferred:0);selectChart(selector.value);
  };
  if(manual)fill([manual]);
  try{
    const result=await dataAPI('/api/chart',{asset:{id:coin.id,name:coin.name,ticker:coin.ticker,cat:coin.cat,gecko:coin.gecko,providerId:coin.providerId,dex:coin.dex,equity:coin.equity}});
    if(request!==chartRequest||!document.getElementById('chart-viewer'))return;
    const merged=[...(manual?[manual]:[]),...(result.sources||[])];
    if(manual&&merged.length===1)return;
    fill(merged,result.message);
  }catch{
    if(request!==chartRequest||!document.getElementById('chart-viewer'))return;
    if(manual)return;
    document.getElementById('chart-viewer').textContent='차트 연결을 가져오지 못했습니다. 직접 입력란에 TradingView 심볼이나 DEX Screener 링크를 넣어도 된다.';
    document.getElementById('chart-source-select').innerHTML='<option>연결 실패</option>';
  }
}
const closeJournalModal=closeModal;
closeModal=function(){chartRequest++;chartChoices=[];closeJournalModal();};

// User-authored reflection, inserted once into a previously empty journal.
const INITIAL_REFLECTION = `## 1️⃣ 메타를 빠르게 읽고 편승해야함
- 새 체인엔 늘 기회가 있다 : 로빈후드 체인발 온체인 불장(PONS, CASHCAT 등), Arc 체인 얼리 진입처럼 새로운 체인이 뜰 때마다 기회가 생깁니다. 물론 기회가 없을수도 있지만, 안 하는 것보다 하는 게 무조건 낫다
- 낙수 효과도 챙겼어야 했다 : 로빈후드 체인 수혜를 직접 받고 차트상 손익비도 좋았던 UNI, ARB는 충분히 베팅할 만했음
- 해외 주류 메타도 시간은 충분했다 : 해외에서 강하게 밀던 프라이버시 메타 ZEC, NEAR + 베타 플레이도 탑승할 시간을 꽤 넉넉히 줬음

## 2️⃣ 상승장에선 진득하게 버티는 놈이 먹는다
- 최근 UNI, ARB, ZEC의 흐름을 보면, 큰 수익은 결국 몇 번 안 나오는 말도 안 되는 갓캔들에서 나옴
- 저점에서 평단을 잘 잡았고 지표도 괜찮다면, 사팔사팔보다 포지션을 묵직하게 들고 가는 게 훨씬 크게 먹는다
- 크게 먹으려면 그 몇 번의 갓캐들이 나올때까지 진득히 기다릴줄 알아야함

## 3️⃣ 가는놈이 더간다
- 예전엔 NEW COIN is GOOD COIN이었지만 지금은 단순히 그런 논리가 적용되지 않음
- 대표적으로 이번 시즌 철저히 외면받고 있는 MONAD, MEGAETH
- 알트도 단순히 가격이 낮아서 + 신생이니까 뭐라도 하겠지 논리가 아닌 실제 숫자로 평가받는 장임
- 최근 폼이 좋은 퍼프덱스 HYPE, LIT 그리고 온체인 UNI, ARB 모두 실수익 + 바이백 모델이라는 것
- 결국 단순히 가격이 높냐 낮냐가 아니라 지금 시장이 인정하는 주류 메타에 올라타야 돈을 벌 수 있음`;
function reflectionMarkup(text){
  const inline=s=>escapeHTML(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  const result=[];let list=false;
  for(const line of String(text).split('\n')){
    const heading=line.match(/^#{1,3}\s+(.+)$/),bullet=line.match(/^\s*[-*]\s+(.+)$/);
    if(bullet){if(!list){result.push('<ul>');list=true;}result.push('<li>'+inline(bullet[1])+'</li>');continue;}
    if(list){result.push('</ul>');list=false;}
    if(heading)result.push('<h3>'+inline(heading[1])+'</h3>');
    else if(line.trim())result.push('<p>'+inline(line)+'</p>');
  }
  if(list)result.push('</ul>');
  return result.join('')||'<p class="reflection-empty">배운 점과 다음 매매에 지킬 원칙을 작성해 보세요.</p>';
}
function initReflections(){
  let ok=true;
  if(reflections===null){reflections={text:INITIAL_REFLECTION,updatedAt:new Date().toISOString()};ok=save();}
  document.getElementById('reflection-text').value=reflections.text;
  updateReflectionView(ok);
}
function updateReflectionView(ok=true){
  document.getElementById('reflection-preview').innerHTML=reflectionMarkup(reflections?.text||'');
  document.getElementById('reflection-count').textContent=Array.from(reflections?.text||'').length.toLocaleString()+'자';
  document.getElementById('reflection-status').textContent=!ok?'저장 실패 · 내용을 복사해 보관하세요':reflections?.updatedAt?'저장됨 · '+new Date(reflections.updatedAt).toLocaleString():'직접 작성 · 자동 저장';
}
function saveReflections(text){
  reflections={text,updatedAt:new Date().toISOString()};updateReflectionView(save());
}
function setReflectionMode(mode){
  const edit=mode==='edit';
  document.getElementById('reflection-preview').hidden=edit;
  document.getElementById('reflection-editor').hidden=!edit;
  document.getElementById('reflection-read').setAttribute('aria-pressed',String(!edit));
  document.getElementById('reflection-edit').setAttribute('aria-pressed',String(edit));
  if(edit)document.getElementById('reflection-text').focus();
}

// Resolve before the click so a normal accessible link opens without popup blockers.
async function connectDetailChart(coin){
  const link=document.getElementById('detail-chart-link');
  const status=document.getElementById('detail-chart-status');
  if(!link||!status)return;
  let pending=false;
  const resolve=async()=>{
    if(pending)return;pending=true;
    status.textContent='차트 연결 확인 중…';
    try{
      const sources=coin.dex
        ?[{type:'dex',url:`https://dexscreener.com/${coin.dex.chain}/${coin.dex.pair}`}]
        :(await dataAPI('/api/chart',{asset:{id:coin.id,name:coin.name,ticker:coin.ticker,cat:coin.cat,gecko:coin.gecko,providerId:coin.providerId,equity:coin.equity}})).sources||[];
      if(document.getElementById('detail-chart-link')!==link)return;
      const hosts={dex:'dexscreener.com',tradingview:'www.tradingview.com'};
      const source=sources.find(s=>{
        try{const u=new URL(s.url);return u.protocol==='https:'&&u.hostname===hosts[s.type];}catch{return false;}
      });
      if(!source)throw new Error('No verified chart');
      link.href=new URL(source.url).href;link.setAttribute('aria-disabled','false');
      status.textContent=(source.type==='dex'?'DEX Screener':'TradingView')+'에서 보기 ↗';
    }catch{
      if(document.getElementById('detail-chart-link')===link)status.textContent='차트 연결을 확인하지 못했습니다 · 눌러서 재시도';
    }finally{pending=false;}
  };
  link.addEventListener('click',event=>{if(!link.href){event.preventDefault();resolve();}});
  await resolve();
}

// Views that live inside the positions surface; the rest replace it entirely.
const POSITION_VIEWS=['portfolio','farming','options','sector','compare','bubble'];
const WORKSPACE_VIEWS=[...POSITION_VIEWS,'scenario','principles'];
function updateWorkspaceNavigation(view){
  if(!WORKSPACE_VIEWS.includes(view))return;
  const positions=POSITION_VIEWS.includes(view);
  document.getElementById('workspace-positions').hidden=!positions;
  document.getElementById('workspace-scenario').hidden=view!=='scenario';
  const principles=document.getElementById('workspace-principles');
  principles.hidden=view!=='principles';
  if(view==='principles')principles.open=true;
  document.getElementById('hero').hidden=view!=='portfolio';
  document.querySelectorAll('[data-workspace]').forEach(button=>{
    if(button.dataset.workspace===view)button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
}
function setWorkspaceView(view){
  if(!WORKSPACE_VIEWS.includes(view))return;
  if(POSITION_VIEWS.includes(view)){
    setTab(view==='portfolio'?(POSITION_VIEWS.includes(currentTab)?'all':currentTab):view);
  }else updateWorkspaceNavigation(view);
  // Switch the visible surface without replacing inputs or disturbing saved drafts.
  window.scrollTo({top:0,behavior:'instant'});
}

// Structured scenario fields coexist with the original text and are never sent to quote APIs.
const SCENARIO_SECTIONS=[
  {title:'① 지금의 판단',help:'무엇을, 언제까지, 어떤 방향으로 보는지 한 문장으로 정하세요.',fields:[
    ['scope','대상 · 관찰 기간','예: BTC와 프라이버시 섹터 / 다음 주 점검까지'],
    ['view','내 핵심 판단','[자산·섹터]는 [이유] 때문에 [예상 방향]으로 움직일 것으로 본다.']]},
  {title:'② 판단의 근거',help:'관찰한 사실과 나의 해석을 분리하세요. 근거 옆에 날짜나 출처를 붙이면 복기가 쉬워집니다.',fields:[
    ['evidence','확인한 사실 → 내 해석','사실: [지표·가격·뉴스 / 확인 날짜·출처]\n해석: [이 사실이 내 판단을 지지하는 이유]\n반대 근거: [내 생각과 맞지 않는 관찰]']]},
  {title:'③ 세 가지 예상 경로',help:'목표 가격만 적기보다, 어떤 조건이 먼저 발생하고 다음에 무엇이 이어질지 적으세요.',fields:[
    ['base','기본 시나리오 · 가장 가능성이 높다고 보는 경로','[조건 A] 유지 → [첫 움직임] → [후속 움직임 / 목표 구간]'],
    ['bull','강세 시나리오 · 예상보다 강해질 조건','[어떤 변화]가 확인되면 → [예상 경로]로 수정'],
    ['bear','약세 시나리오 · 예상보다 약해질 조건','[어떤 변화]가 확인되면 → [예상 경로]로 수정']]},
  {title:'④ 내가 할 행동',help:'자산마다 한 줄씩 쓰세요. 조건이 충족되지 않을 때의 행동도 적습니다.',fields:[
    ['execution','자산별 조건부 실행 계획','[자산] | [확인할 조건] | [진입·유지·축소·대기] | [수량 또는 비중 한도] | [목표·정리 조건]\n조건 미충족 시: [대기 / 재점검]']]},
  {title:'⑤ 틀렸다고 인정할 기준',help:'사전에 정한 무효화 조건과 대응을 함께 적으세요. 매매 후 이유를 바꾸지 않도록 남기는 항목입니다.',fields:[
    ['invalidation','무효화 조건 → 대응','[가격·지표·이벤트]가 [구체적 기준]을 충족하면 내 판단을 재검토한다.\n확인 방식: [종가 / 공시 / 특정 시각의 데이터 등]\n대응: [축소·종료·대기] / 감수할 손실 한도: [직접 정할 값]']]},
  {title:'⑥ 점검과 복기',help:'작성할 때 점검일을 정하고, 그날 실제 결과를 채우세요. 수익 여부와 판단의 질을 따로 돌아봅니다.',fields:[
    ['reviewDate','다음 점검일','','date'],
    ['review','점검 후 작성 · 예상과 실제','실제 일어난 일: [관찰]\n맞거나 틀린 가정: [이유]\n실행 계획을 지켰는가: [행동]\n다음에 유지·수정할 원칙: [한 가지]']]}
];
function renderScenarioFramework(){
  const host=document.getElementById('scenario-framework');if(!host)return;
  host.innerHTML=SCENARIO_SECTIONS.map(section=>`<section class="scenario-step"><h3>${section.title}</h3><p>${section.help}</p>${section.fields.map(([key,label,placeholder,type])=>`<div class="scenario-prompt"><label for="scenario-field-${key}">${label}</label>${type==='date'?`<input type="date" id="scenario-field-${key}" value="${escapeHTML(scenario.fields?.[key]||'')}" onchange="saveScenarioField('${key}',this.value)">`:`<textarea id="scenario-field-${key}" rows="${['scope','view'].includes(key)?2:4}" placeholder="${escapeHTML(placeholder)}" oninput="saveScenarioField('${key}',this.value)">${escapeHTML(scenario.fields?.[key]||'')}</textarea>`}</div>`).join('')}</section>`).join('');
}
function saveScenarioField(key,value){
  if(!SCENARIO_SECTIONS.some(section=>section.fields.some(field=>field[0]===key)))return;
  scenario={...scenario,fields:{...scenario.fields,[key]:value},updatedAt:new Date().toISOString()};
  const ok=save();updateScenarioStatus(true);
  if(!ok)document.getElementById('scenario-status').textContent='저장 실패 · 작성 내용을 복사해 보관하세요';
}
