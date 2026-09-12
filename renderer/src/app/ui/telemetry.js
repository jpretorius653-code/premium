// ══════════════════════════════════════════════════════════════════════════
//  SCALE TELEMETRY  (v10)
//
//  Reports only what this PC actually knows. There is no load-cell
//  temperature or signal-strength number here, because the indicator does not
//  send one — a plausible fake figure on an instrument panel is worse than
//  none.
//
//  The row that earns its place is freshness. "Connected" alone hides the
//  commonest fault on site: the port is open, the cable is in, and the
//  indicator has stopped talking. Every reading stamps bState[bi].seenAt, so
//  a silent link shows as silent within three seconds.
// ══════════════════════════════════════════════════════════════════════════
const TM_FRESH_MS = 3000;
let _tmTimer = null;

function tmSeenAt(bi){
  const a = (bState[bi] && bState[bi].seenAt) || 0;
  const b = (typeof _lastSerialData !== 'undefined' && _lastSerialData[bi]) || 0;
  return Math.max(a, b);
}
function tmHasSignal(bi){ const t = tmSeenAt(bi); return !!t && (Date.now() - t) < TM_FRESH_MS; }
function tmAgo(ms){
  if(ms < 1500) return 'just now';
  const s = Math.round(ms / 1000);
  if(s < 60) return s + ' s ago';
  const m = Math.round(s / 60);
  if(m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  return h + ' h ' + (m % 60) + ' min ago';
}
function tmLinkLabel(bi){
  const b = cfg.bridges[bi] || {};
  const link = bridgeLink(bi);
  if(link === 'tcp') return 'Network gateway' + (b.tcpHost ? ' ' + b.tcpHost : '');
  if(link === 'box') return BRAND.deviceName;
  return 'Serial' + (b.comPath ? ' ' + b.comPath : '');
}
function tmRow(state, k, v, sub){
  return `<div class="tm-row"><span class="tm-dot ${state}"></span><span class="tm-k">${k}</span>` +
         `<span class="tm-v">${v}${sub ? `<small>${sub}</small>` : ''}</span></div>`;
}

function telemetryRows(){
  const bi = activeBridge, st = bState[bi] || {}, bc = cfg.bridges[bi] || {};
  const u = cfg.weightUnit || 'kg', now = Date.now(), seen = tmSeenAt(bi);
  const rows = [];

  // 1 · indicator link, judged by data rather than by the port being open
  if(!bridgeIsSetUp(bi) && !seen){
    rows.push(tmRow('off', 'Indicator', 'Not set up', 'Settings → Scale'));
  }else if(tmHasSignal(bi)){
    rows.push(tmRow('ok', 'Indicator', esc(tmLinkLabel(bi)), 'Reading ' + tmAgo(now - seen)));
  }else if(seen){
    rows.push(tmRow(st.state === 'connected' ? 'warn' : 'bad', 'Indicator',
      st.state === 'connected' ? 'Connected, no data' : 'No signal', 'Last reading ' + tmAgo(now - seen)));
  }else{
    rows.push(tmRow('bad', 'Indicator', 'Waiting for data', esc(tmLinkLabel(bi))));
  }

  // 2 · the reading itself
  if(tmHasSignal(bi)){
    const div = bridgeDivision(bi);
    rows.push(tmRow(_mStable ? 'ok' : 'warn', 'Reading', _mStable ? 'Stable' : 'In motion',
      fmt(applyDivision(st.live || 0, bi)) + ' ' + u + (div ? ' · ' + div + ' ' + u + ' divisions' : '')));
  }else{
    rows.push(tmRow('off', 'Reading', 'No signal', 'Capture waits for a live reading'));
  }

  // 3 · multi-deck agreement
  if(isMulti(bc)){
    if(st.deckAgrees === true) rows.push(tmRow('ok', 'Decks', 'Sum matches gross', (st.decks || []).length + ' decks'));
    else if(st.deckAgrees === false) rows.push(tmRow('bad', 'Decks', 'Sum differs from gross',
      'Decks ' + fmt(st.deckSum || 0) + ' · gross ' + fmt(Math.round(st.live || 0)) + ' ' + u));
    else rows.push(tmRow('off', 'Decks', 'No gross to compare', 'Map the gross field in Settings'));
  }

  // 4 · capacity
  if(cfg.grossMax > 0){
    const pct = Math.round(((st.live || 0) / cfg.grossMax) * 100);
    rows.push(tmRow(pct > 100 ? 'bad' : pct > 90 ? 'warn' : 'ok', 'Capacity',
      pct > 100 ? 'Over maximum' : pct + '% of maximum', fmt(cfg.grossMax) + ' ' + u + ' maximum'));
  }

  // 5 · where the last record landed
  const disk = !!(window.issDesktop || (typeof _backupDir !== 'undefined' && _backupDir));
  rows.push(tmRow(_lastSaved ? (disk ? 'ok' : 'warn') : 'off', 'Records',
    _lastSaved ? 'Saved ' + tmAgo(now - _lastSaved.getTime()) : 'Nothing saved yet',
    disk ? 'Local, IndexedDB and disk' : 'Browser storage only'));

  // 6 · cloud, only if this site uses it
  try{
    const c = cloudCfg(), sc = c.sync || {};
    if(c.enabled || sc.on){
      const failed = /failed/i.test(sc.lastMsg || '');
      rows.push(tmRow(!sc.lastAt ? 'warn' : failed ? 'bad' : 'ok', 'Cloud',
        !sc.lastAt ? 'Not synced yet' : failed ? 'Last sync failed' : 'In sync',
        sc.lastAt ? tmAgo(now - new Date(sc.lastAt).getTime()) : ''));
    }
  }catch(e){}
  return rows.join('');
}

function telemetryHTML(){
  return `<div class="card telemetry" id="telemetry-card">
    <div class="card-hd"><div class="card-title">Scale telemetry</div>
      <span class="badge b-gray">${esc(cfg.bridges[activeBridge]?.name || 'Bridge ' + (activeBridge + 1))}</span></div>
    <div id="telemetry">${telemetryRows()}</div></div>`;
}

function tmTick(){
  // a link that went quiet must stop claiming "stable"
  if(!tmHasSignal(activeBridge)) setMotion('nosig');
  const el = document.getElementById('telemetry');
  if(el) el.innerHTML = telemetryRows();
}
function tmStart(){ if(!_tmTimer) _tmTimer = setInterval(tmTick, 1000); }
