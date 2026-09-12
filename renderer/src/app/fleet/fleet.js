// ── FLEET ────────────────────────────────────────
// One record per truck. Shared with the other bridge, and auto-fills the
// weigh form so the clerk types a reg once and everything else appears.
function fleetFind(reg){
  const r=String(reg||'').trim().toUpperCase().replace(/\s+/g,'');
  if(!r) return null;
  return fleet.find(f=>String(f.reg||'').toUpperCase().replace(/\s+/g,'')===r)||null;
}
// ── HAULIER / TRANSPORTER INDEX ───────────────────────────────────────────
// The fleet list is flat, but the yard thinks in hauliers: "who does ABC
// Transport have running today", "send ABC their list to check". This groups
// the same records by transporter without duplicating any data — the fleet
// record stays the single source of truth.
const NO_HAULIER='— no transporter recorded —';
function haulierKey(t){ return String(t||'').trim() || NO_HAULIER; }
function haulierIndex(list){
  const idx={};
  (list||fleet).forEach(f=>{
    const k=haulierKey(f.transporter);
    (idx[k]=idx[k]||{name:k, trucks:[], drivers:{}, tare:0, tareN:0}).trucks.push(f);
    const d=String(f.driver||'').trim();
    if(d) idx[k].drivers[d]=(idx[k].drivers[d]||0)+1;
    if(f.tare){ idx[k].tare+=Number(f.tare); idx[k].tareN++; }
  });
  return Object.values(idx).sort((a,b)=>{
    if(a.name===NO_HAULIER) return 1;            // unknowns last
    if(b.name===NO_HAULIER) return -1;
    return b.trucks.length-a.trucks.length || a.name.localeCompare(b.name);
  });
}
function haulierList(){
  return [...new Set(fleet.map(f=>String(f.transporter||'').trim()).filter(Boolean))].sort();
}
/* Loads run for a haulier over the last 30 days — turns the list into
   something worth looking at rather than just a directory. */
function haulierLoads(name){
  const since=Date.now()-30*864e5;
  const regs=new Set(fleet.filter(f=>haulierKey(f.transporter)===name)
                          .map(f=>String(f.reg||'').toUpperCase().replace(/\s+/g,'')));
  let loads=0, net=0;
  txs.forEach(t=>{
    if(!t.completedAt || txIsVoid(t) || new Date(t.completedAt).getTime()<since) return;
    const r=String(t.vehicleReg||'').toUpperCase().replace(/\s+/g,'');
    const byReg=regs.has(r);
    const byName=name!==NO_HAULIER && String(t.transporter||'').trim()===name;
    if(byReg||byName){ loads++; net+=Number(t.net)||0; }
  });
  return {loads,net};
}
/* Export one workbook with a sheet per haulier — what you send out when you
   want every transporter to confirm their own list. */
function exportFleetByHaulier(){
  const groups=haulierIndex();
  if(!groups.length){ toast('No trucks to export','error'); return; }
  const sheets=groups.map(g=>({
    name:_sheetName(g.name),
    rows:[FLEET_TPL_COLS].concat(
      g.trucks.slice().sort((a,b)=>String(a.reg||'').localeCompare(String(b.reg||'')))
       .map(f=>[f.reg||'',f.trailer1||'',f.trailer2||'',f.driver||'',f.transporter||'',
                (f.tare===''||f.tare==null)?'':Number(f.tare)])),
    opts:{head:true,widths:[18,16,16,22,26,12]}
  }));
  try{
    _saveBlob(buildXLSX(sheets),'Fleet-by-Transporter-'+txYMD(nowISO())+'.xlsx');
    toast('Exported '+groups.length+' transporter'+(groups.length!==1?'s':''),'success');
  }catch(e){ console.error(e); toast('Could not build the workbook','error'); }
}
/* Excel sheet names: 31 chars, and : \ / ? * [ ] are illegal. */
function _sheetName(n){
  let x=String(n||'Sheet').replace(/[:\\\/?*\[\]]/g,'-').trim().slice(0,31);
  return x||'Sheet';
}
/* One haulier's list on its own — what you mail to that transporter. */
function exportHaulier(name){
  const g=haulierIndex().find(x=>x.name===name);
  if(!g){ toast('No trucks for that transporter','error'); return; }
  const rows=[FLEET_TPL_COLS].concat(
    g.trucks.slice().sort((a,b)=>String(a.reg||'').localeCompare(String(b.reg||'')))
     .map(f=>[f.reg||'',f.trailer1||'',f.trailer2||'',f.driver||'',f.transporter||'',
              (f.tare===''||f.tare==null)?'':Number(f.tare)]));
  try{
    _saveBlob(buildXLSX([
      {name:_sheetName(name),rows,opts:{head:true,widths:[18,16,16,22,26,12]}},
      {name:'Instructions',rows:FLEET_TPL_NOTE,opts:{widths:[16,80]}}
    ]),'Fleet-'+_sheetName(name).replace(/\s+/g,'-')+'-'+txYMD(nowISO())+'.xlsx');
    toast('Exported '+g.trucks.length+' truck'+(g.trucks.length!==1?'s':'')+' for '+name,'success');
  }catch(e){ console.error(e); toast('Could not build the workbook','error'); }
}

