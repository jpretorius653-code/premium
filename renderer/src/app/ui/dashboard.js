// ── DASHBOARD ────────────────────────────────────
function renderDash(){
  const u=cfg.weightUnit||'kg';
  const today=new Date().toDateString();
  const tday=txs.filter(t=>!txIsVoid(t)&&new Date(t.completedAt||0).toDateString()===today);
  const tNet=tday.reduce((s,t)=>s+(t.net||0),0);
  const onSite=pending.length;
  const chart=buildHourChart(tday);
  const bPend=pending.slice();   // one shared on-site list across both bridges
  const truckCards=bPend.map(p=>`
    <div class="truck-card">
      <div><div class="tc-reg">${esc(p.vehicleReg)}</div>
        <div class="tc-info">${esc(p.product||'—')} · ${esc(p.customer||'—')}</div>
        <div class="tc-timer">${elapsed(p.queuedAt||p.firstWeightTime||nowISO())} on site${p.bridgeName?' · in at '+esc(p.bridgeName):''}</div>
      </div>
      <div>
        <div class="tc-w">${fmt(p.firstWeight)} ${u}</div>
        <div class="tc-wl">1st weight</div>
        <button class="btn btn-blue btn-sm" style="margin-top:6px;width:100%" onclick="selectTruckFor2nd('${esc(p.vehicleReg)}')">2nd Weight →</button>
      </div>
    </div>`).join('');
  const el=document.getElementById('content');
  el.innerHTML=`
    <div class="dash-wrap">
      <div>
        <div class="stats-row">
          <div class="stat"><div class="stat-v">${tday.length}</div><div class="stat-l">Today's loads</div></div>
          <div class="stat green"><div class="stat-v">${(tNet/1000).toFixed(1)}t</div><div class="stat-l">Net tonnes today</div></div>
          <div class="stat amber"><div class="stat-v">${onSite}</div><div class="stat-l">Trucks on site</div></div>
          <div class="stat"><div class="stat-v">${txs.length}</div><div class="stat-l">All time</div></div>
        </div>
        <div class="card">
          <div class="card-title">Hourly Loads Today</div>
          <div class="bar-chart">${chart}</div>
        </div>
        <div class="card">
          <div class="card-hd">
            <div class="card-title">Today's Transactions</div>
            <button class="btn btn-ghost btn-sm" onclick="renderTab('records')">View all →</button>
          </div>
          ${tday.length?`<table><thead><tr><th>Reg</th><th>Product</th><th>Net</th><th>Time</th></tr></thead><tbody>
            ${tday.slice(0,10).map(t=>`<tr>
              <td><b style="font-family:var(--f-num);font-variant-numeric:tabular-nums;letter-spacing:1px">${esc(t.vehicleReg)}</b></td>
              <td>${esc(t.product||'—')}</td>
              <td style="font-family:var(--f-num);font-variant-numeric:tabular-nums;font-weight:700;color:var(--ink)">${fmt(t.net)} ${u}</td>
              <td style="font-size:11px;color:var(--text3)">${fmtT(t.completedAt)}</td>
            </tr>`).join('')}</tbody></table>`
            :'<div class="empty"><div class="ico">📋</div><p>No transactions today</p></div>'}
        </div>
      </div>
      <div>
        <div class="card readout-card" id="dash-readout">
          <div class="card-title">Live weight — ${cfg.bridges[activeBridge]?.name||'Bridge '+(activeBridge+1)}</div>
          <div id="dash-live" style="font-size:52px;font-weight:900;font-family:var(--f-num);font-variant-numeric:tabular-nums;color:var(--ink);letter-spacing:3px;text-align:center;margin:8px 0">${fmt(bState[activeBridge]?.live||0)}</div>
          <div style="text-align:center;font-size:12px;color:var(--light);margin-bottom:10px">${u}</div>
          <div style="text-align:center;margin-bottom:12px">${motionPill()}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <button class="btn btn-light btn-full" onclick="cap1()">📥 1st Weight</button>
            <button class="btn btn-light btn-full" onclick="cap2()">📤 2nd Weight</button>
          </div>
        </div>
        ${telemetryHTML()}
        <div class="card">
          <div class="card-hd"><div class="card-title">On site · ${bPend.length} truck${bPend.length!==1?'s':''}</div></div>
          ${bPend.length?truckCards:'<div class="empty" style="padding:20px"><div class="ico">🚛</div><p>No trucks on site</p></div>'}
        </div>
      </div>
    </div>`;
  // live update
  if(dashTimer)clearInterval(dashTimer);
  dashTimer=setInterval(()=>{
    const dl=document.getElementById('dash-live');
    if(dl)dl.textContent=fmt(bState[activeBridge]?.live||0);
  },500);
}
let dashTimer=null;
function buildHourChart(txArr){
  const hrs=Array(8).fill(0);
  txArr.forEach(t=>{const h=new Date(t.completedAt).getHours();const slot=Math.floor(h/3);if(slot<8)hrs[slot]++;});
  const mx=Math.max(...hrs,1);
  return hrs.map((n,i)=>`<div class="bar-col" style="flex:1">
    <div class="bar-fill" style="height:${Math.round(n/mx*60)+2}px"></div>
    <div class="bar-lbl">${i*3}h</div>
  </div>`).join('');
}
function selectTruckFor2nd(reg){
  const w=Math.round(bState[activeBridge].live);
  const pIdx=pending.findIndex(p=>p.vehicleReg===reg);   // any bridge
  if(pIdx<0){toast('Truck not found','error');return;}
  activeTx={...pending[pIdx]};
  activeTx.secondWeight=w;
  captureDecks(activeTx,'decks2');
  activeTx.secondWeightTime=nowISO();
  activeTx.net=Math.abs((activeTx.firstWeight||0)-w);
  showNetModal();
}

