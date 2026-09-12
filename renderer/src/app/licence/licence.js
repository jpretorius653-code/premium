// ══════════════════════════════════════════════════════════════════
// PHASE-2 AUTHORISATION
//
// A day after installation the software asks for a second code. Weighing
// is deliberately NOT blocked: a weighbridge that stops mid-shift because
// of a licence is a weighbridge that gets ripped out. Trucks keep moving
// and keep getting tickets; it is the office side — records, reports,
// settings, exports, users, cloud — that waits for the code.
//
// Honest about what this is: the check runs on this PC, so someone who
// can edit the program files can defeat it. It stops a copied folder
// being useful, not a determined engineer. Binding it to the Supabase
// backend is what makes it real, and that is a separate job.
// ══════════════════════════════════════════════════════════════════
function licInstalledAt(){
  const v=cfg.licInstalledAt;
  const t=v?new Date(v).getTime():0;
  return isFinite(t)&&t>0?t:0;
}
/* Phase 2 is due once a day of use has passed and it has not been given. */
function licPhase2Due(){
  if(cfg.licPhase2Ok===true) return false;
  const t0=licInstalledAt();
  if(!t0) return false;                       // never activated — phase 1 gate has it
  return (Date.now()-t0) >= PHASE2_AFTER_MS;
}
function licHoursLeft(){
  const t0=licInstalledAt(); if(!t0) return null;
  const ms=PHASE2_AFTER_MS-(Date.now()-t0);
  return ms>0 ? ms : 0;
}
/* Everything except weighing. Kept as one list so there is a single place
   to look when someone asks "what exactly does the lock stop?" */
const LIC_OPEN_TABS=['weigh','manual','dashboard'];
function licBlocks(tab){ return licPhase2Due() && LIC_OPEN_TABS.indexOf(tab)<0; }

function licBannerHTML(){
  if(!licPhase2Due()) return '';
  return `<div style="background:var(--warn-soft);border:1px solid var(--warn-line);color:#FCD34D;
      border-radius:10px;padding:10px 12px;margin-bottom:12px;display:flex;
      gap:10px;align-items:center;flex-wrap:wrap">
    <div style="flex:1;min-width:200px;font-size:12px">
      <b>Authorisation required.</b> Weighing and ticketing continue as normal.
      Records, reports, settings and exports are locked until the second
      authorisation code is entered.
    </div>
    <button class="btn btn-navy btn-sm" onclick="openPhase2()">Enter code</button>
  </div>`;
}
function licLockedHTML(what){
  return `<div class="empty" style="padding:40px 20px">
    <div class="ico">🔒</div>
    <p style="margin-bottom:4px"><b>${esc(what||'This section')} is locked</b></p>
    <p style="font-size:12px;color:var(--text3);max-width:340px;margin:0 auto 14px">
      This installation has been running for more than a day and needs its
      second authorisation. Weighing and ticketing are unaffected.</p>
    <button class="btn btn-navy" onclick="openPhase2()">Enter authorisation code</button>
    <div style="font-size:11px;color:var(--text3);margin-top:10px">
      Contact ${esc(BRAND_CO.name)}${BRAND_CO.tel?' · '+esc(BRAND_CO.tel):''}</div>
  </div>`;
}
function openPhase2(){
  openModal('Second Authorisation',`
    <div style="font-size:13px;color:var(--text2);margin-bottom:12px">
      ${licSignedMode()?`Enter the licence key issued by ${esc(BRAND_CO.name)} for this PC.`:`Enter the authorisation code supplied by ${esc(BRAND_CO.name)} for
      this installation.`}</div>
    ${licMachineHTML()}
    <div class="field"><label>Authorisation Code</label>
      <input id="p2-input" type="password" placeholder="••••••••" autocomplete="off"
             autocapitalize="off" spellcheck="false"
             onkeydown="if(event.key==='Enter')doPhase2()"/></div>
    <div id="p2-msg" style="font-size:11px;color:#F87171;min-height:14px;margin-top:4px"></div>
    <button class="btn btn-navy btn-full" style="margin-top:10px" onclick="doPhase2()">Authorise</button>`);
  setTimeout(()=>document.getElementById('p2-input')?.focus(),80);
}
async function doPhase2(){
  const el=document.getElementById('p2-input');
  const msg=document.getElementById('p2-msg');
  const v=(el?.value||'').trim();
  if(!v){ if(msg) msg.textContent='Enter the code'; return; }
  if(licLooksSigned(v)){
    const st=await licApplySigned(v);
    if(st.valid){ closeModal(); toast('Licensed ✓ Full access restored','success',5000); render(); }
    else if(msg){ msg.textContent=st.reason||'Licence not accepted'; el.value=''; el.focus(); }
    return;
  }
  if(licSignedMode()){
    if(msg) msg.textContent='This installation needs a licence key issued for this PC ('+licMachine()+')';
    return;
  }
  const h=await hashStr(v.toUpperCase());
  if(h===(cfg.phase2CodeHash||PHASE2_ACT_HASH) || h===PHASE2_ACT_HASH){
    cfg.licPhase2Ok=true; cfg.licPhase2At=nowISO(); saveCfg();
    try{ pushAllToDisk(); }catch(e){}
    try{ auditLog('edit','system','','Phase-2 authorisation accepted'); }catch(e){}
    closeModal();
    toast('Authorised ✓ Full access restored','success',5000);
    render();
  }else{
    if(msg) msg.textContent='Incorrect authorisation code';
    if(el){ el.value=''; el.focus(); }
  }
}

