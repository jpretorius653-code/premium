/* ══════════════════════════════════════════════════════════════════════
   REQUEST COMMAND — presets + free text
   The preset list only covers common indicators. Anything else (a 920i
   aux format needing "K2<CR><LF>KPRINT<CR><LF>", a chained XG poll, a
   vendor-specific string) goes in the custom box. Tokens understood:
   <CR> <LF> <ENQ> <STX> <ETX> <EOT> and \xNN for any raw byte.
   ══════════════════════════════════════════════════════════════════════ */
const POLL_PRESETS=[
  {v:'',                 l:'None — indicator streams on its own'},
  {v:'<CR><LF>',         l:'CR LF'},
  {v:'P<CR><LF>',        l:'P + CR LF (print)'},
  {v:'W<CR><LF>',        l:'W + CR LF (weight)'},
  {v:'<ENQ>',            l:'ENQ (0x05)'},
  {v:'<STX>',            l:'STX (0x02)'},
  {v:'RM<CR><LF>',       l:'RM + CR LF'},
  {v:'SI<CR><LF>',       l:'SI + CR LF (Toledo)'},
  {v:'KPRINT<CR><LF>',   l:'KPRINT + CR LF (Rice Lake 920i)'},
  {v:'XG#1<CR><LF>',     l:'XG#1 + CR LF (920i gross, scale 1)'}
];
function pollIsCustom(bc){
  const pc=(bc&&bc.pollCmd)||'';
  if(bc&&bc.pollCustom) return true;
  return !!pc && !POLL_PRESETS.some(p=>p.v===pc);
}
function setPollPreset(bi,v){
  const bc=cfg.bridges[bi]||(cfg.bridges[bi]={});
  if(v==='__custom__'){ bc.pollCustom=true; bc.pollCmd=bc.pollCmdText||''; }
  else { bc.pollCustom=false; bc.pollCmd=v; }
  saveCfg(); renderSettings();
}
function setPollCustom(bi,v){
  const bc=cfg.bridges[bi]||(cfg.bridges[bi]={});
  bc.pollCustom=true; bc.pollCmdText=v; bc.pollCmd=v; saveCfg();
  const pv=document.getElementById('pollprev'+bi);
  if(pv) pv.innerHTML=pollPreviewHTML(v);
}
/* Show the operator the actual bytes — the fastest way to spot a typo
   like <RC> instead of <CR>, which otherwise just looks like silence. */
function pollPreviewHTML(s){
  if(!s) return '<span style="color:var(--text3)">nothing will be sent</span>';
  const un=String(s)
    .replace(/<CR>/gi,'\r').replace(/<LF>/gi,'\n').replace(/<ENQ>/gi,'\x05')
    .replace(/<STX>/gi,'\x02').replace(/<ETX>/gi,'\x03').replace(/<EOT>/gi,'\x04')
    .replace(/\\r/g,'\r').replace(/\\n/g,'\n').replace(/\\t/g,'\t')
    .replace(/\\x([0-9A-Fa-f]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16)));
  const hex=[...un].map(ch=>ch.charCodeAt(0).toString(16).padStart(2,'0')).join(' ');
  return 'Sends '+un.length+' byte'+(un.length===1?'':'s')+': <span style="font-family:monospace;color:var(--blue)">'+esc(hex)+'</span>';
}
function pollFieldHTML(bi,bc,label){
  const custom=pollIsCustom(bc), pc=(bc&&bc.pollCmd)||'';
  const txt=custom?((bc&&bc.pollCmdText)||pc):((bc&&bc.pollCmdText)||'');
  return '<div class="field"><label>'+(label||'Request Command (if it reads only once)')+'</label>'+
    '<select id="s-b'+bi+'poll" onchange="setPollPreset('+bi+',this.value)">'+
      POLL_PRESETS.map(p=>'<option value="'+esc(p.v)+'"'+((!custom&&pc===p.v)?' selected':'')+'>'+esc(p.l)+'</option>').join('')+
      '<option value="__custom__"'+(custom?' selected':'')+'>Custom — type my own command…</option>'+
    '</select>'+
    '<div id="pollcustom'+bi+'" style="margin-top:6px;'+(custom?'':'display:none')+'">'+
      '<input id="s-b'+bi+'pollx" value="'+esc(txt)+'" placeholder="e.g. K2&lt;CR&gt;&lt;LF&gt;KPRINT&lt;CR&gt;&lt;LF&gt;" '+
        'style="font-family:monospace" oninput="setPollCustom('+bi+',this.value)"/>'+
      '<div id="pollprev'+bi+'" style="font-size:11px;color:var(--text3);margin-top:3px">'+pollPreviewHTML(txt)+'</div>'+
      '<div style="font-size:11px;color:var(--text3);margin-top:3px;line-height:1.5">'+
        'Tokens: <b>&lt;CR&gt; &lt;LF&gt; &lt;ENQ&gt; &lt;STX&gt; &lt;ETX&gt; &lt;EOT&gt;</b> and <b>\\xNN</b> for any raw byte. '+
        'Several commands can be chained — they go out as one write.</div>'+
    '</div></div>';
}
function toggleSetting(k){cfg[k]=!cfg[k];saveCfg();renderSettings();}
function applyBranding(){
  const el=document.getElementById('hdr-co');
  if(el)el.textContent=cfg.companyName||ISS_CO.name;
}
function renderBridgePills(){
  if(planBridges()<2){ const w=document.getElementById('bridge-btns'); if(w) w.style.display='none'; return; }
  const b1name=cfg.bridges[1]?.name;
  const wrap=document.getElementById('bridge-btns');
  if(!wrap)return;
  if(b1name&&b1name!=='Bridge 2'){
    wrap.style.display='flex';
    wrap.innerHTML=[0,1].map(i=>`<div class="bridge-pill${i===activeBridge?' active':''}" onclick="switchBridge(${i})">${esc(cfg.bridges[i]?.name||'Bridge '+(i+1))}</div>`).join('');
  }else wrap.style.display='none';
}
function switchBridge(i){if(i>=planBridges())i=0;activeBridge=i;renderBridgePills();updateWeight(bState[i].live);setPill(bState[i].state==='connected'?'● Live':'○ Waiting for scale','','',i);renderTab(currentTab);}
