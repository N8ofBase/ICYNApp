// ---------- Crit Climb tournaments (N8 2026-11-10): code lobbies of 4, 8 or 16 players, like online Starvos ----------
// A Crit Pass holder hosts a lobby (public or private) and shares its code; the host presses Begin; every match is a
// Standard online duel the referee creates when a player presses "Enter your match" (ICYNOnline.climb).
// Server: GET /climbs (public lobbies), GET /climbs/{code}, POST /climbs, /join, /leave, /start (stats.js).
const CLIMB={pub:null,views:{},cur:null,err:'',busy:false,waiting:null,myK:null,brand:'',size:8,isPublic:true,loading:false};
const CLIMB_ON=()=>!!(window.ICYNStats&&ICYNStats.climbs&&window.ICYNOnline);
const CLIMB_KEY='icyn.climbs';
const climbCodes=()=>{try{return JSON.parse(localStorage.getItem(CLIMB_KEY)||'[]').filter(c=>/^[A-Z2-9]{5}$/.test(c))}catch(e){return []}};
const climbRemember=(code,keep=true)=>{try{const c=climbCodes().filter(x=>x!==code);if(keep)c.unshift(code);localStorage.setItem(CLIMB_KEY,JSON.stringify(c.slice(0,10)))}catch(e){}};
// Profile rings earned in Crit Climbs: gold for a Conqueror (won one), silver for a Competitor (played one)
const RING_NAME={gold:'Crit Climb Conqueror',silver:'Crit Climb Competitor'};
function ringAv(v,size,name,ring){if(!RING_NAME[ring])return avHTML(v,size,name);const lbl=RING_NAME[ring];
  if(size<44)return `<span class="rav ${ring}" title="${lbl}">${avHTML(v,size,name)}</span>`;
  const id='rg'+Math.random().toString(36).slice(2,8);
  return `<span class="rav big ${ring}" title="${lbl}" style="--o:${Math.round(size*1.62)}px"><svg viewBox="0 0 100 100" aria-hidden="true"><defs><path id="${id}" d="M50,50 m-40,0 a40,40 0 1,1 80,0 a40,40 0 1,1 -80,0"/></defs><circle cx="50" cy="50" r="44" class="rr"/><text class="rt"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${lbl.toUpperCase()} ✦ ${lbl.toUpperCase()}</textPath></text></svg>${avHTML(v,size,name)}</span>`}
const climbRound=(r,n)=>{const left=n-r;return left===1?'Final':left===2?'Semifinals':left===3?'Quarterfinals':'Round of '+(2**left)};
const climbClock=ms=>new Date(ms).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
function climbLeft(ms){const d=ms-Date.now();if(d<=0)return 'time’s up';const m=Math.floor(d/60000),s=Math.floor(d%60000/1000);return m?m+'m '+String(s).padStart(2,'0')+'s':s+'s'}
// Entrants are shown by a key, never by account id; this browser finds itself with the same recipe as the server.
async function climbKey(){const u=signedIn()&&ICYNAuth.user();if(!u)return null;if(CLIMB.myK&&CLIMB.myK.u===u.id)return CLIMB.myK.k;
  try{const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('icyn-climb:'+u.id));const k=[...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,16);CLIMB.myK={u:u.id,k};return k}catch(e){return null}}
const myKey=()=>{const u=signedIn()&&ICYNAuth.user();return u&&CLIMB.myK&&CLIMB.myK.u===u.id?CLIMB.myK.k:null};
const meIn=t=>{const k=myKey();return k?t.entrants.findIndex(x=>x.k===k):-1};
function climbMine(t){const e=meIn(t);if(e<0||t.status!=='live')return null;
  for(let r=0;r<t.rounds.length;r++){const i=t.rounds[r].findIndex(m=>m.w===null&&(m.a===e||m.b===e));if(i>=0){const m=t.rounds[r][i];return {t,r,i,m,e,side:m.a===e?0:1,ready:m.a!==null&&m.b!==null}}}
  return null}
