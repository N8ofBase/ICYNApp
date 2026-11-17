"""Weapon Broken for one round + Crit Climb carryover (N8 2026-11-17), on index.html.
Run from the repo root: python3 tools/carry/carry_patch.py index.html   (idempotent; also patches tools/climb/climb_ui.js)
- Weapon Broken spoils only the Hero's next round of attacks: broken before this round's swing -> repaired at the end of
  this round; broken during or after it (a fumble, a lost turn) -> the next round. A Hero who never swings keeps it broken
  until a round where they do. Same rule as backend/ws/engine.mjs (setup.wb1) and boss.mjs (rules v4).
- Crit Climb: after a win your Hero is locked for the Climb and carries Life, Max Life, stats, Weapon dice and Ability dice
  into the next match; cooldowns reset and the weapon starts whole. Solo Climb does the same, and the Computer's off-screen
  semifinal is played by the server's engine (embedded below as ICYNEngine) so its finalist carries its wounds too."""
import sys, re, pathlib
root = pathlib.Path(__file__).resolve().parents[2]
p = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else root / 'index.html')
s = p.read_text(encoding='utf-8')
def rep(a, b, count=1):
    global s
    if b in s: return  # already patched
    n = s.count(a)
    assert n == count, f'expected {count} of: {a[:100]!r}, found {n}'
    s = s.replace(a, b)

# ---- Weapon Broken: one round ----
rep("case 'broken':{const was=f.broken;f.broken=true;f.brokenUntil=S.round+1;",
    "case 'broken':{const was=f.broken;f.broken=true;f.brokenUntil=f.swing===S.round?S.round+1:S.round; // N8 2026-11-17: one round of attacks\n        ")
rep("const until=f.brokenUntil>8?'for the rest of the duel':`through round ${f.brokenUntil}`;",
    "const until=f.brokenUntil>8?'for the rest of the duel':f.brokenUntil===S.round?'for this round':'for round '+f.brokenUntil;")
rep("async function weaponAttack(p,label,t){\n  const f=S.F[p],r=S.F[1-p],q=1-p;\n",
    "async function weaponAttack(p,label,t){\n  const f=S.F[p],r=S.F[1-p],q=1-p;f.swing=S.round;\n")
rep("async function bossWeapon(p,label,t){\n  const f=S.F[p],B=S.boss;\n",
    "async function bossWeapon(p,label,t){\n  const f=S.F[p],B=S.boss;f.swing=S.round;\n")
rep("for(const f of S.F)if(f.broken&&S.round>=f.brokenUntil){f.broken=false;log(`<b>${f.h.name}</b>'s weapon is repaired`,f.p)}",
    "repairWeapons();", 2)
rep("function chipsFor(f){",
    "// End of round: a broken weapon is mended once its Hero has swung with it for a round; a Hero who sat out keeps it broken for their next round.\n"
    "function repairWeapons(){for(const f of S.F){if(!f.broken||S.round<f.brokenUntil)continue;if(f.swing!==S.round&&f.life>0){f.brokenUntil=S.round+1;continue}f.broken=false;log(`<b>${f.h.name}</b>'s weapon is repaired`,f.p)}}\n"
    "function chipsFor(f){")
rep("<b>“Mind your blade!”</b> A broken weapon stays broken through the next round, unless an Enhancement reforges it stronger than before.",
    "<b>“Mind your blade!”</b> A broken weapon spoils only your next round of attacks (no Main bonus to hit or to damage), then it is mended. An Enhancement can reforge it stronger before then.")
rep("Broken through R${f.brokenUntil}", "Broken for R${f.brokenUntil}", 2)
rep("broken through R${f.brokenUntil}", "broken for R${f.brokenUntil}")

# ---- online: start from the arena's opening snapshot (Crit Climb carryover) ----
rep("  S.F=S.picks.map((id,p)=>makeFighter(id,p));S.round=1;S.active=null;S.view=NET.you;",
    "  S.F=S.picks.map((id,p)=>makeFighter(id,p));if(st&&Array.isArray(st.F))applyCarry(st.F);S.round=1;S.active=null;S.view=NET.you;")
rep("function makeFighter(id,p){",
    "// Crit Climb carryover: a Hero enters with the Life, stats, Weapon and Ability dice it ended its last match with (cooldowns reset).\n"
    "function applyCarry(C){(C||[]).forEach((c,p)=>{const f=S.F[p];if(!f||!c)return;for(const k of ['maxLife','life','def','power','energy','speed','charm','weaponDice'])if(Number.isFinite(c[k]))f[k]=c[k];\n"
    "  (c.dice||(c.abilities||[]).map(a=>a.dice)).forEach((d,k)=>{if(f.abilities[k]&&Number.isFinite(d))f.abilities[k].dice=d});f.broken=false;f.abilities.forEach(a=>a.cd=false)})}\n"
    "const carryOfF=f=>({life:Math.max(1,f.life),maxLife:f.maxLife,def:f.def,power:f.power,energy:f.energy,speed:f.speed,charm:f.charm,weaponDice:f.weaponDice,dice:f.abilities.map(a=>a.dice)});\n"
    "function makeFighter(id,p){")

