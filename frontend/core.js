/* Vitals in the Void — core: API, helpers, boot, avatar, onboarding, app shell, charts, body figure.
   All health logic runs in the Python backend; this file only draws. */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const LVN=['Nominal','Warning','Alert'],LVI=['✓','!','!'],COLV=['#34c27a','#f5b941','#ef5b5b'],NONE='#6b7680';
let META=null,STATE=null;
const U={route:'monitor',mtab:'overview',mode:'monitor',live:false,timer:null,inject:'none',logTab:'checkin',hv:'onsd',range:{kind:'last',n:30},
 sym:new Set(),assessSel:new Set(['bone','heme','metab','lytes']),jtok:{},supView:'shelf',supQ:'',rtab:'today'};
const fmt=(x,dp=1)=>x==null||!isFinite(x)?'–':(+x).toFixed(dp);
const VM=id=>META.VARS.find(v=>v.id===id);
const ICON=p=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const CHEV=`<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>`;
const CHEVD=`<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>`;
const MICP='<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',CAMP='<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',FILEP='<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h4"/>',TYPEP='<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>';
const MIC=ICON(MICP);
const PEN=`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>`;

async function api(p,o={}){const opt={method:o.method||(o.body||o.form?'POST':'GET'),headers:o.headers||{}};
 if(o.body){opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(o.body)}if(o.form)opt.body=o.form;
 const r=await fetch(p,opt);let j=null;try{j=await r.json()}catch(e){}
 if(!r.ok)throw Object.assign(new Error((j&&j.error)||('Request failed '+r.status)),{status:r.status});return j}
