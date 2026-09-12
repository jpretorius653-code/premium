/* ══════════════════════════════════════════════════════════════════════
   ROLE TIERS
     clerk      — day-to-day capture; individual permissions still apply
     supervisor — everything EXCEPT Settings and Cloud
     manager    — everything EXCEPT Cloud
     master     — full access, and the only role that can manage users
   Ranked, so a check is "at least this tier" rather than a list of ids.
   Tab-level minimums live in TAB_MIN_ROLE below.
   ══════════════════════════════════════════════════════════════════════ */
const ROLES=[
  {id:'clerk',      l:'Clerk',      rank:1, desc:'Weighing and daily capture (per-permission)'},
  {id:'supervisor', l:'Supervisor', rank:2, desc:'Everything except Settings and Cloud'},
  {id:'manager',    l:'Manager',    rank:3, desc:'Everything except Cloud'},
  {id:'master',     l:'Master',     rank:4, desc:'Full access, including Users and Cloud'}
];
const TAB_MIN_ROLE={ users:'master', audit:'supervisor', cloud:'master', settings:'manager' };
function roleDef(id){ return ROLES.find(r=>r.id===id)||ROLES[0]; }
function roleRank(id){ return roleDef(id).rank; }
function roleLabel(id){ return roleDef(id).l; }
/* True when the signed-in user is at or above the given tier. */
function roleAtLeast(minId){ return roleRank(session&&session.role) >= roleRank(minId); }

function canAccess(perm){
  if(!session)return false;
  if(roleAtLeast('supervisor'))return true;   // supervisor and up: all feature tabs
  return session.perms&&session.perms[perm];
}
function requireMaster(){ return requireRole('master'); }
/* Master password still unlocks anything — it is the on-site override when
   the responsible person is not logged in. */
function requireRole(minId){
  if(roleAtLeast(minId))return true;
  const need=roleLabel(minId);
  openModal('Access Denied',`<div style="text-align:center;padding:20px">
    <div style="font-size:40px">🔒</div>
    <p style="margin-top:12px;color:var(--text2)">This section needs <b>${need}</b> access or higher.<br><span style="font-size:12px">Signed in as ${roleLabel(session&&session.role)}.</span></p>
    <div class="field" style="margin-top:16px"><label>Master Password</label>
      <input id="mp-in" type="password" placeholder="Enter master password" onkeydown="if(event.key==='Enter')checkMasterPw()"/>
    </div>
    <button class="btn btn-navy btn-full" onclick="checkMasterPw()">Unlock</button>
  </div>`);
  return false;
}
async function checkMasterPw(){
  const v=document.getElementById('mp-in')?.value;
  let ok=false;
  if(cfg.masterPassHash) ok=await verifyHash(v,cfg.masterPassHash);
  else if(cfg.masterPass){ ok=(v===cfg.masterPass); if(ok){cfg.masterPassHash=await hashStr(v);delete cfg.masterPass;saveCfg();} }
  if(ok){
    session={...session,role:'master'};
    auditLog('access','settings','','Master access granted to '+session.name);
    closeModal();
    renderTab(currentTab);
    toast('Master access granted','success');
  }else toast('Wrong password','error');
}

// ── Reusable password gate ────────────────────────────────────────────────
// Verifies the master PIN OR master password, then runs onOk(). Used to unlock
// editing of a transaction after the first weight, and the manual-weigh tab.
// Falls back to the master user's PIN when no separate master password is set.
async function verifyMasterSecret(v){
  if(!v) return false;
  // Dedicated override PIN (for supervisors) — separate from master login.
  if(cfg.overridePassHash && await verifyHash(v,cfg.overridePassHash)) return true;
  // Master password / master user's PIN always work too.
  if(cfg.masterPassHash && await verifyHash(v,cfg.masterPassHash)) return true;
  if(cfg.masterPass && v===cfg.masterPass) return true;
  const m=(users||[]).find(u=>u.role==='master'&&u.active!==false);
  if(m && m.pinHash && await verifyHash(v,m.pinHash)) return true;
  return false;
}
function passwordGate(title,onOk){
  openModal('🔒 '+title,`<div style="padding:6px">
    <p style="color:var(--text2);font-size:13px;margin-bottom:12px">Enter the override PIN (or master password) to continue.</p>
    <div class="field"><input id="pg-in" type="password" placeholder="Override PIN or master password" autocomplete="off" onkeydown="if(event.key==='Enter')pgSubmit()"/></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-navy" style="flex:1" onclick="pgSubmit()">Unlock</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div></div>`);
  window._pgOnOk=onOk;
  setTimeout(()=>document.getElementById('pg-in')?.focus(),60);
}
async function pgSubmit(){
  const v=document.getElementById('pg-in')?.value||'';
  if(await verifyMasterSecret(v)){
    const fn=window._pgOnOk; window._pgOnOk=null; closeModal();
    auditLog('access','override','','Edit/manual override authorised by '+(session?.name||'?'));
    if(typeof fn==='function') fn();
  }else toast('Wrong password / PIN','error');
}
// Are the post-first-weight fields currently unlocked for editing?
let _editUnlocked=false;
function unlockNetEdit(){
  passwordGate('Unlock load details', ()=>{ _editUnlocked=true; showNetModal(); });
}

