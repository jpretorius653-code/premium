// ── ORDER TEMPLATE + BULK IMPORT ──────────────────────────────────────────
// Same idea as the fleet list: the customer books a month of orders in a
// spreadsheet on their phone and sends it in, instead of dictating them.
const ORDER_TPL_COLS=['Order No','Customer','Product','Supplier','Destination','Transporter','Target (tonnes)','Vehicle Regs'];
const ORDER_TPL_NOTE=[
  ['How to use this sheet'],
  [''],
  ['1.','One order per line on the "Orders" sheet.'],
  ['2.','Order No is the only compulsory column. An order number that already'],
  ['','exists is updated rather than duplicated.'],
  ['3.','Delete the two grey example lines before you send the sheet back.'],
  ['4.','In the app: Orders \u2192 Import Orders, and pick this file.'],
  [''],
  ['What each column means'],
  ['Order No','Your reference. This is what the clerk picks on the weigh screen.'],
  ['Customer','Who the load belongs to.'],
  ['Product','Grade or product name, e.g. Peas, Duff, RB1.'],
  ['Supplier','Where the material comes from. Optional.'],
  ['Destination','Where it is going. Optional.'],
  ['Transporter','Default transporter for the order. Optional.'],
  ['Target (tonnes)','The order closes itself once this tonnage is loaded. Blank = open-ended.'],
  ['Vehicle Regs','Restrict the order to these trucks — separate with a semicolon:'],
  ['','ABC 123 GP; DEF 456 MP.  Blank means any vehicle may load it.'],
];
function _orderTplRows(){
  return [ORDER_TPL_COLS,
    ['# ORD-1001','Eskom Kendal','Peas','Sample Supplier (Pty) Ltd','Kendal Power Station','ABC Transport',5000,'ABC 123 GP; DEF 456 MP'],
    ['# ORD-1002','Glencore','Duff','','Richards Bay','',12000,'']];
}
function downloadOrderTemplate(){
  try{
    _saveBlob(buildXLSX([
      {name:'Orders',rows:_orderTplRows(),opts:{head:true,grey:[1,2],widths:[14,22,16,22,24,22,16,34]}},
      {name:'Instructions',rows:ORDER_TPL_NOTE,opts:{widths:[18,80]}}
    ]),'Order-Import-Template.xlsx');
    toast('Template downloaded — fill in the Orders sheet, then Import Orders','success',5000);
  }catch(e){
    const csv='\uFEFF'+_orderTplRows().map(r=>r.map(_csvCell).join(',')).join('\r\n')+'\r\n';
    _saveBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),'Order-Import-Template.csv');
    toast('CSV template downloaded','success',5000);
  }
}
function exportOrderList(){
  const rows=[ORDER_TPL_COLS].concat(orders.map(o=>[
    o.no||'',o.customer||'',o.product||'',o.supplier||'',o.destination||'',o.transporter||'',
    o.targetKg?Number((o.targetKg/1000).toFixed(3)):'', (o.fleet||[]).join('; ')]));
  try{ _saveBlob(buildXLSX([{name:'Orders',rows,opts:{head:true,widths:[14,22,16,22,24,22,16,34]}}]),
                 'Orders-'+txYMD(nowISO())+'.xlsx'); }
  catch(e){ _saveBlob(new Blob(['\uFEFF'+rows.map(r=>r.map(_csvCell).join(',')).join('\r\n')],
                 {type:'text/csv;charset=utf-8'}),'Orders-'+txYMD(nowISO())+'.csv'); }
  toast('Exported '+orders.length+' order'+(orders.length!==1?'s':''),'success');
}
function _orderColMap(hdr){
  const h=(hdr||[]).map(c=>String(c||'').toLowerCase().trim());
  const find=(re,skip)=>{ for(let i=0;i<h.length;i++){ if(skip&&skip.indexOf(i)>=0) continue; if(re.test(h[i])) return i; } return -1; };
  const m={};
  m.no         =find(/order|^no$|reference|ref\b/);
  m.customer   =find(/customer|client|buyer/);
  m.product    =find(/product|grade|material|commodity/);
  m.supplier   =find(/supplier|source|mine|colliery/);
  m.destination=find(/destination|deliver|to\b|discharge/);
  m.transporter=find(/transport|carrier|hauli?er/);
  m.target     =find(/target|tonn|tons|quantity|qty/);
  m.regs       =find(/reg|vehicle|truck|fleet|plate/);
  return m;
}
let _orderImport=null;
async function importOrderList(input){
  const f=input.files&&input.files[0]; if(!f) return;
  try{
    let rows=await _readSheetFile(f);
    if(!rows){ input.value=''; return; }
    let map=_orderColMap(rows[0]), start=1;
    const hits=Object.keys(map).filter(k=>map[k]>=0).length;
    if(hits<2){ map={no:0,customer:1,product:2,supplier:3,destination:4,transporter:5,target:6,regs:7}; start=0; }
    if(map.no<0) map.no=0;
    const parsed=[], seen={};
    for(let i=start;i<rows.length;i++){
      const r=rows[i]||[];
      const cell=k=>(map[k]>=0)?String(r[map[k]]==null?'':r[map[k]]).trim():'';
      const no=cell('no');
      if(!no || no.charAt(0)==='#') continue;
      if(/^(order|order\s*no|reference)$/i.test(no)) continue;
      if(seen[no.toUpperCase()]) continue;
      seen[no.toUpperCase()]=1;
      const tn=parseFloat(cell('target').replace(/[^\d.\-]/g,''));
      parsed.push({
        no, customer:cell('customer'), product:cell('product'), supplier:cell('supplier'),
        destination:cell('destination'), transporter:cell('transporter'),
        targetKg:(isFinite(tn)&&tn>0)?Math.round(tn*1000):null,
        fleet:cell('regs').split(/[;,\n|]+/).map(normReg).filter(Boolean)
      });
    }
    if(!parsed.length){ toast('No order numbers found in that file','error',5000); input.value=''; return; }
    _orderImport=parsed;
    _orderImportPreview(f.name);
  }catch(e){ console.error(e); toast('Could not read file: '+(e.message||e),'error',6000); }
  input.value='';
}
function _orderImportPreview(fname){
  const list=_orderImport||[];
  const isNew=o=>!orders.find(x=>String(x.no)===String(o.no));
  const nNew=list.filter(isNew).length;
  const body=list.slice(0,12).map(o=>`<tr>
      <td style="font-weight:800">${esc(o.no)}</td><td>${esc(o.customer||'—')}</td>
      <td>${esc(o.product||'—')}</td><td>${o.targetKg?esc((o.targetKg/1000).toFixed(1))+' t':'—'}</td>
      <td>${o.fleet.length?esc(String(o.fleet.length))+' regs':'any'}</td>
      <td style="font-weight:800;white-space:nowrap;color:${isNew(o)?'#34D399':'#FBBF24'}">${isNew(o)?'NEW':'UPDATE'}</td>
    </tr>`).join('');
  openModal('Import Orders',`
    <div style="font-size:13px;margin-bottom:10px"><b>${esc(fname)}</b><br/>
      ${list.length} order${list.length!==1?'s':''} read —
      <b style="color:#34D399">${nNew} new</b>, <b style="color:#FBBF24">${list.length-nNew} existing</b>.</div>
    <div style="max-height:280px;overflow:auto;border:1px solid var(--line-2);border-radius:8px">
      <table class="tbl"><thead><tr><th>Order</th><th>Customer</th><th>Product</th><th>Target</th><th>Fleet</th><th></th></tr></thead>
      <tbody>${body}</tbody></table></div>
    ${list.length>12?`<div style="font-size:11px;color:var(--text3);margin-top:6px">…and ${list.length-12} more</div>`:''}
    <div style="font-size:11px;color:var(--text3);margin-top:8px">A blank cell leaves the existing value alone. Loaded tonnage on an existing order is not touched.</div>
    <button class="btn btn-navy btn-full" style="margin-top:12px" onclick="commitOrderImport()">Import ${list.length} order${list.length!==1?'s':''}</button>`);
}
function commitOrderImport(){
  const list=_orderImport||[];
  if(!list.length){ closeModal(); return; }
  let added=0, updated=0, dbNew=0, seq=0;
  const stamp=Date.now();
  list.forEach(o=>{
    const ex=orderByNo(o.no);
    if(ex){
      let ch=false;
      ['customer','product','supplier','destination','transporter'].forEach(k=>{
        if(o[k] && o[k]!==ex[k]){ ex[k]=o[k]; ch=true; } });
      if(o.targetKg && o.targetKg!==ex.targetKg){ ex.targetKg=o.targetKg; ch=true; }
      if(o.fleet.length){ ex.fleet=o.fleet; ch=true; }
      if(ch){ ex._at=nowISO(); updated++; }
    }else{
      orders.unshift({id:'O'+(stamp+seq++),created:nowISO(),no:o.no,customer:o.customer,
        product:o.product,supplier:o.supplier,destination:o.destination,transporter:o.transporter,
        rate:null,targetKg:o.targetKg,fleet:o.fleet,active:true,_at:nowISO()});
      added++;
    }
    if(_dbEnsure('customers',o.customer)) dbNew++;
    if(_dbEnsure('products',o.product)) dbNew++;
    if(_dbEnsure('suppliers',o.supplier)) dbNew++;
    if(_dbEnsure('destinations',o.destination)) dbNew++;
    if(_dbEnsure('transporters',o.transporter)) dbNew++;
  });
  saveOrders(); if(dbNew) saveDB();
  auditLog('create','order','','Imported orders — '+added+' added, '+updated+' updated');
  _orderImport=null; closeModal(); renderOrdersTab();
  toast('\u2713 Orders imported — '+added+' added, '+updated+' updated','success',6000);
}