function st(l,t){const c=l==null?'ln_':'l'+l;return`<span class="st ${c}"><i aria-hidden="true">${l==null?'–':l===0?'✓':'!'}</i>${esc(t??(l==null?'No data':LVN[l]))}</span>`}
function toast(m,ms=3600){const t=$('#toast');t.innerHTML=m;t.classList.add('on');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('on'),ms)}
function modal(html){$('#modalc').innerHTML=html;$('#modal').classList.add('on')}
function closeModal(){$('#modal').classList.remove('on')}
$('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};
function ask(html,ok='Confirm',danger){return new Promise(res=>{modal(`<div>${html}</div><div class="row end" style="margin-top:20px"><button class="btn" id="mno">Cancel</button><button class="btn ${danger?'danger':'p'}" id="myes">${esc(ok)}</button></div>`);
 $('#mno').onclick=()=>{closeModal();res(false)};$('#myes').onclick=()=>{closeModal();res(true)};$('#myes').focus()})}
function prompt2(title,val='',ok='Save'){return new Promise(res=>{modal(`<h3>${esc(title)}</h3><input id="pin" value="${esc(val)}" style="margin-top:14px"><div class="row end" style="margin-top:18px"><button class="btn" id="mno">Cancel</button><button class="btn p" id="myes">${esc(ok)}</button></div>`);
 const i=$('#pin');i.focus();i.select();const go=()=>{closeModal();res(i.value.trim()||null)};$('#myes').onclick=go;i.onkeydown=e=>{if(e.key==='Enter')go()};$('#mno').onclick=()=>{closeModal();res(null)}})}
const ago=x=>x==null?'':x<1/24?'just now':x<1?Math.round(x*24)+' h ago':Math.round(x)+' d ago';
const initials=n=>(n||'?').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
const cur=()=>STATE.crew.find(c=>c.id===STATE.settings.sel)||STATE.crew[0]||null;
const DAYMS=864e5;
const dayToDate=(c,d)=>new Date(new Date(c.launch).getTime()+d*DAYMS);
const dateToDay=(c,iso)=>(new Date(iso+'T12:00:00Z').getTime()-new Date(c.launch).getTime())/DAYMS;
const dstr=dt=>dt.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
async function refreshState(){STATE=await api('/api/state');return STATE}
async function setSetting(o){STATE.settings=await api('/api/settings',{body:o})}
function countUp(el,to,ms=900){if(!el||to==null)return;if(U.quiet){el.textContent=Math.round(to);return}const t0=performance.now();const f=t=>{const p=Math.min(1,(t-t0)/ms);el.textContent=Math.round(to*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(f)};requestAnimationFrame(f)}


/* ---------- screen switching (cross-fade) ---------- */
function show(id){['hero','onb'].forEach(s=>{const e=$('#'+s);const on=s===id;e.classList.toggle('hidden',!on);if(on){e.classList.remove('fadein');void e.offsetWidth;e.classList.add('fadein')}});
 const a=$('#app');a.classList.toggle('hidden',id!=='app');if(id==='app'){a.classList.remove('fadein');void a.offsetWidth;a.classList.add('fadein');const h=e=>{if(e.target===a){a.classList.remove('fadein');a.removeEventListener('animationend',h)}};a.addEventListener('animationend',h)}}
function route0(){if(STATE.settings.onboarded&&STATE.crew.length)enterApp();else welcome()}

/* ---------- onboarding ---------- */
function welcome(){show('onb');$('#onb').innerHTML=`<div class="purple" style="justify-content:center;align-items:center;text-align:center;gap:18px">
 <h1>Welcome to Vitals in the Void</h1><p style="max-width:540px;margin:0 auto;color:rgba(255,255,255,.85);font-size:17px">Personal health monitoring and assessment for every astronaut — adapted to microgravity, the Moon and Mars.</p>
 <div class="row" style="justify-content:center;margin-top:12px"><button class="wbtn solid" id="wAdd">Add Astronaut</button>${STATE.crew.length?'<button class="wbtn" id="wGo">Continue to mission</button>':''}<button class="wbtn" id="wSample">Load sample crew</button></div>
 <p class="s" style="color:#ffffff">The sample crew is simulated data for exploring the app.</p></div>`;
 $('#wAdd').onclick=()=>addAstronaut();const g=$('#wGo');if(g)g.onclick=async()=>{await setSetting({onboarded:true});enterApp()};
 $('#wSample').onclick=async e=>{e.target.disabled=true;e.target.textContent='Generating…';try{STATE=await api('/api/sample',{method:'POST'});const nw=STATE.crew.filter(c=>c.sample);await setSetting({sel:STATE.settings.sel||STATE.crew[0].id});U.lastKey=null;U.O=null;enterApp();toast(`New simulated crew: ${nw.map(c=>esc(c.name.split(' ')[0])).join(', ')}`)}catch(x){toast(esc(x.message));e.target.disabled=false}}}
let EDIT=null;
function addAstronaut(id){show('onb');EDIT=id?STATE.crew.find(c=>c.id===id):null;const e=EDIT||{name:'',role:'',age:'',sex:STATE.settings.avatar||'',weight:'',hand:'',mission:(STATE.crew[0]||{}).mission||'iss',launch:(STATE.crew[0]||{}).launch||new Date().toISOString(),A0:1};
 const ld=new Date(e.launch).toISOString().slice(0,10);
 $('#onb').innerHTML=`<div class="purple"><div class="row between"><h2 style="font-weight:300;font-size:30px">${EDIT?'Edit astronaut':'Add astronaut'}</h2><div class="row">${STATE.settings.onboarded&&STATE.crew.length?'<button class="wbtn" id="aBack">← Back to app</button>':''}<button class="wbtn" id="aNext">+ Add next</button></div></div>
 <div class="onb-grid"><form id="fA" class="form2" autocomplete="off">
  <label class="pin" style="grid-column:1/-1">Name<input name="name" required value="${esc(e.name)}" placeholder="Full name"></label>
  <label class="pin">Role<input name="role" value="${esc(e.role)}" placeholder="Commander, engineer…"></label>
  <label class="pin">Age<input name="age" inputmode="numeric" value="${esc(e.age)}"></label>
  <label class="pin">Sex<select name="sex"><option value="">–</option><option value="F" ${e.sex==='F'?'selected':''}>Female</option><option value="M" ${e.sex==='M'?'selected':''}>Male</option></select></label>
  <label class="pin">Weight (kg)<input name="weight" inputmode="decimal" value="${esc(e.weight)}"></label>
  <label class="pin">Hand circumference (cm)<input name="hand" inputmode="decimal" value="${esc(e.hand||'')}" placeholder="spacesuit glove risk"></label>
  <label class="pin">Mission<select name="mission">${Object.entries(META.MISSIONS).map(([k,m])=>`<option value="${k}" ${k===e.mission?'selected':''}>${esc(m.n)}</option>`).join('')}</select></label>
  <label class="pin">Launch date<input type="date" name="launch" value="${ld}"></label>
  <label class="pin">Adaptation prior<select name="A0">${[[0.8,'Fast (prior flights)'],[1,'Typical'],[1.25,'Slow']].map(([a,n])=>`<option value="${a}" ${+e.A0===a?'selected':''}>${n}</option>`).join('')}</select></label>
 </form>
 <div class="alist"><b style="font-family:var(--hf);font-weight:500;font-size:18px">Astronauts added</b>${STATE.crew.map(c=>{const p=Math.round(100*c.filled/c.total);return`<button class="arow" data-ed="${c.id}" aria-current="${EDIT&&EDIT.id===c.id}"><span class="ring" style="--p:${p}"><i>${p}%</i></span><span><b>${esc(c.name)}</b><br><span class="s" style="opacity:.85">${esc(c.role||'—')} · baselines ${p===100?'complete':p?'partly filled':'not added'}</span></span></button>`}).join('')||'<p class="s" style="opacity:.8">No astronauts yet.</p>'}</div></div>
 <div class="barrow"><span style="font:400 20px var(--hf)">Terrestrial baselines</span><div class="row"><button class="wbtn" id="aNow">Fill now</button><button class="wbtn" id="aLater">Fill later</button><button class="wbtn" id="aSave">Save</button><button class="wbtn solid" id="aStart">${STATE.settings.onboarded?'Open mission':'Start mission'}</button></div></div></div>`;
 const f=$('#fA');const bk=$('#aBack');if(bk)bk.onclick=()=>enterApp();
 const save=async()=>{if(!f.name.value.trim()){toast('Enter a name first');f.name.focus();return null}
  const b={id:EDIT&&EDIT.id,name:f.name.value.trim(),role:f.role.value,age:f.age.value,sex:f.sex.value,weight:f.weight.value,hand:f.hand.value,mission:f.mission.value,launch:new Date(f.launch.value+'T08:00:00Z').toISOString(),A0:+f.A0.value};
  const c=await api('/api/crew',{body:b});await refreshState();EDIT=STATE.crew.find(x=>x.id===c.id);return c};
 $('#aNext').onclick=async()=>{if(f.name.value.trim()){await save();toast('Saved')}addAstronaut()};
 $$('[data-ed]').forEach(b=>b.onclick=()=>addAstronaut(b.dataset.ed));
 $('#aSave').onclick=async()=>{if(await save()){toast('Saved');addAstronaut(EDIT.id)}};
 $('#aLater').onclick=async()=>{if(await save()){toast('Saved. Fill baselines later from Crew; population averages are used meanwhile.',5000);addAstronaut(EDIT.id)}};
 $('#aNow').onclick=async()=>{const c=await save();if(c)baselines(c.id,'onb')};
 $('#aStart').onclick=async()=>{if(f.name.value.trim())await save();if(!STATE.crew.length)return toast('Add at least one astronaut');
  const miss=STATE.crew.filter(c=>c.filled<c.total);if(!STATE.settings.onboarded&&miss.length&&!await ask(`<h3>Start the mission?</h3><p class="t2" style="margin-top:8px">${miss.map(c=>esc(c.name)).join(', ')} ${miss.length>1?'have':'has'} missing baselines. Population averages from sheet-2 are used for those values until you fill them in.</p>`,'Start mission'))return;
  await setSetting({onboarded:true,sel:(cur()||STATE.crew[0]).id});enterApp()}}
async function baselines(cid,back){const B=await api(`/api/crew/${cid}/baselines`);show('onb');let sort='cat',q='';const vals={};B.rows.forEach(r=>vals[r.v]=r.val);
 const draw=()=>{let rows=B.rows.slice();if(sort==='var')rows.sort((a,b)=>a.n.localeCompare(b.n));if(sort==='empty')rows.sort((a,b)=>(vals[a.v]!=null&&vals[a.v]!=='')-(vals[b.v]!=null&&vals[b.v]!==''));
  rows=rows.filter(r=>!q||(r.n+' '+r.cat).toLowerCase().includes(q));
  $('#btb').innerHTML=rows.map((r,i)=>`<tr class="${vals[r.v]!=null&&vals[r.v]!==''?'filled':''}"><td>${i+1}</td><td>${esc(r.cat)}</td><td>${esc(r.n)}${r.inv?' <span class="xs" style="opacity:.75">· lab</span>':''}${r.calc?' <span class="xs" style="opacity:.75">· calculated</span>':''}</td><td><input data-b="${r.v}" inputmode="decimal" value="${vals[r.v]??''}" placeholder="${fmt(r.pop,r.dp)}" aria-label="${esc(r.n)}"></td><td>${esc(r.u)}</td></tr>`).join('');
  $$('[data-b]').forEach(i=>i.oninput=()=>{vals[i.dataset.b]=i.value;i.closest('tr').classList.toggle('filled',i.value!=='');count()})};
 const count=()=>{const n=B.rows.filter(r=>vals[r.v]!=null&&vals[r.v]!=='').length;$('#bcnt').textContent=`${n} of ${B.rows.length} entered · empty fields use the population average shown in grey`};
 $('#onb').innerHTML=`<div class="purple"><h1 style="font-size:clamp(26px,3.6vw,38px)">${esc(B.name)}’s<br><span style="border-bottom:2px solid #fff;padding-bottom:4px">Terrestrial Baselines</span></h1>
 <div class="row between"><span class="s" id="bcnt" style="color:rgba(255,255,255,.85)"></span><div class="row"><input id="bq" placeholder="Search" style="width:200px;background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.25);color:#fff"><label class="pin" style="display:flex;gap:8px;align-items:center">Sort by<select id="bs" style="width:auto;margin:0"><option value="cat">Category</option><option value="var">Variable</option><option value="empty">Empty first</option></select></label></div></div>
 <div class="tscroll"><table class="btab"><thead><tr><th style="width:64px">S.No</th><th>Category</th><th>Variable / biomarker</th><th style="width:170px">Baseline value</th><th style="width:150px">Measurement unit</th></tr></thead><tbody id="btb"></tbody></table></div>
 <div class="barrow"><div class="row"><label class="wbtn" style="display:inline-flex;align-items:center">Upload values<input type="file" id="bup" accept=".csv,.xlsx,.txt" class="hidden"></label><span class="s" style="color:rgba(255,255,255,.85)">CSV/XLSX: variable id or name, value</span></div><div class="row"><button class="wbtn" id="bsave">Save</button><button class="wbtn solid" id="bnext">Next</button></div></div></div>`;
 $('#bs').onchange=e=>{sort=e.target.value;draw()};$('#bq').oninput=e=>{q=e.target.value.toLowerCase();draw()};draw();count();
 const save=async()=>{await api(`/api/crew/${cid}/baselines`,{body:{values:vals}});await refreshState()};
 $('#bsave').onclick=async()=>{await save();toast('Baselines saved')};
 $('#bnext').onclick=async()=>{await save();if(back==='app'){enterApp();location.hash='crew'}else addAstronaut(cid)};
 $('#bup').onchange=async e=>{const fd=new FormData();fd.append('file',e.target.files[0]);try{const r=await api('/api/baselines/upload',{form:fd});Object.assign(vals,r.values);draw();count();toast(`${r.count} values read. Check them, then Save.`)}catch(x){toast(esc(x.message))}}}

/* ---------- app shell ---------- */
const ICONS={drift:'<path d="M3 17l5-5 4 3 5-7"/><path d="M17 8h4v4"/><path d="M12 19l9-6" stroke-dasharray="2 2"/>',appearance:'<circle cx="13.5" cy="6.5" r="1.2"/><circle cx="17.5" cy="10.5" r="1.2"/><circle cx="8.5" cy="7.5" r="1.2"/><circle cx="6.5" cy="12.5" r="1.2"/><path d="M12 2a10 10 0 000 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A5.6 5.6 0 0022 9.8C22 5.5 17.5 2 12 2z"/>',games:'<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="15.5" cy="11.5" r="1"/><circle cx="17.5" cy="13.5" r="1"/>',monitor:'<path d="M3 12h4l3-7 4 14 3-7h4"/>',assess:'<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 3h6v3H9zM9 11h6M9 15h4"/>',eva:'<circle cx="12" cy="8" r="5"/><path d="M5 21v-3a7 7 0 0114 0v3M10 8h4"/>',
 history:'<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',routine:'<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9"/>',supplies:'<path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/>',
 rash:'<circle cx="9" cy="10" r="2"/><circle cx="15.5" cy="8" r="1.5"/><circle cx="14" cy="15" r="2.5"/><rect x="3" y="3" width="18" height="18" rx="4"/>',journal:'<path d="M6 3h11a2 2 0 012 2v16H6a2 2 0 01-2-2V5a2 2 0 012-2z"/><path d="M8 8h7M8 12h7"/>',
 crew:'<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0112 0M14 20a5 5 0 017-4"/>',reference:'<path d="M4 4h7a3 3 0 013 3v13a2 2 0 00-2-2H4zM20 4h-5a3 3 0 00-3 3"/>'};
const NAV=[['Health',[['monitor','Monitor'],['assess','Assess'],['eva','Spacewalk'],['history','History']]],['Daily life',[['routine','Routine'],['drift','Drift Vector'],['rash','Rash check'],['journal','Journal']]],['Mission',[['supplies','Supplies'],['crew','Crew'],['reference','Reference']]],['Leisure',[['games','Games']]],['Personalise',[['appearance','Appearance']]]];
const ROUTES=NAV.flatMap(s=>s[1]);
const TITLES={drift:['Drift Vector','Predictive physiological trend forecasting (24–48 h ahead) from the surroundings environment'],appearance:['Appearance','Glass, grain and wallpaper'],games:['Games','Play solo or together: Ludo, Chess, Connect Four, Memory, Sudoku'],monitor:['Monitor','Live status of every body system'],assess:['Assess','On-demand tests and a full report'],eva:['Spacewalk','Readiness, debrief and injury risk'],history:['History','Every record since day 0'],routine:['Routine','Today’s tasks, personalised exercise and meals'],
 rash:['Rash check','Photo and symptoms → likely rash and what to do'],journal:['Journal','Private and encrypted'],supplies:['Supplies','Shelves, categories and items with run-out forecasts'],crew:['Crew','Profiles, baselines and settings'],reference:['Reference','How the software reaches its conclusions']};
function enterApp(){show('app');$('#nav').innerHTML=NAV.map(([s,items])=>`<div class="navsec">${s}</div>`+items.map(([k,n])=>`<a href="#${k}" title="${n}">${ICON(ICONS[k])}<span>${n}</span></a>`).join('')).join('');
 let col=false;try{col=localStorage.getItem('votv-side')==='1'}catch(e){}$('#app').classList.toggle('collapsed',col);
 $('#sideToggle').onclick=()=>{const a=$('#app');if(innerWidth<=1100&&innerWidth>720){a.classList.toggle('expanded');return}a.classList.toggle('collapsed');try{localStorage.setItem('votv-side',a.classList.contains('collapsed')?'1':'0')}catch(e){}};
 $('#menuBtn').onclick=()=>{$('#app').classList.add('mobileopen');$('#scrim').classList.add('on')};
 $$('#nav a').forEach(a=>a.addEventListener('click',()=>{$('#app').classList.remove('mobileopen','expanded');if(!$('#drawer').classList.contains('on'))$('#scrim').classList.remove('on')}));
 $('#crewBtn').onclick=e=>{e.stopPropagation();$('#crewMenu').classList.toggle('on')};document.addEventListener('click',()=>$('#crewMenu').classList.remove('on'));
 if(!location.hash)location.hash='monitor';else render()}
function renderHeader(hdr){const c=cur();$$('#nav a').forEach(a=>a.setAttribute('aria-current',a.getAttribute('href')==='#'+U.route?'page':'false'));
 const T=TITLES[U.route];$('#ptitle').textContent=T[0];$('#psub').textContent=T[1];
 if(c){const k=STATE.crew.find(x=>x.id===c.id);$('#crewBtn').innerHTML=`<span class="av">${initials(c.name)}${k.lvl!=null?`<i style="background:${COLV[k.lvl]}"></i>`:''}</span><span class="cname b">${esc(c.name)}</span>${CHEVD}`;
  $('#crewMenu').innerHTML=STATE.crew.map(x=>`<button data-crew="${x.id}" aria-current="${x.id===c.id}"><span class="av">${initials(x.name)}${x.lvl!=null?`<i style="background:${COLV[x.lvl]}"></i>`:''}</span><span class="grow"><b>${esc(x.name)}</b><br><span class="xs t3">${esc(x.role||'')}</span></span>${x.lvl!=null?st(x.lvl):''}</button>`).join('')+`<button onclick="location.hash='crew'"><span class="av" style="background:var(--surface3)">+</span><span>Manage crew</span></button>`;
  $$('[data-crew]').forEach(b=>b.onclick=async()=>{await setSetting({sel:b.dataset.crew});render()})}
 const sp=$('#streamPill');if(sp){const on=!!(c&&(STATE.settings.streams||{})[c.id]);sp.classList.toggle('hidden',!on);sp.onclick=()=>{U.mtab='live';location.hash==='#monitor'?render():location.hash='monitor'}}
 if(typeof refreshForecastPill==='function')refreshForecastPill();
 if(hdr)$('#mpill').innerHTML=`<span class="dot" style="background:${hdr.g===1?'#7aa7ff':'var(--primary)'}"></span><span>Day <b class="num">${Math.floor(hdr.day)}</b></span><span class="tclock" title="Current time"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><b class="num" id="tclock">${clockNow()}</b></span><span class="hide-s t3">·</span><span class="hide-s">${esc(hdr.env)}</span><span class="hide-s t3">· ${hdr.g} g</span>${hdr.clock!=null?'<span class="pill">simulated clock</span>':''}`}
const clockNow=()=>new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
setInterval(()=>{const e=document.getElementById('tclock');if(e)e.textContent=clockNow()},1000);
let rendering=0;
/* render(): a new page (route or astronaut changed) starts at the top with its entry animation.
   The same page re-rendered after logging, deleting or editing is swapped in place: same scroll
   position, same open sections, no animation, so nothing jumps. */
async function render(){const r=(location.hash||'#monitor').slice(1);U.route=ROUTES.some(n=>n[0]===r)?r:'monitor';clearInterval(U.timer);
 if(!cur()&&!['crew','reference','supplies','games','appearance'].includes(U.route)){closeDrawer();welcome();return}
 const key=U.route+'|'+(STATE.settings.sel||'');const m=$('#main'),mw=$('#mainwrap');const soft=key===U.lastKey&&!!m.querySelector('.page');U.lastKey=key;
 if(!soft)closeDrawer();renderHeader();const my=++rendering;const y=mw?mw.scrollTop:0;
 const openD=soft?[...m.querySelectorAll('details')].map(d=>[detKey(d),d.open]):null;const scr=soft?[...m.querySelectorAll('.scroll,[data-keepscroll]')].map(e=>[e.id||'',e.scrollTop]):null;
 try{const v=await VIEWS[U.route]();if(my!==rendering||!v)return;
  if(soft){m.style.minHeight=m.offsetHeight+'px';m.classList.add('quiet');U.quiet=true}
  m.innerHTML=`<div class="page">${v.html}</div>`;v.bind&&v.bind();
  if(soft){const sc=[...m.querySelectorAll('.scroll,[data-keepscroll]')];scr.forEach(([id,t],k)=>{const e=(id&&document.getElementById(id))||sc[k];if(e)e.scrollTop=t});const map=new Map(openD);m.querySelectorAll('details').forEach(d=>{const k=detKey(d);if(map.has(k))d.open=map.get(k)});mw.scrollTop=y;U.quiet=false;
   requestAnimationFrame(()=>requestAnimationFrame(()=>{m.classList.remove('quiet');m.style.minHeight=''}))}
  else if(mw)mw.scrollTop=0}
 catch(e){console.error(e);m.innerHTML=`<div class="card">Could not load this view: ${esc(e.message)}</div>`}
 updateNavDots()}
const detKey=d=>(d.dataset.k||'')+'|'+((d.querySelector('summary')||{}).textContent||'').trim().slice(0,60);
async function updateNavDots(){try{const c=cur();const A=await api('/api/alerts'+(c?'?cid='+c.id:''));
 $$('#nav a').forEach(a=>{const k=a.getAttribute('href').slice(1),l=A[k];let d=a.querySelector('.ndot');if(!l){d&&d.remove();return}
  if(!d){d=document.createElement('i');d.className='ndot';a.appendChild(d)}d.style.background=COLV[l];d.title=l===2?'Alert':'Warning';a.dataset.lvl=l})}catch(e){}}
setInterval(()=>{if(!document.hidden&&!$('#app').classList.contains('hidden'))updateNavDots()},20000);
/* wearable battery warnings (20 %, 15 %, 10 %, 5 %, empty) reach every screen, whichever page is open */
let WEV=null;
async function pollWearEvents(){try{const r=await api('/api/wearable-events?since='+(WEV??0));if(WEV===null){WEV=r.last;return}
 for(const e of r.events){WEV=Math.max(WEV,e.id);if(e.kind==='charged'&&cur()&&e.cid!==cur().id)continue;
  toast(`${e.lvl>=2?'⚠️ ':e.lvl===1?'🔋 ':'✓ '}${esc(e.msg)}`,e.lvl>=2?7000:5200);
  if(e.lvl>=1&&window.Notification&&Notification.permission==='granted'){try{new Notification('Vitals in the Void · Wearable battery',{body:e.msg})}catch(x){}}
  if(e.kind==='dead'){await refreshState();renderHeader();if(U.route==='monitor'&&U.mtab==='live'&&typeof monLive==='function')monLive()}}
 if(r.events.length){updateNavDots();if(typeof wearRefresh==='function'&&U.route==='monitor'&&U.mtab==='live')wearRefresh(false)}}catch(e){}}
setInterval(()=>{if(!document.hidden&&!$('#app').classList.contains('hidden'))pollWearEvents()},4000);
window.addEventListener('hashchange',()=>{if(!$('#app').classList.contains('hidden'))render()});
addEventListener('resize',()=>{if(innerWidth>720)$('#app').classList.remove('mobileopen')});

/* ---------- drawer ---------- */
function openDrawer(title,html,sub=''){const d=$('#drawer');d.innerHTML=`<div class="dhead"><div><h2>${title}</h2>${sub?`<p class="t3 s" style="margin-top:4px">${sub}</p>`:''}</div><button class="iconbtn" id="dClose" aria-label="Close">${ICON('<path d="M6 6l12 12M18 6L6 18"/>')}</button></div><div class="stack gap16">${html}</div>`;
 d.classList.add('on');$('#scrim').classList.add('on');$('#dClose').onclick=closeDrawer;d.setAttribute('tabindex','-1');d.focus();d.scrollTop=0}
function closeDrawer(){$('#drawer').classList.remove('on');$('#scrim').classList.remove('on');$('#app').classList.remove('mobileopen')}
$('#scrim').onclick=closeDrawer;document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDrawer();closeModal()}});

