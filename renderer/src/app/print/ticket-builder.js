function openTicketBuilder(){
  // The ticket carries the vendor's identity onto paper, so the layout is set
  // here. The designer still opens for the site — the logo is theirs to
  // change, and they can see exactly what the rest will print like.
  if(!cfg.ticket) cfg.ticket=JSON.parse(JSON.stringify(DEF_CFG.ticket));
  openModal('🎨 Ticket Designer', ticketBuilderHTML());
  setTimeout(refreshTicketPreview,50);
}
function tcfg(){ if(!cfg.ticket)cfg.ticket=JSON.parse(JSON.stringify(DEF_CFG.ticket)); return cfg.ticket; }
function tset(k,v){ tcfg()[k]=v; saveCfg(); refreshTicketPreview(); }
function tsetField(k,v){ tcfg().fields[k]=v; saveCfg(); refreshTicketPreview(); }

function ticketLockBanner(){
  return `<div class="card" style="border-left:4px solid var(--blue);margin-bottom:12px">
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <div style="font-weight:800;font-size:13px">\u{1F512} Layout set by ${esc(BRAND.vendorShort)}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:3px">
          The logo below is yours to change. Everything else is fixed \u2014 the
          preview shows exactly what will print.</div>
      </div>
      <button class="btn btn-navy btn-sm" onclick="askPlan(()=>{closeModal();openTicketBuilder();})">Installer access</button>
    </div></div>`;
}
function ticketBuilderHTML(){
  const t=tcfg();
  const lk=ticketLocked();
  const LK=lk?'<div class="tb-lock">':'', LKe=lk?'</div>':'';
  const tmpl=(id,name,desc)=>`<div onclick="tset('template','${id}')" style="flex:1;min-width:120px;cursor:pointer;border:2px solid ${t.template===id?'var(--blue)':'var(--border)'};background:${t.template===id?'#F0F5F2':'#fff'};border-radius:10px;padding:10px;text-align:center">
    <div style="font-weight:800;font-size:13px;color:var(--navy)">${name}</div>
    <div style="font-size:10px;color:var(--text3);margin-top:2px">${desc}</div></div>`;
  const fieldChip=(k,lbl)=>`<div onclick="tsetField('${k}',${!t.fields[k]})" class="perm-chip ${t.fields[k]?'on':'off'}">${lbl}</div>`;
  return `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <!-- LEFT: controls -->
    <div style="max-height:70vh;overflow-y:auto;padding-right:6px">
      ${lk?ticketLockBanner():''}
      ${LK}
      <div class="sg-title">Template</div>
      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
        ${tmpl('standard','Standard','Logo + full details')}
        ${tmpl('compact','Compact','Shorter, saves paper')}
        ${tmpl('detailed','Detailed','Everything, large fonts')}
      </div>

      <div class="sg-title">Print Style</div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 0">
        <input type="checkbox" ${tcfg().monoBlack!==false?'checked':''} onchange="tset('monoBlack',this.checked)"/>
        <span><b>Solid black ticket</b> — no colour, no grey. Best legibility on thermal paper.</span>
      </label>
      <div class="sg-title">Paper</div>
      <div class="row2" style="margin-bottom:8px">
        <div class="field"><label>Size</label>
          <select onchange="tset('paperWidth',this.value)">
            <option value="80mm" ${t.paperWidth==='80mm'?'selected':''}>Thermal 80mm roll</option>
            <option value="A4" ${t.paperWidth==='A4'?'selected':''}>A4 sheet</option>
          </select></div>
        <div class="field"><label>Font size: <b id="fsLbl">${Math.round(t.fontScale*100)}%</b></label>
          <input type="range" min="0.8" max="1.6" step="0.05" value="${t.fontScale}" oninput="document.getElementById('fsLbl').textContent=Math.round(this.value*100)+'%';tset('fontScale',parseFloat(this.value))"/></div>
      </div>

      ${LKe}
      <div class="sg-title">Logo</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <div class="toggle ${t.showLogo?'on':''}" onclick="tset('showLogo',${!t.showLogo})"></div>
        <span style="font-size:12px">Show logo</span>
      </div>
      <div class="field" style="margin-bottom:6px"><label>Logo size: <b id="lsLbl">${Math.round((t.logoScale||1)*100)}%</b></label>
        <input type="range" min="0.6" max="3" step="0.1" value="${t.logoScale||1}" oninput="document.getElementById('lsLbl').textContent=Math.round(this.value*100)+'%';tset('logoScale',parseFloat(this.value))"/></div>
      ${LK}<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <div class="toggle ${t.showQR?'on':''}" onclick="tset('showQR',${!t.showQR})"></div>
        <span style="font-size:12px">QR code (scan to allocate offloading point)</span>
      </div>${LKe}
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <button type="button" class="btn btn-ghost btn-sm" style="margin-right:6px"
          onclick="tset('logo',BRAND_TICKET);tset('logoCustom',false);toast('Ticket logo reset to the black &amp; white original','success')">Reset logo</button>
        <label style="cursor:pointer"><input type="file" accept="image/*" style="display:none" onchange="uploadTicketLogo(this)"/>
          <span class="btn btn-ghost btn-sm">📤 Upload logo</span></label>
        ${t.logo?`<button class="btn btn-ghost btn-sm" onclick="tset('logo','')">Use ${esc(BRAND.vendorShort)} logo</button>`:''}
      </div>

      ${LK}
      <div class="sg-title">Company &amp; Contact</div>
      <div class="field"><label>Company name</label><input value="${esc(t.companyName||'')}" onblur="tset('companyName',this.value);applyBranding()"/></div>
      <div class="row2">
        <div class="field"><label>VAT number</label><input value="${esc(t.vat||'')}" placeholder="e.g. 4123456789" onblur="tset('vat',this.value)"/></div>
        <div class="field"><label>Address</label><input value="${esc(t.address||'')}" placeholder="51 Wimbledon Street, eMalahleni, Mpumalanga, 1035" onblur="tset('address',this.value)"/></div>
      </div>
      <div class="row2">
        <div class="field"><label>Reg number (optional)</label><input value="${esc(t.reg||'')}" onblur="tset('reg',this.value)"/></div>
        <div class="field"><label>Telephone (optional)</label><input value="${esc(t.phone||'')}" onblur="tset('phone',this.value)"/></div>
      </div>
      <div class="row2">
        <div class="field"><label>Email (optional)</label><input value="${esc(t.email||'')}" onblur="tset('email',this.value)"/></div>
        <div class="field"><label>Tagline (optional)</label><input value="${esc(t.tagline||'')}" onblur="tset('tagline',this.value)"/></div>
      </div>
      <div class="field"><label>Footer message</label><input value="${esc(t.footer)}" onblur="tset('footer',this.value)"/></div>
      <div class="field"><label>Accent colour</label><input type="color" value="${t.accentColor}" style="max-width:60px;height:38px;padding:3px" onchange="tset('accentColor',this.value)"/></div>

      <div class="sg-title">Fields shown on ticket</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
        ${fieldChip('product','Product')}${fieldChip('customer','Customer')}${fieldChip('transporter','Transporter')}
        ${fieldChip('supplier','Supplier')}${fieldChip('destination','Destination')}${fieldChip('driver','Driver')}
        ${fieldChip('order','Order')}${fieldChip('notes','Notes')}${fieldChip('operator','Operator')}
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <div class="toggle ${t.showSignature?'on':''}" onclick="tset('showSignature',${!t.showSignature})"></div>
        <span style="font-size:12px">Signature line</span>
      </div>
      ${LKe}
    </div>

    <!-- RIGHT: live preview -->
    <div>
      <div class="sg-title">Live Preview</div>
      <div id="ticket-preview" style="background:#f0f0f0;border:1px solid var(--border);border-radius:8px;padding:14px;height:64vh;overflow-y:auto;display:flex;justify-content:center"></div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Done</button>
        <button class="btn btn-navy" style="flex:1" onclick="previewTicket()">🖨 Test Print</button>
      </div>
    </div>
  </div>`;
}

