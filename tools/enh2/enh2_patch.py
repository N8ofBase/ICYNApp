"""Enhancement table v2 + Easy at 75 Life (N8 2026-11-25). Run from anywhere: python3 tools/enh2/enh2_patch.py  (idempotent)
Enhancements: 4-7 stat +1 only (no +3 Max & Life); 10-12 +3 Max & Life with their bonus; 15 Main +1 + Weapon Increase;
16 Random Stat +1 + Random Ability Increase; 17 Main +2 + Clear Cooldowns (no Life). Easy duels start at 75 Life (was 50).
Starvos too (server rules v5). Server: new duels carry setup.enh2, new Starvos games v5; older games in flight keep the old table on replay.
Sim: /mnt/project-files/icyn-app/sim/enh-life-2026-11-25/ (Standard KO 33% -> 65%; Easy 75 ends ~round 6)."""
import pathlib, subprocess, sys
root = pathlib.Path(__file__).resolve().parents[2]
def patch(rel, pairs):
    p = root / rel; s = p.read_text(encoding='utf-8'); crlf = b'\r\n' in p.read_bytes()
    for a, b in pairs:
        if b in s: continue
        assert s.count(a) == 1, f'{rel}: expected 1 of {a[:90]!r}, found {s.count(a)}'
        s = s.replace(a, b)
    p.write_text(s, encoding='utf-8', newline='\r\n' if crlf else '\n'); print('patched', rel)

ENH2_JS = ("\n// Enhancement table v2 (N8 2026-11-25): fewer big heals. 4-7 stat only; 10-12 +3 Max & Life; 15 Main +1 & Weapon; 16 Random Stat & Ability; 17 no Life\n"
  "export const ENH2 = { ...ENH_CLASSIC, 10: [['maxlife', 3], ['main', 1], ['clear']], 11: [['maxlife', 3], ['stat', 'charm', 1]], 12: [['maxlife', 3], ['stat', 'speed', 1]],\n"
  "  15: [['main', 1], ['weapon']], 16: [['rstat'], ['rai']], 17: [['main', 2], ['clear']], 20: [['weapon'], ['rai'], ['main', 2]] };\n")