/* ---------- countermeasure block ---------- */
function guideHTML(g,title='What to do now'){if(!g)return'';return`<div class="guide"><h4>${esc(title)}</h4><ul class="acts">${g.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>
 ${g.supplies&&g.supplies.length?`<div style="margin-top:10px"><div class="xs t3 b" style="margin-bottom:4px">SUPPLIES ON BOARD</div>${g.supplies.map(s=>`<div class="suprow"><span>${esc(s.name)}</span><span class="row" style="gap:8px">${s.known?`<span class="t3 num xs">${fmt(s.qty,0)} ${esc(s.unit||'')}</span>${st(s.st==null?0:s.st,s.st===2?'Critical':s.st===1?'Low':'Available')}`:st(null,'Not stocked')}</span></div>${s.advice?`<div class="xs t3" style="padding-bottom:4px">${esc(s.advice)}</div>`:''}`).join('')}</div>`:''}
 ${g.refs&&g.refs.length?`<details class="xs t3" style="margin-top:8px"><summary style="cursor:pointer">Sources</summary>${g.refs.map(r=>`<div style="margin-top:4px">${esc(r)}</div>`).join('')}</details>`:''}</div>`}

/* ---------- chart ---------- */
function chart(box,D){const svg=box.querySelector('svg'),tip=box.querySelector('.tip');
 const draw=()=>{const W=svg.clientWidth,H=svg.clientHeight;if(!W||!H)return;const sm=W<520,pad={l:sm?40:56,r:14,t:24,b:30};const from=D.from,to=D.to,pts=D.pts.filter(p=>p.day>=from&&p.day<=to),band=D.band.filter(b=>b[0]>=from-1&&b[0]<=to+1);
  if(!band.length){svg.innerHTML='';return}
  let ys=pts.map(p=>p.val).concat(band.flatMap(b=>[b[1]-2*b[2],b[1]+2*b[2]]));let lo=Math.min(...ys),hi=Math.max(...ys);const L=D.lims,rg=(hi-lo)||1;
  for(const k of['wl','wh','cl','ch'])if(L[k]!=null&&L[k]>lo-0.6*rg&&L[k]<hi+0.6*rg){lo=Math.min(lo,L[k]);hi=Math.max(hi,L[k])}const m=(hi-lo)*.08||1;lo-=m;hi+=m;
  const X=d=>pad.l+(d-from)/((to-from)||1)*(W-pad.l-pad.r),Y=v=>H-pad.b-(v-lo)/(hi-lo)*(H-pad.t-pad.b);let s='<defs><linearGradient id="bandg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#79dce8" stop-opacity=".28"/><stop offset="1" stop-color="#79dce8" stop-opacity=".1"/></linearGradient></defs>';
  for(const p of D.phases){if(p.s>from&&p.s<to)s+=`<line x1="${X(p.s)}" x2="${X(p.s)}" y1="${pad.t}" y2="${H-pad.b}" stroke="rgba(255,255,255,.18)" stroke-width="2"/>`;const a=Math.max(p.s,from),b=Math.min(p.end,to);if(b-a>(to-from)*.14)s+=`<text x="${X(a)+5}" y="${pad.t-9}" font-size="11.5" fill="rgba(255,255,255,.5)">${esc(p.n)}</text>`}
  if(30>from&&30<to)s+=`<line x1="${X(30)}" x2="${X(30)}" y1="${pad.t}" y2="${H-pad.b}" stroke="rgba(255,255,255,.5)" stroke-dasharray="2 4"/><text x="${X(30)+5}" y="${H-pad.b-7}" font-size="11.5" fill="rgba(255,255,255,.5)">30 d</text>`;
  for(let i=0;i<=5;i++){const v=lo+(hi-lo)*i/5,y=Y(v);s+=`<line x1="${pad.l}" x2="${W-pad.r}" y1="${y}" y2="${y}" stroke="rgba(255,255,255,.06)"/><text x="${pad.l-8}" y="${y+4}" font-size="11.5" text-anchor="end" fill="rgba(255,255,255,.5)">${fmt(v,D.dp>1?2:D.dp)}</text>`}
  const xt=sm?3:6;for(let i=0;i<=xt;i++){const d=from+(to-from)*i/xt;s+=`<text x="${X(d)}" y="${H-9}" font-size="11.5" text-anchor="${i===0?'start':i===xt?'end':'middle'}" fill="rgba(255,255,255,.5)">${sm?'D':'Day '}${Math.round(d)}</text>`}
  const P=f=>band.map(b=>`${X(b[0])},${Y(f(b))}`);
  s+=`<polygon points="${P(b=>b[1]+2*b[2]).concat(P(b=>b[1]-2*b[2]).reverse()).join(' ')}" fill="url(#bandg)" opacity=".7"/><polygon points="${P(b=>b[1]+b[2]).concat(P(b=>b[1]-b[2]).reverse()).join(' ')}" fill="#79dce8" opacity=".16"/>`;
  s+=`<polyline points="${P(b=>b[1]).join(' ')}" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="2" stroke-dasharray="6 5"/>`;
  for(const[k,c]of[['wl','#f5b941'],['wh','#f5b941'],['cl','#ef5b5b'],['ch','#ef5b5b']])if(L[k]!=null&&L[k]>=lo&&L[k]<=hi)s+=`<line x1="${pad.l}" x2="${W-pad.r}" y1="${Y(L[k])}" y2="${Y(L[k])}" stroke="${c}" stroke-width="1.5" stroke-dasharray="4 4" opacity=".85"/>`;
  if(pts.length>1)s+=`<polyline points="${pts.map(p=>`${X(p.day)},${Y(p.val)}`).join(' ')}" fill="none" stroke="#fff" stroke-width="1.4" opacity=".4"/>`;
  const r0=pts.length>220?2.6:4.2;s+=pts.map(p=>`<circle cx="${X(p.day)}" cy="${Y(p.val)}" r="${p.lvl?r0+1.6:r0}" fill="${COLV[p.lvl]}" stroke="#0b0f12" stroke-width="1.5"/>`).join('');
  if(D.today>=from&&D.today<=to)s+=`<line x1="${X(D.today)}" x2="${X(D.today)}" y1="${pad.t}" y2="${H-pad.b}" stroke="#fff" stroke-width="1" opacity=".7"/><text x="${X(D.today)-5}" y="${pad.t+13}" font-size="11.5" text-anchor="end" fill="#fff">today</text>`;
  if(!pts.length)s+=`<text x="${W/2}" y="${H/2}" text-anchor="middle" fill="rgba(255,255,255,.5)" font-size="14">No readings in this range</text>`;
  svg.innerHTML=s;
  svg.onmousemove=ev=>{const bx=svg.getBoundingClientRect(),mx=ev.clientX-bx.left;let best=null,bd=1e9;for(const p of pts){const dd=Math.abs(X(p.day)-mx);if(dd<bd){bd=dd;best=p}}
   if(!best||bd>30){tip.style.display='none';return}tip.innerHTML=`<b>${fmt(best.val,D.dp)} ${esc(D.u)}</b> · expected ${fmt(best.E,D.dp)}<br>Day ${fmt(best.day,1)} · ${esc(best.src)}<br>${LVN[best.lvl]}${best.lvl?' · '+esc(best.note||best.why):''}`;
   tip.style.display='block';tip.style.left=Math.min(W-230,Math.max(0,X(best.day)-100))+'px';tip.style.top=Math.max(0,Y(best.val)-86)+'px'};svg.onmouseleave=()=>tip.style.display='none'};
 if(box._ro)box._ro.disconnect();box._ro=new ResizeObserver(draw);box._ro.observe(svg);draw()}
