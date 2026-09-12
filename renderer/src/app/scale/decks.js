/* ══════════════════════════════════════════════════════════════════════
   MULTI-DECK SUPPORT
   Some indicators send each deck's weight plus the gross in one string:
     #<d1>kg,NUL<d2>kg,NUL<d3>kg,NUL<d4>kg,NUL<status><gross>kg LF CR NUL
   Single-deck bridges are untouched — they keep using parseRaw().
   ══════════════════════════════════════════════════════════════════════ */

const DECK_SLOTS=[
  {k:'d1',l:'Deck 1',c:'#60A5FA'},{k:'d2',l:'Deck 2',c:'#34D399'},
  {k:'d3',l:'Deck 3',c:'#A78BFA'},{k:'d4',l:'Deck 4',c:'#22D3EE'}];
const GROSS_SLOT={k:'gross',l:'Gross',c:'#D4AF37'};
function deckSlots(bc){ return DECK_SLOTS.slice(0,Math.max(2,Math.min(4,parseInt(bc&&bc.deckCount)||4))); }
function allDeckSlots(bc){ return deckSlots(bc).concat([GROSS_SLOT]); }
function slotByKey(k){ return k==='gross'?GROSS_SLOT:DECK_SLOTS.find(s=>s.k===k); }
function isMulti(bc){ return !!(bc && bc.deckMode==='multi'); }

let _deckLive=[[],[]];        // last numbers seen per bridge
let _deckLearn=[null,null];   // learn-a-deck state per bridge
let _deckPaint=0, _deckFieldsPaint=0;

/* ONE tokeniser for everything. The field number the operator maps in
   Settings is an index into this array, so the mapper and the parser must
   never disagree about what counts as a number. */
function numTokens(ln){
  if(ln==null) return [];
  const clean=String(ln).replace(/(\d),(\d)/g,'$1$2');   // 14,280 -> 14280
  const out=[];
  const re=/[-+]?\d[\d ]*\.?\d*/g; let m;
  while((m=re.exec(clean))!==null){
    const c=m[0].replace(/[^0-9.\-]/g,'');
    if(!c||c==='-'||c==='.') continue;
    const v=parseFloat(c);
    if(isFinite(v)) out.push({raw:m[0].trim(),val:v});
  }
  return out;
}

/* Which number is the gross? The one equal to the sum of the others.
   Only trustworthy when two or more of the others carry load — with a single
   deck loaded, that deck and the gross hold the same figure and nothing can
   separate them. Returns -1 when it cannot be decided yet. */
function deckSumIndex(nums){
  const n=nums.length, hits=[];
  for(let i=0;i<n;i++){
    let sum=0,loaded=0;
    for(let j=0;j<n;j++) if(j!==i){ sum+=nums[j]; if(Math.abs(nums[j])>1) loaded++; }
    if(loaded<2) continue;
    if(Math.abs(sum-nums[i])/Math.max(Math.abs(nums[i]),1)<0.02) hits.push(i);
  }
  return hits.length===1?hits[0]:-1;
}

function parseDecks(nums, bc){
  const map=bc.deckMap||{}, tol=parseFloat(bc.deckTol)||0;
  const at=k=>{ const i=map[k]; return (i===undefined||nums[i]===undefined)?null:nums[i]; };
  const decks=deckSlots(bc).map(s=>at(s.k));
  const gross=at('gross');
  const got=decks.filter(v=>v!==null);
  const sum=got.length?got.reduce((a,v)=>a+v,0):null;
  // Gross is what gets ticketed. If it is not in the string, the decks added
  // up are the next best thing. If neither is mapped, fall through to the
  // ordinary single-deck parser so the bridge never goes dead.
  const weight = gross!==null ? gross : sum;
  return {decks, gross, sum,
          agrees:(gross===null||sum===null)?null:Math.abs(sum-gross)<=tol,
          weight};
}

