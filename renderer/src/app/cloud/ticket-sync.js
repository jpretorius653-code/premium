// ══════════════════════════════════════════════════════════════════════════
// TICKET PUBLISHER  —  app → cloud
//
// On a connected bridge the app writes tickets itself, which is what the
// Cloud Sync desktop app does at Hillside. Same table, same columns, so the
// dashboard needs no special case and the two can run side by side during a
// changeover.
//
// TWO KINDS OF ROW
//   status = 'open'      a truck weighed in, still on site. This is what
//                        makes "trucks on site" work at all — a completed
//                        ticket cannot tell you who is still in the yard.
//   status = 'complete'  the finished ticket. THIS is the permanent record.
//
// An open row is replaced by the complete one on the same (site, ticket) key,
// so nothing is duplicated and nothing is left hanging when a truck leaves.
//
// Ticket numbers repeat across sites, so the key is (site, ticket) — never
// ticket alone.
// ══════════════════════════════════════════════════════════════════════════
function txOrderNo(t){
  if(!t) return '';
  if(t.orderId){ const o=orders.find(x=>x.id===t.orderId); if(o&&o.no) return String(o.no); }
  return String(t.orderNoManual||'');
}
/* Trailer numbers and the seal live in the configurable custom[] array, not
   as fields on the ticket. Match the stock id first, then fall back to the
   label, so a site that rebuilt its custom fields still reports them. */
function _txCF(t,id,label){
  const list=(t&&t.custom)||[];
  let c=list.find(x=>x&&x.id===id);
  if(!c&&label) c=list.find(x=>x&&String(x.label||'').trim().toLowerCase()===label);
  return (c&&c.value!=null&&String(c.value).trim()!=='') ? String(c.value).trim() : null;
}
/* One local transaction as the cloud sees it. Every column the client's
   23-column report prints is filled here — what is not pushed cannot be
   printed, no matter what the dashboard does with it. */
function txCloudRow(t, status){
  const dir=txDir(t);
  const w1=(t.firstWeight==null)?null:Number(t.firstWeight);
  const w2=(t.secondWeight==null)?null:Number(t.secondWeight);
  // Full = the heavier weighing, Empty = the lighter, decided purely by mass.
  // Same rule as the on-site CSV, so the two reports can never disagree, and
  // it survives an operator picking the wrong direction or weighing in
  // reverse order. A truck still on the bridge has only one weight: park it
  // by direction (arrives empty on a dispatch, full on a receive) and leave
  // the other side null until weigh-out settles it.
  let empty=null, full=null;
  if(w1!=null && w2!=null){ empty=Math.min(w1,w2); full=Math.max(w1,w2); }
  else if(w1!=null){ if(dir==='receive') full=w1; else empty=w1; }
  else if(w2!=null){ if(dir==='receive') empty=w2; else full=w2; }
  return {
    site:      siteCode(),
    // No ticket number exists until weigh-out issues one, so an on-site
    // truck goes up with ticket NULL. NULLs do not collide in the
    // (site, ticket) unique index; an empty string does — every truck on
    // site would fight over the same row.
    ticket:    String(t.id||'').trim() || null,
    // row_id is the conflict key, so it must always be there.
    row_id:    t.rowId || newRowId(),
    reg:       t.vehicleReg||'',
    customer:  t.customer||'',
    product:   t.product||'',
    // 'dispatch' / 'receive'. The dashboard also accepts the older
    // Loading / Off Loading wording that Cloud Sync sends.
    action:    dir||'',
    // A voided ticket is pushed as 'void' rather than withdrawn: the cloud
    // keeps the row, the dashboard leaves it out of the client's figures.
    status:    t.voided ? 'void' : status,
    order_no:  txOrderNo(t)||null,
    transporter: t.transporter||null,
    driver:    t.driver||null,
    net:       (t.net==null)?null:Number(t.net),
    empty_weight: empty,
    full_weight:  full,
    destination:  t.destination||null,
    supplier:     t.supplier||null,
    batch_no:     t.batchNo||_txCF(t,'cfBatch','batch no')||null,
    dispatch_ticket: t.dispatchTicketNo||null,
    trailer1:  _txCF(t,'cfTrl1','trailer 1'),
    trailer2:  _txCF(t,'cfTrl2','trailer 2'),
    seal_no:   _txCF(t,'cfSeal','seal no'),
    bridge:    t.bridgeName||null,
    operator:  t.operatorName||null,
    time_in:   t.firstWeightTime||null,
    time_out:  (status==='complete') ? (t.completedAt||t.secondWeightTime||null) : null
  };
}
/* ── column guard ─────────────────────────────────────────────────────────
   A site whose Supabase has not had iss_wb_report_fields.sql run against it
   has no full_weight column, and PostgREST answers the whole batch with
   400 PGRST204 naming the column it does not know. Failing the push there
   would stop tickets reaching the cloud at all — worse than a thin report.
   So the offending column is dropped for this PC, the batch retried, and
   the Cloud tab says which columns are missing. Re-send all tickets clears
   the list, so running the SQL and pressing it back-fills everything. */
