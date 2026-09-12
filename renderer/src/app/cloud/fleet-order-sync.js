// ══════════════════════════════════════════════════════════════════════════
// FLEET + ORDER CLOUD SYNC
//
// WHERE THIS RUNS: on ONE weighbridge PC, ticked as the sync host in the
// Cloud tab. Not on the dashboard, not on a server, not on both bridges.
//
// Why one PC: two bridges sharing a folder both hold the same fleet list.
// If both pulled and pushed, each would keep re-writing the other's rows
// through the share and the folder would never go quiet — the same fight
// that produced Syncthing conflict files before _pushIfChanged. So one PC
// talks to Supabase; the share carries it to the other bridge, exactly as
// it already carries tickets.
//
// Direction: two-way. The client adds trucks on their phone; the clerk adds
// them at the bridge. Last write wins on updated_at, and a removal travels
// as deleted=true rather than a row that silently vanishes.
//
// Needs 06_fleet_orders_remote_write.sql. Without it a site login can read
// this table but not write, and the push half returns 403.
// ══════════════════════════════════════════════════════════════════════════
function syncCfg(){
  const c=cloudCfg();
  if(!c.sync) c.sync={on:false,host:'',everyMin:5,fleetCursor:'',orderCursor:'',lastAt:'',lastMsg:''};
  return c.sync;
}
function syncSet(k,v){ syncCfg()[k]=v; saveCfg(); }
/* A stable-ish id for this PC, so "the sync host" survives a restart. */
function syncThisPC(){
  let id=cfg.deviceId;
  if(!id){ id='pc'+Math.random().toString(36).slice(2,10); cfg.deviceId=id; saveCfg(); }
  return id;
}
function syncIsHost(){ return syncCfg().host===syncThisPC(); }
function syncClaimHost(on){
  syncSet('host', on?syncThisPC():'');
  if(on) syncSet('on',true);
  renderCloud();
}

/* PostgREST helpers that reuse the Cloud tab's sign-in. */
async function _sbAuthed(){
  const c=cloudCfg();
  if(!cloudUrl()||!c.key) throw new Error('Cloud is not configured');
  if(!_cloudTok || _cloudTok===c.key) await cloudSignIn(c.email,c.pass);
  return c;
}
async function _sbReq(path, opts){
  const c=await _sbAuthed();
  const go=async()=>fetch(cloudUrl()+'/rest/v1/'+path, Object.assign({},opts,{
    headers:Object.assign({apikey:c.key,'Authorization':'Bearer '+_cloudTok,
      'Content-Type':'application/json'}, (opts&&opts.headers)||{})}));
  let r=await go();
  if(r.status===401){                       // token aged out mid-shift — sign in again
    await cloudSignIn(c.email,c.pass);
    r=await go();
  }
  if(!r.ok){ let d=''; try{ d=(await r.text()).slice(0,200); }catch(e){}
             throw new Error(r.status+(d?': '+d:'')); }
  const txt=await r.text();
  return txt?JSON.parse(txt):null;
}

const _regKey=r=>String(r||'').trim().toUpperCase().replace(/\s+/g,'');

/* ── PULL ────────────────────────────────────────────────────────────────
   Ask only for what changed since last time. The cursor is the newest
   updated_at already stored, so a bridge that was off for a week catches
   up in one call instead of re-reading the whole list every 5 minutes. */
