function syncPanelHTML(){
  const sc=syncCfg(), host=syncIsHost(), other=sc.host && !host;
  return `
  <div class="sg"><div class="sg-title">Fleet &amp; Orders sync</div>
    <div class="card">
      <div style="font-size:12.5px;color:var(--text3);line-height:1.6;margin-bottom:10px">
        Pulls trucks and orders the client adds on the Remote Monitor, and pushes
        the ones added here. <b style="color:var(--text)">Run this on one PC only</b> —
        the shared folder carries the result to the other bridge.
      </div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:5px 0">
        <input type="checkbox" ${host?'checked':''} onchange="syncClaimHost(this.checked)"/>
        <span><b>This PC syncs fleet &amp; orders</b>${other?' — currently claimed by another PC':''}</span>
      </label>
      ${host?`
      <div class="row2" style="margin-top:6px">
        <div class="field"><label>Every … minutes</label>
          <input type="number" min="1" max="120" value="${esc(sc.everyMin||5)}"
            onblur="syncSet('everyMin',parseInt(this.value)||5);syncStart()"/></div>
        <div class="field"><label>Site</label>
          <input value="${esc(siteCode())}" disabled/></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:5px 0;margin-top:4px">
        <input type="checkbox" ${sc.live?'checked':''} onchange="syncSet('live',this.checked);renderCloud()"/>
        <span><b>Publish live weight</b> — shows this bridge on the Remote Monitor</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:5px 0">
        <input type="checkbox" ${sc.tickets?'checked':''} onchange="syncSet('tickets',this.checked);renderCloud()"/>
        <span><b>Publish tickets</b> — trucks on site, tickets and order progress</span>
      </label>
      <div style="font-size:11px;color:var(--text3);margin:-2px 0 8px 26px">
        Turn this ON only where the Cloud Sync app is NOT running, or the same
        ticket arrives twice by two routes.
      </div>
      <div style="font-size:11px;color:var(--text3);margin:-2px 0 8px 26px">
        One row per bridge, updated in place: the reading is throwaway, the ticket is the record.
        Leave this off where a Cloud Sync app or an ESP32 gateway already reports the bridge.
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px">
        <button class="btn btn-navy btn-sm" onclick="syncRun(true)" ${_syncBusy?'disabled':''}>
          ${_syncBusy?'Syncing…':'⟳ Sync now'}</button>
        <button class="btn btn-ghost btn-sm" onclick="syncResetCursor()">Re-read everything</button>
        <button class="btn btn-ghost btn-sm" onclick="syncResendTickets()" ${_syncBusy?'disabled':''}>
          Re-send all tickets</button>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:6px">
        Re-send pushes every completed ticket up again. Nothing is duplicated —
        each row lands on its own row_id — and it is what fills new report
        columns in for tickets that went up before those columns existed.
      </div>
      ${_txClash.length?`<div style="margin-top:8px;font-size:12px;color:#34D399;line-height:1.55">
        Ticket ${esc(_txClash.slice(0,6).join(', '))}${_txClash.length>6?' and '+(_txClash.length-6)+' more':''}
        share a cloud row id with another ticket. They still sync, one pass apart, but two tickets
        cannot both own one cloud row — worth checking them in Records.</div>`:''}
      ${_txColsOff.length?`<div style="margin-top:8px;font-size:12px;color:#34D399;line-height:1.55">
        The cloud has no <b>${esc(_txColsOff.join(', '))}</b> column${_txColsOff.length>1?'s':''}, so
        ${_txColsOff.length>1?'those fields are':'that field is'} being left out of every ticket.
        Run <b>iss_wb_report_fields.sql</b> in Supabase, then press Re-send all tickets.</div>`:''}
      ${sc.lastAt?`<div style="margin-top:10px;font-size:12px;color:${/failed/.test(sc.lastMsg||'')?'#F87171':'var(--text3)'}">
        Last run ${esc(fmtDT(sc.lastAt))} — ${esc(sc.lastMsg||'')}</div>`:''}
      `:`<div style="font-size:12px;color:var(--text3);margin-top:6px">
        Tick the box on whichever PC should do the talking. The other bridge gets
        everything through the shared folder.</div>`}
    </div>
  </div>`;
}
/* Put every completed ticket back in the queue. Used after adding report
   columns in Supabase: the rows already up are updated in place on row_id,
   so the client's history fills in rather than doubling. */