open_climb = (root / 'tools/climb/climb_ui.js')
ui = open_climb.read_text(encoding='utf-8')
def both(a, b, count=1):
    global s, ui
    rep(a, b, count)
    if b in ui: return
    assert ui.count(a) == count, f'climb_ui.js: expected {count} of {a[:90]!r}'
    ui = ui.replace(a, b)

# ---- Crit Climb page ----
both("<li><b>Every match is a Standard online duel</b>: 100 Life and a Calamity before every turn. Pick any Hero for each match.</li>",
     "<li><b>Every match is a Standard online duel</b>: 100 Life and a Calamity before every turn. Pick your Hero for your first match.</li>\n"
     "     <li><b>Your Hero climbs on as they are.</b> Win, and your Hero carries their Life, stats, Weapon and leveled Ability dice into the next match. Every Ability comes off cooldown and the weapon is mended, but wounds stay, so win well!</li>")
both("""  const {r,m,side,ready}=mine,rival=side?m.a:m.b,label=`${esc(t.name)} · ${climbRound(r,t.rounds.length)}`;""",
     """  const {r,m,side,ready}=mine,rival=side?m.a:m.b,label=`${esc(t.name)} · ${climbRound(r,t.rounds.length)}`,me=t.entrants[mine.e],lock=me&&HEROES[me.hero]?me.hero:null,c=me&&me.carry,re=t.entrants[rival];
  const rivalHero=re&&HEROES[re.hero]?` <small>(${esc(HEROES[re.hero].name)}${re.carry?` · ${re.carry.life}/${re.carry.maxLife} Life`:''})</small>`:'';""")
both("""    <p>Your rival: <b>${entrantName(t,rival)}</b>${t.entrants[rival].cpu?' <small>(the Computer picks its Hero; the duel starts as soon as you enter)</small>':''}""",
     """    <p>Your rival: <b>${entrantName(t,rival)}</b>${rivalHero}${t.entrants[rival].cpu?` <small>(${re.hero?'':'the Computer picks its Hero; '}the duel starts as soon as you enter)</small>`:''}""")
both("""    <div class="roster cl-roster">${ORDER.map(id=>`<button class="pick" data-clh="${id}" style="--c:${HEROES[id].color}" aria-pressed="${S.picks[0]===id}"><img src="${SEL[id]}" alt="" style="--sc:${HEROES[id].scale}"><span>${HEROES[id].name}</span></button>`).join('')}</div>
    <button class="act begin" id="cl-go" ${CLIMB.busy?'disabled':''}><span class="who">${esc(HEROES[S.picks[0]].name)} · Standard · 100 Life</span>""",
     """    ${lock?climbCarryHTML(lock,c):`<div class="roster cl-roster">${ORDER.map(id=>`<button class="pick" data-clh="${id}" style="--c:${HEROES[id].color}" aria-pressed="${S.picks[0]===id}"><img src="${SEL[id]}" alt="" style="--sc:${HEROES[id].scale}"><span>${HEROES[id].name}</span></button>`).join('')}</div>`}
    <button class="act begin" id="cl-go" ${CLIMB.busy?'disabled':''}><span class="who">${esc(HEROES[lock||S.picks[0]].name)} · Standard · ${c?c.life+'/'+c.maxLife:100} Life</span>""")
both("""function wireClimbMatch(el,t){""",
     """// Your locked Hero and what it carries into this match
function climbCarryHTML(id,c){const h=HEROES[id],up=c?h.abilities.map((a,k)=>c.dice&&c.dice[k]>a.dice?`${esc(a.name)} ${c.dice[k]}D6`:'').filter(Boolean):[];
  const st=c?['def','power','energy','speed','charm'].map(k=>`<span${c[k]>h.stats[k]?' class="up"':c[k]<h.stats[k]?' class="down"':''}>${k==='def'?'Defense':cap(k)} ${c[k]}</span>`).join(''):'';
  return `<div class="cl-carry" style="--c:${h.color}"><img src="${SEL[id]}" alt=""><div><b>${esc(h.name)}</b> <small>climbs on</small>${c?`<p>${c.life}/${c.maxLife} Life · Weapon ${c.weaponDice}D6${up.length?' · '+up.join(', '):''}</p><p class="cl-st">${st}</p>`:''}</div></div>`}
function wireClimbMatch(el,t){""")
both("""Promise.resolve().then(()=>ICYNOnline.climb(t.code,S.picks[0]))""",
     """const mm=climbMine(t),lk=mm&&t.entrants[mm.e]&&HEROES[t.entrants[mm.e].hero]?t.entrants[mm.e].hero:S.picks[0];Promise.resolve().then(()=>ICYNOnline.climb(t.code,lk))""")

