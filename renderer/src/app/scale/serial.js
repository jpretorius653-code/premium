// ── SERIAL ──────────────────────────────────────
// ══════════════════════════════════════════════════════════
// SERIAL PORT — pair ONCE (master), then auto-open forever.
//
// Web Serial remembers granted ports via navigator.serial.getPorts().
// We tag each bridge with the device's USB vendor/product ID so on
// startup we silently re-open the SAME physical indicator without any
// popup. The popup (requestPort) only happens when the master pairs.
// ══════════════════════════════════════════════════════════

// Open an already-granted SerialPort object (no popup)
// ══════════════════════════════════════════════════════════
// NATIVE SERIAL (Electron EXE) — the bulletproof path.
//
// When running in the desktop app, the COM port is held OPEN by
// the main process at the OS level. It is set ONCE by the master,
// remembered forever, reopened on every launch, and survives
// renderer reloads and cable drops — NEVER needs unplugging.
//
// The browser/PWA build automatically falls back to Web Serial.
// ══════════════════════════════════════════════════════════
let _nativeSerial=false;
let _serialErr=null;
let _nativeBound=false;
let _nativeRawBuf=['',''];
let _lastSerialData=[0,0];
let _silentWarned=[false,false];

async function initNativeSerial(){
  if(!window.issDesktop || !window.issDesktop.serialAvailable) return false;
  try{ _nativeSerial = await window.issDesktop.serialAvailable(); }catch{ _nativeSerial=false; }
  if(!_nativeSerial){ try{ _serialErr=await window.issDesktop.serialError(); }catch{} return false; }
  if(_nativeBound) return true;
  _nativeBound=true;

  // Live weight lines pushed from main process
  window.issDesktop.onSerialData(({bi,line})=>{ _lastSerialData[bi]=Date.now(); feedSerial(bi, line+'\n'); });
  // Raw chunks from native port → single feed path (parse + monitor + weight)
  window.issDesktop.onSerialRaw(({bi,data})=>{
    _lastSerialData[bi]=Date.now();
    feedSerial(bi, data);
  });
  // Status changes
  window.issDesktop.onSerialStatus(({bi,status,path,detail})=>{
    if(status==='open'){
      bState[bi].state='connected';
      _lastSerialData[bi]=0; _silentWarned[bi]=false;
      stopSim(bi);
      setPill('● Live'+(path?' '+path:''),'rgba(16,185,129,.12)','#6EE7B7',bi);
      // Warn if the port opens but the indicator sends nothing within 4s
      setTimeout(()=>{
        if(_nativeSerial && !_lastSerialData[bi] && !_silentWarned[bi]){
          _silentWarned[bi]=true;
          toast('Port open on '+(path||'COM')+' but no data from indicator. Check baud rate, cable TX/GND wiring, and that the indicator is in continuous-print mode.','error',9000);
          setPill('⚠ Open · no data','rgba(245,158,11,.12)','#FBBF24',bi);
        }
      },4000);
    }else if(status==='closed'||status==='error'){
      if(bState[bi].state==='connected'){ bState[bi].state='disconnected'; startSim(bi); }
      setPill('◌ Reconnecting…','rgba(239,68,68,.12)','#FCA5A5',bi);
    }
  });
  // Ongoing silent-port monitor: if data stops for 6s while 'open', flag it
  setInterval(()=>{
    if(!_nativeSerial) return;
    for(let bi=0;bi<planBridges();bi++){
      if(bState[bi].state==='connected' && _lastSerialData[bi] && (Date.now()-_lastSerialData[bi]>6000)){
        if(bi===activeBridge) setPill('⚠ No data 6s','rgba(245,158,11,.12)','#FBBF24',bi);
      }
    }
  },3000);
  return true;
}