const chartBox=h=>`<div class="fig" style="min-height:${h}px"><svg role="img"></svg><div class="tip"></div></div>`;
const chartLegend=()=>`<div class="clegend"><span><i class="sw" style="background:#79dce8;opacity:.5"></i>Your expected range</span><span><i class="sw" style="border-top:2px dashed rgba(255,255,255,.85);height:0"></i>Expected value</span><span><i class="sw" style="border-top:2px dashed #f5b941;height:0"></i>Clinical limit</span><span><i class="sw" style="border-top:2px dashed #ef5b5b;height:0"></i>Safety limit</span><span><span class="dot" style="background:#34c27a"></span><span class="dot" style="background:#f5b941"></span><span class="dot" style="background:#ef5b5b"></span>readings by status</span></div>`;

/* ---------- anatomical body figure ---------- */
const BODY_TIP={head:['Brain','Inside the skull. Runs sleep, mood and reaction time.'],eyes:['Eyes','Front of the head. The optic nerve leaves the back of each eye — watch for blur.'],
 neck:['Neck: jugular veins & thyroid','Jugular veins run down both sides of the neck; the thyroid sits below the Adam’s apple.'],lungs:['Lungs','Fill most of the chest behind the ribs; take in oxygen.'],
 heart:['Heart','Centre-left of the chest, about the size of a fist.'],blood:['Blood & vessels','Arteries carry blood from the heart down the arms and legs.'],
 abdomen:['Gut & metabolism','Liver (your right), stomach (your left) and intestines below the ribs.'],kidney:['Kidneys','Back of the abdomen, either side of the spine at the lowest ribs.'],
 immune:['Immune system','Spleen (upper left abdomen) and lymph nodes in the neck, armpits and groin.'],bones:['Skeleton','Pelvis and thigh bones (femurs) carry your weight; they lose density first.'],
 muscle:['Muscles','Calf and thigh muscles keep you upright in gravity; calves shrink fastest in space.'],skin:['Skin','The inner forearm is the reference spot for skin photos.'],
 limbs:['Hands & shoulders','Do most of the work inside the spacesuit during a spacewalk.'],whole:['Whole body: radiation','Radiation passes through all tissue. Tap the dashed outline.']};