/* ── Learn: load one deck, watch which number moves ── */
function deckLearnStart(bi, slot){
  const bc=cfg.bridges[bi]||{}, nums=_deckLive[bi];
  if(!nums.length){ toast('No data yet — connect the indicator first','error'); return; }
  if(slot!=='gross' && (bc.deckMap||{}).gross===undefined && deckSumIndex(nums)<0){
    toast('Set Gross first — put load on two or more decks, then press Suggest','error',6000); return;
  }
  _deckLearn[bi]={slot, baseline:nums.slice(), best:-1, bestDelta:0, until:Date.now()+20000};
  toast('Learning '+slotByKey(slot).l+' — put a load on that deck now','info',6000);
  renderDeckSetup(bi);
}
function deckLearnTick(bi, nums){
  const L=_deckLearn[bi]; if(!L) return;
  const bc=cfg.bridges[bi]||{}, map=bc.deckMap||{};
  // The gross rises by exactly the load being added, so it would otherwise win
  // the "what moved most" contest every time.
  const gi = map.gross!==undefined ? map.gross : deckSumIndex(nums);
  for(let i=0;i<nums.length;i++){
    if(i===gi && L.slot!=='gross') continue;
    let taken=false;
    for(const k of Object.keys(map)) if(map[k]===i && k!==L.slot) taken=true;
    if(taken) continue;
    const d=Math.abs(nums[i]-(L.baseline[i]||0));
    if(d>L.bestDelta){ L.bestDelta=d; L.best=i; }
  }
  if(Date.now()>L.until) deckLearnFinish(bi);
}
function deckLearnFinish(bi){
  const L=_deckLearn[bi]; if(!L) return;
  _deckLearn[bi]=null;
  const bc=cfg.bridges[bi]; if(!bc.deckMap) bc.deckMap={};
  if(L.best<0 || L.bestDelta<10){
    toast('Nothing moved enough to be sure — try again with a heavier load','error',5000);
    renderDeckSetup(bi); return;
  }
  for(const k of Object.keys(bc.deckMap)) if(bc.deckMap[k]===L.best) delete bc.deckMap[k];
  bc.deckMap[L.slot]=L.best; saveCfg();
  toast(slotByKey(L.slot).l+' = field '+L.best+' (moved '+fmt(Math.round(L.bestDelta))+')','success',5000);
  renderDeckSetup(bi);
}

function deckSuggest(bi){
  const bc=cfg.bridges[bi], nums=_deckLive[bi];
  if(!nums.length){ toast('No data yet — connect the indicator first','error'); return; }
  const gi=deckSumIndex(nums);
  bc.deckMap={};
  if(gi>=0){
    bc.deckMap.gross=gi;
    const ds=deckSlots(bc); let d=0;
    for(let i=0;i<nums.length && d<ds.length;i++){ if(i!==gi) bc.deckMap[ds[d++].k]=i; }
    toast('Field '+gi+' adds up to the others — set as Gross','success',5000);
  }else{
    const sl=allDeckSlots(bc);
    for(let i=0;i<Math.min(nums.length,sl.length);i++) bc.deckMap[sl[i].k]=i;
    toast('Cannot tell which field is the gross yet — load two or more decks and press Suggest again','error',7000);
  }
  saveCfg(); renderDeckSetup(bi);
}
function deckAssign(bi, i, k){
  const bc=cfg.bridges[bi]; if(!bc.deckMap) bc.deckMap={};
  for(const kk of Object.keys(bc.deckMap)) if(bc.deckMap[kk]===i) delete bc.deckMap[kk];
  if(k) bc.deckMap[k]=i;
  saveCfg(); renderDeckSetup(bi);
}
function deckClear(bi){ cfg.bridges[bi].deckMap={}; saveCfg(); renderDeckSetup(bi); }
function setDeckMode(bi,v){ setBridge(bi,'deckMode',v); renderSettings(); renderDeckBar(true); }
function setDeckCount(bi,v){ setBridge(bi,'deckCount',parseInt(v)||4); renderDeckSetup(bi); renderDeckBar(true); }