function renderFleet(){
  const q=(_fleetQ||'').toLowerCase();
  const hf=_fleetHaulier||'';
  const match=f=>(!q||[f.reg,f.trailer1,f.trailer2,f.transporter,f.driver].join(' ').toLowerCase().includes(q))
              && (!hf || haulierKey(f.transporter)===hf);
  const list=fleet.filter(match).sort((a,b)=>String(a.reg||'').localeCompare(String(b.reg||'')));
  const hauliers=haulierList();
  const tab=(id,l)=>`<button class="btn ${_fleetView===id?'btn-navy':'btn-light'} btn-sm" onclick="_fleetView='${id}';renderFleet()">${l}</button>`;

  document.getElementById('content').innerHTML=`
    <div class="sec-hd">
      <div><h2>Fleet</h2><div class="sub">${fleet.length} truck${fleet.length!==1?'s':''} · ${hauliers.length} transporter${hauliers.length!==1?'s':''} · shared with both weighbridges</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-light" onclick="downloadFleetTemplate()">⬇️ Template</button>
        <button class="btn btn-light" onclick="exportFleetList()">📄 Export List</button>
        <button class="btn btn-light" onclick="exportFleetByHaulier()">📚 Export by Transporter</button>
        <button class="btn btn-light" onclick="document.getElementById('fl-file').click()">📂 Import List</button>
        <button class="btn btn-navy" onclick="openFleetModal()">+ Add Truck</button>
      </div>
      <input type="file" id="fl-file" accept="${SHEET_ACCEPT}" style="display:none" onchange="importFleetList(this)"/>
    </div>
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        ${tab('trucks','🚛 All trucks')}${tab('hauliers','🏢 By transporter')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input id="fl-q" style="flex:2;min-width:200px" placeholder="🔍 Search reg, trailer, transporter, driver…" value="${esc(_fleetQ)}" oninput="_fleetQ=this.value;renderFleet();document.getElementById('fl-q')?.focus()"/>
        <select style="flex:1;min-width:170px" onchange="_fleetHaulier=this.value;renderFleet()">
          <option value="">All transporters</option>
          ${hauliers.map(h=>`<option value="${esc(h)}" ${hf===h?'selected':''}>${esc(h)}</option>`).join('')}
          <option value="${esc(NO_HAULIER)}" ${hf===NO_HAULIER?'selected':''}>${esc(NO_HAULIER)}</option>
        </select>
      </div>
    </div>
    ${_fleetView==='hauliers'?_fleetHaulierHTML(list):_fleetTableHTML(list)}`;
}
/* Flat truck table — the original view. */
function _fleetTableHTML(list){
  if(!list.length) return '<div class="empty"><div class="ico">🚛</div><p>'+
    (fleet.length?'No trucks match':'No trucks yet — add one and it will auto-fill the weigh form')+'</p></div>';
  return `<div class="card" style="padding:0;overflow-x:auto"><table class="tbl"><thead><tr>
      <th>Registration</th><th>Trailer 1</th><th>Trailer 2</th><th>Transporter</th><th>Driver</th><th>Tare</th><th></th>
    </tr></thead><tbody>${list.map(f=>`<tr>
      <td style="font-weight:800;font-family:var(--f-num);font-variant-numeric:tabular-nums">${esc(f.reg||'')}</td>
      <td>${esc(f.trailer1||'—')}</td>
      <td>${esc(f.trailer2||'—')}</td>
      <td>${f.transporter?esc(f.transporter):'<span style="color:var(--text3)">—</span>'}</td>
      <td>${esc(f.driver||'—')}</td>
      <td>${f.tare?esc(fmt(f.tare))+' '+esc(cfg.weightUnit||'kg'):'—'}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="openFleetModal('${f.id}')">✎</button>
        <button class="btn btn-red btn-sm" onclick="delFleet('${f.id}')">✕</button>
      </td></tr>`).join('')}</tbody></table></div>`;
}
/* One card per haulier: their trucks, their drivers, and what they have
   actually moved in the last 30 days. */
