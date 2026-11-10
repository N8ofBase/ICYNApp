// ---------- Open games (N8 2026-11-10): public Online duels and Starvos battles anyone can join ----------
// A host picks Public when creating; the arena lists the game (GET /games/open) until it starts, fills or closes.
const OG={duel:null,boss:null,t:0};
const pubToggle=()=>`<div class="mode og-pub" role="group" aria-label="Who can join"><button data-pub="0" aria-pressed="${!NETUI.pub}">Private · code only</button><button data-pub="1" aria-pressed="${!!NETUI.pub}">Public · anyone</button></div>`;
function wirePub(el,rerender){el.querySelectorAll('[data-pub]').forEach(b=>b.onclick=()=>{NETUI.pub=b.dataset.pub==='1';try{localStorage.setItem('icyn.pub',NETUI.pub?'1':'0')}catch(e){}rerender()})}
try{NETUI.pub=localStorage.getItem('icyn.pub')==='1'}catch(e){}
function ogHTML(mode){const L=OG[mode];
  return `<div class="og" id="og-${mode}"><h4>Open ${mode==='boss'?'battles':'duels'}<button class="linkish" data-ogr>Refresh</button></h4>${!L?'<p class="og-empty">Looking for open games…</p>':!L.length?`<p class="og-empty">No open ${mode==='boss'?'battles':'duels'} right now. Make yours Public and others can find it here.</p>`
    :`<ul>${L.map(g=>`<li><span class="og-who"><b>${esc(g.host)}</b><small>${mode==='boss'?`${g.players} of ${g.seats} players${g.heroes.length?' · '+esc(g.heroes.join(', ')):''}`:`${esc(g.hero||'')} · ${g.easy?'Easy · 50 Life':'Standard · 100 Life'}`}</small></span><button class="ghost og-join" data-ogj="${esc(g.code)}" ${NETUI.busy?'disabled':''}>Join</button></li>`).join('')}</ul>`}</div>`}
function wireOG(el,mode){const O=window.ICYNOnline;
  el.querySelectorAll('[data-ogr]').forEach(b=>b.onclick=()=>ogLoad(mode));
  el.querySelectorAll('[data-ogj]').forEach(b=>b.onclick=()=>{const c=b.dataset.ogj;netCall(()=>mode==='boss'?O.joinBoss(c):O.join(c,S.picks[0]))})}
async function ogLoad(mode){if(!window.ICYNStats||!ICYNStats.openGames)return;const r=await ICYNStats.openGames(mode);if(Array.isArray(r))OG[mode]=r;else if(!OG[mode])OG[mode]=[];
  const el=$('#og-'+mode);if(el){const d=document.createElement('div');d.innerHTML=ogHTML(mode);el.replaceWith(d.firstChild);wireOG($('#og-'+mode).parentNode,mode)}}
setInterval(()=>{if(document.hidden||S.screen!=='setup')return;if($('#og-duel'))ogLoad('duel');if($('#og-boss'))ogLoad('boss')},12000);

