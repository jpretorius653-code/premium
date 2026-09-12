// ══════════════════════════════════════════════════════════
// RAW SERIAL PARSER / READER — commissioning diagnostic
// Opens a COM port, shows live hex+ASCII of every byte the
// indicator sends, auto-detects the weight field, and lets
// you set skip/read for a bridge by clicking the data.
// ══════════════════════════════════════════════════════════
let _rawPort=null, _rawReader=null, _rawRunning=false, _rawBridge=0;
let _rawLines=[];          // recent decoded lines (raw strings)
let _rawByteBuf='';        // accumulator
let _rawFrozen=false;
let _rawCfg={baud:'9600',parity:'none',dataBits:8,stopBits:1};

let _parserNativeFeed=false;
function rawFeedNative(data){
  if(_rawFrozen) return;
  _rawByteBuf += data;
  const parts=_rawByteBuf.split(/[\r\n\x02\x03]+/);
  _rawByteBuf=parts.pop();
  for(const ln of parts){
    if(!ln.length) continue;
    _rawLatest=ln; _rawLines.unshift(ln);
    if(_rawLines.length>50) _rawLines.pop();
  }
  if(_rawByteBuf.length>200){ _rawByteBuf=''; }
  rawRenderMonitor(); rawRenderCharmap();
}
function openRawParser(bridgeIdx){
  _rawBridge = bridgeIdx ?? activeBridge;
  _rawLines=[]; _rawByteBuf=''; _rawFrozen=false;
  // preload settings from that bridge
  const bc=cfg.bridges[_rawBridge]||{};
  _rawCfg={baud:bc.baud||'9600',parity:bc.parity||'none',dataBits:bc.dataBits||8,stopBits:1};
  openModal('🔬 Raw Serial Parser — '+(cfg.bridges[_rawBridge]?.name||'Bridge '+(_rawBridge+1)), rawParserHTML());
}

