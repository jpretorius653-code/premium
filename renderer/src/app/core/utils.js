// ── UTILS ───────────────────────────────────────
/* A transaction's identity in the cloud. The ticket number is NOT unique
   across sites — Hillside and Primecoal both count from 001 — so the row id is
   what the backend keys on. Generated on this PC when the transaction starts,
   it also makes re-sending after a dropped connection idempotent: the retry
   updates the same row instead of creating a second one. */
function newRowId(){
  try{ if(crypto && crypto.randomUUID) return crypto.randomUUID(); }catch(e){}
  try{
    const b=new Uint8Array(16); crypto.getRandomValues(b);
    b[6]=(b[6]&0x0f)|0x40; b[8]=(b[8]&0x3f)|0x80;
    const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }catch(e){}
  return 'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);
}
/* Short code identifying this site, e.g. hillside / primecoal. Falls back to a
   slug of the site name so an install that was never configured still sends
   something usable rather than an empty string. */
function siteCode(){
  const c=(cfg.siteCode||'').trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'');
  if(c) return c;
  const n=(cfg.siteName||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  return n||'unset';
}
function stampTx(tx){
  if(!tx.rowId) tx.rowId=newRowId();
  tx.site=siteCode();
  return tx;
}
/* One-off repair for records captured before 9.2.0 so historical tickets sync
   under the same rules as new ones. */
function migrateTxKeys(){
  let n=0;
  for(const t of txs){
    if(!t.rowId){ t.rowId=newRowId(); n++; }
    if(!t.site){ t.site=siteCode(); n++; }
  }
  for(const p of pending){
    if(!p.rowId){ p.rowId=newRowId(); n++; }
    if(!p.site){ p.site=siteCode(); n++; }
  }
  if(n){ saveTxs(); try{ P(K.pend,pending); }catch(e){} Debug.log('tx keys: filled '+n+' missing site/rowId'); }
}
function emptyTx(){return{id:'',rowId:newRowId(),site:'',decks1:null,decks2:null,axleGroups:null,truckPreset:'',vehicleReg:'',product:'',customer:'',transporter:'',supplier:'',destination:'',driver:'',notes:'',orderId:'',orderNoManual:'',direction:'',batchNo:'',dispatchTicketNo:'',firstWeight:null,firstWeightTime:null,secondWeight:null,secondWeightTime:null,net:null,completedAt:null,bridgeName:'',operatorName:''};}
// ── Ticket number: <PREFIX><zero-padded sequential>, starts at 001 ──
// The counter lives in its own storage key (mirrored to disk via _CRIT) so it
// survives restarts and is never reset by a config rewrite.
function nextTicketSeq(){
  let n=parseInt(G(K.seq,0))||0;
  n++;
  P(K.seq,n);
  return n;
}
function peekTicketSeq(){ return Math.max(parseInt(G(K.seq,0))||0, ticketHighWater())+1; }
/* STATION CODE — the fix for two weighbridge PCs on one site.
   Two PCs counting from one shared counter WILL issue the same number sooner
   or later: the counter travels between them through a file, and any moment
   the folder is slow or unreachable both PCs hand out the next number. Give
   each PC its own letter (Settings → Ticket numbering → Station) and each
   issues from its own series — WBA-0001, WBB-0001 — so a clash is impossible
   whether the PCs can see each other or not. Stored in this PC's config only;
   it is never synchronised. Blank = the old single shared series. */
function ticketStation(){
  return String((cfg&&cfg.ticketStation)||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);
}
function _ticketHead(){
  const pre=(cfg.ticketPrefix!==undefined?cfg.ticketPrefix:'WB');
  const st=ticketStation();
  return String(pre)+(st?st+'-':'');
}
function fmtTicketNo(n){
  const pad=Math.max(1,Math.min(8,parseInt(cfg.ticketPad)||3));
  return _ticketHead()+String(n).padStart(pad,'0');
}
/* Every ticket number this PC knows about: finished, voided AND still on
   site. The old check looked at finished tickets only, so a PC whose counter
   had restarted handed out the numbers of voided and on-site tickets. */
function _ticketIdsInUse(){
  const s=new Set();
  (txs||[]).forEach(t=>{ if(!t) return; if(t.id) s.add(String(t.id)); if(t._collisionFrom) s.add(String(t._collisionFrom)); });
  (pending||[]).forEach(p=>{ if(p&&p.id) s.add(String(p.id)); });
  return s;
}
/* Highest number already issued in this PC's series. The counter is never
   allowed to sit below it: a counter that restarts (new PC, reinstall,
   cleared storage) would otherwise walk up from 1 and re-issue old numbers. */
function ticketHighWater(){
  const head=_ticketHead();
  let hi=0;
  _ticketIdsInUse().forEach(id=>{
    if(!id.startsWith(head)) return;
    const m=/^(\d{1,12})/.exec(id.slice(head.length));
    if(m){ const n=parseInt(m[1],10); if(n>hi) hi=n; }
  });
  return hi;
}
function txId(){
  const used=_ticketIdsInUse();
  let n=parseInt(G(K.seq,0))||0;
  const hi=ticketHighWater();
  if(n<hi){
    try{ Debug.log('Ticket counter was at '+n+' but '+fmtTicketNo(hi)+' already exists — continuing from '+hi); }catch(e){}
    try{ auditLog('config','settings','','Ticket counter was behind ('+n+') — moved up to the highest issued number ('+hi+')'); }catch(e){}
    n=hi;
  }
  let id, guard=0;
  do{ n++; id=fmtTicketNo(n); }while(used.has(id) && guard++<100000);
  P(K.seq,n);
  return id;
}
let _txSeq=0;
function nowISO(){return new Date().toISOString();}
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fmt(n){return Math.round(n||0).toLocaleString('en-ZA');}
function fmtT(iso){return iso?new Date(iso).toLocaleTimeString('en-ZA',{hour12:false,hour:'2-digit',minute:'2-digit'}):'—';}
function fmtD(iso){return iso?new Date(iso).toLocaleDateString('en-ZA',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';}
function fmtDT(iso){return iso?new Date(iso).toLocaleString('en-ZA',{hour12:false,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';}