const TX_EXTRA_COLS=['full_weight','destination','supplier','batch_no',
                     'dispatch_ticket','trailer1','trailer2','seal_no',
                     'bridge','operator'];
/* Two completed tickets carrying one row_id is a data fault, not a sync
   problem: both upsert onto the same cloud row, so the later one silently
   overwrites the earlier and the client's report is permanently short by
   one load. Re-sending cannot fix it — the collision happens again every
   time.

   Ticket numbers are unique, so giving the later ticket its own row id puts
   it in its own cloud row with no (site, ticket) conflict. The EARLIER
   ticket keeps the id it already synced under, so nothing already in the
   cloud moves or is orphaned. Only completed tickets are touched: a truck
   still on site shares its row id with its own open cloud row by design,
   and that pairing must survive. */
function txRepairRowIds(){
  const owner=new Map(), fixed=[];
  txs.filter(t=>t&&t.completedAt)
     .sort((a,b)=>String(a.completedAt||'').localeCompare(String(b.completedAt||'')))
     .forEach(t=>{
       const old=t.rowId;
       if(old && !owner.has(old)){ owner.set(old, t.id||'(no ticket)'); return; }
       t.rowId=newRowId();
       t._txAt='';                       // back into the queue under its own id
       owner.set(t.rowId, t.id||'(no ticket)');
       fixed.push((t.id||'(no ticket)') + (old ? ' (shared with '+owner.get(old)+')' : ' (had none)'));
     });
  if(fixed.length){
    saveTxs();
    try{ Debug.log('Cloud: repaired '+fixed.length+' row id(s) — '+fixed.join(', ')); }catch(e){}
    try{ auditLog('edit','tx','','Repaired '+fixed.length+' duplicate cloud row id(s): '+fixed.join('; ')); }catch(e){}
  }
  return fixed;
}

/* Ticket numbers seen sharing a cloud row id. Kept so the Cloud tab can
   name them rather than leaving a silent oddity in the data. */
let _txClash=[];
try{ _txClash=JSON.parse(localStorage.getItem('iss_tx_clash')||'[]')||[]; }catch(e){ _txClash=[]; }
function _txClashSave(){ try{ localStorage.setItem('iss_tx_clash',JSON.stringify(_txClash.slice(0,40))); }catch(e){} }

/* row_id is the cloud's conflict key, and Postgres will not let one INSERT
   ... ON CONFLICT touch the same row twice: a batch holding two rows with
   one id is rejected whole, with 21000 "cannot affect row a second time".
   So a single duplicate stopped every ticket on the bridge from syncing.
   Take the first of each id and leave the rest for the next pass, where
   they are first in turn — nothing is dropped, the batch always posts, and
   two passes clear a clash instead of failing forever. */
function _txUnique(pairs){
  const seen=new Set(), take=[], defer=[];
  pairs.forEach(p=>{
    const k=p.row && p.row.row_id;
    if(!k || !seen.has(k)){ if(k) seen.add(k); take.push(p); return; }
    defer.push(p);
    const tk=String((p.row.ticket==null?'':p.row.ticket))||'(no ticket)';
    if(_txClash.indexOf(tk)<0) _txClash.push(tk);
  });
  if(defer.length){
    _txClashSave();
    try{ Debug.log('Cloud: '+defer.length+' ticket(s) share a row id — deferred to the next pass'); }catch(e){}
  }
  return {take, defer};
}

