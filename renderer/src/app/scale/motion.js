// ── SIMULATION ──────────────────────────────────
function startSim(bi){
  // SIMULATION REMOVED — no synthetic weight. Show idle until real serial data arrives.
  stopSim(bi);
  const br=bState[bi];
  if(br.state==='connected')return;
  br.state='idle'; br.live=0;
  if(bi===activeBridge){ setPill('○ Waiting for scale','rgba(148,163,184,.08)','#94A3B8',bi); updateWeight(0); setMotion('nosig'); }
}
function stopSim(bi){const br=bState[bi];if(br.sim){clearInterval(br.sim);br.sim=null;}}
function stopAllSim(){bState.forEach((_,i)=>stopSim(i));}
function setPill(txt,bg,fg,bi){
  if(bi!==activeBridge)return;
  const p=document.getElementById('conn-pill');
  if(p){p.textContent=txt;p.style.cssText=`padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${bg};color:${fg};border:1px solid ${fg}44`;}
  // keep the weigh-screen indicator in sync with the live connection status
  const wc=document.getElementById('weigh-conn');
  if(wc){ wc.textContent=txt; wc.style.color=fg||'var(--light)'; wc.style.fontWeight='800'; }
}
function weighConnText(bi){ return bState[bi]?.state==='connected'?'● Live':'○ Waiting for scale'; }
function bridgeIsSetUp(bi){ const b=cfg.bridges[bi]; return !!(b && (b.paired || b.comPath || b.src)); }
// ── Stable / in-motion detection ──
// Heuristic: reading is STABLE once it has stayed within MOTION_TOL of a
// reference value for SETTLE_MS; any larger jump marks IN MOTION and restarts
// the settle timer. Works for both live serial feeds and the simulator.
const MOTION_TOL=80, SETTLE_MS=700;
let _mRef=null,_mSince=0,_mStable=true;
function computeMotion(w){
  const now=(typeof performance!=='undefined'?performance.now():Date.now());
  if(_mRef===null){_mRef=w;_mSince=now;_mStable=false;return false;}
  if(Math.abs(w-_mRef)>MOTION_TOL){_mRef=w;_mSince=now;_mStable=false;}
  else if(now-_mSince>=SETTLE_MS){_mStable=true;}
  return _mStable;
}
/* Three states, not two. With no indicator talking, the old pill said
   IN MOTION at 0 kg — a reading the scale never gave. */
let _mNoSig=true;
function _motionState(stable){ return stable==='nosig'?'nosig':(stable?'stable':'motion'); }
function _motionLabel(k){ return k==='nosig'?'No signal':k==='stable'?'Stable':'In motion'; }
function setMotion(stable){
  const k=_motionState(stable); _mNoSig=(k==='nosig');
  document.querySelectorAll('.ns-motion').forEach(el=>{
    el.classList.toggle('stable',k==='stable');
    el.classList.toggle('motion',k==='motion');
    el.classList.toggle('nosig',k==='nosig');
    const l=el.querySelector('.ns-motion-lbl'); if(l) l.textContent=_motionLabel(k);
  });
}
function motionPill(){
  const k=_mNoSig?'nosig':(_mStable?'stable':'motion');
  return `<span class="ns-motion ${k}"><span class="ns-dot"></span><span class="ns-motion-lbl">${_motionLabel(k)}</span></span>`;
}

function updateWeight(w){
  renderDeckBar();
  const u=cfg.weightUnit||'kg';
  document.getElementById('hdr-wt').textContent=fmt(w);
  document.getElementById('wb-live').textContent=fmt(w);
  const over=cfg.grossMax>0&&w>cfg.grossMax;
  document.getElementById('hdr-wt').classList.toggle('over',over);
  document.getElementById('dash-readout')?.classList.toggle('over',over);
  document.getElementById('weigh-readout')?.classList.toggle('over',over);
  const st=computeMotion(Math.round(w));
  setMotion(tmHasSignal(activeBridge)?st:'nosig');
  try{ lwTick(Math.round(w), st); }catch(e){}     // publish to the cloud, if enabled
}

