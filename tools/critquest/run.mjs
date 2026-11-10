// Runs the Phase 1 balance reports.  node tools/critquest/run.mjs [fightsPerPair]
import { writeFileSync } from 'node:fs';
import { LIFEFORMS, ROLES, TERRORS, ABILITIES } from './data.mjs';
import { buildHero, heroUnit, terrorUnit, fight, seed, CFG } from './sim.mjs';

const N = +(process.argv[2] || 40);
const LEVELS = (process.env.LEVELS || '1,3,5,10,15,20').split(',').map(Number);
seed(20261110);
// CHARM=CE: Inspire adds the higher of Charm or Energy.  CHARM=melkin: Melkin get Speed +1, Energy +1.
const VARIANT = process.env.CHARM || 'base';
if (VARIANT === 'CE') CFG.inspireStat = 'CE';
if (VARIANT === 'melkin') LIFEFORMS.Melkin = { S: 1, E: 1 };
const lfs = Object.keys(LIFEFORMS), roles = Object.keys(ROLES);
const pct = x => (100 * x).toFixed(1);
const out = { variant: VARIANT, config: CFG, N, duels: {}, pve: {} };

// ---------------- Hero vs Hero round robin
for (const level of LEVELS) {
  const heroes = [];
  for (const lf of lfs) for (const r of roles) for (const b of ROLES[r].branches) heroes.push(buildHero(lf, r, level, b));
  const rec = new Map(heroes.map(h => [h.id, { w: 0, n: 0, rounds: 0, inspire: 0 }]));
  let draws = 0, total = 0, rounds = 0, inspireWins = 0, execWins = 0, knellWins = 0;
  for (let i = 0; i < heroes.length; i++) for (let j = i + 1; j < heroes.length; j++) {
    for (let k = 0; k < N; k++) {
      const A = heroUnit(heroes[i], 'A'), B = heroUnit(heroes[j], 'B');
      const res = fight([A], [B]);
      total++; rounds += res.rounds;
      const ra = rec.get(heroes[i].id), rb = rec.get(heroes[j].id);
      ra.n++; rb.n++;
      if (res.winner === 'A') ra.w++; else if (res.winner === 'B') rb.w++; else { draws++; ra.w += 0.5; rb.w += 0.5; }
      const s = res.F.stats;
      inspireWins += s.inspire.A + s.inspire.B; execWins += s.execute.A + s.execute.B; knellWins += s.knell.A + s.knell.B;
    }
  }
  const byPair = {}, byBuild = {}, byRole = {}, byLf = {};
  for (const h of heroes) {
    const r = rec.get(h.id);
    const add = (o, key) => { o[key] = o[key] || { w: 0, n: 0 }; o[key].w += r.w; o[key].n += r.n; };
    add(byPair, `${h.lifeform} ${h.role}`); add(byBuild, `${h.role} (${h.focus})`); add(byRole, h.role); add(byLf, h.lifeform);
  }
  const fin = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +(v.w / v.n).toFixed(3)]).sort((a, b) => b[1] - a[1]));
  out.duels[level] = {
    avgRounds: +(rounds / total).toFixed(2), drawRate: +(draws / total).toFixed(3),
    inspireWinRate: +(inspireWins / total).toFixed(3), executeWinRate: +(execWins / total).toFixed(3), knellWinRate: +(knellWins / total).toFixed(3),
    byRole: fin(byRole), byLifeform: fin(byLf), byBuild: fin(byBuild), byPair: fin(byPair),
    sample: Object.fromEntries(heroes.filter(h => h.lifeform === 'Sapien').map(h => [h.id, { life: h.life, def: h.def, st: h.st, abilities: h.abilities.map(a => a.ab.name + (a.rank > 1 ? ' ' + 'I'.repeat(a.rank) : '')) }])),
  };
  const D = out.duels[level];
  console.log(`\n=== Level ${level} duels: ${total} fights, avg ${D.avgRounds} rounds, draws ${pct(D.drawRate)}%, won by Inspire ${pct(D.inspireWinRate)}%, execute/yield ${pct(D.executeWinRate)}%, Death Knell ${pct(D.knellWinRate)}%`);
  console.log(' roles:', Object.entries(D.byRole).map(([k, v]) => `${k} ${pct(v)}`).join(' | '));
  console.log(' lifeforms:', Object.entries(D.byLifeform).map(([k, v]) => `${k} ${pct(v)}`).join(' | '));
  console.log(' builds:', Object.entries(D.byBuild).map(([k, v]) => `${k} ${pct(v)}`).join(' | '));
  const pairs = Object.entries(D.byPair);
  console.log(' best pairs:', pairs.slice(0, 4).map(([k, v]) => `${k} ${pct(v)}`).join(' | '));
  console.log(' worst pairs:', pairs.slice(-4).map(([k, v]) => `${k} ${pct(v)}`).join(' | '));
}

