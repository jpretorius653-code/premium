function renderSettings(){ try{enforcePlan();}catch(e){} setTimeout(refreshShareStat,120); setTimeout(()=>{ if(window.issDesktop&&_nativeSerial){refreshPortList(0);refreshPortList(1);} },150);
  const b0=cfg.bridges[0],b1=cfg.bridges[1];
  document.getElementById('content').innerHTML=`
    <div class="sec-hd"><h2>Settings</h2><div class="sub">Master access only</div></div>
    <div class="card" style="margin-bottom:12px">
      <div class="sg-title">Branding / White-label</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:10px">Active brand: <b style="color:var(--blue)">${esc((window._brand&&window._brand.company)||cfg.companyName||(ISS_CO.name+' (default)'))}</b>${window._brand?` · licensed to ${esc(window._brand.licensedTo||window._brand.company)}`:''}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <label style="cursor:pointer"><input type="file" accept="application/json,.json" style="display:none" onchange="importBrandFile(this.files[0])"/>
          <span class="btn btn-navy btn-sm">📥 Import branding file (.json)</span></label>
        <button class="btn btn-ghost btn-sm" onclick="resetBrand()">↺ Reset to default</button>
      </div>
      <div style="font-size:12px;color:var(--text3);margin-top:8px">Create the file in the ${esc(BRAND.vendorShort)} Brand Builder, then import it here. Logo, colours, company details and ticket info apply instantly and persist.</div>
    </div>
    ${(window.issDesktop && !_nativeSerial) ? `<div class="card" style="border:1px solid var(--amber);background:rgba(245,158,11,.08);margin-bottom:12px">
      <div style="font-weight:800;color:var(--amber);margin-bottom:6px">⚠ Native serial not loaded — ports won't be remembered</div>
      <div style="font-size:13px;color:var(--text2);line-height:1.5">
        The app is running on the Web Serial fallback, which must be re-picked each launch and is not saved. The built-in serial driver failed to load:
        <div style="font-family:monospace;font-size:12px;color:var(--text);background:var(--pit);border:1px solid var(--border);border-radius:6px;padding:8px;margin:8px 0">${esc((_serialErr&&_serialErr.loadError)||'reason unavailable')}</div>
        Fix: rebuild so the serial driver matches this app — <span style="font-family:monospace">npm install</span> then <span style="font-family:monospace">npm run dist</span> (or <span style="font-family:monospace">npx electron-rebuild -f -w serialport</span>). Full detail under <b>Help → Serial Diagnostics</b>.
      </div>
    </div>` : ''}
    <div class="sg"><div class="sg-title">Site Identity
        ${identityLocked()?`<button class="btn btn-ghost btn-sm" style="float:right"
          onclick="askIdentity(()=>renderSettings())">🔒 Unlock naming</button>`:
          `<span style="float:right;font-size:11px;color:#34D399">🔓 unlocked this session</span>`}</div>
      <div class="card">
        <div class="row2">
          <div class="field"><label>Company Name ${coNameLocked()?'\u{1F512}':''}</label>
            <input id="s-co" ${coNameLocked()?'disabled':''} value="${esc(plan().tieTicketName?planSiteName():(cfg.companyName||''))}" placeholder="${ISS.name}" onblur="${plan().tieTicketName?'setPlanSiteName(this.value)':"setSave('companyName',this.value);applyBranding()"}"/>
            ${plan().tieTicketName?`<div style="font-size:11px;color:var(--text3);margin-top:3px">Follows the site name on ${esc(planLabel())}.</div>`:''}</div>
          <div class="field"><label>Site Name ${siteNameLocked()?'\u{1F512}':''}</label>
            <input id="s-site" ${siteNameLocked()?'disabled':''} value="${esc(planSiteName())}" placeholder="Woestaleen Colliery" onblur="setPlanSiteName(this.value)"/>
            <div style="font-size:11px;color:var(--text3);margin-top:3px">${siteNameLocked()?'Set by '+BRAND.vendorShort+' for this installation.':siteEditsText()}</div></div>
          <div class="field"><label>Site Code</label>
            <input id="s-sitecode" value="${esc(cfg.siteCode||'')}" placeholder="hillside"
              onblur="setSave('siteCode',this.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,''));renderSettings()"/>
            <div style="font-size:11px;color:var(--text3);margin-top:3px">
              Short code that tags every ticket for the cloud, e.g. <b>hillside</b> or <b>primecoal</b>.
              Lower case, no spaces. Ticket numbers repeat across sites — this is what keeps them apart.
              Currently sending: <b style="font-family:monospace">${esc(siteCode())}</b>
            </div>
          </div>
        </div>
        <div class="row2">
          <div class="field"><label>Weight Unit</label>
            <select id="s-unit" onchange="setSave('weightUnit',this.value)">
              <option ${cfg.weightUnit==='kg'?'selected':''}>kg</option>
              <option ${cfg.weightUnit==='t'?'selected':''}>t</option>
            </select>
          </div>
          <div class="field"><label>Gross Max (kg, 0=off)</label><input id="s-max" type="number" value="${cfg.grossMax||0}" onblur="setSave('grossMax',parseFloat(this.value)||0)"/></div>
        </div>
      </div>
    </div>
    ${planPanelHTML()}
    <div class="sg"><div class="sg-title">Printing</div>
      <div class="card">
        <div class="row2">
          <div class="field"><label>Default Print</label>
            <select onchange="setSave('defaultPrint',this.value)"><option value="thermal" ${cfg.defaultPrint==='thermal'?'selected':''}>Thermal 80mm</option><option value="a4" ${cfg.defaultPrint==='a4'?'selected':''}>A4</option></select>
          </div>
          <div class="field"><label>Copies</label>
            <select onchange="setSave('copies',parseInt(this.value))"><option ${cfg.copies===1?'selected':''}>1</option><option ${cfg.copies===2?'selected':''}>2</option><option ${cfg.copies===3?'selected':''}>3</option></select>
          </div>
        </div>
        <div class="sr" style="margin-top:8px">
          <div class="sr-l"><div class="sr-lbl">Raw ESC/POS thermal mode</div><div class="sr-sub">Direct to printer over serial — auto-cuts paper, no browser dialog</div></div>
          <div class="toggle${cfg.escposMode?' on':''}" onclick="toggleSetting('escposMode')"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="btn btn-navy btn-sm" onclick="openTicketBuilder()">🎨 Design Ticket</button>
          <button class="btn btn-ghost btn-sm" onclick="previewTicket()">👁 Preview</button>
        </div>
        <div class="sr-sub" style="margin-top:8px">Tickets print to your <b>Windows default printer</b>. Set the printer (and 80mm roll size) in Windows → Printers.</div>
      </div>
    </div>
    <div class="sg"><div class="sg-title">Data Safety</div>
      <div class="card">
        <div class="sr-sub" style="margin-bottom:8px">Settings, users, custom fields and every transaction are written to disk automatically. Use these if anything ever looks wrong.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-navy btn-sm" onclick="manualSaveAll()">💾 Save Everything Now</button>
          <button class="btn btn-amber btn-sm" onclick="manualRestore()">♻ Restore From Disk</button>
          <button class="btn btn-ghost btn-sm" onclick="exportBackupFile()">↓ Export Backup File</button>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('imp-file').click()">↑ Import Backup File</button>
          <input type="file" id="imp-file" accept=".json" style="display:none" onchange="importBackupFile(this)"/>
          <button class="btn btn-amber btn-sm" onclick="document.getElementById('imp-legacy').click()">🧾 Recover Old Tickets</button>
          <input type="file" id="imp-legacy" accept=".json" style="display:none" onchange="importLegacyTickets(this)"/>
        </div>
        <div id="ds-stat" style="font-size:11px;color:var(--text3);margin-top:8px">${esc(txs.length)} transaction(s) · ${esc((cfg.customFields||[]).length)} custom field(s) · ${esc(users.length)} user(s)</div>
      </div>
    </div>
    <div class="sg"><div class="sg-title">Ticket Numbering</div>
      <div class="card">
        <div class="row2">
          <div class="field"><label>Prefix</label><input id="s-tkpre" value="${esc(cfg.ticketPrefix!==undefined?cfg.ticketPrefix:'WB')}" placeholder="e.g. WB" onblur="setTicketPrefix(this.value)"/></div>
          <div class="field"><label>Digits</label>
            <select onchange="setSave('ticketPad',parseInt(this.value));renderSettings()">
              ${[3,4,5,6].map(d=>`<option value="${d}" ${(parseInt(cfg.ticketPad)||3)===d?'selected':''}>${d} — ${'0'.repeat(d-1)}1</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap">
          <div style="font-size:12px;color:var(--text3)">Next ticket:</div>
          <div style="font-family:monospace;font-weight:800;font-size:16px;color:var(--green)">${esc(fmtTicketNo(peekTicketSeq()))}</div>
          <button class="btn btn-ghost btn-sm" onclick="setNextTicketNo()">Set next number…</button>
        </div>
        <div class="sr-sub" style="margin-top:6px">Numbering is sequential and never reused. Setting it lower than an existing ticket is blocked.</div>
      </div>
    </div>
    <div class="sg"><div class="sg-title">Custom Fields — extra info on tickets &amp; records</div>
      <div class="card">
        <div class="sr-sub" style="margin-bottom:8px">Add your own fields (e.g. Seal No, Trailer Reg, Permit). They appear on the complete-transaction form, print on tickets, and export to CSV.</div>
        <div id="cf-list">${(cfg.customFields||[]).map(f=>`
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
            <div style="flex:1;font-weight:700">${esc(f.label)}</div>
            <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer">
              <input type="checkbox" ${f.onTicket!==false?'checked':''} onchange="toggleCFTicket('${f.id}',this.checked)"/> on ticket
            </label>
            <button class="btn btn-red btn-sm" onclick="delCustomField('${f.id}')">✕</button>
          </div>`).join('')||'<div style="color:var(--text3);font-size:12px;padding:6px 0">No custom fields yet.</div>'}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <input id="cf-new" placeholder="Field name — e.g. Seal No" style="flex:1"/>
          <button class="btn btn-navy btn-sm" onclick="addCustomField()">＋ Add Field</button>
        </div>
      </div>
    </div>
    <div class="sg"><div class="sg-title">Bridge 1 — Scale Indicator</div>
      <div class="card">
        <div class="row2">
          <div class="field"><label>Bridge Name</label><input value="${esc(b0?.name||'Bridge 1')}" onblur="setBridge(0,'name',this.value)"/></div>
          <div class="field"><label>Weight Division (kg)</label>
            <input type="number" min="0" step="1" placeholder="blank = use reading as-is" value="${b0?.division||''}" onblur="setBridge(0,'division',this.value)"/>
            <div style="font-size:11px;color:var(--text3);margin-top:3px">Leave blank to record the exact reading. Enter e.g. 20 to round captured weights to the nearest 20 kg.</div>
          </div>
        </div>
        <div class="row2">
                    <div class="field"><label>Connection</label>
            <select onchange="setBridgeLink(0,this.value)">
              <option value="usb" ${bridgeLink(0)==='usb'?'selected':''}>USB / COM port (direct cable)</option>
              <option value="tcp" ${bridgeLink(0)==='tcp'?'selected':''}>IP → Serial converter (network)</option>
              <option value="box" ${bridgeLink(0)==='box'?'selected':''}>${esc(BRAND.deviceName)} WiFi box</option>
            </select>
            <div style="font-size:11px;color:var(--text3);margin-top:3px">Network options need no USB driver — use them where the PC keeps dropping USB-serial adapters.</div>
          </div>
          ${bridgeLink(0)==='tcp'?`<div class="row2">
            <div class="field"><label>Gateway IP</label><input id="s-b0host" value="${esc(cfg.bridges[0]?.tcpHost||'')}" placeholder="192.168.1.50"/></div>
            <div class="field"><label>Port</label><input id="s-b0tport" type="number" value="${cfg.bridges[0]?.tcpPort||8899}"/></div>
          </div>`:''}
          ${bridgeLink(0)==='box'?`<div class="field"><label>ScaleLink URL</label>
            <input id="s-b0ws" value="${esc(cfg.bridges[0]?.boxUrl||'')}" placeholder="ws://192.168.4.1:81"/></div>`:''}
          ${bridgeLink(0)==="usb"?`<div class="field"><label>COM Port</label>
            <select id="s-b0port"><option value="">— pick after Refresh —</option></select>
          </div>`:""}
          <div class="field"><label>Baud Rate</label>
            <select id="s-b0b" onchange="setBridge(0,'baud',this.value)">${['1200','2400','4800','9600','19200','38400','57600','115200'].map(b=>`<option ${(b0?.baud||'9600')===b?'selected':''}>${b}</option>`).join('')}</select>
          </div>
        </div>
        <div class="row2">
          ${pollFieldHTML(0,b0)}
          <div class="field"><label>Ask every (ms)</label>
            <select id="s-b0pollms" onchange="setBridge(0,'pollMs',this.value)">
              <option value="500" ${String(b0?.pollMs)==='500'?'selected':''}>500</option>
              <option value="1000" ${(!b0?.pollMs||String(b0?.pollMs)==='1000')?'selected':''}>1000</option>
              <option value="2000" ${String(b0?.pollMs)==='2000'?'selected':''}>2000</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
          <button class="btn btn-ghost btn-sm" onclick="refreshPortList(0)">🔄 Refresh Ports</button>
          <button class="btn btn-navy btn-sm" onclick="connectBridge(0)">🔌 Connect &amp; Go Live</button>
          <button class="btn btn-ghost btn-sm" onclick="stopBridge(0)">Stop</button>
        </div>
        <div style="margin-top:10px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Live Data — what the indicator is sending</div>
          <div id="mon0" style="background:var(--base);border:1px solid var(--line-2);border-radius:8px;padding:8px;height:80px;overflow-y:auto;font-family:'Courier New',monospace;font-size:11px;color:#6EE7B7;line-height:1.5">Not connected.</div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px">
            <span style="color:var(--text3)">Decoded weight:</span>
            <span id="dec0" style="font-family:monospace;font-weight:800;color:var(--green);font-size:15px">—</span>
          </div>
        </div>
        ${deckSetupHTML(0)}
      </div>
    </div>
    ${planBridges()>1?'':`<div class="sg"><div class="sg-title">Second Indicator</div>
      <div class="card"><div style="font-size:13px;color:var(--text2)">
        This installation runs one weighbridge. A second indicator comes with the
        Premium plan — speak to ${esc(BRAND.vendorShort)} to move up.</div></div></div>`}
    <div class="sg" style="display:${planBridges()>1?'':'none'}"><div class="sg-title">Bridge 2 — Second Indicator (optional)</div>
      <div class="card">
        <div class="row2">
          <div class="field"><label>Bridge Name</label><input value="${esc(b1?.name||'Bridge 2')}" onblur="setBridge(1,'name',this.value);renderBridgePills()"/></div>
          <div class="field"><label>Weight Division (kg)</label>
            <input type="number" min="0" step="1" placeholder="blank = use reading as-is" value="${b1?.division||''}" onblur="setBridge(1,'division',this.value)"/>
            <div style="font-size:11px;color:var(--text3);margin-top:3px">Leave blank to record the exact reading. Enter e.g. 20 to round captured weights to the nearest 20 kg.</div>
          </div>
        </div>
        <div class="row2">
                    <div class="field"><label>Connection</label>
            <select onchange="setBridgeLink(1,this.value)">
              <option value="usb" ${bridgeLink(1)==='usb'?'selected':''}>USB / COM port (direct cable)</option>
              <option value="tcp" ${bridgeLink(1)==='tcp'?'selected':''}>IP → Serial converter (network)</option>
              <option value="box" ${bridgeLink(1)==='box'?'selected':''}>${esc(BRAND.deviceName)} WiFi box</option>
            </select>
            <div style="font-size:11px;color:var(--text3);margin-top:3px">Network options need no USB driver — use them where the PC keeps dropping USB-serial adapters.</div>
          </div>
          ${bridgeLink(1)==='tcp'?`<div class="row2">
            <div class="field"><label>Gateway IP</label><input id="s-b1host" value="${esc(cfg.bridges[1]?.tcpHost||'')}" placeholder="192.168.1.50"/></div>
            <div class="field"><label>Port</label><input id="s-b1tport" type="number" value="${cfg.bridges[1]?.tcpPort||8899}"/></div>
          </div>`:''}
          ${bridgeLink(1)==='box'?`<div class="field"><label>ScaleLink URL</label>
            <input id="s-b1ws" value="${esc(cfg.bridges[1]?.boxUrl||'')}" placeholder="ws://192.168.4.1:81"/></div>`:''}
          ${bridgeLink(1)==="usb"?`<div class="field"><label>COM Port</label>
            <select id="s-b1port"><option value="">— pick after Refresh —</option></select>
          </div>`:""}
          <div class="field"><label>Baud Rate</label>
            <select onchange="setBridge(1,'baud',this.value)">${['1200','2400','4800','9600','19200','38400','57600','115200'].map(b=>`<option ${(b1?.baud||'9600')===b?'selected':''}>${b}</option>`).join('')}</select>
          </div>
        </div>
        <div class="row2">
          ${pollFieldHTML(1,b1)}
          <div class="field"><label>Ask every (ms)</label>
            <select id="s-b1pollms" onchange="setBridge(1,'pollMs',this.value)">
              <option value="500" ${String(b1?.pollMs)==='500'?'selected':''}>500</option>
              <option value="1000" ${(!b1?.pollMs||String(b1?.pollMs)==='1000')?'selected':''}>1000</option>
              <option value="2000" ${String(b1?.pollMs)==='2000'?'selected':''}>2000</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
          <button class="btn btn-ghost btn-sm" onclick="refreshPortList(1)">🔄 Refresh Ports</button>
          <button class="btn btn-navy btn-sm" onclick="connectBridge(1)">🔌 Connect &amp; Go Live</button>
          <button class="btn btn-ghost btn-sm" onclick="stopBridge(1)">Stop</button>
        </div>
        <div style="margin-top:10px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Live Data</div>
          <div id="mon1" style="background:var(--base);border:1px solid var(--line-2);border-radius:8px;padding:8px;height:80px;overflow-y:auto;font-family:'Courier New',monospace;font-size:11px;color:#6EE7B7;line-height:1.5">Not connected.</div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px">
            <span style="color:var(--text3)">Decoded weight:</span>
            <span id="dec1" style="font-family:monospace;font-weight:800;color:var(--green);font-size:15px">—</span>
          </div>
        </div>
        ${deckSetupHTML(1)}
      </div>
    </div>
    <div class="sg"><div class="sg-title">Multi-PC Sync (Electron desktop only)</div>
      <div class="card">
        <div class="sr"><div class="sr-l"><div class="sr-lbl">Auto-sync via shared folder</div><div class="sr-sub">Transactions written to a shared network path and merged every 15 s</div></div>
          <div class="toggle${cfg.syncEnabled?' on':''}" id="tSync" onclick="toggleSetting('syncEnabled')"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <input id="s-sync" value="${esc(cfg.syncFolder||'')}" placeholder="\\\\SERVER\\Weighbridge\\Sync" style="flex:1" onblur="setSave('syncFolder',this.value)"/>
          <button class="btn btn-ghost btn-sm" onclick="pickSyncFolder()">Browse</button>
        </div>
      </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <button class="btn btn-navy btn-sm" onclick="shareNow()">⇅ Sync Now</button>
          <button class="btn btn-amber btn-sm" onclick="shareRebuildNow()">♻ Rebuild From Share</button>
          <span id="share-stat" style="font-size:11px;color:var(--text3);align-self:center">checking…</span>
        </div>
        <div class="sr-sub" style="margin-top:6px">Both weighbridges point at the same folder. Orders, users, custom fields, trucks on site and every ticket stay in step. Syncing only ever adds — a record is deleted only when you delete it from a dashboard.</div>
    </div>
    <div class="sg"><div class="sg-title">Diagnostics</div>
      <div class="card">
        <div class="sr"><div class="sr-l"><div class="sr-lbl">On-screen debug console</div><div class="sr-sub">Shows sync activity and errors in a panel (bottom-right). Toggle anytime with Ctrl+Alt+D. Leave off for normal use.</div></div>
          <div class="toggle${cfg.debugPanel?' on':''}" id="tDbg" onclick="Debug.show();renderSettings()"></div>
        </div>
      </div>
    </div>
    <div class="sg"><div class="sg-title">Security</div>
      <div class="card">
        <div class="row2">
          <div class="field"><label>Activation Code (blank = keep)</label><input id="s-act" type="text" placeholder="change code" onblur="changeActCode(this.value)"/></div>
          <div class="field"><label>Master Password (blank = keep)</label><input id="s-mp" type="password" placeholder="•••• change" onblur="changeMasterPass(this.value)"/></div>
        </div>
        <div class="row2">
          <div class="field"><label>Override PIN — unlock edits &amp; manual weigh (blank = keep)</label><input id="s-ovr" type="password" placeholder="•••• set override" onblur="changeOverridePass(this.value)"/></div>
          <div class="field" style="display:flex;align-items:flex-end">
            ${cfg.overridePassHash?`<button class="btn btn-ghost btn-sm" onclick="clearOverridePass()">Clear override (use Master)</button>`:`<div style="font-size:11px;color:var(--text3)">Not set — edits/manual use the Master password/PIN.</div>`}
          </div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">The override is a separate code you can give a supervisor to authorise field edits and manual weighing, without handing over full master access.</div>
      </div>
    </div>
    <div class="sg"><div class="sg-title">Auto-Backup — Power Cut Protection</div>
      <div class="card">
        <div class="sr">
          <div class="sr-l">
            <div class="sr-lbl">💾 Auto-backup disk folder</div>
            <div class="sr-sub" id="backupFolderStatus">Not set — data saved to browser storage only</div>
          </div>
          <button class="btn btn-blue btn-sm" onclick="setupBackupFolder()">Set Folder</button>
        </div>
        <div class="sr">
          <div class="sr-l">
            <div class="sr-lbl">Storage status</div>
            <div class="sr-sub" id="storageStatus">Checking…</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="checkStorageStatus()">Refresh</button>
        </div>
        <div class="sr"><div class="sr-lbl">Export full backup now</div>
          <button class="btn btn-ghost btn-sm" onclick="backupAll()">↓ Export JSON</button>
        </div>
        <div class="sr"><div class="sr-lbl">Restore from backup file</div>
          <label style="cursor:pointer"><input type="file" accept=".json" style="display:none" onchange="restoreAll(this)"/>
            <span class="btn btn-ghost btn-sm">↑ Import JSON</span></label>
        </div>
        <div class="sr"><div class="sr-l"><div class="sr-lbl" style="color:var(--red)">Clear ALL data</div><div class="sr-sub">Wipes transactions and pending queue. Cannot undo.</div></div>
          <button class="btn btn-red btn-sm" onclick="clearAll()">Clear</button>
        </div>
      </div>
    </div>`;
}
function setSave(k,v){
  if(k==='siteName' && siteNameLocked()){
    toast('Set by '+BRAND.vendorShort+' for this installation','error',3500);
    if(typeof renderSettings==='function' && currentTab==='settings') renderSettings();
    return;
  }
  if(k==='companyName' && plan().tieTicketName && planLocked()){
    toast('The company name follows the site name on this plan','error',3500);
    if(typeof renderSettings==='function' && currentTab==='settings') renderSettings();
    return;
  }
  cfg[k]=v; if(k==='ticketPad')cfg._ticketAt=nowISO(); saveCfg();}
async function shareNow(){
  if(!cfg.syncFolder){ toast('Set the shared folder first','error'); return; }
  toast('Syncing…','info');
  const st=await window.issDesktop.sharedStatus();
  if(!st||!st.ok){ toast('Cannot reach the shared folder: '+((st&&st.reason)||'unknown'),'error',7000); return; }
  const n=await sharePull(); await sharePushAll();
  toast(n?('Synced ✓ — '+n+' record(s) updated'):'Synced ✓ — already up to date','success',4000);
  renderSettings();
}
async function shareRebuildNow(){
  if(!cfg.syncFolder){ toast('Set the shared folder first','error'); return; }
  if(!confirm('Rebuild this PC from the shared database?\n\nThis ADDS BACK everything on the share. Nothing on this PC is deleted.')) return;
  const n=await shareRebuild();
  toast(n?('Rebuilt ✓ — '+n+' record(s) restored'):'Nothing new on the share','success',4000);
  renderSettings();
}
async function refreshShareStat(){
  const el=document.getElementById('share-stat'); if(!el) return;
  if(!cfg.syncFolder){ el.textContent='no shared folder set'; el.style.color='var(--text3)'; return; }
  if(!window.issDesktop){ el.textContent='desktop app only'; return; }
  try{
    const st=await window.issDesktop.sharedStatus();
    if(st&&st.ok){ el.textContent='● shared folder online'; el.style.color='var(--green)'; }
    else{ el.textContent='⚠ cannot reach share — '+((st&&st.reason)||'offline'); el.style.color='var(--amber)'; }
  }catch(e){ el.textContent='⚠ share unreachable'; el.style.color='var(--amber)'; }
}
function exportBackupFile(){
  const pack={_iss:'weighbridge-backup',_v:8,_at:nowISO()};
  _ALLKEYS.forEach(k=>{ let c=null; try{c=localStorage.getItem(k);}catch(e){} if(c) { try{pack[k]=JSON.parse(c);}catch(e){} } });
  const blob=new Blob([JSON.stringify(pack)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='Weighbridge-Backup-'+txYMD(nowISO())+'.json';
  a.click();
  auditLog('config','settings','','Exported backup file');
  toast('Backup file exported','success');
}
// Pull a transaction array out of ANY backup shape we've ever shipped:
//  - {_iss:'weighbridge-backup', iss8_txs:[...]}
//  - {txs:[...]} (older backupAll format)
//  - a bare [ ... ] array of transactions
//  - nested under data/db/state
function extractLegacyTxs(pack){
  if(!pack) return [];
  if(Array.isArray(pack)) return pack.filter(looksLikeTx);
  const buckets=[];
  ['iss8_txs','txs','transactions','records','iss7_txs','iss_txs'].forEach(k=>{
    if(Array.isArray(pack[k])) buckets.push(...pack[k]);
  });
  ['data','db','state','store','backup'].forEach(k=>{
    if(pack[k]&&typeof pack[k]==='object') buckets.push(...extractLegacyTxs(pack[k]));
  });
  return buckets.filter(looksLikeTx);
}
function looksLikeTx(t){
  return t && typeof t==='object' &&
    (t.id||t.ticket||t.ticketNo) &&
    (t.vehicleReg||t.reg||t.registration||t.vehicle);
}
// Normalise an old ticket into the shape reprint/records expect
function normaliseLegacyTx(t){
  const n=Object.assign({},t);
  n.id          = n.id || n.ticket || n.ticketNo;
  n.vehicleReg  = n.vehicleReg || n.reg || n.registration || n.vehicle || '';
  n.completedAt = n.completedAt || n.date || n.timestamp || n.time || nowISO();
  n.firstWeight = num(n.firstWeight!=null?n.firstWeight:n.first);
  n.secondWeight= num(n.secondWeight!=null?n.secondWeight:n.second);
  if(n.net==null && isFinite(n.firstWeight) && isFinite(n.secondWeight))
    n.net=Math.abs(n.firstWeight-n.secondWeight);
  n.net=num(n.net);
  n.bridgeName  = n.bridgeName || n.bridge || 'Bridge 1';
  n.operatorName= n.operatorName || n.operator || n.clerk || '';
  n._imported   = true;
  return n;
}
function num(v){ const x=parseFloat(v); return isFinite(x)?x:0; }

// Import specifically to RECOVER OLD TICKETS. Never deletes; merges by id.
function importLegacyTickets(el){
  const f=el.files&&el.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    let pack=null;
    try{ pack=JSON.parse(r.result); }catch(e){ toast('That file is not valid JSON','error'); return; }
    const found=extractLegacyTxs(pack).map(normaliseLegacyTx);
    if(!found.length){ toast('No recognisable tickets found in that file','error',6000); return; }
    const have=new Set(txs.map(t=>String(t.id)));
    const add=found.filter(t=>!have.has(String(t.id)));
    if(!add.length){ toast('All '+found.length+' ticket(s) are already in Records','info',5000); el.value=''; return; }
    if(!confirm('Found '+found.length+' ticket(s) in the file.\n\n'+add.length+' are new and will be ADDED to Records.\nNothing already saved is deleted.\n\nImport now?')){ el.value=''; return; }
    txs=txs.concat(add);
    txs.sort((a,b)=>new Date(b.completedAt)-new Date(a.completedAt));
    saveTxs();
    // keep the ticket counter ahead of any imported sequential numbers
    try{
      let mx=parseInt(G(K.seq,0))||0;
      add.forEach(t=>{ const m=String(t.id).match(/(\d+)\s*$/); if(m){ const v=parseInt(m[1]); if(v>mx) mx=v; } });
      P(K.seq,mx);
    }catch(e){}
    if(cfg.syncFolder) add.forEach(t=>sharePut('txs',t.id,t));
    auditLog('import','tx','','Recovered '+add.length+' ticket(s) from a backup file');
    toast('Recovered '+add.length+' ticket(s) ✓ — reloading…','success',3500);
    el.value='';
    setTimeout(()=>{ if(currentTab==='records') renderRecords(); else renderTab('records'); },800);
  };
  r.readAsText(f);
}

function importBackupFile(el){
  const f=el.files&&el.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    let pack=null;
    try{ pack=JSON.parse(r.result); }catch(e){ toast('That file is not a valid backup','error'); return; }
    if(!pack||pack._iss!=='weighbridge-backup'){ toast('That file is not a Weighbridge backup','error'); return; }
    const inTx=(pack['iss8_txs']||[]).length;
    if(!confirm('Import this backup?\n\n'+inTx+' transaction(s) in the file.\n\nRecords are MERGED — nothing already saved is deleted.')) return;
    // merge transactions by id — never drop existing ones
    try{
      const have=G(K.txs,[]);
      const seen=new Set(have.map(t=>t.id));
      const merged=have.concat((pack['iss8_txs']||[]).filter(t=>t&&t.id&&!seen.has(t.id)));
      pack['iss8_txs']=merged;
    }catch(e){}
    _ALLKEYS.forEach(k=>{ if(pack[k]!==undefined){ try{ localStorage.setItem(k,JSON.stringify(pack[k])); }catch(e){} } });
    toast('Backup imported — reloading…','success',3000);
    setTimeout(()=>location.reload(),900);
  };
  r.readAsText(f);
  el.value='';
}
function setTicketPrefix(v){
  cfg.ticketPrefix=String(v||'').trim().toUpperCase().slice(0,10);
  cfg._ticketAt=nowISO();
  saveCfg(); auditLog('config','settings','','Ticket prefix set to "'+cfg.ticketPrefix+'"');
  renderSettings();
}
function setNextTicketNo(){
  const cur=peekTicketSeq();
  openModal('Set Next Ticket Number',`
    <div style="font-size:12px;color:var(--text2);margin-bottom:10px">
      Current next ticket: <b>${esc(fmtTicketNo(cur))}</b><br>
      Enter the number the next ticket should use. This is shared with the other
      PC, so both weighbridges continue from here.
    </div>
    <div class="field"><label>Next ticket number (digits only)</label>
      <input id="snt-v" type="number" inputmode="numeric" value="${cur}" style="font-size:18px;font-weight:700"/></div>
    <div id="snt-prev" style="font-size:12px;color:var(--text3);margin-top:4px"></div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn btn-green" style="flex:2" onclick="confirmNextTicketNo()">✓ Set Number</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
  setTimeout(()=>{ const el=document.getElementById('snt-v'); if(el){ el.focus(); el.select(); } },50);
}
function confirmNextTicketNo(){
  const el=document.getElementById('snt-v');
  const n=parseInt(String(el?.value||'').replace(/[^0-9]/g,''));
  if(!isFinite(n)||n<1){ toast('Enter a number of 1 or more','error'); el?.focus(); return; }
  // Never allow a number that would collide with an existing ticket
  if(txs.some(t=>t.id===fmtTicketNo(n))){
    toast('Ticket '+fmtTicketNo(n)+' already exists — pick a different number','error',6000); return;
  }
  P(K.seq,n-1);
  // Mark this as a deliberate reset so it beats the shared high-water mark on
  // the other PC (otherwise an inflated shared counter would pull it back up).
  cfg._seqResetAt=nowISO(); cfg._ticketAt=nowISO(); saveCfg();
  _ticketPushedSig=null;                 // force a re-push of the ticket config
  auditLog('config','settings','','Next ticket number set to '+fmtTicketNo(n));
  closeModal(); renderSettings();
  toast('Next ticket: '+fmtTicketNo(n),'success');
}
function addCustomField(){
  const el=document.getElementById('cf-new');
  const label=(el?.value||'').trim();
  if(!label){toast('Enter a field name first','error');return;}
  cfg.customFields=cfg.customFields||[];
  if(cfg.customFields.length>=8){toast('Maximum 8 custom fields','error');return;}
  if(cfg.customFields.some(f=>f.label.toLowerCase()===label.toLowerCase())){toast('That field already exists','error');return;}
  cfg.customFields.push({id:'cf'+Date.now().toString(36),label,onTicket:true});
  saveCfg(); auditLog('config','settings','','Added custom field: '+label);
  renderSettings(); toast('Field added ✓','success');
}
function delCustomField(id){
  const f=(cfg.customFields||[]).find(x=>x.id===id);
  if(!confirm('Remove field "'+(f?.label||'')+'"? Existing records keep their saved values.'))return;
  cfg.customFields=(cfg.customFields||[]).filter(x=>x.id!==id);
  saveCfg(); auditLog('config','settings','','Removed custom field: '+(f?.label||id));
  renderSettings();
}
function toggleCFTicket(id,on){
  const f=(cfg.customFields||[]).find(x=>x.id===id);
  if(f){f.onTicket=!!on;saveCfg();}
}
async function changeMasterPass(v){
  v=(v||'').trim(); if(!v)return;  // blank = keep current
  cfg.masterPassHash=await hashStr(v); delete cfg.masterPass; saveCfg();
  auditLog('config','settings','','Master password changed');
  toast('Master password updated ✓','success');
}
async function changeOverridePass(v){
  v=(v||'').trim(); if(!v)return;  // blank = keep current
  cfg.overridePassHash=await hashStr(v); saveCfg();
  auditLog('config','settings','','Override PIN set/changed');
  toast('Override PIN updated ✓','success'); renderSettings();
}
function clearOverridePass(){
  delete cfg.overridePassHash; saveCfg();
  auditLog('config','settings','','Override PIN cleared (falls back to Master)');
  toast('Override PIN cleared — edits/manual now use Master','success'); renderSettings();
}
async function changeActCode(v){
  v=(v||'').trim(); if(!v)return;
  cfg.activationCodeHash=await hashStr(v.toUpperCase()); delete cfg.activationCode; saveCfg();
  auditLog('config','settings','','Activation code changed');
  toast('Activation code updated ✓','success');
}
function setBridge(i,k,v){if(!cfg.bridges[i])cfg.bridges[i]={};cfg.bridges[i][k]=v;saveCfg();}

