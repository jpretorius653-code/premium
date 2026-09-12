// ── XLSX WRITER ───────────────────────────────────────────────────────────
// A CSV has no column widths, no bold header and no second sheet to put the
// instructions on — which is exactly why the old template read as a wall of
// commas. An .xlsx is a ZIP of XML, and ZIP allows STORED (uncompressed)
// entries, so a workbook can be built here with no library and no
// CompressionStream: just a CRC32 and the right headers.
function _crc32(u8){
  let t=_crc32.t;
  if(!t){ t=_crc32.t=new Int32Array(256);
    for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[n]=c; } }
  let crc=-1;
  for(let i=0;i<u8.length;i++) crc=(crc>>>8)^t[(crc^u8[i])&0xFF];
  return (crc^-1)>>>0;
}
function _zipStore(files){
  const enc=new TextEncoder(), parts=[], cd=[];
  let off=0;
  const d=new Date();
  const dosT=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xFFFF;
  const dosD=((((d.getFullYear()-1980)&0x7F)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF;
  files.forEach(f=>{
    const name=enc.encode(f.name), data=f.data, crc=_crc32(data);
    const lfh=new Uint8Array(30+name.length), lv=new DataView(lfh.buffer);
    lv.setUint32(0,0x04034b50,true); lv.setUint16(4,20,true); lv.setUint16(6,0,true);
    lv.setUint16(8,0,true); lv.setUint16(10,dosT,true); lv.setUint16(12,dosD,true);
    lv.setUint32(14,crc,true); lv.setUint32(18,data.length,true); lv.setUint32(22,data.length,true);
    lv.setUint16(26,name.length,true); lv.setUint16(28,0,true);
    lfh.set(name,30);
    parts.push(lfh,data);
    const c=new Uint8Array(46+name.length), cv=new DataView(c.buffer);
    cv.setUint32(0,0x02014b50,true); cv.setUint16(4,20,true); cv.setUint16(6,20,true);
    cv.setUint16(8,0,true); cv.setUint16(10,0,true); cv.setUint16(12,dosT,true); cv.setUint16(14,dosD,true);
    cv.setUint32(16,crc,true); cv.setUint32(20,data.length,true); cv.setUint32(24,data.length,true);
    cv.setUint16(28,name.length,true); cv.setUint32(42,off,true);
    c.set(name,46); cd.push(c);
    off+=lfh.length+data.length;
  });
  const cdSize=cd.reduce((a,b)=>a+b.length,0);
  const eo=new Uint8Array(22), ev=new DataView(eo.buffer);
  ev.setUint32(0,0x06054b50,true); ev.setUint16(8,files.length,true); ev.setUint16(10,files.length,true);
  ev.setUint32(12,cdSize,true); ev.setUint32(16,off,true);
  const all=parts.concat(cd,[eo]);
  const out=new Uint8Array(all.reduce((a,b)=>a+b.length,0));
  let q=0; all.forEach(b=>{ out.set(b,q); q+=b.length; });
  return out;
}
function _xesc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _colName(i){ let s=''; i++; while(i>0){ const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26); } return s; }
/* rows = array of arrays. o.head = style row 1 as a bold, frozen header. */
function _sheetXML(rows,o){
  o=o||{};
  const view=o.head?'<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>':'';
  const cols=o.widths?'<cols>'+o.widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols>':'';
  const body=(rows||[]).map((r,ri)=>{
    const cells=(r||[]).map((v,ci)=>{
      if(v==null||v==='') return '';
      const ref=_colName(ci)+(ri+1);
      const st=(o.head&&ri===0)?' s="1"':(o.grey&&o.grey.indexOf(ri)>=0?' s="2"':'');
      if(typeof v==='number'&&isFinite(v)) return '<c r="'+ref+'"'+st+'><v>'+v+'</v></c>';
      return '<c r="'+ref+'"'+st+' t="inlineStr"><is><t xml:space="preserve">'+_xesc(v)+'</t></is></c>';
    }).join('');
    return '<row r="'+(ri+1)+'">'+cells+'</row>';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    view+cols+'<sheetData>'+body+'</sheetData></worksheet>';
}
const _XLSX_STYLES='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
 '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font>'+
 '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'+
 '<font><i/><sz val="10"/><color rgb="FF808080"/><name val="Calibri"/></font></fonts>'+
 '<fills count="3"><fill><patternFill patternType="none"/></fill>'+
 '<fill><patternFill patternType="gray125"/></fill>'+
 '<fill><patternFill patternType="solid"><fgColor rgb="FF1A3A6B"/><bgColor indexed="64"/></patternFill></fill></fills>'+
 '<borders count="1"><border/></borders>'+
 '<cellStyleXfs count="1"><xf/></cellStyleXfs>'+
 '<cellXfs count="3"><xf xfId="0"/>'+
 '<xf xfId="0" fontId="1" fillId="2" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>'+
 '<xf xfId="0" fontId="2" applyFont="1"/></cellXfs>'+
 '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
/* sheets = [{name, rows, opts}] — the FIRST sheet is the one the importer reads. */
function buildXLSX(sheets){
  const enc=new TextEncoder(), E=x=>enc.encode(x);
  const n=sheets.length;
  const ct='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
    '<Default Extension="xml" ContentType="application/xml"/>'+
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
    sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const wb='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '+
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+
    sheets.map((s,i)=>'<sheet name="'+_xesc(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+
    '</sheets></workbook>';
  const wbRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+
    '<Relationship Id="rId'+(n+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const files=[
    {name:'[Content_Types].xml',data:E(ct)},
    {name:'_rels/.rels',data:E(rels)},
    {name:'xl/workbook.xml',data:E(wb)},
    {name:'xl/_rels/workbook.xml.rels',data:E(wbRels)},
    {name:'xl/styles.xml',data:E(_XLSX_STYLES)},
  ];
  sheets.forEach((s,i)=>files.push({name:'xl/worksheets/sheet'+(i+1)+'.xml',data:E(_sheetXML(s.rows,s.opts))}));
  return new Blob([_zipStore(files)],
    {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function _saveBlob(blob,name){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}
// Android is fussy about bare extensions in accept=, so name the MIME types too.
const SHEET_ACCEPT='.csv,.xlsx,.txt,.tsv,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

