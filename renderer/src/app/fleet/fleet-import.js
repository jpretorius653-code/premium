// ── FLEET TEMPLATE + BULK IMPORT ──────────────────────────────────────────
// The customer downloads a CSV template, fills it in in Excel and imports it
// back. Columns are matched by HEADER NAME, so the column order may change and
// extra columns are ignored. Any line whose registration starts with # is
// treated as a comment, which is how the worked examples in the template can
// sit in the file without becoming trucks.
const FLEET_TPL_COLS=['Registration','Trailer 1','Trailer 2','Driver','Transporter','Tare (kg)'];
function _csvCell(v){
  const s=String(v==null?'':v);
  return /[",\n\r;]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
const FLEET_TPL_NOTE=[
  ['How to use this sheet'],
  [''],
  ['1.','Type one truck per line on the "Fleet" sheet.'],
  ['2.','Only Registration is compulsory. Leave a cell blank if you do not have it —'],
  ['','a blank never wipes a detail already on record at the weighbridge.'],
  ['3.','Delete the two grey example lines before you send the sheet back.'],
  ['4.','Save the file, then open the app: Fleet \u2192 Import List, and pick this file.'],
  [''],
  ['What each column means'],
  ['Registration','The horse / rigid registration, exactly as it appears on the plate.'],
  ['Trailer 1','First trailer or link registration. Blank for a rigid.'],
  ['Trailer 2','Second trailer of a superlink. Blank otherwise.'],
  ['Driver','Usual driver. It is only a default — the clerk can change it on the day.'],
  ['Transporter','Transport company that runs the truck.'],
  ['Tare (kg)','Empty mass in kilograms, digits only. Optional.'],
  [''],
  ['You may add your own extra columns — anything the app does not recognise is ignored.'],
  ['The column order may also change; the headings are what matter, not the position.'],
];
function _fleetTplRows(){
  return [FLEET_TPL_COLS,
    ['# ABC 123 GP','TRL 456 GP','TRL 789 GP','John Dlamini','ABC Transport',14300],
    ['# DEF 456 MP','TRL 111 MP','','Sipho Nkosi','Sample Haulage',13800]];
}
function downloadFleetTemplate(){
  try{
    _saveBlob(buildXLSX([
      {name:'Fleet',rows:_fleetTplRows(),
       opts:{head:true,grey:[1,2],widths:[18,16,16,22,26,12]}},
      {name:'Instructions',rows:FLEET_TPL_NOTE,opts:{widths:[16,80]}}
    ]),'Fleet-Import-Template.xlsx');
    toast('Template downloaded — fill in the Fleet sheet, then Import List','success',5000);
  }catch(e){ console.error(e); downloadFleetTemplateCSV(); }
}
function downloadFleetTemplateCSV(){
  const rows=_fleetTplRows();
  const csv='\uFEFF'+rows.map(r=>r.map(_csvCell).join(',')).join('\r\n')+'\r\n';
  _saveBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),'Fleet-Import-Template.csv');
  toast('CSV template downloaded — delete the two # lines before importing','success',5000);
}
/* Export the live list in the SAME shape as the template, so the customer can
   pull it, edit it and send it straight back. */