// Master picks the COM port from a dropdown of real ports (native)
async function connectSerialNative(bi){
  if(!roleAtLeast('manager')){
    toast('Only Master can set the serial port. It opens automatically in live mode.','error',5000);
    return;
  }
  const ports=await window.issDesktop.serialList();
  if(!ports.length){ toast('No COM ports found — check the USB cable / driver','error',5000); return; }
  const bc=cfg.bridges[bi];
  const opts=ports.map(p=>`<option value="${esc(p.path)}">${esc(p.path)} — ${esc(p.friendlyName)}</option>`).join('');
  openModal('🔌 Set Serial Port — '+(bc.name||'Bridge '+(bi+1)),`
    <div class="field"><label>COM Port</label>
      <select id="np-port">${opts}</select>
    </div>
    <div class="row2">
      <div class="field"><label>Baud Rate</label>
        <select id="np-baud">${['1200','2400','4800','9600','19200','38400','57600','115200'].map(b=>`<option ${(bc.baud||'9600')===b?'selected':''}>${b}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Parity</label>
        <select id="np-parity">
          <option value="none" ${(bc.parity||'none')==='none'?'selected':''}>None</option>
          <option value="even" ${bc.parity==='even'?'selected':''}>Even</option>
          <option value="odd" ${bc.parity==='odd'?'selected':''}>Odd</option>
        </select>
      </div>
    </div>
    <details style="margin:6px 0">
      <summary style="cursor:pointer;font-size:12px;color:var(--text2);font-weight:600">Advanced — line control (only if the weight drops when you connect)</summary>
      <div style="padding:8px 4px 2px">
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:6px">
          <input type="checkbox" id="np-kick" ${bc.kick===true?'checked':''}/>
          Reset pulse on connect — leave OFF for Prolific/FTDI; try ON only for CH340
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px">
          <input type="checkbox" id="np-dtr" ${bc.dtr===false?'':'checked'}/>
          Hold DTR/RTS high (most indicators need this to transmit)
        </label>
        <div style="font-size:11px;color:var(--text3);margin-top:6px">If it opens in PuTTY but not here, keep "Reset pulse" OFF — that's the default now.</div>
      </div>
    </details>
    <div style="background:var(--greenl);border-radius:8px;padding:10px;font-size:12px;color:var(--green);margin:8px 0">
      ✓ Set once. The port stays open at the OS level, reopens automatically every time you start the app, and survives power cuts and cable knocks. You never need to unplug it.
    </div>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-navy" style="flex:1" onclick="saveNativePort(${bi})">💾 Set &amp; Go Live</button>
    </div>`);
}

async function saveNativePort(bi){
  const bc=cfg.bridges[bi];
  const path=document.getElementById('np-port')?.value;
  const baud=document.getElementById('np-baud')?.value||'9600';
  const parity=document.getElementById('np-parity')?.value||'none';
  if(!path){ toast('Pick a COM port','error'); return; }
  const kick=document.getElementById('np-kick')?.checked===true;
  const dtr =document.getElementById('np-dtr')?.checked!==false;
  bc.baud=baud; bc.parity=parity; bc.paired=true; bc.comPath=path; bc.kick=kick; bc.dtr=dtr; bc.rts=dtr; saveCfg();
  const opts={path,baud,parity,dataBits:bc.dataBits||8,stopBits:1,kick,dtr,rts:dtr};
  const r=await window.issDesktop.serialOpen(bi,opts);
  closeModal();
  if(r&&r.ok){
    auditLog('config','settings','bridge'+bi,'Set serial port '+path+' @ '+baud+' for '+(bc.name||'Bridge '+(bi+1)));
    toast((bc.name||'Bridge '+(bi+1))+' live on '+path+' ✓ — remembered','success',5000);
    if(currentTab==='settings') renderSettings();
  }else{
    toast('Could not open '+path+': '+(r?.error||'unknown'),'error',5000);
  }
}

async function disconnectNative(bi){
  if(window.issDesktop && _nativeSerial){
    await window.issDesktop.serialClose(bi);
    cfg.bridges[bi].paired=false; delete cfg.bridges[bi].comPath; saveCfg();
    bState[bi].state='sim'; startSim(bi);
    toast('Port released','info');
    if(currentTab==='settings') renderSettings();
  }
}

async function openSerialPort(port,bi){
  const br=bState[bi],bc=cfg.bridges[bi];
  if(_rawRunning){ await rawDisconnect(); }
  if(br.serial){ await disconnectSerial(bi); await new Promise(r=>setTimeout(r,200)); }
  stopSim(bi);
  setPill('◌ Connecting…','rgba(245,158,11,.12)','#FCD34D',bi);
  let opened=false,lastErr=null;
  for(let a=0;a<4&&!opened;a++){
    try{
      await port.open({baudRate:parseInt(bc.baud)||9600,dataBits:parseInt(bc.dataBits)||8,stopBits:1,parity:bc.parity||'none'});
      opened=true;
    }catch(e){
      lastErr=e;
      // if it's already open by us, treat as success
      if(/already open/i.test(e.message||'')){ opened=true; break; }
      await new Promise(r=>setTimeout(r,400));
    }
  }
  if(!opened) throw lastErr||new Error('open failed');
  br.serial=port; br.state='connected';
  setPill('● Live','rgba(16,185,129,.12)','#6EE7B7',bi);
  readSerial(port,bi);
  return true;
}

// MASTER: pair a port — shows the chooser ONCE, then remembers it.
async function connectSerial(bi){
  // In the desktop EXE, use the bulletproof native serial path
  if(window.issDesktop && _nativeSerial){ return connectSerialNative(bi); }
  if(!('serial' in navigator)){toast('Web Serial not available — run the '+BRAND.appName+' desktop app','error');return;}
  // Only the master may CHANGE the paired port. Clerks just get the
  // already-paired live connection (handled by autoOpenSavedPorts).
  if(!roleAtLeast('manager')){
    toast('Only Master can set the serial port. It opens automatically in live mode.','error',5000);
    return;
  }
  const br=bState[bi],bc=cfg.bridges[bi];
  try{
    const port=await navigator.serial.requestPort();   // the ONE popup
    // Remember which physical device this is (USB IDs)
    try{
      const info=port.getInfo?.();
      if(info){ bc.usbVendorId=info.usbVendorId; bc.usbProductId=info.usbProductId; saveCfg(); }
    }catch{}
    bc.paired=true; saveCfg();
    await openSerialPort(port,bi);
    auditLog('config','settings','bridge'+bi,'Paired serial port for '+(bc.name||'Bridge '+(bi+1)));
    toast((bc.name||'Bridge')+' paired ✓ — will auto-open from now on','success',5000);
  }catch(e){
    if(e.name==='AbortError'){ startSim(bi); return; }
    if(/already open|in use|not available|failed to open/i.test(e.message||''))
      toast('Port busy — unplug/replug USB or close other programs using it','error',6000);
    else toast('Connect failed: '+(e.message||e.name),'error');
    startSim(bi);
  }
}

// STARTUP: silently re-open every paired bridge, no popup.
// Matches saved USB vendor/product IDs to a granted port.
async function autoOpenSavedPorts(){
  if(!('serial' in navigator)) return;
  let granted=[];
  try{ granted=await navigator.serial.getPorts(); }catch{ return; }
  if(!granted.length) return;
  for(let bi=0;bi<cfg.bridges.length;bi++){
    const bc=cfg.bridges[bi];
    if(!bc.paired) continue;
    if(bc.src && /^wss?:/.test(bc.src)) continue;   // this bridge is a WeighBox, skip
    // Find the granted port whose USB IDs match this bridge
    let match=null;
    for(const p of granted){
      let info={}; try{ info=p.getInfo?.()||{}; }catch{}
      if(bc.usbVendorId==null || (info.usbVendorId===bc.usbVendorId && info.usbProductId===bc.usbProductId)){
        match=p; break;
      }
    }
    // Fallback: if only one device is granted and bridge has no stored IDs, use it
    if(!match && granted.length===1 && bc.usbVendorId==null) match=granted[0];
    if(match){
      try{
        await openSerialPort(match,bi);
        toast((bc.name||'Bridge '+(bi+1))+' live ✓','success',2500);
      }catch(e){
        // device not plugged in yet — keep simulation, retry later
        startSim(bi);
      }
    }
  }
}

// Watchdog: if a paired bridge drops (cable knocked), keep trying to
// silently re-open it every 8s — no popup, no operator action.
let _serialWatchdog=null, _serialEvtBound=false;
function startSerialWatchdog(){
  if(_serialWatchdog) clearInterval(_serialWatchdog);
  _serialWatchdog=setInterval(async()=>{
    if(!('serial' in navigator)) return;
    for(let bi=0;bi<cfg.bridges.length;bi++){
      const bc=cfg.bridges[bi], br=bState[bi];
      if(!bc.paired) continue;
      if(bc.src && /^wss?:/.test(bc.src)) continue;
      if(br.state==='connected') continue;   // already live
      // try to re-open from granted ports
      try{
        const granted=await navigator.serial.getPorts();
        let match=null;
        for(const p of granted){
          let info={}; try{info=p.getInfo?.()||{};}catch{}
          if(bc.usbVendorId==null || (info.usbVendorId===bc.usbVendorId && info.usbProductId===bc.usbProductId)){ match=p; break; }
        }
        if(!match && granted.length===1 && bc.usbVendorId==null) match=granted[0];
        if(match){ await openSerialPort(match,bi); toast((bc.name||'Bridge '+(bi+1))+' reconnected ✓','success',2000); }
      }catch{}
    }
  },8000);
}
async function readSerial(port,bi){
  const br=bState[bi],bc=cfg.bridges[bi];
  const dec=new TextDecoder(); let buf='';
  try{
    br.reader=port.readable.getReader();
    while(true){
      const {value,done}=await br.reader.read();
      if(done)break;
      buf+=dec.decode(value);
      const lines=buf.split('\n'); buf=lines.pop();
      for(const ln of lines){const w=parseRaw(ln,bc);if(w!==null){br.live=w;if(bi===activeBridge)updateWeight(w);}}
    }
  }catch(e){
    // expected when we cancel the reader during disconnect
  }finally{
    // ALWAYS release the lock so the port can be reopened
    try{ br.reader&&br.reader.releaseLock(); }catch{}
    br.reader=null;
  }
}
// ══════════════════════════════════════════════════════════
// SIMPLE SERIAL — the only path that matters.
// EXE: native port held open by main process, raw bytes streamed in.
// Browser: Web Serial fallback.
// ══════════════════════════════════════════════════════════
let _portList=[];
let _monBuf=['',''];
let _browserPoll=[null,null];
let _idleFlush=[null,null];
function expandPoll(cmd){
  return String(cmd||'')
    .replace(/<CR>/gi,'\r').replace(/<LF>/gi,'\n')
    .replace(/<ENQ>/gi,'\x05').replace(/<STX>/gi,'\x02').replace(/<ETX>/gi,'\x03');
}

async function refreshPortList(bi){
  if(window.issDesktop && _nativeSerial){
    _portList=await window.issDesktop.serialList();
    const sel=document.getElementById('s-b'+bi+'port');
    if(sel){
      const cur=cfg.bridges[bi]?.comPath||'';
      sel.innerHTML=_portList.length
        ? _portList.map(p=>`<option value="${esc(p.path)}" ${p.path===cur?'selected':''}>${esc(p.path)} — ${esc(p.friendlyName||'')}</option>`).join('')
        : '<option value="">No COM ports found — check USB cable/driver</option>';
    }
    toast(_portList.length+' COM port'+(_portList.length!==1?'s':'')+' found','info');
  }else{
    // Browser: can't enumerate; Connect will show the chooser
    const sel=document.getElementById('s-b'+bi+'port');
    if(sel) sel.innerHTML='<option value="browser">Click Connect → choose port in popup</option>';
    toast('Browser mode: Connect opens the port chooser','info');
  }
}

/* Which transport a bridge uses. 'usb' is the COM port; 'tcp' is an
   IP-to-serial converter (Moxa/USR/Elfin) reached over the LAN; 'box' is an
   ScaleLink WiFi unit speaking WebSocket. TCP and ScaleLink both avoid
   USB entirely, which matters on PCs that drop CH340/FTDI adapters. */
function bridgeLink(bi){ return (cfg.bridges[bi]||{}).link||'usb'; }
function setBridgeLink(bi,v){ setBridge(bi,'link',v); renderSettings(); }

async function connectBridge(bi){
  if(!roleAtLeast('manager')){ toast('Setting the scale connection needs Manager access','error'); return; }
  const bc=cfg.bridges[bi];
  const baud=document.getElementById('s-b'+bi+'b')?.value || bc.baud || '9600';
  bc.baud=baud;
  const link=bridgeLink(bi);

  // ── IP → Serial converter (no COM port, no USB driver) ──
  if(link==='tcp'){
    if(!window.issDesktop?.tcpOpen){ toast('Network gateways need the desktop EXE','error'); return; }
    const host=(document.getElementById('s-b'+bi+'host')?.value||bc.tcpHost||'').trim();
    const port=parseInt(document.getElementById('s-b'+bi+'tport')?.value||bc.tcpPort||8899);
    if(!host){ toast('Enter the gateway IP address','error'); return; }
    bc.tcpHost=host; bc.tcpPort=port; bc.paired=true; saveCfg();
    setMon(bi,'Connecting to '+host+':'+port+'…');
    const r=await window.issDesktop.tcpOpen(bi,{host,port,pollCmd:bc.pollCmd||'',pollMs:bc.pollMs||1000});
    if(r&&r.ok){
      auditLog('config','settings','bridge'+bi,'Connected TCP '+host+':'+port);
      toast((bc.name||'Bridge '+(bi+1))+' connecting to '+host,'success');
    }else{
      setMon(bi,'ERROR: '+(r?.error||'could not connect'));
      toast('Could not reach '+host+':'+port+' — '+(r?.error||'unknown'),'error',6000);
    }
    return;
  }

  // ── ScaleLink WiFi box (WebSocket) ──
  if(link==='box'){
    const url=(document.getElementById('s-b'+bi+'ws')?.value||bc.boxUrl||'').trim();
    if(!url){ toast('Enter the ScaleLink URL — e.g. ws://192.168.4.1:81','error'); return; }
    bc.boxUrl=url; bc.paired=true; saveCfg();
    connectBox(url,bi);   // note: connectBox takes (url, bi)
    return;
  }

  // ── EXE native path (USB / COM) ──
  if(window.issDesktop && _nativeSerial){
    const sel=document.getElementById('s-b'+bi+'port');
    const path=sel?.value;
    if(!path){ toast('Pick a COM port (click Refresh Ports first)','error'); return; }
    bc.comPath=path; bc.paired=true; saveCfg();
    setMon(bi,'Opening '+path+' @ '+baud+'…');
    const r=await window.issDesktop.serialOpen(bi,{path,baud,dataBits:8,parity:'none',stopBits:1,pollCmd:bc.pollCmd||'',pollMs:bc.pollMs||1000});
    if(r&&r.ok){
      auditLog('config','settings','bridge'+bi,'Connected '+path+' @ '+baud);
      toast((bc.name||'Bridge '+(bi+1))+' connecting on '+path,'success');
    }else{
      setMon(bi,'ERROR: '+(r?.error||'could not open'));
      toast('Could not open '+path+': '+(r?.error||'unknown'),'error',6000);
    }
    return;
  }

  // ── Browser Web Serial fallback ──
  if(!('serial' in navigator)){ toast('Run the desktop EXE for serial, or use Chrome/Edge','error'); return; }
  try{
    const port=await navigator.serial.requestPort();
    await port.open({baudRate:parseInt(baud)||9600});
    bc.paired=true; saveCfg();
    bState[bi].serial=port; bState[bi].state='connected';
    stopSim(bi);
    setPill('● Live','rgba(16,185,129,.12)','#6EE7B7',bi);
    readBrowserSerial(port,bi);
    // Browser polling for demand-mode indicators
    if(bc.pollCmd){
      try{
        const enc=new TextEncoder();
        const cmd=expandPoll(bc.pollCmd);
        const writer=port.writable.getWriter();
        await writer.write(enc.encode(cmd)); writer.releaseLock();
        if(_browserPoll[bi]) clearInterval(_browserPoll[bi]);
        _browserPoll[bi]=setInterval(async()=>{
          try{ const w=port.writable.getWriter(); await w.write(enc.encode(cmd)); w.releaseLock(); }catch{}
        }, parseInt(bc.pollMs)||1000);
      }catch{}
    }
    toast((bc.name||'Bridge '+(bi+1))+' live','success');
  }catch(e){
    if(e.name!=='AbortError') toast('Open failed: '+e.message,'error');
  }
}

async function readBrowserSerial(port,bi){
  const dec=new TextDecoder();
  try{
    while(port.readable){
      const reader=port.readable.getReader();
      try{
        while(true){
          const {value,done}=await reader.read();
          if(done) break;
          feedSerial(bi, dec.decode(value,{stream:true}));
        }
      }catch(e){ break; }
      finally{ reader.releaseLock(); }
    }
  }catch(e){}
}

async function stopBridge(bi){
  const bc=cfg.bridges[bi];
  bc.paired=false; delete bc.comPath; saveCfg();
  if(_browserPoll[bi]){ clearInterval(_browserPoll[bi]); _browserPoll[bi]=null; }
  if(window.issDesktop && _nativeSerial){ await window.issDesktop.serialClose(bi); }
  if(bState[bi].serial){ try{ await bState[bi].serial.close(); }catch{} bState[bi].serial=null; }
  bState[bi].state='sim'; startSim(bi);
  setMon(bi,'Stopped.');
  toast('Bridge stopped','info');
}

// Central feed: raw text in → parse → update weight + monitor
function feedSerial(bi, data){
  _monBuf[bi]=(_monBuf[bi]+data);
  const parts=_monBuf[bi].split(/[\r\n\x02\x03]+/);
  _monBuf[bi]=parts.pop();
  for(const ln of parts){
    if(!ln.trim()) continue;
    processLine(bi, ln);
  }
  // ── Idle-flush: some indicators send a fixed frame with NO line break.
  // If the leftover buffer looks like a full reading and nothing else
  // arrives within 250ms, parse it anyway.
  if(_idleFlush[bi]) clearTimeout(_idleFlush[bi]);
  if(_monBuf[bi].length>=4){
    _idleFlush[bi]=setTimeout(()=>{
      const leftover=_monBuf[bi];
      if(leftover.length>=4){
        processLine(bi, leftover);
        _monBuf[bi]='';
      }
    },250);
  }
  if(_monBuf[bi].length>300) _monBuf[bi]='';
}
function processLine(bi, ln){
  const bc=cfg.bridges[bi];
  const nums=numTokens(ln).map(t=>t.val);
  _deckLive[bi]=nums;
  if(_deckLearn[bi]) deckLearnTick(bi, nums);

  let w;
  if(isMulti(bc)){
    const d=parseDecks(nums, bc);
    bState[bi].decks=d.decks; bState[bi].deckSum=d.sum; bState[bi].deckAgrees=d.agrees;
    // Nothing mapped yet: fall back to the single-deck parser so a half-set-up
    // bridge still shows a weight instead of going dead.
    w = d.weight!==null && d.weight!==undefined ? d.weight : parseRaw(ln, bc);
  }else{
    bState[bi].decks=[]; bState[bi].deckSum=null; bState[bi].deckAgrees=null;
    w=parseRaw(ln, bc);
  }

  showMonLine(bi, ln, w);
  if(w!==null){
    bState[bi].live=w; bState[bi].state='connected'; bState[bi].seenAt=Date.now();
    if(bi===activeBridge){ updateWeight(w); renderDeckBar(); }
  }
  if(isMulti(bc)) refreshDeckSetupThrottled(bi);
}
function refreshDeckSetupThrottled(bi){
  const now=Date.now();
  if(now-_deckFieldsPaint<400) return;
  _deckFieldsPaint=now;
  if(document.getElementById('dkset'+bi)) renderDeckSetup(bi);
}

function setMon(bi,msg){
  const m=document.getElementById('mon'+bi);
  if(m) m.innerHTML='<div style="color:#94A3B8">'+esc(msg)+'</div>';
}
let _monLines=[[],[]];
function showMonLine(bi, ln, w){
  _monLines[bi].unshift({ln,w});
  if(_monLines[bi].length>8) _monLines[bi].pop();
  const m=document.getElementById('mon'+bi);
  if(m){
    m.innerHTML=_monLines[bi].map((x,i)=>
      `<div style="${i===0?'color:#6EE7B7':'color:#64748B'}">${esc(x.ln)}${x.w!==null?' <span style="color:#FBBF24">→ '+fmt(x.w)+'</span>':''}</div>`
    ).join('');
  }
  const d=document.getElementById('dec'+bi);
  if(d && w!==null) d.textContent=fmt(w)+' '+(cfg.weightUnit||'kg');
}