async function syncResendTickets(){
  if(!syncIsHost() || !syncCfg().tickets){
    toast('Publish tickets is off on this PC','error',4500); return; }
  const done=txs.filter(t=>t.completedAt);
  if(!done.length){ toast('No tickets to send','error'); return; }
  if(!confirm('Re-send all '+done.length+' tickets to the cloud?\n\nExisting rows are updated, not duplicated.')) return;
  _txColsReset();                 // the missing columns may have been added since
  _txClash=[]; _txClashSave();    // re-diagnose clashes from scratch
  done.forEach(t=>{ t._txAt=''; });
  saveTxs();
  _syncBusy=true; renderCloud();
  let sent=0;
  try{
    for(let pass=0; pass<60; pass++){
      sent+=await syncPushTickets();
      if(!txs.some(t=>t.completedAt && !t._txAt)) break;
    }
    auditLog('config','cloud','','Re-sent '+sent+' tickets to cloud');
    toast('Re-sent '+sent+' rows'+(_txColsOff.length?' — '+_txColsOff.join(', ')+' still missing in Supabase':''),
          _txColsOff.length?'info':'success',7000);
  }catch(e){
    toast('Re-send stopped: '+((e&&e.message)||e),'error',7000);
  }
  _syncBusy=false; renderCloud();
}
function syncResetCursor(){
  syncSet('fleetCursor',''); syncSet('orderCursor','');
  fleet.forEach(f=>{ delete f._cat; }); orders.forEach(o=>{ delete o._cat; });
  saveFleet(); saveOrders();
  toast('Cursor cleared — the next sync re-reads the whole list','success');
  syncRun(true);
}

async function cloudSignIn(email, pass){
  const c=cloudCfg();
  if(!cloudUrl()||!c.key) throw new Error('Enter the project URL and publishable key first');
  const r=await fetch(cloudUrl()+'/auth/v1/token?grant_type=password',{
    method:'POST',
    headers:{'apikey':c.key,'Content-Type':'application/json'},
    body:JSON.stringify({email,password:pass})
  });
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error_description||j.msg||j.message||('sign-in failed ('+r.status+')'));
  _cloudTok=j.access_token;
  return j;
}
/* Call one of the iss_* functions. */
async function cloudRpc(fn, args){
  const c=cloudCfg();
  const r=await fetch(cloudUrl()+'/rest/v1/rpc/'+fn,{
    method:'POST',
    headers:{'apikey':c.key,'Authorization':'Bearer '+(_cloudTok||c.key),'Content-Type':'application/json'},
    body:JSON.stringify(args||{})
  });
  const txt=await r.text();
  let j=null; try{ j=JSON.parse(txt); }catch(e){}
  if(!r.ok) throw new Error((j&&(j.message||j.hint))||txt.slice(0,200)||('HTTP '+r.status));
  return j;
}

async function cloudTest(){
  if(_cloudBusy) return; _cloudBusy=true; cloudSay('Connecting…','');
  try{
    const c=cloudCfg();
    if(!cloudUrl()) throw new Error('Project URL is empty');
    if(!c.email||!c.pass) throw new Error('Enter the login for this PC');
    await cloudSignIn(c.email,c.pass);
    const mine=await cloudRpc('iss_my_sites');
    const sites=(mine&&mine.sites)||[];
    const here=siteCode();
    if(mine&&mine.note){ cloudSay('Signed in ✓ — but the backend is not set up yet. Use Backend setup below.','warn'); }
    else if(sites.includes(here)) cloudSay('Signed in ✓ — this PC is registered for "'+here+'".','ok');
    else if(!sites.length) cloudSay('Signed in ✓ — but this login is not registered for any site. Register it under Backend setup.','warn');
    else cloudSay('Signed in ✓ — but this login covers ['+sites.join(', ')+'], and the Site Code here is "'+here+'". They must match.','warn');
    if(mine&&mine.admin) { try{ _cloudStatus=await cloudRpc('iss_status'); }catch(e){} }
  }catch(e){ _cloudTok=null; cloudSay('✗ '+e.message,'bad'); }
  _cloudBusy=false; renderCloud();
}

async function cloudCheck(){
  if(_cloudBusy) return; _cloudBusy=true; cloudSay('Reading the backend…','');
  try{
    const c=cloudCfg();
    await cloudSignIn(c.email,c.pass);
    _cloudStatus=await cloudRpc('iss_status');
    if(_cloudStatus&&_cloudStatus.error) throw new Error(_cloudStatus.error+' — this login is not an authorised admin');
    cloudSay('Backend read ✓','ok');
  }catch(e){ cloudSay('✗ '+e.message,'bad'); }
  _cloudBusy=false; renderCloud();
}

