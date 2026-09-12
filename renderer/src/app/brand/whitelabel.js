/* ════ White-label branding ════
   A signed iss-brand.json (created in the Brand Builder) sets the logo,
   colours and company details with no code edits. The signature deters copying
   and hand-editing — only the Brand Builder (which holds the key) can sign one. */
const BRAND_SECRET='ISS-BRAND-7731';
// Brand packs signed before the rebrand used the old key. Keep validating them
// so existing client installs don't lose their branding on upgrade.
const LEGACY_BRAND_SECRETS=['NS-BRAND-7731'];
function brandHash(str,secret){
  const s=(secret||BRAND_SECRET)+'\u241f'+(str||'');
  let h1=0x811c9dc5,h2=0x1000193;
  for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);
    h1=(h1^c)>>>0; h1=Math.imul(h1,0x01000193)>>>0;
    h2=(h2+c)>>>0; h2=Math.imul(h2,0x85ebca6b)>>>0;}
  return ((h1^((h2<<13)|(h2>>>19)))>>>0).toString(16).toUpperCase().padStart(8,'0');
}
function brandCanon(b){
  const c=b.colors||{};
  return [b.v||1,b.company,b.tagline,b.address,b.phone,b.email,b.reg,b.ticketFooter,
          c.primary,c.accent,c.dark,b.licensedTo,b.logo].map(x=>x==null?'':String(x)).join('\u241f');
}
function brandValid(b){
  if(!b||!b.sig) return false;
  const canon=brandCanon(b);
  if(b.sig===brandHash(canon)) return true;
  return LEGACY_BRAND_SECRETS.some(k=>b.sig===brandHash(canon,k));
}
let _brand=null;
function applyBrand(b){
  if(!brandValid(b)) return false;
  _brand=b; window._brand=b;
  const c=b.colors||{}, rs=document.documentElement.style;
  // A signed pack re-tints the accents. Surfaces stay on the flagship dark
  // steps so contrast is never left to a colour picked for paper.
  if(c.primary) rs.setProperty('--accent', c.primary);
  if(c.accent)  rs.setProperty('--gold', c.accent);
  if(b.logo)    LOGO_IMG=b.logo;
  const h=document.getElementById('hdr-co'); if(h&&b.company) h.textContent=b.company;
  if(b.company) cfg.companyName=b.company;
  cfg.ticket=cfg.ticket||{};
  if(b.company)      cfg.ticket.companyName=b.company;
  if(b.address)      cfg.ticket.address=b.address;
  if(b.phone)        cfg.ticket.phone=b.phone;
  if(b.email)        cfg.ticket.email=b.email;
  if(b.reg)          cfg.ticket.reg=b.reg;
  if(b.ticketFooter) cfg.ticket.footer=b.ticketFooter;
  if(b.tagline)      cfg.ticket.tagline=b.tagline;
  if(c.primary)      cfg.ticket.accentColor=c.primary;
  if(b.logo)         cfg.ticket.logo=b.logo;
  if(b.logo && !document.getElementById('_brandStyle'))
    document.head.insertAdjacentHTML('beforeend','<style id="_brandStyle">#content::before{display:none!important}</style>');
  return true;
}
function loadStoredBrand(){ try{const s=localStorage.getItem('iss8_brand');return s?JSON.parse(s):null;}catch{return null;} }
function applyStoredBrand(){ const b=loadStoredBrand(); if(b&&brandValid(b)) applyBrand(b); }
async function importBrandFile(file){
  if(!file) return;
  try{
    const b=JSON.parse(await file.text());
    if(!brandValid(b)){ toast('Invalid or tampered branding file','error',4000); return; }
    localStorage.setItem('iss8_brand', JSON.stringify(b));
    applyBrand(b); try{saveCfg();}catch(_){}
    toast('Branding applied: '+(b.company||'OK')+' ✓','success',4000);
    if(typeof renderSettings==='function' && currentTab==='settings') renderSettings();
  }catch(e){ toast('Could not read branding file','error',4000); }
}
function resetBrand(){
  if(identityLocked()){ askIdentity(()=>resetBrand()); return; }
  try{localStorage.removeItem('iss8_brand');}catch(_){} location.reload(); }

// local calendar date as YYYY-MM-DD (matches <input type=date> for range compares)
