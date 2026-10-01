/* Cross-device sync client. Pull -> merge -> apply, push debounced after every save().
 * Silent no-op (local-only, exactly as before) when the server has no storage configured. */
const SYNC_STORE_KEY='coin-portfolio-sync-v1';
const CPSync=(()=>{
  const core=typeof CPSyncCore!=='undefined'?CPSyncCore:null;
  const origin=()=>typeof location==='undefined'?'':location.protocol==='file:'?'http://127.0.0.1:8787':location.origin;
  const KEY_RE=/^[A-Za-z0-9_-]{22,128}$/;
  let st={key:'',disabled:false,rev:0,doc:null,lastSync:0};
  let configured=null,status='hidden',busy=false,pushTimer=null,retryTimer=null,lastPull=0,started=false,force=false;
  const persist=()=>{try{localStorage.setItem(SYNC_STORE_KEY,JSON.stringify(st));}catch{}};
  const restore=()=>{try{const d=JSON.parse(localStorage.getItem(SYNC_STORE_KEY));if(d&&typeof d==='object')st=Object.assign(st,d);}catch{}};
  restore();
  const snapshot=()=>({coins,holdings,farming,farmingPairs,farmingExtra,options,scenario,reflections,appliedImports,removedDefaults,categories,migrations});
  function newKey(){const b=new Uint8Array(24);crypto.getRandomValues(b);return btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
  function setStatus(s){
    status=s;
    const el=document.getElementById('sync-status');
    if(el){
      const t=s==='ok'?'동기화됨 · '+new Date(st.lastSync||Date.now()).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):s==='busy'?'동기화 중':s==='offline'?'오프라인 · 로컬 저장':'';
      el.textContent=t;el.hidden=!t;el.dataset.state=s;
    }
    const p=document.getElementById('sync-panel-status');if(p)p.textContent=document.getElementById('sync-status')?.textContent||'';
  }
  async function api(method,payload){
    const res=await fetch(origin()+'/api/sync',{method,headers:{'Content-Type':'application/json','X-Sync-Key':st.key},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(20000)});
    if(res.status===503){configured=false;throw Object.assign(new Error('not configured'),{code:503});}
    const body=await res.json().catch(()=>({}));
    if(res.status===409)return {conflict:true,...body};
    if(!res.ok)throw Object.assign(new Error('sync '+res.status),{code:res.status});
    return body;
  }
  // Someone is typing or a dialog is open: applying remote data now would re-render under them.
  const userBusy=()=>{const a=document.activeElement;return !!(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))||!!document.getElementById('overlay')?.classList?.contains('open');};
  function applyDoc(merged){
    const S=core.apply(merged,snapshot());
    try{localStorage.setItem(STORE_KEY,JSON.stringify(S));}catch{return;}
    st.doc=merged;persist();
    load();
    const calls=[()=>initFarmingPairs(),()=>initScenario(),()=>initReflections(),()=>renderTabBar(),()=>renderAll()];
    for(const f of calls)try{f();}catch(e){console.error(e);}
  }
  const localDoc=()=>core.build(snapshot(),st.doc);
  // One reconciliation: merge remote into local (applying it if it changed anything), then push if remote is behind.
  async function reconcile(remote){
    for(let attempt=0;attempt<5;attempt++){
      const local=localDoc();
      let merged=local,rev=st.rev;
      if(remote&&remote.doc){
        merged=core.merge(local,remote.doc);rev=remote.rev;
        if(!core.sameValues(merged,local)){
          if(!force&&userBusy()){st.doc=local;persist();scheduleRetry();setStatus('ok');return;}
          applyDoc(merged);
        }else st.doc=merged;
      }else st.doc=local;
      st.rev=rev;
      if(remote&&remote.doc&&core.sameDoc(st.doc,remote.doc)){st.dirty=false;st.lastSync=Date.now();persist();setStatus('ok');return;}
      const res=await api('PUT',{baseRev:rev,doc:st.doc});
      if(res.conflict){remote=res;continue;}
      st.rev=res.rev;st.dirty=false;st.lastSync=Date.now();persist();setStatus('ok');return;
    }
    throw new Error('too many conflicts');
  }
  async function run(fn){
    if(!core||!st.key)return;
    if(busy){if(fn===push){clearTimeout(pushTimer);pushTimer=setTimeout(push,1500);}return;}
    busy=true;setStatus('busy');
    try{await fn();}
    catch(e){if(e.code===503){setStatus('hidden');}else setStatus('offline');}
    finally{busy=false;}
  }
  const pull=()=>run(async()=>{lastPull=Date.now();const r=await api('GET');if(st.rev&&r.rev===st.rev&&r.doc&&!pendingLocal())return finish();await reconcile(r);});
  const finish=()=>{st.lastSync=Date.now();persist();setStatus('ok');};
  const pendingLocal=()=>{try{return !!st.dirty;}catch{return true;}};
  function scheduleRetry(){clearTimeout(retryTimer);retryTimer=setTimeout(()=>pull(),6000);}
  function changed(){
    if(!core||!st.key)return;
    st.doc=localDoc();st.dirty=true;persist();
    clearTimeout(pushTimer);pushTimer=setTimeout(push,1500);
  }
  const push=()=>run(async()=>{
    // Optimistic: send at the rev we last saw; a 409 carries the remote doc to merge.
    const local=localDoc();st.doc=local;
    const res=await api('PUT',{baseRev:st.rev,doc:local});
    if(res.conflict){await reconcile(res);}else{st.rev=res.rev;}
    st.dirty=false;st.lastSync=Date.now();persist();setStatus('ok');
  });
  async function adopt(key){
    st.key=key;st.disabled=false;st.rev=0;st.dirty=true;persist();
    force=true;try{await pull();}finally{force=false;}
    renderPanel();
  }
  async function start(){
    if(started||!core||typeof fetch!=='function'||typeof crypto==='undefined'||!crypto.getRandomValues)return;
    started=true;
    let linkKey='';
    const m=/[#&]sync=([A-Za-z0-9_-]+)/.exec((typeof location!=='undefined'&&location.hash)||'');
    if(m&&KEY_RE.test(m[1])){
      linkKey=m[1];
      try{history.replaceState(null,'',location.pathname+location.search);}catch{}
    }
    try{
      if(linkKey&&linkKey!==st.key){
        if(st.key&&!confirm('이 기기는 이미 다른 동기화 키에 연결되어 있습니다. 새 키로 바꾸고 데이터를 합칠까요?'))linkKey='';
      }
      if(linkKey&&linkKey!==st.key){
        configured=true;await adopt(linkKey);schedule();return;
      }
      if(st.key){configured=true;await pull();schedule();return;}
      if(st.disabled)return;
      const probe=await fetch(origin()+'/api/sync',{signal:AbortSignal.timeout(15000)});
      if(probe.status===503){configured=false;return;}
      if(!probe.ok)return;
      configured=true;
      await adopt(newKey());
      schedule();
    }catch{if(st.key){setStatus('offline');schedule();}}
  }
  function schedule(){
    const tick=()=>{if(!document.hidden&&Date.now()-lastPull>5000)pull();};
    document.addEventListener('visibilitychange',tick);
    window.addEventListener('focus',tick);
    setInterval(()=>{if(!document.hidden)pull();},60000);
  }
  const linkFor=key=>origin()+'/#sync='+key;
  function disconnect(){
    clearTimeout(pushTimer);
    st={key:'',disabled:true,rev:0,doc:null,lastSync:0};persist();setStatus('hidden');renderPanel();
  }
  async function connectFromInput(){
    const input=document.getElementById('sync-key-input');if(!input)return;
    const m=/([A-Za-z0-9_-]{22,128})\s*$/.exec(input.value.trim().replace(/^.*#sync=/,''));
    if(!m){input.setCustomValidity('올바른 연결 링크 또는 키가 아닙니다.');input.reportValidity();input.setCustomValidity('');return;}
    if(!started)started=true;
    configured=true;await adopt(m[1]);if(!pushTimer)schedule();
  }
  async function startHere(){st.disabled=false;persist();configured=true;await adopt(newKey());schedule();}
  function renderPanel(){
    const box=document.getElementById('sync-panel');if(!box)return;
    const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    if(configured===false){box.innerHTML='<p class="form-help">동기화 서버가 설정되지 않아 이 기기에만 저장됩니다.</p>';return;}
    const paste=`<div class="field" style="margin-top:18px"><label for="sync-key-input">다른 기기의 연결 링크 · 키 붙여넣기</label><input id="sync-key-input" autocomplete="off" spellcheck="false" placeholder="https://…/#sync=…"></div><div class="backup-actions"><button type="button" class="btn" id="sync-connect">연결하고 데이터 합치기</button></div>`;
    if(st.key){
      box.innerHTML=`<p class="form-help">연결 링크를 다른 기기에서 열면 두 기기의 데이터가 합쳐지고 이후 자동으로 동기화됩니다. 링크는 본인만 알아야 합니다.</p>
      <div class="field"><label for="sync-link">연결 링크</label><input id="sync-link" readonly value="${esc(linkFor(st.key))}"></div>
      <div class="backup-actions"><button type="button" class="btn" id="sync-copy">링크 복사</button><button type="button" class="btn" id="sync-off">연결 해제</button><span class="ts" id="sync-panel-status"></span></div>${paste}`;
      document.getElementById('sync-copy').onclick=async()=>{const i=document.getElementById('sync-link');try{await navigator.clipboard.writeText(i.value);}catch{i.select();document.execCommand&&document.execCommand('copy');}document.getElementById('sync-copy').textContent='복사됨';};
      document.getElementById('sync-off').onclick=()=>{if(confirm('이 기기의 동기화를 해제할까요? 이 기기의 데이터는 그대로 남고, 서버의 사본은 삭제되지 않습니다.'))disconnect();};
    }else{
      box.innerHTML=`<p class="form-help">${configured?'이 기기는 아직 동기화되지 않았습니다.':'동기화 서버 확인 중…'}</p><div class="backup-actions"><button type="button" class="btn" id="sync-start">이 기기에서 동기화 시작</button></div>${paste}`;
      document.getElementById('sync-start').onclick=startHere;
    }
    document.getElementById('sync-connect').onclick=connectFromInput;
    setStatus(status);
  }
  return {start,changed,pull,renderPanel,get key(){return st.key;},_state:()=>st};
})();
function startSync(){CPSync.start();}