/* Tickets the cloud would not take because their number is held by another
   ticket. Shown on the Cloud tab until they go up. */
let _txRefused=[];
try{ _txRefused=JSON.parse(localStorage.getItem('iss_tx_refused')||'[]')||[]; }catch(e){ _txRefused=[]; }
function _txRefusedSave(){ try{ localStorage.setItem('iss_tx_refused',JSON.stringify(_txRefused.slice(0,200))); }catch(e){} }

let _txColsOff=[];
try{ _txColsOff=JSON.parse(localStorage.getItem('iss_tx_cols_off')||'[]')||[]; }catch(e){ _txColsOff=[]; }
function _txColsSave(){ try{ localStorage.setItem('iss_tx_cols_off',JSON.stringify(_txColsOff)); }catch(e){} }
function _txColsReset(){ _txColsOff=[]; _txColsSave(); }
async function _txPost(rows){
  if(!rows||!rows.length) return [];
  for(let attempt=0; attempt<=TX_EXTRA_COLS.length; attempt++){
    const body=_txColsOff.length
      ? rows.map(r=>{ const o=Object.assign({},r); _txColsOff.forEach(c=>{ delete o[c]; }); return o; })
      : rows;
    try{
      await _sbReq('transactions?on_conflict=row_id',{method:'POST',
        headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify(body)});
      return [];
    }catch(e){
      const m=/Could not find the '([a-z0-9_]+)' column/i.exec(String((e&&e.message)||''));
      if(m && TX_EXTRA_COLS.indexOf(m[1])>=0 && _txColsOff.indexOf(m[1])<0){
        _txColsOff.push(m[1]); _txColsSave();
        try{ Debug.log('Cloud: transactions has no '+m[1]+' column — sending without it'); }catch(_e){}
        continue;
      }
      // (site, ticket) already belongs to ANOTHER row in the cloud. This used
      // to be logged as "already on cloud" and the ticket marked as sent —
      // but it is only "already there" if it is the same truck. When two PCs
      // had issued one number to two trucks, the second truck's ticket was
      // dropped here for good and nobody was told.
      // Post one row at a time so the rest still go up, and hand back the
      // rows the cloud refused. They are NOT marked as sent: they stay in
      // the queue, and the Cloud tab names them.
      if(/23505|duplicate key/i.test(String((e&&e.message)||''))){
        const refused=[]; let sent=0;
        for(const r of body){
          try{
            await _sbReq('transactions?on_conflict=row_id',{method:'POST',
              headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
              body:JSON.stringify([r])});
            sent++;
          }catch(e2){
            if(/23505|duplicate key/i.test(String((e2&&e2.message)||''))) refused.push(r.row_id);
            else throw e2;
          }
        }
        try{ Debug.log('Cloud: '+sent+' posted, '+refused.length+' REFUSED — ticket number already used by another ticket'); }catch(_e){}
        return refused;
      }
      throw e;
    }
  }
  throw new Error('transactions rejected every retry');
}
/* Called the moment a ticket completes. The 5-minute pass is a safety net,
   not the delivery mechanism — a clerk who prints a ticket expects to see it
   on the phone before the truck is off the bridge. */
