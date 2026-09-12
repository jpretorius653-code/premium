// ══════════════════════════════════════════════════════════════════════════
//  AUTOMATIC REPORTING  —  e-mail + WhatsApp
//
//  Shape of it:
//    schedule  →  repDue() every 60 s  →  repBuild() makes ONE payload
//              →  job on the outbox    →  repFlush() hands it to each channel
//
//  The outbox is the important part. A weighbridge sits on a colliery LTE
//  link that drops for hours; a report that fails at 06:00 must still go out
//  when the link returns, and must not go out twice. So nothing sends
//  directly — everything is queued, retried with backoff, marked per channel,
//  and survives a restart.
//
//  ONE PC SENDS. Two bridges share a folder and both see the same
//  transactions, so both would send the same report. cfg.reports.host marks
//  the single PC that does it. Set it on the office/host PC only.
// ══════════════════════════════════════════════════════════════════════════
const REP_FREQ=[
  {id:'daily',   l:'Every day',        covers:'the previous day'},
  {id:'weekly',  l:'Every week',       covers:'the previous week (Mon–Sun)'},
  {id:'monthly', l:'Every month',      covers:'the previous month'},
  {id:'shift',   l:'Every shift',      covers:'the shift that has just ended'},
];
function repCfg(){
  if(!cfg.reports) cfg.reports={};
  const r=cfg.reports;
  if(!Array.isArray(r.schedules)) r.schedules=[];
  if(!r.smtp) r.smtp={host:'',port:587,secure:false,user:'',pass:'',from:'',fromName:''};
  if(!r.wa)   r.wa={mode:'link',phoneId:'',token:'',template:'',lang:'en',to:'',webhook:''};
  if(typeof r.host!=='boolean') r.host=false;
  return r;
}
// The outbox lives outside cfg on purpose: cfg is mirrored to the share and
// to the other bridge, and a queue must never be replicated to a second
// sender. This key stays on this PC.
let repOutbox=G(K.rep,[]);
function repSaveOutbox(){ P(K.rep,repOutbox.slice(0,200)); }

// ── shift boundaries ─────────────────────────────────────────────────────
/* A colliery runs named shifts that end at fixed clock times — 06:00 and
   18:00 on a two-shift site, 06:00 / 14:00 / 22:00 on three. The earlier
   "every N hours" mode counted blocks from the epoch, which in SAST lands on
   02:00 / 10:00 / 18:00 and never matches the shift board on the wall. These
   work off the real end times instead. An older schedule with no end times
   still works: its everyHours is spread from 06:00. */
function repShiftEnds(s){
  let list=(s&&Array.isArray(s.shiftEnds)&&s.shiftEnds.length)?s.shiftEnds.slice():null;
  if(!list){
    const hrs=Math.max(1,Math.min(24,parseInt(s&&s.everyHours)||8));
    list=[]; for(let m=360;m<360+1440;m+=hrs*60) list.push(m%1440);
  }
  const mins=list.map(v=>{
    if(typeof v==='number') return ((v%1440)+1440)%1440;
    const q=String(v).split(':');
    return ((((parseInt(q[0])||0)*60+(parseInt(q[1])||0))%1440)+1440)%1440;
  });
  const uniq=[...new Set(mins)].sort((a,b)=>a-b);
  return uniq.length?uniq:[360];
}
function _minHM(m){ return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); }
function repShiftName(s,idx){
  const n=(s&&Array.isArray(s.shiftNames))?s.shiftNames[idx]:'';
  return String(n||'').trim();
}
/* The shift that has most recently ENDED at `now`: when it started, when it
   ended, and what it is called. */
function repShiftSlot(s,now){
  const ends=repShiftEnds(s);
  const mins=now.getHours()*60+now.getMinutes();
  let idx=-1;
  for(let i=ends.length-1;i>=0;i--){ if(mins>=ends[i]){ idx=i; break; } }
  const end=new Date(now);
  if(idx<0){ idx=ends.length-1; end.setDate(end.getDate()-1); }   // before today's first end
  end.setHours(Math.floor(ends[idx]/60),ends[idx]%60,0,0);
  const pIdx=(idx-1+ends.length)%ends.length;
  const start=new Date(end);
  if(pIdx>=idx) start.setDate(start.getDate()-1);                 // the shift crossed midnight
  start.setHours(Math.floor(ends[pIdx]/60),ends[pIdx]%60,0,0);
  return {idx,start,end,name:repShiftName(s,idx),ends};
}

