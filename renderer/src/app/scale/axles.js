/* ══════════════════════════════════════════════════════════════════════
   AXLE CHECK — advisory overload indication (South Africa, NRTR Reg 240)
   Each deck carries one axle group. The operator picks a truck preset (one
   tap, assigns every deck) or overrides a single deck by hand. Limits are
   editable per site because enforcement tolerances vary and a site may
   run under permit.

   THIS IS A CHECK-WEIGH AID, NOT A LEGAL DETERMINATION. The ticketed
   figure stays the gross. Nothing here changes what gets recorded.
   ══════════════════════════════════════════════════════════════════════ */
const AXLE_GROUPS=[
  {id:'none',     l:'Not in use',                   limit:0,     axles:0, dual:false},
  {id:'steer',    l:'Steering axle (single tyres)',  limit:7700,  axles:1, dual:false},
  {id:'s_sgl',    l:'Single axle, single tyres',     limit:8000,  axles:1, dual:false},
  {id:'s_dual',   l:'Single axle, dual tyres',       limit:9000,  axles:1, dual:true},
  {id:'tan_sgl',  l:'Tandem, single tyres',          limit:16000, axles:2, dual:false},
  {id:'tan_dual', l:'Tandem, dual tyres',            limit:18000, axles:2, dual:true},
  {id:'tridem',   l:'Tridem, single or dual tyres',  limit:24000, axles:3, dual:true}
];
const COMBO_LIMIT=56000;                    // max permissible combination mass
const TRUCK_PRESETS=[
  {id:'',      l:'— pick a truck —',                   decks:[],                                              shape:[],                          unit:[]},
  {id:'r2',    l:'Rigid 2-axle tipper',                 decks:['steer','s_dual'],                              shape:['cab','rigid'],              unit:[0,0]},
  {id:'r3',    l:'Rigid 3-axle tipper (6x4)',           decks:['steer','tan_dual'],                            shape:['cab','rigid'],              unit:[0,0]},
  {id:'r4',    l:'Rigid 4-axle tipper (8x4)',           decks:['steer','steer','tan_dual'],                    shape:['cab','steer2','rigid'],     unit:[0,0,0]},
  {id:'art_t', l:'Horse 6x4 + tri-axle side tipper',    decks:['steer','tan_dual','tridem'],                   shape:['cab','drive','tipper'],     unit:[0,1,1]},
  {id:'art_d', l:'Horse 6x4 + tandem side tipper',      decks:['steer','tan_dual','tan_dual'],                 shape:['cab','drive','tipper'],     unit:[0,1,1]},
  {id:'inter', l:'Interlink side tipper (horse + 2)',   decks:['steer','tan_dual','tan_dual','tan_dual'],      shape:['cab','drive','tipper','tipper'], unit:[0,1,1,2]},
  {id:'super', l:'Superlink side tipper (tri + tri)',   decks:['steer','tan_dual','tridem','tridem'],          shape:['cab','drive','tipper','tipper'], unit:[0,1,1,2]},
  {id:'drawb', l:'Rigid tipper + drawbar trailer',      decks:['steer','tan_dual','tan_dual','tan_dual'],      shape:['cab','rigid','draw','draw'], unit:[0,0,1,1]}
];
function axleGroup(id){ return AXLE_GROUPS.find(g=>g.id===id)||AXLE_GROUPS[0]; }
function axleCfg(){
  if(!cfg.axle) cfg.axle={on:false,preset:'',groups:{},tolPct:0,limits:{},comboLimit:COMBO_LIMIT};
  if(!cfg.axle.groups) cfg.axle.groups={};
  if(!cfg.axle.limits) cfg.axle.limits={};
  return cfg.axle;
}
/* Site-editable limit, falling back to the regulated figure. */
function axleLimit(id){
  const a=axleCfg(), g=axleGroup(id);
  const v=parseFloat(a.limits[id]);
  return isFinite(v)&&v>0?v:g.limit;
}
function setAxleOn(v){ axleCfg().on=!!v; saveCfg(); renderSettings&&renderSettings(); renderWeighAxle(); }
function setAxlePreset(v){
  const a=axleCfg(); a.preset=v;
  const p=TRUCK_PRESETS.find(x=>x.id===v);
  if(p&&p.decks.length){
    a.groups={};
    DECK_SLOTS.forEach((s,i)=>{ a.groups[s.k]=p.decks[i]||'none'; });
  }
  saveCfg(); renderWeighAxle();
}
function setAxleGroup(k,v){
  const a=axleCfg(); a.groups[k]=v; a.preset='';   // hand override drops the preset label
  saveCfg(); renderWeighAxle();
}
function setAxleLimit(id,v){
  const a=axleCfg(); const n=parseFloat(v);
  if(isFinite(n)&&n>0) a.limits[id]=n; else delete a.limits[id];
  saveCfg();
}
function setAxleTol(v){ axleCfg().tolPct=Math.max(0,parseFloat(v)||0); saveCfg(); renderWeighAxle(); }