const entrantName=(t,x)=>x===null||x===undefined?'':esc(t.entrants[x]?.n||'Hero');

function renderClimbSetup(){SFX.music('menu');document.body.classList.remove('arena-full');
  const b=document.querySelector('.hero-intro .brand');if(b)CLIMB.brand=b.getAttribute('src');
  $('#app').innerHTML=`<div class="setup"><div class="setup-acct"><span class="acct" id="acct" hidden></span></div>
   <div class="hero-intro"><h1>${CLIMB.brand?`<img class="brand" src="${CLIMB.brand}" alt="I Crit You Not!">`:'I Crit You Not!'}</h1><p>Gather 4, 8 or 16 Heroes. Win every duel and take the crown.</p></div>
   ${gameRow()}
   <div class="climb">
    <details class="how"><summary>How Crit Climb works</summary><div class="lore">
     <p class="herald">“Hear ye! A Crit Climb is called! Gather your rivals, draw the bracket, and fight your way up. Lose once and your climb is over. Only one Hero stands at the top!”</p>
     <ol><li><b>Host a Climb</b> for 4, 8 or 16 players and share its code, or open it to the public so anyone can join. Joining needs the Crit Pass.</li>
     <li><b>The host begins</b> once a rival has joined. The Computer takes every empty seat, and the bracket is drawn at random.</li>
     <li><b>Every match is a Standard online duel</b>: 100 Life and a Calamity before every turn. Pick your Hero for your first match.</li>
     <li><b>Your Hero climbs on as they are.</b> Win, and your Hero carries their Life, stats, Weapon and leveled Ability dice into the next match. Every Ability comes off cooldown and the weapon is mended, but wounds stay, so win well!</li>
     <li><b>Answer the call!</b> When your rival is known, you both have 10 minutes to enter the arena. If one waits and the other never comes, the one who waited climbs on. If neither comes, the higher seed climbs on.</li>
     <li><b>Earn your ring.</b> The winner wears the gold <b>Crit Climb Conqueror</b> ring around their profile picture. Every other climber earns the silver <b>Crit Climb Competitor</b> ring.</li>
     <li><b>Solo Climb is free.</b> Climb a 4 Hero bracket against the Computer any time. It’s good practice, though rings are only won online.</li></ol></div></details>
    <div id="climb-main"></div>
   </div>
   ${POWERED}</div>`;
  wireGameRow();renderAcct();renderClimb();climbLoad();
}
async function climbLoad(quiet){if(!CLIMB_ON()||CLIMB.loading)return;CLIMB.loading=true;
  const codes=[...new Set([CLIMB.cur,...climbCodes()].filter(Boolean))];
  const [pub,...vs]=await Promise.all([ICYNStats.climbs(),...codes.map(c=>ICYNStats.climb(c)),climbKey()]);CLIMB.loading=false;
  if(Array.isArray(pub)){CLIMB.pub=pub;CLIMB.err=''}else if(!quiet)CLIMB.err='Couldn’t reach the arena. Check your connection.';
  codes.forEach((c,i)=>{const v=vs[i];if(v&&v.code){CLIMB.views[c]=v;const old=v.status==='cancelled'||(v.status==='done'&&Date.now()-(v.endedAt||0)>86400000);if(old||meIn(v)<0&&c!==CLIMB.cur)climbRemember(c,false)}else if(v===null&&c!==CLIMB.cur){}});
  // decided while you waited (walkover): leave the empty duel
  if(CLIMB.waiting){const c=CLIMB.waiting.climb,t=CLIMB.views[c.id],m=t&&t.rounds[c.r]&&t.rounds[c.r][c.i];if(m&&m.w!==null){CLIMB.waiting=null;try{ICYNOnline.close()}catch(e){}toast(m.how==='walkover'?'Your rival never came. You climb on!':'Your match was decided.')}}
  if(S.screen==='setup'&&S.mode==='climb'&&!document.activeElement?.matches?.('#climb-main input'))renderClimb()}
