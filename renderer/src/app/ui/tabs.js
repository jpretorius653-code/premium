// ── TABS ────────────────────────────────────────
const TABS=[
  {id:'dashboard',lbl:'<span class="ti">📊</span> Dashboard',perm:null},
  {id:'weigh',lbl:'<span class="ti">⚖</span> Weigh',perm:'weigh'},
  {id:'manual',lbl:'<span class="ti">✍</span> Manual',perm:'weigh',gated:true},
  {id:'orders',lbl:'<span class="ti">📦</span> Orders',perm:'orders'},
  {id:'fleet',lbl:'<span class="ti">🚛</span> Fleet',perm:'orders'},
  {id:'database',lbl:'<span class="ti">🗄</span> Database',perm:'database'},
  {id:'records',lbl:'<span class="ti">📋</span> Records',perm:'records'},
  {id:'reports',lbl:'<span class="ti">📧</span> Reports',perm:'reports'},
  {id:'users',lbl:'<span class="ti">👥</span> Users',perm:'master'},
  {id:'audit',lbl:'<span class="ti">📜</span> Audit',perm:'master'},
  {id:'cloud',lbl:'<span class="ti">☁</span> Cloud',perm:'master'},
  {id:'settings',lbl:'<span class="ti">⚙</span> Settings',perm:'master'},
  // perm:'master' is now interpreted through TAB_MIN_ROLE — see tabAllowed()
];
/* A tab flagged perm:'master' is gated by its TAB_MIN_ROLE entry, so
   Settings opens for Manager and up, Cloud stays Master-only. */
function tabAllowed(t){
  if(t.perm!=='master') return true;
  return roleAtLeast(TAB_MIN_ROLE[t.id]||'master');
}
function buildTabs(){
  const bar=document.getElementById('tab-bar');
  bar.innerHTML=TABS.filter(t=>tabAllowed(t)).map(t=>
    `<button class="tab${t.id===currentTab?' on':''}" onclick="renderTab('${t.id}')">${t.lbl}</button>`).join('');
}
function render(){ try{ renderTab(currentTab); }catch(e){} }
function renderTab(id){
  const t=TABS.find(x=>x.id===id);
  if(t&&!tabAllowed(t)){ if(!requireRole(TAB_MIN_ROLE[t.id]||'master')) return; }
  else if(t?.perm&&t.perm!=='master'&&!canAccess(t.perm)){toast('Access denied','error');return;}
  // Password-gated tabs (manual weigh): unless master, require the override password
  // once per entry, then proceed.
  if(t?.gated && !roleAtLeast('supervisor') && !_manualUnlocked){
    passwordGate('Manual weigh — authorise', ()=>{ _manualUnlocked=true; renderTab(id); });
    return;
  }
  currentTab=id; buildTabs();
  const el=document.getElementById('content'); el.innerHTML='';
  // Phase-2 lock. Weighing is never blocked — see licBlocks().
  if(licBlocks(id)){
    const nm=t?String(t.lbl).replace(/<[^>]*>/g,'').trim():'This section';
    el.innerHTML=licBannerHTML()+licLockedHTML(nm); return; }
  if(licPhase2Due()) el.insertAdjacentHTML('beforeend',licBannerHTML());
  ({dashboard:renderDash,weigh:renderWeigh,manual:renderManual,orders:renderOrdersTab,fleet:renderFleet,database:renderDatabase,records:renderRecords,reports:renderReports,users:renderUsers,audit:renderAudit,cloud:renderCloud,settings:renderSettings})[id]?.();
}
let _manualUnlocked=false;

