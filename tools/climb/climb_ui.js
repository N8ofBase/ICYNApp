// ---------- Crit Climb tournaments (N8 2026-11-10): scheduled brackets of 4, 8 or 16 players ----------
// The bracket lives on the server (GET /climbs, sign-ups and owner tools in stats.js); each match is a
// Standard online duel the referee creates when a player presses "Enter your match" (ICYNOnline.climb).
const CLIMB={list:null,open:null,err:'',busy:false,waiting:null,myK:null,brand:'',size:8,loading:false,joining:null};
const CLIMB_ON=()=>!!(window.ICYNStats&&ICYNStats.climbs&&window.ICYNOnline);
const BADGE_SVG={
  champion:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 4l4.5 8L21 8l-2 11H5z" fill="#e0b862" stroke="#5a4210" stroke-width="1.4" stroke-linejoin="round"/><circle cx="12" cy="15" r="1.6" fill="#b8323f"/></svg>',
  finalist:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21c-5-2-8-6-8-12M12 21c5-2 8-6 8-12" fill="none" stroke="#c9ced6" stroke-width="2" stroke-linecap="round"/><path d="M5 11l-2-1M5.5 14.5l-2.2-.3M7.5 17.5l-2 .6M19 11l2-1M18.5 14.5l2.2-.3M16.5 17.5l2 .6" stroke="#c9ced6" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="9" r="3" fill="#c9ced6"/></svg>',
  climber:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 20l7-12 4 6 3-4 6 10z" fill="#b87a45" stroke="#4a2c12" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 8v-5l4 1.5-4 1.5" fill="#e0b862" stroke="#4a2c12" stroke-width="1"/></svg>'};
const BADGE_NAME={champion:'Crit Climb Champion',finalist:'Finalist',climber:'Climber'};
const climbRound=(r,n)=>{const left=n-r;return left===1?'Final':left===2?'Semifinals':left===3?'Quarterfinals':'Round of '+(2**left)};
const climbWhen=ms=>new Date(ms).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
function climbLeft(ms){const d=ms-Date.now();if(d<=0)return 'any moment';const h=Math.floor(d/3600000),m=Math.floor(d%3600000/60000);return h>=48?Math.round(h/24)+' days':h?h+'h '+m+'m':Math.max(1,m)+'m'}
// Entrants are shown by a key, never by account id; this browser finds itself with the same recipe as the server.
async function climbKey(){const u=signedIn()&&ICYNAuth.user();if(!u)return null;if(CLIMB.myK&&CLIMB.myK.u===u.id)return CLIMB.myK.k;
  try{const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('icyn-climb:'+u.id));const k=[...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,16);CLIMB.myK={u:u.id,k};return k}catch(e){return null}}
const myKey=()=>{const u=signedIn()&&ICYNAuth.user();return u&&CLIMB.myK&&CLIMB.myK.u===u.id?CLIMB.myK.k:null};
function climbMine(t){const k=myKey();if(!k||t.status!=='live')return null;const e=t.entrants.findIndex(x=>x.k===k);if(e<0)return null;
  for(let r=0;r<t.rounds.length;r++){const i=t.rounds[r].findIndex(m=>m.w===null&&(m.a===e||m.b===e));if(i>=0){const m=t.rounds[r][i];return {t,r,i,m,e,side:m.a===e?0:1,ready:m.a!==null&&m.b!==null}}}
  return null}
const entrantName=(t,x)=>x===null||x===undefined?'':esc(t.entrants[x]?.n||'Hero');

