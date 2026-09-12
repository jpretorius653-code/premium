// ── Direction ─────────────────────────────────────────────
// Truck arrives loaded, leaves empty  (1st > 2nd) -> RECEIVE
// Truck arrives empty,  leaves loaded (2nd > 1st) -> DISPATCH
function txDir(t){
  if(!t) return '';
  if(t.direction==='receive'||t.direction==='dispatch') return t.direction;   // manual override
  const a=parseFloat(t.firstWeight), b=parseFloat(t.secondWeight);
  if(!isFinite(a)||!isFinite(b)||a===b) return '';
  return a>b ? 'receive' : 'dispatch';
}
function txDirLabel(t){
  const d=txDir(t);
  return d==='receive'?'RECEIVE':(d==='dispatch'?'DISPATCH':'');
}
function txDirIcon(t){
  const d=txDir(t);
  return d==='receive'?'↓ RECEIVE':(d==='dispatch'?'↑ DISPATCH':'—');
}
// Report/customer-facing wording: a truck that arrives empty and leaves loaded
// is a Dispatch; one that arrives loaded and leaves empty is a Receive.
function txDirReport(t){
  const d=txDir(t);
  return d==='dispatch'?'Dispatch':(d==='receive'?'Receive':'');
}
function txYMD(iso){ if(!iso) return ''; const d=new Date(iso); if(isNaN(d)) return ''; return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
/* Brand refresh, v9.6.8. An installed copy carries the OLD logo inside
   cfg.ticket.logo, so changing the default alone would never reach it. This
   runs once per PC and then never again. A site that deliberately uploaded
   its own logo is left alone. */
/* Brand migration. An install that last ran under another brand (a reseller
   build, or the Commodities Variation era) still carries that brand's DEFAULTS
   in its saved config: company name, ticket logo, ticket accent. Swap only
   values that are exactly a known brand default — anything a site typed in
   itself, a logo it uploaded, or a signed brand pack, is left alone. */
const KNOWN_BRAND_DEFAULTS=['Promnatic Scales','Industrial Scale Solutions','Commodities Variation',
  'Commodities Variation (Pty) Ltd','NovaSpire','NovaSpire Weighbridge'];
function brandMigrate(){
  try{
    if(cfg.brandId===BRAND.id && cfg.logoRev>=3) return;
    const foreign=v=>{ const x=String(v==null?'':v).trim(); return !x || (KNOWN_BRAND_DEFAULTS.indexOf(x)>=0 && x!==BRAND.vendor); };
    if(!(window._brand && window._brand.logo)){
      const t=cfg.ticket||(cfg.ticket={});
      if(t.logoCustom!==true) t.logo=BRAND_TICKET;
      if(foreign(t.companyName)) t.companyName=BRAND.vendor;
      if(t.accentColor==='#00A551' && BRAND.ticketAccent) t.accentColor=BRAND.ticketAccent;
      if(foreign(cfg.companyName)) cfg.companyName=BRAND.vendor;
      if(foreign(cfg.siteName)) cfg.siteName=BRAND.vendor;
      if(cfg.planSiteName && foreign(cfg.planSiteName)) cfg.planSiteName=BRAND.vendor;
    }
    cfg.brandId=BRAND.id; cfg.logoRev=3;
    saveCfg();
  }catch(e){}
}
const cvLogoMigrate=brandMigrate;   // old call sites

function saveCfg(){ try{enforcePlan();}catch(e){} P(K.cfg,cfg);}
function saveTxs(){
  P(K.txs,txs);
  if(cfg.syncFolder&&txs.length) sharePut('txs',txs[0].id,txs[0]);
}
function savePend(){
  P(K.pend,pending);
  if(cfg.syncFolder) pending.forEach(pd=>sharePut('pend',_pendKey(pd),pd));
}
function saveDB(){P(K.db,db);}
function saveOrders(){
  orders.forEach(o=>{ if(!o._at) o._at=nowISO(); });
  P(K.ord,orders);
  if(cfg.syncFolder) orders.forEach(o=>sharePut('orders',o.id,o));
}
function saveFleet(){
  fleet.forEach(f=>{ if(!f._at) f._at=nowISO(); });
  P(K.fleet,fleet);
  if(cfg.syncFolder) fleet.forEach(f=>sharePut('fleet',f.id,f));
}
// ── Order tonnage tracking ─────────────────────────
function orderLoadedKg(orderId){
  // A voided ticket never counts towards an order's target.
  return txs.filter(t=>t.orderId===orderId&&!txIsVoid(t)).reduce((s,t)=>s+(t.net||0),0);
}
function orderRemainingKg(o){
  const tk=orderTargetKg(o); if(!tk) return null;
  return Math.max(0, tk - orderLoadedKg(o.id));
}
// Deactivates an order as soon as its target tonnage is met/exceeded.
function checkOrderCompletion(orderId){
  if(!orderId) return;
  const o=orders.find(x=>x.id===orderId);
  const tk=orderTargetKg(o);
  if(!o||!tk||o.active===false) return;
  const loaded=orderLoadedKg(orderId);
  if(loaded>=tk){
    o.active=false; o.completedAt=nowISO(); o.completedKg=loaded;
    saveOrders();
    auditLog('order-complete','order',o.no,'Target '+(tk/1000).toFixed(2)+'t reached ('+(loaded/1000).toFixed(2)+'t) - order deactivated');
    toast('📦 Order '+o.no+' target reached ('+(loaded/1000).toFixed(2)+' t) — order deactivated','success',6000);
    if(currentTab==='orders') renderOrdersTab();
  }
}
function saveUsers(){
  users.forEach(u=>{ if(!u._at) u._at=nowISO(); });
  P(K.usr,users);
  if(cfg.syncFolder) users.forEach(u=>sharePut('users',_uKey(u),u));
}
function elapsed(iso){const m=Math.round((Date.now()-new Date(iso))/60000);return m<60?m+'m':Math.floor(m/60)+'h '+(m%60)+'m';}

