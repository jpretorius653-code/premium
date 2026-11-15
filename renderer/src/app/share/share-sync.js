// ══════════════════════════════════════════════════════════
// SHARED DATABASE — one folder, both weighbridges.
//
// RULES (never broken):
//  • Sync only ADDS. It never deletes a record.
//  • A record disappears only when a dashboard explicitly deletes it,
//    which writes a tombstone {_deleted:true} that the other side honours.
//  • If either PC ever comes up empty, the share rebuilds it completely.
//  • Both PCs write their own copy of every record, so either folder alone
//    is a complete database.
// ══════════════════════════════════════════════════════════
let _shareOK=false, _shareBusy=false;
const _pendKey=p=>String(p.vehicleReg||'')+'@'+String(p.bridge==null?0:p.bridge);
const _uKey=u=>String(u.id||u.name||'');

/* A write to the share can fail — the folder is on another PC, and that PC
   can be off, rebooting or unplugged. The old code ignored the result, so a
   "truck has left" tombstone that failed once was never written and the other
   PC kept the truck on site for good; an operator then weighed it out a second
   time. Every write now reports whether it landed, and a tombstone that did
   not is queued (it survives a restart) and retried on every sync pass. */
let _shareRetry=[];
try{ _shareRetry=G('iss_share_retry',[])||[]; }catch(e){ _shareRetry=[]; }
function _shareRetrySave(){ try{ P('iss_share_retry',_shareRetry.slice(-500)); }catch(e){} }
async function _shareWrite(kind,id,obj){
  try{ const r=await window.issDesktop.sharedPut(kind,id,obj); return !!(r&&r.ok); }catch(e){ return false; }
}
async function sharePut(kind,id,obj){
  if(!window.issDesktop||!window.issDesktop.sharedPut||!cfg.syncFolder) return false;
  return await _shareWrite(kind,id,obj);
}
// Explicit delete from a dashboard -> tombstone the other side will honour
async function shareDel(kind,id,when){
  if(!window.issDesktop||!window.issDesktop.sharedPut||!cfg.syncFolder) return false;
  const at=when||nowISO();
  const ok=await _shareWrite(kind,id,{id,_deleted:true,_at:at});
  if(!ok && !_shareRetry.some(r=>r.kind===kind&&r.id===id)){ _shareRetry.push({kind,id,at}); _shareRetrySave(); }
  return ok;
}
async function shareFlushRetry(){
  if(!_shareRetry.length) return;
  const keep=[];
  for(const r of _shareRetry){
    // the truck is legitimately back on site under the same key: the old
    // tombstone must not remove the new visit
    if(r.kind==='pend' && pending.some(p=>_pendKey(p)===r.id && String(p.firstWeightTime||'')>String(r.at||''))) continue;
    if(!(await _shareWrite(r.kind,r.id,{id:r.id,_deleted:true,_at:r.at}))) keep.push(r);
  }
  if(keep.length!==_shareRetry.length){ _shareRetry=keep; _shareRetrySave(); }
}
/* One pull, right now, without colliding with the background pass. Used just
   before a weigh-out so this PC knows what the other one finished. */
async function sharePullNow(){
  if(!cfg.syncFolder||!window.issDesktop||_shareBusy) return 0;
  _shareBusy=true;
  let n=0;
  try{ n=await sharePull(); }catch(e){}
  _shareBusy=false;
  return n;
}
/* A finished ticket is the proof the truck has left. Any on-site entry that
   carries the same row id is stale, whatever happened to its tombstone. */
function prunePendingDone(){
  const done=new Map(txs.filter(t=>t&&t.rowId&&t.completedAt).map(t=>[t.rowId,t.completedAt]));
  const gone=pending.filter(p=>p&&p.rowId&&done.has(p.rowId));
  if(!gone.length) return 0;
  pending=pending.filter(p=>gone.indexOf(p)<0);
  // tell the share too, dated at the weigh-out so a later visit by the same
  // truck is not caught by it
  gone.forEach(p=>{ shareDel('pend',_pendKey(p),done.get(p.rowId)); });
  return gone.length;
}
async function shareList(kind){
  if(!window.issDesktop||!window.issDesktop.sharedList||!cfg.syncFolder) return [];
  try{ const r=await window.issDesktop.sharedList(kind); return (r&&r.items)||[]; }catch(e){ return []; }
}