// ── period maths ─────────────────────────────────────────────────────────
function _d0(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function _fmtDay(d){ return d.getDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]+' '+d.getFullYear(); }
/* What window does this schedule cover when it fires at `at`? */
function repRange(s,at){
  const now=new Date(at);
  if(s.freq==='shift'){
    const sl=repShiftSlot(s,now);
    let from=sl.start;
    // If a shift was missed — PC off, no link — reach back to the last send so
    // those loads still get reported rather than falling down the crack.
    const ls=s.lastSentAt?new Date(s.lastSentAt):null;
    if(ls&&isFinite(ls.getTime())&&ls<from&&ls>new Date(now.getTime()-31*864e5)) from=ls;
    const nm=sl.name?sl.name+' · ':'';
    const sameDay=from.toDateString()===sl.end.toDateString();
    return {from,to:sl.end,
      label:nm+_fmtDay(from)+' '+_hm(from)+' → '+(sameDay?'':_fmtDay(sl.end)+' ')+_hm(sl.end)};
  }
  if(s.freq==='weekly'){
    const end=_d0(now); const dow=(end.getDay()+6)%7;      // Mon=0
    end.setDate(end.getDate()-dow);                        // this Monday 00:00
    const from=new Date(end); from.setDate(from.getDate()-7);
    return {from,to:end,label:'Week '+_fmtDay(from)+' – '+_fmtDay(new Date(end-1))};
  }
  if(s.freq==='monthly'){
    const end=new Date(now.getFullYear(),now.getMonth(),1,0,0,0,0);
    const from=new Date(now.getFullYear(),now.getMonth()-1,1,0,0,0,0);
    return {from,to:end,label:from.toLocaleString('en-ZA',{month:'long'})+' '+from.getFullYear()};
  }
  const to=_d0(now), from=new Date(to); from.setDate(from.getDate()-1);
  return {from,to,label:_fmtDay(from)};
}
function _hm(d){ return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
/* The slot key is what stops a double send: one key per firing, stored on the
   schedule once it has been queued. A PC that was off all weekend catches up
   with exactly one report, not one per missed day. */
function repSlotKey(s,now){
  const [hh,mm]=String(s.time||'06:00').split(':').map(n=>parseInt(n)||0);
  if(s.freq==='shift'){
    const sl=repShiftSlot(s,now);
    return 'SH'+txYMD(sl.end.toISOString())+'#'+sl.idx;     // one key per shift end
  }
  const slot=new Date(now); slot.setHours(hh,mm,0,0);
  if(now<slot) return null;                                  // not yet today
  if(s.freq==='weekly'){
    const want=parseInt(s.dow); if(isFinite(want)&&now.getDay()!==want) return null;
    return 'W'+txYMD(slot.toISOString());
  }
  if(s.freq==='monthly'){
    const want=parseInt(s.dom)||1; if(now.getDate()!==want) return null;
    return 'M'+txYMD(slot.toISOString());
  }
  if(Array.isArray(s.days)&&s.days.length&&s.days.indexOf(now.getDay())<0) return null;
  return 'D'+txYMD(slot.toISOString());
}

// ── the numbers ──────────────────────────────────────────────────────────
function repStats(range,filt){
  const f=filt||{};
  const list=txs.filter(t=>{
    if(!t.completedAt) return false;
    if(txIsVoid(t)) return false;          // voided tickets are not reported
    const d=new Date(t.completedAt);
    if(!(d>=range.from&&d<range.to)) return false;
    if(f.product&&String(t.product||'')!==f.product) return false;
    if(f.customer&&String(t.customer||'')!==f.customer) return false;
    if(f.direction&&txDir(t)!==f.direction) return false;
    if(f.bridge&&String(t.bridgeName||'')!==f.bridge) return false;
    return true;
  }).sort((a,b)=>new Date(a.completedAt)-new Date(b.completedAt));

  const st={loads:list.length,net:0,disp:0,dispNet:0,recv:0,recvNet:0,
            byProduct:{},byCustomer:{},turn:[],onSite:pending.length,list};
  list.forEach(t=>{
    const n=Number(t.net)||0; st.net+=n;
    if(txDir(t)==='dispatch'){ st.disp++; st.dispNet+=n; } else if(txDir(t)==='receive'){ st.recv++; st.recvNet+=n; }
    const p=t.product||'—'; st.byProduct[p]=st.byProduct[p]||{loads:0,net:0};
    st.byProduct[p].loads++; st.byProduct[p].net+=n;
    const c=t.customer||'—'; st.byCustomer[c]=st.byCustomer[c]||{loads:0,net:0};
    st.byCustomer[c].loads++; st.byCustomer[c].net+=n;
    if(t.firstWeightTime&&t.secondWeightTime){
      const m=(new Date(t.secondWeightTime)-new Date(t.firstWeightTime))/60000;
      if(m>0&&m<24*60) st.turn.push(m);
    }
  });
  st.avgTurn=st.turn.length?Math.round(st.turn.reduce((a,b)=>a+b,0)/st.turn.length):null;
  return st;
}
const _t=n=>(Number(n)/1000).toFixed(3);

// ── the payload ──────────────────────────────────────────────────────────
function repBuild(s,at){
  const range=repRange(s,at||new Date());
  const st=repStats(range,s.filters||{});
  const co=(cfg.ticket&&cfg.ticket.companyName)||cfg.companyName||'Weighbridge';
  const site=cfg.siteName||cfg.siteCode||'';
  const title=(s.name||'Weighbridge Report');
  const subject=title+' — '+range.label+' · '+st.loads+' load'+(st.loads!==1?'s':'')+' · '+_t(st.net)+' t';

  const prods=Object.entries(st.byProduct).sort((a,b)=>b[1].net-a[1].net);
  const custs=Object.entries(st.byCustomer).sort((a,b)=>b[1].net-a[1].net).slice(0,8);

  // ── plain text / WhatsApp ──
  const L=[];
  L.push('*'+co+(site?' · '+site:'')+'*');
  L.push(title+' — '+range.label);
  L.push('');
  L.push('Loads: '+st.loads+'   Net: '+_t(st.net)+' t');
  L.push('Dispatch: '+st.disp+' ('+_t(st.dispNet)+' t)');
  L.push('Receive:  '+st.recv+' ('+_t(st.recvNet)+' t)');
  if(st.avgTurn!=null) L.push('Avg turnaround: '+st.avgTurn+' min');
  L.push('On site now: '+st.onSite+' truck'+(st.onSite!==1?'s':''));
  if(prods.length){
    L.push(''); L.push('*By product*');
    prods.slice(0,8).forEach(([p,v])=>L.push('· '+p+': '+v.loads+' × '+_t(v.net)+' t'));
  }
  L.push(''); L.push('Sent automatically by '+BRAND.appName);
  const text=L.join('\n');

  // ── html ──
  const A=(cfg.ticket&&cfg.ticket.accentColor)||'#00A551';
  const box=(lbl,val,sub)=>`<td style="border:1px solid #D5E2DA;border-radius:8px;padding:12px 14px;text-align:center">
      <div style="font-size:11px;color:#86968D;font-weight:700;letter-spacing:1px">${lbl}</div>
      <div style="font-size:24px;font-weight:900;color:${A};font-family:'Courier New',monospace">${val}</div>
      <div style="font-size:11px;color:#86968D">${sub||''}</div></td>`;
  const trow=(a,b,c)=>`<tr><td style="padding:7px 10px;border-bottom:1px solid #eef3f0">${esc(a)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eef3f0;text-align:right">${b}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eef3f0;text-align:right;font-weight:700">${c}</td></tr>`;
  const html=`<div style="font-family:'Segoe UI',Arial,sans-serif;color:#14201A;max-width:720px;margin:0 auto;padding:18px">
    <div style="border-bottom:3px solid ${A};padding-bottom:10px;margin-bottom:16px">
      <div style="font-size:20px;font-weight:900;color:${A}">${esc(co)}</div>
      <div style="font-size:13px;color:#697A70">${esc(title)} — ${esc(range.label)}${site?' · '+esc(site):''}</div>
    </div>
    <table style="width:100%;border-collapse:separate;border-spacing:8px;margin:0 -8px 14px"><tr>
      ${box('LOADS',st.loads,'completed')}
      ${box('NET',_t(st.net),'tonnes')}
      ${box('DISPATCH',st.disp,_t(st.dispNet)+' t')}
      ${box('RECEIVE',st.recv,_t(st.recvNet)+' t')}
    </tr></table>
    <div style="font-size:13px;color:#697A70;margin-bottom:14px">
      ${st.avgTurn!=null?'Average turnaround <b>'+st.avgTurn+' min</b> · ':''}
      <b>${st.onSite}</b> truck${st.onSite!==1?'s':''} on site at the time of sending.
    </div>
    ${prods.length?`<div style="font-size:12px;font-weight:800;letter-spacing:1px;color:#86968D;margin-bottom:6px">BY PRODUCT</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
      ${prods.map(([p,v])=>trow(p,v.loads+' loads',_t(v.net)+' t')).join('')}</table>`:''}
    ${custs.length?`<div style="font-size:12px;font-weight:800;letter-spacing:1px;color:#86968D;margin-bottom:6px">BY CUSTOMER</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
      ${custs.map(([c,v])=>trow(c,v.loads+' loads',_t(v.net)+' t')).join('')}</table>`:''}
    ${st.loads?`<div style="font-size:12px;color:#86968D">The full ticket list is attached as a CSV.</div>`:
      `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px;font-size:13px">No completed loads in this period.</div>`}
    <div style="margin-top:20px;border-top:1px solid #D5E2DA;padding-top:8px;font-size:11px;color:#86968D">
      Generated automatically by ${esc(BRAND.appName)} · ${esc(cfg.siteName||'')} ${esc(fmtDT(new Date().toISOString()))}
    </div></div>`;

  // ── csv attachment: same column order as the Records export ──
  const q=v=>{const x=String(v==null?'':v);return /[",\n\r;]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x;};
  const cf=(t,id)=>((t.custom||[]).find(c=>c&&c.id===id)||{}).value||'';
  const csvRows=[['Ticket','Customer','Product','Type','Date','Time In','Time Out','Reg',
                  'Empty','Full','Net','Batch No','Dispatch Ticket Nr','Destination','Transporter',
                  'Order','Trailer 1','Trailer 2','Seal No','Bridge','Operator','Driver','Supplier']];
  st.list.forEach(t=>{
    const w1=t.firstWeight,w2=t.secondWeight,both=(w1!=null&&w2!=null);
    csvRows.push([t.id,t.customer,t.product,txDirReport(t),fmtD(t.completedAt),
      fmtT(t.firstWeightTime),fmtT(t.secondWeightTime),t.vehicleReg,
      both?Math.min(w1,w2):'',both?Math.max(w1,w2):'',t.net,
      cf(t,'cfBatch')||t.batchNo||'',t.dispatchTicketNo||'',t.destination,t.transporter,
      (orders.find(o=>o.id===t.orderId)||{}).no||t.orderNoManual||'',
      cf(t,'cfTrl1'),cf(t,'cfTrl2'),cf(t,'cfSeal'),t.bridgeName,t.operatorName,t.driver,t.supplier]);
  });
  csvRows.push([]); csvRows.push(['TOTAL',st.loads+' loads','','','','','','','','',st.net]);
  const csv='\uFEFF'+csvRows.map(r=>r.map(q).join(',')).join('\r\n');

  return {subject,text,html,csv,
    csvName:(title.replace(/[^\w -]/g,'')||'Report')+' '+txYMD(range.from.toISOString())+'.csv',
    stats:st,range};
}

// ── the queue ────────────────────────────────────────────────────────────
function repEnqueue(s,at,manual){
  const built=repBuild(s,at);
  if(!built.stats.loads && s.skipEmpty && !manual){
    return {skipped:true};                       // nothing happened — say nothing
  }
  const job={
    id:'rj'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    schedId:s.id, name:s.name||'Report', at:nowISO(), manual:!!manual,
    subject:built.subject, text:built.text, html:built.html,
    csv:s.attachCsv!==false?built.csv:'', csvName:built.csvName,
    loads:built.stats.loads, tonnes:_t(built.stats.net),
    period:built.range.label,
    to:(s.to||'').trim(), waTo:(s.waTo||'').trim(),
    channels:{}, tries:0, nextTry:0, status:'queued'
  };
  (s.channels||['email']).forEach(c=>{ job.channels[c]={state:'queued',error:''}; });
  repOutbox.unshift(job); repSaveOutbox();
  return job;
}
function _repBackoff(tries){ return Math.min(30,Math.pow(2,tries))*60000; }   // 1,2,4…30 min
/* Flushes are serialised rather than skipped. An earlier version returned
   early if a flush was already running, which quietly swallowed a "Send now"
   pressed while a slow SMTP attempt was in flight. Chaining onto the running
   promise means every caller waits its turn and nothing is dropped. */
let _repFlushP=null;
function repFlush(){
  _repFlushP=(_repFlushP||Promise.resolve()).then(_repFlushRun,_repFlushRun);
  return _repFlushP;
}
async function _repFlushRun(){
  {
    const now=Date.now();
    for(const job of repOutbox){
      if(job.status==='sent'||job.status==='failed') continue;
      if(job.nextTry&&now<job.nextTry) continue;
      let anyLeft=false, anyTried=false;
      for(const ch of Object.keys(job.channels)){
        const c=job.channels[ch];
        if(c.state==='sent') continue;
        anyTried=true;
        const r=await repSend(ch,job);
        if(r.ok){ c.state='sent'; c.error=''; c.at=nowISO(); }
        else { c.state='error'; c.error=r.error||'failed'; anyLeft=true; }
      }
      if(anyTried){
        job.tries++;
        if(!anyLeft){
          job.status='sent'; job.sentAt=nowISO();
          const s=(repCfg().schedules||[]).find(x=>x.id===job.schedId);
          if(s){ s.lastSentAt=nowISO(); s.lastResult='sent'; saveCfg(); }
          auditLog('config','report',job.schedId,'Sent "'+job.name+'" — '+job.period+' ('+job.loads+' loads)');
        }else if(job.tries>=8){
          job.status='failed';
          auditLog('config','report',job.schedId,'GAVE UP on "'+job.name+'" after 8 tries');
        }else{
          job.status='retry'; job.nextTry=Date.now()+_repBackoff(job.tries);
        }
        repSaveOutbox();
        if(currentTab==='reports') renderReports();
      }
    }
  }
}

// ── channels ─────────────────────────────────────────────────────────────
async function repSend(ch,job){
  try{
    if(ch==='email')    return await repSendEmail(job);
    if(ch==='whatsapp') return await repSendWhatsApp(job);
    if(ch==='webhook')  return await repSendWebhook(job);
    return {ok:false,error:'unknown channel'};
  }catch(e){ return {ok:false,error:String(e.message||e)}; }
}
async function repSendEmail(job){
  const m=repCfg().smtp;
  if(!window.issDesktop||!window.issDesktop.sendMail)
    return {ok:false,error:'E-mail only works in the installed desktop app'};
  if(!m.host) return {ok:false,error:'No SMTP server configured (Reports → E-mail)'};
  const to=job.to||m.defaultTo||'';
  if(!to) return {ok:false,error:'No recipient on this schedule'};
  return await window.issDesktop.sendMail({
    host:m.host, port:parseInt(m.port)||587, secure:!!m.secure,
    user:m.user, pass:m.pass,
    from:m.from||m.user, fromName:m.fromName||((cfg.ticket&&cfg.ticket.companyName)||'Weighbridge'),
    to, subject:job.subject, text:job.text, html:job.html,
    attachments:job.csv?[{filename:job.csvName,type:'text/csv',content:job.csv}]:[]
  });
}
/* WhatsApp, three ways — see the note in the Reports tab for why.
   cloud   : Meta Cloud API. Business-initiated, so it MUST be a pre-approved
             template; free text outside the 24-hour window is rejected by Meta,
             not by us. Template params carry the numbers.
   webhook : POST the whole payload to n8n / Make / your own bridge, which then
             sends however it likes. The escape hatch, and the one that copes
             with long messages.
   link    : wa.me click-to-send. Opens WhatsApp with the report typed out; a
             person presses send. Zero setup, but not unattended. */
async function repSendWhatsApp(job){
  const w=repCfg().wa;
  const nums=(job.waTo||w.to||'').split(/[,;\s]+/).map(n=>n.replace(/[^\d]/g,'')).filter(Boolean);
  if(!nums.length) return {ok:false,error:'No WhatsApp number set'};
  if(w.mode==='link'){
    if(!window.issDesktop||!window.issDesktop.openExternal) return {ok:false,error:'Click-to-send needs the desktop app'};
    for(const n of nums) await window.issDesktop.openExternal('https://wa.me/'+n+'?text='+encodeURIComponent(job.text));
    return {ok:true,note:'opened in WhatsApp — press send'};
  }
  if(w.mode==='webhook'){
    if(!w.webhook) return {ok:false,error:'No webhook URL set'};
    const r=await window.issDesktop.httpPost({url:w.webhook,headers:w.webhookAuth?{Authorization:w.webhookAuth}:{},
      body:{channel:'whatsapp',to:nums,subject:job.subject,text:job.text,
            period:job.period,loads:job.loads,tonnes:job.tonnes,site:cfg.siteCode||''}});
    return r.ok?{ok:true}:{ok:false,error:r.error||'webhook rejected'};
  }
  // cloud
  if(!w.phoneId||!w.token) return {ok:false,error:'Phone number ID and token needed (Reports → WhatsApp)'};
  if(!w.template) return {ok:false,error:'No approved template name set'};
  const params=[job.name,job.period,String(job.loads),job.tonnes].map(t=>({type:'text',text:String(t).slice(0,300)}));
  for(const n of nums){
    const r=await window.issDesktop.httpPost({
      url:'https://graph.facebook.com/v21.0/'+encodeURIComponent(w.phoneId)+'/messages',
      headers:{Authorization:'Bearer '+w.token},
      body:{messaging_product:'whatsapp',to:n,type:'template',
            template:{name:w.template,language:{code:w.lang||'en'},
                      components:[{type:'body',parameters:params}]}}
    });
    if(!r.ok) return {ok:false,error:(r.error||'Meta rejected the message')+(r.status?' ('+r.status+')':'')};
  }
  return {ok:true};
}
async function repSendWebhook(job){
  const w=repCfg().wa;
  const url=w.reportWebhook||w.webhook;
  if(!url) return {ok:false,error:'No webhook URL set'};
  const r=await window.issDesktop.httpPost({url,headers:w.webhookAuth?{Authorization:w.webhookAuth}:{},
    body:{channel:'report',site:cfg.siteCode||'',name:job.name,period:job.period,
          subject:job.subject,text:job.text,html:job.html,
          loads:job.loads,tonnes:job.tonnes,csv:job.csv||null,csvName:job.csvName}});
  return r.ok?{ok:true}:{ok:false,error:r.error||'webhook rejected'};
}

// ── the clock ────────────────────────────────────────────────────────────
let _repTimer=null;
function repStart(){
  if(_repTimer) clearInterval(_repTimer);
  _repTimer=setInterval(repTick,60000);
  setTimeout(repTick,8000);            // let the app finish booting first
}
function repTick(){
  const c=repCfg();
  if(c.host){
    const now=new Date();
    (c.schedules||[]).forEach(s=>{
      if(!s.on) return;
      const key=repSlotKey(s,now);
      if(!key||s.lastKey===key) return;
      s.lastKey=key; saveCfg();
      repEnqueue(s,now);
    });
  }
  repFlush();                          // retries run even on a non-host PC
}

// ── UI ───────────────────────────────────────────────────────────────────
let _repView='schedules';
function renderReports(){
  const c=repCfg(), admin=roleAtLeast('manager');
  const tab=(id,l)=>`<button class="btn ${_repView===id?'btn-navy':'btn-light'} btn-sm" onclick="_repView='${id}';renderReports()">${l}</button>`;
  const queued=repOutbox.filter(j=>j.status!=='sent').length;
  document.getElementById('content').innerHTML=`
    <div class="sec-hd">
      <div><h2>Reports</h2><div class="sub">${(c.schedules||[]).filter(s=>s.on).length} active · ${c.host?'this PC sends':'sending is OFF on this PC'}${queued?' · '+queued+' waiting':''}</div></div>
      ${admin?`<button class="btn btn-navy" onclick="openRepModal()">+ New Schedule</button>`:''}
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      ${tab('schedules','📅 Schedules')}${admin?tab('email','✉ E-mail'):''}${admin?tab('wa','💬 WhatsApp'):''}${tab('outbox','📤 Outbox'+(queued?' ('+queued+')':''))}
    </div>
    ${_repView==='schedules'?_repSchedulesHTML(c,admin)
     :_repView==='email'?_repEmailHTML(c)
     :_repView==='wa'?_repWaHTML(c)
     :_repOutboxHTML()}`;
}
function _repSchedulesHTML(c,admin){
  const list=c.schedules||[];
  return `
    <div class="card" style="margin-bottom:12px;display:flex;align-items:center;gap:10px">
      <input type="checkbox" id="rep-host" ${c.host?'checked':''} ${admin?'':'disabled'} style="width:auto"
             onchange="repCfg().host=this.checked;saveCfg();renderReports()"/>
      <label for="rep-host" style="margin:0;cursor:pointer;flex:1">
        <b>This PC sends the scheduled reports</b>
        <div style="font-size:11px;color:var(--text3)">Tick this on ONE PC only. Both bridges see the same
        transactions, so if both are ticked every report goes out twice.</div>
      </label>
    </div>
    ${list.length?list.map(s=>{
      const nx=s.lastSentAt?('last sent '+fmtDT(s.lastSentAt)):'not sent yet';
      const fq=(REP_FREQ.find(f=>f.id===s.freq)||{}).l||s.freq;
      return `<div class="card" style="margin-bottom:10px;display:flex;gap:12px;align-items:flex-start">
        <div style="flex:1">
          <div style="font-weight:800;font-size:15px">${esc(s.name||'Report')}
            <span style="font-size:11px;font-weight:700;color:${s.on?'#34D399':'#94A3B8'}">${s.on?'● ON':'○ OFF'}</span></div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px">
            ${esc(fq)}${s.freq==='shift'?' ('+(s.everyHours||8)+'h)':' at '+esc(s.time||'06:00')} ·
            ${(s.channels||[]).map(x=>({email:'✉ e-mail',whatsapp:'💬 WhatsApp',webhook:'🔗 webhook'})[x]||x).join(' + ')}
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">
            ${esc([s.to,s.waTo].filter(Boolean).join(' · ')||'no recipients')} — ${esc(nx)}</div>
        </div>
        <div style="white-space:nowrap;display:flex;gap:6px">
          <button class="btn btn-light btn-sm" onclick="repSendNow('${s.id}')">Send now</button>
          ${admin?`<button class="btn btn-ghost btn-sm" onclick="openRepModal('${s.id}')">✎</button>
          <button class="btn btn-red btn-sm" onclick="repDelete('${s.id}')">✕</button>`:''}
        </div></div>`;
    }).join('')
    :'<div class="empty"><div class="ico">📧</div><p>No schedules yet — add one and the report goes out on its own</p></div>'}`;
}
function _repEmailHTML(c){
  const m=c.smtp;
  return `<div class="card">
    <div class="card-title">Outgoing mail (SMTP)</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:10px">
      Gmail and Microsoft 365 both refuse a normal password — generate an <b>app password</b> and paste that here.
      Common settings: Gmail <code>smtp.gmail.com</code> port 587, Microsoft 365 <code>smtp.office365.com</code> port 587.</div>
    <div class="row2">
      <div class="field"><label>SMTP server</label><input id="sm-host" value="${esc(m.host||'')}" placeholder="smtp.gmail.com"/></div>
      <div class="field"><label>Port</label><input id="sm-port" type="number" value="${esc(m.port||587)}"/></div>
    </div>
    <div class="field" style="display:flex;align-items:center;gap:8px">
      <input type="checkbox" id="sm-sec" ${m.secure?'checked':''} style="width:auto"/>
      <label for="sm-sec" style="margin:0;cursor:pointer">Implicit SSL (port 465). Leave OFF for 587 — it upgrades to TLS on its own.</label>
    </div>
    <div class="row2">
      <div class="field"><label>Username</label><input id="sm-user" value="${esc(m.user||'')}" placeholder="reports@yourcompany.co.za"/></div>
      <div class="field"><label>Password / app password</label><input id="sm-pass" type="password" value="${esc(m.pass||'')}"/></div>
    </div>
    <div class="row2">
      <div class="field"><label>From address</label><input id="sm-from" value="${esc(m.from||'')}" placeholder="same as username"/></div>
      <div class="field"><label>From name</label><input id="sm-fname" value="${esc(m.fromName||'')}" placeholder="${esc((cfg.ticket&&cfg.ticket.companyName)||'Weighbridge')}"/></div>
    </div>
    <div class="field"><label>Test — send a live report to</label><input id="sm-test" placeholder="you@yourcompany.co.za"/></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-navy" onclick="repSaveSmtp()">Save</button>
      <button class="btn btn-light" onclick="repTestMail()">Send test</button>
    </div>
    <div id="sm-out" style="font-size:12px;margin-top:10px"></div>
  </div>`;
}
function _repWaHTML(c){
  const w=c.wa, sel=(v)=>w.mode===v?'selected':'';
  return `<div class="card">
    <div class="card-title">WhatsApp</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:10px">
      WhatsApp does not allow a business to send free text to someone who has not
      messaged it in the last 24 hours — that is Meta's rule, not the app's. So
      there are three honest ways to do this, and they trade off differently.</div>
    <div class="field"><label>Method</label>
      <select id="wa-mode" onchange="repCfg().wa.mode=this.value;saveCfg();renderReports()">
        <option value="link" ${sel('link')}>Click-to-send — opens WhatsApp, a person presses send (no setup)</option>
        <option value="cloud" ${sel('cloud')}>Meta Cloud API — fully automatic, needs an approved template</option>
        <option value="webhook" ${sel('webhook')}>Webhook — POST to n8n / Make / your own bridge</option>
      </select></div>
    ${w.mode==='cloud'?`
      <div style="font-size:12px;color:var(--text3);margin-bottom:8px">
        Create a <b>utility</b> template with four body variables in Meta Business Manager and put its name below.
        The app fills them in order: report name, period, loads, tonnes. Utility templates are the cheap
        category; marketing is roughly six times the price for the same message.</div>
      <div class="row2">
        <div class="field"><label>Phone number ID</label><input id="wa-pid" value="${esc(w.phoneId||'')}" placeholder="1093..."/></div>
        <div class="field"><label>Template name</label><input id="wa-tpl" value="${esc(w.template||'')}" placeholder="weighbridge_daily_report"/></div>
      </div>
      <div class="row2">
        <div class="field"><label>Template language</label><input id="wa-lang" value="${esc(w.lang||'en')}" placeholder="en"/></div>
        <div class="field"><label>Permanent access token</label><input id="wa-tok" type="password" value="${esc(w.token||'')}"/></div>
      </div>`:''}
    ${w.mode==='webhook'?`
      <div class="row2">
        <div class="field"><label>Webhook URL (https)</label><input id="wa-hook" value="${esc(w.webhook||'')}" placeholder="https://n8n.yoursite.co.za/webhook/wb"/></div>
        <div class="field"><label>Authorization header (optional)</label><input id="wa-auth" value="${esc(w.webhookAuth||'')}" placeholder="Bearer ..."/></div>
      </div>`:''}
    <div class="field"><label>Default numbers — country code, no +, comma separated</label>
      <input id="wa-to" value="${esc(w.to||'')}" placeholder="27821234567, 27839876543"/></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-navy" onclick="repSaveWa()">Save</button>
      <button class="btn btn-light" onclick="repTestWa()">Send test</button>
    </div>
    <div id="wa-out" style="font-size:12px;margin-top:10px"></div>
  </div>`;
}
function _repOutboxHTML(){
  if(!repOutbox.length) return '<div class="empty"><div class="ico">📤</div><p>Nothing has been sent yet</p></div>';
  const dot=s=>({sent:'#34D399',queued:'#94A3B8',retry:'#FBBF24',failed:'#F87171'})[s]||'#94A3B8';
  return `<div class="card" style="padding:0;overflow-x:auto"><table class="tbl"><thead><tr>
    <th>Report</th><th>Period</th><th>Loads</th><th>Channels</th><th>Status</th><th></th></tr></thead><tbody>
    ${repOutbox.slice(0,60).map(j=>`<tr>
      <td><b>${esc(j.name)}</b><div style="font-size:11px;color:var(--text3)">${esc(fmtDT(j.at))}</div></td>
      <td>${esc(j.period)}</td><td>${j.loads}</td>
      <td style="font-size:11px">${Object.entries(j.channels).map(([k,v])=>
        `<div style="color:${v.state==='sent'?'#34D399':v.state==='error'?'#F87171':'#94A3B8'}">${k}: ${v.state}${v.error?' — '+esc(v.error):''}</div>`).join('')}</td>
      <td style="color:${dot(j.status)};font-weight:800">${j.status.toUpperCase()}${j.tries?' ('+j.tries+')':''}</td>
      <td style="text-align:right;white-space:nowrap">
        ${j.status!=='sent'?`<button class="btn btn-light btn-sm" onclick="repRetry('${j.id}')">Retry</button>`:''}
        <button class="btn btn-ghost btn-sm" onclick="repDropJob('${j.id}')">✕</button></td></tr>`).join('')}
    </tbody></table></div>
    <div style="margin-top:10px"><button class="btn btn-ghost btn-sm" onclick="repClearSent()">Clear sent</button></div>`;
}

// ── schedule editor ──────────────────────────────────────────────────────
let _repEditS=null;
function openRepModal(id){
  const c=repCfg();
  const s=(c.schedules||[]).find(x=>x.id===id)||
    {id:'',name:'Daily Weighbridge Report',freq:'daily',time:'06:00',everyHours:8,dow:1,dom:1,
     channels:['email'],to:'',waTo:'',attachCsv:true,skipEmpty:false,on:true,filters:{}};
  _repEditS=s;
  const ch=s.channels||[];
  const prods=[...new Set(txs.map(t=>t.product).filter(Boolean))].sort();
  openModal(id?'Edit Schedule':'New Schedule',`
    <div class="field"><label>Name — also the e-mail subject line</label>
      <input id="rs-name" value="${esc(s.name||'')}" placeholder="Daily Weighbridge Report"/></div>
    <div class="row2">
      <div class="field"><label>How often</label>
        <select id="rs-freq" onchange="_repFreqUI(this.value,_repEditS)">
          ${REP_FREQ.map(f=>`<option value="${f.id}" ${s.freq===f.id?'selected':''}>${f.l}</option>`).join('')}
        </select></div>
      <div class="field" id="rs-when"></div>
    </div>
    <div class="field"><label>Send by</label>
      <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px">
        <label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="rs-c-email" ${ch.includes('email')?'checked':''} style="width:auto"/> ✉ E-mail</label>
        <label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="rs-c-wa" ${ch.includes('whatsapp')?'checked':''} style="width:auto"/> 💬 WhatsApp</label>
        <label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="rs-c-hook" ${ch.includes('webhook')?'checked':''} style="width:auto"/> 🔗 Webhook</label>
      </div></div>
    <div class="field"><label>E-mail to — comma separated</label>
      <input id="rs-to" value="${esc(s.to||'')}" placeholder="manager@client.co.za, ops@client.co.za"/></div>
    <div class="field"><label>WhatsApp to — blank uses the default numbers</label>
      <input id="rs-wato" value="${esc(s.waTo||'')}" placeholder="27821234567"/></div>
    <div class="field"><label>Only this product (optional)</label>
      <select id="rs-prod"><option value="">All products</option>
        ${prods.map(p=>`<option value="${esc(p)}" ${(s.filters||{}).product===p?'selected':''}>${esc(p)}</option>`).join('')}
      </select></div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px;margin:8px 0">
      <label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="rs-csv" ${s.attachCsv!==false?'checked':''} style="width:auto"/> Attach the ticket CSV</label>
      <label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="rs-skip" ${s.skipEmpty?'checked':''} style="width:auto"/> Skip if there were no loads</label>
      <label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="rs-on" ${s.on!==false?'checked':''} style="width:auto"/> Active</label>
    </div>
    <button class="btn btn-navy btn-full" style="margin-top:8px" onclick="saveRepSchedule('${id||''}')">${id?'Save Changes':'Create Schedule'}</button>`);
  _repFreqUI(s.freq,s);
}
/* One row of the shift-end editor: the clock time the shift ENDS, and what
   that shift is called. */
function _repShiftRow(mins,name,i){
  return `<div class="rs-shift-row" style="display:flex;gap:6px;margin-bottom:4px">
    <input class="rs-sh-t" type="time" value="${esc(_minHM(mins))}" style="flex:0 0 118px"/>
    <input class="rs-sh-n" value="${esc(name||'')}" placeholder="name (e.g. Day, Night)" style="flex:1"/>
    <button type="button" class="btn btn-ghost btn-sm" onclick="this.parentNode.remove()">✕</button>
  </div>`;
}
function _repShiftRead(){
  const rows=[...document.querySelectorAll('.rs-shift-row')];
  const ends=[], names=[];
  rows.forEach(r=>{
    const t=r.querySelector('.rs-sh-t')?.value||'';
    if(!t) return;
    ends.push(t); names.push((r.querySelector('.rs-sh-n')?.value||'').trim());
  });
  return {ends,names};
}
function repShiftAdd(){
  const box=document.getElementById('rs-shifts'); if(!box) return;
  box.insertAdjacentHTML('beforeend',_repShiftRow(360,'',box.children.length));
}
function repShiftPreset(n){
  const box=document.getElementById('rs-shifts'); if(!box) return;
  const sets={2:[[360,'Night'],[1080,'Day']],
              3:[[360,'Night'],[840,'Morning'],[1320,'Afternoon']]};
  box.innerHTML=(sets[n]||sets[2]).map((x,i)=>_repShiftRow(x[0],x[1],i)).join('');
}
function _repFreqUI(freq,s){
  s=s||{};
  const el=document.getElementById('rs-when'); if(!el) return;
  const DOW=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  if(freq==='shift'){
    const ends=repShiftEnds(s), names=(s.shiftNames||[]);
    el.innerHTML=`<label>Shift end times</label>
      <div style="display:flex;gap:6px;margin-bottom:6px">
        <button type="button" class="btn btn-light btn-sm" onclick="repShiftPreset(2)">2 shift</button>
        <button type="button" class="btn btn-light btn-sm" onclick="repShiftPreset(3)">3 shift</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="repShiftAdd()">+ add</button>
      </div>
      <div id="rs-shifts">${ends.map((m,i)=>_repShiftRow(m,names[i]||'',i)).join('')}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">
        The report covers the shift that ends at each time — a name is optional but it reads better on WhatsApp.</div>`;
  }else if(freq==='weekly'){
    el.innerHTML=`<label>Day &amp; time</label><div style="display:flex;gap:6px">
      <select id="rs-dow" style="flex:1">${DOW.map((d,i)=>`<option value="${i}" ${Number(s.dow)===i?'selected':''}>${d}</option>`).join('')}</select>
      <input id="rs-time" type="time" value="${esc(s.time||'06:00')}" style="flex:1"/></div>`;
  }else if(freq==='monthly'){
    el.innerHTML=`<label>Day of month &amp; time</label><div style="display:flex;gap:6px">
      <input id="rs-dom" type="number" min="1" max="28" value="${esc(s.dom||1)}" style="flex:1"/>
      <input id="rs-time" type="time" value="${esc(s.time||'06:00')}" style="flex:1"/></div>`;
  }else{
    el.innerHTML=`<label>Time of day</label><input id="rs-time" type="time" value="${esc(s.time||'06:00')}"/>`;
  }
}
function saveRepSchedule(id){
  const c=repCfg();
  const V=i=>{const e=document.getElementById(i);return e?e.value:'';};
  const C=i=>{const e=document.getElementById(i);return !!(e&&e.checked);};
  const name=V('rs-name').trim(); if(!name){toast('Give the report a name','error');return;}
  const _sh=_repShiftRead();
  if(V('rs-freq')==='shift'&&!_sh.ends.length){toast('Add at least one shift end time','error');return;}
  const channels=[]; if(C('rs-c-email'))channels.push('email'); if(C('rs-c-wa'))channels.push('whatsapp'); if(C('rs-c-hook'))channels.push('webhook');
  if(!channels.length){toast('Pick at least one way to send it','error');return;}
  if(channels.includes('email')&&!V('rs-to').trim()){toast('E-mail is ticked but there is no address','error');return;}
  const rec={
    id:id||('rs'+Date.now().toString(36)),
    name, freq:V('rs-freq')||'daily', time:V('rs-time')||'06:00',
    everyHours:parseInt(V('rs-hrs'))||8, dow:parseInt(V('rs-dow'))||0, dom:parseInt(V('rs-dom'))||1,
    shiftEnds:_sh.ends, shiftNames:_sh.names,
    channels, to:V('rs-to').trim(), waTo:V('rs-wato').trim(),
    attachCsv:C('rs-csv'), skipEmpty:C('rs-skip'), on:C('rs-on'),
    filters:{product:V('rs-prod')||''}
  };
  const old=(c.schedules||[]).find(x=>x.id===rec.id);
  // Adopt the CURRENT slot as already-done, so creating a 06:00 report at 09:00
  // does not fire a surprise send for this morning.
  rec.lastKey = old?old.lastKey:repSlotKey(rec,new Date());
  rec.lastSentAt = old?old.lastSentAt:'';
  const i=(c.schedules||[]).findIndex(x=>x.id===rec.id);
  if(i>=0) c.schedules[i]=rec; else c.schedules.push(rec);
  saveCfg();
  auditLog(id?'edit':'create','report',rec.id,(id?'Updated ':'Created ')+'report schedule "'+name+'"');
  closeModal(); renderReports(); toast(id?'Schedule saved ✓':'Schedule created ✓','success');
}
function repDelete(id){
  const c=repCfg(), s=(c.schedules||[]).find(x=>x.id===id);
  if(!confirm('Delete the schedule "'+(s?s.name:id)+'"?')) return;
  c.schedules=(c.schedules||[]).filter(x=>x.id!==id); saveCfg();
  auditLog('delete','report',id,'Deleted report schedule'); renderReports();
}
async function repSendNow(id){
  const s=(repCfg().schedules||[]).find(x=>x.id===id); if(!s) return;
  const job=repEnqueue(s,new Date(),true);
  toast('Building "'+s.name+'" — '+job.loads+' loads…','info');
  await repFlush();
  const done=repOutbox.find(j=>j.id===job.id);
  if(done&&done.status==='sent') toast('✓ Sent — '+done.loads+' loads, '+done.tonnes+' t','success',6000);
  else{
    const err=done?Object.values(done.channels).map(c=>c.error).filter(Boolean)[0]:'';
    toast('Not sent: '+(err||'queued, will retry'),'error',8000);
    _repView='outbox';
  }
  renderReports();
}
function repRetry(id){
  const j=repOutbox.find(x=>x.id===id); if(!j) return;
  j.status='queued'; j.nextTry=0; j.tries=0;
  Object.values(j.channels).forEach(c=>{ if(c.state!=='sent') c.state='queued'; });
  repSaveOutbox(); repFlush().then(renderReports);
}
function repDropJob(id){ repOutbox=repOutbox.filter(j=>j.id!==id); repSaveOutbox(); renderReports(); }
function repClearSent(){ repOutbox=repOutbox.filter(j=>j.status!=='sent'); repSaveOutbox(); renderReports(); }

function repSaveSmtp(){
  const m=repCfg().smtp, V=i=>document.getElementById(i)?.value||'';
  m.host=V('sm-host').trim(); m.port=parseInt(V('sm-port'))||587;
  m.secure=!!document.getElementById('sm-sec')?.checked;
  m.user=V('sm-user').trim(); m.pass=V('sm-pass');
  m.from=V('sm-from').trim(); m.fromName=V('sm-fname').trim();
  saveCfg(); toast('Mail settings saved ✓','success');
}
async function repTestMail(){
  repSaveSmtp();
  const to=document.getElementById('sm-test')?.value.trim();
  const out=document.getElementById('sm-out');
  if(!to){ toast('Put an address in the test field','error'); return; }
  out.innerHTML='<span style="color:var(--text3)">Connecting to '+esc(repCfg().smtp.host||'—')+'…</span>';
  const demo={id:'test',name:'Test Report',freq:'daily',time:'06:00',channels:['email'],to,attachCsv:true,filters:{}};
  const job=repEnqueue(demo,new Date(),true);
  const r=await repSendEmail(job);
  job.channels.email={state:r.ok?'sent':'error',error:r.error||''};
  job.status=r.ok?'sent':'failed'; repSaveOutbox();
  out.innerHTML=r.ok
    ? '<span style="color:#34D399;font-weight:700">✓ Sent to '+esc(to)+' — check the inbox (and the junk folder).</span>'
    : '<span style="color:#F87171;font-weight:700">✕ '+esc(r.error||'failed')+'</span>';
}
function repSaveWa(){
  const w=repCfg().wa, V=i=>document.getElementById(i)?.value||'';
  w.mode=V('wa-mode')||w.mode||'link';
  if(document.getElementById('wa-pid')) w.phoneId=V('wa-pid').trim();
  if(document.getElementById('wa-tpl')) w.template=V('wa-tpl').trim();
  if(document.getElementById('wa-lang'))w.lang=V('wa-lang').trim()||'en';
  if(document.getElementById('wa-tok')) w.token=V('wa-tok').trim();
  if(document.getElementById('wa-hook'))w.webhook=V('wa-hook').trim();
  if(document.getElementById('wa-auth'))w.webhookAuth=V('wa-auth').trim();
  w.to=V('wa-to').trim();
  saveCfg(); toast('WhatsApp settings saved ✓','success');
}
async function repTestWa(){
  repSaveWa();
  const out=document.getElementById('wa-out');
  out.innerHTML='<span style="color:var(--text3)">Sending…</span>';
  const demo={id:'test',name:'Test Report',freq:'daily',time:'06:00',channels:['whatsapp'],waTo:'',attachCsv:false,filters:{}};
  const job=repEnqueue(demo,new Date(),true);
  const r=await repSendWhatsApp(job);
  job.channels.whatsapp={state:r.ok?'sent':'error',error:r.error||''};
  job.status=r.ok?'sent':'failed'; repSaveOutbox();
  out.innerHTML=r.ok
    ? '<span style="color:#34D399;font-weight:700">✓ '+esc(r.note||'Sent')+'</span>'
    : '<span style="color:#F87171;font-weight:700">✕ '+esc(r.error||'failed')+'</span>';
}