function renderClimbSetup(){SFX.music('menu');document.body.classList.remove('arena-full');
  const b=document.querySelector('.hero-intro .brand');if(b)CLIMB.brand=b.getAttribute('src');
  $('#app').innerHTML=`<div class="setup"><div class="setup-acct"><span class="acct" id="acct" hidden></span></div>
   <div class="hero-intro"><h1>${CLIMB.brand?`<img class="brand" src="${CLIMB.brand}" alt="I Crit You Not!">`:'I Crit You Not!'}</h1><p>Brackets of 4, 8 or 16 Heroes. Win every duel and take the crown.</p></div>
   ${gameRow()}
   <div class="climb">
    <details class="how"><summary>How Crit Climb works</summary><div class="lore">
     <p class="herald">“Hear ye! The Crit Climb is open! Sign your name, and when the bell rings the bracket is drawn. Win and climb. Lose and cheer from the stands. Only one Hero takes the crown!”</p>
     <ol><li><b>Sign up</b> before the start time. Each Crit Climb holds 4, 8 or 16 players, and entry needs the Crit Pass.</li>
     <li><b>The draw</b> is random. When fewer players sign up than the bracket holds, the top seeds get byes into the next round.</li>
     <li><b>Every match is a Standard online duel</b>: 100 Life and a Calamity before every turn. Pick any Hero for each match.</li>
     <li><b>Meet before the deadline.</b> Once your rival is known, you both have until the deadline to enter the arena. If one of you waits and the other never comes, the one who waited climbs on. If neither comes, the higher seed climbs on.</li>
     <li><b>Badges</b> for all who climb: a crown for the winner, a laurel for the finalist and a Climber badge for every other entrant. Find them in My Stats. Crowns also shine on the leaderboard.</li></ol></div></details>
    <div id="climb-mine"></div><div id="climb-owner"></div><div id="climb-list" class="cl-list"></div>
   </div>
   ${POWERED}</div>`;
  wireGameRow();renderAcct();renderClimbMine();renderClimbList();climbLoad();
}
async function climbLoad(quiet){if(!CLIMB_ON()||CLIMB.loading)return;CLIMB.loading=true;
  const [r]=await Promise.all([ICYNStats.climbs(),climbKey()]);CLIMB.loading=false;
  if(Array.isArray(r)){CLIMB.list=r;CLIMB.err=''}else if(!quiet||!CLIMB.list)CLIMB.err='Couldn’t reach the arena. Check your connection.';
  // decided while you waited (walkover or the owner's call): leave the empty duel
  if(CLIMB.waiting&&CLIMB.list){const c=CLIMB.waiting.climb,t=CLIMB.list.find(x=>x.id===c.id),m=t&&t.rounds[c.r]&&t.rounds[c.r][c.i];if(m&&m.w!==null){CLIMB.waiting=null;try{ICYNOnline.close()}catch(e){}toast(m.how==='walkover'?'Your rival never came. You climb on!':'Your match was decided.')}}
  if(S.screen==='setup'&&S.mode==='climb'){renderClimbMine();renderClimbList()}}
setInterval(()=>{if(S.screen==='setup'&&S.mode==='climb'&&!document.hidden)climbLoad(true)},20000);
addEventListener('load',()=>{if(window.ICYNAuth&&ICYNAuth.onChange)ICYNAuth.onChange(()=>{if(S.screen==='setup'&&S.mode==='climb')climbKey().then(()=>{renderClimbMine();renderClimbList()})})});

