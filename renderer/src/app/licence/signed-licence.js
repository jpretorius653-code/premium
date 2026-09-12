// ══════════════════════════════════════════════════════════════════════════
//  SIGNED LICENCES — renderer side  (v10)
//
//  The signature check runs in the main process (electron/licence.js); this
//  file only asks it. A signed licence key looks like ISS1.xxxxx.yyyyy and is
//  issued for one PC's machine ID, shown on the activation screen.
//
//  · In a build without a public key ("legacy"), nothing here changes the
//    9.9.x behaviour.
//  · In a signed build, the second authorisation needs a licence for THIS PC.
//    Installs that already passed the old phase 2 keep working. A phase 2 that
//    was granted by a signed licence is re-checked at every start, so a data
//    folder copied to another PC loses office access (weighing never stops).
// ══════════════════════════════════════════════════════════════════════════
function licDesk(){ return (window.issDesktop && window.issDesktop.licence) || { mode:'legacy', valid:false }; }
function licSignedMode(){ return licDesk().mode === 'signed'; }
function licMachine(){ return licDesk().machine || ''; }
function licLooksSigned(v){ return /^ISS1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(String(v||'').trim()); }

/* Apply a signed key. Resolves to the status object; on success the phase-2
   flags and plan tier are written the same way the old codes wrote them. */
async function licApplySigned(code){
  if(!window.issDesktop || !window.issDesktop.licenceApply) return { valid:false, reason:'Signed licences need the desktop app' };
  const st = await window.issDesktop.licenceApply(String(code).trim());
  if(st && st.valid){
    window.issDesktop.licence = st;
    const L = st.licence || {};
    if(!cfg.licInstalledAt) cfg.licInstalledAt = nowISO();
    cfg.licPhase2Ok = true; cfg.licPhase2At = nowISO(); cfg.licMode = 'signed';
    cfg.licSite = L.site || ''; cfg.licExpires = L.expires || '';
    if(L.tier && PLAN_TIERS[L.tier]) cfg.planTier = L.tier;
    saveCfg(); try{ pushAllToDisk(); }catch(e){}
    try{ auditLog('edit','system','','Signed licence accepted — '+(L.site||'')+' · '+(L.tier||'')+(L.expires?' · until '+L.expires:'')); }catch(e){}
  }
  return st || { valid:false, reason:'No answer from the licence service' };
}

/* Start-up reconcile: only touches a phase 2 that a signed licence granted. */
function licReconcile(){
  try{
    if(!licSignedMode() || cfg.licMode !== 'signed') return;
    const st = licDesk();
    if(!st.valid && cfg.licPhase2Ok){
      cfg.licPhase2Ok = false; saveCfg();
      try{ auditLog('edit','system','','Signed licence no longer valid on this PC: '+(st.reason||'')); }catch(e){}
      setTimeout(()=>toast('Licence: '+(st.reason||'not valid on this PC')+' — office screens are locked, weighing continues','error',9000), 1500);
    }
  }catch(e){}
}

function licMachineHTML(){
  const id = licMachine();
  if(!id) return '';
  return `<div class="lic-machine" title="Give this ID to your supplier to receive a licence key for this PC">
    <span>This PC</span><b>${esc(id)}</b>
    <button type="button" class="btn btn-ghost btn-sm" onclick="navigator.clipboard&&navigator.clipboard.writeText('${esc(id)}').then(()=>toast('Machine ID copied','success'))">Copy</button></div>`;
}