async function syncPullFleet(){
  const site=siteCode();
  const rows=await _sbReq('rpc/iss_fleet_since',{method:'POST',
    body:JSON.stringify({p_site:site,p_since:syncCfg().fleetCursor||null})});
  if(!Array.isArray(rows)||!rows.length) return {added:0,updated:0,removed:0};
  let added=0,updated=0,removed=0,cursor=syncCfg().fleetCursor||'';
  rows.forEach(r=>{
    if(r.updated_at>cursor) cursor=r.updated_at;
    const key=_regKey(r.reg);
    let i=fleet.findIndex(f=>f._cid===r.id);
    if(i<0) i=fleet.findIndex(f=>_regKey(f.reg)===key);
    if(r.deleted){
      if(i>=0){ fleet.splice(i,1); removed++; }
      return;
    }
    const rec={reg:String(r.reg||'').trim(), trailer1:r.trailer1||'', trailer2:r.trailer2||'',
               driver:r.driver||'', transporter:r.transporter||'',
               tare:(r.tare===null||r.tare===undefined)?'':Number(r.tare)};
    if(i>=0){
      const f=fleet[i];
      // Last write wins. A local edit made AFTER the cloud row was written
      // is not thrown away by a stale pull.
      if(f._at && r.updated_at && new Date(f._at) > new Date(r.updated_at)){ f._cid=r.id; return; }
      let ch=false;
      Object.keys(rec).forEach(k=>{ if(String(f[k]||'')!==String(rec[k]||'')){ f[k]=rec[k]; ch=true; } });
      f._cid=r.id; f._cat=r.updated_at;
      if(ch){ f._at=r.updated_at; updated++; }
    }else{
      fleet.push(Object.assign({id:r.local_id||('fl'+Date.now().toString(36)+Math.random().toString(36).slice(2,5)),
        _cid:r.id,_cat:r.updated_at,_at:r.updated_at}, rec));
      added++;
    }
  });
  syncSet('fleetCursor',cursor);
  if(added||updated||removed) saveFleet();
  return {added,updated,removed};
}
async function syncPullOrders(){
  const site=siteCode();
  const rows=await _sbReq('rpc/iss_orders_since',{method:'POST',
    body:JSON.stringify({p_site:site,p_since:syncCfg().orderCursor||null})});
  if(!Array.isArray(rows)||!rows.length) return {added:0,updated:0,removed:0};
  let added=0,updated=0,removed=0,cursor=syncCfg().orderCursor||'';
  rows.forEach(r=>{
    if(r.updated_at>cursor) cursor=r.updated_at;
    let i=orders.findIndex(o=>o._cid===r.id);
    if(i<0) i=orders.findIndex(o=>ordKey(o.no)===ordKey(r.order_no));
    if(r.deleted){ if(i>=0){ orders.splice(i,1); removed++; } return; }
    const rec={no:r.order_no, customer:r.customer||'', product:r.product||'',
               supplier:r.supplier||'', destination:r.destination||'',
               transporter:r.transporter||'',
               targetKg:Number(r.tons_target)>0?Math.round(Number(r.tons_target)*1000):null,
               fleet:Array.isArray(r.fleet_regs)?r.fleet_regs:[]};
    if(i>=0){
      const o=orders[i];
      if(o._at && r.updated_at && new Date(o._at) > new Date(r.updated_at)){ o._cid=r.id; return; }
      // loadedKg is the site's own tally and is never overwritten from the office
      Object.keys(rec).forEach(k=>{ o[k]=rec[k]; });
      o.active=r.active!==false; o._cid=r.id; o._cat=r.updated_at; o._at=r.updated_at;
      updated++;
    }else{
      orders.unshift(Object.assign({id:r.local_id||('O'+Date.now()+Math.floor(Math.random()*99)),
        created:r.created_at||nowISO(),_cid:r.id,_cat:r.updated_at,_at:r.updated_at,
        rate:null,active:r.active!==false}, rec));
      added++;
    }
  });
  syncSet('orderCursor',cursor);
  if(added||updated||removed) saveOrders();
  return {added,updated,removed};
}

/* ── PUSH ────────────────────────────────────────────────────────────────
   Only records changed since they were last sent. Upsert on (site, reg) so
   a truck the clerk added and the client also added becomes one row. */
async function syncPushFleet(){
  const site=siteCode();
  const due=fleet.filter(f=>f.reg && (!f._cat || (f._at && new Date(f._at)>new Date(f._cat))));
  if(!due.length) return 0;
  const body=due.map(f=>({site, reg:String(f.reg).trim(), local_id:f.id,
    trailer1:f.trailer1||null, trailer2:f.trailer2||null, driver:f.driver||null,
    transporter:f.transporter||null,
    tare:(f.tare===''||f.tare==null)?null:Number(f.tare), active:true, deleted:false}));
  for(let i=0;i<body.length;i+=100){
    await _sbReq('fleet?on_conflict=site,reg',{method:'POST',
      headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(body.slice(i,i+100))});
  }
  const at=nowISO();
  due.forEach(f=>{ f._cat=at; });
  saveFleet();
  return due.length;
}
async function syncPushOrders(){
  const site=siteCode();
  const due=orders.filter(o=>o.no && (!o._cat || (o._at && new Date(o._at)>new Date(o._cat))));
  if(!due.length) return 0;
  const body=due.map(o=>({site, order_no:String(o.no), local_id:o.id,
    customer:o.customer||null, product:o.product||null, supplier:o.supplier||null,
    destination:o.destination||null, transporter:o.transporter||null,
    tons_target:orderTargetKg(o)?orderTargetKg(o)/1000:null,
    fleet_regs:Array.isArray(o.fleet)&&o.fleet.length?o.fleet:null,
    active:o.active!==false, deleted:false}));
  for(let i=0;i<body.length;i+=100){
    await _sbReq('orders?on_conflict=site,order_no',{method:'POST',
      headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(body.slice(i,i+100))});
  }
  const at=nowISO();
  due.forEach(o=>{ o._cat=at; });
  saveOrders();
  return due.length;
}