// Your match: pick a Hero and enter, or wait in the arena for your rival.
function renderClimbMine(){const el=$('#climb-mine');if(!el)return;
  const err=CLIMB.err&&CLIMB.list?`<p class="nb-err" role="alert">${esc(CLIMB.err)}</p>`:'';
  const W=CLIMB.waiting;
  if(W){const t=(CLIMB.list||[]).find(x=>x.id===W.climb.id),m=t&&t.rounds[W.climb.r][W.climb.i],mine=t&&climbMine(t),riv=mine?entrantName(t,mine.side?m.a:m.b):'your rival';
    el.innerHTML=`<div class="cl-mine"><p class="ul-k">${esc(W.climb.name)} · ${climbRound(W.climb.r,W.climb.rounds)}</p><p>You’re in the arena. The duel begins the moment <b>${riv}</b> enters.${m&&m.due?` If they haven’t come by <b>${climbWhen(m.due)}</b>, you climb on.`:''}</p><p class="nb-wait">Waiting for your rival…</p>
      <div class="row"><button class="ghost" id="cl-out">Step out</button></div><small>You stay checked in. If you step out, come back here and press Enter your match when your rival arrives.</small>${err}</div>`;
    el.querySelector('#cl-out').onclick=()=>{CLIMB.waiting=null;try{ICYNOnline.close(true)}catch(e){}renderClimbMine()};return}
  const mine=(CLIMB.list||[]).map(climbMine).find(Boolean);
  if(!mine){el.innerHTML='';return}
  const {t,r,m,side,ready}=mine,rival=side?m.a:m.b;
  if(!ready){el.innerHTML=`<div class="cl-mine"><p class="ul-k">${esc(t.name)} · ${climbRound(r,t.rounds.length)}</p><p>You’re through! Your next rival is still being decided. Check back soon.</p></div>`;return}
  const h=HEROES[S.picks[0]];
  el.innerHTML=`<div class="cl-mine"><p class="ul-k">${esc(t.name)} · ${climbRound(r,t.rounds.length)}</p>
    <p>Your rival: <b>${entrantName(t,rival)}</b>${m.state==='waiting'&&m.host!==side?' <span class="cl-live">is waiting in the arena!</span>':m.state==='active'?' <span class="cl-live">your duel is under way</span>':''}</p>
    ${m.due?`<p class="cl-due">Play by <b>${climbWhen(m.due)}</b> (${climbLeft(m.due)} left)</p>`:''}
    <div class="roster cl-roster">${ORDER.map(id=>`<button class="pick" data-clh="${id}" style="--c:${HEROES[id].color}" aria-pressed="${S.picks[0]===id}"><img src="${SEL[id]}" alt="" style="--sc:${HEROES[id].scale}"><span>${HEROES[id].name}</span></button>`).join('')}</div>
    <button class="act begin" id="cl-go" ${CLIMB.busy?'disabled':''}><span class="who">${esc(h.name)} · Standard · 100 Life</span>${m.state==='active'?'Rejoin your match':'Enter your match'}</button>${err}</div>`;
  el.querySelectorAll('[data-clh]').forEach(b=>b.onclick=()=>{S.picks[0]=b.dataset.clh;renderClimbMine()});
  el.querySelector('#cl-go').onclick=()=>{CLIMB.err='';CLIMB.busy=true;renderClimbMine();
    Promise.resolve().then(()=>ICYNOnline.climb(t.id,S.picks[0])).catch(e=>{CLIMB.err=(e&&e.message)||'Could not reach the arena'}).finally(()=>{setTimeout(()=>{CLIMB.busy=false;if(S.screen==='setup'&&S.mode==='climb')renderClimbMine()},1500)})};
}

// Owner (developers group): schedule a Crit Climb. Rendered once so polling never wipes the form.
function renderClimbOwner(){const el=$('#climb-owner');if(!el||!S.owner||el.firstChild)return;
  const d=new Date(Date.now()+24*3600000);d.setMinutes(0,0,0);const local=new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  el.innerHTML=`<details class="cl-owner"><summary>Schedule a Crit Climb <small>(owner)</small></summary>
    <label>Name <input id="clo-name" maxlength="40" placeholder="Winter Crit Climb"></label>
    <div class="opt"><span>Players</span><div class="mode" role="group" aria-label="Players">${[4,8,16].map(n=>`<button data-clsize="${n}" aria-pressed="${CLIMB.size===n}">${n}</button>`).join('')}</div></div>
    <label>Sign-ups close and the bracket is drawn <input type="datetime-local" id="clo-start" value="${local}"></label>
    <label>Time to play each match <select id="clo-hours">${[1,2,4,12,24,48,72].map(h=>`<option value="${h}"${h===24?' selected':''}>${h<24?h+(h>1?' hours':' hour'):h/24+(h>24?' days':' day')}</option>`).join('')}</select></label>
    <div class="row"><button class="act" id="clo-go">Schedule it</button></div><p class="nb-err" id="clo-err" role="alert" hidden></p></details>`;
  el.querySelectorAll('[data-clsize]').forEach(b=>b.onclick=()=>{CLIMB.size=+b.dataset.clsize;el.querySelectorAll('[data-clsize]').forEach(x=>x.setAttribute('aria-pressed',x===b))});
  el.querySelector('#clo-go').onclick=async e=>{const go=e.currentTarget,er=el.querySelector('#clo-err');er.hidden=true;
    const name=el.querySelector('#clo-name').value.trim(),start=new Date(el.querySelector('#clo-start').value).getTime();
    if(!name){er.textContent='Give it a name';er.hidden=false;return}
    if(!start){er.textContent='Pick a start time';er.hidden=false;return}
    go.disabled=true;const r=await ICYNStats.climbCreate({name,size:CLIMB.size,startsAt:start,matchHours:+el.querySelector('#clo-hours').value});go.disabled=false;
    if(!r||r.error){er.textContent=(r&&r.error)||'Please try again';er.hidden=false;return}
    el.querySelector('#clo-name').value='';el.querySelector('details').open=false;toast('Crit Climb scheduled!');climbLoad()};
}