function exportFleetList(){
  const rows=[FLEET_TPL_COLS].concat(
    fleet.slice().sort((a,b)=>String(a.reg||'').localeCompare(String(b.reg||'')))
      .map(f=>[f.reg||'',f.trailer1||'',f.trailer2||'',f.driver||'',f.transporter||'',
               (f.tare===''||f.tare==null)?'':Number(f.tare)]));
  const tag=txYMD(nowISO());
  try{
    _saveBlob(buildXLSX([{name:'Fleet',rows,opts:{head:true,widths:[18,16,16,22,26,12]}}]),
              'Fleet-List-'+tag+'.xlsx');
  }catch(e){
    _saveBlob(new Blob(['\uFEFF'+rows.map(r=>r.map(_csvCell).join(',')).join('\r\n')],
              {type:'text/csv;charset=utf-8'}),'Fleet-List-'+tag+'.csv');
  }
  toast('Exported '+fleet.length+' truck'+(fleet.length!==1?'s':''),'success');
}
/* One reader for both templates. Returns rows, or null after toasting. */
async function _readSheetFile(f){
  let rows;
  if(/\.xlsx$/i.test(f.name))               rows=await parseXLSX(await f.arrayBuffer());
  else if(/\.(csv|txt|tsv)$/i.test(f.name)) rows=parseCSVRows(await f.text());
  else if(/\.xls$/i.test(f.name)){ toast('Old .xls not supported — save as .xlsx or .csv','error',6000); return null; }
  else { toast('Use the template (.xlsx) or a .csv file','error'); return null; }
  rows=(rows||[]).filter(r=>r&&r.some(c=>String(c||'').trim()!==''));
  if(!rows.length){ toast('That file is empty','error'); return null; }
  return rows;
}
// Work out which column is which from the header row.
function _fleetColMap(hdr){
  const h=(hdr||[]).map(c=>String(c||'').toLowerCase().trim());
  const find=(re,skip)=>{
    for(let i=0;i<h.length;i++){ if(skip&&skip.indexOf(i)>=0) continue; if(re.test(h[i])) return i; }
    return -1;
  };
  const m={};
  m.trailer2   =find(/trailer\s*(2|b|two)/);        // find #2 first, so that
  m.trailer1   =find(/trailer|^trl/,                // #1 can be "any other
                     m.trailer2>=0?[m.trailer2]:null);// trailer column
  m.driver     =find(/driver/);
  m.transporter=find(/transport|carrier|hauli?er/);
  m.tare       =find(/tare|empty\s*(weight|mass)/);
  const used=[m.trailer1,m.trailer2,m.driver,m.transporter,m.tare].filter(i=>i>=0);
  m.reg        =find(/^reg|registration|horse|truck|vehicle|plate|fleet/,used);
  return m;
}
// A word that only ever appears in a heading, never in a number plate. Used to
// tell a real header row apart from a file that starts straight into data.
const FLEET_HDR_WORD=/^(reg|registration|vehicle|truck|horse|plate|fleet\s*(no|number)?)$/i;
let _fleetImport=null;
async function importFleetList(input){
  const f=input.files&&input.files[0]; if(!f) return;
  try{
    const rows=await _readSheetFile(f);
    if(!rows){ input.value=''; return; }

    // Header row, or does the file start straight into data? Treat row 1 as a
    // header when two or more columns are recognised, or when the registration
    // column is plainly a heading. Otherwise fall back to template order.
    let map=_fleetColMap(rows[0]), start=1;
    const hits=Object.keys(map).filter(k=>map[k]>=0).length;
    const regIsHeading=map.reg>=0 && FLEET_HDR_WORD.test(String(rows[0][map.reg]||'').trim());
    if(!(hits>=2 || regIsHeading)){ map={reg:0,trailer1:1,trailer2:2,driver:3,transporter:4,tare:5}; start=0; }
    if(map.reg<0) map.reg=0;

    const parsed=[], seen={};
    for(let i=start;i<rows.length;i++){
      const r=rows[i]||[];
      const cell=k=>(map[k]>=0)?String(r[map[k]]==null?'':r[map[k]]).trim():'';
      let reg=cell('reg');
      if(!reg || reg.charAt(0)==='#') continue;          // blank or comment line
      if(FLEET_HDR_WORD.test(reg)) continue;             // a repeated header inside the file
      reg=normReg(reg);
      if(seen[reg]) continue;                            // duplicated inside the file
      seen[reg]=1;
      const tare=parseFloat(cell('tare').replace(/[^\d.\-]/g,''));
      parsed.push({
        reg,
        trailer1:normReg(cell('trailer1')),
        trailer2:normReg(cell('trailer2')),
        driver:cell('driver'),
        transporter:cell('transporter'),
        tare:(isFinite(tare)&&tare>0)?tare:''
      });
    }
    if(!parsed.length){ toast('No vehicle registrations found in that file','error',5000); input.value=''; return; }
    _fleetImport=parsed;
    _fleetImportPreview(f.name);
  }catch(e){
    console.error(e);
    toast('Could not read file: '+(e.message||e),'error',6000);
  }
  input.value='';
}
// Show what will happen before anything is written.
function _fleetImportPreview(fname){
  const list=_fleetImport||[];
  const isNew=r=>!fleetFind(r.reg);
  const nNew=list.filter(isNew).length, nUpd=list.length-nNew;
  const body=list.slice(0,12).map(r=>`<tr>
      <td style="font-family:var(--f-num);font-variant-numeric:tabular-nums;font-weight:800">${esc(r.reg)}</td>
      <td>${esc(r.trailer1||'—')}</td><td>${esc(r.trailer2||'—')}</td>
      <td>${esc(r.driver||'—')}</td>
      <td>${(()=>{ const ex=fleetFind(r.reg);
        // A truck moving between hauliers is worth seeing before you commit.
        if(ex && r.transporter && ex.transporter && r.transporter!==ex.transporter)
          return '<span style="color:#FBBF24;font-weight:700">'+esc(ex.transporter)+' → '+esc(r.transporter)+'</span>';
        return esc(r.transporter||'—'); })()}</td>
      <td>${r.tare?esc(fmt(r.tare)):'—'}</td>
      <td style="font-weight:800;white-space:nowrap;color:${isNew(r)?'#34D399':'#FBBF24'}">${isNew(r)?'NEW':'UPDATE'}</td>
    </tr>`).join('');
  openModal('Import Fleet List',`
    <div style="font-size:13px;margin-bottom:10px"><b>${esc(fname)}</b><br/>
      ${list.length} truck${list.length!==1?'s':''} read —
      <b style="color:#34D399">${nNew} new</b>, <b style="color:#FBBF24">${nUpd} already on the list</b>.<br/>
      ${(()=>{ const hs=[...new Set(list.map(r=>r.transporter).filter(Boolean))];
               const none=list.filter(r=>!r.transporter).length;
               return 'Transporters in this file: <b>'+(hs.length||0)+'</b>'+
                      (hs.length?' — '+esc(hs.slice(0,4).join(', '))+(hs.length>4?' +'+(hs.length-4)+' more':''):'')+
                      (none?'<br/><span style="color:var(--warn-ink)">'+none+' row'+(none!==1?'s have':' has')+' no transporter — they will sit under “no transporter recorded”.</span>':'');
             })()}</div>
    <div style="max-height:280px;overflow:auto;border:1px solid var(--line-2);border-radius:8px">
      <table class="tbl"><thead><tr>
        <th>Registration</th><th>Trailer 1</th><th>Trailer 2</th><th>Driver</th><th>Transporter</th><th>Tare</th><th></th>
      </tr></thead><tbody>${body}</tbody></table></div>
    ${list.length>12?`<div style="font-size:11px;color:var(--text3);margin-top:6px">…and ${list.length-12} more</div>`:''}
    <div style="font-size:11px;color:var(--text3);margin-top:8px">
      A blank cell is left alone — an import never wipes a detail that is already on record.
      New drivers and transporters are added to the Database lists as well.</div>
    <button class="btn btn-navy btn-full" style="margin-top:12px" onclick="commitFleetImport()">Import ${list.length} truck${list.length!==1?'s':''}</button>`);
}
function _dbEnsure(cat,name){
  const n=String(name||'').trim(); if(!n) return false;
  if(!Array.isArray(db[cat])) db[cat]=[];
  if(db[cat].some(x=>String(x.name||'').trim().toLowerCase()===n.toLowerCase())) return false;
  db[cat].push({name:n}); return true;
}
function commitFleetImport(){
  const list=_fleetImport||[];
  if(!list.length){ closeModal(); return; }
  let added=0, updated=0, dbNew=0, seq=0;
  const stamp=Date.now().toString(36);
  list.forEach(r=>{
    const ex=fleetFind(r.reg);
    if(ex){
      let changed=false;
      ['trailer1','trailer2','driver','transporter'].forEach(k=>{
        if(r[k] && r[k]!==ex[k]){ ex[k]=r[k]; changed=true; }
      });
      if(r.tare && Number(r.tare)!==Number(ex.tare)){ ex.tare=r.tare; changed=true; }
      if(changed){ ex._at=nowISO(); updated++; }
    }else{
      fleet.push({
        id:'fl'+stamp+(seq++).toString(36),
        reg:r.reg, trailer1:r.trailer1, trailer2:r.trailer2,
        transporter:r.transporter, driver:r.driver, tare:r.tare, _at:nowISO()
      });
      added++;
    }
    if(_dbEnsure('transporters',r.transporter)) dbNew++;
    if(_dbEnsure('drivers',r.driver)) dbNew++;
  });
  saveFleet(); if(dbNew) saveDB();
  auditLog('create','fleet','','Imported fleet list — '+added+' added, '+updated+' updated');
  _fleetImport=null;
  closeModal(); renderFleet();
  toast('✓ Fleet imported — '+added+' added, '+updated+' updated','success',6000);
}

function delFleet(id){
  const f=fleet.find(x=>x.id===id);
  if(!confirm('Remove '+(f?.reg||'this truck')+' from the fleet?\n\nExisting records keep their details.'))return;
  fleet=fleet.filter(x=>x.id!==id);
  saveFleet(); shareDel('fleet',id);
  auditLog('delete','fleet',id,'Removed '+(f?.reg||id)+' from fleet');
  renderFleet();
}

