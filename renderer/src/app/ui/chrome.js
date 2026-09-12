// ── LOGO IMAGE ────────────────────────────────
function appLogo(dark=true, h=44){
  // Sized by height with automatic width — a logo is never stretched.
  const src = dark ? LOGO_IMG : BRAND_TICKET;
  return `<img class="brand-logo" alt="${esc(BRAND.vendor)}" src="${src}" style="height:${h}px;width:auto;max-width:100%;display:block"/>`;
}
/* Full lockup — used where there is room to show the wordmark properly. */
function brandLockup(h=120){
  return `<img class="brand-lockup" alt="${esc(BRAND.vendor)}" src="${BRAND_LOCKUP}" style="height:${h}px;width:auto;max-width:100%;display:block;margin:0 auto"/>`;
}

// ── TOAST / MODAL ───────────────────────────────
function toast(msg,type='info',ms=3200){
  const el=document.getElementById('toast');
  if(!el)return;
  clearTimeout(toastTm);
  el.textContent=msg; el.className=type; el.style.display='block';
  toastTm=setTimeout(()=>{el.style.display='none';},ms);
}
function openModal(title,html){
  document.getElementById('modal-title').textContent=title;
  document.getElementById('modal-body').innerHTML=html;
  document.getElementById('modal-bg').classList.add('open');
}
function closeModal(){document.getElementById('modal-bg').classList.remove('open');}
function toggleWB(){
  wbOpen=!wbOpen;
  document.getElementById('wb').classList.toggle('closed',!wbOpen);
  document.getElementById('wb-btn').textContent=wbOpen?'▼':'▲';
}