function rawParserHTML(){
  const bauds=['1200','2400','4800','9600','19200','38400','57600','115200'];
  return `
  <div style="background:var(--base);border-radius:10px;padding:12px;margin-bottom:12px">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">
      <div style="flex:1;min-width:90px"><label style="font-size:10px;color:#94A3B8;display:block;margin-bottom:3px">BAUD</label>
        <select id="raw-baud" style="background:var(--surface)!important;color:#E2E8F0!important;border-color:var(--line-2)!important">
          ${bauds.map(b=>`<option ${_rawCfg.baud===b?'selected':''}>${b}</option>`).join('')}
        </select></div>
      <div style="flex:1;min-width:80px"><label style="font-size:10px;color:#94A3B8;display:block;margin-bottom:3px">PARITY</label>
        <select id="raw-parity" style="background:var(--surface)!important;color:#E2E8F0!important;border-color:var(--line-2)!important">
          <option value="none" ${_rawCfg.parity==='none'?'selected':''}>None</option>
          <option value="even" ${_rawCfg.parity==='even'?'selected':''}>Even</option>
          <option value="odd" ${_rawCfg.parity==='odd'?'selected':''}>Odd</option>
        </select></div>
      <div style="flex:1;min-width:70px"><label style="font-size:10px;color:#94A3B8;display:block;margin-bottom:3px">DATA</label>
        <select id="raw-data" style="background:var(--surface)!important;color:#E2E8F0!important;border-color:var(--line-2)!important">
          <option value="8" ${_rawCfg.dataBits===8?'selected':''}>8</option>
          <option value="7" ${_rawCfg.dataBits===7?'selected':''}>7</option>
        </select></div>
      <button class="btn btn-green btn-sm" id="raw-connect-btn" onclick="rawConnect()">🔌 Open Port</button>
    </div>
    <div style="font-size:10px;color:#5a7align;color:#94A3B8">Plug in the indicator, click Open Port, select the COM port. You'll see exactly what it sends.</div>
  </div>

  <!-- Live monitor -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
    <div style="font-size:11px;font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">Live Data Stream</div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-ghost btn-sm" onclick="rawToggleFreeze()" id="raw-freeze-btn">⏸ Freeze</button>
      <button class="btn btn-ghost btn-sm" onclick="rawClear()">Clear</button>
    </div>
  </div>
  <div id="raw-monitor" style="background:var(--base);border:1px solid var(--line-2);border-radius:8px;padding:10px;height:180px;overflow-y:auto;font-family:'Courier New',monospace;font-size:12px;color:#6EE7B7;line-height:1.5">
    <div style="color:#94A3B8">Waiting for data… open the port above.</div>
  </div>

  <!-- Field selector -->
  <div style="margin-top:12px;background:var(--elev);border-radius:8px;padding:12px">
    <div style="font-size:11px;font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Weight Field — click digits in the latest line to select</div>
    <div id="raw-charmap" style="font-family:'Courier New',monospace;font-size:18px;letter-spacing:2px;word-break:break-all;line-height:2.2;color:var(--text3);padding:8px;background:var(--base);border-radius:6px;min-height:44px">—</div>
    <div style="display:flex;gap:14px;margin-top:10px;flex-wrap:wrap;align-items:center">
      <div style="font-size:12px">Skip: <b id="raw-skip" style="color:var(--ink);font-family:monospace">0</b></div>
      <div style="font-size:12px">Read: <b id="raw-read" style="color:var(--ink);font-family:monospace">6</b></div>
      <div style="font-size:12px">Detected weight: <b id="raw-detected" style="color:var(--green);font-family:monospace;font-size:16px">—</b></div>
      <button class="btn btn-blue btn-sm" style="margin-left:auto" onclick="rawAutoDetect()">✨ Auto-detect</button>
    </div>
  </div>

  <div style="display:flex;gap:8px;margin-top:14px">
    <button class="btn btn-ghost" onclick="rawClose()">Close</button>
    <button class="btn btn-navy" style="flex:1" onclick="rawApplyToBridge()">💾 Apply skip/read to ${esc(cfg.bridges[_rawBridge]?.name||'Bridge '+(_rawBridge+1))}</button>
  </div>`;
}

let _rawSkip=0, _rawRead=6, _rawLatest='';