/* Evaluate the live decks against the assigned groups.
   `blocked` is the important one: if the decks do not add up to the gross a
   group is straddling a joint, every deck figure is wrong, and NO verdict is
   given. Calling a straddled truck legal is the failure that kills trust in
   a check-weigh system. */
function axleEval(bi){
  const bc=cfg.bridges[bi]||{}, st=bState[bi]||{}, a=axleCfg();
  if(!isMulti(bc)) return null;
  const tol=1+((parseFloat(a.tolPct)||0)/100);
  const sl=deckSlots(bc);
  const rows=sl.map((s,i)=>{
    const w=(st.decks||[])[i];
    const gid=a.groups[s.k]||'none';
    const g=axleGroup(gid), lim=axleLimit(gid)*tol;
    const has=w!==null&&w!==undefined;
    const pct=(has&&lim>0)?(w/lim)*100:null;
    return {slot:s, w:has?w:null, gid, g, limit:gid==='none'?0:Math.round(lim),
            pct, over:(has&&lim>0&&w>lim)?Math.round(w-lim):0};
  });
  const gross=(st.live!=null?st.live:st.deckSum);
  const comboLim=(parseFloat(a.comboLimit)||COMBO_LIMIT)*tol;
  const comboOver=(gross!=null&&gross>comboLim)?Math.round(gross-comboLim):0;
  const anyOver=rows.some(r=>r.over>0)||comboOver>0;
  const mapped=rows.some(r=>r.gid!=='none');
  return {rows, gross, comboLim:Math.round(comboLim), comboOver, anyOver, mapped,
          blocked: st.deckAgrees===false, noCheck: st.deckAgrees===null};
}

/* Side-on schematic generated from the assignment — always matches the truck,
   unlike fixed truck artwork. Each deck segment is tinted by its own load. */
/* Side-on vehicle drawing generated from the selected truck preset.
   Each deck owns a horizontal band and is tinted by its own load, but chassis
   rails and tipper bin walls run FLUSH across deck boundaries within the same
   unit - so an interlink reads as one vehicle rather than four separate boxes,
   while a drawbar trailer is visibly a separate unit behind the truck.
   Generated rather than fixed artwork, so it always matches the actual rig. */
