// ══════════════════════════════════════════════════════════
// TRIPLE STORAGE — protect against load-shedding data loss
// Layer 1: localStorage (instant, size-limited)
// Layer 2: IndexedDB   (robust, unlimited, survives cache clear)
// Layer 3: Disk file   (File System Access API or Electron fs)
// On startup: compare all three, use the most complete set.
// ══════════════════════════════════════════════════════════
let _idb = null;
let _backupDir = null;  // FileSystemDirectoryHandle (browser)
let _lastSaved = null;  // timestamp of last successful write

function openIDB(){
  return new Promise(res=>{
    if(!window.indexedDB){return res(null);}
    const r = indexedDB.open('iss_wb_v8', 2);
    r.onupgradeneeded = e=>{
      const d = e.target.result;
      if(!d.objectStoreNames.contains('txs'))
        d.createObjectStore('txs', {keyPath:'id'});
      if(!d.objectStoreNames.contains('meta'))
        d.createObjectStore('meta');
    };
    r.onsuccess = e=>{ _idb = e.target.result; res(_idb); };
    r.onerror   = ()=>res(null);
  });
}
function idbPut(store, val, key){
  if(!_idb) return;
  try{ _idb.transaction(store,'readwrite').objectStore(store).put(val, key||undefined); }catch{}
}
// Clear an entire IndexedDB store. Needed when wiping data — without this the
// startup power-cut recovery finds the old records still in IndexedDB and
// restores them, silently undoing the wipe.
function idbClear(store){
  return new Promise(res=>{
    if(!_idb) return res(false);
    try{
      const r=_idb.transaction(store,'readwrite').objectStore(store).clear();
      r.onsuccess = ()=>res(true);
      r.onerror   = ()=>res(false);
    }catch{ res(false); }
  });
}
function idbGetAll(store){
  return new Promise(res=>{
    if(!_idb) return res([]);
    try{
      const r = _idb.transaction(store).objectStore(store).getAll();
      r.onsuccess = ()=>res(r.result||[]);
      r.onerror   = ()=>res([]);
    }catch{res([]);}
  });
}
function idbGet(store, key){
  return new Promise(res=>{
    if(!_idb) return res(null);
    try{
      const r = _idb.transaction(store).objectStore(store).get(key);
      r.onsuccess = ()=>res(r.result||null);
      r.onerror   = ()=>res(null);
    }catch{res(null);}
  });
}

// Write a single tx to IndexedDB immediately
function idbPutTx(tx){ idbPut('txs', tx); }

// File System Access API — user picks a folder ONCE, handle persisted
async function pickBackupFolder(){
  if(!window.showDirectoryPicker){
    toast('Disk backup needs Chrome/Edge desktop browser or the EXE app','error');
    return false;
  }
  try{
    const dir = await window.showDirectoryPicker({mode:'readwrite',id:'iss-backup'});
    _backupDir = dir;
    // Persist handle in IndexedDB so it survives page refresh
    idbPut('meta', dir, 'backupDir');
    toast('Backup folder set ✓ — auto-saving after every transaction','success',4000);
    return true;
  }catch(e){
    if(e.name !== 'AbortError') toast('Could not access folder: '+e.message,'error');
    return false;
  }
}
async function restoreBackupHandle(){
  const dir = await idbGet('meta','backupDir');
  if(!dir) return;
  try{
    // Check we still have permission
    const perm = await dir.queryPermission({mode:'readwrite'});
    if(perm === 'granted'){ _backupDir = dir; return; }
    const req  = await dir.requestPermission({mode:'readwrite'});
    if(req === 'granted') _backupDir = dir;
  }catch{}
}
async function writeBackupFile(jsonStr){
  if(!_backupDir) return false;
  try{
    const d   = new Date();
    const pad = x=>String(x).padStart(2,'0');
    const dateStr = d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
    // Always overwrite Latest (fast read after power cut)
    const latest = await _backupDir.getFileHandle(BRAND.filePrefix+'-Backup-Latest.json',{create:true});
    const wl = await latest.createWritable();
    await wl.write(jsonStr); await wl.close();
    // One dated file per day (keeps 30 days history)
    const dated = await _backupDir.getFileHandle(BRAND.filePrefix+'-Backup-'+dateStr+'.json',{create:true});
    const wd = await dated.createWritable();
    await wd.write(jsonStr); await wd.close();
    return true;
  }catch(e){
    console.warn('Backup write failed:',e.message);
    return false;
  }
}

// ── THE MAIN BACKUP FUNCTION — called after every transaction ──
async function autoBackup(why){
  // Build snapshot
  const snap = {
    version:'8.0', savedAt:new Date().toISOString(),
    txCount:txs.length, pendingCount:pending.length,
    txs, pending, orders, db,
  };
  const json = JSON.stringify(snap);

  // L1 — localStorage (already saved by saveTxs/savePend)
  // L2 — IndexedDB: save every tx individually (survives localStorage wipe)
  if(_idb){
    try{
      const store = _idb.transaction('txs','readwrite').objectStore('txs');
      txs.forEach(t=>store.put(t));
    }catch{}
    idbPut('meta', snap.savedAt, 'lastSaved');
    idbPut('meta', snap.txCount, 'txCount');
  }

  // L3a — Disk file via File System Access API (browser)
  let diskOk = false;
  if(_backupDir) diskOk = await writeBackupFile(json);

  // L3b — Electron desktop: synchronous fs write (most reliable)
  if(window.issDesktop){
    try{
      await window.issDesktop.autoBackup(json);
      diskOk = true;
    }catch{}
  }

  // L3c — Electron sync folder (shared network, write tx individually)
  if(window.issDesktop && txs.length){
    window.issDesktop.syncWrite(txs[0]).catch(()=>{});
  }

  // Update the status badge
  _lastSaved = new Date();
  updateSavedBadge(diskOk);
}

function updateSavedBadge(diskOk){
  const el = document.getElementById('saved-badge');
  if(!el) return;
  const t = _lastSaved ? _lastSaved.toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}) : '—';
  el.textContent = (diskOk ? '💾 ' : '🖫 ') + t;
  el.title = diskOk ? 'Saved to localStorage + IndexedDB + disk' : 'Saved to localStorage + IndexedDB (no disk folder set)';
  el.style.color = diskOk ? 'var(--ink-3)' : '#FCD34D';
}

// ── STARTUP RECOVERY — after a power cut, find the best data ──
async function recoverData(){
  // Get counts from all layers
  const lsCount  = txs.length;
  const idbTxs   = await idbGetAll('txs');
  const idbCount = idbTxs.length;

  if(idbCount > lsCount){
    // IndexedDB has MORE data — localStorage was wiped or incomplete
    txs = idbTxs.sort((a,b)=>new Date(b.completedAt)-new Date(a.completedAt));
    P(K.txs, txs);  // repopulate localStorage
    const diff = idbCount - lsCount;
    if(diff > 0){ toast('⚡ Recovered '+diff+' transaction'+(diff>1?'s':'')+' after power cut','info',6000); if(typeof auditLog==='function') auditLog('recover','tx','','Power-cut recovery: restored '+diff+' transactions from IndexedDB'); }
  } else if(idbCount < lsCount && _idb){
    // localStorage has more — sync missing ones into IndexedDB
    txs.forEach(t=>idbPutTx(t));
  }
}