// ---------------- Level gauntlets: every build vs a sentient raider and a beast pack
const raider = L => ({ name: 'Fear Raider', sentient: true, C: Math.floor(L / 5), life: 22 + 7 * L, def: 10 + Math.floor(L / 4), toHit: 2 + Math.floor(L / 2), attacks: [{ dmg: [1 + Math.floor(L / 5), 8] }], S: 1 + Math.floor(L / 4) });
const beast = L => ({ name: 'Beast', life: 8 + 3 * L, def: 10 + Math.floor(L / 5), toHit: 1 + Math.floor(L / 2), attacks: [{ dmg: [1 + Math.floor(L / 6), 6] }], S: 2 + Math.floor(L / 4) });
out.gauntlet = {};
for (const level of LEVELS) {
  const res = {};
  for (const r of roles) for (const b of ROLES[r].branches) {
    const g = { raider: [0, 0, 0], pack: [0, 0, 0] };
    for (let k = 0; k < N * 5; k++) {
      const lf = lfs[k % 5];
      let f = fight([heroUnit(buildHero(lf, r, level, b), 'A')], [terrorUnit(raider(level), 'B')]);
      g.raider[0] += f.winner === 'A'; g.raider[1] += f.rounds; g.raider[2] += f.lifeLeftA;
      f = fight([heroUnit(buildHero(lf, r, level, b, { aoeWeight: 2 }), 'A')], [1, 2, 3].map(i => terrorUnit(beast(level), 'B', ' ' + i)));
      g.pack[0] += f.winner === 'A'; g.pack[1] += f.rounds; g.pack[2] += f.lifeLeftA;
    }
    const n = N * 5;
    res[`${r} (${b})`] = { raider: { win: +(g.raider[0] / n).toFixed(3), rounds: +(g.raider[1] / n).toFixed(1), life: +(g.raider[2] / n).toFixed(2) }, pack: { win: +(g.pack[0] / n).toFixed(3), rounds: +(g.pack[1] / n).toFixed(1), life: +(g.pack[2] / n).toFixed(2) } };
  }
  out.gauntlet[level] = res;
  const v = Object.entries(res);
  const mean = key => v.reduce((s, [, x]) => s + x[key].win, 0) / v.length;
  console.log(`\n=== Level ${level} gauntlet: raider avg win ${pct(mean('raider'))}%, beast pack avg win ${pct(mean('pack'))}%`);
  console.log('  ', v.map(([k, x]) => `${k} ${pct(x.raider.win)}/${pct(x.pack.win)}`).join(' | '));
}

// ---------------- Farluck Farm (solo and party of 3)
const M = N * 10;
function pve(label, level, makeFoes, opts, party = 1) {
  const res = {};
  for (const r of roles) for (const b of ROLES[r].branches) {
    let w = 0, rounds = 0, life = 0;
    for (let k = 0; k < M; k++) {
      const lf = lfs[k % lfs.length];
      const heroes = [heroUnit(buildHero(lf, r, level, b, { aoeWeight: 2 }), 'A')];
      for (let p = 1; p < party; p++) { const r2 = roles[(k + p * 2) % roles.length]; heroes.push(heroUnit(buildHero(lfs[(k + p) % 5], r2, level, ROLES[r2].branches[(k + p) % 3], { aoeWeight: 2 }), 'A')); }
      const f = fight(heroes, makeFoes(), opts);
      if (f.winner === 'A') w++; rounds += f.rounds; life += f.lifeLeftA;
    }
    res[`${r} (${b})`] = { win: +(w / M).toFixed(3), rounds: +(rounds / M).toFixed(1), lifeLeft: +(life / M).toFixed(2) };
  }
  out.pve[label] = res;
  const v = Object.values(res);
  console.log(`\n=== ${label}: avg win ${pct(v.reduce((s, x) => s + x.win, 0) / v.length)}%, avg rounds ${(v.reduce((s, x) => s + x.rounds, 0) / v.length).toFixed(1)}`);
  console.log(' ', Object.entries(res).map(([k, x]) => `${k} ${pct(x.win)}% (${x.rounds}r, ${pct(x.lifeLeft)}% Life left)`).join(' | '));
}
const T = TERRORS;
pve('L1 Wilted Wood ambush (1 gremlin, solo)', 1, () => [terrorUnit(T.gremlin, 'B')], { zone: true });
pve('L1 Well fight (2 gremlins + spitter, solo)', 1, () => [terrorUnit(T.gremlin, 'B', ' 1'), terrorUnit(T.gremlin, 'B', ' 2'), terrorUnit(T.spitter, 'B')], { zone: true });
pve('L2 Rotfang (solo, Cleanse charm)', 2, () => [terrorUnit(T.rotfang, 'B')], { zone: true, cleanse: true });
pve('L2 Rotfang (party of 3, Cleanse charm)', 2, () => [terrorUnit({ ...T.rotfang, life: T.rotfang.life + 2 * T.rotfang.perHero, toHit: T.rotfang.partyToHit }, 'B')], { zone: true, cleanse: true }, 3);

writeFileSync(new URL(`./results-${VARIANT}.json`, import.meta.url), JSON.stringify(out, null, 1));
