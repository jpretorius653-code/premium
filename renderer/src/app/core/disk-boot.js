// ══════════════════════════════════════════════════════════
// DATA SAFETY — never boot to a clean state while data exists
// ══════════════════════════════════════════════════════════
const _ALLKEYS=['iss8_act','iss8_cfg','iss8_usr','iss8_db','iss8_txs','iss8_pend','iss8_ord','iss8_audit','iss8_brand','iss8_seq','iss8_fleet'];

// Pull durable state off disk (async IPC — works even if the sync preload
// snapshot was empty, which is what caused the clean-install boots).
async function readDisk(){
  try{
    if(window.issDesktop&&window.issDesktop.stateRead){
      const d=await window.issDesktop.stateRead();
      if(d&&typeof d==='object') return d;
    }
  }catch(e){}
  try{ return (window.issDesktop&&window.issDesktop.diskState)||{}; }catch(e){ return {}; }
}

// True if this browser storage looks like a fresh install
function looksClean(){
  const a=G(K.act,false), t=G(K.txs,[]), u=G(K.usr,null);
  return (!a && (!t||!t.length) && !u);
}
// True if the disk copy actually holds real data
function diskHasData(d){
  if(!d) return false;
  const t=d['iss8_txs'], u=d['iss8_usr'], c=d['iss8_cfg'];
  return !!(d['iss8_act'] || (t&&t.length) || u || c);
}

// Copy disk -> localStorage. Never destructive: only fills keys that are
// missing or empty locally, unless force=true (explicit user restore).
function applyDisk(d,force){
  let n=0;
  _ALLKEYS.forEach(k=>{
    if(d[k]===undefined) return;
    let cur=null; try{ cur=localStorage.getItem(k); }catch(e){}
    const empty=(cur===null||cur===''||cur==='null'||cur==='undefined'||cur==='[]');
    if(force||empty){ try{ localStorage.setItem(k,JSON.stringify(d[k])); n++; }catch(e){} }
  });
  return n;
}

// Push everything currently in localStorage down to disk.
async function pushAllToDisk(){
  if(!(window.issDesktop&&window.issDesktop.stateWrite)) return 0;
  let n=0;
  for(const k of _ALLKEYS){
    let cur=null; try{ cur=localStorage.getItem(k); }catch(e){}
    if(cur===null||cur===''||cur==='null'||cur==='undefined') continue;
    try{ await window.issDesktop.stateWrite(k,JSON.parse(cur)); n++; }catch(e){}
  }
  return n;
}

// Manual restore from Settings
async function manualRestore(){
  const d=await readDisk();
  if(!diskHasData(d)){ toast('No saved database found on disk','error',5000); return; }
  const t=(d['iss8_txs']||[]).length;
  if(!confirm('Restore from the on-disk database?\n\n'+t+' transaction(s) found.\n\nThis ADDS BACK anything missing. It never deletes records.')) return;
  const n=applyDisk(d,true);
  toast('Restored '+n+' data set(s) — reloading…','success',3000);
  setTimeout(()=>location.reload(),900);
}

// Manual save from Settings
async function manualSaveAll(){
  saveCfg();
  try{ P(K.usr,users); P(K.txs,txs); P(K.db,db); }catch(e){}
  const n=await pushAllToDisk();
  auditLog('config','settings','','Manual save — '+n+' data set(s) written to disk');
  toast('Saved ✓ — '+n+' data set(s) written to disk','success',4000);
}

// Boot sequence
(async function boot(){
  try{ Debug.log('ISS Weighbridge — build '+RENDERER_BUILD); }catch(e){}
  document.getElementById('act-logo').innerHTML=brandLockup(92);
  try{ const am=document.getElementById('act-machine'); if(am) am.innerHTML=licMachineHTML(); }catch(e){}
  document.getElementById('login-logo').innerHTML=brandLockup(92);

  // ── GUARD: if local storage looks wiped but the disk has data, restore
  //    BEFORE showing the activation screen. This is the fix for the app
  //    occasionally booting as a clean install after a close/reopen. ──
  try{
    if(looksClean()){
      const d=await readDisk();
      if(diskHasData(d)){ applyDisk(d,true); }
    }else{
      // healthy boot — make sure the disk mirror is current
      const d=await readDisk();
      if(!diskHasData(d)) pushAllToDisk();
    }
  }catch(e){}

  // ── Last line of defence: if this PC is still empty but a shared
  //    database is configured, rebuild everything from the share. ──
  try{
    if(looksClean() && window.issDesktop && window.issDesktop.sharedList){
      const c=G(K.cfg,null);
      if(c && c.syncFolder){
        cfg=Object.assign({},DEF_CFG,c);
        const st=await window.issDesktop.sharedStatus();
        if(st&&st.ok) await shareRebuild();
      }
    }
  }catch(e){}

  try{ enforcePlan(); saveCfg(); }catch(e){}
  try{ licReconcile(); }catch(e){}
  try{ migrateTxKeys(); }catch(e){}

  const activated=G(K.act,false);
  if(!activated){document.getElementById('ovr-act').style.display='flex';return;}
  try{ if(cfg && cfg.debugPanel) Debug.show(true); }catch(e){}
  // Scheduled reports run off the app clock, so they start at boot and keep
  // ticking whether or not anyone is signed in — an unattended night shift
  // still gets its 06:00 report out.
  try{ cvLogoMigrate(); }catch(e){}
  // Re-check the licence every 10 minutes: a bridge left running for days
  // must still reach phase 2 without needing a restart.
  try{
    let _wasDue=licPhase2Due();
    setInterval(()=>{
      const due=licPhase2Due();
      if(due!==_wasDue){ _wasDue=due; try{ renderTab(currentTab); }catch(e){} }
    }, 10*60*1000);
  }catch(e){}
  try{ repStart(); }catch(e){ try{Debug.log('reports: '+e.message);}catch(_){} }
  try{ syncStart(); }catch(e){ try{Debug.log('fleet sync: '+e.message);}catch(_){} }
  window.addEventListener('beforeunload', ()=>{ try{ lwClear(); }catch(e){} });
  showLogin();
})();