// ══════════════════════════════════════════════════════════════════
// IDENTITY LOCK — ticket layout and the software/company name
//
// These are the two things that let someone rebadge this software as
// their own. Both sit behind one code, unlocked for the session only.
// ══════════════════════════════════════════════════════════════════
let _identityOk=false;
function identityLocked(){ return !_identityOk; }
async function askIdentity(then){
  if(_identityOk){ then&&then(); return; }
  openModal('Protected Settings',`
    <div style="font-size:13px;color:var(--text2);margin-bottom:12px">
      The ticket layout and the software and company naming are protected.
      Enter the maintenance code to unlock them for this session.</div>
    <div class="field"><label>Maintenance Code</label>
      <input id="idp-input" type="password" placeholder="••••" autocomplete="off"
             inputmode="numeric" onkeydown="if(event.key==='Enter')doIdentity()"/></div>
    <div id="idp-msg" style="font-size:11px;color:#F87171;min-height:14px;margin-top:4px"></div>
    <button class="btn btn-navy btn-full" style="margin-top:10px" onclick="doIdentity()">Unlock</button>`);
  _identityThen=then||null;
  setTimeout(()=>document.getElementById('idp-input')?.focus(),80);
}
let _identityThen=null;
async function doIdentity(){
  const el=document.getElementById('idp-input');
  const msg=document.getElementById('idp-msg');
  const v=(el?.value||'').trim();
  const h=await hashStr(v);
  if(h===(cfg.identityPassHash||IDENTITY_PASS_HASH) || h===IDENTITY_PASS_HASH){
    _identityOk=true;
    try{ auditLog('edit','system','','Protected settings unlocked'); }catch(e){}
    closeModal();
    toast('Unlocked for this session','success');
    const f=_identityThen; _identityThen=null;
    if(f) f(); else render();
  }else{
    if(msg) msg.textContent='Incorrect code';
    if(el){ el.value=''; el.focus(); }
  }
}
/* Wrap a settings panel so it cannot be edited until unlocked. */
function identityShield(title){
  return `<div class="card" style="border-left:4px solid var(--gold)">
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <div style="font-weight:800;font-size:14px">🔒 ${esc(title)}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:3px">
          Protected. Unlock with the maintenance code to make changes.</div>
      </div>
      <button class="btn btn-navy btn-sm" onclick="askIdentity(()=>render())">Unlock</button>
    </div></div>`;
}