function crPath(p){let d=`M${p[0][0]},${p[0][1]}`;const n=p.length;for(let i=0;i<n;i++){const p0=p[(i-1+n)%n],p1=p[i],p2=p[(i+1)%n],p3=p[(i+2)%n];
 d+=`C${(p1[0]+(p2[0]-p0[0])/6).toFixed(1)},${(p1[1]+(p2[1]-p0[1])/6).toFixed(1)} ${(p2[0]-(p3[0]-p1[0])/6).toFixed(1)},${(p2[1]-(p3[1]-p1[1])/6).toFixed(1)} ${p2[0]},${p2[1]}`}return d+'Z'}
function silhouette(F){
 const L=[[200,18],[183,21],[170,31],[162,47],[160,65],[161,82],[163,96],[157,99],[158,111],[166,114],[171,127],[180,139],[189,146],[186,152],[185,165],
  [170,173],[148,179],[128,186],[115,197],[109,212],[105,234],[102,262],[99,292],[96,318],[91,348],[87,382],[84,410],[80,424],[76,442],[76,460],[80,474],[87,482],[94,476],[96,462],[99,446],[102,421],
  [107,394],[111,360],[114,328],[118,298],[123,268],[132,240],[136,264],[139,292],[141,320],[139,346],[136,372],[134,398],[133,424],[134,462],[137,502],[140,540],[141,562],[139,592],[138,624],[141,664],[146,702],
  [143,722],[139,740],[146,752],[163,757],[183,756],[187,747],[184,730],[182,702],[181,664],[179,624],[180,588],[183,556],[186,520],[190,482],[194,452],[199,432]];
 const P=L.map(([x,y])=>{if(!F)return[x,y];let dx=0;if(y>28&&y<130)dx+=2;if(y>=165&&y<=216&&x<180)dx+=8;if(x<132&&y>216&&y<490)dx+=7;if(y>276&&y<352&&x>128&&x<150)dx+=7;if(y>=368&&y<446&&x<142)dx-=7;if(y>=446&&y<530&&x<142)dx-=4;return[x+dx,y]});
 const R=P.slice().reverse().map(([x,y])=>[400-x,y]).filter(([x])=>x!==200);return crPath(P.concat(R))}