setInterval(()=>{if(S.screen==='setup'&&S.mode==='climb'&&!document.hidden){const t=CLIMB.cur&&CLIMB.views[CLIMB.cur];if(t&&(t.status==='open'||t.status==='live'))climbLoad(true);else if(++CLIMB.tick%3===0)climbLoad(true);const c=$('#cl-clock');if(c&&c.dataset.due)c.textContent=climbLeft(+c.dataset.due)}},5000);CLIMB.tick=0;
addEventListener('load',()=>{if(window.ICYNAuth&&ICYNAuth.onChange)ICYNAuth.onChange(()=>{if(S.screen==='setup'&&S.mode==='climb')climbKey().then(()=>renderClimb())})});
function climbAct(p,btn,after){if(btn)btn.disabled=true;CLIMB.err='';return Promise.resolve(p).then(r=>{if(!r||r.error){CLIMB.err=(r&&r.error)||'Please try again';toast(CLIMB.err)}else if(r.code){CLIMB.views[r.code]=r;if(after)after(r)}renderClimb()}).finally(()=>{if(btn&&btn.isConnected)btn.disabled=false})}

function renderClimb(){const el=$('#climb-main');if(!el)return;
  if(!CLIMB_ON()){el.innerHTML='<p class="cl-empty">Crit Climb runs on the live arena at icyn.prismcortex.net.</p>';return}
  const t=CLIMB.cur&&CLIMB.views[CLIMB.cur];
  if(CLIMB.cur&&t)return renderClimbRoom(el,t);
  const can=signedIn()&&hasArena();
  const mine=climbCodes().map(c=>CLIMB.views[c]).filter(v=>v&&meIn(v)>=0&&(v.status==='open'||v.status==='live'||v.status==='done'));
  let h='';
  h+=`<div class="cl-solo"><h3 class="cl-h">Solo Climb <span class="cl-free">Free</span></h3><p>You and 3 Computers in a 4 Hero bracket. Win the Semifinal, then the Final. Your Hero carries their Life, stats and dice into the Final.</p>
    <div class="roster cl-roster">${ORDER.map(id=>`<button class="pick" data-solo="${id}" style="--c:${HEROES[id].color}" aria-pressed="${S.picks[0]===id}"><img src="${SEL[id]}" alt="" style="--sc:${HEROES[id].scale}"><span>${HEROES[id].name}</span></button>`).join('')}</div>
    <button class="act begin" id="cl-solo"><span class="who">${esc(HEROES[S.picks[0]].name)} · Standard · 100 Life</span>Start a Solo Climb</button></div>`;
  if(!can){h+=unlockCard('climb')}
  else h+=`<div class="cl-host"><h3 class="cl-h">Host a Crit Climb</h3>
    <div class="opt"><span>Players</span><div class="mode" role="group" aria-label="Players">${[4,8,16].map(n=>`<button data-clsize="${n}" aria-pressed="${CLIMB.size===n}">${n}</button>`).join('')}</div></div>
    <div class="opt"><span>Who can join</span><div class="mode" role="group" aria-label="Who can join"><button id="cl-pub" aria-pressed="${CLIMB.isPublic}">Public</button><button id="cl-priv" aria-pressed="${!CLIMB.isPublic}">Private</button></div></div>
    <small class="opt-note">${CLIMB.isPublic?'Anyone can find it in the list below, or join with the code.':'Only players with the code can join.'}</small>
    <label class="cl-name"><span>Name (optional)</span><input id="cl-nm" maxlength="40" placeholder="${esc(((S.me&&S.me.name)||'My')+'’s Crit Climb')}"></label>
    <button class="act begin" id="cl-make"><span class="who">${CLIMB.size} players · ${CLIMB.isPublic?'Public':'Private'}</span>Host a Crit Climb</button></div>
    <div class="nb-join cl-join"><label for="cl-code">Join with a code</label><div class="row"><input id="cl-code" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CODE"><button class="ghost" id="cl-go-code">Join</button></div></div>`;
  if(mine.length)h+=`<h3 class="cl-h">Your Crit Climbs</h3>${mine.map(climbCard).join('')}`;
  const pub=(CLIMB.pub||[]).filter(v=>meIn(v)<0);
  h+=`<h3 class="cl-h">Public Crit Climbs</h3>${!CLIMB.pub?`<p class="cl-empty">${CLIMB.err?esc(CLIMB.err):'Looking for open Climbs…'}</p>`:pub.length?pub.map(climbCard).join(''):'<p class="cl-empty">No public Climbs are open right now. Host one!</p>'}`;
  el.innerHTML=h;
  el.querySelectorAll('[data-solo]').forEach(b=>b.onclick=()=>{S.picks[0]=b.dataset.solo;renderClimb()});el.querySelector('#cl-solo').onclick=soloStart;
  if(!can){wireUnlock(el)}
  else{
    el.querySelectorAll('[data-clsize]').forEach(b=>b.onclick=()=>{CLIMB.size=+b.dataset.clsize;renderClimb()});
    el.querySelector('#cl-pub').onclick=()=>{CLIMB.isPublic=true;renderClimb()};el.querySelector('#cl-priv').onclick=()=>{CLIMB.isPublic=false;renderClimb()};
    el.querySelector('#cl-make').onclick=e=>climbAct(ICYNStats.climbCreate({size:CLIMB.size,public:CLIMB.isPublic,name:el.querySelector('#cl-nm').value.trim()}),e.currentTarget,r=>{climbRemember(r.code);CLIMB.cur=r.code});
    const join=e=>{const c=el.querySelector('#cl-code').value.trim().toUpperCase();if(c.length<5){toast('Enter the 5 letter code');return}climbAct(ICYNStats.climbJoin(c),e&&e.currentTarget,r=>{climbRemember(r.code);CLIMB.cur=r.code})};
    el.querySelector('#cl-go-code').onclick=join;el.querySelector('#cl-code').onkeydown=e=>{if(e.key==='Enter')join()}}
  el.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{const c=b.dataset.open;if(b.dataset.join&&can)climbAct(ICYNStats.climbJoin(c),b,r=>{climbRemember(r.code);CLIMB.cur=r.code});else if(b.dataset.join){if(!signedIn())ICYNAuth.signIn();else unlockPanel('climb')}else{CLIMB.cur=c;renderClimb();climbLoad(true)}});
}
function climbCard(t){const n=t.entrants.length,me=meIn(t),host=t.entrants[0];
  const line=t.status==='open'?`Hosted by <b>${esc(host?host.n:'?')}</b> · ${n} of ${t.size} · ${t.public?'Public':'Private'}`
    :t.status==='live'?`<span class="cl-live">Climbing now</span> · ${n} players`:t.status==='done'?`${BADGE_CROWN} <b>${entrantName(t,t.champion)}</b> took the crown`:esc(t.note||'Closed');
  const btn=me>=0||t.status!=='open'?`<button class="ghost" data-open="${esc(t.code)}">${t.status==='open'?'Open lobby':t.status==='live'?'Go to your Climb':'View bracket'}</button>`:`<button class="ghost cl-joinbtn" data-open="${esc(t.code)}" data-join="1">Join</button>`;
  return `<article class="cl-card ${t.status}"><header><h4>${esc(t.name)}</h4><span class="cl-tag">${t.status==='open'?`${n}/${t.size}`:(t.bracketSize||t.size)+' bracket'}</span></header>
    <p class="cl-line">${line}</p><div class="row">${btn}</div></article>`}
