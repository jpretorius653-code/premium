function parseRaw(ln,bc){
  if(ln==null) return null;
  ln=String(ln);
  // ── MANUAL position mode (only if explicitly chosen via parser tool) ──
  if(bc && bc.manualParse && parseInt(bc.read)>0){
    const skip=parseInt(bc.skip)||0, read=parseInt(bc.read)||6;
    const sub=ln.substr(skip,read).replace(/[^0-9.\-]/g,'');
    const w=parseFloat(sub);
    return isFinite(w)?w:null;
  }
  // ── AUTO mode (default) — find the weight number in the line ──
  const toks=numTokens(ln);
  if(!toks.length) return null;
  let best=null, bestLen=0;
  for(const t of toks){
    // pick the LONGEST numeric token — that's the weight, not a status digit
    const digits=String(t.val).replace(/[^0-9]/g,'').length;
    if(digits>bestLen){ bestLen=digits; best=t.val; }
  }
  return best;
}
async function unpairBridge(bi){
  const bc=cfg.bridges[bi];
  if(!confirm('Unpair the serial port for '+(bc.name||'Bridge '+(bi+1))+'? You will need to pick it again.'))return;
  if(window.issDesktop && _nativeSerial){ await disconnectNative(bi); auditLog('config','settings','bridge'+bi,'Released serial port'); return; }
  bc.paired=false; delete bc.usbVendorId; delete bc.usbProductId; saveCfg();
  await disconnectSerial(bi);
  auditLog('config','settings','bridge'+bi,'Unpaired serial port');
  toast('Port unpaired','info');
  renderSettings();
}
async function disconnectSerial(bi){
  const br=bState[bi];
  try{
    if(br.reader){ await br.reader.cancel(); /* releaseLock handled in readSerial finally */ }
  }catch{}
  // wait for the read loop's finally{} to release the lock
  await new Promise(r=>setTimeout(r,120));
  try{
    if(br.serial){ await br.serial.close(); br.serial=null; }
  }catch(e){ console.warn('close',e.message); }
  br.reader=null;
  br.state='disconnected';
  // let the OS fully release the COM handle before any reopen
  await new Promise(r=>setTimeout(r,250));
  startSim(bi);
  toast('Disconnected','info');
}