function axleShapeFor(ev,idx){
  const a=axleCfg();
  const p=TRUCK_PRESETS.find(x=>x.id===a.preset);
  if(p&&p.shape&&p.shape[idx]) return p.shape[idx];
  const gid=ev.rows[idx]&&ev.rows[idx].gid;
  if(gid==='steer') return idx===0?'cab':'steer2';
  if(gid==='none')  return 'none';
  return idx===1?'drive':'tipper';
}
function axleUnitOf(ev,idx){
  const a=axleCfg();
  const p=TRUCK_PRESETS.find(x=>x.id===a.preset);
  if(p&&p.unit&&p.unit[idx]!=null) return p.unit[idx];
  return idx===0?0:1;
}
function axleSchematic(ev){
  if(!ev) return '';
  var segW=108, H=124, GROUND=88, N=ev.rows.length, W=N*segW+16;
  var STEEL='#64748B', TYRE='#0B1220', RIM='#94A3B8', GLASS='#93C5FD';
  var x0=8, parts='';

  parts+='<line x1="0" y1="'+(GROUND+10)+'" x2="'+W+'" y2="'+(GROUND+10)+'" stroke="#334155" stroke-width="2"/>';

  function wheels(cx0,n,dual){
    var o='', i, cx;
    for(i=0;i<n;i++){
      cx=cx0+(i-(n-1)/2)*26;
      if(dual){
        o+='<circle cx="'+(cx-5)+'" cy="'+GROUND+'" r="9" fill="'+TYRE+'"/>';
        o+='<circle cx="'+(cx+5)+'" cy="'+GROUND+'" r="9" fill="'+TYRE+'"/>';
        o+='<circle cx="'+(cx+5)+'" cy="'+GROUND+'" r="3.4" fill="'+RIM+'"/>';
      } else {
        o+='<circle cx="'+cx+'" cy="'+GROUND+'" r="9" fill="'+TYRE+'"/>';
        o+='<circle cx="'+cx+'" cy="'+GROUND+'" r="3.4" fill="'+RIM+'"/>';
      }
    }
    return o;
  }

  ev.rows.forEach(function(r,idx){
    var util = (r.pct==null)?null:r.pct;
    var col = (r.gid==='none'||util==null) ? '#475569'
            : util>100 ? '#EF4444'
            : util>90  ? '#F59E0B' : '#10B981';
    var shape=axleShapeFor(ev,idx);
    var unit=axleUnitOf(ev,idx);
    var openL = idx>0 && axleUnitOf(ev,idx-1)===unit;
    var openR = idx<N-1 && axleUnitOf(ev,idx+1)===unit;
    var n=(r.g&&r.g.axles)||0, dual=!!(r.g&&r.g.dual);
    var x=x0+idx*segW, mid=x+segW/2, chY=GROUND-14;
    var railL=x+(openL?0:4), railR=x+segW-(openR?0:4);

    if(shape==='cab'){
      var cabX=x+20, cabTop=GROUND-56;
      parts+='<rect x="'+(cabX+44)+'" y="'+(cabTop-6)+'" width="5" height="26" rx="2" fill="'+STEEL+'"/>';
      parts+='<rect x="'+railL+'" y="'+chY+'" width="'+(railR-railL)+'" height="7" fill="'+STEEL+'"/>';
      parts+='<rect x="'+cabX+'" y="'+cabTop+'" width="46" height="42" rx="5" fill="'+col+'"/>';
      parts+='<path d="M'+cabX+' '+(cabTop+42)+' L'+(cabX-16)+' '+(cabTop+42)+' L'+(cabX-16)+' '+(cabTop+24)+' L'+cabX+' '+(cabTop+17)+' Z" fill="'+col+'"/>';
      parts+='<rect x="'+(cabX+6)+'" y="'+(cabTop+6)+'" width="27" height="16" rx="3" fill="'+GLASS+'"/>';
      parts+=wheels(cabX-1,n,dual);
    } else if(shape==='steer2'){
      parts+='<rect x="'+railL+'" y="'+chY+'" width="'+(railR-railL)+'" height="7" fill="'+STEEL+'"/>';
      parts+='<rect x="'+(x+8)+'" y="'+(GROUND-38)+'" width="'+(segW-16)+'" height="24" rx="3" fill="'+col+'"/>';
      parts+=wheels(mid,n,dual);
    } else if(shape==='drive'||shape==='tipper'||shape==='draw'||shape==='rigid'){
      var binTop=GROUND-62, binBot=GROUND-22;
      var tl=x+(openL?0:3), tr=x+segW-(openR?0:3);
      var bl=x+(openL?0:16), br=x+segW-(openR?0:16);
      parts+='<rect x="'+railL+'" y="'+chY+'" width="'+(railR-railL)+'" height="7" fill="'+STEEL+'"/>';
      if(shape==='drive')
        parts+='<rect x="'+(x+8)+'" y="'+(chY-8)+'" width="46" height="8" rx="2" fill="'+STEEL+'"/>';
      if(shape==='draw'&&!openL){
        parts+='<rect x="'+(x-10)+'" y="'+(chY+2)+'" width="12" height="4" fill="'+STEEL+'"/>';
        parts+='<circle cx="'+(x-12)+'" cy="'+(chY+4)+'" r="4" fill="none" stroke="'+STEEL+'" stroke-width="2.5"/>';
      }
      parts+='<path d="M'+tl+' '+binTop+' L'+tr+' '+binTop+' L'+br+' '+binBot+' L'+bl+' '+binBot+' Z" fill="'+col+'"/>';
      parts+='<rect x="'+tl+'" y="'+(binTop-5)+'" width="'+(tr-tl)+'" height="6" rx="2" fill="'+col+'"/>';
      parts+='<rect x="'+tl+'" y="'+(binTop-5)+'" width="'+(tr-tl)+'" height="6" rx="2" fill="#fff" opacity="0.06"/>';
      var k, fx, fbx;
      for(k=1;k<=3;k++){
        fx=tl+(tr-tl)*k/4; fbx=bl+(br-bl)*k/4;
        parts+='<line x1="'+fx+'" y1="'+binTop+'" x2="'+fbx+'" y2="'+binBot+'" stroke="#fff" stroke-opacity="0.12" stroke-width="2"/>';
      }
      parts+=wheels(shape==='drive'?mid+14:mid,n,dual);
    } else {
      parts+='<rect x="'+(x+8)+'" y="'+(GROUND-36)+'" width="'+(segW-16)+'" height="22" rx="4" fill="'+col+'" opacity="0.3"/>';
      parts+=wheels(mid,n,dual);
    }

    parts+='<text x="'+mid+'" y="'+(GROUND-70)+'" font-size="11.5" font-weight="800" text-anchor="middle" fill="#E2E8F0">'+
           (r.w==null?'\u2014':fmt(Math.round(r.w)))+'</text>';
    parts+='<text x="'+mid+'" y="'+(GROUND+24)+'" font-size="9" font-weight="700" text-anchor="middle" fill="#94A3B8">'+
           esc(r.slot.l)+'</text>';
  });

  return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="max-width:100%;height:auto">'+parts+'</svg>';
}