const BADGE_CROWN='<svg class="cl-crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 4l4.5 8L21 8l-2 11H5z" fill="#e0b862" stroke="#5a4210" stroke-width="1.4" stroke-linejoin="round"/><circle cx="12" cy="15" r="1.6" fill="#b8323f"/></svg>';

// One Climb: its lobby (before Begin), or your match and the bracket (after).
function renderClimbRoom(el,t){const me=meIn(t),isHost=me===0,n=t.entrants.length;
  let h=`<div class="row cl-back"><button class="linkish" id="cl-back">← All Crit Climbs</button></div>
    <div class="cl-room"><header><h3>${esc(t.name)}</h3><span class="cl-tag">${t.status==='open'?`${n}/${t.size}`:(t.bracketSize||t.size)+' bracket'} · ${t.public?'Public':'Private'}</span></header>`;
  if(t.status==='open'){
    h+=`<p>Share this code with your rivals:</p><div class="nb-code" aria-label="Climb code">${esc(t.code)}</div><div class="row"><button class="ghost" id="cl-copy">Copy code</button><button class="ghost" id="cl-link">Copy invite link</button></div>
      <div class="cl-chips">${t.entrants.map((e,x)=>`<span class="cl-chip${x===me?' me':''}">${ringAv(e.av,22,e.n,e.ring)}${esc(e.n)}${x===0?' <small>host</small>':''}</span>`).join('')}${Array.from({length:Math.max(0,t.size-n)},()=>'<span class="cl-chip open">Open seat · Computer</span>').join('')}</div>
      ${isHost?`<button class="act begin" id="cl-begin" ${n<2?'disabled':''}><span class="who">${n<2?'Waiting for a rival to join':n<t.size?`${n} Heroes · the Computer takes ${t.size-n} seat${t.size-n>1?'s':''}`:n+' Heroes ready'}</span>Begin the Climb</button><div class="row"><button class="ghost" id="cl-close">Close lobby</button></div>`
        :me>=0?`<p class="nb-wait">Waiting for ${esc(t.entrants[0].n)} to begin…</p><div class="row"><button class="ghost" id="cl-leave">Leave</button></div>`
        :n<t.size?`<button class="act" id="cl-joinhere">Join this Climb</button>`:'<p>This Climb is full.</p>'}`;
  }else if(t.status==='cancelled'){h+=`<p>${esc(t.note||'This Climb was closed.')}</p>`}
  else{
    if(t.status==='done')h+=`<p class="cl-champ">${BADGE_CROWN} <b>${entrantName(t,t.champion)}</b> is the Crit Climb Conqueror!</p>`;
    h+=climbMatchHTML(t);
    h+=climbBracket(t,me);
  }
  el.innerHTML=h+'</div>';
  el.querySelector('#cl-back').onclick=()=>{CLIMB.cur=null;renderClimb()};
  const copy=(b,txt)=>{try{navigator.clipboard.writeText(txt);b.textContent='Copied'}catch(e){}};
  if($('#cl-copy'))$('#cl-copy').onclick=e=>copy(e.currentTarget,t.code);
  if($('#cl-link'))$('#cl-link').onclick=e=>copy(e.currentTarget,location.origin+location.pathname+'?climb='+t.code);
  if($('#cl-begin'))$('#cl-begin').onclick=e=>climbAct(ICYNStats.climbStart(t.code),e.currentTarget);
  if($('#cl-close'))$('#cl-close').onclick=e=>{if(confirm('Close this lobby? Everyone in it is sent home.'))climbAct(ICYNStats.climbLeave(t.code),e.currentTarget)};
  if($('#cl-leave'))$('#cl-leave').onclick=e=>climbAct(ICYNStats.climbLeave(t.code),e.currentTarget,()=>{climbRemember(t.code,false);CLIMB.cur=null});
  if($('#cl-joinhere'))$('#cl-joinhere').onclick=e=>{if(!signedIn())return ICYNAuth.signIn();if(!hasArena())return unlockPanel('climb');climbAct(ICYNStats.climbJoin(t.code),e.currentTarget,r=>climbRemember(r.code))};
  wireClimbMatch(el,t);
}
function climbMatchHTML(t){const W=CLIMB.waiting&&CLIMB.waiting.climb.id===t.code?CLIMB.waiting:null,mine=climbMine(t),err=CLIMB.err?`<p class="nb-err" role="alert">${esc(CLIMB.err)}</p>`:'';
  if(!mine){const me=meIn(t);return me>=0&&t.status==='live'?'<p class="cl-out">Your climb is over. Watch the bracket to see who takes the crown!</p>':''}
  const {r,m,side,ready}=mine,rival=side?m.a:m.b,label=`${esc(t.name)} · ${climbRound(r,t.rounds.length)}`,me=t.entrants[mine.e],lock=me&&HEROES[me.hero]?me.hero:null,c=me&&me.carry,re=t.entrants[rival];
  const rivalHero=re&&HEROES[re.hero]?` <small>(${esc(HEROES[re.hero].name)}${re.carry?` · ${re.carry.life}/${re.carry.maxLife} Life`:''})</small>`:'';
  const clock=m.due?`<p class="cl-due">Enter by <b>${climbClock(m.due)}</b> · <span id="cl-clock" data-due="${m.due}">${climbLeft(m.due)}</span> left</p>`:'';
  if(W)return `<div class="cl-mine"><p class="ul-k">${label}</p><p>You’re in the arena. The duel begins the moment <b>${entrantName(t,rival)}</b> enters. If they don’t come in time, you climb on.</p>${clock}<p class="nb-wait">Waiting for your rival…</p>${err}</div>`;
  if(!ready)return `<div class="cl-mine"><p class="ul-k">${label}</p><p>You’re through! Your next rival is still being decided.</p></div>`;
  return `<div class="cl-mine"><p class="ul-k">${label}</p>
    <p>Your rival: <b>${entrantName(t,rival)}</b>${rivalHero}${t.entrants[rival].cpu?` <small>(${re.hero?'':'the Computer picks its Hero; '}the duel starts as soon as you enter)</small>`:''}${m.state==='waiting'&&m.host!==side?' <span class="cl-live">is waiting in the arena!</span>':m.state==='active'?' <span class="cl-live">· your duel is under way</span>':''}</p>${clock}
    ${lock?climbCarryHTML(lock,c):`<div class="roster cl-roster">${ORDER.map(id=>`<button class="pick" data-clh="${id}" style="--c:${HEROES[id].color}" aria-pressed="${S.picks[0]===id}"><img src="${SEL[id]}" alt="" style="--sc:${HEROES[id].scale}"><span>${HEROES[id].name}</span></button>`).join('')}</div>`}
    <button class="act begin" id="cl-go" ${CLIMB.busy?'disabled':''}><span class="who">${esc(HEROES[lock||S.picks[0]].name)} · Standard · ${c?c.life+'/'+c.maxLife:100} Life</span>${m.state==='active'?'Rejoin your match':'Enter your match'}</button>${err}</div>`}