function _fleetHaulierHTML(list){
  const groups=haulierIndex(list);
  if(!groups.length) return '<div class="empty"><div class="ico">🏢</div><p>No transporters yet — import a fleet list with a Transporter column</p></div>';
  const u=cfg.weightUnit||'kg';
  return groups.map(g=>{
    const open=_fleetOpen[g.name]!==false;
    const st=haulierLoads(g.name);
    const drivers=Object.keys(g.drivers).sort();
    const unknown=g.name===NO_HAULIER;
    return `<div class="card" style="margin-bottom:10px;${unknown?'border-left:4px solid #FBBF24':''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
        <div style="cursor:pointer;flex:1;min-width:200px" onclick="_fleetOpen['${esc(g.name).replace(/'/g,"\\'")}']=${open?'false':'true'};renderFleet()">
          <div style="font-size:15px;font-weight:800;color:var(--ink)">${open?'▾':'▸'} ${esc(g.name)}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:3px">
            ${g.trucks.length} truck${g.trucks.length!==1?'s':''} ·
            ${drivers.length} driver${drivers.length!==1?'s':''}
            ${g.tareN?' · avg tare '+fmt(Math.round(g.tare/g.tareN))+' '+u:''}
          </div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px">
            Last 30 days: <b>${st.loads}</b> load${st.loads!==1?'s':''} · <b>${(st.net/1000).toFixed(1)}</b> t
          </div>
        </div>
        ${unknown?'':`<button class="btn btn-light btn-sm" onclick="exportHaulier('${esc(g.name).replace(/'/g,"\\'")}')">📄 Export</button>`}
      </div>
      ${unknown?'<div style="font-size:11px;color:var(--warn-ink);margin-top:6px">These trucks have no transporter on record. Edit them, or re-import with the Transporter column filled in.</div>':''}
      ${open?`<div style="margin-top:10px;overflow-x:auto"><table class="tbl"><thead><tr>
        <th>Registration</th><th>Trailer 1</th><th>Trailer 2</th><th>Driver</th><th>Tare</th><th></th>
      </tr></thead><tbody>${g.trucks.slice().sort((a,b)=>String(a.reg||'').localeCompare(String(b.reg||''))).map(f=>`<tr>
        <td style="font-weight:800;font-family:var(--f-num);font-variant-numeric:tabular-nums">${esc(f.reg||'')}</td>
        <td>${esc(f.trailer1||'—')}</td><td>${esc(f.trailer2||'—')}</td>
        <td>${esc(f.driver||'—')}</td>
        <td>${f.tare?esc(fmt(f.tare))+' '+esc(u):'—'}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn btn-ghost btn-sm" onclick="openFleetModal('${f.id}')">✎</button>
        </td></tr>`).join('')}</tbody></table></div>`:''}
    </div>`;
  }).join('');
}
let _fleetQ='', _fleetView='trucks', _fleetHaulier='', _fleetOpen={};
function openFleetModal(id){
  const f=fleet.find(x=>x.id===id)||{id:'',reg:'',trailer1:'',trailer2:'',transporter:'',driver:'',tare:''};
  const dlT=(db.transporters||[]).map(x=>`<option value="${esc(x.name)}">`).join('');
  const dlD=(db.drivers||[]).map(x=>`<option value="${esc(x.name)}">`).join('');
  openModal((id?'Edit Truck':'Add Truck'),`
    <datalist id="fm-dl-tr">${dlT}</datalist><datalist id="fm-dl-dr">${dlD}</datalist>
    <div class="field"><label>Registration *</label><input id="fm-reg" value="${esc(f.reg)}" placeholder="ABC 123 GP" style="text-transform:uppercase"/></div>
    <div class="row2">
      <div class="field"><label>Trailer 1</label><input id="fm-t1" value="${esc(f.trailer1)}" placeholder="TRL 456 GP"/></div>
      <div class="field"><label>Trailer 2</label><input id="fm-t2" value="${esc(f.trailer2)}" placeholder="TRL 789 GP"/></div>
    </div>
    <div class="row2">
      <div class="field"><label>Transporter</label><input id="fm-tr" value="${esc(f.transporter)}" list="fm-dl-tr"/></div>
      <div class="field"><label>Driver</label><input id="fm-dr" value="${esc(f.driver)}" list="fm-dl-dr"/></div>
    </div>
    <div class="field"><label>Tare weight (${esc(cfg.weightUnit||'kg')}) — optional</label><input id="fm-tare" type="number" value="${esc(f.tare)}" placeholder="e.g. 14300"/></div>
    <button class="btn btn-navy btn-full" style="margin-top:10px" onclick="saveFleetTruck('${id||''}')">${id?'Save Changes':'Add Truck'}</button>`);
}
function saveFleetTruck(id){
  const reg=(document.getElementById('fm-reg')?.value||'').trim().toUpperCase();
  if(!reg){toast('Registration is required','error');return;}
  const dup=fleet.find(f=>String(f.reg||'').toUpperCase()===reg && f.id!==id);
  if(dup){toast(reg+' is already in the fleet','error');return;}
  const rec={
    id:id||('fl'+Date.now().toString(36)),
    reg,
    trailer1:(document.getElementById('fm-t1')?.value||'').trim().toUpperCase(),
    trailer2:(document.getElementById('fm-t2')?.value||'').trim().toUpperCase(),
    transporter:(document.getElementById('fm-tr')?.value||'').trim(),
    driver:(document.getElementById('fm-dr')?.value||'').trim(),
    tare:parseFloat(document.getElementById('fm-tare')?.value)||'',
    _at:nowISO()
  };
  const i=fleet.findIndex(f=>f.id===rec.id);
  if(i>=0) fleet[i]=rec; else fleet.push(rec);
  saveFleet();
  auditLog(id?'edit':'create','fleet',rec.id,(id?'Updated ':'Added ')+reg+' to fleet');
  closeModal(); renderFleet(); toast(id?'Truck updated ✓':'Truck added ✓','success');
}