/* ── Deck strip under the header ── */
function renderDeckBar(force){
  const el=document.getElementById('deckbar'); if(!el) return;
  const now=Date.now();
  if(!force && now-_deckPaint<250) return;
  _deckPaint=now;
  const bc=cfg.bridges[activeBridge];
  if(!isMulti(bc)){ el.style.display='none'; return; }
  const st=bState[activeBridge], u=cfg.weightUnit||'kg';
  const sl=deckSlots(bc);
  let html=sl.map((s,i)=>{
    const v=(st.decks||[])[i];
    return '<div class="dk" style="border-top-color:'+s.c+'">'+
      '<div class="dk-l">'+s.l+'</div>'+
      '<div class="dk-v" style="color:'+(v==null?'var(--text3)':s.c)+'">'+
        (v==null?'—':fmt(Math.round(v)))+'</div></div>';
  }).join('');
  const ok=st.deckAgrees;
  const col = ok===null?'var(--text3)':(ok?'#34D399':'#F87171');
  html+='<div class="dk" style="border-top-color:'+GROSS_SLOT.c+';background:var(--base)">'+
    '<div class="dk-l">Gross</div>'+
    '<div class="dk-v" style="color:'+GROSS_SLOT.c+'">'+
      (st.live?fmt(Math.round(st.live)):'—')+'</div>'+
    '<div class="dk-x" style="color:'+col+'">'+
      (ok===null?'no cross-check'
        : ok?'decks agree ✓'
            :'out by '+fmt(Math.round((st.deckSum||0)-(st.live||0)))+' '+u)+
    '</div></div>';
  el.innerHTML=html; el.style.display='flex';
}

/* ── Mapping panel inside Settings ── */
function deckSetupHTML(bi){
  const bc=cfg.bridges[bi]||{};
  const multi=isMulti(bc);
  return '<div style="margin-top:12px;border-top:1px solid var(--line-2);padding-top:10px">'+
    '<div class="row2">'+
      '<div class="field"><label>Deck Layout</label>'+
        '<select onchange="setDeckMode('+bi+',this.value)">'+
          '<option value="single"'+(!multi?' selected':'')+'>Single deck — one weight in the string</option>'+
          '<option value="multi"'+(multi?' selected':'')+'>Multi-deck — deck weights + gross in the string</option>'+
        '</select></div>'+
      '<div class="field"><label>Number of decks</label>'+
        '<select onchange="setDeckCount('+bi+',this.value)"'+(multi?'':' disabled')+'>'+
          [2,3,4].map(n=>'<option value="'+n+'"'+((parseInt(bc.deckCount)||4)===n?' selected':'')+'>'+n+' decks</option>').join('')+
        '</select></div>'+
    '</div>'+
    '<div id="dkset'+bi+'">'+(multi?deckSetupInner(bi):'')+'</div>'+
    (multi?axleSettingsHTML():'')+'</div>';
}

/* Axle check on/off + site-editable limits. Limits are editable because a
   site may run under permit, and because enforcement tolerance is a local
   policy decision rather than something to bake into the app. */