// Your locked Hero and what it carries into this match
function climbCarryHTML(id,c){const h=HEROES[id],up=c?h.abilities.map((a,k)=>c.dice&&c.dice[k]>a.dice?`${esc(a.name)} ${c.dice[k]}D6`:'').filter(Boolean):[];
  const st=c?['def','power','energy','speed','charm'].map(k=>`<span${c[k]>h.stats[k]?' class="up"':c[k]<h.stats[k]?' class="down"':''}>${k==='def'?'Defense':cap(k)} ${c[k]}</span>`).join(''):'';
  return `<div class="cl-carry" style="--c:${h.color}"><img src="${SEL[id]}" alt=""><div><b>${esc(h.name)}</b> <small>climbs on</small>${c?`<p>${c.life}/${c.maxLife} Life · Weapon ${c.weaponDice}D6${up.length?' · '+up.join(', '):''}</p><p class="cl-st">${st}</p>`:''}</div></div>`}
function wireClimbMatch(el,t){
  el.querySelectorAll('[data-clh]').forEach(b=>b.onclick=()=>{S.picks[0]=b.dataset.clh;renderClimb()});
  const go=el.querySelector('#cl-go');if(!go)return;
  go.onclick=()=>{CLIMB.err='';CLIMB.busy=true;renderClimb();
    const mm=climbMine(t),lk=mm&&t.entrants[mm.e]&&HEROES[t.entrants[mm.e].hero]?t.entrants[mm.e].hero:S.picks[0];Promise.resolve().then(()=>ICYNOnline.climb(t.code,lk)).catch(e=>{CLIMB.err=(e&&e.message)||'Could not reach the arena'}).finally(()=>{setTimeout(()=>{CLIMB.busy=false;if(S.screen==='setup'&&S.mode==='climb')renderClimb()},1500)})}}
