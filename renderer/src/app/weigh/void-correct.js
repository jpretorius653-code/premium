// ══════════════════════════════════════════════════════════════════════════
//  COMPLETED TICKETS — CORRECT or VOID   (Manager access + the code)
//
//  A weighbridge ticket is a commercial document, so nothing here deletes
//  one. A ticket that should not have been issued is VOIDED: flagged, kept
//  in the record, stamped VOID on any reprint, and dropped out of every
//  total, report, export and cloud figure. A ticket with a wrong detail on
//  it is CORRECTED, with the old value written into the audit trail.
//
//  Both need Manager (or Master) rank AND the override / master code, so
//  the audit trail always names a person who could authorise it.
// ══════════════════════════════════════════════════════════════════════════
function txIsVoid(t){ return !!(t && t.voided); }
function mgrGate(what,onOk){
  if(!roleAtLeast('manager')){ toast(what+' needs Manager access','error',4500); return; }
  passwordGate(what,onOk);
}
/* Save ONE record — not just the newest — and make sure both the other PC
   and the cloud pick the change up. _ev is the edit version the share merge
   compares; clearing _txAt puts the ticket back in the cloud push queue. */
function txTouchRec(t){
  t._ev=(Number(t._ev)||0)+1;
  t._editedAt=nowISO();
  t._txAt='';
  saveTxs();
  if(cfg.syncFolder){ try{ sharePut('txs',t.id,t); }catch(e){} }
  try{ syncTicketNow(); }catch(e){}
}
/* A void takes tonnage back off an order. If that order had been closed on
   target and is now short again, open it up rather than leaving it stuck. */
function reopenOrderIfShort(orderId){
  if(!orderId) return;
  const o=orders.find(x=>x.id===orderId);
  const tk=orderTargetKg(o);
  if(!o||!tk||o.active!==false) return;
  if(orderLoadedKg(orderId)<tk){
    o.active=true; delete o.completedAt; delete o.completedKg; saveOrders();
    auditLog('edit','order',o.no,'Re-opened — a voided ticket put it back under target');
    toast('Order '+o.no+' re-opened (now under target)','info',5000);
  }
}
function voidTicket(id){
  const t=txs.find(x=>x.id===id); if(!t) return;
  if(txIsVoid(t)){ toast('Ticket '+id+' is already void','info'); return; }
  mgrGate('Void ticket '+id,()=>{
    const u=cfg.weightUnit||'kg';
    openModal('⛔ Void ticket '+id,`<div style="padding:6px">
      <div style="background:var(--bad-soft);border:1px solid var(--bad-line);border-radius:8px;padding:10px;font-size:13px;margin-bottom:12px">
        <b style="font-family:var(--f-num);font-variant-numeric:tabular-nums;letter-spacing:1px">${esc(t.vehicleReg||'')}</b> ·
        ${esc(t.product||'—')} · <b>${fmt(t.net)} ${esc(u)}</b><br>
        <span style="color:var(--text2)">The ticket is kept and stays in the audit trail. It is
        flagged VOID, stamped VOID on any reprint, and drops out of every total,
        report and export.</span>
      </div>
      <div class="field"><label>Reason (required)</label>
        <input id="vd-why" placeholder="e.g. truck weighed twice / wrong customer"
               onkeydown="if(event.key==='Enter')voidTicketGo('${id}')"/></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-red" style="flex:1" onclick="voidTicketGo('${id}')">⛔ Void this ticket</button>
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      </div></div>`);
    setTimeout(()=>document.getElementById('vd-why')?.focus(),60);
  });
}
function voidTicketGo(id){
  const t=txs.find(x=>x.id===id); if(!t) return;
  const why=(document.getElementById('vd-why')?.value||'').trim();
  if(!why){ toast('A reason is required','error'); return; }
  t.voided=true; t.voidedAt=nowISO(); t.voidedBy=session?.name||''; t.voidReason=why;
  txTouchRec(t);
  auditLog('void','tx',t.id,'VOIDED '+t.vehicleReg+' · '+fmt(t.net)+' '+(cfg.weightUnit||'kg')+' — '+why,
           {voided:false,net:t.net},{voided:true,net:t.net,reason:why});
  reopenOrderIfShort(t.orderId);
  closeModal(); autoBackup('void');
  toast('Ticket '+id+' voided — kept on record','info',4500);
  renderTab(currentTab);
}
function unvoidTicket(id){
  const t=txs.find(x=>x.id===id); if(!t||!txIsVoid(t)) return;
  mgrGate('Restore ticket '+id,()=>{
    const was=t.voidReason||'';
    delete t.voided; delete t.voidedAt; delete t.voidedBy; delete t.voidReason;
    txTouchRec(t);
    auditLog('edit','tx',t.id,'Void REVERSED on '+t.vehicleReg+(was?' (was voided: '+was+')':''));
    checkOrderCompletion(t.orderId);
    toast('Ticket '+id+' restored','success');
    renderTab(currentTab);
  });
}
// Fields a correction may touch. Weights and the batch/dispatch field are
// handled separately because they carry arithmetic or change label by direction.
const TXEDIT=[['vehicleReg','Vehicle reg'],['customer','Customer'],['product','Product'],
  ['transporter','Transporter'],['supplier','Supplier'],['destination','Destination'],
  ['driver','Driver'],['orderNoManual','Order number'],['notes','Notes']];
