// ── INIT ─────────────────────────────────────────
function startApp(){
  document.getElementById('app').style.display='flex';
  document.getElementById('wb').style.display='block';
  document.getElementById('hdr-user').textContent='👤 '+session.name;
  // A stored brand pack has to land BEFORE the header is drawn, or the pack's
  // logo sits in LOGO_IMG unused until the next redraw.
  applyStoredBrand();
  document.getElementById('hdr-logo-wrap').innerHTML=appLogo(true,62);
  applyBranding();setHdrTag();renderBridgePills();
  buildTabs();
  renderTab('dashboard');
  tmStart();
  startSim(0); if(planBridges()>1) startSim(1);
  updateWBCount();
  // SERIAL: prefer native (EXE) — main process holds the port open.
  // The native layer auto-opens saved ports itself; we just bind events.
  initNativeSerial().then(native=>{
    if(native){
      // native main process already auto-opens saved ports on launch.
      // Reflect any already-open ports in the UI.
      if(window.issDesktop.serialSaved) window.issDesktop.serialSaved().then(saved=>{
        Object.keys(saved||{}).forEach(bi=>{ cfg.bridges[bi] && (cfg.bridges[bi].paired=true); });
      });
    }else{
      // Browser/PWA fallback: Web Serial silent reopen + watchdog
      setTimeout(()=>{ autoOpenSavedPorts(); startSerialWatchdog(); }, 600);
      if('serial' in navigator && !_serialEvtBound){
        _serialEvtBound=true;
        navigator.serial.addEventListener('connect', ()=>{ setTimeout(autoOpenSavedPorts,300); });
        navigator.serial.addEventListener('disconnect', (e)=>{
          for(let bi=0;bi<bState.length;bi++){
            if(bState[bi].serial===e.target){ bState[bi].state='disconnected'; bState[bi].serial=null; startSim(bi); }
          }
        });
      }
    }
  });
  // Auto-connect to WeighBox if loaded from one, or if URLs saved
  setTimeout(autoConnectBox, 800);
  // Start desktop sync poll if configured
  if(window.issDesktop && cfg.syncFolder) syncPoll();
  // Open IndexedDB, recover any data lost in power cut, restore backup folder
  openIDB().then(async()=>{
    await recoverData();
    await restoreBackupHandle();
    updateBackupFolderStatus();
    checkStorageStatus();
    updateSavedBadge(!!(_backupDir||window.issDesktop));
    if(currentTab==='dashboard') renderDash();
    if(currentTab==='records') renderRecords();
  });
  // Service Worker
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
}

// Desktop multi-PC sync poll (Electron only)
let syncPollTimer = null;
