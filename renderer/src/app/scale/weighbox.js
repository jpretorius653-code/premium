// ══════════════════════════════════════════════════════════
//  WEIGHBOX — ESP32 box auto-connect + remote_tx sync
// ══════════════════════════════════════════════════════════

// Connect to a WeighBox WebSocket (from box or manually entered URL)
/* Demand-mode polling over ScaleLink.
   USB and TCP both write the poll command straight down the wire; the box
   path could not, because a WebSocket frame is not a serial byte stream. The
   command is wrapped so the ESP32 knows to forward it to its RS232 port:

       {"cmd":"serial","data":"KPRINT\r\n"}

   The firmware must handle cmd=="serial" by writing data to Serial. Without
   that handler this is harmless — the box just ignores an unknown message. */
let boxPollTimers={};
function stopBoxPoll(bi){ if(boxPollTimers[bi]){ clearInterval(boxPollTimers[bi]); delete boxPollTimers[bi]; } }
function startBoxPoll(sock, bi){
  stopBoxPoll(bi);
  const bc=cfg.bridges[bi]||{};
  if(!bc.pollCmd) return;                       // streaming indicator: nothing to send
  const data=expandPoll(bc.pollCmd);            // <CR><LF> etc -> real bytes
  const send=()=>{
    if(!sock || sock.readyState!==1){ stopBoxPoll(bi); return; }
    try{ sock.send(JSON.stringify({cmd:'serial', data})); }
    catch(e){ console.warn('[box] poll send failed: '+e.message); }
  };
  send();
  boxPollTimers[bi]=setInterval(send, Math.max(250, parseInt(bc.pollMs)||1000));
}

function connectBox(url, bi){
  bi = bi ?? activeBridge;
  if(!url) return;
  disconnectBox(bi);
  stopSim(bi);
  try{
    const sock = new WebSocket(url);
    boxSocks[bi] = sock;
    sock.onopen = () => {
      setPill('📦 WeighBox live','rgba(16,185,129,.12)','#6EE7B7', bi);
      toast('WeighBox connected on Bridge '+(bi+1),'success');
      sock.send(JSON.stringify({cmd:'ping'}));
      startBoxPoll(sock, bi);        // demand-mode indicators (920i KPRINT etc.)
    };
    sock.onmessage = e => {
      try{
        const d = JSON.parse(e.data);
        // ── Live weight update from box
        if(d.weight != null || d.kg != null){
          const w = parseFloat(d.weight ?? d.kg) || 0;
          bState[bi].live = w; bState[bi].seenAt = Date.now();
          if(d.box_name) cfg.bridges[bi].name = d.box_name;
          if(bi === activeBridge) updateWeight(w);
          boxInfo[bi] = d;
          // Update pill with box ID
          const lbl = (d.box_name||('Box '+(bi+1))) + (d.scale_ok?' ●':' ○');
          setPill('📦 '+lbl,'rgba(16,185,129,.12)','#6EE7B7', bi);
        }
        // ── Remote transaction from another box on the network (UDP relay)
        if(d.cmd === 'remote_tx' && d.tx){
          mergeRemoteTx(d.tx, d.from_box);
        }
      }catch{}
    };
    sock.onclose = () => {
      setPill('◌ Box disconnected','rgba(239,68,68,.12)','#FCA5A5', bi);
      startSim(bi);
      // Auto-reconnect after 5s
      clearTimeout(boxReconnTimers[bi]);
      boxReconnTimers[bi] = setTimeout(() => connectBox(url, bi), 5000);
    };
    sock.onerror = () => {};
  }catch(e){ toast('Box connect error: '+e.message,'error'); startSim(bi); }
}

function disconnectBox(bi){
  stopBoxPoll(bi);
  clearTimeout(boxReconnTimers[bi]);
  boxReconnTimers[bi] = null;
  if(boxSocks[bi]){ try{ boxSocks[bi].close(); }catch{} boxSocks[bi]=null; }
}

// Tell the box about a completed transaction → it relays to all other boxes via UDP
function syncTxToBox(tx){
  boxSocks.forEach(sock => {
    if(sock && sock.readyState === WebSocket.OPEN){
      sock.send(JSON.stringify({cmd:'sync_tx', tx}));
    }
  });
  // Also push to Electron desktop sync if available
  if(window.issDesktop) window.issDesktop.syncWrite(tx).catch(()=>{});
}

// Merge a transaction that arrived from another box
function mergeRemoteTx(txData, fromBox){
  try{
    const rt = typeof txData === 'string' ? JSON.parse(txData) : txData;
    if(!rt || !rt.id) return;
    // Already have it?
    if(txs.find(t => t.id === rt.id)) return;
    txs.unshift(rt);
    // If it was pending on our side, remove from pending
    pending = pending.filter(p => p.vehicleReg !== rt.vehicleReg);
    saveTxs(); savePend();
    try{ syncTicketNow(); }catch(e){}
    updateWBCount();
    toast('🔄 Synced from Box '+(fromBox||'?')+': '+rt.vehicleReg+' — '+fmt(rt.net||0)+' kg','info');
    if(currentTab==='dashboard') renderDash();
    if(currentTab==='records') renderRecords();
  }catch(e){ console.error('mergeRemoteTx',e); }
}

// Scan the local network for WeighBox devices via /info endpoint
// Tries common IPs: 192.168.x.1 (gateway/AP) and mDNS hostnames
async function scanForBoxes(){
  if(window.issDesktop) return [];   // offline EXE: native serial only, no network scan
  const results = [];
  const urls = [
    'http://192.168.4.1/info',      // ESP32 default AP IP
    'http://iss-wb-001.local/info', // mDNS box 001
    'http://iss-wb-002.local/info', // mDNS box 002
    'http://iss-wb-003.local/info', // mDNS box 003
  ];
  // Also try the current page's host if served from a box
  if(window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'){
    urls.unshift('http://'+window.location.hostname+'/info');
  }
  await Promise.allSettled(urls.map(async url => {
    try{
      const r = await fetch(url, {signal: AbortSignal.timeout(1500)});
      if(r.ok){ const d = await r.json(); results.push({...d, url}); }
    }catch{}
  }));
  return results;
}

// Auto-connect: called on startup — if loaded FROM a box, connect immediately
function autoConnectBox(){
  // The WeighBox firmware injects window._ISS_BOX_WS with the WebSocket URL
  if(window._ISS_BOX_WS){
    toast('📦 WeighBox detected — connecting…','info');
    connectBox(window._ISS_BOX_WS, 0);
    // Save it for future manual use
    if(!cfg.bridges[0].src) { cfg.bridges[0].src = window._ISS_BOX_WS; saveCfg(); }
    return;
  }
  // Also check if saved box URLs exist in config
  cfg.bridges.forEach((br, i) => {
    if(i>=planBridges()) return;          // the plan decides how many run
    if(br.src && /^wss?:\/\//.test(br.src)){
      connectBox(br.src, i);
    }
  });
}