// Push everything this PC knows to the share.
// Cache of what we last wrote to the share, keyed by "kind/id" -> content string.
// Without this, sharePushAll rewrote EVERY record every 10 seconds on BOTH PCs,
// so Syncthing saw both sides modifying the same files and produced a
// .sync-conflict copy for every ticket. Now an unchanged record is never
// rewritten, so the folder goes quiet once both PCs agree.
const _pushCache=new Map();
async function _pushIfChanged(kind,id,obj){
  if(id===undefined||id===null||id==='') return;
  const key=kind+'/'+id;
  let body;
  try{ body=JSON.stringify(obj); }catch(e){ return; }
  if(_pushCache.get(key)===body) return;      // unchanged — do not touch the file
  // only remember it as written if it WAS written — a failed write is retried
  // on the next pass instead of being forgotten
  if(await sharePut(kind,id,obj)) _pushCache.set(key,body);
}
async function sharePushAll(){
  if(!cfg.syncFolder||!window.issDesktop) return;
  for(const t of txs)      await _pushIfChanged('txs',    t.id, t);
  for(const pd of pending) await _pushIfChanged('pend',   _pendKey(pd), pd);
  for(const o of orders)   await _pushIfChanged('orders', o.id, o);
  for(const fv of fleet)   await _pushIfChanged('fleet',  fv.id, fv);
  for(const u of users)    await _pushIfChanged('users',  _uKey(u), u);
  try{
    // Only (re)write the shared fields doc when the definitions actually
    // changed. Previously this ran every push with a fresh _at timestamp, so
    // two PCs endlessly leapfrogged each other's timestamp — each pull saw a
    // "newer" fields doc, overwrote cfg.customFields, and re-rendered the Weigh
    // screen mid-typing (clearing the boxes). We keep a stable signature of the
    // last-written definitions and skip the write when nothing changed.
    const sig=JSON.stringify(cfg.customFields||[]);
    if(sig!==_fieldsPushedSig){
      const at=cfg._fieldsAt||nowISO();
      await window.issDesktop.sharedPutDoc('fields',{customFields:cfg.customFields||[], _at:at});
      _fieldsPushedSig=sig;
    }
  }catch(e){}
  // ── ticket numbering: share prefix/padding + the counter. Both PCs write the
  //    SAME doc, so before pushing we check whether the share already holds a
  //    NEWER deliberate reset. If it does we adopt it instead of overwriting —
  //    otherwise a PC with a stale high counter would clobber the reset and
  //    drag the other PC back up.
  try{
    let shared=null;
    try{ shared=await window.issDesktop.sharedDoc('ticketcfg'); }catch(e){}
    const myReset=cfg._seqResetAt||'';
    const theirReset=(shared&&shared.resetAt)||'';
    if(ticketStation()){
      // This PC has its own series. Its counter is private: publish the
      // prefix and padding only, and never take a number from the share.
      const tk={prefix:(cfg.ticketPrefix!==undefined?cfg.ticketPrefix:'WB'),
                pad:Math.max(1,Math.min(8,parseInt(cfg.ticketPad)||3)),
                seq:(shared&&parseInt(shared.seq))||0, resetAt:theirReset, _at:(cfg._ticketAt||nowISO())};
      const sig=JSON.stringify([tk.prefix,tk.pad,'station']);
      if(sig!==_ticketPushedSig && (!shared || shared.prefix!==tk.prefix || shared.pad!==tk.pad)){
        await window.issDesktop.sharedPutDoc('ticketcfg',tk);
      }
      _ticketPushedSig=sig;
    } else if(theirReset && (!myReset || new Date(theirReset)>new Date(myReset))){
      // The share has a newer reset than us — take it, don't push over it.
      const theirs=parseInt(shared.seq)||0;
      if(theirs!==(parseInt(G(K.seq,0))||0)) P(K.seq,theirs);
      cfg._seqResetAt=theirReset; saveCfg();
      _ticketPushedSig=null;
      if(window._dbg) window._dbg('ticket: adopted reset from share → next '+fmtTicketNo(theirs+1),'#93C5FD');
    } else {
      const seq=parseInt(G(K.seq,0))||0;
      const tk={prefix:(cfg.ticketPrefix!==undefined?cfg.ticketPrefix:'WB'),
                pad:Math.max(1,Math.min(8,parseInt(cfg.ticketPad)||3)),
                seq, resetAt:myReset, _at:(cfg._ticketAt||nowISO())};
      const sig=JSON.stringify([tk.prefix,tk.pad,tk.seq,tk.resetAt]);
      if(sig!==_ticketPushedSig){
        await window.issDesktop.sharedPutDoc('ticketcfg',tk);
        _ticketPushedSig=sig;
      }
    }
  }catch(e){}
}
let _fieldsPushedSig=null;
let _ticketPushedSig=null;

