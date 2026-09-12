// ══════════════════════════════════════════════════════════
// AUDIT TRAIL — append-only log of every significant action
// Who did what, when, with before/after values. Never editable
// from the UI. This is your legal protection for disputes.
// ══════════════════════════════════════════════════════════
let auditTrail=G('iss8_audit',[]);
function auditLog(action,entity,entityId,detail,before,after){
  const entry={
    id:Date.now()+'-'+Math.random().toString(36).slice(2,6),
    ts:new Date().toISOString(),
    user:session?session.name:'(system)',
    userId:session?session.userId:'',
    action,        // login, weigh1, weigh2, complete, void, edit, delete, reprint, access, config
    entity,        // tx, order, user, settings, db
    entityId:entityId||'',
    detail:detail||'',
  };
  if(before!==undefined) entry.before=before;
  if(after!==undefined)  entry.after=after;
  auditTrail.unshift(entry);
  if(auditTrail.length>5000) auditTrail=auditTrail.slice(0,5000);  // cap
  try{P('iss8_audit',auditTrail);}catch{}
  // Mirror to IndexedDB so it survives a localStorage wipe
  if(typeof idbPut==='function') idbPut('meta',auditTrail.slice(0,500),'auditRecent');
}

