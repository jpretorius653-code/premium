// ── TICKET HEADER ───────────────────────────────

/* ── AXLE / DECK ROWS ON THE TICKET ─────────────────────────────────────
   Uses the snapshot taken at weigh time (tx.decks1 / tx.decks2), NOT live
   state — so a reprint months later shows the same numbers as the original.
   Returns [] when the ticket has no deck data, so single-deck sites and any
   ticket taken before this version print exactly as they always did. */
/* Which decks (if any) belong on this ticket.
   TWO RULES, both set by the client:
     1. Axle weights print on DISPATCH tickets only. A receive ticket never
        shows them, however the load was weighed.
     2. Weights ONLY — no axle-group name, no legal limit, no tolerance and
        no OVER wording. The overload check stays on screen for the operator;
        it is not a statement the ticket makes to the driver.
   Returns [] when there is nothing to print, so single-deck sites and every
   ticket taken before this version print exactly as they always did. */
function ticketDeckSnapshot(tx){
  if(txDir(tx)!=='dispatch') return null;              // rule 1
  return (Array.isArray(tx.decks2)&&tx.decks2.some(v=>v!=null)) ? tx.decks2
       : (Array.isArray(tx.decks1)&&tx.decks1.some(v=>v!=null)) ? tx.decks1 : null;
}
function ticketDeckRows(tx){
  const which=ticketDeckSnapshot(tx);
  if(!which) return [];
  const u=cfg.weightUnit||'kg', rows=[];
  which.forEach((w,i)=>{
    const slot=DECK_SLOTS[i]; if(!slot||w==null) return;
    rows.push([slot.l, fmt(w)+' '+u]);                 // rule 2
  });
  return rows;
}
/* Same data, condensed for a 32-column thermal roll. */
function ticketDeckRowsNarrow(tx){
  const which=ticketDeckSnapshot(tx);
  if(!which) return [];
  const rows=[];
  which.forEach((w,i)=>{
    const slot=DECK_SLOTS[i]; if(!slot||w==null) return;
    rows.push([slot.l, fmt(w)]);
  });
  return rows;
}

function ticketHeader(width='540px'){
  const imgH=Math.round((width==='80mm'?44:64)*((cfg.ticket&&cfg.ticket.logoScale)||1));
  const t=cfg.ticket||{};
  const accent=t.accentColor||'#00A551';
  // Everything on the ticket is user-editable (Settings → Ticket). No hardcoded
  // fallbacks — a blank field simply doesn't print that line.
  const co=(t.companyName??'').trim();
  const addr=(t.address??'').trim(), vat=(t.vat??'').trim(), reg=(t.reg??'').trim();
  const tel=(t.phone??'').trim(), email=(t.email??'').trim(), tag=(t.tagline??'').trim();
  return`<div style="text-align:center;border-bottom:3px solid ${accent};padding-bottom:10px;margin-bottom:10px">
    ${t.showLogo!==false?`<div style="display:flex;justify-content:center;margin-bottom:6px"><img src="${t.logo||LOGO_IMG}" style="max-height:${imgH}px;max-width:100%;width:auto;height:auto;display:block"/></div>`:''}
    ${co?`<div style="font-size:${width==='80mm'?'12':'14'}px;font-weight:800;color:${accent};letter-spacing:.3px">${esc(co)}</div>`:''}
    <div style="font-size:${width==='80mm'?'9':'10'}px;color:#47594F;line-height:1.6;margin-top:3px">
      ${vat?`<div><b>VAT No:</b> ${esc(vat)}</div>`:''}
      ${addr?`<div>${esc(addr)}</div>`:''}
      ${reg?`<div>Reg: ${esc(reg)}</div>`:''}
      ${tel?`<div>Tel: ${esc(tel)}</div>`:''}
      ${email?`<div>${esc(email)}</div>`:''}
      ${tag?`<div style="color:${accent};font-weight:700">${esc(tag)}</div>`:''}
    </div>
  </div>`;
}

