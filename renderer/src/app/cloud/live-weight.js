// ══════════════════════════════════════════════════════════════════════════
// LIVE WEIGHT PUBLISHER
//
// A new bridge is its own cloud client: the PC already reads the indicator
// over RS232 and already holds an authenticated Supabase session, so it
// posts the live weight itself. No ESP32 gateway, no Cloud Sync.
//
// WHY A SEPARATE TABLE, AND WHY UPSERT
// The live weight is throwaway — the ticket is the permanent record, exactly
// as the belt scales keep hourly totals permanently and let raw readings age
// out. So this writes ONE ROW PER BRIDGE and updates it in place. Nothing
// accumulates, so nothing needs deleting, and there is no retention job to
// forget. A bridge posting every 2 s for a year is still one row.
//
// CADENCE
//   moving  — at most every 2 s, and only when the number actually changed
//   settled — a heartbeat every 30 s, so the dashboard can tell "idle at zero"
//             apart from "this PC died"
// Between trucks nothing is sent at all beyond the heartbeat.
// ══════════════════════════════════════════════════════════════════════════
const LW_MOVING_MS = 2000;
const LW_IDLE_MS   = 30000;
let _lwLast = 0, _lwLastKg = null, _lwFails = 0, _lwOff = 0;

function lwEnabled(){
  const sc = syncCfg();
  return !!(sc.live && syncIsHost() && cloudUrl() && cloudCfg().key && cloudCfg().email);
}
/* Called from updateWeight() on every reading. Cheap and synchronous —
   the actual POST is fired and forgotten. */
function lwTick(kg, stable){
  if(!lwEnabled()) return;
  const now = Date.now();
  if(now < _lwOff) return;                       // backing off after failures
  const changed = (_lwLastKg === null) || Math.abs(kg - _lwLastKg) >= 20;
  const due = changed ? (now - _lwLast >= LW_MOVING_MS)
                      : (now - _lwLast >= LW_IDLE_MS);
  if(!due) return;
  _lwLast = now; _lwLastKg = kg;
  lwPost(kg, stable);
}
async function lwPost(kg, stable){
  try{
    await _sbReq('live_weight?on_conflict=device', {
      method:'POST',
      headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
      body: JSON.stringify({
        device: syncThisPC() + ':' + (activeBridge || 0),
        site:   siteCode(),
        name:   (cfg.bridges && cfg.bridges[activeBridge] && cfg.bridges[activeBridge].name)
                  || cfg.siteName || 'Weighbridge',
        weight: Math.round(kg),
        stable: !!stable,
        unit:   cfg.weightUnit || 'kg'
      })
    });
    _lwFails = 0;
  }catch(e){
    // A weighbridge must never stop weighing because the internet is down.
    // Back off hard and quietly; the clerk is not told, because there is
    // nothing for the clerk to do about it.
    _lwFails++;
    _lwOff = Date.now() + Math.min(5*60000, 15000 * _lwFails);
    try{ Debug.log('live weight: '+(e.message||e)); }catch(_){}
  }
}
/* Clear the row on the way out, so a closed app does not leave a number on
   the dashboard that looks live forever. */
async function lwClear(){
  if(!lwEnabled()) return;
  try{
    await _sbReq('live_weight?device=eq.'+encodeURIComponent(syncThisPC()+':'+(activeBridge||0)),
                 {method:'DELETE'});
  }catch(e){}
}