function bodySVG(regions,sex){const F=sex==='F';const col=r=>regions[r]==null?NONE:COLV[regions[r]];
 const g=(r,inner)=>`<g class="reg" data-reg="${r}" tabindex="0" role="button" style="color:${col(r)}" aria-label="${esc(BODY_TIP[r][0])}: ${regions[r]==null?'no data':LVN[regions[r]]}">${inner}</g>`;
 const fill=(r,op=.62)=>`fill="${col(r)}" fill-opacity="${op}" stroke="${col(r)}" stroke-width="1.4"`;
 const mir=(d)=>d; const sh=F?8:0;
 const sil=silhouette(F);
 return`<svg viewBox="0 0 400 790" aria-label="Body status figure"><defs><linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,255,255,.13)"/><stop offset="1" stop-color="rgba(255,255,255,.04)"/></linearGradient>
 <radialGradient id="sheen" cx=".5" cy=".3" r=".7"><stop offset="0" stop-color="#ffffff" stop-opacity=".08"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs>
 ${g('whole',`<path class="hit" d="${sil}" fill="none" stroke="#000" stroke-opacity="0" stroke-width="22" transform="translate(200 395) scale(1.045) translate(-200 -395)"/><path d="${sil}" fill="none" stroke="${col('whole')}" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round" transform="translate(200 395) scale(1.045) translate(-200 -395)"/>`)}
 <g pointer-events="none"><path d="${sil}" fill="url(#skin)" stroke="rgba(255,255,255,.38)" stroke-width="1.6"/><path d="${sil}" fill="url(#sheen)"/>
 ${F?'<path d="M162 60C150 110 156 150 170 170M238 60C250 110 244 150 230 170" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="5" stroke-linecap="round"/>':''}
 <g fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1.3" stroke-linecap="round"><path d="M200 175V395"/><path d="M${152+sh/2} 215Q176 236 198 222M${248-sh/2} 215Q224 236 202 222"/><path d="M180 300h40M182 330h36M184 360h32"/><path d="M150 556q10 8 20 0M230 556q10 8 20 0"/><path d="M${118+sh} 300q-6 30-6 40M${282-sh} 300q6 30 6 40"/></g></g>
 ${g('head',`<path d="M172 54c0-20 12-32 28-32s28 12 28 32c0 10-6 17-14 19-4-4-9-5-14-5s-10 1-14 5c-8-2-14-9-14-19z" ${fill('head',.55)}/><path d="M180 42q8-6 14 2M206 40q8 0 12 8M184 56q6-4 12 2M204 56q8-4 12 2" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.2"/>`)}
 ${g('eyes',`<rect x="170" y="74" width="60" height="22" fill="transparent"/><path d="M176 85q9-8 18 0q-9 7-18 0z" ${fill('eyes',.85)}/><path d="M206 85q9-8 18 0q-9 7-18 0z" ${fill('eyes',.85)}/>`)}
 ${g('neck',`<path d="M190 118V170M210 118V170" stroke="${col('neck')}" stroke-width="3.2" stroke-linecap="round" opacity=".9"/><path d="M188 158c0-6 4-9 8-7l4 3 4-3c4-2 8 1 8 7s-4 10-8 8l-4-2-4 2c-4 2-8-2-8-8z" ${fill('neck',.75)}/>`)}
 ${g('lungs',`<path d="M193 206c-16-8-38 4-42 32-4 30-1 58 8 72 12 8 26 4 34-6z" ${fill('lungs',.42)}/><path d="M207 206c16-8 38 4 42 32 4 30 1 58-8 72-10 6-20 4-26-2-2-14-6-22-8-30z" ${fill('lungs',.42)}/><path d="M172 238q8 10 16 8M226 236q-8 12-14 10" fill="none" stroke="#fff" stroke-opacity=".25"/>`)}
 ${g('heart',`<path d="M214 248c-6-12-24-8-22 6 1 10 12 20 22 28 12-6 24-16 24-28 0-14-18-16-24-6z" ${fill('heart',.85)} transform="rotate(-14 214 262)"/>`)}
 ${g('blood',`<path class="hit" d="M200 284V404M200 404l-28 40-8 104-8 90M200 404l28 40 8 104 8 90M188 224l-60 18-14 80-14 82-10 40M212 224l60 18 14 80 14 82 10 40" fill="none" stroke="#000" stroke-opacity="0" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M200 284V404M200 404l-28 40-8 104-8 90M200 404l28 40 8 104 8 90M188 224l-60 18-14 80-14 82-10 40M212 224l60 18 14 80 14 82 10 40" fill="none" stroke="${col('blood')}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>`)}
 ${g('abdomen',`<path d="M150 318c22-10 52-8 64 4-6 18-30 28-52 24-10-4-14-16-12-28z" ${fill('abdomen',.5)}/><path d="M218 322c16-8 32 0 32 16 0 16-14 24-26 18-6-6-4-16-6-34z" ${fill('abdomen',.5)}/><path d="M172 360c0-6 6-8 28-8s28 2 28 8v32c0 8-10 12-28 12s-28-4-28-12z" ${fill('abdomen',.38)}/><path d="M180 368h40M180 378c10 6 30-6 40 0M180 390h40" fill="none" stroke="#fff" stroke-opacity=".22"/>`)}
 ${g('kidney',`<path d="M152 352c-8 0-12 8-12 16s4 18 12 18c6 0 7-6 5-10-2-4-2-8 0-12 3-6 1-12-5-12z" ${fill('kidney',.8)}/><path d="M248 352c8 0 12 8 12 16s-4 18-12 18c-6 0-7-6-5-10 2-4 2-8 0-12-3-6-1-12 5-12z" ${fill('kidney',.8)}/>`)}
 ${g('immune',`<ellipse cx="256" cy="330" rx="9" ry="13" ${fill('immune',.75)} transform="rotate(20 256 330)"/>${[[183,150],[217,150],[139+sh/2,244],[261-sh/2,244],[178,424],[222,424]].map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="4.5" ${fill('immune',.95)}/>`).join('')}`)}
 ${g('bones',`<path d="M${152-(F?6:0)} 402c14 8 34 12 48 12s34-4 48-12l-6 30c-12 12-28 16-42 16s-30-4-42-16z" ${fill('bones',.55)}/><path d="M174 444L160 544M226 444L240 544" stroke="${col('bones')}" stroke-width="8" stroke-linecap="round" opacity=".75"/><circle cx="159" cy="552" r="7" ${fill('bones',.8)}/><circle cx="241" cy="552" r="7" ${fill('bones',.8)}/>`)}
 ${g('muscle',`<path d="M148 584c-6 18-4 48 6 64 8 4 14-2 16-12 4-20 0-44-8-56-6-4-12-2-14 4z" ${fill('muscle',.6)}/><path d="M252 584c6 18 4 48-6 64-8 4-14-2-16-12-4-20 0-44 8-56 6-4 12-2 14 4z" ${fill('muscle',.6)}/><path d="M${144+sh/2} 462c-4 22-2 50 6 66 10-2 16-30 14-56-2-10-14-18-20-10zM${256-sh/2} 462c4 22 2 50-6 66-10-2-16-30-14-56 2-10 14-18 20-10z" ${fill('muscle',.4)}/>`)}
 ${g('skin',`<ellipse cx="${304-sh}" cy="372" rx="9" ry="27" transform="rotate(-9 ${304-sh} 372)" ${fill('skin',.6)}/>`)}
 ${g('limbs',`<ellipse cx="${86+sh}" cy="455" rx="11" ry="22" ${fill('limbs',.65)}/><ellipse cx="${314-sh}" cy="455" rx="11" ry="22" ${fill('limbs',.65)}/><circle cx="${121+sh}" cy="203" r="13" ${fill('limbs',.55)}/><circle cx="${279-sh}" cy="203" r="13" ${fill('limbs',.55)}/>`)}
 </svg>`}
