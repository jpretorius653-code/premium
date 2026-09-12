/* ════ Vendor details — single source of truth ════
   Filled from the brand pack (renderer/brands/<id>/brand.json). Every ticket,
   report and header reads from this one object. */
const BRAND_CO={
  name :BRAND.vendor,
  addr :BRAND.addr||'',
  reg  :BRAND.reg||'',
  vat  :BRAND.vat||'',
  tel  :BRAND.tel||'',
  email:BRAND.email||'',
  tag  :BRAND.tagline||'',
};
const ISS_CO=BRAND_CO, ISS=BRAND_CO, PROM_CO=BRAND_CO;  // legacy aliases — older code referenced these
const DEF_CFG={
  companyName:BRAND.vendor,siteName:BRAND.vendor,siteCode:BRAND.siteCode,weightUnit:'kg',masterPass:'1234',
  cloud:{url:'',key:'',email:'',pass:'',enabled:false},
  activationCode:'',              // vestigial — the live check is DEFAULT_ACT_HASH / LEGACY_ACT_HASH,
                                  // so the installation code you already issue is unchanged
  bridges:[
    {name:'Bridge 1',baud:'9600',skip:0,read:6,dataBits:8,parity:'none',
     deckMode:'single',deckCount:4,deckMap:{},deckTol:20},
    {name:'Bridge 2',baud:'9600',skip:0,read:6,dataBits:8,parity:'none',
     deckMode:'single',deckCount:4,deckMap:{},deckTol:20},
  ],
  ticketPrefix:'WB',ticketPad:3,
  customFields:[
    {id:'cfTrl1',label:'Trailer 1',onTicket:true},
    {id:'cfTrl2',label:'Trailer 2',onTicket:true},
    {id:'cfBatch',label:'Batch No',onTicket:true},
    {id:'cfSeal',label:'Seal No',onTicket:true},
  ],
  grossMax:0,copies:1,defaultPrint:'thermal',
  escposMode:false,escposBaud:'9600',
  syncEnabled:false,syncFolder:'',
  // ── Ticket builder ──
  ticket:{
    template:'standard',         // standard | compact | detailed
    logo:BRAND_TICKET,           // one-ink rendition — thermal safe
    showLogo:true,
    companyName:BRAND.vendor,
    address:'',                  // fill in Settings → Ticket
    reg:'',                      // company registration number
    phone:'',
    email:'',
    tagline:'',                  // the logo already prints the strapline — set one
                                 // here (Settings → Ticket) if the site uses its own logo
    footer:'Thank you for your business',
    fontScale:1.15,              // 0.8 – 1.6 global multiplier (1.15 = comfortably readable)
    logoScale:2.8,               // BIG — client asked for a prominent logo (Settings → Ticket to change)
    paperWidth:'80mm',           // 80mm | A4
    showSignature:true,
    showQR:true,
    accentColor:BRAND.ticketAccent||'#1A3A6B',
    monoBlack:true,        // print tickets solid black — max legibility on thermal
    vat:'',                // (duplicate companyName/address keys removed — they
                           //  silently overwrote the values set above)
    fields:{product:true,customer:true,transporter:true,supplier:true,destination:true,driver:true,order:true,notes:true,operator:true},
  },
};
const DEF_USERS=[{id:'master',name:'Master',pinHash:'60266dece69033e8eea9ea93cfcf5c2b98720423db7bd289bc32bb826bd2ecf0',role:'master',active:true,perms:{weigh:true,records:true,database:true,orders:true,reports:true}}];
const DEF_DB={products:[],customers:[],transporters:[],suppliers:[],destinations:[],drivers:[]};
const DB_CATS={products:'Products (R/t)',customers:'Customers',transporters:'Transporters',suppliers:'Suppliers',destinations:'Destinations',drivers:'Drivers'};
const POWERED_BY='Powered by '+BRAND.vendor;