function editTicket(id){
  const t=txs.find(x=>x.id===id); if(!t) return;
  if(txIsVoid(t)){ toast('Restore the ticket before correcting it','error',4500); return; }
  mgrGate('Correct ticket '+id,()=>{
    const u=cfg.weightUnit||'kg';
    const disp=dirFieldIsDispatch(txDir(t));
    const bdLabel=disp?'Dispatch Ticket Nr':'Batch Number';
    const bdVal=disp?(t.dispatchTicketNo||''):(t.batchNo||'');
    openModal('✏️ Correct ticket '+id,`<div style="padding:6px">
      <div style="font-size:12px;color:var(--text2);margin-bottom:12px">
        Every change is written to the audit trail with the old value beside it.
        Changing a weight recalculates the net. To cancel a ticket outright, use Void.
      </div>
      <div class="row2">
        <div class="field"><label>1st weight (${esc(u)})</label>
          <input id="te-w1" type="number" step="1" value="${t.firstWeight??''}" oninput="teNet()"/></div>
        <div class="field"><label>2nd weight (${esc(u)})</label>
          <input id="te-w2" type="number" step="1" value="${t.secondWeight??''}" oninput="teNet()"/></div>
      </div>
      <div style="text-align:center;margin:2px 0 12px">
        <div style="font-size:10px;color:var(--text3);letter-spacing:2px;font-weight:700">NET</div>
        <div id="te-net" style="font-family:var(--f-num);font-variant-numeric:tabular-nums;font-weight:900;font-size:22px;color:var(--ink)">${fmt(t.net)} ${esc(u)}</div>
      </div>
      ${TXEDIT.map(([k,l])=>`<div class="field"><label>${l}</label>
        <input id="te-${k}" value="${esc(t[k]||'')}"/></div>`).join('')}
      <div class="field"><label>${bdLabel}</label><input id="te-bd" value="${esc(bdVal)}"/></div>
      ${(t.custom||[]).map((c,i)=>c.id==='cfBatch'?'':`<div class="field">
        <label>${esc(c.label||c.id)}</label><input id="te-cf${i}" value="${esc(c.value||'')}"/></div>`).join('')}
      <div class="field"><label>Reason for the correction (required)</label>
        <input id="te-why" placeholder="e.g. clerk captured the wrong customer"/></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-navy" style="flex:1" onclick="saveTicketEdit('${id}')">Save correction</button>
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      </div></div>`);
    setTimeout(()=>document.getElementById('te-vehicleReg')?.focus(),60);
  });
}
function teNet(){
  const el=document.getElementById('te-net'); if(!el) return;
  const a=parseFloat(document.getElementById('te-w1')?.value),
        b=parseFloat(document.getElementById('te-w2')?.value);
  el.textContent=(isFinite(a)&&isFinite(b))?fmt(Math.abs(b-a))+' '+(cfg.weightUnit||'kg'):'—';
}
function saveTicketEdit(id){
  const t=txs.find(x=>x.id===id); if(!t) return;
  const why=(document.getElementById('te-why')?.value||'').trim();
  if(!why){ toast('A reason is required','error'); return; }
  const V=i=>String(document.getElementById(i)?.value??'');
  const before={},after={},changes=[];
  const note=(k,was,now)=>{ if(String(was??'')===String(now??'')) return;
    before[k]=was; after[k]=now; changes.push(k+': "'+(was??'')+'" → "'+(now??'')+'"'); };
  TXEDIT.forEach(([k])=>{ const v=V('te-'+k).trim(); note(k,t[k]||'',v); t[k]=v; });
  const w1=parseFloat(V('te-w1')), w2=parseFloat(V('te-w2'));
  if(isFinite(w1)){ note('firstWeight',t.firstWeight,w1); t.firstWeight=w1; }
  if(isFinite(w2)){ note('secondWeight',t.secondWeight,w2); t.secondWeight=w2; }
  if(isFinite(w1)&&isFinite(w2)){ const n=Math.abs(w2-w1); note('net',t.net,n); t.net=n; }
  const bd=V('te-bd').trim();
  if(dirFieldIsDispatch(txDir(t))){ note('dispatchTicketNo',t.dispatchTicketNo||'',bd); t.dispatchTicketNo=bd; }
  else{
    note('batchNo',t.batchNo||'',bd); t.batchNo=bd;
    const cb=(t.custom||[]).find(c=>c&&c.id==='cfBatch'); if(cb) cb.value=bd;
  }
  (t.custom||[]).forEach((c,i)=>{
    if(!c||c.id==='cfBatch') return;
    const el=document.getElementById('te-cf'+i); if(!el) return;
    const v=String(el.value||'').trim(); note(c.label||c.id,c.value||'',v); c.value=v;
  });
  if(!changes.length){ closeModal(); toast('Nothing changed','info'); return; }
  t.editedAt=nowISO(); t.editedBy=session?.name||''; t.editReason=why;
  t.edits=((t.edits||[]).concat([{at:t.editedAt,by:t.editedBy,why,changes}])).slice(-20);
  txTouchRec(t);
  auditLog('edit','tx',t.id,'Corrected '+t.vehicleReg+' — '+why+' · '+changes.join('; '),before,after);
  checkOrderCompletion(t.orderId);
  closeModal(); autoBackup('edit');
  toast('Ticket '+id+' corrected ✓','success',4500);
  renderTab(currentTab);
}
/* VOID stamp printed across a reprint so a voided ticket can never be passed
   off as a live one at the gate. */
