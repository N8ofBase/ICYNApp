"""Adds Crit Climb tournaments to index.html (run from the repo root: python3 tools/climb/climb_patch.py index.html).
Idempotent: does nothing if the page already has renderClimbSetup. Needs stats.js and online.js from the same commit."""
import sys, pathlib
here = pathlib.Path(__file__).parent
p = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'index.html')
s = p.read_text(encoding='utf-8')
if 'function renderClimbSetup' in s:
    print('already patched'); sys.exit(0)
def rep(a, b, count=1):
    global s
    n = s.count(a)
    assert n == count, f'expected {count} of: {a[:90]!r}, found {n}'
    s = s.replace(a, b)

css = (here / 'climb.css').read_text(encoding='utf-8')
rep('</style>', css + '</style>')
js = (here / 'climb_ui.js').read_text(encoding='utf-8')
rep('// ---------- Online lobby (online.js: create/join by code, server referees) ----------', js + '// ---------- Online lobby (online.js: create/join by code, server referees) ----------')

# third game button
rep('''function gameRow(){return `<div class="mode game" role="group" aria-label="Game"><button id="g-duel" aria-pressed="${S.mode!=='boss'}">Duel</button><button id="g-boss" aria-pressed="${S.mode==='boss'}">Starvos Catastrophe${lockTag()}</button></div>`}
function wireGameRow(){$('#g-duel').onclick=()=>{if(S.mode==='boss'){S.mode=S.duelMode||'cpu';renderSetup()}};$('#g-boss').onclick=()=>{if(S.mode!=='boss'){S.duelMode=S.mode;S.mode='boss';renderSetup()}}}''',
'''function gameRow(){return `<div class="mode game" role="group" aria-label="Game"><button id="g-duel" aria-pressed="${S.mode!=='boss'&&S.mode!=='climb'}">Duel</button><button id="g-boss" aria-pressed="${S.mode==='boss'}">Starvos Catastrophe${lockTag()}</button>${CLIMB_ON()?`<button id="g-climb" aria-pressed="${S.mode==='climb'}">Crit Climb${lockTag()}</button>`:''}</div>`}
function wireGameRow(){const keep=()=>{if(S.mode!=='boss'&&S.mode!=='climb')S.duelMode=S.mode};
  $('#g-duel').onclick=()=>{if(S.mode==='boss'||S.mode==='climb'){S.mode=S.duelMode||'cpu';renderSetup()}};$('#g-boss').onclick=()=>{if(S.mode!=='boss'){keep();S.mode='boss';renderSetup()}};
  if($('#g-climb'))$('#g-climb').onclick=()=>{if(S.mode!=='climb'){keep();S.mode='climb';renderSetup()}}}''')
rep("  if(S.mode==='boss')return renderBossSetup();\n", "  if(S.mode==='boss')return renderBossSetup();\n  if(S.mode==='climb')return renderClimbSetup();\n")

# Crit Pass card
rep("const UL_WHY={online:'Duel your friends online',", "const UL_WHY={climb:'Enter the Crit Climb',online:'Duel your friends online',")
rep('<li><b>The Starvos Catastrophe</b>, alone or with up to 4 friends</li><li><b>Print &amp; Play</b>',
    '<li><b>The Starvos Catastrophe</b>, alone or with up to 4 friends</li><li><b>Crit Climb</b> tournaments for 4, 8 or 16 players</li><li><b>Print &amp; Play</b>')

# online duel hooks
rep("ICYNOnline.onError((e,m)=>{NETUI.busy=false;if(m&&m.action==='nudge'&&NET.silent)return;NETUI.err=e;if(S.screen==='setup'){if(S.mode==='boss')renderBossNet();else renderNetBox()}else toast(e)});",
    "ICYNOnline.onError((e,m)=>{NETUI.busy=false;if(m&&m.action==='nudge'&&NET.silent)return;NETUI.err=e;if(S.screen==='setup'){if(S.mode==='boss')renderBossNet();else if(S.mode==='climb'){CLIMB.err=e;CLIMB.busy=false;renderClimb()}else renderNetBox()}else toast(e)});")
rep("  if(game.mode==='boss')return onBossNetState(game);\n",
    "  if(game.mode==='boss')return onBossNetState(game);\n  if(game.climb&&game.status==='waiting'){CLIMB.waiting=game;CLIMB.busy=false;CLIMB.cur=game.climb.id;if(S.screen==='setup'){if(S.mode!=='climb'){S.mode='climb';renderSetup()}else renderClimb()}return}\n")
