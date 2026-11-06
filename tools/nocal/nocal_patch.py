#!/usr/bin/env python3
"""Easy / Standard game modes (N8 2026-11-06). Easy = 50 Life + No Calamities: Calamities only on natural 1s; Enhancements still on natural 20s
and at the end of every round. One Game Mode choice replaces Starting Life on the duel setup for Vs Computer and
Pass & Play; Online keeps the Starting Life choice and the server's rules. Usage: nocal_patch.py index.html [src.html ...]"""
import sys

REPS = [
 # state: remembered choice
 # state: remembered Easy/Standard choice (N8 2026-11-06: Easy = 50 Life + No Calamities, Standard = 100 Life + Calamities every turn)
 ("const S = {screen:'setup', mode:'cpu', life:100,",
  "const EASY0=(()=>{try{return localStorage.getItem('icyn.easy')==='1'}catch(e){return false}})();\nconst S = {screen:'setup', mode:'cpu', life:EASY0?50:100, noCal:EASY0,"),
 # one Game Mode choice (Vs Computer, Pass & Play); Online keeps the Starting Life choice (the server runs Calamities every turn)
 ("""<div class="opt"><span>Starting Life</span><div class="mode" role="group" aria-label="Starting Life"><button id="l-50" aria-pressed="${S.life===50}">50 · Quick Game</button><button id="l-100" aria-pressed="${S.life===100}">100 · Standard</button></div></div>""",
  """${S.mode==='online'?`<div class="opt"><span>Starting Life</span><div class="mode" role="group" aria-label="Starting Life"><button id="l-50" aria-pressed="${S.life===50}">50 · Quick Game</button><button id="l-100" aria-pressed="${S.life===100}">100 · Standard</button></div></div>`:`<div class="opt"><span>Game Mode</span><div class="mode" role="group" aria-label="Game Mode"><button id="g-easy" aria-pressed="${!!S.noCal}">Easy</button><button id="g-std" aria-pressed="${!S.noCal}">Standard</button></div><small class="opt-note">${S.noCal?'50 Life · Calamities only on a natural 1':'100 Life · a Calamity before every turn'}</small></div>`}"""),
 ("""$('#l-50').onclick=()=>{S.life=50;renderSetup()};$('#l-100').onclick=()=>{S.life=100;renderSetup()};""",
  """if($('#l-50')){$('#l-50').onclick=()=>{S.life=50;renderSetup()};$('#l-100').onclick=()=>{S.life=100;renderSetup()}}
  const setEasy=v=>{S.noCal=v;S.life=v?50:100;try{localStorage.setItem('icyn.easy',v?'1':'0')}catch(e){}renderSetup()};
  if($('#g-easy')){$('#g-easy').onclick=()=>setEasy(true);$('#g-std').onclick=()=>setEasy(false)}"""),
 (".opt>span{font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}",
  ".opt>span{font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}\n.opt-note{font-size:.78rem;color:var(--muted)}"),
 # How to Play step 2 follows the choice
 ("""<li><b>“Face the arena’s curse!”</b> No Hero enters these sands unchallenged. Before each turn, the arena lays a Calamity upon you. Read the scroll and endure it.</li>""",
  """<li><b>“Face the arena’s curse!”</b> ${noCal()?'Today the arena shows mercy: no Calamity before your turn. Only a natural 1 calls one down upon you.':'No Hero enters these sands unchallenged. Before each turn, the arena lays a Calamity upon you. Read the scroll and endure it.'}</li>"""),
 # header label
 ("""+' · '+(S.life===50?'Quick Game':'Standard')+' · '+S.life+' Life';""",
  """+' · '+(noCal()?'Easy':S.mode==='online'?(S.life===50?'Quick Game':'Standard'):'Standard')+' · '+S.life+' Life'+(noCal()?' · No Calamities':'');"""),
 # the rule itself
 ("""  readout(`${f.h.name}'s turn`,'Roll for a Calamity to begin.');
  await sleep(REDUCED?100:600);chk(t);
  await tableRoll(p,'cal',t,true);if(over())return;""",
  """  readout(`${f.h.name}'s turn`,noCal()?'Draw your weapon.':'Roll for a Calamity to begin.');
  await sleep(REDUCED?100:600);chk(t);
  if(!noCal()){await tableRoll(p,'cal',t,true);if(over())return}"""),
 ("async function takeTurn(p,t){",
  "// No Calamities (N8 2026-11-06): skip the Calamity before each turn; natural 1s still bring one. Online duels follow the server's rules.\nconst noCal=()=>!!S.noCal&&S.mode!=='online'&&S.mode!=='boss';\nasync function takeTurn(p,t){"),
]

for path in sys.argv[1:]:
    s = open(path, encoding='utf-8').read()
    if 'icyn.easy' in s:
        print(path, 'already patched'); continue
    for a, b in REPS:
        n = s.count(a)
        if n != 1: sys.exit(f'{path}: expected 1 match, found {n}: {a[:70]!r}')
        s = s.replace(a, b)
    open(path, 'w', encoding='utf-8').write(s)
    print(path, 'patched')
