import { COURSE_META, SECTIONS, ALL_TASKS, TASK_XP, MAX_XP, CORE_TASK_IDS, SHOP_ITEMS } from './course-data.js';

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
const uniq = a => [...new Set(a)];
const now = () => new Date().toISOString();
const taskById = Object.fromEntries(ALL_TASKS.map(t=>[t.id,t]));
const sectionById = Object.fromEntries(SECTIONS.map(s=>[s.id,s]));

const STORAGE = {
  token:'searchquest-session',
  guest:'searchquest-guest-progress-v1',
  cache:'searchquest-cloud-cache-v1',
  guestStarted:'searchquest-guest-started'
};

function defaultProgress(){
  return { version:1, answers:{}, completed:[], revealed:[], inventory:[], equipped:{background:'default',avatar:'🧑‍💻',pet:''}, currentSection:'start', updatedAt:null };
}

let state = {
  token: localStorage.getItem(STORAGE.token) || '',
  user: null,
  progress: defaultProgress(),
  activeSection:'start',
  selectedMatchSource:null,
  selectedPaint:{},
  solutionPending:null,
  saveTimer:null,
  saveInFlight:false,
  lastFeedback:{}
};

function calculateXP(){ return uniq(state.progress.completed).reduce((sum,id)=>sum+(TASK_XP[id]||0),0); }
function coreCompleted(){ return CORE_TASK_IDS.filter(id=>state.progress.completed.includes(id)).length; }
function sectionCoreTasks(section){ return section.tasks.filter(t=>!t.bonus); }
function sectionDone(section){ const core=sectionCoreTasks(section); return core.length>0 && core.every(t=>state.progress.completed.includes(t.id)); }
function sectionCompletedCount(section){ return sectionCoreTasks(section).filter(t=>state.progress.completed.includes(t.id)).length; }
function levelInfo(xp){
  const thresholds=[0,120,280,500,760,1040,1320,1580,1840];
  let level=1;
  for(let i=1;i<thresholds.length;i++) if(xp>=thresholds[i]) level=i+1;
  const start=thresholds[level-1] ?? thresholds.at(-1), end=thresholds[level] ?? MAX_XP;
  return {level,start,end,pct:end>start?clamp(((xp-start)/(end-start))*100,0,100):100};
}
function currentAnswer(id, fallback=null){ return state.progress.answers[id]?.value ?? fallback; }
function setAnswer(id,value){
  state.progress.answers[id]={...(state.progress.answers[id]||{}),value,updatedAt:now()};
  persistProgress();
}
function revealHas(id){return state.progress.revealed.includes(id)}

function normalizeProgress(raw){
  const p=defaultProgress();
  if(!raw||typeof raw!=='object') return p;
  p.answers=raw.answers&&typeof raw.answers==='object'?raw.answers:{};
  p.completed=Array.isArray(raw.completed)?uniq(raw.completed.filter(id=>taskById[id])):[];
  p.revealed=Array.isArray(raw.revealed)?uniq(raw.revealed.filter(id=>taskById[id])):[];
  p.inventory=Array.isArray(raw.inventory)?uniq(raw.inventory.filter(id=>SHOP_ITEMS.some(x=>x.id===id))):[];
  p.equipped={...p.equipped,...(raw.equipped||{})};
  p.currentSection=sectionById[raw.currentSection]?raw.currentSection:'start';
  p.updatedAt=raw.updatedAt||null;
  return p;
}

function readLocalProgress(){
  const key=state.token?STORAGE.cache:STORAGE.guest;
  try{return normalizeProgress(JSON.parse(localStorage.getItem(key)||'null'))}catch{return defaultProgress()}
}
function storeLocalProgress(){
  const key=state.token?STORAGE.cache:STORAGE.guest;
  localStorage.setItem(key,JSON.stringify(state.progress));
}

async function api(path, options={}){
  const headers={'content-type':'application/json',...(options.headers||{})};
  if(state.token) headers.authorization=`Bearer ${state.token}`;
  const res=await fetch(path,{...options,headers});
  let data=null;
  try{data=await res.json()}catch{data={error:`HTTP ${res.status}`}}
  if(!res.ok){const e=new Error(data?.error||'Anfrage fehlgeschlagen');e.status=res.status;e.data=data;throw e}
  return data;
}

function setSaveState(text){ $('#saveState').textContent=text; }
function persistProgress(){
  state.progress.currentSection=state.activeSection;
  storeLocalProgress();
  updateHeader();
  renderNav();
  if(!state.user){ setSaveState('Gastmodus · lokal gespeichert'); return; }
  setSaveState('Änderungen werden gespeichert …');
  clearTimeout(state.saveTimer);
  state.saveTimer=setTimeout(saveCloudProgress,700);
}
async function saveCloudProgress(){
  if(!state.user || state.saveInFlight) return;
  state.saveInFlight=true;
  try{
    const data=await api('/api/progress',{method:'POST',body:JSON.stringify({progress:state.progress})});
    state.progress=normalizeProgress(data.progress);
    storeLocalProgress();
    setSaveState(`Synchronisiert · ${state.user.className}`);
    updateHeader();
  }catch(e){
    setSaveState('Offline-Kopie gespeichert · Cloud-Sync ausstehend');
  }finally{state.saveInFlight=false}
}

