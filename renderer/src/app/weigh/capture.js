// ── WEIGHING ────────────────────────────────────
/* Freeze the live per-deck weights and the axle assignment onto the
   transaction. Without this the numbers live only in bState and are gone the
   moment the next poll lands — which is exactly why they never printed. */
function captureDecks(tx,key){
  const bc=cfg.bridges[activeBridge]||{}, st=bState[activeBridge]||{};
  if(!isMulti(bc)||!Array.isArray(st.decks)) return;
  tx[key]=st.decks.map(v=>(v==null?null:Math.round(v)));
  const a=axleCfg();
  if(a.on){ tx.axleGroups=Object.assign({},a.groups); tx.truckPreset=a.preset||''; }
}

/* manual=true reads the hand-typed box on the Manual Weigh tab instead of the
   indicator, and flags the ticket so the audit trail shows it was keyed. */
function cap1(manual){
  if(!activeDir){ toast('Pick Dispatch or Receive first','error'); return; }
  const w = manual
    ? applyDivision(parseFloat(document.getElementById('f-manual-w')?.value), activeBridge)
    : applyDivision(bState[activeBridge].live, activeBridge);
  if(!isFinite(w)||w<=0){
    toast(manual?'Enter a weight first':'No weight on scale','error');
    if(manual) document.getElementById('f-manual-w')?.focus();
    return;
  }
  const reg=(document.getElementById('f-reg')?.value||'').trim().toUpperCase();
  if(!reg){toast('Enter vehicle registration first','error');document.getElementById('f-reg')?.focus();return;}
  const existing=pending.find(p=>p.vehicleReg===reg);   // any bridge — one truck, one weigh-in
  if(existing){toast(reg+' already on site with 1st weight','error');return;}
  const bc=cfg.bridges[activeBridge];
  activeTx.vehicleReg=reg;
  activeTx.direction=activeDir;                 // 'dispatch' or 'receive'
  activeTx.product=(document.getElementById('f-prod')?.value||'').trim();
  activeTx.customer=(document.getElementById('f-cust')?.value||'').trim();
  activeTx.transporter=(document.getElementById('f-trans')?.value||'').trim();
  activeTx.supplier=(document.getElementById('f-sup')?.value||'').trim();
  activeTx.destination=(document.getElementById('f-dest')?.value||'').trim();
  activeTx.driver=(document.getElementById('f-driver')?.value||'').trim();
  // Order field is now type-or-pick: value is the order NUMBER. If it matches an
  // existing order, keep that order's id for validation; otherwise store the
  // free-typed number and remember it for the report.
  const ordTyped=(document.getElementById('f-order')?.value||'').trim();
  const matchOrder=orderByNo(ordTyped);
  activeTx.orderId=matchOrder?matchOrder.id:'';
  activeTx.orderNoManual=matchOrder?'':ordTyped;   // free-typed order number (no matching order record)
  // Batch Number / Dispatch Ticket Nr — one field, meaning depends on direction.
  const bd=(document.getElementById('f-batchdisp')?.value||'').trim();
  if(dirFieldIsDispatch(activeDir)){ activeTx.dispatchTicketNo=bd; activeTx.batchNo=''; }
  else { activeTx.batchNo=bd; activeTx.dispatchTicketNo=''; }
  activeTx.custom=(cfg.customFields||[]).filter(cf=>cf.id!=='cfBatch').map(cf=>({
    id:cf.id, label:cf.label, onTicket:cf.onTicket!==false,
    value:(document.getElementById('f-cf-'+cf.id)?.value||'').trim()
  })).filter(c=>c.value);
  // keep batch in the custom array too (as cfBatch) so existing report/ticket code still finds it
  if(activeTx.batchNo) activeTx.custom.push({id:'cfBatch',label:'Batch No',onTicket:true,value:activeTx.batchNo});
  activeTx.firstWeight=w;
  activeTx.firstWeightTime=nowISO();
  if(manual) activeTx.manual=true;      // shows on the ticket and in the audit log
  captureDecks(activeTx,'decks1');      // freeze per-deck weights onto the ticket
  activeTx.bridge=activeBridge;
  activeTx.bridgeName=bc?.name||'Bridge '+(activeBridge+1);
  activeTx.operatorName=session?.name||'';
  // Order + fleet checks
  if(activeTx.orderId){
    const o=orders.find(x=>x.id===activeTx.orderId);
    if(o&&o.active===false){
      toast('⛔ Order '+o.no+' is closed (target tonnage reached)','error',5000);return;
    }
    if(o&&!orderAllowsReg(o,reg)){
      toast('⛔ '+reg+' is NOT on fleet list for order '+o.no,'error',5000);return;
    }
    if(o&&orderTargetKg(o)){
      const rem=orderRemainingKg(o);
      if(rem!==null&&rem<=0){ toast('⛔ Order '+o.no+' target already reached','error',5000);return; }
    }
  }
  pending.push({...activeTx,queuedAt:nowISO()});
  savePend();
  auditLog('weigh1','tx',activeTx.vehicleReg,(manual?'MANUAL ':'')+'1st weight '+w+'kg on '+activeTx.bridgeName);
  updateWBCount();
  clearForm();
  toast((manual?'1st weight saved (manual) — ':'1st weight captured — ')+reg+': '+fmt(w)+' '+cfg.weightUnit+' ✓','success');
  if(currentTab==='weigh'||currentTab==='manual') renderWeighScreen(weighMode);
}
function cap2(manual){
  const bPend=pending.slice();   // one shared on-site list across both bridges
  if(!bPend.length){toast('No trucks waiting for 2nd weight on this bridge','error');return;}
  if(manual){
    const mw=parseFloat(document.getElementById('f-manual-w')?.value);
    if(!isFinite(mw)||mw<=0){ toast('Enter a weight first','error'); document.getElementById('f-manual-w')?.focus(); return; }
  }
  show2ndPicker(manual);
}
function show2ndPicker(manual){
  const u=cfg.weightUnit||'kg';
  const w = manual
    ? applyDivision(parseFloat(document.getElementById('f-manual-w')?.value), activeBridge)
    : applyDivision(bState[activeBridge].live, activeBridge);
  const bPend=pending.slice();   // one shared on-site list across both bridges
  const rows=bPend.map(p=>{
    const net=Math.abs((p.firstWeight||0)-w);
    const mins=Math.round((Date.now()-new Date(p.queuedAt||p.firstWeightTime||Date.now()))/60000);
    const tStr=mins<60?mins+'m':Math.floor(mins/60)+'h '+(mins%60)+'m';
    return`<div class="truck-card">
      <div onclick="pick2nd('${esc(p.vehicleReg)}'${manual?','+w:''})" style="cursor:pointer;flex:1">
        <div class="tc-reg">${esc(p.vehicleReg)}</div>
        <div class="tc-info">${esc(p.product||'—')} · ${esc(p.customer||'—')}</div>
        <div class="tc-timer">${tStr} on site</div></div>
      <div style="text-align:right">
        <div class="tc-w">${fmt(p.firstWeight)} ${u}</div>
        <div class="tc-wl">1st weight</div>
        <div style="font-size:12px;color:var(--blue);font-weight:700;margin-top:4px" onclick="pick2nd('${esc(p.vehicleReg)}'${manual?','+w:''})">Net ≈ ${fmt(net)} ${u}</div>
        <button class="btn btn-light btn-sm" style="margin-top:6px" onclick="event.stopPropagation();pick2ndManual('${esc(p.vehicleReg)}')">✍ Manual</button>
      </div></div>`;
  }).join('');
  openModal('📤 Select Truck — 2nd Weight',
    `<div style="background:var(--navy);border-radius:10px;padding:14px;text-align:center;margin-bottom:14px">
      <div style="font-size:10px;color:var(--light);letter-spacing:2px;font-weight:700;margin-bottom:4px">${manual?'TYPED WEIGHT':'LIVE WEIGHT'} — ${cfg.bridges[activeBridge]?.name||'Bridge '+(activeBridge+1)}</div>
      <div style="font-size:44px;font-weight:900;font-family:var(--f-num);font-variant-numeric:tabular-nums;color:var(--blue);letter-spacing:3px">${fmt(w)}</div>
      <div style="font-size:12px;color:var(--light);margin-top:3px">${cfg.weightUnit||'kg'}</div></div>
    <div style="font-size:11px;font-weight:800;color:var(--text3);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">${bPend.length} truck${bPend.length!==1?'s':''} waiting:</div>
    ${rows}<button class="btn btn-ghost btn-full" style="margin-top:8px" onclick="closeModal()">Cancel</button>`);
}
function pick2nd(reg, manualW){
  const w = (manualW!=null && isFinite(manualW)) ? applyDivision(manualW, activeBridge) : applyDivision(bState[activeBridge].live, activeBridge);
  const pIdx=pending.findIndex(p=>p.vehicleReg===reg);   // any bridge
  if(pIdx<0){toast('Truck not found','error');return;}
  activeTx={...pending[pIdx]};
  activeTx.secondWeight=w;
  captureDecks(activeTx,'decks2');
  activeTx.secondWeightTime=nowISO();
  if(manualW!=null) activeTx.manual2nd=true;   // flag manual 2nd weight for the audit trail
  activeTx.net=Math.abs((activeTx.firstWeight||0)-w);
  closeModal();
  showNetModal();
}
// Manual 2nd weight — type the weight by hand (scale reading unavailable/wrong).
// Uses an in-app modal, not window.prompt() (prompt is disabled in packaged Electron).
function pick2ndManual(reg){
  const u=cfg.weightUnit||'kg';
  const p=pending.find(x=>x.vehicleReg===reg);           // any bridge
  const first=p?fmt(p.firstWeight):'—';
  openModal('✍ Manual 2nd Weight — '+reg,`
    <div style="font-size:12px;color:var(--text2);margin-bottom:10px">1st weight on record: <b>${first} ${u}</b>. Enter the 2nd weight by hand.</div>
    <div class="field"><label>2nd Weight (${u})</label>
      <input id="m2-w" type="number" inputmode="numeric" placeholder="0" autofocus style="font-size:18px;font-weight:700"/></div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn btn-green" style="flex:2" onclick="confirmManual2nd('${esc(reg)}')">✓ Confirm Weight</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
  setTimeout(()=>{ const el=document.getElementById('m2-w'); if(el){ el.focus(); } },50);
}
function confirmManual2nd(reg){
  const u=cfg.weightUnit||'kg';
  const el=document.getElementById('m2-w');
  const n=parseInt(String(el?.value||'').replace(/[^0-9]/g,''));
  if(!isFinite(n)||n<=0){ toast('Enter a weight of 1 or more','error'); el?.focus(); return; }
  auditLog('weigh','manual2nd',reg,'Manual 2nd weight entered: '+n+' '+u);
  closeModal();
  pick2nd(reg, n);
}
function showNetModal(){
  const tx=activeTx, u=cfg.weightUnit||'kg';
  // After the first weight, the load details are locked so an operator can't quietly
  // change product/order/customer between weigh-in and weigh-out. Master unlocks.
  const isEdit=_editUnlocked||session?.role==='master';
  const dis=isEdit?'':'disabled';
  const lockBar=isEdit
    ? `<div style="font-size:11px;color:var(--green);margin-bottom:8px">✓ Fields unlocked for editing</div>`
    : `<div style="display:flex;align-items:center;justify-content:space-between;background:var(--elev);border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:10px">
         <span style="font-size:12px;color:var(--text2)">🔒 Load details locked after 1st weight</span>
         <button class="btn btn-light btn-sm" onclick="unlockNetEdit()">Unlock to edit</button>
       </div>`;
  const orderOpts=orders.filter(o=>o.active!==false).map(o=>`<option value="${esc(o.id)}" ${tx.orderId===o.id?'selected':''}>${esc(o.no)} — ${esc(o.product||o.customer||'')}</option>`).join('');
  openModal('✅ Complete Transaction',lockBar+`
    <div class="wbox-row">
      <div class="wbox"><div class="wbox-lbl">1st Weight</div><div class="wbox-val">${fmt(tx.firstWeight)}</div><div class="wbox-t">${u} · ${fmtT(tx.firstWeightTime)}</div></div>
      <div class="wbox"><div class="wbox-lbl">2nd Weight</div><div class="wbox-val">${fmt(tx.secondWeight)}</div><div class="wbox-t">${u} · ${fmtT(tx.secondWeightTime)}</div></div>
      <div class="wbox net"><div class="wbox-lbl">Net Weight</div><div class="wbox-val">${fmt(tx.net)}</div><div class="wbox-t">${u}</div></div>
    </div>
    <div class="row2">
      <div class="field"><label>Reg</label><input id="np-reg" value="${esc(tx.vehicleReg)}" placeholder="ABC 123 GP" ${dis}/></div>
      <div class="field"><label>Order</label><select id="np-ord" ${dis}><option value="">— None —</option>${orderOpts}</select></div>
    </div>
    <div class="row2">
      <div class="field"><label>Product</label><input id="np-prod" value="${esc(tx.product)}" list="dlP" ${dis}><datalist id="dlP">${(db.products||[]).map(p=>`<option value="${esc(p.name)}">`).join('')}</datalist></div>
      <div class="field"><label>Customer</label><input id="np-cust" value="${esc(tx.customer)}" list="dlC" ${dis}><datalist id="dlC">${(db.customers||[]).map(p=>`<option value="${esc(p.name)}">`).join('')}</datalist></div>
    </div>
    <div class="row2">
      <div class="field"><label>Transporter</label><input id="np-trans" value="${esc(tx.transporter)}" list="dlT" ${dis}><datalist id="dlT">${(db.transporters||[]).map(p=>`<option value="${esc(p.name)}">`).join('')}</datalist></div>
      <div class="field"><label>Supplier</label><input id="np-sup" value="${esc(tx.supplier)}" list="dlS" ${dis}><datalist id="dlS">${(db.suppliers||[]).map(p=>`<option value="${esc(p.name)}">`).join('')}</datalist></div>
    </div>
    <div class="row2">
      <div class="field"><label>Destination</label><input id="np-dest" value="${esc(tx.destination)}" list="dlDst" ${dis}><datalist id="dlDst">${(db.destinations||[]).map(p=>`<option value="${esc(p.name)}">`).join('')}</datalist></div>
      <div class="field"><label>Driver</label><input id="np-drv" value="${esc(tx.driver)}" list="dlDrv" ${dis}><datalist id="dlDrv">${(db.drivers||[]).map(p=>`<option value="${esc(p.name)}">`).join('')}</datalist></div>
    </div>
    <div class="field"><label>Notes</label><input id="np-notes" value="${esc(tx.notes)}" placeholder="Optional notes"/ ${dis}></div>
    <div class="row2">
      <div class="field"><label>${esc(dirFieldLabel(txDir(tx)))}</label>
        <input id="np-batchdisp" value="${esc(dirFieldIsDispatch(txDir(tx)) ? (tx.dispatchTicketNo||'') : (tx.batchNo||((tx.custom||[]).find(c=>c.id==='cfBatch')||{}).value||''))}" ${dis}/></div>
      <div class="field"></div>
    </div>
    ${(cfg.customFields||[]).filter(f=>f.id!=='cfBatch').length?`<div class="row2">${(cfg.customFields||[]).filter(f=>f.id!=='cfBatch').map(f=>{
      const cur=((tx.custom||[]).find(c=>c.id===f.id)||{}).value||'';
      return `<div class="field"><label>${esc(f.label)}</label><input id="np-cf-${f.id}" value="${esc(cur)}" ${dis}/></div>`;
    }).join('')}</div>`:''}
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      <button class="btn btn-green" style="flex:2" onclick="completeTx('thermal')">🧾 Save &amp; Thermal</button>
      <button class="btn btn-navy" onclick="completeTx('a4')">📄 Save &amp; A4</button>
      <button class="btn btn-ghost" onclick="closeModal()">← Back</button>
      <button class="btn btn-red" onclick="voidTx()">🗑 Void</button>
    </div>`);
}
function completeTx(printType){
  activeTx.vehicleReg =(document.getElementById('np-reg')?.value||'').trim().toUpperCase();
  activeTx.orderId    =(document.getElementById('np-ord')?.value||'').trim();
  activeTx.product    =(document.getElementById('np-prod')?.value||'').trim();
  activeTx.customer   =(document.getElementById('np-cust')?.value||'').trim();
  activeTx.transporter=(document.getElementById('np-trans')?.value||'').trim();
  activeTx.supplier   =(document.getElementById('np-sup')?.value||'').trim();
  activeTx.destination=(document.getElementById('np-dest')?.value||'').trim();
  activeTx.driver     =(document.getElementById('np-drv')?.value||'').trim();
  activeTx.notes      =(document.getElementById('np-notes')?.value||'').trim();
  // Batch Number / Dispatch Ticket Nr — one field, meaning set by the direction
  // chosen at 1st weigh. Written back to whichever property applies.
  const bdEl=document.getElementById('np-batchdisp');
  if(bdEl){
    const bd=String(bdEl.value||'').trim();
    if(dirFieldIsDispatch(txDir(activeTx))){ activeTx.dispatchTicketNo=bd; activeTx.batchNo=''; }
    else { activeTx.batchNo=bd; activeTx.dispatchTicketNo=''; }
  }
  activeTx.custom=(cfg.customFields||[]).filter(f=>f.id!=='cfBatch').map(f=>{
    const el=document.getElementById('np-cf-'+f.id);
    const prev=((activeTx.custom||[]).find(c=>c.id===f.id)||{}).value||'';
    // keep what was entered at 1st weigh unless the modal field overrides it
    const value=(el? el.value : prev)||'';
    return {id:f.id, label:f.label, onTicket:f.onTicket!==false, value:String(value).trim()};
  }).filter(c=>c.value);
  // mirror the batch into the custom array so ticket/report code still finds it
  if(activeTx.batchNo) activeTx.custom.push({id:'cfBatch',label:'Batch No',onTicket:true,value:activeTx.batchNo});
  activeTx.id=txId(); activeTx.completedAt=nowISO();
  stampTx(activeTx);
  txs.unshift({...activeTx}); saveTxs(); syncTxToBox(txs[0]); autoBackup('tx');
  try{ syncTicketNow(); }catch(e){}
  _editUnlocked=false;
  auditLog('complete','tx',activeTx.id,activeTx.vehicleReg+' NET '+activeTx.net+'kg ('+activeTx.product+')');
  checkOrderCompletion(activeTx.orderId);   // deactivate order once tonnage reached
  if(cfg.syncFolder){ pending.filter(p=>p.vehicleReg===activeTx.vehicleReg).forEach(pd=>shareDel('pend',_pendKey(pd))); }
  pending=pending.filter(p=>!(p.vehicleReg===activeTx.vehicleReg));
  savePend(); closeModal(); updateWBCount();
  toast('Transaction saved ✓','success');
  const done={...activeTx}; clearTx();
  if(printType==='thermal') printThermal(done);
  else printA4(done);
  if(currentTab==='dashboard')renderDash();
  if(currentTab==='records')renderRecords();
  if(currentTab==='weigh')renderWeigh();     // clear the truck from "on site" NOW
}
function voidTx(){
  if(!confirm('Void this transaction?'))return;
  if(cfg.syncFolder){ pending.filter(p=>p.vehicleReg===activeTx.vehicleReg).forEach(pd=>shareDel('pend',_pendKey(pd))); }
  pending=pending.filter(p=>!(p.vehicleReg===activeTx.vehicleReg));
  savePend(); clearTx(); closeModal(); updateWBCount();
  autoBackup('void');
  auditLog('void','tx',activeTx.vehicleReg,'Voided pending transaction');
  toast('Transaction voided','info');
  if(currentTab==='weigh')renderWeigh();
  if(currentTab==='dashboard')renderDash();
}
function clearTx(){activeTx=emptyTx(); clearForm();}

