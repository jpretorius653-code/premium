// ── DATABASE ─────────────────────────────────────
let dbCat='products';
function renderDatabase(){
  if(!canAccess('database')&&!roleAtLeast('supervisor')){
    document.getElementById('content').innerHTML='<div class="empty" style="padding:60px"><div class="ico">🔒</div><p>Access denied</p></div>';return;
  }
  const cats=Object.entries(DB_CATS);
  const list=db[dbCat]||[];
  const showRate=dbCat==='products';
  document.getElementById('content').innerHTML=`
    <div class="sec-hd"><h2>Master Database</h2><div class="sub">Pre-populated dropdown lists for the weigh form</div></div>
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        ${cats.map(([k,l])=>`<button class="btn ${k===dbCat?'btn-navy':'btn-ghost'} btn-sm" onclick="dbCat='${k}';renderDatabase()">${l}</button>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <div style="flex:1"><input id="db-name" placeholder="Name" onkeydown="if(event.key==='Enter')dbAdd()"/></div>
        ${showRate?`<div style="width:130px"><input id="db-rate" type="number" step="0.01" placeholder="R/t rate"/></div>`:''}
        <button class="btn btn-navy" onclick="dbAdd()">+ Add</button>
      </div>
      <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
        ${list.length?list.map((it,i)=>`<div class="db-item">
          <div class="di-name">${esc(it.name||it)}</div>
          ${showRate&&it.rate?`<div class="di-rate">R${it.rate}/t</div>`:''}
          <button class="btn btn-ghost btn-sm" onclick="dbDel(${i})">✕</button>
        </div>`).join('')
        :'<div class="empty" style="padding:24px"><div class="ico">📋</div><p>No entries yet — add above</p></div>'}
      </div>
    </div>`;
}
function dbAdd(){
  const name=(document.getElementById('db-name')?.value||'').trim();
  if(!name){toast('Enter a name','error');return;}
  const rate=parseFloat(document.getElementById('db-rate')?.value)||null;
  if(!db[dbCat])db[dbCat]=[];
  if(db[dbCat].find(x=>(x.name||x).toLowerCase()===name.toLowerCase())){toast('Already exists','error');return;}
  db[dbCat].push(dbCat==='products'?{name,rate}:{name});
  saveDB();
  document.getElementById('db-name').value='';
  if(document.getElementById('db-rate'))document.getElementById('db-rate').value='';
  renderDatabase();
  toast(name+' added','success');
}
function dbDel(i){
  if(!confirm('Remove this entry?'))return;
  db[dbCat].splice(i,1);saveDB();renderDatabase();
}