// ── STATE ───────────────────────────────────────
let cfg=Object.assign({},DEF_CFG,G(K.cfg,{}));
if(!cfg.bridges)cfg.bridges=DEF_CFG.bridges;
let users=G(K.usr,DEF_USERS);
let db=Object.assign({},DEF_DB,G(K.db,{}));
let txs=G(K.txs,[]);
let pending=G(K.pend,[]);
let orders=G(K.ord,[]);
let fleet=G(K.fleet,[]);
let session=null;
let activeBridge=0;
let bState=[
  {serial:null,reader:null,live:0,state:'sim',sim:null,decks:[],deckSum:null,deckAgrees:null},
  {serial:null,reader:null,live:0,state:'sim',sim:null,decks:[],deckSum:null,deckAgrees:null},
];
let activeTx=emptyTx();
// Weigh direction chosen on the 1st-weight screen: 'dispatch' or
// 'receive'. Drives the transaction direction directly — no
// longer deduced from mass. Null until the operator picks.
let activeDir=null;
// Visual state for the Dispatch / Receive buttons. Once a choice is made the
// other option is heavily greyed so it's unmistakable which is active.
function _dirBtnStyle(isSelected, anyChosen){
  if(!anyChosen) return '';                                  // nothing picked yet — both normal
  if(isSelected) return 'box-shadow:0 0 0 3px rgba(59,130,246,.45)';  // picked — highlighted
  return 'opacity:.3;filter:grayscale(1);';                  // not picked — greyed out
}
function _applyDirButtons(loadId,offId,resetId,dir){
  const bL=document.getElementById(loadId), bO=document.getElementById(offId), rs=document.getElementById(resetId);
  if(bL){ bL.className='btn btn-full '+(dir==='dispatch'?'btn-navy':'btn-light');
          bL.style.cssText=_dirBtnStyle(dir==='dispatch',dir); }
  if(bO){ bO.className='btn btn-full '+(dir==='receive'?'btn-navy':'btn-light');
          bO.style.cssText=_dirBtnStyle(dir==='receive',dir); }
  if(rs){ rs.style.display = dir ? '' : 'none'; }
}
// ── Weight division rounding ──────────────────────────────────────
// Some indicators read in 1 kg steps but the ticket must be issued in coarser
// divisions (e.g. 20 kg). Set per bridge in Settings; blank = record the exact
// reading. Rounds to the NEAREST division, with an exact half going DOWN:
//   division 20 →  10 → 0 ,  12 → 20 ,  30 → 20 ,  32 → 40
function bridgeDivision(bridgeIdx){
  const b=(cfg.bridges||[])[bridgeIdx==null?activeBridge:bridgeIdx];
  const d=parseInt(b&&b.division);
  return (isFinite(d)&&d>1)?d:0;          // 0 or 1 = no rounding
}
function applyDivision(w, bridgeIdx){
  const n=Number(w);
  if(!isFinite(n)) return w;
  const d=bridgeDivision(bridgeIdx);
  if(!d) return Math.round(n);            // no division set — exact reading
  const sign=n<0?-1:1, a=Math.abs(n);
  return sign * Math.ceil(a/d - 0.5) * d; // nearest, exact half rounds down
}
function setWeighDir(d){
  activeDir=(d==='dispatch'||d==='receive')?d:null;
  _applyDirButtons('dir-load','dir-off','dir-reset',activeDir);
  // relabel the batch/dispatch-ticket field
  const lbl=document.getElementById('lbl-batchdisp'), inp=document.getElementById('f-batchdisp'), wrap=document.getElementById('wrap-batchdisp');
  if(lbl) lbl.textContent = dirFieldLabel(activeDir);
  if(inp) inp.placeholder = dirFieldLabel(activeDir);
  if(wrap) wrap.style.opacity = activeDir ? '1' : '.5';
}
// ── Single source of truth for the Batch / Dispatch-Ticket field ──
// One field on screen, whose meaning depends on the load direction.
// TO SWAP WHICH WAY ROUND: change only this function.
//   'dispatch' = Dispatch,  'receive' = Receive
function dirFieldLabel(dir){
  return dir==='receive' ? 'Dispatch Ticket Nr' : 'Batch Number';
}
function dirFieldIsDispatch(dir){ return dir==='receive'; }

// Same, for the standalone Manual Weighing tab.
let manualDir=null;
function setManualDir(d){
  manualDir=(d==='dispatch'||d==='receive')?d:null;
  _applyDirButtons('mdir-load','mdir-off','mdir-reset',manualDir);
  const lbl=document.getElementById('mlbl-batchdisp'), inp=document.getElementById('m-batchdisp'), wrap=document.getElementById('mwrap-batchdisp');
  if(lbl) lbl.textContent = dirFieldLabel(manualDir);
  if(inp) inp.placeholder = dirFieldLabel(manualDir);
  if(wrap) wrap.style.opacity = manualDir ? '1' : '.5';
}
let currentTab='dashboard';

// ── WeighBox (ESP32) WebSocket connections ─────────────
// One socket per bridge-slot; boxes auto-discovered or manually set
let boxSocks=[null,null];           // WebSocket per bridge
let boxInfo=[null,null];            // last /info response per bridge
let boxReconnTimers=[null,null];    // reconnect timers
let wbOpen=false;
let toastTm=null;
let pinBuf='',pinUser=null;

