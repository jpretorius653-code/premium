// ══════════════════════════════════════════════════════════════════════════
//  COMMAND PALETTE  —  Ctrl+K  (v10)
//
//  A clerk types a registration far more often than they navigate, so the
//  palette searches the trucks on site, tickets, orders and the fleet first,
//  and screens and actions after. Every entry passes the same gates as the tab
//  bar (tabAllowed / canAccess / the phase-2 licence lock), so the palette can
//  never become a way around permissions.
// ══════════════════════════════════════════════════════════════════════════
let _ck = { open:false, items:[], sel:0, q:'' };

function _ckNorm(s){ return String(s == null ? '' : s).toLowerCase(); }
function _ckScore(hay, q){
  if(!q) return 1;
  const h = _ckNorm(hay), k = q.toLowerCase();
  if(h.startsWith(k)) return 4;
  if(h.indexOf(' ' + k) >= 0) return 3;
  if(h.indexOf(k) >= 0) return 2;
  // registrations and order numbers match with the spaces and dashes ignored
  const hk = h.replace(/[^a-z0-9]/g, ''), kk = k.replace(/[^a-z0-9]/g, '');
  return kk && hk.indexOf(kk) >= 0 ? 2 : 0;
}
function _ckTabOk(id){
  const t = TABS.find(x => x.id === id);
  if(!t || !tabAllowed(t)) return false;
  if(t.perm && t.perm !== 'master' && !canAccess(t.perm)) return false;
  return !licBlocks(id);
}
function _ckGo(tab, then){
  renderTab(tab);
  if(then) setTimeout(then, 60);
}

function _ckBuild(q){
  const out = [], u = cfg.weightUnit || 'kg';
  const add = (group, it) => { const s = _ckScore(it.match || it.t1, q); if(s) out.push(Object.assign({ group, s }, it)); };

  if(_ckTabOk('weigh')){
    pending.forEach(p => add('Trucks on site', {
      ic:'🚛', plate:true, t1:p.vehicleReg, match:p.vehicleReg + ' ' + (p.product || '') + ' ' + (p.customer || ''),
      t2:'Weigh out with the live reading · in at ' + fmt(p.firstWeight) + ' ' + u + ' · ' + elapsed(p.queuedAt || p.firstWeightTime || nowISO()) + ' on site',
      run:() => _ckGo('weigh', () => selectTruckFor2nd(p.vehicleReg)) }));
  }
  if(q && q.length >= 2 && _ckTabOk('records')){
    txs.slice(0, 3000).forEach(t => add('Tickets', {
      ic:txIsVoid(t) ? '⛔' : '🧾', t1:t.id + ' · ' + (t.vehicleReg || ''),
      match:t.id + ' ' + (t.vehicleReg || '') + ' ' + (t.customer || '') + ' ' + txOrderNo(t),
      t2:fmt(t.net) + ' ' + u + ' · ' + (t.product || '—') + ' · ' + fmtDT(t.completedAt) + (txIsVoid(t) ? ' · void' : ''),
      run:() => { recFilter.q = t.id; recFilter.showVoid = txIsVoid(t) || recFilter.showVoid; _ckGo('records'); } }));
  }
  if(q && _ckTabOk('orders')){
    orders.forEach(o => add('Orders', {
      ic:'📦', t1:o.no, match:o.no + ' ' + (o.customer || '') + ' ' + (o.product || ''),
      t2:[o.product, o.customer].filter(Boolean).join(' · ') + (o.active === false ? ' · closed' : ''),
      run:() => _ckGo('orders', () => openOrderModal(o.id)) }));
    fleet.forEach(f => add('Fleet', {
      ic:'🚚', plate:true, t1:f.reg, match:f.reg + ' ' + (f.transporter || '') + ' ' + (f.driver || ''),
      t2:'Start a weighing · ' + ([f.transporter, f.driver].filter(Boolean).join(' · ') || 'no transporter'),
      run:() => _ckGo('weigh', () => { const r = document.getElementById('f-reg'); if(r){ r.value = f.reg; autoFillReg(f.reg); r.focus(); } }) }));
  }

  const act = (t1, t2, ic, ok, run) => { if(ok) add('Actions', { t1, t2, ic, run }); };
  act('Capture 1st weight', 'Open the weigh screen with the form ready', '📥', _ckTabOk('weigh'),
      () => _ckGo('weigh', () => document.getElementById('f-reg')?.focus()));
  act('Capture 2nd weight', pending.length + ' truck' + (pending.length !== 1 ? 's' : '') + ' on site', '📤',
      _ckTabOk('weigh') && pending.length, () => _ckGo('weigh', () => cap2(false)));
  act('New order', 'Target in tonnes, optional fleet restriction', '➕', _ckTabOk('orders'), () => _ckGo('orders', () => openOrderModal()));
  act('Add a truck to the fleet', 'Registration, trailers, driver, tare', '🚚', _ckTabOk('fleet'), () => _ckGo('fleet', () => openFleetModal()));
  act('Export records to CSV', 'Uses the filters on the Records screen', '📄', _ckTabOk('records'), () => _ckGo('records', () => exportCSV()));
  act('Print the daily report', 'Opens a printable A4 report', '🖨', _ckTabOk('records'), () => _ckGo('records', () => printDailyReport()));
  for(let i = 0; i < planBridges(); i++){
    if(i !== activeBridge) act('Switch to ' + (cfg.bridges[i]?.name || 'Bridge ' + (i + 1)), 'Show this bridge\'s reading', '⚖', true, () => switchBridge(i));
  }
  act('Serial string analyser', 'See the raw frames the indicator sends', '🔬', roleAtLeast('manager') && typeof openRawParser === 'function',
      () => openRawParser(activeBridge));
  act('Sync with the cloud now', 'Push tickets, pull orders and fleet', '☁', roleAtLeast('master') && (cloudCfg().enabled || (cloudCfg().sync || {}).on),
      () => { try{ syncRun(true); toast('Cloud sync started', 'info'); }catch(e){ toast('Cloud sync is not set up', 'error'); } });
  act(Debug.isOn() ? 'Hide the debug console' : 'Show the debug console', 'Ctrl+Alt+D', '🐞', true, () => Debug.show());
  act('Sign out', session ? session.name : '', '👤', true, () => logout());

  TABS.forEach(t => { if(_ckTabOk(t.id)) add('Screens', { t1:String(t.lbl).replace(/<[^>]*>/g, '').trim(), ic:'🧭', t2:'', run:() => renderTab(t.id) }); });

  const order = ['Trucks on site', 'Tickets', 'Orders', 'Fleet', 'Actions', 'Screens'];
  const cap = { 'Trucks on site':6, Tickets:8, Orders:5, Fleet:5, Actions:q ? 6 : 8, Screens:q ? 5 : 12 };
  return order.flatMap(g => out.filter(i => i.group === g).sort((a, b) => b.s - a.s).slice(0, cap[g]));
}

