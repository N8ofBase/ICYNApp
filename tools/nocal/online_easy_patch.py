#!/usr/bin/env python3
"""Easy mode for Online duels + Game Mode in stats (N8 2026-11-06). Apply after nocal_patch.py.
The page sends easy:true when creating an online duel, reads setup.easy from the server's start event,
and sends gameMode ('easy'|'standard') with each recorded duel. My Stats shows a record per mode.
Usage: online_easy_patch.py index.html [src.html ...]"""
import sys

REPS = [
 # Game Mode choice for Online too (the old Starting Life choice is gone)
 ("""${S.mode==='online'?`<div class="opt"><span>Starting Life</span><div class="mode" role="group" aria-label="Starting Life"><button id="l-50" aria-pressed="${S.life===50}">50 · Quick Game</button><button id="l-100" aria-pressed="${S.life===100}">100 · Standard</button></div></div>`:`<div class="opt"><span>Game Mode</span>""",
  """${`<div class="opt"><span>Game Mode</span>"""),
 # How to Play on the setup page follows the chosen mode
 ("""<li><b>“Face the arena’s curse!”</b> ${noCal()?""", """<li><b>“Face the arena’s curse!”</b> ${S.noCal?"""),
 # online duels: Easy comes from the server's setup
 ("const noCal=()=>!!S.noCal&&S.mode!=='online'&&S.mode!=='boss';",
  "const noCal=()=>S.mode==='online'?!!NET.easy:(!!S.noCal&&S.mode!=='boss');"),
 ("if(st&&st.setup)S.life=Number(st.setup.life)||S.life;",
  "if(st&&st.setup)S.life=Number(st.setup.life)||S.life;NET.easy=!!(st&&st.setup&&st.setup.easy);"),
 ("""<span class="who">${esc(HEROES[S.picks[0]].name)} · ${S.life} Life</span>Create online duel</button>""",
  """<span class="who">${esc(HEROES[S.picks[0]].name)} · ${S.noCal?'Easy':'Standard'}</span>Create online duel</button>"""),
 # tagline (N8 2026-11-06)
 ("step into the ring, and pray the dice love you.", "step into the ring, and may the D20 favor you."),
 ("<small>The duel’s creator sets the Starting Life.</small>", "<small>The duel’s creator sets the Game Mode.</small>"),
 ("el.querySelector('#nb-create').onclick=()=>netCall(()=>O.create(S.picks[0],S.life));",
  "el.querySelector('#nb-create').onclick=()=>netCall(()=>O.create(S.picks[0],S.noCal?50:100,!!S.noCal));"),
 # stats: send the mode with each duel, show a record per mode
 ("startingLife:S.life,maxLife:Math.max(p1.peakMax||0,p1.maxLife)};",
  "startingLife:S.life,maxLife:Math.max(p1.peakMax||0,p1.maxLife),gameMode:noCal()?'easy':'standard'};"),
 ("""<p>Favorite Hero: <b>${esc(st.favoriteHero||'—')}</b> · ${st.played} ranked duels vs Computer</p>""",
  """<p>Favorite Hero: <b>${esc(st.favoriteHero||'—')}</b> · ${st.played} ranked duels</p>
        ${st.modes&&(st.modes.easy||st.modes.standard)?`<div class="sp-grid">${['easy','standard'].map(k=>{const r=st.modes[k]||{};return cell(k==='easy'?'Easy record':'Standard record',`${r.wins||0}–${r.losses||0}${r.draws?'–'+r.draws:''}`)}).join('')}</div>`:''}"""),
 ("""<small>${m.mode==='pnp'?'Pass & Play':(m.ko?'KO R'+m.rounds:'8 rounds')}</small>""",
  """<small>${m.gameMode==='easy'?'Easy · ':''}${m.mode==='pnp'?'Pass & Play':(m.ko?'KO R'+m.rounds:'8 rounds')}</small>"""),
]

for path in sys.argv[1:]:
    s = open(path, encoding='utf-8').read()
    if 'NET.easy=' in s:
        print(path, 'already patched'); continue
    if 'icyn.easy' not in s:
        sys.exit(f'{path}: run nocal_patch.py first')
    for a, b in REPS:
        n = s.count(a)
        if n != 1: sys.exit(f'{path}: expected 1 match, found {n}: {a[:70]!r}')
        s = s.replace(a, b)
    open(path, 'w', encoding='utf-8').write(s)
    print(path, 'patched')
