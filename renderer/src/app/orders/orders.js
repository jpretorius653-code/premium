// ── ORDERS ───────────────────────────────────────
let editingOrder=null;
// ── MANUAL WEIGH (coms-down fallback) ─────────────────────────────────────
// Lets an authorised operator key in weights by hand when the indicator/scale
// link is down, so trucks can still be processed. Every manual ticket is clearly
// flagged (manual:true) and written to the audit log.
/* The original single-screen manual form: BOTH weights keyed at once, for a
   truck that was never weighed in (link was down for the whole visit, or the
   truck has already left). Reached from the button on the Manual Weigh tab. */
function renderManualQuick(){
  const u=cfg.weightUnit||'kg';
  const el=document.getElementById('content');
  const orderOpts=orders.filter(o=>o.active!==false).map(o=>`<option value="${esc(o.id)}">${esc(o.no)} — ${esc(o.product||o.customer||'')}</option>`).join('');
  const dl=(id,arr)=>`<datalist id="${id}">${(arr||[]).map(p=>`<option value="${esc(p.name)}">`).join('')}</datalist>`;
  el.innerHTML=`
    <div style="max-width:640px;margin:0 auto">
      <div style="background:var(--warn-soft);border:1px solid var(--warn-line);border-radius:10px;padding:10px 12px;margin-bottom:14px;font-size:13px;color:var(--warn-ink)">
        ✍ <b>Manual weigh</b> — for use when the scale link is down. Weights are keyed by hand; each manual ticket is flagged and logged.
      </div>
      <div class="card">
        <div class="field" style="margin-bottom:12px">
          <label>Action * — pick before saving
            <span id="mdir-reset" style="float:right;font-size:11px;font-weight:700;color:var(--blue);cursor:pointer;${manualDir?'':'display:none'}" onclick="setManualDir(null)">↺ Reset choice</span>
          </label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <button type="button" id="mdir-load" class="btn btn-full ${manualDir==='dispatch'?'btn-navy':'btn-light'}" style="${_dirBtnStyle(manualDir==='dispatch',manualDir)}" onclick="setManualDir('dispatch')">⬆ Dispatch</button>
            <button type="button" id="mdir-off" class="btn btn-full ${manualDir==='receive'?'btn-navy':'btn-light'}" style="${_dirBtnStyle(manualDir==='receive',manualDir)}" onclick="setManualDir('receive')">⬇ Receive</button>
          </div>
        </div>
        <div class="row2">
          <div class="field"><label>Vehicle Reg</label><input id="m-reg" placeholder="ABC 123 GP" style="text-transform:uppercase"/></div>
          <div class="field"><label>Order</label>
            <input id="m-ord" placeholder="Type or pick an order" list="ml-orders"/>
            <datalist id="ml-orders">${orders.filter(o=>o.active!==false).map(o=>`<option value="${esc(o.no)}">${esc(o.product||o.customer||'')}</option>`).join('')}</datalist>
          </div>
        </div>
        <div class="row2">
          <div class="field"><label>1st Weight (${u})</label><input id="m-w1" type="number" inputmode="numeric" placeholder="0"/></div>
          <div class="field"><label>2nd Weight (${u})</label><input id="m-w2" type="number" inputmode="numeric" placeholder="0"/></div>
        </div>
        <div class="field"><label>Net (${u})</label><input id="m-net" type="number" readonly style="background:var(--elev);font-weight:800"/><div style="font-size:11px;color:var(--text3);margin-top:3px">Auto-calculated: |1st − 2nd|</div></div>
        <div class="row2">
          <div class="field"><label>Product</label><input id="m-prod" list="mlP"/>${dl('mlP',db.products)}</div>
          <div class="field"><label>Customer</label><input id="m-cust" list="mlC"/>${dl('mlC',db.customers)}</div>
        </div>
        <div class="row2">
          <div class="field"><label>Transporter</label><input id="m-trans" list="mlT"/>${dl('mlT',db.transporters)}</div>
          <div class="field"><label>Supplier</label><input id="m-sup" list="mlS"/>${dl('mlS',db.suppliers)}</div>
        </div>
        <div class="row2">
          <div class="field"><label>Destination</label><input id="m-dest" list="mlDst"/>${dl('mlDst',db.destinations)}</div>
          <div class="field"><label>Driver</label><input id="m-drv" list="mlDrv"/>${dl('mlDrv',db.drivers)}</div>
        </div>
        <div class="row2">
          <div class="field" id="mwrap-batchdisp" style="${manualDir?'':'opacity:.5'}">
            <label id="mlbl-batchdisp">${dirFieldLabel(manualDir)}</label>
            <input id="m-batchdisp" placeholder="${dirFieldLabel(manualDir)}"/>
          </div>
          <div class="field"><label>Reason / notes</label><input id="m-notes" placeholder="e.g. scale offline — manual capture"/></div>
        </div>
        ${(cfg.customFields||[]).filter(cf=>cf.id!=='cfBatch').length?`
        <div class="row2">
          ${(cfg.customFields||[]).filter(cf=>cf.id!=='cfBatch').map(cf=>`
            <div class="field"><label>${esc(cf.label)}</label>
              <input id="m-cf-${cf.id}" placeholder="${esc(cf.label)}"/></div>`).join('')}
        </div>`:''}
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
          <button class="btn btn-green" style="flex:2" onclick="saveManualTx('thermal')">🧾 Save &amp; Thermal</button>
          <button class="btn btn-navy" onclick="saveManualTx('a4')">📄 Save &amp; A4</button>
          <button class="btn btn-ghost" onclick="saveManualTx('')">Save only</button>
        </div>
        <button class="btn btn-ghost btn-full" style="margin-top:10px;font-size:12px" onclick="renderManual()">← Back to Manual Weigh</button>
      </div>
    </div>`;
  const recalc=()=>{const a=parseFloat(document.getElementById('m-w1').value)||0;const b=parseFloat(document.getElementById('m-w2').value)||0;document.getElementById('m-net').value=Math.abs(a-b)||'';};
  ['m-w1','m-w2'].forEach(id=>document.getElementById(id).addEventListener('input',recalc));
}
function saveManualTx(printType){
  if(!manualDir){ toast('Pick Dispatch or Receive first','error'); return; }
  const g=id=>(document.getElementById(id)?.value||'').trim();
  const reg=g('m-reg').toUpperCase();
  let w1=parseFloat(g('m-w1')), w2=parseFloat(g('m-w2'));
  if(isFinite(w1)) w1=applyDivision(w1, activeBridge);
  if(isFinite(w2)) w2=applyDivision(w2, activeBridge);
  if(!reg){ toast('Vehicle reg required','error'); return; }
  if(isNaN(w1)||isNaN(w2)){ toast('Enter both weights','error'); return; }
  // Order field is type-or-pick: value is the order NUMBER. Match to a record if
  // possible, else keep the free-typed number.
  const ordTyped=g('m-ord');
  const matchOrder=orderByNo(ordTyped);
  const orderId=matchOrder?matchOrder.id:'';
  const orderNoManual=matchOrder?'':ordTyped;
  if(matchOrder){
    if(matchOrder.active===false){ toast('Order '+matchOrder.no+' is closed','error'); return; }
    if(!orderAllowsReg(matchOrder,reg)){ toast('⛔ '+reg+' not on fleet list for '+matchOrder.no,'error'); return; }
  }
  // Batch Number / Dispatch Ticket Nr — one field, meaning depends on direction.
  const bd=g('m-batchdisp');
  const batchNo          = dirFieldIsDispatch(manualDir) ? '' : bd;
  const dispatchTicketNo = dirFieldIsDispatch(manualDir) ? bd : '';
  // All other custom fields (Trailer 1, Trailer 2, Seal No, …) from m-cf-* inputs.
  const custom=(cfg.customFields||[]).filter(cf=>cf.id!=='cfBatch').map(cf=>({
    id:cf.id, label:cf.label, onTicket:cf.onTicket!==false,
    value:(document.getElementById('m-cf-'+cf.id)?.value||'').trim()
  })).filter(c=>c.value);
  if(batchNo) custom.push({id:'cfBatch',label:'Batch No',onTicket:true,value:batchNo});
  const net=Math.abs(w1-w2);
  const now=nowISO();
  const tx={...emptyTx(),
    id:txId(), vehicleReg:reg, orderId, orderNoManual, direction:manualDir,
    batchNo, dispatchTicketNo, custom,
    product:g('m-prod'), customer:g('m-cust'), transporter:g('m-trans'), supplier:g('m-sup'),
    destination:g('m-dest'), driver:g('m-drv'), notes:g('m-notes'),
    firstWeight:w1, firstWeightTime:now, secondWeight:w2, secondWeightTime:now,
    net, completedAt:now, manual:true,
    bridgeName:(cfg.bridges[activeBridge]?.name)||('Bridge '+(activeBridge+1)),
    operatorName:session?.name||''};
  stampTx(tx);
  txs.unshift(tx); saveTxs(); syncTxToBox(txs[0]); autoBackup('tx');
  try{ syncTicketNow(); }catch(e){}
  auditLog('complete','tx',tx.id,'MANUAL '+reg+' NET '+net+'kg ('+(tx.product||'—')+')');
  checkOrderCompletion(orderId);
  toast('✓ Manual ticket saved: '+reg+' — '+fmt(net)+' '+u_(),'success',5000);
  if(printType==='thermal') printThermal(tx);
  else if(printType==='a4') printA4(tx);
  manualDir=null;
  renderManual();
}
function u_(){return cfg.weightUnit||'kg';}