async function cloudProvision(){
  const existing=document.getElementById('cl-existing')?.value.trim()||'';
  if(!confirm('Set up or repair the backend now?\n\n'+
    'This adds columns, indexes and access rules. It never deletes a ticket.\n'+
    'The readings table is left alone, so the ESP32 gateways keep posting.\n'+
    (existing?('Tickets already up there will be tagged as: '+existing):
              'Rows already up there will NOT be tagged — fill in the site code box first if there are any.'))) return;
  if(_cloudBusy) return; _cloudBusy=true; cloudSay('Setting up…','');
  try{
    const c=cloudCfg();
    await cloudSignIn(c.email,c.pass);
    const r=await cloudRpc('iss_provision',{p_existing_site:existing||null,p_lock_readings:false});
    if(!r||!r.ok) throw new Error((r&&r.error)||'provision failed');
    _cloudStatus=await cloudRpc('iss_status');
    const acts=(r.actions||[]).join('\n• ');
    cloudSay('Backend ready ✓\n• '+acts,'ok');
    auditLog('config','cloud','','Backend provisioned: '+(r.actions||[]).length+' actions');
  }catch(e){ cloudSay('✗ '+e.message,'bad'); }
  _cloudBusy=false; renderCloud();
}

async function cloudRegister(){
  const email=(document.getElementById('cl-regmail')?.value||'').trim();
  const site=(document.getElementById('cl-regsite')?.value||'').trim().toLowerCase();
  if(!email||!site){ toast('Enter the login email and the site code','error'); return; }
  if(_cloudBusy) return; _cloudBusy=true; cloudSay('Registering…','');
  try{
    const c=cloudCfg();
    await cloudSignIn(c.email,c.pass);
    const r=await cloudRpc('iss_register_site',{p_email:email,p_site:site});
    if(!r||!r.ok) throw new Error((r&&r.error)||'could not register');
    cloudSay(email+' may now use "'+site+'" ✓','ok');
    auditLog('config','cloud','',email+' registered for site '+site);
  }catch(e){ cloudSay('✗ '+e.message,'bad'); }
  _cloudBusy=false; renderCloud();
}

async function cloudCopySql(){
  try{ await navigator.clipboard.writeText(ISS_BOOTSTRAP_SQL); toast('Setup SQL copied — paste it into the Supabase SQL editor','success',5000); }
  catch(e){
    const w=window.open('','_blank','width=760,height=680,scrollbars=yes');
    w.document.write('<pre style="white-space:pre-wrap;font:12px monospace;padding:12px">'+esc(ISS_BOOTSTRAP_SQL)+'</pre>');
    w.document.close();
  }
}