# ---- server duel engine ----
eng = (root / 'backend/ws/engine.mjs').read_text(encoding='utf-8')
enh_line = next(l for l in eng.splitlines() if l.startswith('export const ENH = '))
patch('backend/ws/engine.mjs', [
  (enh_line + '\n', enh_line + '\n' + ENH2_JS),
  ("        case 'rai': { f.abilities.forEach((a) => { a.cd = false; }); const i = rnd(4) - 1; emit({ t: 'randomAbility', p, i }); f.abilities[i].dice++; break; }\n      }\n    }\n    peak();",
   "        case 'rai': { f.abilities.forEach((a) => { a.cd = false; }); const i = rnd(4) - 1; emit({ t: 'randomAbility', p, i }); f.abilities[i].dice++; break; }\n"
   "        case 'rstat': { const s = STATS[rnd(5) - 1]; emit({ t: 'randomStat', p, s }); f[s]++; break; }\n      }\n    }\n    peak();"),
  ("    applyEffects(p, (kind === 'cal' ? CAL : ENH)[v]);", "    applyEffects(p, (kind === 'cal' ? CAL : setup.enh2 ? ENH2 : ENH)[v]);"),
  ("// setup = {heroes: [id0, id1], life: 50|100, easy?: true} (Easy = 50 Life,", "// setup = {heroes: [id0, id1], life: 75|100, easy?: true, enh2?: true} (Easy = 75 Life since 2026-11-25 (was 50); enh2 = Enhancement table v2;"),
])
# ---- server Starvos engine (rules v5 = Enhancement table v2; N8 2026-11-25: small parties are looking for a challenge) ----
patch('backend/ws/boss.mjs', [
  ("import { HEROES, CAL, ENH, rngFrom } from './engine.mjs';", "import { HEROES, CAL, ENH, ENH2, rngFrom } from './engine.mjs';"),
  ("        case 'rai': { f.abilities.forEach((a) => { a.cd = false; }); const i = rnd(4) - 1; emit({ t: 'randomAbility', p, i }); f.abilities[i].dice++; break; }\n      }\n    }\n  }",
   "        case 'rai': { f.abilities.forEach((a) => { a.cd = false; }); const i = rnd(4) - 1; emit({ t: 'randomAbility', p, i }); f.abilities[i].dice++; break; }\n"
   "        case 'rstat': { const s = STATS[rnd(5) - 1]; emit({ t: 'randomStat', p, s }); f[s]++; break; }\n      }\n    }\n  }"),
  ("    applyEffects(p, (table === 'cal' ? CAL : ENH)[v]);", "    applyEffects(p, (table === 'cal' ? CAL : (setup.v || 1) >= 5 ? ENH2 : ENH)[v]); // rules v5 (N8 2026-11-25): Enhancement table v2"),
])
# ---- server lobby: new games get the new table; Easy starts at 75 Life ----
patch('backend/ws/ws.mjs', [
  ("setup: { mode: 'boss', v: 4, heroes,", "setup: { mode: 'boss', v: 5, heroes,"),
  ("setup: easy ? { heroes: [msg.hero, null], life: 50, easy: true, wb1: true } : { heroes: [msg.hero, null], life: Number(msg.life), wb1: true },",
   "setup: easy ? { heroes: [msg.hero, null], life: 75, easy: true, wb1: true, enh2: true } : { heroes: [msg.hero, null], life: Number(msg.life), wb1: true, enh2: true },"),
  ("life: 100, wb1: true, carry: [mine.carry || null, rival.carry || null],", "life: 100, wb1: true, enh2: true, carry: [mine.carry || null, rival.carry || null],"),
  ("setup: { heroes: [hero, null], life: 100, wb1: true, carry: [mine.carry || null, null],", "setup: { heroes: [hero, null], life: 100, wb1: true, enh2: true, carry: [mine.carry || null, null],"),
  ("(easy: 50 Life,", "(easy: 75 Life,"),
])
# ---- game page ----
patch('index.html', [
  ("const tables = () => ({CAL:CAL_REVISED,ENH:ENH_REVISED});",
   "// Enhancement table v2 (N8 2026-11-25): 4-7 stat only; 10-12 +3 Max & Life with their bonus; 15 Main +1 & Weapon; 16 Random Stat & Ability; 17 no Life\n"
   "const ENH_V2 = {...ENH_CLASSIC,10:[['maxlife',3],['main',1],['clear']],11:[['maxlife',3],['stat','charm',1]],12:[['maxlife',3],['stat','speed',1]],15:[['main',1],['weapon']],16:[['rstat'],['rai']],17:[['main',2],['clear']],20:[['weapon'],['rai'],['main',2]]};\n"
   "const tables = () => ({CAL:CAL_REVISED,ENH:ENH_V2});"),
  ("case 'clear':return 'Clear Cooldowns';case 'full':return 'Full Life';", "case 'clear':return 'Clear Cooldowns';case 'full':return 'Full Life';case 'rstat':return 'Random Stat +1';"),
  ("      case 'rai':{const hadCd=f.abilities.some(a=>a.cd);",
   "      case 'rstat':{const k=NETON()?(await netNext('randomStat',t)).s:STATS[rnd(5)-1];changeStat(p,k,1);notes.push(`${SN[k]} +1`);break}\n      case 'rai':{const hadCd=f.abilities.some(a=>a.cd);"),
  ("life:EASY0?50:100, noCal:EASY0,", "life:EASY0?75:100, noCal:EASY0,"),
  ("const setEasy=v=>{S.noCal=v;S.life=v?50:100;", "const setEasy=v=>{S.noCal=v;S.life=v?75:100;"),
  ("S.noCal?'50 Life · Calamities only on a natural 1'", "S.noCal?'75 Life · Calamities only on a natural 1'"),
  ("g.easy?'Easy · 50 Life'", "g.easy?'Easy · '+(g.life||75)+' Life'"),
  ("O.create(S.picks[0],S.noCal?50:100,", "O.create(S.picks[0],S.noCal?75:100,"),
  ("setup={heroes,life:100,wb1:true,climb:true}", "setup={heroes,life:100,wb1:true,enh2:true,climb:true}"),
])
# re-embed the server engine for Solo Climb (same block tools/carry/carry_patch.py writes)
import re
p = root / 'index.html'; s = p.read_text(encoding='utf-8')
eng = re.sub(r'^export ', '', (root / 'backend/ws/engine.mjs').read_text(encoding='utf-8'), flags=re.M)
block = '// ICYNEngine:start (generated by tools/carry/carry_patch.py from backend/ws/engine.mjs)\nconst ICYNEngine=(()=>{\n' + eng + '\nreturn {replay,carryOf,HEROES};})();\n// ICYNEngine:end\n'
assert '// ICYNEngine:start' in s
s = re.sub(r'// ICYNEngine:start.*?// ICYNEngine:end\n', lambda m: block, s, flags=re.S)
p.write_text(s, encoding='utf-8'); print('re-embedded engine')