function syncTicketNow(){
  if(!syncCfg().tickets || !syncIsHost()) return;
  setTimeout(()=>{ syncPushTickets().catch(()=>{}); }, 1200);
}
async function syncPushTickets(){
  const sc=syncCfg();
  if(!sc.tickets) return 0;

  // Completed tickets not yet sent, oldest first so a long backlog lands in
  // the order it happened. Capped per pass: a bridge that was offline for a
  // week must not try to post 900 rows in one request.
  // Repair first: a clash left in place fails the same way on every pass.
  const repaired=txRepairRowIds();
  if(repaired.length) _txClash=[], _txClashSave();   // the warning no longer applies

  const doneDue = txs.filter(t=>t.completedAt && !t._txAt)
                     .sort((a,b)=>String(a.completedAt).localeCompare(String(b.completedAt)))
                     .slice(0,200);

  // Trucks still on site: first weight taken, no second. Re-sent every pass
  // (they are few, and the dashboard's on-site timer wants them current).
  // Never one whose visit already has a finished ticket: a stale on-site
  // entry shares that ticket's row id, and sending it as 'open' would pull
  // the finished ticket back out of the client's reports.
  const doneIds=new Set(txs.filter(t=>t&&t.rowId&&t.completedAt).map(t=>t.rowId));
  const openRows=(pending||[]).filter(p=>p&&p.id&&p.firstWeightTime&&!p.completedAt&&!doneIds.has(p.rowId))
                              .map(p=>({t:p, row:txCloudRow(p,'open')}));

  let n=0;
  if(openRows.length){
    // Keyed on row_id, not (site, ticket): the ticket number is only issued
    // at weigh-out, so the row that goes up as 'open' has no ticket yet and
    // must become the same row when it completes — not a second one.
    const open=_txUnique(openRows).take;
    if(open.length){ await _txPost(open.map(p=>p.row)); n+=open.length; }
  }
  for(let i=0;i<doneDue.length;i+=100){
    const batch=doneDue.slice(i,i+100);
    const take=_txUnique(batch.map(t=>({t, row:txCloudRow(t,'complete')}))).take;
    const refused=new Set(await _txPost(take.map(p=>p.row)));
    const at=nowISO();
    // Only what actually went up is marked. A deferred or refused ticket
    // keeps its empty _txAt and is picked up on the next pass.
    take.forEach(p=>{
      const tk=String(p.row.ticket==null?'':p.row.ticket)||'(no ticket)';
      if(refused.has(p.row.row_id)){ if(_txRefused.indexOf(tk)<0) _txRefused.push(tk); return; }
      p.t._txAt=at; n++;
      const i=_txRefused.indexOf(tk); if(i>=0) _txRefused.splice(i,1);
    });
    _txRefusedSave();
  }
  if(doneDue.length) saveTxs();
  return n;
}

let _syncBusy=false;
async function syncRun(manual){
  if(_syncBusy) return;
  if(!manual){
    if(!syncCfg().on || !syncIsHost()) return;      // only the host PC, only when on
    if(!cloudUrl()||!cloudCfg().key||!cloudCfg().email) return;
  }
  _syncBusy=true;
  if(manual) renderCloud();
  try{
    // Pull first: the cloud is where the client's additions live, and pushing
    // first would send a stale local copy over a newer remote row.
    const f=await syncPullFleet();
    const o=await syncPullOrders();
    const pf=await syncPushFleet();
    const po=await syncPushOrders();
    const pt=await syncPushTickets();
    const bits=[];
    if(f.added||f.updated||f.removed) bits.push(`fleet in ${f.added}+/${f.updated}~/${f.removed}-`);
    if(o.added||o.updated||o.removed) bits.push(`orders in ${o.added}+/${o.updated}~/${o.removed}-`);
    if(pf) bits.push(pf+' trucks up');
    if(po) bits.push(po+' orders up');
    if(pt) bits.push(pt+' tickets up');
    syncSet('lastAt',nowISO());
    syncSet('lastMsg', bits.length?bits.join(' · '):'up to date');
    if(f.added||f.updated||f.removed||o.added||o.updated||o.removed){
      if(currentTab==='fleet') renderFleet();
      if(currentTab==='orders') renderOrdersTab();
    }
    if(manual) toast('Sync complete — '+(bits.join(' · ')||'nothing to do'),'success',5000);
  }catch(e){
    const m=String(e.message||e);
    syncSet('lastAt',nowISO());
    syncSet('lastMsg','failed — '+m.slice(0,120));
    if(/403/.test(m))      syncSet('lastMsg','failed — this login may read but not write. Run 06_fleet_orders_remote_write.sql');
    else if(/42883|does not exist|404/.test(m)) syncSet('lastMsg','failed — the tables or RPCs are missing. Run 05_orders_fleet.sql then 06_fleet_orders_remote_write.sql');
    if(manual) toast('Sync failed: '+m.slice(0,90),'error',7000);
  }
  _syncBusy=false;
  if(currentTab==='cloud') renderCloud();
}
function syncStart(){
  if(_syncTimer) clearInterval(_syncTimer);
  const mins=Math.max(1,Math.min(120,parseInt(syncCfg().everyMin)||5));
  _syncTimer=setInterval(()=>{ syncRun(false); }, mins*60*1000);
  setTimeout(()=>syncRun(false), 20000);          // one pass shortly after boot
}
let _syncTimer=null;