function climbAct(fn,btn){if(btn)btn.disabled=true;Promise.resolve(fn()).then(r=>{if(r&&r.error)toast(r.error);else if(r&&r.id&&CLIMB.list){const k=CLIMB.list.findIndex(x=>x.id===r.id);if(k>=0)CLIMB.list[k]=r}renderClimbMine();renderClimbList();climbLoad(true)}).finally(()=>{if(btn&&btn.isConnected)btn.disabled=false})}
function renderClimbList(){const el=$('#climb-list');if(!el)return;renderClimbOwner();
  if(!CLIMB_ON()){el.innerHTML='<p class="cl-empty">Crit Climb tournaments run on the live arena at icyn.prismcortex.net.</p>';return}
  const L=CLIMB.list;
  if(!L){el.innerHTML=`<p class="cl-empty">${CLIMB.err?esc(CLIMB.err):'Loading the Crit Climbs…'}</p>`;return}
  if(!L.length){el.innerHTML='<p class="cl-empty">No Crit Climbs are scheduled yet. Check back soon!</p>';return}
  const k=myKey(),sect=(title,xs)=>xs.length?`<h3 class="cl-h">${title}</h3>${xs.map(climbCard).join('')}`:'';
  el.innerHTML=sect('Climbing now',L.filter(t=>t.status==='live'))+sect('Signing up',L.filter(t=>t.status==='open'))+sect('Past Climbs',L.filter(t=>t.status==='done'||t.status==='cancelled'));
  el.querySelectorAll('[data-cl]').forEach(b=>b.onclick=()=>{const id=b.closest('[data-id]').dataset.id,a=b.dataset.cl,S_=window.ICYNStats;
    if(a==='view'){CLIMB.open=CLIMB.open===id?null:id;renderClimbList();return}
    if(a==='in'){ICYNAuth.signIn();return}
    if(a==='pass'){unlockPanel('climb');return}
    if(a==='join')return climbAct(()=>S_.climbJoin(id),b);
    if(a==='leave')return climbAct(()=>S_.climbLeave(id),b);
    if(a==='start'){if(confirm('Draw the bracket and start this Crit Climb now?'))climbAct(()=>S_.climbStart(id),b);return}
    if(a==='cancel'){if(confirm('Cancel this Crit Climb? This can’t be undone.'))climbAct(()=>S_.climbCancel(id),b);return}
    if(a==='decide'){const [r,i,w]=b.dataset.m.split(',').map(Number);if(confirm(`Advance ${b.dataset.n} without playing the match?`))climbAct(()=>S_.climbDecide(id,r,i,w),b)}});
}
function climbCard(t){const k=myKey(),me=k?t.entrants.findIndex(x=>x.k===k):-1,n=t.entrants.length;
  let line='',btns='';
  if(t.status==='open'){line=`Starts <b>${climbWhen(t.startsAt)}</b> · in ${climbLeft(t.startsAt)} · ${t.matchHours}h per match`;
    btns=me>=0?`<span class="cl-in">✓ You’re signed up</span><button class="ghost" data-cl="leave">Leave</button>`
      :n>=t.size?'<span class="cl-in">Full</span>':!signedIn()?'<button class="act" data-cl="in">Sign in to join</button>':!hasArena()?'<button class="act" data-cl="pass">Join · needs the Crit Pass</button>':'<button class="act" data-cl="join">Join the Climb</button>';
    if(S.owner)btns+='<button class="ghost" data-cl="start">Start now</button><button class="ghost" data-cl="cancel">Cancel</button>'}
  else if(t.status==='live'){const r=t.rounds.findIndex(rd=>rd.some(m=>m.w===null));line=`<span class="cl-live">Live</span> · ${climbRound(Math.max(0,r),t.rounds.length)} · ${t.matchHours}h per match`;
    btns=`<button class="ghost" data-cl="view">${CLIMB.open===t.id?'Hide bracket':'View bracket'}</button>`+(S.owner?'<button class="ghost" data-cl="cancel">Cancel</button>':'')}
  else if(t.status==='done'){line=`<span class="cl-crown">${BADGE_SVG.champion}</span> <b>${entrantName(t,t.champion)}</b> took the crown · ${climbWhen(t.endedAt||t.startsAt)}`;btns=`<button class="ghost" data-cl="view">${CLIMB.open===t.id?'Hide bracket':'View bracket'}</button>`}
  else line=`${esc(t.note||'Cancelled')}`;
  const chips=t.status==='open'?`<div class="cl-chips">${t.entrants.map((e,x)=>`<span class="cl-chip${x===me?' me':''}">${avHTML(e.av,20,e.n)}${esc(e.n)}</span>`).join('')}${Array.from({length:Math.max(0,t.size-n)},()=>'<span class="cl-chip open">Open seat</span>').join('')}</div>`:'';
  return `<article class="cl-card ${t.status}" data-id="${esc(t.id)}"><header><h4>${esc(t.name)}</h4><span class="cl-tag">${t.status==='open'?`${n} of ${t.size}`:(t.bracketSize||t.size)+' players'}</span></header>
    <p class="cl-line">${line}</p>${chips}${btns?`<div class="row">${btns}</div>`:''}${CLIMB.open===t.id&&t.rounds.length?climbBracket(t,me):''}</article>`}