// Pull the share and merge in. Additive only.
async function sharePull(){
  if(!cfg.syncFolder||!window.issDesktop) return 0;
  let changed=0;
  const _brk={txs:0,pend:0,orders:0,users:0,fleet:0,fields:0,ticket:0};

  // ── transactions: add anything we don't have; honour tombstones ──
  const rTx=await shareList('txs');
  if(rTx.length){
    const have=new Map(txs.map(t=>[String(t.id),t]));
    const dead=new Set(rTx.filter(t=>t._deleted).map(t=>String(t.id)));
    // Fingerprints of clashes we've ALREADY reconciled, so we never re-number
    // the same incoming record twice (that caused an endless-renumber loop).
    const reconciled=new Set(G('iss8_reconciled',[])||[]);
    const fp=t=>[t.vehicleReg,t.firstWeightTime,t.firstWeight,t.secondWeight].join('|');
    // Also treat a record we already hold (by fingerprint) as "have it", even if
    // its id differs — prevents re-importing an already-reconciled clash.
    const haveFP=new Set(txs.map(fp));
    let collisions=0, newReconciled=false;
    rTx.forEach(t=>{
      if(t._deleted||!t.id) return;
      const id=String(t.id);
      const f=fp(t);
      // A ticket corrected or voided on the other PC carries a higher edit
      // version. It is the SAME ticket — take it in place rather than letting
      // the clash rule re-number it into a second copy.
      // It must BE the same ticket, though. Two PCs that issued one number to
      // two different trucks also arrive here, and taking the other PC's copy
      // "in place" deleted this PC's ticket. Same row id, or failing that the
      // same weigh-in, is what makes it the same ticket.
      const held=have.get(id);
      const sameRec = held && ((held.rowId && t.rowId) ? held.rowId===t.rowId
                               : String(held.firstWeightTime||'')===String(t.firstWeightTime||''));
      if(held && sameRec && (Number(t._ev)||0) > (Number(held._ev)||0)){
        Object.keys(held).forEach(k=>{ if(!(k in t)) delete held[k]; });
        Object.assign(held,t); changed++; return;
      }
      if(reconciled.has(f)) return;        // already handled this exact record — skip
      if(haveFP.has(f)) return;            // we already hold this transaction (any id) — skip
      const mine=have.get(id);
      if(!mine){ txs.push(t); have.set(id,t); haveFP.add(f); changed++; return; }
      if(_sameTx(mine,t)){ haveFP.add(f); return; }  // same record — nothing to do
      // Genuine clash: keep BOTH. Re-number the incoming one ONCE, remember its
      // fingerprint so it's never re-processed, and do NOT push it back to the
      // share (pushing re-created the clash and looped).
      const newId=_nextFreeTicket(have);
      const moved={...t, id:newId, _collisionFrom:id, notes:((t.notes?t.notes+' · ':'')+'Auto-renumbered from '+id+' (ticket clash on sync)')};
      txs.push(moved); have.set(newId,moved); haveFP.add(f);
      reconciled.add(f); newReconciled=true;
      changed++; collisions++;
      auditLog('sync','tx',newId,'Ticket clash: incoming '+id+' re-numbered to '+newId+' (kept alongside '+mine.vehicleReg+')');
    });
    if(newReconciled){ try{ P('iss8_reconciled', [...reconciled].slice(-500)); }catch(e){} }
    if(dead.size){ const b=txs.length; txs=txs.filter(t=>!dead.has(String(t.id))); changed+=b-txs.length; }
    if(changed){ txs.sort((a,b)=>new Date(b.completedAt)-new Date(a.completedAt)); saveTxs(); }
    _brk.txs=changed;
    if(collisions){
      toast('⚠ '+collisions+' ticket-number clash'+(collisions>1?'es':'')+' reconciled — nothing lost. Check Records.','info',7000);
      if(window._dbg) window._dbg('TICKET CLASH x'+collisions+' reconciled (one-time)','#FBBF24');
    }
  }

  // ── trucks on site: union, tombstones remove ──
  const rPd=await shareList('pend');
  if(rPd.length){
    const have=new Map(pending.map(p=>[_pendKey(p),p]));
    // a tombstone only removes a visit that started before it was written —
    // the same truck coming back in must not be wiped by yesterday's tombstone
    const dead=new Map(rPd.filter(x=>x._deleted).map(x=>[String(x.id),String(x._at||'')]));
    const doneIds=new Set(txs.filter(t=>t&&t.rowId&&t.completedAt).map(t=>t.rowId));
    let c=0;
    rPd.forEach(x=>{
      if(x._deleted || !x.vehicleReg) return;
      if(x.rowId && doneIds.has(x.rowId)) return;          // already weighed out — stale file
      const k=_pendKey(x), mine=have.get(k);
      if(!mine){ pending.push(x); have.set(k,x); c++; return; }
      // same truck, a different visit: the later weigh-in is the live one
      if(mine.rowId && x.rowId && mine.rowId!==x.rowId
         && String(x.firstWeightTime||'')>String(mine.firstWeightTime||'')){
        pending[pending.indexOf(mine)]=x; have.set(k,x); c++;
      }
    });
    const b=pending.length;
    pending=pending.filter(x=>{
      const k=_pendKey(x);
      if(!dead.has(k)) return true;
      const at=dead.get(k);
      return !!(at && String(x.firstWeightTime||'')>at);   // weighed in after the tombstone: keep
    });
    c+=b-pending.length;
    if(c){ savePend(); changed+=c; _brk.pend=c; }
  }
  // whatever the tombstones say, a finished ticket ends the visit
  { const n=prunePendingDone(); if(n){ P(K.pend,pending); changed+=n; _brk.pend=(_brk.pend||0)+n; } }

  // ── allocations / orders: newest wins, tombstones remove ──
  const rOr=await shareList('orders');
  if(rOr.length){
    let c=0;
    rOr.forEach(o=>{
      if(!o.id) return;
      const i=orders.findIndex(x=>String(x.id)===String(o.id));
      if(o._deleted){ if(i>=0){ orders.splice(i,1); c++; } return; }
      if(i<0){ orders.push(o); c++; }
      else if(o._at && (!orders[i]._at || new Date(o._at)>new Date(orders[i]._at))){
        // Only apply if the record content actually differs — otherwise a
        // newer-but-identical timestamp causes an endless pull/push loop.
        if(_recDiff(orders[i],o)){ orders[i]=o; c++; }
        else { orders[i]._at=o._at; }   // adopt timestamp silently, no churn
      }
    });
    if(c){ saveOrders(); changed+=c; _brk.orders=c; }
  }

  // ── users: newest wins, tombstones remove ──
  const rUs=await shareList('users');
  if(rUs.length){
    let c=0;
    rUs.forEach(u=>{
      const k=String(u.id||u.name||'');
      if(!k) return;
      const i=users.findIndex(x=>_uKey(x)===k);
      if(u._deleted){ if(i>=0){ users.splice(i,1); c++; } return; }
      if(i<0){ users.push(u); c++; }
      else if(u._at && (!users[i]._at || new Date(u._at)>new Date(users[i]._at))){
        if(_recDiff(users[i],u)){ users[i]=u; c++; }
        else { users[i]._at=u._at; }
      }
    });
    if(c){ saveUsers(); changed+=c; _brk.users=c; }
  }

  // ── fleet list: newest wins, tombstones remove ──
  const rFl=await shareList('fleet');
  if(rFl.length){
    let c=0;
    rFl.forEach(fv=>{
      if(!fv.id) return;
      const i=fleet.findIndex(x=>String(x.id)===String(fv.id));
      if(fv._deleted){ if(i>=0){ fleet.splice(i,1); c++; } return; }
      if(i<0){ fleet.push(fv); c++; }
      else if(fv._at && (!fleet[i]._at || new Date(fv._at)>new Date(fleet[i]._at))){
        if(_recDiff(fleet[i],fv)){ fleet[i]=fv; c++; }
        else { fleet[i]._at=fv._at; }
      }
    });
    if(c){ P(K.fleet,fleet); changed+=c; _brk.fleet=c; }
  }

  // ── custom fields: newest definition wins ──
  try{
    const doc=await window.issDesktop.sharedDoc('fields');
    if(doc&&doc.customFields){
      const mine=JSON.stringify(cfg.customFields||[]);
      if(JSON.stringify(doc.customFields)!==mine &&
         (!cfg._fieldsAt || (doc._at && new Date(doc._at)>new Date(cfg._fieldsAt)))){
        cfg.customFields=doc.customFields; cfg._fieldsAt=doc._at; saveCfg(); changed++; _brk.fields=1;
      }
    }
  }catch(e){}

  // ── ticket numbering: adopt newest prefix/padding, and pull the sequence
  //    counter FORWARD to the highest number either PC has issued. Never moves
  //    backward, so tickets stay unique and monotonic across both machines.
  try{
    const tk=await window.issDesktop.sharedDoc('ticketcfg');
    if(tk){
      // prefix / padding: newest definition wins
      if(tk._at && (!cfg._ticketAt || new Date(tk._at)>new Date(cfg._ticketAt))){
        const np=String(tk.prefix!=null?tk.prefix:'WB');
        const nd=Math.max(1,Math.min(8,parseInt(tk.pad)||3));
        if(np!==cfg.ticketPrefix || nd!==(parseInt(cfg.ticketPad)||3)){
          cfg.ticketPrefix=np; cfg.ticketPad=nd; changed++;
        }
        cfg._ticketAt=tk._at; saveCfg();
      }
      // Sequence: normally a high-water mark (only ever forward, so numbers are
      // never reused). BUT if the other PC deliberately RESET the counter (via
      // Settings → next ticket number), adopt that exact value even if it's
      // lower — otherwise an inflated counter could never be corrected.
      const theirs=parseInt(tk.seq)||0;
      const mine=parseInt(G(K.seq,0))||0;
      const theirReset=tk.resetAt||'';
      const myReset=cfg._seqResetAt||'';
      if(ticketStation()){
        // own series — the shared counter belongs to PCs without a station
      } else if(theirReset && (!myReset || new Date(theirReset)>new Date(myReset))){
        // a reset can never take the counter below a number already issued
        const floor=Math.max(theirs, ticketHighWater());
        if(floor!==mine){ P(K.seq,floor); changed++; _brk.ticket=1; }
        cfg._seqResetAt=theirReset; saveCfg();
      } else if(theirs>mine){
        P(K.seq,theirs); changed++; _brk.ticket=(theirs-mine);
      }
    }
  }catch(e){}

  if(changed && window._dbg){
    const parts=Object.entries(_brk).filter(([k,v])=>v).map(([k,v])=>k+':'+v).join(' ');
    window._dbg('sharePull merged '+changed+' → '+parts, '#93C5FD');
  }
  return changed;
}