// ══════════════════════════════════════════════════════════════════
// PLAN LOCK — Basic and Premium in one build
//
// The identity lock above protects the site's own naming, and a site may set
// its own code for it. This one sits above that: it never accepts the site's
// code, only the installer's, and it holds the installation to what was sold.
//
// The tier is stored in the config, so the same file ships everywhere and an
// upgrade is a code and a dropdown rather than a new build. The installer's
// code opens the identity lock too — one code to carry, not two.
// ══════════════════════════════════════════════════════════════════
const PLAN_TIERS={
  basic  :{label:'Basic',   bridges:1, siteEdits:3,        tieTicketName:true,
           blurb:'One weighbridge. Site name set by '+BRAND.vendorShort+', three changes, then sealed.'},
  premium:{label:'Premium', bridges:2, siteEdits:Infinity, tieTicketName:false,
           blurb:'Two weighbridges. Site name set by '+BRAND.vendorShort+', no change limit.'},
};
const PLAN={ siteName:BRAND.vendor, lockTicket:true };   // the plan's default name
const PLAN_PASS_HASH='3594c5f6af19184717b3ed5677889dc62d7314eda956dac9d5226d779912143b';
let _planOk=false;
function planTier(){ return PLAN_TIERS[cfg.planTier] ? cfg.planTier : 'basic'; }
function plan(){ return PLAN_TIERS[planTier()]; }
function planLabel(){ return plan().label; }
function planBridges(){ return plan().bridges; }
function planLocked(){ return !_planOk; }
function ticketLocked(){ return PLAN.lockTicket && planLocked(); }
function siteNameLocked(){ return planLocked(); }
function coNameLocked(){ return plan().tieTicketName ? planLocked() : identityLocked(); }
function planSiteName(){ return (cfg.planSiteName||PLAN.siteName); }
function siteEditsUsed(){ return cfg.planSiteEdits|0; }
function siteEditsLeft(){
  const cap=plan().siteEdits;
  return cap===Infinity ? Infinity : Math.max(0, cap-siteEditsUsed());
}
function siteEditsText(){
  const cap=plan().siteEdits;
  if(cap===Infinity) return 'No change limit on '+planLabel()+'.';
  const l=siteEditsLeft();
  return l ? '<b>'+l+'</b> of '+cap+' name change'+(cap===1?'':'s')+' left.'
           : '<b style="color:var(--red)">Sealed</b> \u2014 all '+cap+' changes used.';
}

/* Hold the plan. Runs on every save, so a value arriving from a disk restore,
   a cloud pull or a hand-edited localStorage goes straight back. */
function enforcePlan(){
  try{
    if(_planOk) return;
    const want=planSiteName();
    if(cfg.siteName!==want) cfg.siteName=want;
    if(plan().tieTicketName){
      // on Basic the ticket's company name is not a second name — it follows
      if(cfg.companyName!==want) cfg.companyName=want;
      if(cfg.ticket && cfg.ticket.companyName!==want) cfg.ticket.companyName=want;
    }
  }catch(e){}
}