function climbBracket(t,me){const R=t.rounds.length,HOW={bye:'Bye',walkover:'Walkover',noshow:'No-show',forfeit:'Forfeit',duel:'',cpu:'Computer duel'};
  const side=(m,s,r)=>{const x=s?m.b:m.a,e=x===null?null:t.entrants[x],won=m.w===s,lost=m.w!==null&&m.w!==s;
    return `<div class="cl-p${won?' won':''}${lost?' lost':''}${x===me&&me>=0?' me':''}">${e?ringAv(e.av,20,e.n,e.ring):''}<span>${e?esc(e.n):r===0?'Bye':'…'}</span>${e&&e.cpu?'<small class="cl-cpu">CPU</small>':e&&e.seed?`<small>${e.seed}</small>`:''}</div>`};
  return `<div class="cl-bracket" style="--cols:${R}">${t.rounds.map((round,r)=>`<div class="cl-col"><h5>${climbRound(r,R)}</h5>${round.map(m=>{
    const foot=m.w!==null?(m.how==='cpu'&&m.heroes?'Computer duel · '+m.heroes.map(h=>HEROES[h]?HEROES[h].name:h).join(' vs '):HOW[m.how]||''):m.state==='active'?'<span class="cl-live">Playing now</span>':m.state==='waiting'?'One rival is waiting':m.due?'Enter by '+climbClock(m.due):'';
    return `<div class="cl-m">${side(m,0,r)}${side(m,1,r)}${foot?`<small class="cl-f">${foot}</small>`:''}</div>`}).join('')}</div>`).join('')}</div>`}