function uploadTicketLogo(input){
  const f=input.files[0]; if(!f)return;
  if(f.size>500000){toast('Logo under 500 KB please','error');return;}
  const rd=new FileReader();
  rd.onload=()=>{ tset('logo',rd.result); tset('logoCustom',true);
                  toast('Logo added to ticket','success'); };
  rd.readAsDataURL(f);
}

// Render the demo ticket into the preview pane (scaled mini)
function refreshTicketPreview(){
  const el=document.getElementById('ticket-preview'); if(!el)return;
  const t=tcfg();
  const demo={id:fmtTicketNo(peekTicketSeq()),vehicleReg:'ABC 123 GP',product:'Coal RB1',customer:'Prime Coal (Pty) Ltd',
    transporter:'ISS Logistics',supplier:'Woestaleen Colliery',destination:'Richards Bay',driver:'J. Pretorius',
    orderId:'PO-2026-0042',orderNo:'PO-2026-0042',notes:'Tarpaulin checked · load secured',
    firstWeight:42580,firstWeightTime:nowISO(),secondWeight:14300,secondWeightTime:nowISO(),
    net:28280,completedAt:nowISO(),bridgeName:cfg.bridges[0]?.name||'Bridge 1',operatorName:session?.name||'Operator',
    // every custom field with a realistic sample value so the client sees the whole ticket
    custom:(cfg.customFields||[]).map((cf,i)=>({
      id:cf.id, label:cf.label, onTicket:cf.onTicket!==false,
      value:['TRL 456 GP','TRL 789 GP','BATCH-2026-07','SEAL-004821','Sample','Sample','Sample','Sample'][i] || 'Sample'
    }))};
  // For the CLIENT PREVIEW show every row — temporarily enable all field toggles
  const _savedFields=t.fields;
  t.fields=Object.assign({},t.fields,{product:true,customer:true,transporter:true,supplier:true,destination:true,driver:true,order:true,notes:true,operator:true});
  // build the inner HTML by calling a render-to-string variant
  const html=buildTicketPreviewHTML(demo);
  t.fields=_savedFields;   // restore the operator's real toggle choices
  const scale=t.paperWidth==='A4'?0.62:0.95;
  const width=t.paperWidth==='A4'?'600px':'300px';
  el.innerHTML=`<div style="transform:scale(${scale});transform-origin:top center"><div style="width:${width};background:#fff;padding:${t.paperWidth==='A4'?'24px':'14px'};box-shadow:0 2px 12px rgba(0,0,0,.15);font-family:'Segoe UI',sans-serif;color:#000">${html}</div></div>`;
}