# ---- Solo Climb carryover ----
both("""    r:[[{a:0,b:1,w:null},{a:2,b:3,w:Math.random()<.5?0:1,how:'cpu',heroes:[randHero(),randHero()]}],[{a:0,b:null,w:null}]]};
  S.solo.r[1][0].b=S.solo.r[0][1].w===0?2:3;
  soloDuel()}
function soloDuel(){S.mode='cpu';S.noCal=false;S.life=100;S.picks=[S.picks[0],randHero()];startDuel()}""",
     """    r:[[{a:0,b:1,w:null},{a:2,b:3,w:null,how:'cpu',heroes:[randHero(),randHero()]}],[{a:0,b:null,w:null}]],carry:[null,null],fin:null};
  // the other semifinal is played out by the arena's engine, so its winner carries its wounds into the Final
  const cs=S.solo.r[0][1],res=soloCpuDuel(cs.heroes);cs.w=res.winner;S.solo.fin={hero:cs.heroes[res.winner],carry:res.carry?res.carry[res.winner]:null};
  S.solo.r[1][0].b=cs.w===0?2:3;
  soloDuel()}
function soloCpuDuel(heroes){try{const E=ICYNEngine,seed=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),setup={heroes,life:100,wb1:true,climb:true},inputs=[];
  for(let n=0;n<3000;n++){const r=E.replay(seed,setup,inputs);if(r.result)return r.result;const q=r.pending;inputs.push({kind:q.kind,p:q.p??0,...(q.kind==='ability'?{choice:q.options[Math.floor(Math.random()*q.options.length)]}:{})})}}catch(e){console.error(e)}
  return {winner:Math.random()<.5?0:1}}
function soloDuel(){const Q=S.solo,fin=Q.stage==='final'&&Q.fin;S.mode='cpu';S.noCal=false;S.life=100;S.picks=[S.picks[0],fin?fin.hero:randHero()];
  startDuel();if(Q.stage==='final'){applyCarry([Q.carry[0],fin&&fin.carry]);renderAll()}}""")
both("""  if(won&&Q.stage==='semi'){Q.stage='final';""",
     """  if(won&&Q.stage==='semi'){Q.carry[0]=carryOfF(S.F[0]);Q.stage='final';""")
both("""<b>${esc(Q.e[Q.r[1][0].b])}</b> waits in the Final.</p>`;""",
     """<b>${esc(Q.e[Q.r[1][0].b])}</b>${Q.fin&&HEROES[Q.fin.hero]?` (${esc(HEROES[Q.fin.hero].name)}${Q.fin.carry?`, ${Q.fin.carry.life}/${Q.fin.carry.maxLife} Life`:''})`:''} waits in the Final. Your ${esc(S.F[0].h.name)} climbs on with ${Q.carry[0].life}/${Q.carry[0].maxLife} Life, stats, Weapon and Ability dice; every cooldown resets.</p>`;""")
both("""<p>You and 3 Computers in a 4 Hero bracket. Win the Semifinal, then the Final.</p>""",
     """<p>You and 3 Computers in a 4 Hero bracket. Win the Semifinal, then the Final. Your Hero carries their Life, stats and dice into the Final.</p>""")
open_climb.write_text(ui, encoding='utf-8')

# ---- styles for the carried-Hero card ----
rep("</style>", ".cl-carry{display:flex;gap:12px;align-items:center;margin:10px 0;padding:8px 12px;border:1px solid var(--c);border-radius:10px;background:rgba(0,0,0,.18)}\n"
    ".cl-carry img{width:56px;height:56px;object-fit:contain}.cl-carry p{margin:2px 0;font-size:.85rem}.cl-carry small{opacity:.75}\n"
    ".cl-carry .cl-st{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:.78rem;opacity:.9}.cl-carry .up{color:#7fdc8f}.cl-carry .down{color:#ff9aa4}\n</style>"
    if ".cl-carry{" not in s else "</style>", 1 if ".cl-carry{" not in s else s.count("</style>"))

# ---- the arena's duel engine, for Solo Climb's off-screen semifinal (kept in sync with backend/ws/engine.mjs) ----
eng = (root / 'backend/ws/engine.mjs').read_text(encoding='utf-8')
eng = re.sub(r'^export ', '', eng, flags=re.M)
block = '// ICYNEngine:start (generated by tools/carry/carry_patch.py from backend/ws/engine.mjs)\nconst ICYNEngine=(()=>{\n' + eng + '\nreturn {replay,carryOf,HEROES};})();\n// ICYNEngine:end\n'
if '// ICYNEngine:start' in s:
    s = re.sub(r'// ICYNEngine:start.*?// ICYNEngine:end\n', lambda m: block, s, flags=re.S)
else:
    rep("// ---------- Solo Climb (free, in the browser)", block + "// ---------- Solo Climb (free, in the browser)")
p.write_text(s, encoding='utf-8')
print('patched', p)