function climbBracket(t,me){const R=t.rounds.length,HOW={bye:'Bye',walkover:'Walkover',noshow:'No-show · higher seed',forfeit:'Forfeit',judge:'Arena’s call',duel:''};
  const side=(m,s,r)=>{const x=s?m.b:m.a,e=x===null?null:t.entrants[x],won=m.w===s,lost=m.w!==null&&m.w!==s;
    return `<div class="cl-p${won?' won':''}${lost?' lost':''}${x===me&&me>=0?' me':''}">${e?avHTML(e.av,20,e.n):''}<span>${e?esc(e.n):r===0?'Bye':'…'}</span>${e&&e.seed?`<small>${e.seed}</small>`:''}</div>`};
  return `<div class="cl-bracket" style="--cols:${R}">${t.rounds.map((round,r)=>`<div class="cl-col"><h5>${climbRound(r,R)}</h5>${round.map((m,i)=>{
    const foot=m.w!==null?(HOW[m.how]||''):m.state==='active'?'<span class="cl-live">Playing now</span>':m.state==='waiting'?'One rival is waiting':m.due?'Due '+climbWhen(m.due):'';
    const judge=S.owner&&t.status==='live'&&m.w===null&&m.a!==null&&m.b!==null?`<div class="cl-judge">${[0,1].map(s=>`<button class="linkish" data-cl="decide" data-m="${r},${i},${s}" data-n="${esc(t.entrants[s?m.b:m.a].n)}">Advance ${esc(t.entrants[s?m.b:m.a].n)}</button>`).join('')}</div>`:'';
    return `<div class="cl-m">${side(m,0,r)}${side(m,1,r)}${foot?`<small class="cl-f">${foot}</small>`:''}${judge}</div>`}).join('')}</div>`).join('')}</div>`}
function climbBadgesHTML(bs){if(!bs||!bs.length)return '';const order={champion:0,finalist:1,climber:2};
  const counts={};bs.forEach(b=>counts[b.k]=(counts[b.k]||0)+1);
  return `<h3>Crit Climb badges</h3><div class="cl-bsum">${['champion','finalist','climber'].filter(x=>counts[x]).map(x=>`<span class="cl-badge ${x}">${BADGE_SVG[x]}<b>${counts[x]>1?counts[x]+'× ':''}${BADGE_NAME[x]}</b></span>`).join('')}</div>
    <ol class="sp-list cl-blist">${[...bs].sort((a,b)=>String(b.at).localeCompare(String(a.at))||order[a.k]-order[b.k]).slice(0,12).map(b=>`<li><span class="cl-bi">${BADGE_SVG[b.k]||''}</span><span>${esc(b.name||'Crit Climb')}</span><small>${esc(BADGE_NAME[b.k]||'')} · ${b.size} players</small></li>`).join('')}</ol>`}

