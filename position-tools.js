function marketLogo(coin,data) {
  let src = '';
  try { const url = new URL(data?.image); if (url.protocol === 'https:') src = url.href; } catch {}
  return `<span class="asset-symbol" style="border-color:${catColor(coin.cat)}"><span>${escapeHTML(coin.ticker.slice(0,3))}</span>${src ? `<img src="${escapeHTML(src)}" alt="${escapeHTML(coin.name)} 로고" width="32" height="32" loading="lazy" decoding="async" onerror="this.remove()">` : ''}</span>`;
}
function marketChart(coin,data) {
  const prices = priceSeries(data);
  const period=data?.collectedHistory?"수집 기록":"7일";
  const chart = sparkSVG(prices, 'row-'+coin.id, 44, 128);
  const change=data?.price_change_percentage_7d_in_currency;
  const content=chart?`<span class="market-chart" role="img" aria-label="${escapeHTML(coin.ticker)} ${period==='7일'?'최근 7일':period} 가격 추이">${chart}</span><span class="chart-change ${pCls(change)}">${period==='7일'?fPct(change)+' · ':''}${period}</span>`:`<span class="chart-unavailable">${escapeHTML(data?.message||(coin.dex?'DEX 차트 연결됨':coin.gecko?'차트 미수신':'시세 ID 미연결'))}</span>`;
  return `<button class="chart-trigger" data-action="chart" data-id="${escapeHTML(coin.id)}" aria-label="${escapeHTML(coin.ticker)} TradingView 또는 DEX 차트 열기">${content}<span class="chart-open-label">차트 열기 ↗</span></button>${data?.chartSource?`<small>${escapeHTML(data.chartSource)}</small>`:''}`;
}
/* Local position journal. Premiums and farming amounts are recorded in USD. */
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function bookItems(book = currentTab) { return book === 'farming' ? farming : book === 'options' ? options : coins; }
function journal(book, id) {
  if (book === 'farming' || book === 'options') return bookItems(book).find(p => p.id === id);
  return holdings[id] ||= {};
}
function money(value) { return value == null ? '미입력' : '$' + Number(value).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2}); }
function signedMoney(value) { return value == null ? '미입력' : (value >= 0 ? '+' : '−') + money(Math.abs(value)); }
function convictionOptions(value) {
  return [[0,'미지정'],[1,'1 · 매우 낮음'],[2,'2 · 낮음'],[3,'3 · 보통'],[4,'4 · 높음'],[5,'5 · 매우 높음']].map(([v,label]) => `<option value="${v}" ${Number(value||0)===v?'selected':''}>${label}</option>`).join('');
}
/* Signals read off the data already on hand; anything not measurable is simply not shown. */
function marketSignals(coin) {
  const d = coin && (coin.gecko ? mkt[coin.gecko] : null);
  if (!d) return [];
  const out = [];
  const prices = priceSeries(d);
  if (prices.length >= 10) {
    const high = Math.max(...prices), low = Math.min(...prices), last = prices[prices.length - 1];
    const span = high - low;
    if (span > 0) {
      const pos = (last - low) / span;
      if (last >= high) out.push({ key: 'high', label: '7일 신고가', tone: 'up' });
      else if (pos >= 0.97) out.push({ key: 'high', label: '신고가 부근', tone: 'up' });
      else if (last <= low) out.push({ key: 'low', label: '7일 신저가', tone: 'down' });
      else if (pos <= 0.03) out.push({ key: 'low', label: '신저가 부근', tone: 'down' });
    }
    // A run only counts once it is long enough to be more than noise.
    let run = 0;
    for (let i = prices.length - 1; i > 0; i--) {
      const rising = prices[i] > prices[i - 1];
      if (run === 0) run = rising ? 1 : -1;
      else if ((run > 0) === rising) run += rising ? 1 : -1;
      else break;
    }
    if (run >= 12) out.push({ key: 'run', label: `${run}시간 연속 상승`, tone: 'up' });
    else if (run <= -12) out.push({ key: 'run', label: `${-run}시간 연속 하락`, tone: 'down' });
  }
  const vol = d.total_volume, mc = d.market_cap;
  if (vol > 0 && mc > 0) {
    const turnover = vol / mc;
    if (turnover >= 1) out.push({ key: 'vol', label: `거래량 시총 ${turnover.toFixed(1)}배`, tone: 'hot' });
    else if (turnover >= 0.3) out.push({ key: 'vol', label: `거래 회전 ${(turnover * 100).toFixed(0)}%`, tone: 'hot' });
  }
  const t = d.txns24h;
  if (t && t.buys > 0 && t.sells > 0) {
    const total = t.buys + t.sells, buyShare = t.buys / total;
    if (total >= 50 && buyShare >= 0.6) out.push({ key: 'flow', label: `매수 ${Math.round(buyShare * 100)}%`, tone: 'up' });
    else if (total >= 50 && buyShare <= 0.4) out.push({ key: 'flow', label: `매도 ${Math.round((1 - buyShare) * 100)}%`, tone: 'down' });
  }
  if (d.liquidity > 0 && vol > 0 && vol / d.liquidity >= 3)
    out.push({ key: 'churn', label: '유동성 대비 과열', tone: 'hot' });
  return out.slice(0, 3);
}
function signalStrip(book, id) {
  if (book !== 'spot') return '';
  const signals = marketSignals(coins.find(c => c.id === id));
  if (!signals.length) return '';
  return `<span class="signal-strip">${signals.map(s =>
    `<span class="signal ${s.tone}">${escapeHTML(s.label)}</span>`).join('')}</span>`;
}
function journalCells(book,id,item) {
  const attrs = `data-book="${book}" data-id="${escapeHTML(id)}"`;
  return `<td class="thesis-cell"><div class="thesis-stack">${signalStrip(book,id)}<textarea class="inline-thesis" aria-label="Thesis" placeholder="투자 논리, 촉매, 무효화 조건…" ${attrs} data-journal="reason">${escapeHTML(item?.reason||'')}</textarea><span class="save-hint" aria-live="polite">입력 시 자동 저장</span></div></td>
    <td><select class="inline-conviction" aria-label="Conviction level" ${attrs} data-journal="conviction">${convictionOptions(item?.conviction)}</select></td>
    <td><button class="btn news-button" ${attrs} data-action="news">뉴스${typeof newsBadge==='function'?' · '+newsBadge(book,id).replace(/^뉴스 ?/,''):item?.newsNote?' · 메모':''}</button></td>`;
}
function localDate() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function optionPnL(p) { return p.mark == null ? null : (p.mark-p.entry)*p.contracts*p.multiplier*(p.side==='long'?1:-1)-p.fees; }
function farmingPnL(p) { return p.pnl == null ? null : p.pnl + p.funding + p.rewards - p.fees; }
function sortHeader(label,key) {
  const active = key === sortCol;
  return `<th scope="col" aria-sort="${active ? (sortAsc?'ascending':'descending') : 'none'}"><button class="sort-button ${active?'sorted':''}" onclick="sortBy('${key}')">${label} <span aria-hidden="true">${active?(sortAsc?'↑':'↓'):'↕'}</span></button></th>`;
}
function renderTable() {
  // Price refreshes must not replace a thesis that is currently being edited.
  if (document.activeElement?.matches?.('[data-journal]')) { tableRenderPending = true; return; }
  tableRenderPending = false;
  const special = currentTab === 'farming' || currentTab === 'options';
  const book = special ? currentTab : 'spot';
  const query = document.getElementById('asset-search').value.trim().toLocaleLowerCase();
  const heldOnly = document.getElementById('held-only').checked;
  let rows;
  if (special) {
    rows = bookItems().filter(p => !p.closed && (!query || [p.name,p.ticker,p.venue,p.reason].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)) && (!heldOnly || (book==='options'?p.contracts>0:p.collateral>0)));
    rows = [...rows].sort((a,b) => {
      let n = sortCol==='name' ? (a.ticker||a.name).localeCompare(b.ticker||b.name) : sortCol==='conviction' ? (a.conviction||0)-(b.conviction||0) : sortCol==='pnl' ? ((book==='options'?optionPnL(a):farmingPnL(a))??-Infinity)-((book==='options'?optionPnL(b):farmingPnL(b))??-Infinity) : 0;
      return sortAsc ? n : -n;
    });
  } else rows = getFiltered();
  document.getElementById('book-title').textContent = book==='farming'?'DEX PERP Farming':book==='options'?'Option 포지션':'관심 종목';
  document.getElementById('book-description').textContent = book==='farming'?'시장 가격·펀딩 자동 갱신 · 계좌 연결 시 포지션과 손익 동기화':book==='options'?'Deribit 계약 현재가 자동 갱신 · 진입 정보는 계좌 연결 필요':'Thesis와 확신 수준을 기록하고 변화를 확인하세요.';
  document.getElementById('add-position').textContent = special ? '+ 포지션 추가' : '+ 종목 추가';
  document.getElementById('result-count').textContent = `${rows.length}개 ${special?'포지션':'종목'} · ${special?'자동 시세 · 현물 합계에서 제외':'자동 시세 · USD 기준'} · 표 가로 스크롤 가능`;
  const head = document.getElementById('table-head');
  head.parentElement?.setAttribute('data-book',book);
  head.innerHTML = `<tr>${sortHeader(special?'포지션':'종목','name')}${book==='spot'?'<th scope="col">가격 차트</th>'+sortHeader('가격','price')+sortHeader('24H','chg')+sortHeader('마켓캡','mcap')+sortHeader('보유 가치','hold'):book==='options'?'<th scope="col">만기 / 행사가</th><th scope="col">계약 / 프리미엄</th>'+sortHeader('미실현 손익','pnl'):'<th scope="col">예치금 / 레버리지</th><th scope="col">보상 / 포인트</th>'+sortHeader('누적 순손익','pnl')}<th scope="col">Thesis</th>${sortHeader('Conviction','conviction')}<th scope="col">News</th></tr>`;
  const body = document.getElementById('tbody');
  body.innerHTML = rows.map(p => {
    if (book === 'spot') {
      const {coin:c, d, price, chg,mc,holdVal,h} = p;
      // Two lines per row: ticker+name, then a single muted line of category/source so more rows fit on screen.
      const subline = [c.note, typeof marketStatus === 'function' ? marketStatus(c) : ''].filter(Boolean).join(' · ');
      // Price, 24H and holding value are the numbers a decision gets made on, so they must never
      // truncate: the no-price case gets a short badge (full reason stays one hover away in title=)
      // instead of the long provider message, and "no holdings" collapses to a plain dash rather
      // than a sentence competing for the same column width.
      const noPriceBadge = m => !m ? '미연결' : /상장 전/.test(m) ? '상장 전' : /유동성/.test(m) ? '유동성 부족' : '미제공';
      const priceText = price==null ? noPriceBadge(d?.message) : fP(price);
      const priceTitle = price==null ? (d?.message||'미연결') : priceText;
      const holdText = h?.qty ? money(holdVal) : '—';
      const holdTitle = h?.qty ? holdText : '계좌 연결 필요';
      return `<tr><td><button class="asset-button" data-action="detail" data-book="spot" data-id="${escapeHTML(c.id)}">${marketLogo(c,d)}<span><span class="td-title"><strong>${escapeHTML(c.ticker)}</strong><span class="td-subname">${escapeHTML(c.name)}</span></span><small class="source-status" title="${escapeHTML(subline)}">${escapeHTML(subline)}</small><span class="open-label">보유 · 메모 열기 ↗</span></span></button></td><td class="market-chart-cell">${marketChart(c,d)}</td><td class="number" title="${escapeHTML(priceTitle)}">${escapeHTML(priceText)}</td><td class="number ${pCls(chg)}">${fPct(chg)}</td><td class="number">${mc==null?'—':fM(mc)}</td><td class="number" title="${escapeHTML(holdTitle)}">${escapeHTML(holdText)}</td>${journalCells(book,c.id,h)}</tr>`;
    }
    const pnl = book==='options'?optionPnL(p):farmingPnL(p);
    const title = book==='options'?p.ticker:p.name;
    const sub = book==='options'?`${p.side==='long'?'Long':'Short'} ${p.kind==='call'?'Call':'Put'} · ${p.venue||'거래소 미입력'}`:`${p.ticker||'마켓 미입력'} · ${p.side==='neutral'?'Neutral':p.side==='long'?'Long':'Short'}`;
    const expired = book==='options' && p.expiry < localDate();
    return `<tr><td><button class="asset-button" data-action="position" data-book="${book}" data-id="${escapeHTML(p.id)}"><span><strong>${escapeHTML(title)}</strong><small>${escapeHTML(sub)}</small><small>${expired?'만기 경과 · 정산 연결 필요':typeof positionAutoInfo==='function'?escapeHTML(positionAutoInfo(book,p)):'계좌 연결 필요'}</small><span class="open-label">기록 열기 ↗</span></span></button></td>${book==='options'?`<td><span class="number">${escapeHTML(p.expiry)}</span><small>${money(p.strike)}</small></td><td><span class="number">${p.contracts} × ${p.multiplier}</span><small>진입 ${money(p.entry)} → 현재 ${money(typeof autoOptionMark==='function'?autoOptionMark(p):p.mark)}</small></td>`:`<td><span class="number">${money(p.collateral)}</span><small>${p.leverage??'미연결'}× · ${escapeHTML(p.venue||'체인 미입력')}</small></td><td><span class="number">${money(p.rewards)}</span><small>${escapeHTML(p.points||'포인트 소스 미연결')}</small></td>`}<td class="number ${pnl==null?'flat':pnl>=0?'up':'down'}">${signedMoney(pnl)}</td>${journalCells(book,p.id,p)}</tr>`;
  }).join('') || `<tr><td colspan="${special?7:9}" class="empty-state"><strong>${special?'아직 표시할 포지션이 없습니다':'표시할 종목이 없습니다'}</strong><p>검색·보유 필터를 확인하거나 새 ${special?'포지션':'종목'}을 추가하세요.</p><button class="btn" onclick="addCurrentPosition()">+ ${special?'포지션':'종목'} 추가</button></td></tr>`;
  const summary = document.getElementById('book-summary');
  if (!special) { summary.innerHTML = ''; return; }
  const valued = rows.filter(p => (book==='options'?optionPnL(p):farmingPnL(p))!=null);
  const total = valued.reduce((sum,p)=>sum+(book==='options'?optionPnL(p):farmingPnL(p)),0);
  summary.innerHTML = `<span>표시된 포지션 ${valued.length}/${rows.length}개 손익 계산</span><strong class="${total>=0?'up':'down'}">${valued.length?signedMoney(total):'현재 값 미입력'}</strong><span>${book==='options'?'자동 현재가 기준 평가손익 · 만기 정산은 계좌 연결 필요':'연결 계좌는 거래소 미실현 손익 · 기존 수동 기록은 누적 순손익'}</span>`;
}
let tableRenderPending = false;
document.getElementById('tbody').addEventListener('input', e => {
  const input = e.target;
  if (!input.dataset.journal) return;
  const item = journal(input.dataset.book,input.dataset.id);
  item[input.dataset.journal] = input.dataset.journal==='conviction' ? Number(input.value) : input.value;
  const ok = save();
  const hint = input.closest('tr').querySelector('.save-hint');
  if(hint) hint.textContent = ok ? '저장됨' : '저장 실패 · 입력 내용을 복사하세요';
  if (input.dataset.journal==='conviction') tableRenderPending=true;
});
document.getElementById('tbody').addEventListener('focusout', () => {
  setTimeout(() => {if(tableRenderPending) renderTable();},0);
});
document.getElementById('tbody').addEventListener('click', e => {
  const button=e.target.closest('[data-action]'); if(!button) return;
  const {action,book,id}=button.dataset;
  if(action==='chart') openMarketChart(id);
  if(action==='detail') openDetail(id);
  if(action==='position') openPosition(book,id);
  if(action==='news') openNews(book,id);
});
function addCurrentPosition() {
  if(currentTab==='farming'||currentTab==='options') openPosition(currentTab);
  else openAdd(currentTab==='all'?'main':currentTab);
}
function field(name,label,value='',type='text',extra='') {
  return `<div class="field"><label for="p-${name}">${label}</label><input id="p-${name}" name="${name}" type="${type}" value="${escapeHTML(value??'')}" ${extra}></div>`;
}
function selectField(name,label,values,value) {
  return `<div class="field"><label for="p-${name}">${label}</label><select id="p-${name}" name="${name}">${values.map(([v,l])=>`<option value="${v}" ${v===value?'selected':''}>${l}</option>`).join('')}</select></div>`;
}
function openPosition(book,id) {
  const p = bookItems(book).find(p=>p.id===id) || {};
  const isOption=book==='options';
  let fields = isOption ?
    field('ticker','기초자산 / 티커',p.ticker,'text','required maxlength="40" placeholder="BTC, ETH, AAPL…"') + field('venue','거래소 / 계좌',p.venue,'text','maxlength="80"') +
    selectField('kind','옵션 유형',[['call','Call'],['put','Put']],p.kind||'call') + selectField('side','포지션 방향',[['long','Long · 매수'],['short','Short · 매도']],p.side||'long') +
    field('expiry','만기일',p.expiry,'date','required') + field('strike','행사가 · USD',p.strike,'number','required min="0" step="any"') +
    field('contracts','계약 수량',p.contracts,'number','required min="0.00000001" step="any"') + field('multiplier','계약 승수 · 계약당 기초자산 수',p.multiplier??1,'number','required min="0.00000001" step="any"') +
    field('entry','진입 프리미엄 · 단위당 USD',p.entry,'number','required min="0" step="any"') + field('mark','현재 프리미엄 · 단위당 USD',p.mark,'number','min="0" step="any" placeholder="미입력 시 손익 계산 제외"') + field('fees','총 수수료 · USD',p.fees??0,'number','required min="0" step="any"') :
    field('name','프로토콜 / 전략 이름',p.name,'text','required maxlength="80" placeholder="Variational, Hyperliquid…"') + field('ticker','마켓 / 페어',p.ticker,'text','maxlength="60" placeholder="BTC-PERP"') + field('venue','체인 / 계좌',p.venue,'text','maxlength="80"') +
    selectField('side','방향',[['neutral','Neutral / 양방향'],['long','Long'],['short','Short']],p.side||'neutral') +
    field('collateral','예치금 / 증거금 · USD',p.collateral,'number','required min="0" step="any"') + field('leverage','레버리지 · 배',p.leverage??1,'number','required min="1" step="any"') +
    field('pnl','누적 거래 손익 · USD',p.pnl,'number','step="any" placeholder="손실은 음수, 미입력 시 계산 제외"') + field('funding','누적 펀딩 수익 · USD',p.funding??0,'number','required step="any"') +
    field('rewards','확정 보상 · USD',p.rewards??0,'number','required min="0" step="any"') + field('fees','누적 수수료 · USD',p.fees??0,'number','required min="0" step="any"') + field('points','미확정 포인트 / 에어드롭 메모',p.points,'text','maxlength="160"');
  document.getElementById('modal-body').innerHTML = `<div class="modal-head"><div class="minfo"><div class="ticker">${isOption?'Option':'DEX PERP Farming'} ${id?'수정':'추가'}</div><div class="name">수동 기록 · 현물 보유 자산 합계와 별도 관리</div></div><button class="modal-close" aria-label="닫기" onclick="closeModal()">×</button></div>
    <form id="position-form"><div class="position-form-grid">${fields}</div>
    <p class="form-help">${isOption?'프리미엄은 기초자산 1단위당 USD로 입력하세요. 승수는 계약 명세에 맞춰 입력하세요(미국 주식 옵션은 보통 100). 코인 표시 프리미엄은 USD로 환산해 기록합니다.':'펀딩 지급액과 거래 손실은 음수로 입력하세요. 포인트는 USD 손익에 포함하지 않습니다.'}</p>
    <div class="field"><label for="p-reason">Thesis</label><textarea id="p-reason" name="reason">${escapeHTML(p.reason||'')}</textarea></div>
    <div class="field"><label for="p-conviction">Conviction</label><select id="p-conviction" name="conviction">${convictionOptions(p.conviction)}</select></div>
    <div class="modal-actions"><button type="submit" class="btn-save">저장</button>${id?'<button type="button" class="btn-del" id="delete-position">삭제</button>':''}</div></form>`;
  showModal();
  document.getElementById('position-form').addEventListener('submit',e=> {
    e.preventDefault();
    const form=e.currentTarget; if(!form.reportValidity()) return;
    const record={...p,id:p.id||genId(book)};
    const nums=isOption?['strike','contracts','multiplier','entry','mark','fees','conviction']:['collateral','leverage','pnl','funding','rewards','fees','conviction'];
    for(const [key,value] of new FormData(form)) record[key]=nums.includes(key)?(value===''?null:Number(value)):value.trim();
    if(nums.some(key=>record[key]!=null&&!Number.isFinite(record[key]))) {alert('숫자 입력을 확인하세요.');return;}
    if(!(isOption?record.ticker:record.name)) {alert('이름을 입력하세요.');return;}
    const list=bookItems(book),index=list.findIndex(p=>p.id===id);
    if(index>=0) list[index]=record; else list.push(record);
    if(save()){closeModal();renderAll();}
  });
  document.getElementById('delete-position')?.addEventListener('click',()=> {
    if(!confirm('이 포지션 기록을 삭제할까요?')) return;
    if(book==='options') options=options.filter(x=>x.id!==id); else farming=farming.filter(x=>x.id!==id);
    if(save()){closeModal();renderAll();}
  });
}
function newsSearchURL(name,ticker) {
  return 'https://news.google.com/search?q='+encodeURIComponent(`${name||''} ${ticker||''}`.trim());
}
function safeNewsURL(value) {
  if(!value.trim()) return '';
  try {const url=new URL(value); return ['https:','http:'].includes(url.protocol)?url.href:null;} catch {return null;}
}
function openNews(book,id) {
  const source=(book==='spot'?coins:bookItems(book)).find(p=>p.id===id);
  const data=journal(book,id);
  const name=source.name||source.ticker;
  const href=newsSearchURL(name,source.ticker===name?'':source.ticker);
  const savedLink=safeNewsURL(data.newsUrl||'');
  document.getElementById('modal-body').innerHTML=`<div class="modal-head"><div class="minfo"><div class="ticker">${escapeHTML(name)} · News</div><div class="name">종목 뉴스 검색과 업데이트 기록</div></div><button class="modal-close" aria-label="닫기" onclick="closeModal()">×</button></div>
    <a class="btn news-link" href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">Google News에서 최신 기사 보기 ↗</a>
    <p class="form-help">새 탭에서 검색 결과를 확인합니다. 이 페이지는 기사 피드를 자동 수집하지 않습니다.</p>
    ${savedLink?`<a class="news-link" href="${escapeHTML(savedLink)}" target="_blank" rel="noopener noreferrer">저장한 기사 열기 ↗</a>`:''}
    <form id="news-form"><div class="field"><label for="news-url">기사 / 공지 링크</label><input id="news-url" type="url" value="${escapeHTML(data.newsUrl||'')}" placeholder="https://…"></div>
    <div class="field"><label for="news-note">News update · Thesis에 미치는 영향</label><textarea id="news-note" placeholder="새 소식, 촉매 일정, 투자 논리가 달라진 점…">${escapeHTML(data.newsNote||'')}</textarea></div>
    <p class="form-help">${data.newsUpdated?`마지막 기록: ${escapeHTML(new Date(data.newsUpdated).toLocaleString())}`:'아직 기록한 업데이트가 없습니다.'}</p>
    <button class="btn-save" type="submit">업데이트 저장</button></form>`;
  showModal();
  document.getElementById('news-form').addEventListener('submit',e=> {
    e.preventDefault();
    const url=safeNewsURL(document.getElementById('news-url').value);
    if(url===null) {document.getElementById('news-url').setCustomValidity('http 또는 https 기사 링크를 입력하세요.');document.getElementById('news-url').reportValidity();return;}
    Object.assign(data,{newsUrl:url,newsNote:document.getElementById('news-note').value.trim(),newsUpdated:new Date().toISOString()});
    if(save()){closeModal();renderTable();}
  });
  document.getElementById('news-url').addEventListener('input',e=>e.target.setCustomValidity(''));
}
