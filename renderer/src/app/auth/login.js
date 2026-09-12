// ── ACTIVATION ──────────────────────────────────
async function doActivate(){
  const el=document.getElementById('act-input');
  const v=(el.value||'').trim();
  const msg=document.getElementById('act-fail');
  if(!v){ if(msg) msg.textContent='Enter the installation code'; return; }
  if(licLooksSigned(v)){
    const st=await licApplySigned(v);
    if(st.valid){
      P(K.act,true); el.value='';
      document.getElementById('ovr-act').style.display='none';
      showLogin(); toast('Licensed ✓ '+((st.licence&&st.licence.site)||BRAND.appName),'success',5000);
    }else{ if(msg) msg.textContent=st.reason||'Licence not accepted'; el.value=''; el.focus(); }
    return;
  }
  // A site that set its own code keeps it; otherwise phase 1, and the
  // pre-9.7 code stays valid so machines in the field are not stranded.
  const h=await hashStr(v.toUpperCase());
  const ok = h===(cfg.activationCodeHash||DEFAULT_ACT_HASH)
          || h===DEFAULT_ACT_HASH || h===LEGACY_ACT_HASH;
  if(ok){
    P(K.act,true);
    // The phase-2 clock starts here, and is written to the disk mirror as
    // well — clearing localStorage must not hand out another free day.
    if(!cfg.licInstalledAt){ cfg.licInstalledAt=nowISO(); saveCfg(); try{pushAllToDisk();}catch(e){} }
    if(msg) msg.textContent='';
    el.value='';
    document.getElementById('ovr-act').style.display='none';
    showLogin();
    toast('Installed ✓ Welcome to '+BRAND.appName,'success');
  }else{
    _licFails=(_licFails||0)+1;
    if(msg) msg.textContent='Incorrect installation code';
    el.value=''; el.focus();
    // slow a guesser down without ever locking JP out of his own install
    if(_licFails>=3){
      el.disabled=true;
      if(msg) msg.textContent='Too many attempts — wait 10 seconds';
      setTimeout(()=>{ el.disabled=false; el.focus(); if(msg) msg.textContent=''; }, 10000);
      _licFails=0;
    }
  }
}
let _licFails=0;

// ── AUTH / LOGIN ────────────────────────────────
function showLogin(){
  document.getElementById('ovr-login').style.display='flex';
  document.getElementById('login-logo').innerHTML=brandLockup(92);
  document.getElementById('ovr-act').style.display='none';
  renderUserCards();
  selectUser(null);
}
function renderUserCards(){
  const active=users.filter(u=>u.active);
  document.getElementById('user-cards').innerHTML=active.map(u=>
    `<div class="user-card" id="uc-${u.id}" onclick="selectUser('${u.id}')">
      <div class="uc-n">${esc(u.name)}</div>
      <div class="uc-r">${u.role}</div>
    </div>`).join('');
}
function selectUser(id){
  pinUser=id; pinBuf='';
  document.querySelectorAll('.user-card').forEach(c=>c.classList.remove('sel'));
  if(!id){
    document.getElementById('pin-area').style.display='none';
    return;
  }
  const u=users.find(x=>x.id===id);
  if(!u)return;
  document.getElementById('uc-'+id)?.classList.add('sel');
  document.getElementById('pin-user-name').textContent=u.name;
  document.getElementById('pin-area').style.display='block';
  const lock=pinLocked(id);
  if(lock){
    document.getElementById('pin-user-name').textContent=u.name+' — locked '+lock+'s';
  }
  renderPinDots(); renderPinPad();
}
function renderPinDots(){
  document.getElementById('pin-dots').innerHTML=[0,1,2,3].map(i=>
    `<div class="pin-dot${i<pinBuf.length?' filled':''}"></div>`).join('');
}
function renderPinPad(){
  const nums=[1,2,3,4,5,6,7,8,9,'','0','⌫'];
  document.getElementById('pin-pad').innerHTML=nums.map(n=>
    `<button class="pin-btn" onclick="pinKey('${n}')">${n}</button>`).join('');
}
function pinKey(k){
  if(k==='')return;
  if(k==='⌫'){pinBuf=pinBuf.slice(0,-1);renderPinDots();return;}
  if(pinBuf.length>=4)return;
  pinBuf+=String(k);
  renderPinDots();
  if(pinBuf.length===4) checkPin();
}
async function checkPin(){
  const u=users.find(x=>x.id===pinUser);
  if(!u){toast('User not found','error');pinBuf='';renderPinDots();return;}
  // Rate-limit lockout
  const lock=pinLocked(u.id);
  if(lock){
    toast('Locked — wait '+lock+'s before trying again','error',4000);
    pinBuf='';renderPinDots();return;
  }
  // Support both hashed (pinHash) and legacy plaintext (pin) during migration
  let ok=false;
  if(u.pinHash) ok=await verifyHash(pinBuf,u.pinHash);
  else if(u.pin) { ok=(pinBuf===u.pin); if(ok){u.pinHash=await hashStr(pinBuf);delete u.pin;saveUsers();} }
  if(ok){
    clearPinFail(u.id);
    session={userId:u.id,name:u.name,role:u.role,perms:u.perms||{}};
    auditLog('login','user',u.id,'Logged in');
    document.getElementById('ovr-login').style.display='none';
    startApp();
  }else{
    recordPinFail(u.id);
    const nl=pinLocked(u.id);
    toast(nl?'Wrong PIN — locked '+nl+'s':'Wrong PIN','error');
    setTimeout(()=>{pinBuf='';renderPinDots();},600);
  }
}
function logout(){
  if(!confirm('Log out?'))return;
  session=null; activeTx=emptyTx();
  stopAllSim();
  document.getElementById('app').style.display='none';
  document.getElementById('wb').style.display='none';
  showLogin();
}