function climbRingsHTML(bs,ring){if(!bs||!bs.length)return '';const w=bs.filter(b=>b.k==='conqueror').length,p=bs.length;
  return `<h3>Crit Climb</h3><p>${w?`<b class="cl-gold">Crit Climb Conqueror</b> · ${w} crown${w>1?'s':''} in ${p} Climb${p>1?'s':''}`:`<b class="cl-silver">Crit Climb Competitor</b> · ${p} Climb${p>1?'s':''}`}</p>
    <ol class="sp-list cl-blist">${[...bs].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,10).map(b=>`<li class="${b.k==='conqueror'?'win':'loss'}"><span class="r">${b.k==='conqueror'?'1st':'—'}</span><span>${esc(b.name||'Crit Climb')}</span><small>${b.players||b.size} players</small></li>`).join('')}</ol>`}
// ?climb=CODE links open that lobby
addEventListener('load',()=>{const c=new URLSearchParams(location.search).get('climb');if(!c||!/^[A-Za-z2-9]{5}$/.test(c))return;CLIMB.cur=c.toUpperCase();
  try{history.replaceState(null,'',location.pathname)}catch(e){}if(S.screen==='setup'){S.duelMode=S.mode==='boss'?'cpu':S.mode;S.mode='climb';renderSetup()}});


// ---------- Solo Climb (free, in the browser): you + 3 Computers, Semifinal then Final, Standard rules ----------
// Rings are only won online; solo duels count like any Vs Computer duel.
const randHero=()=>ORDER[Math.floor(Math.random()*ORDER.length)];
function soloStart(){const you=(S.me&&S.me.name)||'You';
  S.solo={prevNoCal:S.noCal,prevLife:S.life,stage:'semi',e:[you,'Computer 1','Computer 2','Computer 3'],
    r:[[{a:0,b:1,w:null},{a:2,b:3,w:null,how:'cpu',heroes:[randHero(),randHero()]}],[{a:0,b:null,w:null}]],carry:[null,null],fin:null};
  // the other semifinal is played out by the arena's engine, so its winner carries its wounds into the Final
  const cs=S.solo.r[0][1],res=soloCpuDuel(cs.heroes);cs.w=res.winner;S.solo.fin={hero:cs.heroes[res.winner],carry:res.carry?res.carry[res.winner]:null};
  S.solo.r[1][0].b=cs.w===0?2:3;
  soloDuel()}
