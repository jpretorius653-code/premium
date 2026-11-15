'use strict';
// ══════════════════════════════════════════════════════════
// BUILD STAMP — must match "version" in package.json.
// CI fails the build if these two drift apart, so the number shown in the
// app is always the number that was actually built. Bump BOTH together.
// Format is deliberate: no spaces around '=', single quotes, one line —
// the workflow greps for it.
// ══════════════════════════════════════════════════════════
const RENDERER_BUILD='10.0.1';
window.RENDERER_BUILD=RENDERER_BUILD;
// ══════════════════════════════════════════════════════════
// DEBUG CONSOLE — permanent, toggleable diagnostic panel.
// Defined FIRST so every later function can safely call Debug.log().
// Off by default. Enable in Settings → Diagnostics, or Ctrl+Alt+D.
// Captures JS errors + sync activity on screen (DevTools is disabled
// in packaged builds). window.Debug so inline onclick handlers reach it.
// ══════════════════════════════════════════════════════════
window.Debug=(function(){
  var box=null, on=false, buffer=[];
  function paint(msg,color){
    if(!box) return;
    var line=document.createElement('div');
    if(color) line.style.color=color;
    line.textContent='['+new Date().toLocaleTimeString()+'] '+msg;
    box.appendChild(line);
    box.scrollTop=box.scrollHeight;
    while(box.childNodes.length>250) box.removeChild(box.childNodes[1]);
  }
  function ensureBox(){
    if(box) return box;
    if(!document.body) return null;
    box=document.createElement('div');
    box.id='iss-dbg';
    box.style.cssText='position:fixed;right:6px;bottom:6px;width:360px;max-height:40vh;overflow:auto;'+
      'background:rgba(10,17,32,.94);color:#93C5FD;font:11px/1.35 monospace;padding:8px 10px;'+
      'border:1px solid rgba(59,130,246,.45);border-radius:6px;z-index:99999;white-space:pre-wrap;display:none';
    var hd=document.createElement('div');
    hd.style.cssText='color:#93C5FD;font-weight:bold;margin-bottom:4px;display:flex;justify-content:space-between';
    hd.innerHTML='<span>● '+((window.BRAND&&BRAND.vendorShort)||'ISS')+' debug console</span><span style="cursor:pointer;color:#FCA5A5" onclick="Debug.clear()">clear</span>';
    box.appendChild(hd);
    document.body.appendChild(box);
    buffer.forEach(function(b){ paint(b.msg,b.color); }); buffer=[];
    return box;
  }
  function log(msg,color){
    if(!on){ buffer.push({msg:msg,color:color}); if(buffer.length>250) buffer.shift(); return; }
    if(ensureBox()) paint(msg,color);
  }
  function show(v){
    on=(v===undefined?!on:!!v);
    if(ensureBox()) box.style.display=on?'block':'none';
    if(on&&box){ buffer.forEach(function(b){ paint(b.msg,b.color); }); buffer=[]; }
    try{ if(typeof cfg==='object'&&cfg){ cfg.debugPanel=on; if(typeof saveCfg==='function') saveCfg(); } }catch(e){}
    return on;
  }
  function clear(){ if(box){ var kids=[].slice.call(box.childNodes); kids.slice(1).forEach(function(k){ box.removeChild(k); }); } buffer=[]; }
  window.addEventListener('error',function(e){ log('JS ERROR: '+(e.message||e.error)+' @ '+String(e.filename||'').split('/').pop()+':'+e.lineno,'#F87171'); });
  window.addEventListener('unhandledrejection',function(e){ log('PROMISE REJECT: '+((e.reason&&e.reason.message)||e.reason),'#F87171'); });
  window.addEventListener('keydown',function(e){ if(e.ctrlKey&&e.altKey&&(e.key==='d'||e.key==='D')) show(); });
  return {log:log, show:show, clear:clear, isOn:function(){return on;}};
})();
window._dbg=function(msg,color){ window.Debug.log(msg,color); };

// ── Enter-to-advance ───────────────────────────────────────────────
// Pressing Enter in a text/number/select field jumps to the next field in
// the same screen, so operators can key through the weigh form (and the
// complete-transaction modal) without reaching for the mouse. Enter on the
// LAST field does nothing destructive — the operator presses the weight
// button themselves. Textareas keep normal Enter (newline).
document.addEventListener('keydown', function(e){
  if(e.key!=='Enter') return;
  const el=e.target;
  if(!el || !el.tagName) return;
  const tag=el.tagName.toUpperCase();
  if(tag==='TEXTAREA' || tag==='BUTTON') return;      // don't hijack these
  if(tag!=='INPUT' && tag!=='SELECT') return;
  // collect the focusable fields within the same container (modal or content)
  const scope=el.closest('.modal-body, #content, .dash-wrap, body') || document;
  const fields=[].slice.call(scope.querySelectorAll('input:not([type=hidden]):not([disabled]), select:not([disabled])'))
                 .filter(function(f){ return f.offsetParent!==null; });   // visible only
  const i=fields.indexOf(el);
  if(i>=0 && i<fields.length-1){
    e.preventDefault();
    const nxt=fields[i+1];
    nxt.focus();
    if(nxt.select) try{ nxt.select(); }catch(_){}    // highlight so typing replaces
  } else if(i===fields.length-1){
    e.preventDefault();   // last field: swallow Enter so the form doesn't submit/reload
    el.blur();
  }
});

// ── Restore durable state BEFORE anything reads it (fixes activation/settings
//    resetting on some PCs where packaged file:// localStorage isn't persisted) ──
(function(){
  try{
    var disk = (window.issDesktop && window.issDesktop.diskState) || null;
    if(!disk) return;
    var keys=['iss8_act','iss8_cfg','iss8_usr','iss8_db','iss8_txs','iss8_pend','iss8_ord','iss8_audit','iss8_brand'];
    for(var i=0;i<keys.length;i++){
      var k=keys[i], cur=null;
      try{ cur=localStorage.getItem(k); }catch(e){}
      var empty = (cur===null||cur===''||cur==='null'||cur==='undefined');
      if(disk[k]!==undefined && empty){
        try{ localStorage.setItem(k, JSON.stringify(disk[k])); }catch(e){}
      } else if(disk[k]===undefined && !empty){
        // existing install: seed the durable store from current localStorage
        try{ if(window.issDesktop&&window.issDesktop.stateWrite) window.issDesktop.stateWrite(k, JSON.parse(cur)); }catch(e){}
      }
    }
  }catch(e){}
})();