/* Verdict banner. Restored — these two helpers were lost in an earlier edit
   and axlePanelHTML calls both, which is what threw
   "axleRowCol is not defined" on every render of the axle panel. */
function axleBanner(ev,u){
  if(ev.blocked)
    return '<div style="background:var(--amberl);border:1px solid var(--amber);color:var(--warn-ink);border-radius:8px;padding:8px 10px;font-size:12px;font-weight:700">'+
      '\u26a0 Decks do not add up to the gross \u2014 an axle group is bridging two decks. Reposition the vehicle before reading axle loads.</div>';
  if(!ev.mapped)
    return '<div style="font-size:12px;color:var(--text3)">Pick a truck above to check axle loads.</div>';
  if(ev.anyOver){
    const bits=ev.rows.filter(r=>r.over>0).map(r=>r.slot.l+' +'+fmt(r.over));
    if(ev.comboOver) bits.push('Combination +'+fmt(ev.comboOver));
    return '<div style="background:var(--redl);border:1px solid var(--red);color:var(--bad-ink);border-radius:8px;padding:8px 10px;font-size:13px;font-weight:800">'+
      '\u26d4 OVERLOADED \u2014 '+esc(bits.join(' \u00b7 '))+' '+u+'</div>';
  }
  return '<div style="background:var(--greenl);border:1px solid var(--green);color:var(--ok-ink);border-radius:8px;padding:8px 10px;font-size:13px;font-weight:800">'+
    '\u2705 Within limits'+(ev.noCheck?' (no gross cross-check)':'')+'</div>';
}
function axleRowCol(r){
  if(r.gid==='none'||r.pct==null) return 'var(--border2)';
  return r.pct>100?'var(--red)':(r.pct>90?'var(--amber)':'var(--green)');
}

