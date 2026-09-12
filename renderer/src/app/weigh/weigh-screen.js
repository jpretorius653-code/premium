// ── WEIGH TAB ────────────────────────────────────
// Renders ONLY the "On Site" trucks list (not the form). Used so a background
// sync can refresh the truck list without rebuilding — and wiping — the form.
function _onSiteHTML(){
  const u=cfg.weightUnit||'kg';
  const bPend=pending.slice();   // one shared on-site list across both bridges
  return `<div class="card-hd">
            <div class="card-title">On Site — ${bPend.length}</div>
            <span class="badge b-blue">${bPend.length} truck${bPend.length!==1?'s':''}</span>
          </div>
          ${bPend.length?bPend.map(p=>`<div class="truck-card" onclick="selectTruckFor2nd('${esc(p.vehicleReg)}')">
            <div><div class="tc-reg">${esc(p.vehicleReg)}</div>
              <div class="tc-info">${esc(p.product||'—')} · ${esc(p.customer||'—')}</div>
              <div class="tc-timer">${elapsed(p.queuedAt||p.firstWeightTime||nowISO())} on site${p.bridgeName?' · in at '+esc(p.bridgeName):''}</div>
            </div>
            <div style="text-align:right">
              <div class="tc-w">${fmt(p.firstWeight)} ${u}</div>
              <div class="tc-wl">1st weight · ${fmtT(p.firstWeightTime)}</div>
            </div>
          </div>`).join(''):'<div class="empty" style="padding:20px"><div class="ico">🚛</div><p>No trucks on site</p></div>'}`;
}
// Update just the on-site list in place. Never touches the form inputs.
function refreshOnSite(){
  const el=document.getElementById('weigh-onsite');
  if(el) el.innerHTML=_onSiteHTML();
}
/* ══════════════════════════════════════════════════════════════════════
   WEIGH SCREEN — shared by the Weigh tab and the Manual Weigh tab.
   Both tabs render the SAME form, on-site list and axle check; only where
   the weight comes from differs. One function rather than two copies, so a
   change to the form can never land on one tab and not the other.
     mode 'live'   — weight is read from the indicator
     mode 'manual' — weight is typed by hand, ticket flagged manual
   Only one tab is on screen at a time, so both share the same element ids
   and therefore the same cap1 / cap2 / clearForm code paths.
   ══════════════════════════════════════════════════════════════════════ */