function bindBody(stage,onPick,regions){const tip=stage.querySelector('.btip');
 const showTip=(r,x,y)=>{const t=BODY_TIP[r];tip.innerHTML=`<b>${esc(t[0])}</b><div class="xs t2" style="margin-bottom:8px">${esc(t[1])}</div>${st(regions[r])}`;tip.classList.add('on');
  const W=stage.clientWidth;tip.style.left=Math.min(W-258,Math.max(0,x+16))+'px';tip.style.top=Math.max(0,y-10)+'px'};
 stage.querySelectorAll('.reg').forEach(g=>{const r=g.dataset.reg;
  g.addEventListener('mousemove',e=>{const b=stage.getBoundingClientRect();showTip(r,e.clientX-b.left,e.clientY-b.top)});
  g.addEventListener('mouseleave',()=>tip.classList.remove('on'));
  g.addEventListener('focus',()=>{const b=stage.getBoundingClientRect(),gb=g.getBoundingClientRect();showTip(r,gb.right-b.left,gb.top-b.top)});g.addEventListener('blur',()=>tip.classList.remove('on'));
  g.onclick=()=>onPick(r);g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPick(r)}}})}

/* ---------- four ways to enter data: type, speak, photo, file ---------- */
function imBar(id,hints={}){const M=[['type','Type',TYPEP],['speak','Speak',MICP],['photo','Photo',CAMP],['file','File',FILEP]];
 return`<div class="imwrap" id="${id}"><div class="imbar" role="group" aria-label="How do you want to enter this?">${M.map(([k,n,ic])=>`<button type="button" data-im="${k}" aria-pressed="${k==='type'}">${ICON(ic)}<span>${n}</span></button>`).join('')}</div>
 ${hints.typeHTML?`<div class="impane" data-pane="type">${hints.typeHTML}</div>`:''}
 <div class="impane hidden" data-pane="speak"><p class="s t2">${hints.speak||'Say or type the values, e.g. “heart rate 72, systolic 118, hemoglobin 14.2”.'}</p><div class="qnote"><textarea rows="3" placeholder="Press the microphone and speak, or type here"></textarea><button class="micbtn" type="button" aria-label="Dictate">${MIC}</button></div><div><button class="btn p sm" data-go>Read it</button></div></div>
 <div class="impane hidden" data-pane="photo"><p class="s t2">${hints.photo||'Photograph a printout, a device screen or a handwritten sheet; the numbers are read with OCR.'}</p><label class="btn sm">${ICON(CAMP)}Take or choose photo<input type="file" accept="image/*" capture="environment" class="hidden"></label></div>
 <div class="impane hidden" data-pane="file"><p class="s t2">${hints.file||'Upload a lab report or device export: CSV, Excel, JSON, PDF, Word or text.'}</p><label class="btn sm">${ICON(FILEP)}Choose file<input type="file" accept="${hints.accept||'.csv,.xlsx,.json,.pdf,.docx,.txt'}" class="hidden"></label></div>
 <div class="imout s"></div></div>`}
function bindIM(id,h){const W=document.getElementById(id);if(!W)return;const out=W.querySelector('.imout');
 W.querySelectorAll('[data-im]').forEach(b=>b.onclick=()=>{const k=b.dataset.im;W.querySelectorAll('[data-im]').forEach(x=>x.setAttribute('aria-pressed',x===b));W.querySelectorAll('.impane').forEach(p=>p.classList.toggle('hidden',p.dataset.pane!==k));out.innerHTML='';if(k==='type')h.type&&h.type()});
 const ta=W.querySelector('[data-pane=speak] textarea');attachMic(W.querySelector('[data-pane=speak] .micbtn'),ta);
 W.querySelector('[data-go]').onclick=async()=>{if(!ta.value.trim())return toast('Say or type something first');out.textContent='Reading…';try{await h.speak(ta.value,out)}catch(e){out.textContent=e.message}};
 W.querySelectorAll('[data-pane=photo] input,[data-pane=file] input').forEach(inp=>inp.onchange=async e=>{const f=e.target.files[0];if(!f)return;out.textContent='Reading '+f.name+'…';try{await h.upload(f,out,inp.closest('.impane').dataset.pane)}catch(er){out.textContent=er.message}e.target.value=''})}
/* default handlers: extract values (server) and fill a form's matching fields */
function valueIM(scope,fill){return{speak:async(text,out)=>{const r=await api('/api/extract',{body:{text,scope}});delete r.text;fill(r,out)},
 upload:async(file,out)=>{const fd=new FormData();fd.append('file',file);fd.append('scope',JSON.stringify(scope||null));fill(await api('/api/extract',{form:fd}),out)}}}
function fillForm(form,r,out,extra){let n=0;const miss=[];(r.vals||[]).forEach(v=>{const el=form.querySelector(`[name="${v.v}"]`);if(el){el.value=v.value;const l=el.closest('label');if(l){l.classList.remove('hl');void l.offsetWidth;l.classList.add('hl')}n++}else miss.push(v)});
 if(extra&&miss.length)n+=extra(miss)||0;
 out.innerHTML=`${n?`<span style="color:var(--ok)">✓</span> Filled ${n} field${n>1?'s':''}. Check them, then save.`:esc(r.note||'No matching values found.')}${miss.length&&!extra?` <span class="t3">Not part of this form: ${miss.map(m=>esc(m.n)).join(', ')}.</span>`:''}${r.text?`<details style="margin-top:6px"><summary class="xs t3" style="cursor:pointer">Text that was read</summary><pre class="xs t3" style="white-space:pre-wrap;max-height:160px;overflow:auto">${esc(r.text.slice(0,2000))}</pre></details>`:''}`;
 const f1=form.querySelector('label.hl input');if(f1)f1.scrollIntoView({block:'nearest',behavior:'smooth'})}