function voidStampHTML(tx,S){
  if(!txIsVoid(tx)) return '';
  const line=[tx.voidReason,tx.voidedAt?fmtDT(tx.voidedAt):'',tx.voidedBy].filter(Boolean).join(' · ');
  return `<div style="border:${S(3)}px solid #C62828;color:#C62828;border-radius:${S(8)}px;text-align:center;
      font-weight:900;letter-spacing:${S(8)}px;font-size:${S(24)}px;padding:${S(6)}px 0;margin-bottom:${S(6)}px">VOID</div>
    <div style="text-align:center;font-size:${S(11)}px;color:#C62828;margin-bottom:${S(10)}px">${esc(line)}</div>`;
}
/* Copy the current indicator reading into the manual box — handy when the
   link is intermittent rather than dead, so the clerk can sanity-check the
   number before committing it. */
function useLiveWeight(){
  const el=document.getElementById('f-manual-w'); if(!el) return;
  const w=applyDivision(bState[activeBridge]?.live||0, activeBridge);
  if(!isFinite(w)||w<=0){ toast('No weight on scale to copy','error'); return; }
  el.value=Math.round(w);
}
function clearForm(){
  (cfg.customFields||[]).forEach(cf=>{ const e=document.getElementById('f-cf-'+cf.id); if(e) e.value=''; });
  ['f-reg','f-prod','f-cust','f-trans','f-sup','f-dest','f-driver','f-order','f-batchdisp','f-manual-w'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  activeDir=null;
  setWeighDir(null);   // reset the toggle + relabel back to default
}
function updateWBCount(){
  const n=pending.length;        // count every truck on site, any bridge
  const el=document.getElementById('wb-count');
  if(el)el.textContent=n+' on site';
  return n;
}