// ── ESC/POS raw thermal (proper cutter, no browser dialog) ──
async function escposPrint(tx){
  if(!('serial' in navigator)){ return false; }
  try{
    const port=await navigator.serial.requestPort();
    await port.open({baudRate:parseInt(cfg.escposBaud)||9600});
    const enc=new TextEncoder();
    const w=port.writable.getWriter();
    const ESC='\x1B', GS='\x1D';
    const u=cfg.weightUnit||'kg';
    const net=tx.net??Math.abs((tx.secondWeight||0)-(tx.firstWeight||0));
    let out='';
    out+=ESC+'@';                    // init
    out+=ESC+'a'+'\x01';            // center
    out+=ESC+'!'+'\x18';            // double height/width
    const T=cfg.ticket||{};
    if((T.companyName||'').trim()) out+=(T.companyName).trim()+'\n';
    out+=ESC+'!'+'\x00';            // normal
    { const g=k=>((T[k]||'').trim());
      if(g('vat'))     out+='VAT No: '+g('vat')+'\n';
      if(g('address')) out+=g('address')+'\n';
      if(g('reg'))     out+='Reg: '+g('reg')+'\n';
      if(g('phone'))   out+='Tel: '+g('phone')+'\n';
      if(g('email'))   out+=g('email')+'\n';
      if(g('tagline')) out+=g('tagline')+'\n'; }
    out+='--------------------------------\n';
    out+=ESC+'a'+'\x00';            // left
    const row=(l,v)=>l.padEnd(14)+String(v)+'\n';
    out+=ESC+'a'+'\x01'+ESC+'!'+'\x10'+tx.vehicleReg+'\n'+ESC+'!'+'\x00'+ESC+'a'+'\x00';
    out+='--------------------------------\n';
    out+=row('1st Weight',fmt(tx.firstWeight)+' '+u);
    out+=row('2nd Weight',fmt(tx.secondWeight)+' '+u);
    { const dr=ticketDeckRowsNarrow(tx);
      if(dr.length){
        out+='--------------------------------\n';
        out+='AXLE WEIGHTS ('+u+')\n';
        dr.forEach(r=>{ out+=row(r[0],r[1]); });
      } }
    out+=ESC+'a'+'\x01'+ESC+'!'+'\x18'+'NET '+fmt(net)+' '+u+'\n'+ESC+'!'+'\x00'+ESC+'a'+'\x00';
    out+='--------------------------------\n';
    if(tx.product) out+=row('Product',tx.product);
    if(tx.customer)out+=row('Customer',tx.customer);
    if(tx.transporter)out+=row('Transporter',tx.transporter);
    if(tx.orderId) out+=row('Order',(orders.find(o=>o.id===tx.orderId)?.no)||tx.orderId);
    out+=row('Operator',tx.operatorName||'');
    out+=row('Date',fmtDT(tx.completedAt));
    out+='\n'+ESC+'a'+'\x01'+POWERED_BY+'\n\n\n';
    out+=GS+'V'+'\x42'+'\x00';     // partial cut
    await w.write(enc.encode(out));
    w.releaseLock();
    await port.close();
    return true;
  }catch(e){ console.warn('ESC/POS failed:',e.message); return false; }
}

// ── THERMAL TICKET ──────────────────────────────
async function printThermal(tx){
  // ESC/POS raw mode first if enabled
  if(cfg.escposMode){
    const ok=await escposPrint(tx);
    if(ok){ toast('Printed to thermal printer (cut) ✓','success'); return; }
    toast('ESC/POS failed — opening browser print','info');
  }
  renderTicket(tx,'thermal');
}
function printA4(tx){ renderTicket(tx,'A4'); }

