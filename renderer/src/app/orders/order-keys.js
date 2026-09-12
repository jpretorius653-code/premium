// ══════════════════════════════════════════════════════════════════════════
//  ORDER + REGISTRATION KEYS  (v10)
//
//  Order numbers are typed by people and by spreadsheets: "RET2158",
//  "RET 2158" and "ret-2158" are the same order. Before 10.0 they were three
//  orders and the tonnage split between them (Riet Coal, Sept 2026). Every
//  lookup by number now goes through ordKey(), and fleet restrictions compare
//  registrations the same way.
// ══════════════════════════════════════════════════════════════════════════
function ordKey(v){ return String(v==null?'':v).toUpperCase().replace(/[^A-Z0-9]/g,''); }
function orderByNo(no){ const k=ordKey(no); return k ? (orders.find(o=>ordKey(o.no)===k) || null) : null; }
/* A target is a positive mass. Blank, 0, NaN and the -1 "no target" sentinel
   written by some imports and the remote dashboard all mean open-ended. */
function orderTargetKg(o){ const t=Number(o&&o.targetKg); return isFinite(t)&&t>0 ? t : null; }
function regKey(r){ return String(r||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
function orderAllowsReg(o,reg){
  if(!o || !Array.isArray(o.fleet) || !o.fleet.length) return true;
  const k=regKey(reg); return o.fleet.some(r=>regKey(r)===k);
}
/* Orders whose numbers only differ by spacing or case, e.g. from before 10.0.
   Flagged on the Orders screen rather than merged — which one the tickets
   belong to is a manager's call. */
function orderDuplicateNos(){
  const seen={}, dup={};
  orders.forEach(o=>{ const k=ordKey(o.no); if(!k) return; if(seen[k]) { dup[o.id]=seen[k]; dup[seen[k].id]=o; } else seen[k]=o; });
  return dup;
}
