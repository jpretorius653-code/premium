// ── AUDIT TRAIL ───────────────────────────────────
let auditFilter='';
function renderAudit(){
  const ICON={login:'🔑',weigh1:'📥',weigh2:'📤',complete:'✅',void:'🗑',edit:'✏️',create:'➕',delete:'❌',reprint:'🖨',access:'🔓',config:'⚙',recover:'⚡'};
  let list=auditTrail;
  if(auditFilter){
    const q=auditFilter.toLowerCase();
    list=list.filter(e=>[e.user,e.action,e.entity,e.entityId,e.detail].join(' ').toLowerCase().includes(q));
  }
  document.getElementById('content').innerHTML=`
    <div class="sec-hd">
      <div><h2>Audit Trail</h2><div class="sub">${auditTrail.length} logged actions · append-only · tamper-evident</div></div>
      <button class="btn btn-ghost btn-sm" onclick="exportAudit()">↓ Export CSV</button>
    </div>
    <div class="card" style="margin-bottom:12px">
      <input id="audit-q" placeholder="🔍 Search by user, action, vehicle, detail…" value="${esc(auditFilter)}" oninput="auditFilter=this.value;renderAuditRows()"/>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <div id="audit-rows"></div>
    </div>`;
  renderAuditRows();
}
function renderAuditRows(){
  const ICON={login:'🔑',weigh1:'📥',weigh2:'📤',complete:'✅',void:'🗑',edit:'✏️',create:'➕',delete:'❌',reprint:'🖨',access:'🔓',config:'⚙',recover:'⚡'};
  let list=auditTrail;
  if(auditFilter){
    const q=auditFilter.toLowerCase();
    list=list.filter(e=>[e.user,e.action,e.entity,e.entityId,e.detail].join(' ').toLowerCase().includes(q));
  }
  const el=document.getElementById('audit-rows');
  if(!el)return;
  if(!list.length){el.innerHTML='<div class="empty"><div class="ico">📜</div><p>No audit entries</p></div>';return;}
  el.innerHTML=`<table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Detail</th></tr></thead><tbody>
    ${list.slice(0,300).map(e=>`<tr>
      <td style="font-size:11px;color:var(--text3);white-space:nowrap">${fmtDT(e.ts)}</td>
      <td style="font-weight:700">${esc(e.user)}</td>
      <td style="white-space:nowrap">${ICON[e.action]||'•'} ${esc(e.action)}</td>
      <td style="font-size:12px">${esc(e.detail)}${e.before!==undefined?`<br><span style="font-size:10px;color:var(--red)">was: ${esc(JSON.stringify(e.before))}</span>`:''}</td>
    </tr>`).join('')}</tbody></table>`;
}
function exportAudit(){
  if(!auditTrail.length){toast('No audit entries','error');return;}
  const hdr='Timestamp,User,UserID,Action,Entity,EntityID,Detail\n';
  const rows=auditTrail.map(e=>[e.ts,e.user,e.userId,e.action,e.entity,e.entityId,'"'+(e.detail||'').replace(/"/g,'""')+'"'].join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([hdr+rows],{type:'text/csv'}));
  a.download=BRAND.filePrefix+'-Audit-'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();URL.revokeObjectURL(a.href);
  auditLog('config','settings','','Exported audit trail');
  toast('Audit trail exported','success');
}