// True when two records are the SAME transaction (not a ticket-number clash):
// same vehicle, same first-weight time, same weights. Lets a genuine re-sync of
// one record be distinguished from two different trucks sharing an id.
function _sameTx(a,b){
  if(!a||!b) return false;
  return a.vehicleReg===b.vehicleReg
      && String(a.firstWeightTime||'')===String(b.firstWeightTime||'')
      && (a.firstWeight||0)===(b.firstWeight||0)
      && (a.secondWeight||0)===(b.secondWeight||0);
}
// Next ticket number not already used in the given id-map (keeps prefix/padding).
// Also advances the shared counter so future numbers stay ahead.
function _nextFreeTicket(haveMap){
  const used=_ticketIdsInUse();
  let n=Math.max(parseInt(G(K.seq,0))||0, ticketHighWater()), id, guard=0;
  do{ n++; id=fmtTicketNo(n); }while((haveMap.has(String(id))||used.has(String(id))) && guard++<100000);
  P(K.seq,n); cfg._ticketAt=nowISO();
  return id;
}
// Compare two records ignoring sync bookkeeping (_at/_deleted). Returns true
// only when the meaningful content differs — used to prevent a newer-but-
// identical timestamp from triggering an endless pull/push sync loop.
function _recDiff(a,b){
  const strip=o=>{ const c={...o}; delete c._at; delete c._deleted; delete c._syncedAt; return JSON.stringify(c); };
  try{ return strip(a)!==strip(b); }catch(e){ return true; }
}