let _planThen=null;
async function askPlan(then){
  if(_planOk){ then&&then(); return; }
  openModal('🔐 Installer Access',`
    <div style="font-size:13px;color:var(--text2);margin-bottom:12px">
      The plan, the site name and the ticket layout are set by ${esc(BRAND.vendorShort)} for
      this installation. Enter the installer code to change them for this
      session.</div>
    <div class="field"><label>Installer Code</label>
      <input id="plk-input" type="password" placeholder="••••••••" autocomplete="off"
             onkeydown="if(event.key==='Enter')doPlan()"/></div>
    <div id="plk-msg" style="font-size:11px;color:#F87171;min-height:14px;margin-top:4px"></div>
    <button class="btn btn-navy btn-full" style="margin-top:10px" onclick="doPlan()">Unlock</button>`);
  _planThen=then||null;
  setTimeout(()=>document.getElementById('plk-input')?.focus(),80);
}
async function doPlan(){
  const el=document.getElementById('plk-input');
  const msg=document.getElementById('plk-msg');
  const h=await hashStr((el?.value||'').trim());
  // Once a code of your own is set, the shipped one stops working here.
  const want=cfg.planPassHash||PLAN_PASS_HASH;
  if(h===want){
    _planOk=true; _identityOk=true;
    try{ auditLog('edit','system','','Installer access opened'); }catch(e){}
    closeModal();
    toast('Installer access open for this session','success');
    try{ if(currentTab==='settings') renderSettings(); }catch(e){}
    const f=_planThen; _planThen=null;
    if(f) f(); else render();
  }else{
    if(msg) msg.textContent='Incorrect installer code';
    if(el){ el.value=''; el.focus(); }
  }
}
/* Move a site between plans. */
function setPlanTier(t){
  if(!PLAN_TIERS[t]) return;
  const was=planLabel();
  cfg.planTier=t; saveCfg();
  try{ auditLog('edit','system','',"Plan changed from "+was+" to "+PLAN_TIERS[t].label); }catch(e){}
  // the second bridge comes and goes with the plan
  try{ if(planBridges()>1) startSim(1); }catch(e){}
  try{ renderBridgePills(); }catch(e){}
  if(planBridges()<2 && activeBridge>0) switchBridge(0);
  setHdrTag();
  toast('Plan set to '+PLAN_TIERS[t].label,'success');
  renderSettings();
}
/* Set the site name. On Basic it costs one of the three. */
function setPlanSiteName(v){
  v=(v||'').trim();
  if(!v){ toast('Site name cannot be empty','error'); return; }
  if(v===planSiteName()){ renderSettings(); return; }        // no change, no charge
  const cap=plan().siteEdits;
  if(cap!==Infinity && siteEditsLeft()<=0){
    toast('No changes left — this installation is sealed','error',4500);
    renderSettings(); return;
  }
  cfg.planSiteName=v; cfg.siteName=v;
  if(cap!==Infinity) cfg.planSiteEdits=siteEditsUsed()+1;
  if(plan().tieTicketName){
    cfg.companyName=v;
    if(cfg.ticket) cfg.ticket.companyName=v;
  }
  saveCfg();
  try{ auditLog('edit','system','','Site set to '+v); }catch(e){}
  const l=siteEditsLeft();
  toast(l===Infinity ? 'Site set to "'+v+'"'
        : l ? 'Site set to "'+v+'" — '+l+' change'+(l===1?'':'s')+' left'
            : 'Site set to "'+v+'" — that was the last change, this installation is now sealed',
        'success',5000);
  try{ applyBranding(); }catch(e){}
  renderSettings();
}
function resetSiteEdits(){
  cfg.planSiteEdits=0; saveCfg();
  try{ auditLog('edit','system','','Name change count reset'); }catch(e){}
  toast('Name changes reset','success');
  renderSettings();
}
async function setPlanCode(v){
  v=(v||'').trim();
  if(v.length<4){ toast('Use at least 4 characters','error'); return; }
  cfg.planPassHash=await hashStr(v); saveCfg();
  try{ auditLog('edit','system','','Installer code changed'); }catch(e){}
  toast('Installer code changed — the shipped code no longer works here','success',4500);
  renderSettings();
}
function setHdrTag(){
  const el=document.getElementById('hdr-tag');
  if(el) el.textContent='Weighbridge \u00b7 '+planLabel();
}
function planPanelHTML(){
  const t=planTier(), sealed=siteEditsLeft()===0;
  if(planLocked()) return `
    <div class="sg"><div class="sg-title">${esc(planLabel())} plan</div>
      <div class="card" style="border-left:4px solid var(--blue)">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div style="flex:1;min-width:220px">
            <div style="font-weight:800;font-size:14px">🔒 Set by ${esc(BRAND.vendorShort)}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px">
              ${esc(plan().blurb)} The ticket logo stays yours to change.</div>
          </div>
          <button class="btn btn-navy btn-sm" onclick="askPlan(()=>renderSettings())">Installer access</button>
        </div>
      </div>
    </div>`;
  return `
    <div class="sg"><div class="sg-title">Plan
      <span style="float:right;font-size:11px;color:#34D399">🔓 installer access open this session</span></div>
      <div class="card" style="border-left:4px solid var(--blue)">
        <div class="row2">
          <div class="field"><label>Plan</label>
            <select onchange="setPlanTier(this.value)">
              <option value="basic" ${t==='basic'?'selected':''}>Basic — one bridge, three name changes</option>
              <option value="premium" ${t==='premium'?'selected':''}>Premium — two bridges, no change limit</option>
            </select>
            <div style="font-size:11px;color:var(--text3);margin-top:3px">${esc(plan().blurb)}</div></div>
          <div class="field"><label>Site name</label>
            <input id="plan-site" value="${esc(planSiteName())}" ${sealed?'disabled':''}
              onblur="setPlanSiteName(this.value)"/>
            <div style="font-size:11px;color:var(--text3);margin-top:3px">
              ${siteEditsText()}${plan().tieTicketName?' The company name and the ticket follow it.':''}
              ${siteEditsUsed()?` <a href="#" onclick="resetSiteEdits();return false" style="color:var(--blue);font-weight:700">reset count</a>`:''}</div></div>
        </div>
        <div class="row2">
          <div class="field"><label>New installer code</label>
            <input id="plan-code" type="password" placeholder="leave blank to keep" autocomplete="off"/>
            <div style="font-size:11px;color:var(--text3);margin-top:3px">
              Setting your own retires the shipped code on this machine.
              There is no way back into it if you lose it.</div></div>
          <div class="field"><label>&nbsp;</label>
            <button class="btn btn-navy btn-sm"
              onclick="setPlanCode(document.getElementById('plan-code').value)">Change installer code</button></div>
        </div>
      </div>
    </div>`;
}

