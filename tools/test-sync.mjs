#!/usr/bin/env node
// Two simulated weighbridge PCs against one in-memory shared folder.
// Runs the real numbering / share-sync / weigh-out / cloud-upload modules.
//   node tools/test-sync.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'renderer', 'src', 'app');
const MODS = ['core/utils.js', 'share/share-sync.js', 'weigh/capture.js', 'cloud/ticket-sync.js'];

let clock = Date.parse('2026-11-09T06:00:00Z');
const tick = () => new Date(clock += 1000).toISOString();

function makeShare() {
  const files = new Map(); const docs = new Map();
  return { files, docs, up: true };
}
function makePC(name, share, station) {
  const store = new Map();
  const sandbox = {
    console, crypto: webcrypto, setTimeout, clearTimeout, Promise, JSON, Math, Date, Map, Set, String, Number, Object, Array, RegExp, parseInt, parseFloat, isFinite,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    toasts: [], posted: [], refuseTickets: new Set(),
  };
  sandbox.window = sandbox;
  sandbox.issDesktop = {
    sharedStatus: async () => ({ ok: share.up }),
    sharedPut: async (kind, id, obj) => { if (!share.up) return { ok: false }; share.files.set(kind + '/' + id, JSON.stringify(obj)); return { ok: true }; },
    sharedList: async kind => ({ items: share.up ? [...share.files].filter(([k]) => k.startsWith(kind + '/')).map(([, v]) => JSON.parse(v)) : [] }),
    sharedPutDoc: async (n, obj) => { if (!share.up) return { ok: false }; share.docs.set(n, JSON.stringify(obj)); return { ok: true }; },
    sharedDoc: async n => (share.up && share.docs.has(n) ? JSON.parse(share.docs.get(n)) : null),
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(`
    const K={act:'iss8_act',cfg:'iss8_cfg',usr:'iss8_usr',db:'iss8_db',txs:'iss8_txs',pend:'iss8_pend',ord:'iss8_ord',seq:'iss8_seq',fleet:'iss8_fleet'};
    const G=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}};
    const P=(k,v)=>{localStorage.setItem(k,JSON.stringify(v))};
    let cfg={ticketPrefix:'WB',ticketPad:3,syncFolder:'X:/share',siteCode:'test',bridges:[{name:'Bridge 1'}],weightUnit:'kg',customFields:[],ticketStation:${JSON.stringify(station || '')}};
    let txs=[], pending=[], orders=[], fleet=[], users=[], session={name:${JSON.stringify(name)},role:'master'};
    let activeTx=null, activeBridge=0, activeDir=null, currentTab='x', _editUnlocked=false, bState=[{live:0}];
    const Debug={log(){}}; function auditLog(){} function toast(m){ toasts.push(String(m)); }
    function saveCfg(){} function saveUsers(){} function saveOrders(){} function saveFleet(){}
    function saveTxs(){ P(K.txs,txs); if(cfg.syncFolder&&txs.length) sharePut('txs',txs[0].id,txs[0]); }
    function savePend(){ P(K.pend,pending); if(cfg.syncFolder) pending.forEach(pd=>sharePut('pend',_pendKey(pd),pd)); }
    function emptyTx(){ return {id:'',rowId:newRowId(),vehicleReg:'',firstWeight:null}; }
    function closeModal(){} function clearForm(){} function updateWBCount(){} function renderWeigh(){} function renderDash(){} function renderRecords(){}
    function refreshOnSite(){} function showNetModal(){} function captureDecks(){} function applyDivision(w){ return w; }
    function isMulti(){ return false; } function axleCfg(){ return {on:false}; } function clearTx(){ activeTx=emptyTx(); }
    function syncTxToBox(){} function autoBackup(){} function syncTicketNow(){} function checkOrderCompletion(){} function printThermal(){} function printA4(){}
    function txDir(t){ return t.direction||''; } function dirFieldIsDispatch(){ return false; } function orderByNo(){ return null; }
    function syncCfg(){ return {tickets:true,on:true}; } function syncIsHost(){ return true; }
    async function _sbReq(p,o){ const rows=JSON.parse(o.body);
      if(rows.some(r=>refuseTickets.has(r.ticket))){ throw new Error('409 23505 duplicate key value violates unique constraint "transactions_site_ticket_key"'); }
      rows.forEach(r=>posted.push(r.ticket)); }
  `, ctx);
  for (const m of MODS) vm.runInContext(fs.readFileSync(path.join(SRC, m), 'utf8'), ctx, { filename: m });
  ctx.__tick = tick;
  vm.runInContext(`nowISO=()=>__tick(); showNetModal=()=>{}; clearForm=()=>{}; updateWBCount=()=>0;
    function openModal(){}
    document.getElementById=id=>(id==='np-reg' ? {value:(activeTx&&activeTx.vehicleReg)||''} : null);`, ctx);
  const run = code => vm.runInContext(code, ctx);
  return {
    name, run, ctx,
    weighIn: reg => run(`(()=>{ const t=emptyTx(); t.vehicleReg=${JSON.stringify(reg)}; t.firstWeight=19000; t.firstWeightTime=nowISO(); t.bridge=0; pending.push({...t,queuedAt:nowISO()}); savePend(); return t.rowId; })()`),
    weighOut: reg => run(`(()=>{ pick2nd(${JSON.stringify(reg)}, 58000); if(!activeTx||activeTx.vehicleReg!==${JSON.stringify(reg)}) return null; completeTx('none'); return txs[0].id; })()`),
    sync: async () => { await run(`(async()=>{ const st=await issDesktop.sharedStatus(); if(!st.ok) return; await shareFlushRetry(); await sharePull(); await sharePushAll(); })()`); },
    ids: () => run('txs.map(t=>t.id).sort().join(",")'),
    onSite: () => run('pending.map(p=>p.vehicleReg).sort().join(",")'),
  };
}
const settle = () => new Promise(r => setTimeout(r, 5));
let fails = 0;
const ok = (cond, what) => { console.log((cond ? '  ✓ ' : '  ✗ ') + what); if (!cond) fails++; };

// ── 1. station series: both PCs weigh with the share DOWN ────────────────
{
  console.log('1. two PCs, stations A/B, shared folder down');
  const sh = makeShare(), A = makePC('A', sh, 'A'), B = makePC('B', sh, 'B');
  sh.up = false;
  for (const r of ['T1', 'T2', 'T3']) { A.weighIn('A' + r); B.weighIn('B' + r); }
  const a = ['T1', 'T2', 'T3'].map(r => A.weighOut('A' + r)), b = ['T1', 'T2', 'T3'].map(r => B.weighOut('B' + r));
  ok(a.join() === 'WBA-001,WBA-002,WBA-003' && b.join() === 'WBB-001,WBB-002,WBB-003', 'each PC issued its own series: ' + a + ' / ' + b);
  sh.up = true;
  for (let i = 0; i < 3; i++) { await A.sync(); await B.sync(); await settle(); }
  ok(A.ids() === B.ids() && A.ids().split(',').length === 6, 'after the folder returns both hold all 6 tickets, none renumbered');
  ok(A.onSite() === '' && B.onSite() === '', 'no truck left on site on either PC');
  A.weighIn('AT9'); const n = A.weighOut('AT9');
  ok(n === 'WBA-004', 'A carries on at WBA-004 (did not adopt B\'s counter): ' + n);
}
// ── 2. counter restarts on one PC ────────────────────────────────────────
{
  console.log('2. counter reset to 0 (reinstall) with voided and on-site numbers below the top');
  const sh = makeShare(), A = makePC('A', sh, '');
  A.run(`txs=[{id:'WB012',rowId:'r12',completedAt:'x'},{id:'WB010',rowId:'r10',completedAt:'x',voided:true}]; pending=[{id:'WB011',rowId:'r11',vehicleReg:'OLD',firstWeightTime:'2026-01-01'}]; P(K.seq,0);`);
  A.weighIn('NEW1'); const n = A.weighOut('NEW1');
  ok(n === 'WB013', 'next ticket is above the highest issued, not a re-used old number: ' + n);
  ok(A.run('peekTicketSeq()') === 14, 'settings shows the true next number');
}
// ── 3. tombstone write fails ─────────────────────────────────────────────
{
  console.log('3. truck weighed out while the shared folder is down');
  const sh = makeShare(), A = makePC('A', sh, 'A'), B = makePC('B', sh, 'B');
  A.weighIn('XYZ1'); await settle(); await A.sync(); await B.sync();
  ok(B.onSite() === 'XYZ1', 'B sees the truck on site');
  sh.up = false; const t = A.weighOut('XYZ1'); await settle();
  ok(!!t && A.run('_shareRetry.length') === 1, 'A finished ' + t + '; the failed tombstone is queued, not forgotten');
  sh.up = true;
  for (let i = 0; i < 2; i++) { await A.sync(); await B.sync(); await settle(); }
  ok(B.onSite() === '' && A.run('_shareRetry.length') === 0, 'B no longer lists the truck; retry queue is empty');
}
// ── 4. second weigh-out refused ──────────────────────────────────────────
{
  console.log('4. stale on-site entry on the other PC');
  const sh = makeShare(), A = makePC('A', sh, 'A'), B = makePC('B', sh, 'B');
  const rid = A.weighIn('DUP1'); await settle(); await A.sync(); await B.sync();
  const t = A.weighOut('DUP1'); await settle();
  // B never syncs the on-site list again, but it does receive the finished ticket
  B.run(`txs.push(${JSON.stringify({ id: t, rowId: rid, vehicleReg: 'DUP1', completedAt: '2026-11-09T07:00:00Z' })});`);
  const n = B.weighOut('DUP1');
  ok(n === null && B.onSite() === '' && B.ids() === t, 'B refused to weigh DUP1 out again and dropped the stale entry');
  ok(B.run('toasts.some(m=>/already weighed out/.test(m))'), 'operator is told which ticket closed it');
}
// ── 5. corrected ticket from the other PC, same number, different truck ──
{
  console.log('5. legacy clash (no stations): other PC\'s corrected ticket under the same number');
  const sh = makeShare(), A = makePC('A', sh, '');
  A.run(`txs=[{id:'WB005',rowId:'ra',vehicleReg:'MINE',firstWeightTime:'t1',firstWeight:1,secondWeight:2,completedAt:'2026-11-09T07:00:00Z'}]; P(K.seq,5);`);
  sh.files.set('txs/WB005', JSON.stringify({ id: 'WB005', rowId: 'rb', vehicleReg: 'THEIRS', firstWeightTime: 't2', firstWeight: 3, secondWeight: 4, completedAt: '2026-11-09T07:05:00Z', _ev: 2 }));
  await A.sync();
  const regs = A.run('txs.map(t=>t.id+":"+t.vehicleReg).sort().join(",")');
  ok(regs === 'WB005:MINE,WB006:THEIRS', 'both tickets kept; the local one was not replaced: ' + regs);
}
// ── 6. cloud refuses a ticket ────────────────────────────────────────────
{
  console.log('6. cloud refuses one ticket of a batch (number held by another ticket)');
  const sh = makeShare(), A = makePC('A', sh, '');
  A.run(`cfg.syncFolder=''; txs=[1,2,3].map(i=>({id:'WB00'+i,rowId:'r'+i,vehicleReg:'V'+i,completedAt:'2026-11-09T07:0'+i+':00Z',firstWeight:1,secondWeight:2,net:1})); refuseTickets.add('WB002');`);
  await A.run('syncPushTickets()');
  ok(A.run('posted.sort().join(",")') === 'WB001,WB003', 'the other tickets still went up');
  ok(A.run('!txs.find(t=>t.id==="WB002")._txAt && !!txs.find(t=>t.id==="WB001")._txAt'), 'the refused ticket is NOT marked as sent');
  ok(A.run('_txRefused.join(",")') === 'WB002', 'and it is named for the Cloud tab');
  A.run('refuseTickets.clear()'); await A.run('syncPushTickets()');
  ok(A.run('!!txs.find(t=>t.id==="WB002")._txAt && _txRefused.length===0'), 'it goes up on a later pass and the warning clears');
}
// ── 7. same truck comes back ─────────────────────────────────────────────
{
  console.log('7. truck returns after weighing out');
  const sh = makeShare(), A = makePC('A', sh, 'A'), B = makePC('B', sh, 'B');
  A.weighIn('RET1'); await settle(); await A.sync(); await B.sync();
  A.weighOut('RET1'); await settle(); await A.sync(); await B.sync();
  A.weighIn('RET1'); await settle(); await A.sync(); await B.sync(); await A.sync(); await B.sync();
  ok(A.onSite() === 'RET1' && B.onSite() === 'RET1', 'the second visit is on site on both PCs (old tombstone did not wipe it)');
  const n = B.weighOut('RET1');
  ok(/^WBB-/.test(String(n)), 'and B can weigh it out: ' + n);
}
console.log(fails ? `\n✗ ${fails} check(s) failed` : '\n✓ all checks passed');
process.exit(fails ? 1 : 0);