// Rebuild this PC entirely from the share (used when we come up empty)
async function shareRebuild(){
  const n=await sharePull();
  if(n) auditLog('config','sync','','Rebuilt '+n+' record(s) from the shared database');
  return n;
}

// True when the operator has work in the Weigh form that a background
// re-render would destroy: a first weight captured but not completed, or any
// visible input filled in. Used to hold off sync-driven renderWeigh() calls.
function _weighFormDirty(){
  try{
    if(activeTx && (activeTx.firstWeight!=null || activeTx.vehicleReg)) return true;
    const ids=['f-reg','f-prod','f-cust','f-trans','f-sup','f-dest','f-driver','f-order','f-batchdisp'];
    if(activeDir) return true;   // operator has chosen a direction — treat as active
    for(const id of ids){ const el=document.getElementById(id); if(el && String(el.value||'').trim()) return true; }
    // any custom-field input with a value
    const cf=document.querySelectorAll('[id^="f-cf-"]');
    for(const el of cf){ if(String(el.value||'').trim()) return true; }
  }catch(e){}
  return false;
}

async function syncPoll(){
  if(!window.issDesktop) return;
  clearTimeout(syncPollTimer);
  if(!_shareBusy && cfg.syncFolder){
    _shareBusy=true;
    try{
      const st=await window.issDesktop.sharedStatus();
      _shareOK=!!(st&&st.ok);
      if(_shareOK){
        await shareFlushRetry();                 // tombstones that failed earlier
        const n=await sharePull();
        await sharePushAll();
        if(n){
          if(currentTab==='dashboard') renderDash();
          if(currentTab==='records')   renderRecords();
          // Only re-render the Weigh screen from a background sync when the
          // A background sync must NEVER rebuild the Weigh form — doing so
          // wipes whatever the operator is typing (the "boxes clear" bug).
          // We update ONLY the on-site truck list in place; the form inputs
          // are left completely untouched. The live weight has its own timer.
          if(currentTab==='weigh'){
            if(window._dbg) window._dbg('sync: '+n+' change(s) → refreshOnSite (form untouched)','#6EE7B7');
            refreshOnSite();
          }
          if(currentTab==='orders'&&typeof renderOrdersTab==='function') renderOrdersTab();
        }
      }
    }catch(e){ _shareOK=false; }
    _shareBusy=false;
  }
  syncPollTimer = setTimeout(syncPoll, 10000);
}

