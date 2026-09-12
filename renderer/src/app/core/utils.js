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
function peekTicketSeq(){ return (parseInt(G(K.seq,0))||0)+1; }
function fmtTicketNo(n){
  const pre=(cfg.ticketPrefix!==undefined?cfg.ticketPrefix:'WB');
  const pad=Math.max(1,Math.min(8,parseInt(cfg.ticketPad)||3));
  return String(pre)+String(n).padStart(pad,'0');
}
function txId(){
  // Guard against duplicates if a ticket number was ever reused
  let n=nextTicketSeq(), id=fmtTicketNo(n), guard=0;
  while(txs.some(t=>t.id===id) && guard++<10000){ n=nextTicketSeq(); id=fmtTicketNo(n); }
  return id;
}
let _txSeq=0;
function nowISO(){return new Date().toISOString();}
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fmt(n){return Math.round(n||0).toLocaleString('en-ZA');}
function fmtT(iso){return iso?new Date(iso).toLocaleTimeString('en-ZA',{hour12:false,hour:'2-digit',minute:'2-digit'}):'—';}
function fmtD(iso){return iso?new Date(iso).toLocaleDateString('en-ZA',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';}
function fmtDT(iso){return iso?new Date(iso).toLocaleString('en-ZA',{hour12:false,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';}