function axleSettingsHTML(){
  const a=axleCfg();
  return '<div style="margin-top:12px;border-top:1px solid var(--line-2);padding-top:10px">'+
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'+
      '<input type="checkbox" id="axleon" '+(a.on?'checked':'')+' onchange="setAxleOn(this.checked)" style="width:auto"/>'+
      '<label for="axleon" style="margin:0;cursor:pointer">Show axle overload check on the weigh screen</label></div>'+
    (a.on?
      '<div style="font-size:11px;color:var(--text3);margin-bottom:8px;line-height:1.5">'+
        'Advisory only — the ticket still records the gross. Limits below default to NRTR Reg 240; '+
        'change them if the site runs under permit.</div>'+
      '<div class="row3">'+
        AXLE_GROUPS.filter(g=>g.id!=='none').map(g=>
          '<div class="field"><label style="font-size:10px">'+esc(g.l)+'</label>'+
          '<input type="number" min="0" step="100" value="'+axleLimit(g.id)+'" '+
          'onblur="setAxleLimit(\''+g.id+'\',this.value)"/></div>').join('')+
        '<div class="field"><label style="font-size:10px">Max combination</label>'+
          '<input type="number" min="0" step="500" value="'+(parseFloat(a.comboLimit)||COMBO_LIMIT)+'" '+
          'onblur="cfg.axle.comboLimit=parseFloat(this.value)||'+COMBO_LIMIT+';saveCfg()"/></div>'+
        '<div class="field"><label style="font-size:10px">Tolerance %</label>'+
          '<input type="number" min="0" step="0.5" value="'+(parseFloat(a.tolPct)||0)+'" '+
          'onblur="setAxleTol(this.value)"/></div>'+
      '</div>'
    :'')+'</div>';
}
function deckSetupInner(bi){
  const bc=cfg.bridges[bi]||{}, nums=_deckLive[bi], map=bc.deckMap||{};
  const sl=allDeckSlots(bc), L=_deckLearn[bi];
  const used=k=>map[k]!==undefined?map[k]:null;

  let rows;
  if(!nums.length){
    rows='<div style="color:var(--text3);font-size:12px;padding:8px 0">'+
         'Connect the indicator and the numbers it sends will be listed here.</div>';
  }else{
    rows='<table style="width:100%;border-collapse:collapse;font-size:12px">'+
      '<tr><th style="text-align:left;color:var(--text3);font-size:10px;text-transform:uppercase;padding:3px 4px">Field</th>'+
      '<th style="text-align:right;color:var(--text3);font-size:10px;text-transform:uppercase;padding:3px 4px">Value now</th>'+
      '<th style="text-align:left;color:var(--text3);font-size:10px;text-transform:uppercase;padding:3px 4px;width:120px">Is</th></tr>'+
      nums.map((v,i)=>{
        const k=Object.keys(map).find(kk=>map[kk]===i);
        const s=k?slotByKey(k):null;
        return '<tr><td style="padding:3px 4px;font-family:monospace;color:var(--text3)">'+i+'</td>'+
          '<td style="padding:3px 4px;text-align:right;font-family:monospace;font-weight:800;font-size:14px'+
            (s?';color:'+s.c:'')+'">'+fmt(v)+'</td>'+
          '<td style="padding:3px 4px"><select style="width:100%;font-size:12px;padding:2px 4px" '+
            'onchange="deckAssign('+bi+','+i+',this.value)">'+
            '<option value="">—</option>'+
            sl.map(x=>'<option value="'+x.k+'"'+(map[x.k]===i?' selected':'')+'>'+x.l+'</option>').join('')+
          '</select></td></tr>';
      }).join('')+'</table>';
  }

  const learnRow='<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px">'+
    sl.map(x=>{
      const on=L&&L.slot===x.k;
      return '<button class="btn btn-sm '+(on?'btn-navy':'btn-ghost')+'" '+
        'onclick="'+(on?'deckLearnFinish('+bi+')':'deckLearnStart('+bi+',\''+x.k+'\')')+'">'+
        (on?'⏱ Watching '+x.l:'Learn '+x.l)+'</button>';
    }).join('')+'</div>';

  const st=bState[bi];
  let check='';
  if(st.deckSum!==null && st.deckSum!==undefined){
    const ok=st.deckAgrees;
    const col=ok===null?'var(--text3)':(ok?'#34D399':'#F87171');
    check='<div style="margin-top:8px;font-size:12px;display:flex;justify-content:space-between">'+
      '<span style="color:var(--text3)">Decks add up to</span>'+
      '<span style="font-family:monospace;font-weight:800;color:'+col+'">'+fmt(Math.round(st.deckSum))+
      (st.deckAgrees===null?'':(ok?' ✓ matches gross':' ✗ gross says '+fmt(Math.round(st.live))))+'</span></div>';
  }

  return rows+learnRow+
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;align-items:center">'+
      '<button class="btn btn-blue btn-sm" onclick="deckSuggest('+bi+')">✨ Suggest mapping</button>'+
      '<button class="btn btn-ghost btn-sm" onclick="deckClear('+bi+')">Clear</button>'+
      '<span style="margin-left:auto;font-size:11px;color:var(--text3)">Tolerance</span>'+
      '<input type="number" min="0" step="5" value="'+(bc.deckTol!==undefined?bc.deckTol:20)+'" '+
        'style="width:64px" onblur="setBridge('+bi+',\'deckTol\',parseFloat(this.value)||0)"/>'+
      '<span style="font-size:11px;color:var(--text3)">kg</span>'+
    '</div>'+
    check+
    '<div style="font-size:11px;color:var(--text3);margin-top:6px;line-height:1.5">'+
      'Put a load on two or more decks and press <b>Suggest mapping</b> — the field that equals the sum of the others is the gross. '+
      'Then press <b>Learn</b> for a deck and drive an axle onto it to confirm which field is which. '+
      'The ticket always records the gross.</div>';
}
function renderDeckSetup(bi){
  const el=document.getElementById('dkset'+bi);
  if(el) el.innerHTML=isMulti(cfg.bridges[bi])?deckSetupInner(bi):'';
}