function toast(message,type=''){
  const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;$('#toastHost').append(el);setTimeout(()=>el.remove(),3100);
}
function confetti(){
  const host=$('#confettiHost');const icons=['✨','⚡','⭐','💾','0','1'];
  for(let i=0;i<24;i++){const s=document.createElement('span');s.className='confetti-piece';s.textContent=icons[i%icons.length];s.style.left=`${Math.random()*100}%`;s.style.animationDelay=`${Math.random()*.35}s`;host.append(s);setTimeout(()=>s.remove(),2400)}
}

function applyTheme(){
  document.body.dataset.theme=state.progress.equipped?.background||'default';
  $('#avatarDisplay').textContent=state.progress.equipped?.avatar||'🧑‍💻';
  $('#petDisplay').textContent=state.progress.equipped?.pet||'';
}
function updateHeader(){
  const xp=calculateXP(), li=levelInfo(xp), done=coreCompleted(), total=CORE_TASK_IDS.length, pct=Math.round(done/total*100);
  $('#xpValue').textContent=xp;
  $('#levelLabel').textContent=`Level ${li.level}`;$('#levelBar').style.width=`${li.pct}%`;
  $('#progressPercent').textContent=`${pct}%`;$('#progressRing').style.setProperty('--p',pct);$('#progressText').textContent=`${done} von ${total} Pflichtaufgaben`;
  $('#profileText').textContent=state.user?state.user.nickname:'Gast';
  $$('.teacher-only').forEach(x=>x.classList.toggle('hidden',state.user?.role!=='teacher'));
  applyTheme();
}

function renderNav(){
  $('#chapterNav').innerHTML=SECTIONS.map(s=>{
    const done=sectionDone(s),active=state.activeSection===s.id;
    return `<button class="chapter-btn ${done?'done':''} ${active?'active':''}" data-section="${s.id}"><span>${s.icon}</span><span>${esc(s.nav)}</span><span class="nav-check">${done?'●':'○'}</span></button>`;
  }).join('');
  $$('.chapter-btn').forEach(b=>b.addEventListener('click',()=>openSection(b.dataset.section)));
}

function achievements(){
  const c=state.progress.completed;
  const arr=[['🔓','Erste Spur',c.length>=1],['🕷️','Crawler-Scout',sectionDone(sectionById.crawling)],['🗂️','Index-Profi',sectionDone(sectionById.indexing)],['🔎','Relevanz-Checker',sectionDone(sectionById.query)],['🏁','Ranking-Analyst',sectionDone(sectionById.ranking)],['📈','SEO-Stratege',sectionDone(sectionById.seo)],['🏆','SearchQuest gemeistert',coreCompleted()===CORE_TASK_IDS.length]];
  return arr.map(([i,n,u])=>`<span class="badge ${u?'unlocked':''}">${i} ${n}${u?' ✓':''}</span>`).join('');
}

function openSection(id,scroll=true){
  if(!sectionById[id]) return;
  state.activeSection=id;state.progress.currentSection=id;storeLocalProgress();
  renderNav();renderSection();updateHeader();
  $('#breadcrumb').textContent=`Suchmaschinen · ${sectionById[id].nav}`;
  if(scroll) window.scrollTo({top:0,behavior:'smooth'});
  if(innerWidth<981) $('#sidebar').classList.remove('open');
}

function renderSection(){
  const s=sectionById[state.activeSection];
  const core=sectionCoreTasks(s), done=sectionCompletedCount(s);
  const idx=SECTIONS.findIndex(x=>x.id===s.id);
  $('#courseContent').innerHTML=`
    <section class="section-hero">
      <div class="section-title-wrap"><div class="section-icon">${s.icon}</div><div><span class="eyebrow">${esc(s.kicker)}</span><h2>${esc(s.title)}</h2><p>${s.id==='start'?esc(COURSE_META.caseText):'Erklärungen, Beispiele und interaktive Übungen.'}</p></div></div>
      <div class="section-score"><strong>${done}/${core.length}</strong><span>Pflichtaufgaben erledigt</span></div>
    </section>
    <section class="lesson-body">${s.content}</section>
    <section class="quest-block"><div class="quest-head"><div><span class="eyebrow">Quest-Zone</span><h3>Üben & Anwenden</h3><p>Du kannst jede Musterlösung anzeigen. Vorher fragt dich der Kurs, ob du noch einmal selbst versuchen möchtest.</p></div></div>${s.tasks.map((t,i)=>renderTask(t,i+1)).join('')}</section>
    <section class="lesson-body"><h3>🏅 Deine Abzeichen</h3><div class="achievement-strip">${achievements()}</div></section>
    <div class="section-nav"><button class="secondary-btn" id="prevSection" ${idx===0?'disabled':''}>← Vorheriges Kapitel</button><button class="primary-btn" id="nextSection" ${idx===SECTIONS.length-1?'disabled':''}>Nächstes Kapitel →</button></div>`;
  bindTaskEvents();
  $('#prevSection')?.addEventListener('click',()=>idx>0&&openSection(SECTIONS[idx-1].id));
  $('#nextSection')?.addEventListener('click',()=>idx<SECTIONS.length-1&&openSection(SECTIONS[idx+1].id));
}