async function rawConnect(){
  // In the EXE, the native port is already streaming — just tap into it
  if(window.issDesktop && _nativeSerial){
    const bc=cfg.bridges[_rawBridge];
    if(!bc.comPath){
      toast('Set the serial port for this bridge first (Settings → Set Serial Port), then open the parser','error',6000);
      return;
    }
    _parserNativeFeed=true;
    _rawRunning=true;
    const btn=document.getElementById('raw-connect-btn');
    if(btn){ btn.textContent='⏹ Stop'; btn.className='btn btn-red btn-sm'; }
    toast('Reading live from '+bc.comPath+' (native)','success');
    return;
  }
  if(!('serial' in navigator)){
    toast('Web Serial needs Chrome/Edge desktop or the EXE app','error');
    return;
  }
  if(_rawRunning){ rawDisconnect(); return; }

  // ── CRITICAL: a COM port can only be held by ONE connection.
  // Release any live weighing connection on BOTH bridges first,
  // otherwise the OS reports "port not available".
  for(let i=0;i<bState.length;i++){
    if(bState[i].serial){
      try{ if(bState[i].reader) await bState[i].reader.cancel(); }catch{}
      await new Promise(r=>setTimeout(r,100));
      try{ if(bState[i].serial) await bState[i].serial.close(); }catch{}
      bState[i].reader=null; bState[i].serial=null; bState[i].state='sim';
    }
    stopSim(i);
  }
  // give Windows time to fully release the COM handle
  await new Promise(r=>setTimeout(r,300));

  try{
    _rawCfg.baud=document.getElementById('raw-baud').value;
    _rawCfg.parity=document.getElementById('raw-parity').value;
    _rawCfg.dataBits=parseInt(document.getElementById('raw-data').value)||8;

    // Reuse an already-granted port if possible (avoids double-open)
    let port=null;
    try{
      const ports=await navigator.serial.getPorts();
      // requestPort always shows the chooser; that's what we want here
    }catch{}
    _rawPort=await navigator.serial.requestPort();

    // Retry open up to 3× — the handle may still be settling
    let opened=false, lastErr=null;
    for(let attempt=0;attempt<3 && !opened;attempt++){
      try{
        await _rawPort.open({baudRate:parseInt(_rawCfg.baud),dataBits:_rawCfg.dataBits,stopBits:1,parity:_rawCfg.parity});
        opened=true;
      }catch(e){
        lastErr=e;
        // "port already open" or "failed to open" → wait and retry
        await new Promise(r=>setTimeout(r,400));
      }
    }
    if(!opened) throw lastErr||new Error('Could not open port');

    _rawRunning=true;
    const btn=document.getElementById('raw-connect-btn');
    if(btn){ btn.textContent='⏹ Close Port'; btn.className='btn btn-red btn-sm'; }
    rawRead();
    toast('Port open — reading raw data','success');
  }catch(e){
    _rawRunning=false;
    if(e.name==='AbortError'){ /* user cancelled chooser */ }
    else if(/already open|in use|not available|failed to open/i.test(e.message||'')){
      toast('Port busy — unplug/replug the USB cable, then try again','error',6000);
    }else{
      toast('Open failed: '+(e.message||e.name),'error',5000);
    }
    // restart sim so the app stays alive
    startSim(0); if(planBridges()>1) startSim(1);
  }
}

async function rawRead(){
  const dec=new TextDecoder();
  try{
    _rawReader=_rawPort.readable.getReader();
    while(_rawRunning){
      const {value,done}=await _rawReader.read();
      if(done)break;
      if(_rawFrozen) continue;
      const chunk=dec.decode(value,{stream:true});
      _rawByteBuf+=chunk;
      // Split on CR/LF — keep remainder. Also handle CR-only and LF-only.
      const parts=_rawByteBuf.split(/[\r\n]+/);
      _rawByteBuf=parts.pop();
      // Safety: if no line terminator after 200 chars, flush as one line
      if(_rawByteBuf.length>200){ parts.push(_rawByteBuf); _rawByteBuf=''; }
      for(const ln of parts){
        if(ln.length===0) continue;
        _rawLatest=ln;
        _rawLines.unshift(ln);
        if(_rawLines.length>50)_rawLines.pop();
      }
      if(parts.length){ rawRenderMonitor(); rawRenderCharmap(); }
    }
  }catch(e){
    // expected on cancel
  }finally{
    try{ _rawReader&&_rawReader.releaseLock(); }catch{}
    _rawReader=null;
  }
}

function rawRenderMonitor(){
  const el=document.getElementById('raw-monitor');
  if(!el)return;
  if(!_rawLines.length){el.innerHTML='<div style="color:#94A3B8">Port open — waiting for indicator to send…</div>';return;}
  el.innerHTML=_rawLines.slice(0,20).map((ln,i)=>{
    const hex=[...ln].map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join(' ');
    const safe=esc(ln);
    return `<div style="${i===0?'color:#6EE7B7;font-weight:bold':'color:#64748B'};border-bottom:1px solid var(--line);padding:2px 0">
      <span style="color:#94A3B8">ASCII:</span> ${safe}
      <span style="color:#64748B;font-size:10px;display:block">HEX: ${hex}</span>
    </div>`;
  }).join('');
}

