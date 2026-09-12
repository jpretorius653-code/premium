// ── STORAGE ────────────────────────────────────
const K={act:'iss8_act',cfg:'iss8_cfg',usr:'iss8_usr',db:'iss8_db',txs:'iss8_txs',pend:'iss8_pend',ord:'iss8_ord',seq:'iss8_seq',fleet:'iss8_fleet',rep:'iss8_rep'};
const G=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}};
const _CRIT=new Set(['iss8_act','iss8_cfg','iss8_usr','iss8_db','iss8_txs','iss8_pend','iss8_ord','iss8_audit','iss8_brand','iss8_seq','iss8_fleet']);
const P=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{} if(_CRIT.has(k)){try{if(window.issDesktop&&window.issDesktop.stateWrite)window.issDesktop.stateWrite(k,v);}catch{}}};

// ══════════════════════════════════════════════════════════
// SECURITY — salted SHA-256 hashing (PINs, activation code)
// Plaintext is never stored. Uses Web Crypto (built into browser).
// ══════════════════════════════════════════════════════════
const ISS_SALT='ISS-WeighForward-2025-Mpumalanga';   // app-wide salt
async function hashStr(str){
  try{
    const data=new TextEncoder().encode(ISS_SALT+'|'+str);
    const buf=await crypto.subtle.digest('SHA-256',data);
    return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }catch{ // fallback for non-secure contexts (rare)
    let h=0;const x=ISS_SALT+'|'+str;
    for(let i=0;i<x.length;i++){h=((h<<5)-h+x.charCodeAt(i))|0;}
    return 'fb'+(h>>>0).toString(16);
  }
}
async function verifyHash(str,hash){ return (await hashStr(str))===hash; }

// PIN lockout state (rate limiting)
let _pinFails={};   // userId -> {count, until}
function pinLocked(userId){
  const f=_pinFails[userId];
  if(f&&f.until&&Date.now()<f.until){
    return Math.ceil((f.until-Date.now())/1000);
  }
  return 0;
}
function recordPinFail(userId){
  const f=_pinFails[userId]||{count:0,until:0};
  f.count++;
  // exponential backoff: 3 tries free, then 30s, 2min, 10min, 30min
  if(f.count>=3){
    const steps=[30,120,600,1800];
    const idx=Math.min(f.count-3,steps.length-1);
    f.until=Date.now()+steps[idx]*1000;
  }
  _pinFails[userId]=f;
}
function clearPinFail(userId){ delete _pinFails[userId]; }

// ── LICENCE CODES ─────────────────────────────────────────────────────
// Salted SHA-256 only — the plaintext is not in this file. Two stages:
//   phase 1  installation, entered once on a fresh PC
//   phase 2  a second authorisation demanded a day later, so a copy that
//            walked out of the office stops being useful on its own
// The 2025 hash stays valid so machines already in the field keep working.
const DEFAULT_ACT_HASH ='edde1ab26e6486e76241544a0dbde5f7473ab18eead0f14b86ddb1917e12edc1';   // phase 1
const LEGACY_ACT_HASH  ='223e5b261379358f4da053ab1b92bc4043450f523323a33f515e7870de20fd3b';   // pre-9.7 installs
const PHASE2_ACT_HASH  ='e2f44c24c7b45b0f0257e4bf426ad91ee55b26891c1dfb8aa7c6ab9228777276';   // phase 2
const IDENTITY_PASS_HASH='bad17cc5875fdd8b88b0421d01559d6a6dbf884a326abcd46c2300043f64439c';  // ticket + name lock
const PHASE2_AFTER_MS  = 24*60*60*1000;   // one day of use