function axlePanelHTML(bi){
  const a=axleCfg(), ev=axleEval(bi);
  if(!ev) return '';
  const u=cfg.weightUnit||'kg';
  const rows=ev.rows.map(r=>{
    const pct=r.pct==null?0:Math.min(120,r.pct), col=axleRowCol(r);
    return '<div style="display:grid;grid-template-columns:64px 1fr 96px;gap:8px;align-items:center;margin-bottom:6px">'+
      '<div style="font-size:11px;font-weight:800;color:'+r.slot.c+'">'+r.slot.l+'</div>'+
      '<div>'+
        '<select style="width:100%;font-size:12px;padding:3px 5px" onchange="setAxleGroup(\''+r.slot.k+'\',this.value)">'+
          AXLE_GROUPS.map(g=>'<option value="'+g.id+'"'+(r.gid===g.id?' selected':'')+'>'+esc(g.l)+'</option>').join('')+
        '</select>'+
        '<div style="height:5px;background:var(--border);border-radius:3px;margin-top:4px;overflow:hidden">'+
          '<div id="ax-bar-'+r.slot.k+'" style="height:100%;width:'+pct+'%;background:'+col+'"></div></div>'+
      '</div>'+
      '<div style="text-align:right;font-family:monospace;font-size:13px;font-weight:800;color:'+col+'" id="ax-w-'+r.slot.k+'">'+
        (r.w==null?'\u2014':fmt(Math.round(r.w)))+
        '<div style="font-size:10px;color:var(--text3);font-weight:600">'+(r.limit?('of '+fmt(r.limit)):'\u2014')+'</div></div>'+
    '</div>';
  }).join('');
  return '<div class="card-title" style="margin-bottom:8px">Axle Check '+
      '<span style="float:right;font-size:10px;font-weight:700;color:var(--text3);text-transform:none">Advisory only</span></div>'+
    '<div class="field" style="margin-bottom:8px"><label>Truck configuration</label>'+
      '<select onchange="setAxlePreset(this.value)">'+
        TRUCK_PRESETS.map(p=>'<option value="'+p.id+'"'+(a.preset===p.id?' selected':'')+'>'+esc(p.l)+'</option>').join('')+
      '</select></div>'+
    '<div id="ax-svg">'+axleSchematic(ev)+'</div>'+
    '<div style="margin:8px 0">'+rows+'</div>'+
    '<div style="display:flex;justify-content:space-between;font-size:12px;border-top:1px solid var(--border);padding-top:7px;margin-bottom:8px">'+
      '<span style="color:var(--text3);font-weight:700">Combination</span>'+
      '<span id="ax-combo" style="font-family:monospace;font-weight:800">\u2014</span></div>'+
    '<div id="ax-banner"></div>';
}

/* Live refresh. Touches only text, bar widths and colours \u2014 it never goes
   near a <select>, so an open dropdown stays open. */
function axleUpdateValues(bi){
  const ev=axleEval(bi); if(!ev) return;
  const u=cfg.weightUnit||'kg';
  ev.rows.forEach(r=>{
    const col=axleRowCol(r);
    const bar=document.getElementById('ax-bar-'+r.slot.k);
    if(bar){ bar.style.width=(r.pct==null?0:Math.min(120,r.pct))+'%'; bar.style.background=col; }
    const w=document.getElementById('ax-w-'+r.slot.k);
    if(w){
      w.style.color=col;
      w.innerHTML=(r.w==null?'\u2014':fmt(Math.round(r.w)))+
        '<div style="font-size:10px;color:var(--text3);font-weight:600">'+(r.limit?('of '+fmt(r.limit)):'\u2014')+'</div>';
    }
  });
  const svg=document.getElementById('ax-svg'); if(svg) svg.innerHTML=axleSchematic(ev);
  const cb=document.getElementById('ax-combo');
  if(cb){
    cb.style.color=ev.comboOver?'var(--red)':'var(--green)';
    cb.textContent=(ev.gross==null?'\u2014':fmt(Math.round(ev.gross)))+' / '+fmt(ev.comboLim)+' '+u;
  }
  const bn=document.getElementById('ax-banner'); if(bn) bn.innerHTML=axleBanner(ev,u);
}

/* force=true rebuilds; otherwise the panel is only rebuilt when the shape of
   it has actually changed, and is refreshed in place the rest of the time. */
let _axleSig='';
function renderWeighAxle(force){
  const el=document.getElementById('weigh-axle'); if(!el) return;
  const bc=cfg.bridges[activeBridge]||{};
  if(!isMulti(bc)||!axleCfg().on){ el.style.display='none'; _axleSig=''; return; }
  el.style.display='block';
  const a=axleCfg();
  const sig=[activeBridge,a.preset,bc.deckCount,JSON.stringify(a.groups),JSON.stringify(a.limits),a.tolPct].join('|');
  if(force||sig!==_axleSig||!document.getElementById('ax-banner')){
    _axleSig=sig;
    el.innerHTML=axlePanelHTML(activeBridge);
  }
  axleUpdateValues(activeBridge);
}