function renderOrdersTab(){
  document.getElementById('content').innerHTML=`
    <div class="sec-hd">
      <div><h2>Orders</h2><div class="sub">${orders.length} order${orders.length!==1?'s':''} total</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-light" onclick="downloadOrderTemplate()">⬇️ Template</button>
        <button class="btn btn-light" onclick="exportOrderList()">📄 Export</button>
        <button class="btn btn-light" onclick="document.getElementById('or-file').click()">📂 Import Orders</button>
        <button class="btn btn-navy" onclick="openOrderModal()">+ New Order</button>
      </div>
      <input type="file" id="or-file" accept="${SHEET_ACCEPT}" style="display:none" onchange="importOrderList(this)"/>
    </div>
    ${orders.length?(()=>{ const _dups=orderDuplicateNos(); return orders.map(o=>{
      const loaded=txs.filter(t=>t.orderId===o.id&&!txIsVoid(t)).reduce((s,t)=>s+(t.net||0),0);
      const tk=orderTargetKg(o);
      const pct=tk?Math.min(100,loaded/tk*100):0;
      const closed=o.active===false;
      const dupOf=_dups[o.id];
      return`<div class="card" style="${closed?'opacity:.6':''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-size:15px;font-weight:800;color:var(--ink)">${esc(o.no)} ${closed?'<span style="font-size:10px;color:var(--text3)">(closed)</span>':''}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px">${esc(o.product||'—')} · ${esc(o.customer||'—')}${o.destination?' → '+esc(o.destination):''}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">${o.fleet?.length?'🚛 '+o.fleet.length+' regs restricted':'Any vehicle'}${o.transporter?' · '+esc(o.transporter):''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:var(--f-num);font-variant-numeric:tabular-nums;font-weight:700;font-size:16px;color:var(--ink)">${(loaded/1000).toFixed(1)} t</div>
            ${tk?`<div style="font-size:11.5px;color:var(--text3)">of ${(tk/1000).toFixed(1)} t · ${Math.max(0,(tk-loaded)/1000).toFixed(1)} t left</div>`:`<div style="font-size:11.5px;color:var(--text3)">no target</div>`}
          </div>
        </div>
        ${tk?`<div class="order-prog"><div class="order-prog-fill" style="width:${pct}%"></div></div>`:''}
        ${dupOf?`<div style="margin-top:8px;font-size:12px;color:var(--warn-ink)">Same number as ${esc(dupOf.no)} — tickets may be split across both. Close one and correct its tickets.</div>`:''}
        <div style="display:flex;gap:6px;margin-top:10px">
          <button class="btn btn-ghost btn-sm" onclick="openOrderModal('${o.id}')">Edit</button>
          <button class="btn btn-ghost btn-sm" onclick="toggleOrder('${o.id}')">${closed?'Re-open':'Close'}</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteOrder('${o.id}')">Delete</button>
        </div>
      </div>`;
    }).join(''); })():'<div class="empty"><div class="ico">📦</div><p>No orders yet.<br>Create an order to pre-fill the weigh form<br>and restrict which vehicles may load.</p></div>'}`;
}
function openOrderModal(id){
  editingOrder=id||null;
  const o=id?orders.find(x=>x.id===id):null;
  const dlP=(db.products||[]).map(p=>`<option value="${esc(p.name)}">`).join('');
  const dlC=(db.customers||[]).map(p=>`<option value="${esc(p.name)}">`).join('');
  const dlT=(db.transporters||[]).map(p=>`<option value="${esc(p.name)}">`).join('');
  const dlS=(db.suppliers||[]).map(p=>`<option value="${esc(p.name)}">`).join('');
  const dlD=(db.destinations||[]).map(p=>`<option value="${esc(p.name)}">`).join('');
  openModal(o?'Edit Order':'New Order',`
    <div class="row2">
      <div class="field"><label>Order Number *</label><input id="o-no" value="${esc(o?.no||'')}" placeholder="e.g. PO-2026-001" ${o?'readonly':''}/>
      </div>
      <div class="field"><label>Target in tonnes (optional)</label><input id="o-tt" type="number" min="0" step="0.001" value="${orderTargetKg(o)?+(orderTargetKg(o)/1000).toFixed(3):''}" placeholder="e.g. 500"/></div>
    </div>
    <div class="row2">
      <div class="field"><label>Product</label><input id="o-prod" value="${esc(o?.product||'')}" list="odlP"/><datalist id="odlP">${dlP}</datalist></div>
      <div class="field"><label>Customer</label><input id="o-cust" value="${esc(o?.customer||'')}" list="odlC"/><datalist id="odlC">${dlC}</datalist></div>
    </div>
    <div class="row2">
      <div class="field"><label>Transporter</label><input id="o-trans" value="${esc(o?.transporter||'')}" list="odlT"/><datalist id="odlT">${dlT}</datalist></div>
      <div class="field"><label>Supplier</label><input id="o-sup" value="${esc(o?.supplier||'')}" list="odlS"/><datalist id="odlS">${dlS}</datalist></div>
    </div>
    <div class="row2">
      <div class="field"><label>Destination</label><input id="o-dest" value="${esc(o?.destination||'')}" list="odlD"/><datalist id="odlD">${dlD}</datalist></div>
      <div class="field"><label>Rate R/t (optional)</label><input id="o-rate" type="number" step="0.01" value="${o?.rate||''}"/></div>
    </div>
    <div class="field"><label>Fleet Restriction — one registration per line (blank = any vehicle)</label>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
        <button type="button" class="btn btn-light btn-sm" onclick="document.getElementById('o-fleet-file').click()">📊 Import from Excel / CSV</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('o-fleet').value=''">Clear</button>
        <select class="btn-sm" style="width:auto;min-width:180px" onchange="addHaulierToOrder(this.value);this.selectedIndex=0">
          <option value="">+ Add a transporter's whole fleet…</option>
          ${haulierList().map(h=>`<option value="${esc(h)}">${esc(h)} (${fleet.filter(f=>String(f.transporter||'').trim()===h).length})</option>`).join('')}
        </select>
        <span style="font-size:11px;color:var(--text3)">.xlsx or .csv — reads a Reg/Vehicle column (or column A)</span>
        <input type="file" id="o-fleet-file" accept="${SHEET_ACCEPT}" style="display:none" onchange="importFleetFile(this)"/>
      </div>
      <textarea id="o-fleet" rows="4" style="resize:vertical" placeholder="One registration per line">${(o?.fleet||[]).join('\n')}</textarea>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-top:4px;margin-bottom:14px">
      💡 Tip: paste registrations from Excel — one per line
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-navy" style="flex:1" onclick="saveOrder()">Save Order</button>
    </div>`);
}
function saveOrder(){
  const no=(document.getElementById('o-no')?.value||'').trim();
  if(!no){toast('Order number required','error');return;}
  // Target is entered in TONNES. Blank or 0 = no target. Before 10.0 this box
  // took kg and operators typed tonnes, which set 2 000 t orders to 2 t.
  const ttRaw=(document.getElementById('o-tt')?.value||'').trim();
  const tt=ttRaw===''?0:parseFloat(ttRaw);
  if(!isFinite(tt)||tt<0){ toast('Target must be a positive number of tonnes, or blank','error'); return; }
  if(tt>200000){ toast('That target is '+fmt(tt)+' t — the box takes tonnes, not kg','error',6000); return; }
  const fleet=document.getElementById('o-fleet')?.value.split(/[\n,;]+/).map(r=>r.trim().toUpperCase().replace(/\s+/g,' ')).filter(Boolean)||[];
  const data={no,product:(document.getElementById('o-prod')?.value||'').trim(),customer:(document.getElementById('o-cust')?.value||'').trim(),
    transporter:(document.getElementById('o-trans')?.value||'').trim(),supplier:(document.getElementById('o-sup')?.value||'').trim(),
    destination:(document.getElementById('o-dest')?.value||'').trim(),rate:parseFloat(document.getElementById('o-rate')?.value)||null,
    targetKg:tt>0?Math.round(tt*1000):null,fleet,active:true};
  if(editingOrder){
    const i=orders.findIndex(x=>x.id===editingOrder);
    if(i>=0)orders[i]=Object.assign(orders[i],data);
  }else{
    const clash=orderByNo(no);
    if(clash){toast('Order '+clash.no+' already exists — numbers match ignoring spaces and case','error',5000);return;}
    orders.unshift({id:'O'+Date.now(),created:nowISO(),...data});
  }
  saveOrders();closeModal();renderOrdersTab();toast('Order saved ✓','success');
}
function toggleOrder(id){const o=orders.find(x=>x.id===id);if(o){o.active=o.active===false;saveOrders();renderOrdersTab();}}
function deleteOrder(id){if(!confirm('Delete order?'))return;orders=orders.filter(x=>x.id!==id);saveOrders();shareDel('orders',id);auditLog('delete','order',id,'Deleted order');renderOrdersTab();}