/* ---------- dropdowns that never leave the screen ----------
   Every <select> is shown as a button + list that opens downward or upward, whichever has more room,
   and is limited to the visible space (scrolls inside). The real <select> stays hidden in the page,
   so forms, .value and onchange work exactly as before. */
const XCHEV='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>';
const SELV=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');
function enhanceSelect(sel){if(sel._x||sel.multiple||sel.dataset.native!=null)return;sel._x=1;sel.classList.add('xsel');
 const b=document.createElement('button');b.type='button';b.className='xbtn';b.setAttribute('aria-haspopup','listbox');b.setAttribute('aria-expanded','false');
 if(sel.id)b.id='x_'+sel.id;b.style.cssText=sel.style.cssText;b.style.display='';sel.after(b);
 const label=()=>{const o=sel.options[sel.selectedIndex];b.innerHTML=`<span>${esc(o?o.text:'Choose…')}</span>${XCHEV}`};label();
 Object.defineProperty(sel,'value',{get(){return SELV.get.call(this)},set(v){SELV.set.call(this,v);label()},configurable:true});
 sel.addEventListener('change',label);b.onclick=e=>{e.stopPropagation();xOpen(sel,b,label)}}
let XP=null;function xClose(){if(!XP)return;XP.pop.remove();XP.btn.setAttribute('aria-expanded','false');XP=null}
function xOpen(sel,btn,label){if(XP&&XP.sel===sel){xClose();return}xClose();btn.setAttribute('aria-expanded','true');
 const pop=document.createElement('div');pop.className='xpop';pop.setAttribute('role','listbox');const many=sel.options.length>10;
 pop.innerHTML=`${many?'<input placeholder="Search…" aria-label="Search options">':''}<div class="xlist"></div>`;document.body.appendChild(pop);XP={pop,btn,sel};
 const list=pop.querySelector('.xlist'),inp=pop.querySelector('input');let act=-1;
 const draw=q=>{q=(q||'').toLowerCase();let h='',n=0;for(const ch of sel.children){const opts=ch.tagName==='OPTGROUP'?[...ch.children]:[ch];const f=opts.filter(o=>!q||o.text.toLowerCase().includes(q));if(!f.length)continue;
   if(ch.tagName==='OPTGROUP')h+=`<div class="xg">${esc(ch.label)}</div>`;h+=f.map(o=>`<button type="button" role="option" data-i="${o.index}" aria-selected="${o.index===sel.selectedIndex}" ${o.disabled?'disabled':''}>${esc(o.text)}</button>`).join('');n+=f.length}
  list.innerHTML=h||'<div class="xnone">No match</div>';act=-1;list.querySelectorAll('button').forEach(o=>o.onclick=()=>pick(+o.dataset.i))};
 const pick=i=>{if(sel.selectedIndex!==i){sel.selectedIndex=i;sel.dispatchEvent(new Event('change',{bubbles:true}))}label();xClose();btn.focus()};
 const place=()=>{const r=btn.getBoundingClientRect(),gap=6,vh=innerHeight,vw=innerWidth;const below=vh-r.bottom-gap-8,above=r.top-gap-8;const up=below<260&&above>below;
  const maxH=Math.max(140,Math.min(420,up?above:below));pop.style.maxHeight=maxH+'px';const w=Math.min(vw-16,Math.max(r.width,260));pop.style.width=w+'px';
  pop.style.left=Math.max(8,Math.min(vw-w-8,r.left))+'px';if(up){pop.style.top='';pop.style.bottom=(vh-r.top+gap)+'px'}else{pop.style.bottom='';pop.style.top=(r.bottom+gap)+'px'}};
 draw();place();const s0=list.querySelector('[aria-selected=true]');if(s0)s0.scrollIntoView({block:'center'});
 if(inp){inp.oninput=()=>draw(inp.value);setTimeout(()=>inp.focus(),0)}
 pop.onclick=e=>e.stopPropagation();pop.onkeydown=e=>{const bs=[...list.querySelectorAll('button:not([disabled])')];if(e.key==='Escape'){xClose();btn.focus()}
  else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();act=Math.max(0,Math.min(bs.length-1,act+(e.key==='ArrowDown'?1:-1)));bs.forEach((x,k)=>x.classList.toggle('act',k===act));bs[act]&&bs[act].scrollIntoView({block:'nearest'})}
  else if(e.key==='Enter'&&bs[act>=0?act:0]){e.preventDefault();pick(+bs[act>=0?act:0].dataset.i)}};
 if(!inp)setTimeout(()=>list.focus(),0);list.tabIndex=-1}
document.addEventListener('click',xClose);addEventListener('resize',xClose);document.addEventListener('scroll',e=>{if(XP&&!XP.pop.contains(e.target))xClose()},true);
new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes){if(n.nodeType!==1)continue;if(n.tagName==='SELECT')enhanceSelect(n);else n.querySelectorAll&&n.querySelectorAll('select').forEach(enhanceSelect)}}).observe(document.body,{childList:true,subtree:true});

/* ---------- hover glow: the light follows the cursor inside any clickable tile (as in the reference) ---------- */
const GLOWSEL='.tile,.sys,.mitem,.gcard,.badge,.arow,.crewbtn,.att>summary,.shelf>summary,.chip,.btn,.iconbtn,.xbtn,.spill';
document.addEventListener('pointermove',e=>{const t=e.target.closest&&e.target.closest(GLOWSEL);if(!t)return;const r=t.getBoundingClientRect();if(!r.width)return;
 t.style.setProperty('--gx',(e.clientX-r.left).toFixed(1)+'px');t.style.setProperty('--gy',(e.clientY-r.top).toFixed(1)+'px')},{passive:true});

/* ---------- speech input helper (Chrome/Edge Web Speech API) ---------- */
function attachMic(btn,input,onText){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){btn.title='Speech input needs Chrome or Edge';btn.disabled=true;btn.style.opacity=.4;return}
 btn.onclick=()=>{if(btn._rec){btn._rec.stop();return}const r=new SR();r.lang='en-US';r.interimResults=false;r.continuous=true;btn._rec=r;btn.classList.add('rec');
  r.onresult=e=>{let t='';for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)t+=e.results[i][0].transcript;if(t){input.value=(input.value+' '+t).trim();onText&&onText(input.value)}};
  r.onerror=e=>toast(e.error==='not-allowed'?'Microphone not allowed — type instead.':'Speech error: '+e.error);r.onend=()=>{btn._rec=null;btn.classList.remove('rec')};r.start()}}

/* ---------- start ---------- */
(async()=>{try{[META,STATE]=await Promise.all([api('/api/meta'),api('/api/state')])}catch(e){document.body.insertAdjacentHTML('beforeend','<p style="position:fixed;top:20px;left:20px;z-index:9">Cannot reach the Vitals in the Void server. Start it with <code>python run.py</code>.</p>');return}
 let seen=false;try{seen=sessionStorage.getItem('votv-boot')==='1'}catch(e){}
 if(seen&&STATE.settings.onboarded&&STATE.crew.length)enterApp();else{try{sessionStorage.setItem('votv-boot','1')}catch(e){}show('hero');window.startHero?startHero(()=>welcome()):welcome()}})();