let weighMode='live';
function renderWeigh(){ renderWeighScreen('live'); }
function renderManual(){ renderWeighScreen('manual'); }
function renderWeighScreen(mode){
  weighMode=(mode==='manual')?'manual':'live';
  const manual=weighMode==='manual';
  try{ if(window._dbg){ window._dbg('renderWeighScreen('+weighMode+') called','#FCD34D'); } }catch(_){}
  const orderOpts=orders.filter(o=>o.active!==false).map(o=>`<option value="${esc(o.id)}">${esc(o.no)} — ${esc(o.product||o.customer||'')}</option>`).join('');
  const dl=(cat)=>`<datalist id="dl-${cat}">${(db[cat]||[]).map(p=>`<option value="${esc(p.name)}">`).join('')}</datalist>`;
  const u=cfg.weightUnit||'kg';
  const bPend=pending.slice();   // one shared on-site list across both bridges
  document.getElementById('content').innerHTML=`
    <div class="dash-wrap">
      <div>
        ${manual?`<div style="background:var(--warn-soft);border:1px solid var(--warn-line);border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:13px;color:var(--warn-ink)">
          \u270d <b>Manual weigh</b> — for use when the scale link is down. Weights are keyed by hand; every manual ticket is flagged and written to the audit log.
          <button class="btn btn-light btn-sm" style="float:right;margin-top:-2px" onclick="renderManualQuick()">Both weights at once</button>
        </div>`:''}
        <div class="card readout-card" id="weigh-readout" style="margin-bottom:12px">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:10px;color:var(--light);font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px">Live Weight · ${cfg.bridges[activeBridge]?.name||'Bridge '+(activeBridge+1)}</div>
              <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
                <div id="weigh-live" style="font-size:34px;font-weight:900;font-family:var(--f-num);font-variant-numeric:tabular-nums;color:var(--ink);letter-spacing:2px">${fmt(applyDivision(bState[activeBridge]?.live||0, activeBridge))}</div>
                <div style="font-size:12px;color:var(--light)">${u}</div>
                <div style="margin-left:4px">${manual?'<span class="badge b-amber">typed by hand</span>':motionPill()}</div>
              </div>
              ${manual?`<div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <label style="font-size:10px;color:var(--light);font-weight:700;letter-spacing:1px;text-transform:uppercase;margin:0">Weight to capture</label>
                <input id="f-manual-w" type="number" inputmode="numeric" step="1" placeholder="0"
                  style="width:150px;font-family:var(--f-num);font-variant-numeric:tabular-nums;font-size:20px;font-weight:800;padding:4px 8px;text-align:right"/>
                <span style="font-size:12px;color:var(--light)">${u}</span>
                <button class="btn btn-light btn-sm" onclick="useLiveWeight()">\u2193 Use live</button>
              </div>`:''}
            </div>
            <div style="text-align:right">
              <div id="weigh-conn" style="font-size:11px;color:var(--light);margin-bottom:8px;font-weight:800">${weighConnText(activeBridge)}</div>
              ${bridgeIsSetUp(activeBridge)?'':'<button class="btn btn-light btn-sm" onclick="renderTab(&#39;settings&#39;)">⚙ Set Up Scale</button>'}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-title" style="margin-bottom:12px">Vehicle Details</div>
          <div class="field" style="margin-bottom:12px">
            <label>Action * — pick before capturing 1st weight
              <span id="dir-reset" style="float:right;font-size:11px;font-weight:700;color:var(--blue);cursor:pointer;${activeDir?'':'display:none'}" onclick="setWeighDir(null)">↺ Reset choice</span>
            </label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <button type="button" id="dir-load" class="btn btn-full ${activeDir==='dispatch'?'btn-navy':'btn-light'}" style="${_dirBtnStyle(activeDir==='dispatch',activeDir)}" onclick="setWeighDir('dispatch')">⬆ Dispatch</button>
              <button type="button" id="dir-off" class="btn btn-full ${activeDir==='receive'?'btn-navy':'btn-light'}" style="${_dirBtnStyle(activeDir==='receive',activeDir)}" onclick="setWeighDir('receive')">⬇ Receive</button>
            </div>
          </div>
          <div class="row2">
            <datalist id="dl-fleet">${fleet.map(f=>`<option value="${esc(f.reg)}">${esc([f.transporter,f.driver].filter(Boolean).join(' · '))}</option>`).join('')}</datalist>
            <div class="field"><label>Registration *</label>
              <input id="f-reg" placeholder="ABC 123 GP" style="text-transform:uppercase;font-size:16px;font-weight:700;letter-spacing:2px" oninput="this.value=this.value.toUpperCase();autoFillReg(this.value)" list="dl-fleet"/>
            </div>
            <div class="field"><label>Order (optional)</label>
              <input id="f-order" placeholder="Type or pick an order" list="dl-orders" onchange="applyOrder(this.value)"/>
              <datalist id="dl-orders">${orders.filter(o=>o.active!==false).map(o=>`<option value="${esc(o.no)}">${esc(o.product||o.customer||'')}</option>`).join('')}</datalist>
            </div>
          </div>
          <div class="row3">
            <div class="field"><label>Product</label>
              <input id="f-prod" placeholder="e.g. Coal ROM" list="dl-products"/>${dl('products')}</div>
            <div class="field"><label>Customer</label>
              <input id="f-cust" placeholder="Customer name" list="dl-customers"/>${dl('customers')}</div>
            <div class="field"><label>Transporter</label>
              <input id="f-trans" placeholder="Transport co." list="dl-transporters"/>${dl('transporters')}</div>
          </div>
          <div class="row3">
            <div class="field"><label>Supplier</label>
              <input id="f-sup" placeholder="Supplier" list="dl-suppliers"/>${dl('suppliers')}</div>
            <div class="field"><label>Destination</label>
              <input id="f-dest" placeholder="Destination" list="dl-destinations"/>${dl('destinations')}</div>
            <div class="field"><label>Driver</label>
              <input id="f-driver" placeholder="Driver name" list="dl-drivers"/>${dl('drivers')}</div>
          </div>
          <div class="row2">
            <div class="field" id="wrap-batchdisp" style="${activeDir?'':'opacity:.5'}">
              <label id="lbl-batchdisp">${dirFieldLabel(activeDir)}</label>
              <input id="f-batchdisp" placeholder="${dirFieldLabel(activeDir)}"/>
            </div>
            <div class="field"></div>
          </div>
          ${(cfg.customFields||[]).filter(cf=>cf.id!=='cfBatch').length?`
          <div class="row2">
            ${(cfg.customFields||[]).filter(cf=>cf.id!=='cfBatch').map(cf=>`
              <div class="field"><label>${esc(cf.label)}</label>
                <input id="f-cf-${cf.id}" placeholder="${esc(cf.label)}"/></div>`).join('')}
          </div>`:''}
          <div class="wsticky">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <button class="btn btn-navy btn-full" onclick="cap1(${manual?'true':'false'})">📥 ${manual?'Save':'Capture'} 1st Weight</button>
            <button class="btn btn-blue btn-full" onclick="cap2(${manual?'true':'false'})" ${!bPend.length?'style="opacity:.5"':''}>📤 ${manual?'Save':'Capture'} 2nd Weight${bPend.length?' ('+bPend.length+')':''}</button>
          </div>
           
          <button class="btn btn-ghost btn-full" style="margin-top:6px;font-size:12px" onclick="clearTx();renderWeighScreen(weighMode)">🗑 Clear Form</button>
          </div>
        </div>
      </div>
      <div>
        <div class="card" id="weigh-axle" style="display:none"></div>
        ${telemetryHTML()}
        <div class="card" id="weigh-onsite">${_onSiteHTML()}</div>
      </div>
    </div>`;
  // live update
  if(weighTimer)clearInterval(weighTimer);
  weighTimer=setInterval(()=>{
    const el=document.getElementById('weigh-live');
    if(el){
      el.textContent=fmt(applyDivision(bState[activeBridge]?.live||0, activeBridge));
      renderWeighAxle();
    }
    else{clearInterval(weighTimer);weighTimer=null;}
  },400);
  renderWeighAxle();
}
let weighTimer=null;
function autoFillReg(reg){
  if(!reg||reg.length<3)return;
  const set=(id,v)=>{const el=document.getElementById(id);if(el&&!el.value&&v)el.value=v;};
  // 1. Fleet record first — trailers, transporter, driver
  const f=fleetFind(reg);
  if(f){
    set('f-trans',f.transporter); set('f-driver',f.driver);
    const cf=cfg.customFields||[];
    const t1=cf.find(c=>/trailer\s*1/i.test(c.label)), t2=cf.find(c=>/trailer\s*2/i.test(c.label));
    if(t1) set('f-cf-'+t1.id,f.trailer1);
    if(t2) set('f-cf-'+t2.id,f.trailer2);
  }
  // 2. Then last load for this reg — product, customer, route
  const last=txs.find(t=>t.vehicleReg===reg);
  if(!last)return;
  set('f-prod',last.product);set('f-cust',last.customer);set('f-trans',last.transporter);
  set('f-sup',last.supplier);set('f-dest',last.destination);set('f-driver',last.driver);
}
function applyOrder(val){
  // val may be an order NUMBER (typed/picked) or an id. Match either.
  const o=orderByNo(val)||orders.find(x=>x.id===val);
  if(!o) return;   // free-typed number with no matching order — nothing to autofill
  const set=(el,v)=>{const e=document.getElementById(el);if(e&&v)e.value=v;};
  set('f-prod',o.product);set('f-cust',o.customer);set('f-trans',o.transporter);
  set('f-sup',o.supplier);set('f-dest',o.destination);
  toast('Order '+o.no+' applied'+(o.fleet?.length?' · fleet restricted ('+o.fleet.length+' regs)':''),'info');
}