/* ── the tab ── */
function renderCloud(){
  if(currentTab!=='cloud') return;
  const el=document.getElementById('content'); if(!el) return;
  const c=cloudCfg(), st=_cloudStatus;
  const msgCol={ok:'var(--green)',warn:'#FBBF24',bad:'#F87171'}[_cloudMsgKind]||'var(--text3)';

  const tick=(v)=>v?'<span style="color:var(--green)">✓</span>':'<span style="color:#F87171">✗</span>';
  let checklist='<div style="color:var(--text3);font-size:12px">Press <b>Check backend</b> to read what is already there.</div>';
  if(st && !st.error){
    const t=st.tables||{}, pol=(st.policies||[]);
    const rows=[
      ['transactions table', !!t.transactions],
      ['row_id column (stops ticket 001 clashing across sites)', !!st.has_row_id],
      ['site column', !!st.has_site],
      ['unique row_id index', (st.indexes||[]).includes('transactions_row_id_uk')],
      ['ticket unique per site', (st.indexes||[]).includes('transactions_site_ticket_uk')],
      ['user_sites table', !!t.user_sites],
      ['site-matching helper', !!st.helper_exists],
      ['row level security on transactions', !!(st.rls&&st.rls.transactions)],
      ['per-site policies in place', pol.filter(p=>p.table==='transactions').length>=3],
      ['no anonymous access to tickets', (st.anon_policies_transactions||0)===0],
    ];
    checklist='<table style="width:100%;border-collapse:collapse;font-size:12.5px">'+
      rows.map(r=>'<tr><td style="padding:4px 6px;width:22px">'+tick(r[1])+'</td>'+
        '<td style="padding:4px 6px'+(r[1]?'':';color:#F87171')+'">'+r[0]+'</td></tr>').join('')+'</table>'+
      '<div style="margin-top:8px;font-size:11.5px;color:var(--text3);line-height:1.6">'+
        'Detected columns: <b style="font-family:monospace">user_sites.'+esc(st.user_sites_user_col||'?')+
        '</b> and <b style="font-family:monospace">user_sites.'+esc(st.user_sites_site_col||'?')+'</b>'+
        (st.user_sites_site_type==='uuid'?' (site stored as a uuid — the helper will join <b>sites.code</b>)':'')+
        '<br>Site codes already in the cloud: <b style="font-family:monospace">'+
        (((st.sites_in_transactions||[]).join(', '))||'none yet')+'</b>'+
        ((st.anon_policies_readings||0)>0
          ? '<br><span style="color:#FBBF24">readings still accepts anonymous writes — that is what the ESP32 '+
            'gateways use. Leave it that way until the firmware can sign in.</span>' : '')+
        '</div>';
  }

  el.innerHTML=`
  <div class="sg"><div class="sg-title">Cloud — this weighbridge</div>
    <div class="card">
      <div class="row2">
        <div class="field"><label>Supabase Project URL</label>
          <input value="${esc(c.url||'')}" placeholder="https://xxxxxxxx.supabase.co"
            onblur="cloudSet('url',this.value)"/></div>
        <div class="field"><label>Publishable key</label>
          <input value="${esc(c.key||'')}" placeholder="sb_publishable_…"
            onblur="cloudSet('key',this.value)"/>
          <div style="font-size:11px;color:var(--text3);margin-top:3px">
            The publishable key only. Never paste a <b>sb_secret_</b> or service_role key
            into a weighbridge PC — it bypasses every access rule.</div></div>
      </div>
      <div class="row2">
        <div class="field"><label>This PC signs in as</label>
          <input value="${esc(c.email||'')}" placeholder="hillside-wb1@yourdomain.co.za"
            onblur="cloudSet('email',this.value)"/></div>
        <div class="field"><label>Password</label>
          <input type="password" value="${esc(c.pass||'')}" onblur="cloudSet('pass',this.value)"/></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px">
        <button class="btn btn-navy btn-sm" onclick="cloudTest()" ${_cloudBusy?'disabled':''}>🔌 Test connection</button>
        <span style="font-size:12px;color:var(--text3)">Site Code on this PC:
          <b style="font-family:monospace;color:var(--light)">${esc(siteCode())}</b>
          — change it in Settings</span>
      </div>
      ${_cloudMsg?`<div style="margin-top:10px;padding:9px 11px;border-radius:8px;background:var(--base);
        border:1px solid var(--line-2);color:${msgCol};font-size:12.5px;white-space:pre-wrap">${esc(_cloudMsg)}</div>`:''}
    </div>
  </div>

  ${syncPanelHTML()}

  <div class="sg"><div class="sg-title">Backend setup — once per Supabase project</div>
    <div class="card">
      <div style="font-size:12.5px;color:var(--text3);line-height:1.6;margin-bottom:10px">
        <b style="color:var(--text)">Step 1.</b> Press <b>Copy setup SQL</b>, paste it into the
        Supabase SQL editor, put your own email on the line marked ADMIN, and run it. Once only —
        a publishable key is not allowed to create tables, which is exactly why it is safe to ship.<br>
        <b style="color:var(--text)">Step 2.</b> Sign in above as that admin account, then use the
        buttons here. No more SQL.
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="cloudCopySql()">📋 Copy setup SQL</button>
        <button class="btn btn-navy btn-sm" onclick="cloudCheck()" ${_cloudBusy?'disabled':''}>🔍 Check backend</button>
      </div>

      <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line-2)">
        <div style="font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">What is there now</div>
        ${checklist}
      </div>

      <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line-2)">
        <div class="row2">
          <div class="field"><label>Tickets already in the cloud belong to which site?</label>
            <input id="cl-existing" placeholder="hillside"
              value="${esc((st&&(st.sites_in_transactions||[])[0])||'')}"/>
            <div style="font-size:11px;color:var(--text3);margin-top:3px">
              Only used the first time, to tag rows uploaded before sites existed.</div></div>
          <div class="field" style="display:flex;align-items:flex-end">
            <button class="btn btn-blue btn-sm" onclick="cloudProvision()" ${_cloudBusy?'disabled':''}
              style="width:100%">🛠 Set up / repair backend</button></div>
        </div>
      </div>

      <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line-2)">
        <div style="font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Register a weighbridge PC</div>
        <div style="font-size:11.5px;color:var(--text3);margin-bottom:7px">
          Create the login in Supabase → Authentication → Users first, then link it to its site here.
          One login per PC — never share one, or you cannot revoke just the one.</div>
        <div class="row2">
          <div class="field"><label>Login email</label>
            <input id="cl-regmail" placeholder="hillside-wb1@yourdomain.co.za"/></div>
          <div class="field"><label>Site code</label>
            <input id="cl-regsite" placeholder="hillside" value="${esc(siteCode())}"/></div>
        </div>
        <button class="btn btn-navy btn-sm" onclick="cloudRegister()" ${_cloudBusy?'disabled':''}>🔗 Register site</button>
      </div>
    </div>
  </div>`;
}

