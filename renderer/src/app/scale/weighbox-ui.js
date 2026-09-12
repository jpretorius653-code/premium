// ─────────────────────────────────────────────────
// WeighBox settings UI helpers
// ─────────────────────────────────────────────────
function connectBoxFromSettings(bi){
  const urlInput = document.getElementById('sBr'+(bi===0?'1':'2')+'Src');
  const url = urlInput?.value.trim() || cfg.bridges[bi]?.src;
  if(!url || !/^wss?:\/\//.test(url)){
    toast('Enter a WeighBox WebSocket URL first — e.g. ws://192.168.4.1:81','error');
    return;
  }
  setBridge(bi,'src',url);
  connectBox(url, bi);
}

async function scanAndShowBoxes(bi){
  toast('Scanning for WeighBox devices…','info');
  const found = await scanForBoxes();
  if(!found.length){
    openModal('🔍 Scan — No boxes found',`
      <div style="text-align:center;padding:20px">
        <div style="font-size:36px;margin-bottom:12px">📡</div>
        <p style="color:var(--text2);margin-bottom:16px">No ${esc(BRAND.boxName)} devices found on this network.</p>
        <p style="font-size:12px;color:var(--text3)">Make sure the box is powered on and either:<br>
          • Connected to the same WiFi as this PC<br>
          • Or connect this PC to the box's hotspot (ISS-WeighBox-001)</p>
        <button class="btn btn-ghost" style="margin-top:14px;width:100%" onclick="closeModal()">Close</button>
      </div>`);
    return;
  }
  const rows = found.map(b => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border:1.5px solid var(--border);border-radius:10px;margin-bottom:8px">
      <div>
        <div style="font-weight:800;font-size:14px;color:var(--ink)">📦 ${esc(b.box_name||b.box_id)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">
          ID: ${b.box_id} · FW: ${b.fw||'?'} · ${b.scale_ok?'🟢 Scale live':'⚫ Scale offline'}
        </div>
        <div style="font-size:11px;color:var(--text3)">IP: ${b.sta_ip||b.ap_ip||'?'}</div>
      </div>
      <button class="btn btn-navy" style="padding:8px 14px;font-size:12px"
        onclick="connectBoxFromScan('ws://${(b.sta_ip||b.ap_ip||'192.168.4.1')}:81',${bi})">
        Connect to Bridge ${bi+1}
      </button>
    </div>`).join('');
  openModal('🔍 WeighBox Devices Found',
    `<p style="font-size:12px;color:var(--text3);margin-bottom:14px">${found.length} box${found.length!==1?'es':''} on this network:</p>${rows}
     <button class="btn btn-ghost" style="width:100%;margin-top:4px" onclick="closeModal()">Cancel</button>`);
}

function connectBoxFromScan(url, bi){
  closeModal();
  setBridge(bi,'src',url);
  // Update URL field in settings if visible
  const sel = document.getElementById('sBr'+(bi===0?'1':'2')+'Src');
  if(sel) sel.value = url;
  connectBox(url, bi);
  toast('Connecting to WeighBox on Bridge '+(bi+1)+'…','info');
}

