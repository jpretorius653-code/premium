function backupAll(){
  const d={txs,pending,orders,db,cfg,users:users.map(u=>({...u,pin:'****'}))};
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));
  a.download=BRAND.filePrefix+'-Backup-'+new Date().toISOString().slice(0,10)+'.json';
  a.click();URL.revokeObjectURL(a.href);toast('Backup exported ✓','success');
}
function restoreAll(input){
  const f=input.files[0];if(!f)return;
  if(!confirm('This will overwrite all current data. Continue?'))return;
  const rd=new FileReader();
  rd.onload=()=>{
    try{const d=JSON.parse(rd.result);
      if(d.txs)txs=d.txs;if(d.pending)pending=d.pending;if(d.orders)orders=d.orders;if(d.db)Object.assign(db,d.db);
      saveTxs();savePend();saveOrders();saveDB();
      toast('Restored ✓','success');renderTab(currentTab);
    }catch{toast('Invalid backup file','error');}
  };rd.readAsText(f);
}
async function clearAll(){
  if(!confirm('Delete ALL transactions?\n\nThis clears every stored copy: local storage, the crash-recovery database, and the disk mirror.'))return;
  if(!confirm('This cannot be undone. Confirm?'))return;
  if(cfg.syncFolder){
    if(!confirm('WARNING: a shared sync folder is still set.\n\nThe app will pull those records straight back in.\n\nClear the sync folder first (Settings → Multi-PC Sync) then try again.\n\nContinue anyway?')) return;
  }
  txs=[]; pending=[];
  saveTxs(); savePend();
  // Wipe the IndexedDB copy too. Without this, the startup power-cut recovery
  // sees IndexedDB holding more records than local storage and restores them,
  // which made "Delete ALL" appear to do nothing.
  try{ await idbClear('txs'); await idbClear('meta'); }catch(e){}
  auditLog('config','settings','','Deleted ALL transactions (all storage layers)');
  toast('All data cleared — local, recovery database and disk','info',6000);
  renderSettings();
}

async function setupBackupFolder(){
  if(window.issDesktop){
    toast('EXE app: auto-backup already writes to AppData\\iss-weighbridge\\AutoBackup\\ after every transaction','info',5000);
    updateBackupFolderStatus(); return;
  }
  const ok = await pickBackupFolder();
  if(ok) updateBackupFolderStatus();
}
function updateBackupFolderStatus(){
  const el = document.getElementById('backupFolderStatus');
  if(!el) return;
  if(window.issDesktop) el.textContent='EXE app — auto-saving to AppData after every transaction ✓';
  else if(_backupDir) el.textContent='✓ Folder set — auto-saving after every transaction';
  else el.textContent='Not set — click Set Folder to choose a backup location';
}
async function checkStorageStatus(){
  const idbTxs = await idbGetAll('txs');
  const lsBytes = new Blob([JSON.stringify(txs)]).size;
  const el = document.getElementById('storageStatus');
  if(el) el.textContent=
    'localStorage: '+txs.length+' tx ('+Math.round(lsBytes/1024)+'KB) · '+
    'IndexedDB: '+idbTxs.length+' tx · '+
    'Disk: '+(_backupDir||window.issDesktop?'✓ active':'not set');
}
async function pickSyncFolder(){if(window.issDesktop){const f=await window.issDesktop.pickSyncFolder();if(f){setSave('syncFolder',f);renderSettings();}}else toast('Desktop (EXE) app only','info');}

