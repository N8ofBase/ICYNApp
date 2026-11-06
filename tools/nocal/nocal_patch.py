#!/usr/bin/env python3
"""No Calamities option (N8 2026-11-06): Calamities only on natural 1s; Enhancements still on natural 20s
and at the end of every round. Toggle sits next to Starting Life on the duel setup (Vs Computer and
Pass & Play; Online duels keep the server's rules). Usage: nocal_patch.py index.html [src.html ...]"""
import sys

REPS = [
 # state: remembered choice
 ("const S = {screen:'setup', mode:'cpu', life:100,",
  "const S = {screen:'setup', mode:'cpu', life:100, noCal:(()=>{try{return localStorage.getItem('icyn.nocal')==='1'}catch(e){return false}})(),"),
 # toggle beside Starting Life
 ("""<button id="l-100" aria-pressed="${S.life===100}">100 · Standard</button></div></div>""",
  """<button id="l-100" aria-pressed="${S.life===100}">100 · Standard</button></div></div>
     ${S.mode==='online'?'':`<div class="opt"><span>Calamities</span><div class="mode" role="group" aria-label="Calamities"><button id="c-on" aria-pressed="${!S.noCal}">Every Turn</button><button id="c-off" aria-pressed="${S.noCal}">No Calamities</button></div></div>`}"""),
 ("""$('#l-50').onclick=()=>{S.life=50;renderSetup()};$('#l-100').onclick=()=>{S.life=100;renderSetup()};""",
  """$('#l-50').onclick=()=>{S.life=50;renderSetup()};$('#l-100').onclick=()=>{S.life=100;renderSetup()};
  const setCal=v=>{S.noCal=v;try{localStorage.setItem('icyn.nocal',v?'1':'0')}catch(e){}renderSetup()};
  if($('#c-on')){$('#c-on').onclick=()=>setCal(false);$('#c-off').onclick=()=>setCal(true)}"""),
 # How to Play step 2 follows the choice
 ("""<li><b>“Face the arena’s curse!”</b> No Hero enters these sands unchallenged. Before each turn, the arena lays a Calamity upon you. Read the scroll and endure it.</li>""",
  """<li><b>“Face the arena’s curse!”</b> ${noCal()?'Today the arena shows mercy: no Calamity before your turn. Only a natural 1 calls one down upon you.':'No Hero enters these sands unchallenged. Before each turn, the arena lays a Calamity upon you. Read the scroll and endure it.'}</li>"""),
 # header label
 ("""+' · '+(S.life===50?'Quick Game':'Standard')+' · '+S.life+' Life';""",
  """+' · '+(S.life===50?'Quick Game':'Standard')+' · '+S.life+' Life'+(noCal()?' · No Calamities':'');"""),
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
    if 'icyn.nocal' in s:
        print(path, 'already patched'); continue
    for a, b in REPS:
        n = s.count(a)
        if n != 1: sys.exit(f'{path}: expected 1 match, found {n}: {a[:70]!r}')
        s = s.replace(a, b)
    open(path, 'w', encoding='utf-8').write(s)
    print(path, 'patched')
