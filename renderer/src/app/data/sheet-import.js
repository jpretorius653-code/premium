// ── FLEET IMPORT (Excel .xlsx / .csv) ─────────────
// .xlsx is a ZIP of XML. Electron/Chromium ships DecompressionStream('deflate-raw'),
// so we can read a real spreadsheet offline with no external library.
async function _inflateRaw(bytes){
  const ds=new DecompressionStream('deflate-raw');
  const stream=new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function _unzip(buf){
  const dv=new DataView(buf), u8=new Uint8Array(buf), files={};
  // find End Of Central Directory
  let eocd=-1;
  for(let i=u8.length-22;i>=0;i--){ if(dv.getUint32(i,true)===0x06054b50){eocd=i;break;} }
  if(eocd<0) throw new Error('Not a valid .xlsx (no ZIP directory)');
  const count=dv.getUint16(eocd+10,true);
  let p=dv.getUint32(eocd+16,true);
  for(let i=0;i<count;i++){
    if(dv.getUint32(p,true)!==0x02014b50) break;
    const method=dv.getUint16(p+10,true);
    const csize=dv.getUint32(p+20,true);
    const nameLen=dv.getUint16(p+28,true);
    const extraLen=dv.getUint16(p+30,true);
    const commLen=dv.getUint16(p+32,true);
    const lho=dv.getUint32(p+42,true);
    const name=new TextDecoder().decode(u8.subarray(p+46,p+46+nameLen));
    // local header -> data offset
    const lNameLen=dv.getUint16(lho+26,true), lExtraLen=dv.getUint16(lho+28,true);
    const dataStart=lho+30+lNameLen+lExtraLen;
    const raw=u8.subarray(dataStart,dataStart+csize);
    files[name]= method===0 ? Promise.resolve(raw) : _inflateRaw(raw);
    p+=46+nameLen+extraLen+commLen;
  }
  for(const k of Object.keys(files)) files[k]=await files[k];
  return files;
}
function _colToIdx(ref){ // "BC12" -> 54
  const m=/^([A-Z]+)/.exec(ref); if(!m) return 0;
  let n=0; for(const ch of m[1]) n=n*26+(ch.charCodeAt(0)-64);
  return n-1;
}
async function parseXLSX(buf){
  const files=await _unzip(buf);
  const dec=new TextDecoder();
  const P=new DOMParser();
  // shared strings
  let shared=[];
  if(files['xl/sharedStrings.xml']){
    const d=P.parseFromString(dec.decode(files['xl/sharedStrings.xml']),'application/xml');
    shared=[...d.getElementsByTagName('si')].map(si=>
      [...si.getElementsByTagName('t')].map(t=>t.textContent).join(''));
  }
  // first worksheet
  const sheetName=Object.keys(files).filter(n=>/^xl\/worksheets\/sheet\d*\.xml$/.test(n)).sort()[0];
  if(!sheetName) throw new Error('No worksheet found in workbook');
  const d=P.parseFromString(dec.decode(files[sheetName]),'application/xml');
  const rows=[];
  for(const row of d.getElementsByTagName('row')){
    const cells=[];
    for(const c of row.getElementsByTagName('c')){
      const idx=_colToIdx(c.getAttribute('r')||'A1');
      const t=c.getAttribute('t');
      let v='';
      if(t==='inlineStr'){ v=[...c.getElementsByTagName('t')].map(x=>x.textContent).join(''); }
      else{
        const vEl=c.getElementsByTagName('v')[0];
        if(vEl){ v=vEl.textContent; if(t==='s') v=shared[parseInt(v)]??''; }
      }
      cells[idx]=String(v).trim();
    }
    rows.push(cells);
  }
  return rows;
}
function parseCSVRows(text){
  const rows=[]; let cell='',row=[],q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){
      if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}
      else if(c==='"'){q=false;}
      else cell+=c;
    }else{
      if(c==='"')q=true;
      else if(c===','||c===';'||c==='\t'){row.push(cell);cell='';}
      else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell='';}
      else if(c!=='\r')cell+=c;
    }
  }
  if(cell||row.length){row.push(cell);rows.push(row);}
  return rows;
}
function normReg(s){ return String(s||'').trim().toUpperCase().replace(/\s+/g,' '); }
// Pick the registration column: prefer a header named reg/vehicle/fleet/plate, else col A.
function extractRegs(rows){
  if(!rows.length) return [];
  const hdr=(rows[0]||[]).map(c=>String(c||'').toLowerCase());
  let col=hdr.findIndex(h=>/reg|vehicle|fleet|plate|truck|horse/.test(h));
  let start=0;
  if(col>=0) start=1; else col=0;
  const out=[];
  for(let i=start;i<rows.length;i++){
    const v=normReg((rows[i]||[])[col]);
    if(v && !/^(reg|registration|vehicle|fleet|plate)$/i.test(v)) out.push(v);
  }
  return [...new Set(out)];
}
async function importFleetFile(input){
  const f=input.files&&input.files[0]; if(!f) return;
  try{
    let rows;
    if(/\.xlsx$/i.test(f.name)) rows=await parseXLSX(await f.arrayBuffer());
    else if(/\.(csv|txt|tsv)$/i.test(f.name)) rows=parseCSVRows(await f.text());
    else if(/\.xls$/i.test(f.name)){ toast('Old .xls not supported — save as .xlsx or .csv','error',6000); input.value=''; return; }
    else { toast('Use a .xlsx or .csv file','error'); input.value=''; return; }
    const regs=extractRegs(rows);
    if(!regs.length){ toast('No vehicle registrations found in that file','error',5000); input.value=''; return; }
    const ta=document.getElementById('o-fleet');
    const existing=(ta.value||'').split(/[\n,;]+/).map(normReg).filter(Boolean);
    const merged=[...new Set([...existing,...regs])];
    ta.value=merged.join('\n');
    const added=merged.length-existing.length;
    toast('✓ Imported '+regs.length+' registration'+(regs.length!==1?'s':'')+' ('+added+' new) from '+f.name,'success',5000);
  }catch(e){
    console.error(e);
    toast('Could not read file: '+(e.message||e),'error',6000);
  }
  input.value='';
}

/* Drop every registration belonging to one haulier into an order's fleet
   restriction. Saves typing 40 plates to lock an order to one transporter. */
function addHaulierToOrder(name){
  if(!name) return;
  const ta=document.getElementById('o-fleet'); if(!ta) return;
  const regs=fleet.filter(f=>String(f.transporter||'').trim()===name)
                  .map(f=>normReg(f.reg)).filter(Boolean);
  if(!regs.length){ toast('No trucks on record for '+name,'error'); return; }
  const have=(ta.value||'').split(/[\n,;]+/).map(normReg).filter(Boolean);
  const merged=[...new Set([...have,...regs])];
  ta.value=merged.join('\n');
  toast('Added '+(merged.length-have.length)+' of '+name+"'s "+regs.length+' trucks','success');
}