rep("  Object.assign(NET,{you:game.you,gameId:game.gameId,used:new Set(),waiters:[],ended:false,fastUntil:0});",
    "  Object.assign(NET,{you:game.you,gameId:game.gameId,used:new Set(),waiters:[],ended:false,fastUntil:0,climb:game.climb||null});CLIMB.waiting=null;")
rep("$('#modelbl').textContent=(S.mode==='online'?'Online vs '+rivalName():",
    "$('#modelbl').textContent=(S.mode==='online'?(NET.climb?'Crit Climb '+climbRound(NET.climb.r,NET.climb.rounds)+' vs ':'Online vs ')+rivalName():")
rep("<button class=\"act\" id=\"rematch\">${S.mode==='online'?'New online duel':'Rematch'}</button>",
    "<button class=\"act\" id=\"rematch\">${S.mode==='online'?(NET.climb?'Back to Crit Climb':'New online duel'):'Rematch'}</button>")
rep("o.querySelector('#rematch').onclick=()=>{o.remove();if(S.mode==='online'){S.token++;S.screen='setup';NETUI.phase='idle';renderSetup()}",
    "o.querySelector('#rematch').onclick=()=>{o.remove();if(S.mode==='online'){S.token++;S.screen='setup';NETUI.phase='idle';if(NET.climb){S.mode='climb';CLIMB.cur=NET.climb.id}renderSetup()}")
rep("if(S.mode==='online'){el.innerHTML='<span>Ranked online result saved by the arena.</span>';",
    "if(S.mode==='online'){el.innerHTML=NET.climb?'<span>Ranked result saved. The Crit Climb bracket is updated.</span>':'<span>Ranked online result saved by the arena.</span>';")

# Solo Climb hooks
rep("  recordResult(w,ko,o.querySelector('#endrec'));\n}", "  recordResult(w,ko,o.querySelector('#endrec'));\n  if(S.solo&&S.mode==='cpu')soloEnd(o,w);\n}")
rep("$('#modelbl').textContent=(", "$('#modelbl').textContent=(S.solo&&S.mode==='cpu'?'Solo Climb '+(S.solo.stage==='final'?'Final':'Semifinal')+' · ':'')+(")
rep("function renderSetup(){SFX.music('menu');", "function renderSetup(){SFX.music('menu');soloQuit();")

# rings: account chip, My Stats, leaderboard
rep("S.owner=!!(r&&r.owner);", "S.owner=!!(r&&r.owner);S.ring=(r&&r.ring)||'';")
rep('${avHTML(myAvatar(),26,(S.me&&S.me.name)||u.name||u.email)}', '${ringAv(myAvatar(),26,(S.me&&S.me.name)||u.name||u.email,S.ring)}')
rep('<div class="sp-av">${avHTML(myAvatar(),56,st.name)}', '<div class="sp-av">${ringAv(myAvatar(),56,st.name,me.ring)}')
rep("return avHTML(mine?myAvatar():x.avatar,24,x.name)", "return ringAv(mine?myAvatar():x.avatar,24,x.name,x.ring)")
rep("        ${st.currentStreak?`<div>${streakBadge(st.currentStreak)}</div>`:''}\n",
    "        ${st.currentStreak?`<div>${streakBadge(st.currentStreak)}</div>`:''}\n        ${climbRingsHTML(me.badges,me.ring)}\n")
p.write_text(s, encoding='utf-8')
print('patched', p)
# leaderboard name: show why a save was refused (unfriendly names)
s = p.read_text(encoding='utf-8')
a = "b.querySelector('#sp-save').onclick=async()=>{const n=b.querySelector('#sp-nm').value.trim();if(!n)return;const r=await ICYNStats.setProfile({name:n});b.querySelector('#sp-save').textContent=r?'Saved':'Try again'};"
assert s.count(a) == 1
s = s.replace(a, "b.querySelector('#sp-save').onclick=async()=>{const n=b.querySelector('#sp-nm').value.trim();if(!n)return;const r=ICYNStats.setName?await ICYNStats.setName(n):await ICYNStats.setProfile({name:n});const bad=r&&r.error;b.querySelector('#sp-save').textContent=r&&!bad?'Saved':'Try again';if(bad)toast(r.error);else if(r){S.me=r.stats||S.me;renderAcct()}};")
p.write_text(s, encoding='utf-8')