// ══════════════════════════════════════════════════════════
// UNIFIED TICKET RENDERER — uses the ticket builder config.
// Larger, readable fonts. Templates: standard | compact | detailed.
// Always prints via the Windows DEFAULT printer (browser print).
// ══════════════════════════════════════════════════════════
// ── Ticket QR (receiving-side allocation) ──
// Encodes human-readable ticket info so the receiver can scan with any phone
// and allocate the truck to the correct offloading point. No server needed.
function nsQRSVG(text){
  if(typeof qrcode==='undefined') return '';
  let qr=null;
  // Prefer error-correction M, then L — FEWER modules = bigger squares = scans on
  // a thermal printer. (Q first made it needlessly dense.)
  for(const lvl of ['M','L','Q','H']){
    try{ const q=qrcode(0,lvl); q.addData(text); q.make(); qr=q; break; }catch(e){}
  }
  if(!qr) return '';
  const n=qr.getModuleCount();
  const q=4;                     // REQUIRED quiet zone — without it, scanners fail
  const sz=n+q*2;
  let d='';
  for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(qr.isDark(r,c)) d+='M'+(c+q)+' '+(r+q)+'h1v1h-1z';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+sz+' '+sz+'" shape-rendering="crispEdges" width="100%" height="100%">'+
         '<rect width="'+sz+'" height="'+sz+'" fill="#fff"/><path d="'+d+'" fill="#000"/></svg>';
}
function nsTicketQRText(tx){
  const u=cfg.weightUnit||'kg';
  const t=cfg.ticket||{};
  const net=tx.net??Math.abs((tx.secondWeight||0)-(tx.firstWeight||0));
  const ordNo=tx.orderId?((orders.find(o=>o.id===tx.orderId)?.no)||tx.orderId):'';
  // Cap each free-text field so the QR can't balloon in density (long customer/
  // transporter names would otherwise make it unscannable on thermal). Full,
  // untruncated detail is printed on the ticket itself.
  const cap=(v,n=24)=>{v=String(v||'').trim(); return v.length>n?v.slice(0,n-1)+'…':v;};
  const L=[];
  if((t.companyName||'').trim()) L.push(cap(t.companyName,28));
  L.push('Ticket '+(tx.id||''));
  L.push('Date '+fmtDT(tx.completedAt));
  L.push('Reg '+(tx.vehicleReg||''));
  if(ordNo)          L.push('Order '+cap(ordNo,20));
  if(tx.product)     L.push('Product '+cap(tx.product));
  if(tx.customer)    L.push('Customer '+cap(tx.customer));
  if(tx.transporter) L.push('Transporter '+cap(tx.transporter));
  if(tx.destination) L.push('Destination '+cap(tx.destination));
  L.push('Net '+fmt(net)+' '+u);
  return L.join('\n');
}
function nsTicketQRBlock(tx,t,px,accent){
  if(!t.showQR) return '';
  const svg=nsQRSVG(nsTicketQRText(tx));
  if(!svg) return '';
  const size=Math.max(175,px);   // floor: a QR under ~150px won't scan off thermal
  return `<div style="text-align:center;margin-top:10px">
    <div style="width:${size}px;height:${size}px;margin:0 auto">${svg}</div>
    <div style="font-size:10px;color:#666;margin-top:4px;font-family:'Segoe UI',Arial,sans-serif">Scan to allocate offloading point</div></div>`;
}

function ticketLogoHTML(px){
  const t=Object.assign({},DEF_CFG.ticket,cfg.ticket||{});
  if(t.showLogo===false) return '';          // only hide when EXPLICITLY off
  const h=Math.round(px*(t.logoScale||1));    // adjustable logo size
  const src=t.logo||LOGO_IMG;                 // custom uploaded logo, else app logo
  if(src) return `<img src="${src}" style="height:${h}px;max-width:100%;object-fit:contain;display:block;margin:0 auto"/>`;
  return `<div style="text-align:center">${appLogo(false,h)}</div>`;
}