function renderTask(t,n){
  const completed=state.progress.completed.includes(t.id);const ans=currentAnswer(t.id,defaultAnswer(t));const feedback=state.lastFeedback[t.id];
  return `<article class="task-card ${completed?'completed':''} ${t.bonus?'bonus':''}" data-task="${t.id}">
    <div class="task-top"><div class="task-title"><div class="task-number">${t.bonus?'★':n}</div><div><h4>${esc(t.title)}</h4><small>${t.bonus?'Bonus-Challenge':'Pflicht-Quest'}${completed?' · erledigt ✓':''}</small></div></div><span class="task-xp">+${t.xp} XP</span></div>
    <div class="task-prompt">${esc(t.prompt)}</div>
    <div class="task-body">${renderTaskBody(t,ans)}</div>
    ${feedback?`<div class="feedback ${feedback.type}">${feedback.html}</div>`:''}
    ${revealHas(t.id)?renderSolution(t):''}
    <div class="task-actions">${renderTaskActions(t,completed)}</div>
  </article>`;
}
function defaultAnswer(t){
  if(t.type==='multi')return[];if(t.type==='matching')return{};if(t.type==='order')return t.items.map(x=>x[0]);if(t.type==='rgb')return[128,128,128];if(t.type==='pixel')return Array(t.correct.length).fill(null);return '';
}
function renderTaskBody(t,a){
  switch(t.type){
    case 'single': return t.options.map(([v,l])=>`<label class="option"><input type="radio" name="${t.id}" value="${esc(v)}" ${a===v?'checked':''}><span>${esc(l)}</span></label>`).join('');
    case 'boolean': return `<label class="option"><input type="radio" name="${t.id}" value="true" ${String(a)==='true'?'checked':''}><span>Richtig</span></label><label class="option"><input type="radio" name="${t.id}" value="false" ${String(a)==='false'?'checked':''}><span>Falsch</span></label>`;
    case 'multi': return t.options.map(([v,l])=>`<label class="option"><input type="checkbox" value="${esc(v)}" ${(a||[]).includes(v)?'checked':''}><span>${esc(l)}</span></label>`).join('');
    case 'text': return `<input class="text-input" type="text" value="${esc(a||'')}" placeholder="Antwort eingeben" autocomplete="off">`;
    case 'number': return `<input class="number-input" inputmode="decimal" type="text" value="${esc(a||'')}" placeholder="Zahl eingeben" autocomplete="off">`;
    case 'free': return `<textarea class="free-input" placeholder="${esc(t.placeholder||'Formuliere deine Antwort.')}" maxlength="2000">${esc(a||'')}</textarea>${revealHas(t.id)?`<div class="feedback neutral">Vergleiche deine Antwort mit der Musterlösung. Du entscheidest anschließend selbst, ob sie die Kriterien erfüllt.</div>`:''}`;
    case 'matching': return renderMatching(t,a||{});
    case 'order': return renderOrder(t,a||defaultAnswer(t));
    case 'rgb': return renderRGB(t,a||[128,128,128]);
    case 'pixel': return renderPixel(t,a||defaultAnswer(t));
    default:return '';
  }
}
function renderMatching(t,a){
  const targets=t.pairs.map(p=>p[1]);
  return `<div class="match-wrap"><div class="match-sources">${t.pairs.map(([src])=>`<div class="match-chip ${a[src]?'assigned':''}" draggable="true" data-source="${esc(src)}">${esc(src)}</div>`).join('')}</div><div class="match-targets">${targets.map(trg=>{const src=Object.keys(a).find(k=>a[k]===trg);return `<div class="match-zone" data-target="${esc(trg)}"><div><strong>${esc(trg)}</strong><div class="assigned-value">${src?esc(src):'Hier ablegen / antippen'}</div></div>${src?'<button class="clear-match" type="button" aria-label="Zuordnung löschen">×</button>':''}</div>`}).join('')}</div></div><div class="feedback neutral">Desktop: ziehen und ablegen. Handy/Tablet: zuerst eine Karte, dann das Ziel antippen.</div>`;
}
function renderOrder(t,a){
  const labels=Object.fromEntries(t.items);
  return `<div class="order-list">${a.map((id,i)=>`<div class="order-item" draggable="true" data-order-id="${id}"><span class="order-handle">↕</span><span>${esc(labels[id])}</span><span class="order-buttons"><button type="button" data-dir="up" ${i===0?'disabled':''}>↑</button><button type="button" data-dir="down" ${i===a.length-1?'disabled':''}>↓</button></span></div>`).join('')}</div>`;
}
function renderRGB(t,a){
  const vals=[0,1,2].map(i=>Number(a[i]??128));const names=['R','G','B'];
  return `<div class="rgb-task"><div class="rgb-controls">${vals.map((v,i)=>`<div class="slider-row"><b>${names[i]}</b><input type="range" min="0" max="255" value="${v}" data-rgb="${i}"><output>${v}</output></div>`).join('')}</div><div class="rgb-preview" style="background:rgb(${vals.join(',')})"><span>RGB(${vals.join(', ')})</span></div></div>`;
}
function renderPixel(t,a){
  const selected=state.selectedPaint[t.id]||t.palette[0][0];
  const cmap=Object.fromEntries(t.palette.map(([k,c])=>[k,c]));
  return `<div class="pixel-task"><div class="paint-grid">${a.map((v,i)=>`<button type="button" class="paint-cell" data-cell="${i}" style="background:${v?cmap[v]:'#fff'}" aria-label="Pixel ${i+1}"></button>`).join('')}</div><div><div class="palette">${t.palette.map(([k,c,n])=>`<button type="button" class="palette-btn ${selected===k?'selected':''}" data-paint="${k}"><span class="swatch" style="background:${c}"></span>${esc(n)}</button>`).join('')}</div><p style="margin-top:10px;color:var(--muted);font-size:14px">Farbe auswählen und anschließend die Pixel antippen.</p></div></div>`;
}
function renderSolution(t){
  const criteria=t.criteria?`<ul class="criteria-list">${t.criteria.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'';
  return `<div class="solution-box"><strong>💡 Musterlösung</strong><div>${esc(t.solution)}</div>${criteria?`<div style="margin-top:8px"><b>Prüfkriterien:</b>${criteria}</div>`:''}</div>`;
}
function renderTaskActions(t,completed){
  const solution=`<button type="button" class="secondary-btn solution-btn">${revealHas(t.id)?'Musterlösung eingeblendet':'Musterlösung anzeigen'}</button>`;
  if(t.type==='free'){
    return `${completed?'<button type="button" class="success-btn" disabled>✓ Als korrekt markiert</button>':'<button type="button" class="primary-btn save-free-btn">Antwort sichern</button>'}${revealHas(t.id)&&!completed?'<button type="button" class="success-btn self-correct-btn">Passt – als korrekt markieren</button>':''}${solution}`;
  }
  return `${completed?'<button type="button" class="success-btn" disabled>✓ Erledigt</button>':'<button type="button" class="primary-btn check-btn">Antwort prüfen</button>'}${solution}`;
}

function bindTaskEvents(){
  $$('.task-card').forEach(card=>{
    const t=taskById[card.dataset.task];
    card.querySelectorAll('input[type=radio]').forEach(el=>el.addEventListener('change',()=>setAnswer(t.id,el.value)));
    card.querySelectorAll('input[type=checkbox]').forEach(el=>el.addEventListener('change',()=>setAnswer(t.id,[...card.querySelectorAll('input[type=checkbox]:checked')].map(x=>x.value))));
    $('.text-input',card)?.addEventListener('input',e=>setAnswer(t.id,e.target.value));
    $('.number-input',card)?.addEventListener('input',e=>setAnswer(t.id,e.target.value));
    $('.free-input',card)?.addEventListener('input',e=>setAnswer(t.id,e.target.value));
    $('.check-btn',card)?.addEventListener('click',()=>checkTask(t));
    $('.save-free-btn',card)?.addEventListener('click',()=>saveFree(t));
    $('.self-correct-btn',card)?.addEventListener('click',()=>completeTask(t));
    $('.solution-btn',card)?.addEventListener('click',()=>requestSolution(t));
    bindMatching(card,t);bindOrder(card,t);bindRGB(card,t);bindPixel(card,t);
  });
}
function bindMatching(card,t){
  if(t.type!=='matching')return;
  $$('.match-chip',card).forEach(chip=>{
    chip.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',chip.dataset.source)});
    chip.addEventListener('click',()=>{state.selectedMatchSource=chip.dataset.source;$$('.match-chip',card).forEach(x=>x.classList.toggle('selected',x===chip))});
  });
  $$('.match-zone',card).forEach(zone=>{
    const assign=src=>{if(!src)return;const a={...(currentAnswer(t.id,{})||{})};Object.keys(a).forEach(k=>{if(a[k]===zone.dataset.target)delete a[k]});a[src]=zone.dataset.target;state.selectedMatchSource=null;setAnswer(t.id,a);rerenderKeepScroll()};
    zone.addEventListener('dragover',e=>e.preventDefault());zone.addEventListener('drop',e=>{e.preventDefault();assign(e.dataTransfer.getData('text/plain'))});zone.addEventListener('click',e=>{if(e.target.closest('.clear-match'))return;assign(state.selectedMatchSource)});
    $('.clear-match',zone)?.addEventListener('click',()=>{const a={...(currentAnswer(t.id,{})||{})};const src=Object.keys(a).find(k=>a[k]===zone.dataset.target);if(src)delete a[src];setAnswer(t.id,a);rerenderKeepScroll()});
  });
}
function bindOrder(card,t){
  if(t.type!=='order')return;
  $$('.order-item',card).forEach((item)=>{
    $$('.order-buttons button',item).forEach(btn=>btn.addEventListener('click',()=>{const a=[...currentAnswer(t.id,defaultAnswer(t))];const i=a.indexOf(item.dataset.orderId),j=btn.dataset.dir==='up'?i-1:i+1;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];setAnswer(t.id,a);rerenderKeepScroll()}));
    item.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain',item.dataset.orderId));
    item.addEventListener('dragover',e=>e.preventDefault());
    item.addEventListener('drop',e=>{e.preventDefault();const src=e.dataTransfer.getData('text/plain'),dst=item.dataset.orderId;if(!src||src===dst)return;const a=[...currentAnswer(t.id,defaultAnswer(t))];const si=a.indexOf(src),di=a.indexOf(dst);a.splice(si,1);a.splice(di,0,src);setAnswer(t.id,a);rerenderKeepScroll()});
  });
}
function bindRGB(card,t){
  if(t.type!=='rgb')return;
  $$('.slider-row input',card).forEach(sl=>sl.addEventListener('input',()=>{const a=[...currentAnswer(t.id,[128,128,128])];a[Number(sl.dataset.rgb)]=Number(sl.value);setAnswer(t.id,a);const preview=$('.rgb-preview',card);preview.style.background=`rgb(${a.join(',')})`;preview.querySelector('span').textContent=`RGB(${a.join(', ')})`;sl.nextElementSibling.textContent=sl.value}));
}
function bindPixel(card,t){
  if(t.type!=='pixel')return;
  $$('.palette-btn',card).forEach(b=>b.addEventListener('click',()=>{state.selectedPaint[t.id]=b.dataset.paint;$$('.palette-btn',card).forEach(x=>x.classList.toggle('selected',x===b))}));
  $$('.paint-cell',card).forEach(cell=>cell.addEventListener('click',()=>{const a=[...currentAnswer(t.id,defaultAnswer(t))];a[Number(cell.dataset.cell)]=state.selectedPaint[t.id]||t.palette[0][0];setAnswer(t.id,a);const color=Object.fromEntries(t.palette.map(([k,c])=>[k,c]))[a[Number(cell.dataset.cell)]];cell.style.background=color}));
}
function rerenderKeepScroll(){const y=scrollY;renderSection();requestAnimationFrame(()=>scrollTo(0,y))}

function equalArrays(a,b){return a.length===b.length&&a.every((x,i)=>x===b[i])}
function normalizedText(v){return String(v??'').trim().replace(/\s+/g,' ').replace(/\s*\/\s*/g,' / ')}
function isCorrect(t,a){
  switch(t.type){
    case 'single': return a===t.correct;
    case 'boolean': return String(a)===String(t.correct);
    case 'multi': return equalArrays([...(a||[])].sort(),[...t.correct].sort());
    case 'text': return t.accepted.some(v=>normalizedText(a)===normalizedText(v));
    case 'number': {let raw=String(a).trim().replace(/\s/g,''); if(/^[-+]?\d{1,3}(\.\d{3})+$/.test(raw)) raw=raw.replace(/\./g,''); else raw=raw.replace(',','.'); const n=Number(raw); return Number.isFinite(n)&&Math.abs(n-t.correct)<=Number(t.tolerance||0)}
    case 'matching': return t.pairs.every(([s,d])=>a?.[s]===d);
    case 'order': return equalArrays(a||[],t.correct);
    case 'rgb': return equalArrays((a||[]).map(Number),t.correct.map(Number));
    case 'pixel': return equalArrays(a||[],t.correct);
    default:return false;
  }
}
function checkTask(t){
  const a=currentAnswer(t.id,defaultAnswer(t));
  const empty=(typeof a==='string'&&!a.trim())||(Array.isArray(a)&&a.length===0);
  if(empty){state.lastFeedback[t.id]={type:'bad',html:'Bitte gib zuerst eine Antwort ein.'};rerenderKeepScroll();return}
  if(isCorrect(t,a)){
    state.lastFeedback[t.id]={type:'good',html:`✓ Richtig. ${esc(t.explanation||'')}`};completeTask(t,false);
  }else{
    state.lastFeedback[t.id]={type:'bad',html:'Noch nicht ganz. Prüfe deine Eingabe und versuche es erneut. Du kannst bei Bedarf die Musterlösung einblenden.'};rerenderKeepScroll();
  }
}
function saveFree(t){
  const a=String(currentAnswer(t.id,'')).trim();
  if(a.length<10){state.lastFeedback[t.id]={type:'bad',html:'Deine Antwort ist noch sehr kurz. Formuliere zuerst eine nachvollziehbare Erklärung.'};rerenderKeepScroll();return}
  state.lastFeedback[t.id]={type:'neutral',html:'Antwort gespeichert. Lies sie noch einmal durch. Wenn du möchtest, blende anschließend die Musterlösung ein und vergleiche selbst.'};persistProgress();rerenderKeepScroll();
}
function completeTask(t,rerender=true){
  const was=state.progress.completed.includes(t.id);
  if(!was){state.progress.completed.push(t.id);persistProgress();toast(`+${t.xp} XP · ${t.title}`,'good');confetti()}
  if(rerender)rerenderKeepScroll();else setTimeout(()=>rerenderKeepScroll(),120);
}
function requestSolution(t){
  if(revealHas(t.id)){toast('Die Musterlösung ist bereits eingeblendet.');return}
  state.solutionPending=t;$('#solutionDialog').showModal();
}
function confirmSolution(){
  const t=state.solutionPending;if(!t)return;state.progress.revealed=uniq([...state.progress.revealed,t.id]);state.solutionPending=null;persistProgress();$('#solutionDialog').close();rerenderKeepScroll();
}

function renderShop(){
  const xp=calculateXP(), inv=state.progress.inventory;
  const labels={background:'Hintergrund',avatar:'Avatar',pet:'Begleiter'};
  $('#shopGrid').innerHTML=SHOP_ITEMS.map(item=>{
    const unlocked=inv.includes(item.id),can=xp>=item.threshold;
    const eq=(item.kind==='background'&&state.progress.equipped.background===item.value)||(item.kind==='avatar'&&state.progress.equipped.avatar===item.value)||(item.kind==='pet'&&state.progress.equipped.pet===item.value);
    return `<div class="shop-item ${!can&&!unlocked?'locked':''}"><span class="shop-kind">${labels[item.kind]}</span><div class="shop-icon">${item.icon}</div><h3>${esc(item.label)}</h3><p>Freischaltung ab ${item.threshold} XP</p>${unlocked?`<button class="${eq?'success-btn':'secondary-btn'} shop-equip" data-item="${item.id}" ${eq?'disabled':''}>${eq?'✓ Aktiv':'Anlegen'}</button>`:`<button class="${can?'primary-btn':'ghost-btn'} shop-unlock" data-item="${item.id}" ${can?'':'disabled'}>${can?'Freischalten':`${item.threshold-xp} XP fehlen`}</button>`}</div>`;
  }).join('');
  $$('.shop-unlock').forEach(b=>b.addEventListener('click',()=>unlockItem(b.dataset.item)));
  $$('.shop-equip').forEach(b=>b.addEventListener('click',()=>equipItem(b.dataset.item)));
}
function unlockItem(id){const item=SHOP_ITEMS.find(x=>x.id===id);if(!item||calculateXP()<item.threshold)return;state.progress.inventory=uniq([...state.progress.inventory,id]);persistProgress();toast(`${item.label} freigeschaltet!`,'good');renderShop()}
function equipItem(id){const item=SHOP_ITEMS.find(x=>x.id===id);if(!item||!state.progress.inventory.includes(id))return;if(item.kind==='background')state.progress.equipped.background=item.value;if(item.kind==='avatar')state.progress.equipped.avatar=item.value;if(item.kind==='pet')state.progress.equipped.pet=item.value;persistProgress();updateHeader();renderShop();toast(`${item.label} ist jetzt aktiv.`)}

function authForm(tab='login'){
  $$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.authTab===tab));
  if(state.user){
    $('#authForms').innerHTML=`<div class="auth-grid"><div class="auth-success"><b>Angemeldet als ${esc(state.user.nickname)}</b><br>Klasse: ${esc(state.user.className)} · Rolle: ${state.user.role==='teacher'?'Lehrkraft':'Schüler/in'}</div><button type="button" class="danger-btn" id="logoutBtn">Abmelden</button></div>`;
    $('#logoutBtn').addEventListener('click',logout);return;
  }
  if(tab==='login'){
    $('#authForms').innerHTML=`<form id="loginForm" class="auth-grid"><div class="field"><label>Klasse</label><input class="auth-input" name="className" required maxlength="40" placeholder="z. B. WG11A"></div><div class="field"><label>Nickname</label><input class="auth-input" name="nickname" required maxlength="24" placeholder="dein Nickname"></div><div class="field"><label>Passwort</label><input class="auth-input" name="password" type="password" required minlength="6" maxlength="128" placeholder="mindestens 6 Zeichen"></div><button class="primary-btn">Anmelden</button><div id="authMessage"></div></form>`;
    $('#loginForm').addEventListener('submit',doLogin);
  }else{
    $('#authForms').innerHTML=`<form id="registerForm" class="auth-grid"><div class="role-row"><label class="role-choice"><input type="radio" name="role" value="student" checked> Schüler/in</label><label class="role-choice"><input type="radio" name="role" value="teacher"> Lehrkraft</label></div><div class="field"><label>Klasse</label><input class="auth-input" name="className" required maxlength="40" placeholder="z. B. WG11A"></div><div class="field"><label>Nickname</label><input class="auth-input" name="nickname" required minlength="2" maxlength="24" placeholder="selbst gewählter Nickname"></div><div class="field"><label>Passwort</label><input class="auth-input" name="password" type="password" required minlength="6" maxlength="128" placeholder="mindestens 6 Zeichen"></div><div class="field hidden" id="teacherCodeField"><label>Lehrercode</label><input class="auth-input" name="teacherCode" type="password" maxlength="128" placeholder="Code aus Netlify"></div><button class="primary-btn">Konto anlegen</button><div id="authMessage"></div></form>`;
    $$('input[name=role]',$('#registerForm')).forEach(r=>r.addEventListener('change',()=>$('#teacherCodeField').classList.toggle('hidden',r.value!=='teacher'||!r.checked)));
    $('#registerForm').addEventListener('submit',doRegister);
  }
}
function showAuth(tab='login'){authForm(tab);$('#authDialog').showModal()}
function authMessage(msg,type='error'){$('#authMessage').innerHTML=`<div class="auth-${type}">${esc(msg)}</div>`}
async function doLogin(e){
  e.preventDefault();const f=new FormData(e.target);const btn=e.target.querySelector('button');btn.disabled=true;
  try{const data=await api('/api/auth',{method:'POST',body:JSON.stringify({action:'login',className:f.get('className'),nickname:f.get('nickname'),password:f.get('password')})});await acceptSession(data);$('#authDialog').close();$('#startDialog').open&&$('#startDialog').close();toast('Anmeldung erfolgreich. Fortschritt synchronisiert.','good')}catch(err){authMessage(err.message)}finally{btn.disabled=false}
}
async function doRegister(e){
  e.preventDefault();const f=new FormData(e.target);const btn=e.target.querySelector('button');btn.disabled=true;
  try{const guestSnapshot=readLocalProgress();const data=await api('/api/auth',{method:'POST',body:JSON.stringify({action:'register',role:f.get('role'),className:f.get('className'),nickname:f.get('nickname'),password:f.get('password'),teacherCode:f.get('teacherCode')||''})});if(!state.user&&guestSnapshot.completed.length){data.progress=guestSnapshot}await acceptSession(data);if(guestSnapshot.completed.length)saveCloudProgress();$('#authDialog').close();$('#startDialog').open&&$('#startDialog').close();toast('Konto angelegt. Deine Fortschritte werden jetzt gespeichert.','good')}catch(err){authMessage(err.message)}finally{btn.disabled=false}
}
async function acceptSession(data){
  state.token=data.token;state.user=data.user;localStorage.setItem(STORAGE.token,state.token);localStorage.setItem(STORAGE.guestStarted,'1');
  state.progress=normalizeProgress(data.progress||defaultProgress());storeLocalProgress();state.activeSection=state.progress.currentSection||'start';renderAll();
}
async function logout(){
  try{await api('/api/auth',{method:'POST',body:JSON.stringify({action:'logout'})})}catch{}
  state.token='';state.user=null;localStorage.removeItem(STORAGE.token);state.progress=normalizeProgress(JSON.parse(localStorage.getItem(STORAGE.guest)||'null'));state.activeSection=state.progress.currentSection||'start';$('#authDialog').close();renderAll();toast('Abgemeldet. Du bist jetzt im Gastmodus.')
}
async function restoreSession(){
  if(!state.token){state.progress=readLocalProgress();state.activeSection=state.progress.currentSection||'start';return}
  state.progress=readLocalProgress();
  try{const data=await api('/api/progress');state.user=data.user;state.progress=normalizeProgress(data.progress);storeLocalProgress();state.activeSection=state.progress.currentSection||'start';setSaveState(`Synchronisiert · ${state.user.className}`)}catch(e){if(e.status===401){localStorage.removeItem(STORAGE.token);state.token='';state.user=null;state.progress=normalizeProgress(JSON.parse(localStorage.getItem(STORAGE.guest)||'null'))}else setSaveState('Cloud gerade nicht erreichbar · lokale Kopie geladen')}
}

async function openTeacher(){
  if(state.user?.role!=='teacher')return;$('#teacherDialog').showModal();await loadTeacher();
}
async function loadTeacher(){
  $('#teacherContent').innerHTML='<div class="feedback neutral">Daten werden geladen …</div>';
  try{
    const data=await api('/api/teacher');$('#teacherClassLabel').textContent=`Klasse ${data.className}`;
    const users=data.students||[],avg=users.length?Math.round(users.reduce((s,u)=>s+u.progressPercent,0)/users.length):0;
    $('#teacherContent').innerHTML=`<div class="teacher-summary"><div class="teacher-stat"><b>${users.length}</b><span>Schülerkonten</span></div><div class="teacher-stat"><b>${avg}%</b><span>Ø Fortschritt</span></div><div class="teacher-stat"><b>${users.filter(u=>u.progressPercent===100).length}</b><span>Kurs abgeschlossen</span></div><div class="teacher-stat"><b>${users.reduce((s,u)=>s+u.completed,0)}</b><span>erledigte Pflichtaufgaben</span></div></div><div class="teacher-table-wrap"><table class="teacher-table"><thead><tr><th>Nickname</th><th>Fortschritt</th><th>XP</th><th>Letzter Stand</th><th>Aktionen</th></tr></thead><tbody>${users.map(u=>`<tr><td><b>${esc(u.nickname)}</b></td><td class="progress-cell">${u.completed}/${CORE_TASK_IDS.length} · ${u.progressPercent}%<div class="progress-line"><i style="width:${u.progressPercent}%"></i></div></td><td>${u.xp}</td><td>${u.updatedAt?new Date(u.updatedAt).toLocaleString('de-DE'):'noch nicht gespeichert'}</td><td><div class="teacher-actions"><button class="secondary-btn t-reset" data-id="${u.id}">Fortschritt löschen</button><button class="secondary-btn t-password" data-id="${u.id}" data-name="${esc(u.nickname)}">Passwort setzen</button><button class="danger-btn t-delete" data-id="${u.id}" data-name="${esc(u.nickname)}">Nutzer entfernen</button></div></td></tr>`).join('')||'<tr><td colspan="5">Noch keine Schülerkonten in dieser Klasse.</td></tr>'}</tbody></table></div>`;
    bindTeacherActions();
  }catch(e){$('#teacherContent').innerHTML=`<div class="feedback bad">${esc(e.message)}</div>`}
}
function bindTeacherActions(){
  $$('.t-reset').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Fortschritt dieses Nutzers wirklich löschen?'))return;await teacherAction({action:'resetProgress',userId:b.dataset.id});toast('Fortschritt gelöscht.');loadTeacher()}));
  $$('.t-password').forEach(b=>b.addEventListener('click',async()=>{const pw=prompt(`Neues Passwort für ${b.dataset.name} (mindestens 6 Zeichen):`);if(!pw)return;if(pw.length<6){alert('Das Passwort ist zu kurz.');return}await teacherAction({action:'resetPassword',userId:b.dataset.id,newPassword:pw});toast('Passwort neu gesetzt. Alle bisherigen Sitzungen wurden beendet.','good')}));
  $$('.t-delete').forEach(b=>b.addEventListener('click',async()=>{if(!confirm(`${b.dataset.name} wirklich entfernen? Konto und Fortschritt werden gelöscht.`))return;await teacherAction({action:'deleteUser',userId:b.dataset.id});toast('Nutzer entfernt.');loadTeacher()}));
}
async function teacherAction(payload){try{return await api('/api/teacher',{method:'POST',body:JSON.stringify(payload)})}catch(e){alert(e.message);throw e}}

function renderAll(){
  $('#courseTitle').textContent=COURSE_META.title;$('#courseSubtitle').textContent=COURSE_META.subtitle;
  renderNav();renderSection();updateHeader();
  $('#breadcrumb').textContent=`Suchmaschinen · ${sectionById[state.activeSection].nav}`;
}

async function init(){
  await restoreSession();renderAll();
  if(!state.user&&!localStorage.getItem(STORAGE.guestStarted)) $('#startDialog').showModal();
  $('#guestStartBtn').addEventListener('click',()=>{localStorage.setItem(STORAGE.guestStarted,'1');$('#startDialog').close();toast('Gastmodus gestartet. Fortschritt wird auf diesem Gerät gespeichert.')});
  $('#loginStartBtn').addEventListener('click',()=>{$('#startDialog').close();showAuth('login')});
  $('#registerStartBtn').addEventListener('click',()=>{$('#startDialog').close();showAuth('register')});
  $('#profileBtn').addEventListener('click',()=>showAuth('login'));
  $('#authClose').addEventListener('click',()=>$('#authDialog').close());
  $$('.tab').forEach(t=>t.addEventListener('click',()=>authForm(t.dataset.authTab)));
  $('#menuBtn').addEventListener('click',()=>$('#sidebar').classList.add('open'));$('#sidebarClose').addEventListener('click',()=>$('#sidebar').classList.remove('open'));
  $('#solutionCancel').addEventListener('click',()=>{state.solutionPending=null;$('#solutionDialog').close()});$('#solutionConfirm').addEventListener('click',confirmSolution);
  $('#shopBtn').addEventListener('click',()=>{renderShop();$('#shopDialog').showModal()});$('#shopClose').addEventListener('click',()=>$('#shopDialog').close());
  $('#teacherBtn').addEventListener('click',openTeacher);$('#teacherClose').addEventListener('click',()=>$('#teacherDialog').close());$('#refreshTeacherBtn').addEventListener('click',loadTeacher);
  $('#resetAllProgressBtn').addEventListener('click',async()=>{if(!confirm('Wirklich den gesamten Lernfortschritt aller Schülerkonten dieser Klasse löschen? Die Konten bleiben bestehen.'))return;await teacherAction({action:'resetAllProgress'});toast('Klassenfortschritt gelöscht.');loadTeacher()});
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
}
init();