function cmdkOpen(){
  if(_ck.open || !session) return;
  if(document.getElementById('modal-bg')?.classList.contains('open')) return;
  _ck = { open:true, items:[], sel:0, q:'' };
  const bg = document.createElement('div');
  bg.className = 'cmdk-bg'; bg.id = 'cmdk';
  bg.innerHTML = `<div class="cmdk" role="dialog" aria-label="Command palette">
    <div class="cmdk-in">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="cmdk-q" placeholder="Search trucks, tickets, orders or screens" autocomplete="off" spellcheck="false"/>
      <kbd>Esc</kbd>
    </div>
    <div class="cmdk-list" id="cmdk-list" role="listbox"></div>
    <div class="cmdk-ft"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span>Registrations match without spaces</span></div>
  </div>`;
  bg.addEventListener('mousedown', e => { if(e.target === bg) cmdkClose(); });
  document.body.appendChild(bg);
  const inp = document.getElementById('cmdk-q');
  inp.addEventListener('input', () => { _ck.q = inp.value.trim(); _ck.sel = 0; cmdkRender(); });
  inp.addEventListener('keydown', cmdkKey);
  cmdkRender();
  setTimeout(() => inp.focus(), 10);
}
function cmdkClose(){
  _ck.open = false;
  document.getElementById('cmdk')?.remove();
}
function cmdkRender(){
  const list = document.getElementById('cmdk-list'); if(!list) return;
  _ck.items = _ckBuild(_ck.q);
  if(!_ck.items.length){
    list.innerHTML = `<div class="cmdk-empty">Nothing matches “${esc(_ck.q)}”. Try a registration, ticket number or order number.</div>`;
    return;
  }
  let last = '', html = '';
  _ck.items.forEach((it, i) => {
    if(it.group !== last){ html += `<div class="cmdk-grp">${esc(it.group)}</div>`; last = it.group; }
    html += `<div class="cmdk-it${i === _ck.sel ? ' on' : ''}" role="option" data-i="${i}" onmousemove="cmdkHover(${i})" onclick="cmdkRun(${i})">
      <span class="ic">${it.ic || '•'}</span>
      <span class="tx"><div class="t1${it.plate ? ' plate' : ''}">${esc(it.t1)}</div>${it.t2 ? `<div class="t2">${esc(it.t2)}</div>` : ''}</span></div>`;
  });
  list.innerHTML = html;
  list.querySelector('.cmdk-it.on')?.scrollIntoView({ block:'nearest' });
}
function cmdkHover(i){
  if(i === _ck.sel) return;
  _ck.sel = i;
  document.querySelectorAll('#cmdk-list .cmdk-it').forEach(el => el.classList.toggle('on', +el.dataset.i === i));
}
function cmdkKey(e){
  if(e.key === 'Escape'){ e.preventDefault(); cmdkClose(); return; }
  if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
    e.preventDefault();
    const n = _ck.items.length; if(!n) return;
    _ck.sel = (_ck.sel + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    cmdkRender(); return;
  }
  if(e.key === 'Enter'){ e.preventDefault(); e.stopPropagation(); cmdkRun(_ck.sel); }
}
function cmdkRun(i){
  const it = _ck.items[i]; if(!it) return;
  cmdkClose();
  try{ it.run(); }catch(err){ toast('Could not open that: ' + err.message, 'error'); }
}
window.addEventListener('keydown', e => {
  if((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')){
    if(document.getElementById('app')?.style.display === 'none') return;
    e.preventDefault();
    _ck.open ? cmdkClose() : cmdkOpen();
  }
});