function rawRenderCharmap(){
  const el=document.getElementById('raw-charmap');
  if(!el)return;
  if(!_rawLatest){el.textContent='—';return;}
  el.innerHTML=[..._rawLatest].map((c,i)=>{
    const inField=i>=_rawSkip && i<_rawSkip+_rawRead;
    const isDigit=/[0-9.]/.test(c);
    const bg=inField?(isDigit?'#10B981':'#F59E0B'):'transparent';
    const col=inField?'#fff':(isDigit?'var(--ink)':'var(--text3)');
    const disp=c===' '?'·':esc(c);
    return `<span onclick="rawSetSkip(${i})" title="char ${i}" style="cursor:pointer;padding:1px 3px;border-radius:3px;background:${bg};color:${col}">${disp}</span>`;
  }).join('');
  // live decode
  rawUpdateDetected();
}

function rawSetSkip(i){
  _rawSkip=i;
  document.getElementById('raw-skip').textContent=_rawSkip;
  rawRenderCharmap();
}

function rawUpdateDetected(){
  const sub=_rawLatest.slice(_rawSkip,_rawSkip+_rawRead).replace(/[^0-9.\-]/g,'');
  const w=parseFloat(sub);
  const el=document.getElementById('raw-detected');
  if(el) el.textContent=isNaN(w)?'—':fmt(w)+' '+(cfg.weightUnit||'kg');
}

function rawAutoDetect(){
  if(!_rawLatest){toast('No data yet','error');return;}
  // Find the longest run of digits in the latest line
  let best={start:0,len:0};
  const re=/[0-9][0-9.\s]*[0-9]|[0-9]/g;
  let m;
  while((m=re.exec(_rawLatest))!==null){
    const len=m[0].replace(/\s/g,'').length;
    if(len>best.len) best={start:m.index,len:m[0].length};
  }
  if(best.len){
    _rawSkip=best.start;
    _rawRead=best.len;
    document.getElementById('raw-skip').textContent=_rawSkip;
    document.getElementById('raw-read').textContent=_rawRead;
    rawRenderCharmap();
    toast('Auto-detected weight field at position '+_rawSkip,'success');
  }else toast('No numeric field found in data','error');
}

function rawToggleFreeze(){
  _rawFrozen=!_rawFrozen;
  const b=document.getElementById('raw-freeze-btn');
  if(b) b.textContent=_rawFrozen?'▶ Resume':'⏸ Freeze';
}
function rawClear(){ _rawLines=[]; rawRenderMonitor(); }

async function rawDisconnect(){
  _rawRunning=false;
  _parserNativeFeed=false;                       // stops the read loop
  try{ if(_rawReader) await _rawReader.cancel(); }catch{}
  // wait for rawRead's finally{} to release the lock
  await new Promise(r=>setTimeout(r,120));
  try{ if(_rawPort){ await _rawPort.close(); _rawPort=null; } }catch(e){ console.warn('raw close',e.message); }
  _rawReader=null;
  const b=document.getElementById('raw-connect-btn');
  if(b){ b.textContent='🔌 Open Port'; b.className='btn btn-green btn-sm'; }
  // let the OS release the COM handle, then resume sim
  await new Promise(r=>setTimeout(r,250));
  if(!_rawRunning){ startSim(0); if(planBridges()>1) startSim(1); }
}
async function rawClose(){ await rawDisconnect(); closeModal(); }

async function rawApplyToBridge(){
  setBridge(_rawBridge,'skip',_rawSkip);
  setBridge(_rawBridge,'read',_rawRead);
  setBridge(_rawBridge,'baud',_rawCfg.baud);
  setBridge(_rawBridge,'parity',_rawCfg.parity);
  setBridge(_rawBridge,'dataBits',_rawCfg.dataBits);
  auditLog('config','settings','bridge'+_rawBridge,'Set parser: skip='+_rawSkip+' read='+_rawRead+' baud='+_rawCfg.baud);
  toast('Applied to '+(cfg.bridges[_rawBridge]?.name||'Bridge '+(_rawBridge+1))+' ✓','success');
  await rawDisconnect();
  closeModal();
  if(currentTab==='settings') renderSettings();
}

