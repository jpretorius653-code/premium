// ── USERS ─────────────────────────────────────────
function renderUsers(){
  document.getElementById('content').innerHTML=`
    <div class="sec-hd">
      <div><h2>User Management</h2><div class="sub">Access levels: Clerk · Supervisor · Manager · Master</div></div>
      <button class="btn btn-navy" onclick="openUserModal()">+ Add User</button>
    </div>
    ${users.map(u=>`<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:15px;font-weight:800;color:var(--ink)">${esc(u.name)} <span class="badge ${u.role==='master'?'b-blue':'b-gray'}">${esc(roleLabel(u.role))}</span> ${!u.active?'<span class="badge b-gray">Inactive</span>':''}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">
            ${roleRank(u.role)>=roleRank('supervisor')?esc(roleDef(u.role).desc):(Object.entries(u.perms||{}).filter(([,v])=>v).map(([k])=>k).join(', ')||'No permissions set')}
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="openUserModal('${u.id}')">Edit</button>
          ${u.id!=='master'?`<button class="btn btn-ghost btn-sm" onclick="deleteUser('${u.id}')">Delete</button>`:''}
        </div>
      </div>
    </div>`).join('')}`;
}
const PERMS={weigh:'Weigh tab',records:'Records',database:'Database',orders:'Orders',reports:'Reports'};
function openUserModal(id){
  const u=id?users.find(x=>x.id===id):null;
  const isMasterU=u?.id==='master';
  openModal(u?'Edit User':'Add User',`
    <div class="row2">
      <div class="field"><label>Name</label><input id="u-name" value="${esc(u?.name||'')}" placeholder="Full name" ${isMasterU?'readonly':''}/></div>
      <div class="field"><label>New PIN (4 digits)</label><input id="u-pin" type="password" maxlength="4" placeholder="${u?'Leave blank to keep':'1234'}" inputmode="numeric"/></div>
    </div>
    ${!isMasterU?`
    <div class="field"><label>Access Level</label>
      <select id="u-role" onchange="onRoleChange()">
        ${ROLES.filter(r=>r.id!=='master'||roleAtLeast('master')).map(r=>
          `<option value="${r.id}" ${(u?.role||'clerk')===r.id?'selected':''}>${esc(r.l)} — ${esc(r.desc)}</option>`).join('')}
      </select>
      <div id="u-role-note" style="font-size:11px;color:var(--text3);margin-top:4px"></div>
    </div>
    <div class="field" id="u-perm-wrap" style="margin-bottom:6px"><label>Permissions</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">
        ${Object.entries(PERMS).map(([k,l])=>`<div class="perm-chip ${(u?.perms||{})[k]?'on':'off'}" id="pc-${k}" onclick="togglePerm('${k}')">${l}</div>`).join('')}
      </div>
    </div>
    <div class="field"><label>Status</label>
      <select id="u-active"><option value="1" ${u?.active!==false?'selected':''}>Active</option><option value="0" ${u?.active===false?'selected':''}>Inactive</option></select>
    </div>`:''}
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-navy" style="flex:1" onclick="saveUser('${u?.id||''}')">Save</button>
    </div>`);
  setTimeout(onRoleChange,0);
}
function togglePerm(k){const el=document.getElementById('pc-'+k);if(el){el.classList.toggle('on');el.classList.toggle('off');}}
/* Supervisor and above get every feature tab by rule, so the per-permission
   chips are meaningless for them — hide them and say why, rather than leaving
   a set of switches on screen that do nothing. */
function onRoleChange(){
  const r=document.getElementById('u-role')?.value||'clerk';
  const wrap=document.getElementById('u-perm-wrap');
  const note=document.getElementById('u-role-note');
  const tiered=roleRank(r)>=roleRank('supervisor');
  if(wrap) wrap.style.display=tiered?'none':'';
  if(note) note.textContent = r==='clerk'
    ? 'Tick the areas this clerk may use.'
    : (r==='supervisor' ? 'All tabs except Settings and Cloud.'
    : (r==='manager'    ? 'All tabs except Cloud.'
    :                     'Full access, including Users and Cloud.'));
}
async function saveUser(id){
  const name=(document.getElementById('u-name')?.value||'').trim();
  const pin=(document.getElementById('u-pin')?.value||'').trim();
  if(!name){toast('Enter a name','error');return;}
  if(!id&&(pin.length!==4||!/^\d{4}$/.test(pin))){toast('PIN must be 4 digits','error');return;}
  const isMasterU=id==='master';
  if(!isMasterU){
    const perms={};Object.keys(PERMS).forEach(k=>{perms[k]=document.getElementById('pc-'+k)?.classList.contains('on');});
    const active=document.getElementById('u-active')?.value!=='0';
    let role=document.getElementById('u-role')?.value||'clerk';
    if(!ROLES.some(r=>r.id===role)) role='clerk';
    // Only a Master may hand out Master. Stops a Manager promoting themselves.
    if(role==='master'&&!roleAtLeast('master')){ toast('Only a Master can grant Master access','error'); return; }
    if(id){const u=users.find(x=>x.id===id);if(u){u.name=name;if(pin){u.pinHash=await hashStr(pin);delete u.pin;}u.perms=perms;u.role=role;u.active=active;auditLog('edit','user',id,'Edited '+roleLabel(role)+' '+name);}}
    else{const nh=await hashStr(pin);users.push({id:'U'+Date.now(),name,pinHash:nh,role,active:true,perms});auditLog('create','user',name,'Created '+roleLabel(role)+' '+name);}
  }else{
    const u=users.find(x=>x.id==='master');if(u){u.name=name;if(pin){if(pin.length!==4||!/^\d{4}$/.test(pin)){toast('PIN must be 4 digits','error');return;}u.pinHash=await hashStr(pin);delete u.pin;auditLog('edit','user','master','Changed master PIN');}}
  }
  saveUsers();closeModal();renderUsers();toast('User saved ✓','success');
}
function deleteUser(id){if(!confirm('Delete this user?'))return;const u=users.find(x=>x.id===id);auditLog('delete','user',id,'Deleted clerk '+(u?.name||id));users=users.filter(u=>u.id!==id);saveUsers();shareDel('users',_uKey(u||{id}));renderUsers();}