function renderTicket(tx,forceWidth){
  const t=Object.assign({},DEF_CFG.ticket,cfg.ticket||{});
  const u=cfg.weightUnit||'kg';
  const net=tx.net??Math.abs((tx.secondWeight||0)-(tx.firstWeight||0));
  const copies=Math.max(1,parseInt(cfg.copies)||1);
  const MONO=t.monoBlack!==false;
  const A=MONO?'#000':(t.accentColor||'#00A551');
  const isA4=(forceWidth||t.paperWidth)==='A4';
  let fs=parseFloat(t.fontScale)||1;       // font multiplier
  if(t.template==='detailed') fs*=1.12;    // detailed = larger, more readable
  if(t.template==='compact')  fs*=0.92;    // compact = tighter
  const S=n=>Math.max(8,Math.round(n*fs)); // scale a px value (min 8px)
  const orderRef=tx.orderId?(orders.find(o=>o.id===tx.orderId)?.no||''):(tx.orderNoManual||'');

  // field rows respecting the on/off toggles
  const F=t.fields||{};
  const rowsData=[
    F.product     && ['Product',     tx.product],
    F.customer    && ['Customer',    tx.customer],
    F.transporter && ['Transporter', tx.transporter],
    F.supplier    && ['Supplier',    tx.supplier],
    F.destination && ['Destination', tx.destination],
    F.driver      && ['Driver',      tx.driver],
    F.order       && orderRef && ['Order', orderRef],
    txDirReport(tx) && ['Type', txDirReport(tx)],
    tx.dispatchTicketNo && ['Dispatch Ticket Nr', tx.dispatchTicketNo],
    ...((tx.custom||[]).filter(c=>c && c.value && c.onTicket!==false).map(c=>[c.label, c.value])),
  ].filter(r=>r && r[1]);

  // ── THERMAL / 80mm style (the readable redesign) ──
  function thermalBody(copyLbl){
    const detailRow=(l,v)=>`<tr>
      <td style="padding:${S(7)}px 0;color:#333;font-size:${S(15)}px;vertical-align:top;white-space:nowrap">${l}</td>
      <td style="padding:${S(7)}px 0;font-weight:700;font-size:${S(15)}px;text-align:right;padding-left:${S(10)}px">${esc(String(v))}</td></tr>`;
    const big=t.template==='compact'?S(30):S(38);
    return `
      ${voidStampHTML(tx,S)}
      ${ticketLogoHTML(t.template==='compact'?S(34):S(46))}
      <div style="text-align:center;margin-top:${S(6)}px">
        <div style="font-size:${S(16)}px;font-weight:900;color:${A};letter-spacing:.5px">${esc(t.companyName||'')}</div>
        ${t.vat?`<div style="font-size:${S(10)}px;color:#555"><b>VAT No:</b> ${esc(t.vat)}</div>`:''}
        ${t.address?`<div style="font-size:${S(11)}px;color:#555">${esc(t.address)}</div>`:''}
        ${t.reg?`<div style="font-size:${S(10)}px;color:#777">Reg: ${esc(t.reg)}</div>`:''}
        ${t.phone?`<div style="font-size:${S(11)}px;color:#555">Tel: ${esc(t.phone)}</div>`:''}
        ${t.email?`<div style="font-size:${S(10)}px;color:#777">${esc(t.email)}</div>`:''}
        ${t.tagline?`<div style="font-size:${S(11)}px;color:${A};font-weight:700;letter-spacing:1px;margin-top:2px">${esc(t.tagline)}</div>`:''}
      </div>
      <div style="border-top:2px solid ${A};margin:${S(8)}px 0"></div>
      <div style="text-align:center;font-size:${S(13)}px;letter-spacing:2px;color:#000;font-weight:700">WEIGHBRIDGE TICKET</div>
      <div style="text-align:center;font-size:${S(20)}px;font-weight:900;font-family:'Courier New',monospace;color:#000;margin-top:${S(4)}px;letter-spacing:1px">${esc(tx.id||'')}</div>
      <div style="text-align:center;font-size:${S(15)}px;font-weight:700;color:#000;margin-top:${S(2)}px">${fmtDT(tx.completedAt)}</div>
      <div style="text-align:center;font-size:${S(11)}px;color:#000;margin-top:${S(1)}px">${esc(tx.bridgeName||'')}</div>
      <div style="border-top:1px dashed #aaa;margin:${S(8)}px 0"></div>
      <div style="text-align:center;font-size:${S(11)}px;color:#666;font-weight:700;letter-spacing:1px">VEHICLE</div>
      <div style="text-align:center;font-size:${S(34)}px;font-weight:900;letter-spacing:3px;font-family:'Courier New',monospace;margin:${S(4)}px 0 ${S(10)}px;color:${A}">${esc(tx.vehicleReg||'—')}</div>
      <table style="width:100%;border-collapse:collapse">
        ${detailRow('1st Weight', fmt(tx.firstWeight)+' '+u+'  '+fmtT(tx.firstWeightTime))}
        ${detailRow('2nd Weight', fmt(tx.secondWeight)+' '+u+'  '+fmtT(tx.secondWeightTime))}
      </table>
      ${(()=>{const dr=ticketDeckRows(tx); return dr.length?`
      <div style="border-top:1px dashed #aaa;margin:${S(8)}px 0"></div>
      <div style="text-align:center;font-size:${S(11)}px;color:#666;font-weight:700;letter-spacing:1px">AXLE WEIGHTS</div>
      <table style="width:100%;border-collapse:collapse;margin-top:${S(4)}px">${dr.map(r=>detailRow(r[0],r[1])).join('')}</table>`:'';})()}
      <div style="border:3px solid ${A};border-radius:8px;text-align:center;padding:${S(10)}px;margin:${S(10)}px 0">
        <div style="font-size:${S(12)}px;color:${A};font-weight:700;letter-spacing:2px">NET WEIGHT</div>
        <div style="font-size:${big}px;font-weight:900;letter-spacing:2px;font-family:'Courier New',monospace;color:${A}">${fmt(net)} ${u}</div>
        <div style="font-size:${S(12)}px;color:#666;margin-top:2px">${(net/1000).toFixed(3)} tonnes</div>
      </div>
      ${rowsData.length?`<div style="border-top:1px dashed #aaa;margin:${S(8)}px 0"></div>
      <table style="width:100%;border-collapse:collapse">${rowsData.map(r=>detailRow(r[0],r[1])).join('')}</table>`:''}
      ${F.notes&&tx.notes?`<div style="margin-top:${S(6)}px;font-size:${S(12)}px"><b>Notes:</b> ${esc(tx.notes)}</div>`:''}
      ${F.operator?`<div style="border-top:1px dashed #aaa;margin:${S(8)}px 0"></div>
      <div style="font-size:${S(12)}px">Operator: <b>${esc(tx.operatorName||'')}</b></div>`:''}
      ${t.showSignature?`<div style="margin-top:${S(26)}px;border-top:1px solid #000;padding-top:${S(4)}px;text-align:center;font-size:${S(11)}px;color:#666">Driver / Receiver Signature</div>`:''}
      ${copyLbl}
      ${nsTicketQRBlock(tx,t,S(118),A)}
      ${t.footer?`<div style="text-align:center;font-size:${S(11)}px;color:#666;margin-top:${S(8)}px;font-style:italic">${esc(t.footer)}</div>`:''}
      <div style="text-align:center;font-size:${S(9)}px;color:#aaa;margin-top:${S(6)}px">${POWERED_BY}</div>`;
  }

  // ── A4 style (formal, large) ──
  function a4Body(copyLbl){
    const cell=(l,v)=>`<tr><td style="background:#f5f8fc;color:#555;font-size:${S(13)}px;font-weight:700;padding:${S(10)}px ${S(14)}px;text-transform:uppercase;white-space:nowrap;width:160px;border-bottom:1px solid #eef3f0">${l}</td><td style="padding:${S(10)}px ${S(14)}px;font-size:${S(15)}px;font-weight:600;border-bottom:1px solid #eef3f0">${esc(String(v))}</td></tr>`;
    const wbox=(lbl,val,sub,hilite)=>`<td style="border:${hilite?'3px':'1.5px'} solid ${hilite?A:'#D5E2DA'};border-radius:10px;padding:${S(16)}px;text-align:center;background:${hilite?'#F0F5F2':'#fff'};width:33%">
      <div style="font-size:${S(11)}px;color:${hilite?A:'#86968D'};font-weight:700;letter-spacing:1px;margin-bottom:${S(6)}px">${lbl}</div>
      <div style="font-size:${hilite?S(34):S(26)}px;font-weight:900;font-family:'Courier New',monospace;color:${A}">${val}</div>
      <div style="font-size:${S(12)}px;color:#86968D;margin-top:${S(4)}px">${sub}</div></td>`;
    return `
      ${voidStampHTML(tx,S)}
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid ${A};padding-bottom:${S(12)}px;margin-bottom:${S(16)}px">
        <div style="flex:1">${t.showLogo!==false?ticketLogoHTML(S(60)).replace('margin:0 auto','margin:0'):''}</div>
        <div style="text-align:right;font-size:${S(12)}px;color:#555;line-height:1.6">
          <div style="font-size:${S(18)}px;font-weight:900;color:${A}">${esc(t.companyName||'')}</div>
          ${t.vat?`<div><b>VAT No:</b> ${esc(t.vat)}</div>`:''}${t.address?`<div>${esc(t.address)}</div>`:''}
          ${t.reg?`<div>Reg: ${esc(t.reg)}</div>`:''}${t.phone?`<div>Tel: ${esc(t.phone)}</div>`:''}
          ${t.email?`<div>${esc(t.email)}</div>`:''}
          ${t.tagline?`<div style="color:${A};font-weight:700">${esc(t.tagline)}</div>`:''}
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:${S(14)}px">
        <div><div style="font-size:${S(13)}px;color:#888;letter-spacing:2px;font-weight:700">VEHICLE</div>
          <div style="font-size:${S(30)}px;font-weight:900;letter-spacing:3px;color:${A};font-family:'Courier New',monospace">${esc(tx.vehicleReg||'—')}</div></div>
        <div style="text-align:right;font-size:${S(13)}px;color:#666">
          <div style="font-family:monospace">${esc(tx.id||'')}</div>
          <div>${fmtDT(tx.completedAt)}</div>
          <div>${esc(tx.bridgeName||'')}</div>${copyLbl}</div>
      </div>
      <table style="width:100%;border-collapse:separate;border-spacing:${S(8)}px;margin:0 -${S(8)}px ${S(14)}px"><tr>
        ${wbox('1ST WEIGHT',fmt(tx.firstWeight),u+' · '+fmtT(tx.firstWeightTime),false)}
        ${wbox('2ND WEIGHT',fmt(tx.secondWeight),u+' · '+fmtT(tx.secondWeightTime),false)}
        ${wbox('NET WEIGHT',fmt(net),u+' · '+(net/1000).toFixed(3)+' t',true)}
      </tr></table>
      <table style="width:100%;border-collapse:collapse;border:1px solid #eef3f0;border-radius:8px;overflow:hidden;margin-bottom:${S(16)}px">
        ${rowsData.map(r=>cell(r[0],r[1])).join('')}
      </table>
      ${F.notes&&tx.notes?`<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:${S(12)}px;margin-bottom:${S(16)}px;font-size:${S(14)}px"><b style="color:#d97706">Notes:</b> ${esc(tx.notes)}</div>`:''}
      ${t.showSignature?`<div style="display:flex;gap:${S(40)}px;margin-top:${S(50)}px">
        <div style="flex:1;border-top:1.5px solid ${A};padding-top:${S(6)}px;text-align:center;font-size:${S(13)}px;color:#555">Operator: ${esc(tx.operatorName||'')}</div>
        <div style="flex:1;border-top:1.5px solid ${A};padding-top:${S(6)}px;text-align:center;font-size:${S(13)}px;color:#555">Driver / Receiver Signature</div>
      </div>`:''}
      ${nsTicketQRBlock(tx,t,S(140),A)}
      ${t.footer?`<div style="text-align:center;font-size:${S(13)}px;color:#666;margin-top:${S(20)}px;font-style:italic">${esc(t.footer)}</div>`:''}
      <div style="margin-top:${S(16)}px;border-top:1px solid #D5E2DA;padding-top:${S(8)}px;font-size:${S(11)}px;color:#86968D;text-align:center">${POWERED_BY}</div>`;
  }

  let pages='';
  for(let c=1;c<=copies;c++){
    const copyLbl=copies>1?`<div style="text-align:center;font-size:${S(10)}px;color:#999;margin-top:${S(4)}px">Copy ${c} of ${copies}</div>`:'';
    const body=isA4?a4Body(copyLbl):thermalBody(copyLbl);
    const wrap=isA4
      ? `<div${c<copies?' style="page-break-after:always"':''} style="max-width:720px;margin:0 auto">${body}</div>`
      : `<div${c<copies?' style="page-break-after:always"':''}>${body}</div>`;
    pages+=wrap;
  }

  // ── MONO: rewrite every foreground colour/border to solid black. Greys
  // (#555/#666/#777/#888/#999/#ccc) print faint and washed out on thermal
  // paper — this is what made the ticket hard to read.
  if(MONO){
    pages=pages
      .replace(/color:\s*#[0-9A-Fa-f]{3,8}/g,'color:#000')
      .replace(/color:\s*rgba?\([^)]*\)/g,'color:#000')
      .replace(/(solid|dashed|dotted)\s+#[0-9A-Fa-f]{3,8}/g,'$1 #000')
      .replace(/border-color:\s*#[0-9A-Fa-f]{3,8}/g,'border-color:#000');
  }

  const pageCSS=isA4
    ? `body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:${MONO?'#000':'#14201A'};padding:14mm;color-scheme:light;-webkit-print-color-adjust:exact}@page{size:A4;margin:10mm}`
    : `body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#000;width:80mm;margin:0 auto;padding:5mm 4mm;line-height:1.5;color-scheme:light;-webkit-print-color-adjust:exact}@page{size:80mm auto;margin:4mm}`;

  const w=window.open('','_blank','width='+(isA4?'780':'400')+',height=820,scrollbars=yes');
  if(!w){toast('Allow pop-ups to print','error');return;}
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="color-scheme" content="light only"><title>Ticket — ${esc(tx.vehicleReg||BRAND.vendorShort)}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}${pageCSS}
    .np{text-align:center;padding:14px;border-top:1px dashed #ccc;margin-top:14px}
    @media print{.np{display:none}}</style></head><body>${pages}
    <div class="np">
      <button onclick="window.print()" style="background:${A};color:#fff;border:none;border-radius:6px;padding:11px 28px;font-size:14px;font-weight:700;cursor:pointer;margin-right:8px">🖨 Print (default printer)</button>
      <button onclick="window.close()" style="background:#F0F5F2;color:#47594F;border:1.5px solid #D5E2DA;border-radius:6px;padding:11px 20px;font-size:14px;cursor:pointer">Close</button>
    </div>
    <script>window.onload=function(){var imgs=[].slice.call(document.images);Promise.all(imgs.map(function(i){return i.complete?1:new Promise(function(r){i.onload=i.onerror=r;});})).then(function(){setTimeout(function(){window.print();},250);});};<\/script></body></html>`);
  w.document.close();
}

