// ── RECORDS ───────────────────────────────────────
function renderRecords(){
  const _focus=document.activeElement&&document.activeElement.id;
  const _caret=(document.activeElement&&document.activeElement.selectionStart)||null;
  const u=cfg.weightUnit||'kg';
  const filt=filteredTxs();
  const live=filt.filter(t=>!txIsVoid(t));      // totals never include a void
  const nVoid=filt.length-live.length;
  const tot=live.reduce((s,t)=>s+(t.net||0),0);
  const disp=live.filter(t=>txDir(t)==='dispatch'), recv=live.filter(t=>txDir(t)==='receive');
  const dTot=disp.reduce((s,t)=>s+(t.net||0),0), rTot=recv.reduce((s,t)=>s+(t.net||0),0);
  document.getElementById('content').innerHTML=`
    <div class="sec-hd">
      <div><h2>Records</h2><div class="sub">${live.length} of ${txs.length} transactions · ${(tot/1000).toFixed(2)} t net${nVoid?' · <span style="color:#F87171;font-weight:700">'+nVoid+' void</span>':''}${rangeLabel()}</div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-navy btn-sm" onclick="printDailyReport()">🖨 Report</button>
        <button class="btn btn-ghost btn-sm" onclick="exportCSV()">↓ CSV</button>
      </div>
    </div>
    <div class="stats" style="margin-bottom:12px">
      <div class="stat"><div class="stat-v">↑ ${(dTot/1000).toFixed(2)} t</div><div class="stat-l">Dispatched · ${disp.length} load${disp.length===1?'':'s'}</div></div>
      <div class="stat"><div class="stat-v">↓ ${(rTot/1000).toFixed(2)} t</div><div class="stat-l">Received · ${recv.length} load${recv.length===1?'':'s'}</div></div>
    </div>
    <div class="card" style="margin-bottom:12px">
      <div style="margin-bottom:8px"><input id="r-q" placeholder="🔍 Search reg, product, customer…" value="${esc(recFilter.q)}" oninput="applyFilters()"/></div>
      <div class="row2" style="margin-bottom:8px">
        <div class="field"><label>From</label><input id="r-from" type="date" value="${recFilter.from}" onchange="applyFilters()" style="width:100%"/></div>
        <div class="field"><label>To</label><input id="r-to" type="date" value="${recFilter.to}" onchange="applyFilters()" style="width:100%"/></div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        <button class="btn btn-ghost btn-sm" onclick="setRange('today')">Today</button>
        <button class="btn btn-ghost btn-sm" onclick="setRange('7')">Last 7 days</button>
        <button class="btn btn-ghost btn-sm" onclick="setRange('30')">Last 30 days</button>
        <button class="btn btn-ghost btn-sm" onclick="setRange('month')">This month</button>
        <button class="btn btn-ghost btn-sm" onclick="setRange('all')">All time</button>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);margin-left:auto;cursor:pointer">
          <input id="r-void" type="checkbox" ${recFilter.showVoid?'checked':''} onchange="applyFilters()"
                 style="width:auto;margin:0"/> Show voided
        </label>
      </div>
      <div class="row2">
        <div><select id="r-cf" onchange="applyFilters()">
          <option value="">Filter by field…</option>
          ${(cfg.customFields||[]).map(cf=>`<option value="${esc(cf.id)}" ${recFilter.cfId===cf.id?'selected':''}>${esc(cf.label)}</option>`).join('')}
        </select></div>
        <div><input id="r-cfv" placeholder="${esc(((cfg.customFields||[]).find(c=>c.id===recFilter.cfId)||{}).label||'value')}" value="${esc(recFilter.cfVal)}" oninput="applyFilters()" ${!recFilter.cfId?'disabled style="opacity:.5"':''}/></div>
        <div><select id="r-dir" onchange="applyFilters()">
          <option value="" ${recFilter.dir===''?'selected':''}>Dispatch &amp; Receive</option>
          <option value="dispatch" ${recFilter.dir==='dispatch'?'selected':''}>↑ Dispatch only</option>
          <option value="receive" ${recFilter.dir==='receive'?'selected':''}>↓ Receive only</option>
        </select></div>
        <div><select id="r-bridge" onchange="applyFilters()"><option value="">All bridges</option>
          ${cfg.bridges.map((b,i)=>`<option value="${i}" ${String(recFilter.bridge)===String(i)?'selected':''}>${esc(b.name)}</option>`).join('')}
        </select></div>
        <div><select id="r-prod" onchange="applyFilters()"><option value="">All products</option>
          ${[...new Set(txs.map(t=>t.product).filter(Boolean))].map(p=>`<option ${recFilter.prod===p?'selected':''}>${esc(p)}</option>`).join('')}
        </select></div>
      </div>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      ${filt.length?`<table><thead><tr><th>Ticket</th><th>Reg</th><th>Product</th><th>Customer</th><th>Net ${u}</th><th>Date/Time</th><th></th></tr></thead>
        <tbody>${filt.slice(0,200).map(t=>{
          const v=txIsVoid(t), mgr=roleAtLeast('manager');
          const dim=v?'opacity:.55;text-decoration:line-through':'';
          return `<tr${v?' style="background:var(--bad-soft)"':''}>
          <td style="font-family:var(--f-num);font-variant-numeric:tabular-nums;font-size:10px;color:var(--text3)">${esc(t.id)}
            ${v?'<div style="font-family:inherit;font-size:9px;font-weight:900;color:#F87171;letter-spacing:1px">VOID</div>':''}
            ${(!v&&t.editedAt)?'<div style="font-family:inherit;font-size:9px;color:var(--gold);letter-spacing:1px">CORRECTED</div>':''}</td>
          <td style="${dim}"><b style="font-family:var(--f-num);font-variant-numeric:tabular-nums;letter-spacing:1px">${esc(t.vehicleReg)}</b></td>
          <td style="${dim}">${esc(t.product||'—')}</td>
          <td style="font-size:12px;${dim}">${esc(t.customer||'—')}</td>
          <td style="font-family:var(--f-num);font-variant-numeric:tabular-nums;font-weight:700;color:${v?'#F87171':'var(--ink)'};${dim}">${fmt(t.net)}</td>
          <td style="font-size:11px;color:var(--text3)">${fmtDT(t.completedAt)}
            ${v&&t.voidReason?'<div style="font-size:10px;color:#F87171">'+esc(t.voidReason)+'</div>':''}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-ghost btn-sm" style="margin-right:4px" title="Thermal" onclick="reprintThermal('${t.id}')">🧾</button>
            <button class="btn btn-ghost btn-sm" style="margin-right:4px" title="A4" onclick="reprintA4('${t.id}')">📄</button>
            ${mgr?(v
              ?`<button class="btn btn-ghost btn-sm" title="Restore this ticket" onclick="unvoidTicket('${t.id}')">↩</button>`
              :`<button class="btn btn-ghost btn-sm" style="margin-right:4px" title="Correct this ticket" onclick="editTicket('${t.id}')">✏️</button>
                <button class="btn btn-ghost btn-sm" title="Void this ticket" onclick="voidTicket('${t.id}')">⛔</button>`):''}
          </td>
        </tr>`;}).join('')}</tbody></table>`
      :'<div class="empty"><div class="ico">📋</div><p>No records match your filter</p></div>'}
    </div>`;
  // keep the cursor where it was — the search/value boxes rebuild on every keystroke
  if(_focus){
    const el=document.getElementById(_focus);
    if(el&&el.focus){ el.focus(); try{ if(_caret!=null&&el.setSelectionRange) el.setSelectionRange(_caret,_caret); }catch(e){} }
  }
}
let recFilter={q:'',from:'',to:'',bridge:'',prod:'',dir:'',cfId:'',cfVal:'',showVoid:false};
function applyFilters(){
  recFilter.q=document.getElementById('r-q')?.value||'';
  recFilter.from=document.getElementById('r-from')?.value||'';
  recFilter.to=document.getElementById('r-to')?.value||'';
  recFilter.bridge=document.getElementById('r-bridge')?.value??'';
  recFilter.prod=document.getElementById('r-prod')?.value||'';
  recFilter.dir=document.getElementById('r-dir')?.value||'';
  recFilter.showVoid=!!document.getElementById('r-void')?.checked;
  const prevCf=recFilter.cfId;
  recFilter.cfId=document.getElementById('r-cf')?.value||'';
  recFilter.cfVal=document.getElementById('r-cfv')?.value||'';
  if(prevCf!==recFilter.cfId) recFilter.cfVal='';   // switching field clears the value
  renderRecords();
}
function setRange(preset){
  const today=new Date(); const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  let from='',to=ymd(today);
  if(preset==='today'){ from=ymd(today); }
  else if(preset==='7'){ const d=new Date(today); d.setDate(d.getDate()-6); from=ymd(d); }
  else if(preset==='30'){ const d=new Date(today); d.setDate(d.getDate()-29); from=ymd(d); }
  else if(preset==='month'){ from=ymd(new Date(today.getFullYear(),today.getMonth(),1)); }
  else if(preset==='all'){ from=''; to=''; }
  recFilter.from=from; recFilter.to=to;
  const fEl=document.getElementById('r-from'), tEl=document.getElementById('r-to');
  if(fEl) fEl.value=from; if(tEl) tEl.value=to;
  renderRecords();
}
function filteredTxs(){
  return txs.filter(t=>{
    if(txIsVoid(t)&&!recFilter.showVoid) return false;
    if(recFilter.q){
      const cf=(t.custom||[]).map(c=>c.value).join(' ');
      const hay=[t.vehicleReg,t.product,t.customer,t.transporter,t.supplier,t.destination,t.driver,t.id,cf].join(' ').toLowerCase();
      if(!hay.includes(recFilter.q.toLowerCase()))return false;
    }
    if(recFilter.cfId&&recFilter.cfVal){
      const c=(t.custom||[]).find(x=>x.id===recFilter.cfId);
      if(!c||!String(c.value).toLowerCase().includes(recFilter.cfVal.toLowerCase()))return false;
    }
    const ymd=txYMD(t.completedAt);
    if(recFilter.from&&ymd<recFilter.from)return false;
    if(recFilter.to&&ymd>recFilter.to)return false;
    if(recFilter.bridge!==''&&String(t.bridge)!==String(recFilter.bridge))return false;
    if(recFilter.prod&&t.product!==recFilter.prod)return false;
    if(recFilter.dir&&txDir(t)!==recFilter.dir)return false;
    return true;
  });
}
function rangeLabel(){
  if(recFilter.from&&recFilter.to) return ' · '+recFilter.from+' → '+recFilter.to;
  if(recFilter.from) return ' · from '+recFilter.from;
  if(recFilter.to) return ' · up to '+recFilter.to;
  return ' · all dates';
}
function _reprintOK(t){
  if(!txIsVoid(t)) return true;
  return confirm('Ticket '+t.id+' is VOID.\n\nIt will print with a VOID stamp across it. Continue?');
}
function reprintThermal(id){const t=txs.find(x=>x.id===id);if(t&&_reprintOK(t)){auditLog('reprint','tx',id,(txIsVoid(t)?'Reprinted VOID thermal ':'Reprinted thermal ')+t.vehicleReg);printThermal(t);}}
function reprintA4(id){const t=txs.find(x=>x.id===id);if(t&&_reprintOK(t)){auditLog('reprint','tx',id,(txIsVoid(t)?'Reprinted VOID A4 ':'Reprinted A4 ')+t.vehicleReg);printA4(t);}}
function exportCSV(){
  // Never export a voided ticket, even with "Show voided" ticked on screen —
  // an export is what leaves the site and gets invoiced against.
  const f=filteredTxs().filter(t=>!txIsVoid(t));
  if(!f.length){toast('No records','error');return;}
  const u=cfg.weightUnit||'kg';
  const q=v=>{ let s=(v==null?'':String(v)).replace(/\r?\n/g,' '); return '"'+s.replace(/"/g,'""')+'"'; };
  const row=arr=>arr.map(q).join(',');
  // Resolve the human order NUMBER: from a matching order record, else the
  // free-typed order number stored on the tx. Never emit the internal id.
  const ordNo=t=>{
    if(t.orderId){ const o=orders.find(x=>x.id===t.orderId); if(o) return o.no||''; }
    return t.orderNoManual||'';
  };
  // Batch and Dispatch Ticket Nr: prefer the explicit fields set at 1st weigh,
  // fall back to the cfBatch custom field for older records.
  const cf=(t,id)=>((t.custom||[]).find(c=>c.id===id)||{}).value||'';
  const batchOf=t=>t.batchNo||cf(t,'cfBatch');
  const dispOf =t=>t.dispatchTicketNo||'';
  // Column order mirrors the client's spreadsheet exactly. One blank spacer
  // remains, at position 2. "Action" = load direction (from the 1st-weigh choice).
  // Weights run Empty, Full, Net after Reg. Dispatch Ticket Nr sits next to Batch.
  // 24 columns total.
  const cols=['Ticket','','Customer','Product','Action','Date','Time In','Time Out','Reg',
              'Empty Weight ('+u+')','Full Weight ('+u+')','Net ('+u+')',
              'Batch No','Dispatch Ticket Nr','Destination','Transporter','Order','Trailer 1','Trailer 2',
              'Seal No','Bridge','Operator','Driver','Supplier'];
  const lines=[];
  // report header block
  lines.push(row([(cfg.companyName||ISS_CO.name)+' Weighbridge — Records Report']));
  lines.push(row(['Site',cfg.siteName||cfg.companyName||ISS.name]));
  lines.push(row(['Period',(recFilter.from||'start')+' to '+(recFilter.to||'today')]));
  lines.push(row(['Generated',fmtDT(new Date().toISOString())]));
  lines.push('');
  lines.push(row(cols));
  let totNet=0,tot1=0,tot2=0;
  f.forEach(t=>{
    const net=t.net||0; totNet+=net; tot1+=t.firstWeight||0; tot2+=t.secondWeight||0;
    // Full = heavier weight, Empty = lighter — purely by mass, independent of
    // weigh order or direction. If a weight is missing, leave both blank.
    const w1=t.firstWeight, w2=t.secondWeight;
    const haveBoth=(w1!=null&&w2!=null);
    const full=haveBoth?Math.max(w1,w2):'';
    const empty=haveBoth?Math.min(w1,w2):'';
    lines.push(row([
      t.id, '', t.customer, t.product, txDirReport(t), fmtD(t.completedAt), fmtT(t.firstWeightTime), fmtT(t.secondWeightTime), t.vehicleReg,
      empty, full, net,
      batchOf(t), dispOf(t), t.destination, t.transporter, ordNo(t),
      cf(t,'cfTrl1'), cf(t,'cfTrl2'), cf(t,'cfSeal'), t.bridgeName, t.operatorName, t.driver, t.supplier
    ]));
  });
  // totals row: loads count in col 9, Net total under Net column = position 12
  lines.push(row(['TOTAL','','','','','','','',f.length+' loads','','',totNet]));
  lines.push(row(['','','','','','','','','','','Net tonnes',(totNet/1000).toFixed(3)]));
  // product summary
  const byProd={}; f.forEach(t=>{ byProd[t.product||'—']=(byProd[t.product||'—']||0)+(t.net||0); });
  lines.push('');
  lines.push(row(['Product Summary','Net ('+u+')','Tonnes']));
  Object.entries(byProd).sort((a,b)=>b[1]-a[1]).forEach(([p,n])=>lines.push(row([p,n,(n/1000).toFixed(3)])));

  const csv='\uFEFF'+lines.join('\r\n');   // BOM => Excel opens columns cleanly
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const tag=(recFilter.from||recFilter.to)?((recFilter.from||'')+'_'+(recFilter.to||'')):new Date().toISOString().slice(0,10);
  a.download=BRAND.filePrefix+'-Records-'+tag+'.csv';
  a.click(); URL.revokeObjectURL(a.href);
  auditLog('config','records','','Exported CSV ('+f.length+' rows)');
  toast('CSV exported — '+f.length+' rows, '+(totNet/1000).toFixed(2)+' t','success');
}
function printDailyReport(){
  const list=filteredTxs().filter(t=>!txIsVoid(t));
  if(!list.length){toast('No records to report','error');return;}
  const u=cfg.weightUnit||'kg';
  const tot=list.reduce((s,t)=>s+(t.net||0),0);
  const byProd={};list.forEach(t=>{byProd[t.product||'—']=(byProd[t.product||'—']||0)+(t.net||0);});
  const w=window.open('','_blank','width=900,height=760,scrollbars=yes');
  if(!w){toast('Allow pop-ups','error');return;}
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="color-scheme" content="light only"><title>${esc(BRAND.appName)} report</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#14201A;background:#fff;padding:22px;color-scheme:light;-webkit-print-color-adjust:exact}
    table{width:100%;border-collapse:collapse;margin:10px 0}th{padding:8px 10px;text-align:left;border-bottom:2px solid #D5E2DA;font-size:10px;color:#86968D;text-transform:uppercase;letter-spacing:.5px}td{padding:8px 10px;border-bottom:1px solid #F0F5F2}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}.stat{border:1px solid #D5E2DA;border-radius:8px;padding:12px;text-align:center;border-top:3px solid #00A551}
    .sv{font-size:24px;font-weight:900;font-family:monospace;color:#141414}.sl{font-size:10px;color:#86968D;font-weight:700;text-transform:uppercase;margin-top:3px}
    .np{text-align:center;padding:14px;border-top:1px dashed #ccc;margin-top:12px}@media print{.np{display:none}@page{margin:12mm}}</style>
    </head><body>
    ${ticketHeader('700px')}
    <h1 style="font-size:18px;font-weight:900;color:#FF6600;margin-bottom:4px">Weighbridge Report</h1>
    <div style="color:#86968D;font-size:11px;margin-bottom:4px">Generated: ${new Date().toLocaleString('en-ZA',{hour12:false})} · ${cfg.siteName||ISS.name}</div>
    <div style="color:#14201A;font-size:12px;font-weight:700;margin-bottom:14px">Period: ${(recFilter.from||'start')} to ${(recFilter.to||'today')}</div>
    <div class="grid">
      <div class="stat"><div class="sv">${list.length}</div><div class="sl">Transactions</div></div>
      <div class="stat"><div class="sv">${(tot/1000).toFixed(1)}t</div><div class="sl">Net Tonnes</div></div>
      <div class="stat"><div class="sv">${new Set(list.map(t=>t.vehicleReg)).size}</div><div class="sl">Vehicles</div></div>
      <div class="stat"><div class="sv">${new Set(list.map(t=>t.product).filter(Boolean)).size}</div><div class="sl">Products</div></div>
    </div>
    <h3 style="font-size:11px;font-weight:800;color:#141414;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Product Summary</h3>
    <table><thead><tr><th>Product</th><th>Net kg</th><th>Tonnes</th></tr></thead>
    <tbody>${Object.entries(byProd).sort((a,b)=>b[1]-a[1]).map(([p,n])=>`<tr><td>${esc(p)}</td><td style="font-family:monospace;font-weight:700">${fmt(n)}</td><td style="font-family:monospace">${(n/1000).toFixed(3)}</td></tr>`).join('')}</tbody></table>
    <h3 style="font-size:11px;font-weight:800;color:#141414;text-transform:uppercase;letter-spacing:.5px;margin:12px 0 6px">All Transactions</h3>
    <table><thead><tr><th>Ticket</th><th>Reg</th><th>Product</th><th>Customer</th><th>Net ${u}</th><th>Time</th></tr></thead>
    <tbody>${list.map(t=>`<tr><td style="font-family:monospace;font-size:10px;color:#86968D">${esc(t.id)}</td><td><b>${esc(t.vehicleReg)}</b></td><td>${esc(t.product||'—')}</td><td>${esc(t.customer||'—')}</td><td style="font-family:monospace;font-weight:700">${fmt(t.net)}</td><td style="font-size:11px;color:#86968D">${fmtDT(t.completedAt)}</td></tr>`).join('')}</tbody>
    <tfoot><tr style="border-top:2px solid #FF6600"><td colspan="4" style="font-weight:800;text-align:right;padding-top:10px">TOTAL NET (${list.length} loads)</td><td style="font-family:monospace;font-weight:900;color:#FF6600;padding-top:10px">${fmt(tot)} ${u}</td><td style="font-family:monospace;font-weight:700;padding-top:10px">${(tot/1000).toFixed(3)} t</td></tr></tfoot></table>
    <div class="np">
      <button onclick="window.print()" style="background:#141414;color:#fff;border:none;border-radius:6px;padding:11px 28px;font-size:14px;font-weight:700;cursor:pointer;margin-right:8px">🖨 Print Report</button>
      <button onclick="window.close()" style="background:#F0F5F2;color:#47594F;border:1.5px solid #D5E2DA;border-radius:6px;padding:11px 20px;font-size:14px;cursor:pointer">Close</button>
    </div>
    <script>window.onload=()=>setTimeout(()=>window.print(),600);<\/script></body></html>`);
  w.document.close();
}