function soloCpuDuel(heroes){try{const E=ICYNEngine,seed=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),setup={heroes,life:100,wb1:true,climb:true},inputs=[];
  for(let n=0;n<3000;n++){const r=E.replay(seed,setup,inputs);if(r.result)return r.result;const q=r.pending;inputs.push({kind:q.kind,p:q.p??0,...(q.kind==='ability'?{choice:q.options[Math.floor(Math.random()*q.options.length)]}:{})})}}catch(e){console.error(e)}
  return {winner:Math.random()<.5?0:1}}
function soloDuel(){const Q=S.solo,fin=Q.stage==='final'&&Q.fin;S.mode='cpu';S.noCal=false;S.life=100;S.picks=[S.picks[0],fin?fin.hero:randHero()];
  startDuel();if(Q.stage==='final'){applyCarry([Q.carry[0],fin&&fin.carry]);renderAll()}}
function soloQuit(){if(!S.solo)return;S.noCal=S.solo.prevNoCal;S.life=S.solo.prevLife;S.solo=null}
function soloBracketHTML(){const Q=S.solo,row=(m,s)=>{const x=s?m.b:m.a;return `<div class="cl-p${m.w===s?' won':m.w!==null?' lost':''}${x===0?' me':''}"><span>${x===null?'…':esc(Q.e[x])}</span></div>`};
  return `<div class="cl-bracket solo" style="--cols:2">${Q.r.map((round,r)=>`<div class="cl-col"><h5>${r?'Final':'Semifinals'}</h5>${round.map(m=>`<div class="cl-m">${row(m,0)}${row(m,1)}</div>`).join('')}</div>`).join('')}</div>`}
function soloEnd(o,w){const Q=S.solo,won=w===0,m=Q.stage==='semi'?Q.r[0][0]:Q.r[1][0];m.w=won?0:1;
  const card=o.querySelector('.card'),btn=o.querySelector('#rematch'),nd=o.querySelector('#newd');
  let msg;
  if(won&&Q.stage==='semi'){Q.carry[0]=carryOfF(S.F[0]);Q.stage='final';msg=`<p class="cl-soloend">Semifinal won! <b>${esc(Q.e[Q.r[1][0].b])}</b>${Q.fin&&HEROES[Q.fin.hero]?` (${esc(HEROES[Q.fin.hero].name)}${Q.fin.carry?`, ${Q.fin.carry.life}/${Q.fin.carry.maxLife} Life`:''})`:''} waits in the Final. Your ${esc(S.F[0].h.name)} climbs on with ${Q.carry[0].life}/${Q.carry[0].maxLife} Life, stats, Weapon and Ability dice; every cooldown resets.</p>`;btn.textContent='On to the Final';btn.onclick=()=>{o.remove();soloDuel()}}
  else{Q.stage='done';msg=won?'<p class="cl-soloend">You conquered the Solo Climb! Take on real rivals online to earn the gold ring.</p>':'<p class="cl-soloend">Your Solo Climb ends here. Climb again?</p>';
    btn.textContent='Back to Crit Climb';btn.onclick=()=>{o.remove();soloQuit();S.token++;S.screen='setup';S.mode='climb';CLIMB.cur=null;renderSetup()}}
  nd.onclick=()=>{o.remove();soloQuit();S.token++;S.screen='setup';NETUI.phase='idle';renderSetup()};
  card.querySelector('.rec').insertAdjacentHTML('beforebegin',msg+soloBracketHTML())}