// Returns just the ticket body HTML (no window) for preview
function buildTicketPreviewHTML(tx){
  // Reuse renderTicket's logic by capturing into a string:
  // simplest path — call a shared builder. We replicate the body here
  // by temporarily intercepting window.open.
  let captured='';
  const realOpen=window.open;
  window.open=()=>({document:{write:(h)=>{captured=h;},close:()=>{}},print:()=>{},close:()=>{}});
  try{ renderTicket(tx, tcfg().paperWidth==='A4'?'A4':'thermal'); }catch(e){}
  window.open=realOpen;
  // extract body content between <body> and the .np button block
  const m=captured.match(/<body>([\s\S]*?)<div class="np">/);
  return m?m[1]:'<div style="padding:20px;text-align:center;color:#888">Preview unavailable</div>';
}

function previewTicket(){
  const demo={id:'ISS-PREVIEW-001',vehicleReg:'ABC 123 GP',product:'Coal RB1',customer:'Preview Customer',transporter:'Sample Transport',supplier:'Colliery Supply',destination:'Richards Bay',driver:'J. Driver',notes:'Preview only',firstWeight:42580,firstWeightTime:nowISO(),secondWeight:14300,secondWeightTime:nowISO(),net:28280,completedAt:nowISO(),bridgeName:cfg.bridges[0]?.name||'Bridge 1',operatorName:session?.name||'Master',orderId:''};
  if(cfg.defaultPrint==='a4')printA4(demo);else printThermal(demo);
}
