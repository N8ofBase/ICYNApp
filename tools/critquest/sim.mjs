// Crit Quest balance simulator (Phase 1). Plain dice math, no hex positioning yet.
// node tools/critquest/run.mjs   -> prints the reports and writes results.json
import { LIFEFORMS, ROLES, ABILITIES, TIER_CD, TIERS, TERRORS } from './data.mjs';

export const CFG = {
  lifeGrowth: { Brawler: 5, Champion: 4, Maverick: 4, 'Soul Seer': 3, Whisper: 4 }, // Life per level after 1 (draft)
  inspireDC: 12,          // Cleanse DC for terrors (d20 + Charm + bonuses)
  inspireBase: 12,        // Inspire DC vs a sentient foe = inspireBase + foe Charm (contest variant: 10)
  inspire: true,          // false = duels must be won by Life alone
  inspireAt: 0.25,        // foe Life fraction that opens Inspire
  maxRounds: 30,
  statCap: 6,
  weaponDieLevels: [7, 13, 19], // gear upgrades from Trades (draft)
  branchBonusHit: 1,      // +1 to hit with a branch for every 3 abilities taken in it
  calamities: true,
};

let rng = Math.random;
export function seed(s) { // mulberry32
  rng = function () { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const d = n => 1 + Math.floor(rng() * n);
const roll = (n, s) => { let t = 0; for (let i = 0; i < n; i++) t += d(s); return t; };
const avg = (n, s) => n * (s + 1) / 2;
const pick = arr => arr[Math.floor(rng() * arr.length)];

// ---------------------------------------------------------------- builds
const byRole = r => ABILITIES.filter(a => a.role === r);

function staticScore(a, st, aoeWeight = 1) {
  let v = 0;
  const sv = a.stat ? Math.max(0, st[a.stat] || 0) : 0;
  if (a.dmg) v += (a.hits || 1) * (avg(...a.dmg) + sv) * (a.aoe ? aoeWeight : 1);
  if (a.dot) v += (a.dot[0] ? avg(a.dot[0], a.dot[1]) : a.dot[2]) * a.dot[3];
  if (a.heal) v += (avg(a.heal[0], a.heal[1]) + (a.heal[2] ? sv || st[a.heal[2]] : 0)) * 0.7;
  if (a.hot) v += avg(a.hot[0], a.hot[1]) * a.hot[2] * 0.7;
  if (a.stun || a.sleep || a.hold) v += 9;
  if (a.hit) v += -a.hit[0] * a.hit[1] * 1.5;
  if (a.def) v += -a.def[0] * a.def[1] * 1.5;
  if (a.statMod) v += 3;
  if (a.selfDef) v += a.selfDef[0] * a.selfDef[1] * 1.2;
  if (a.counter) v += avg(a.counter[0], a.counter[1]) * 1.2;
  if (a.extraAttack || a.extraTurn) v += 12;
  if (a.execute || a.yieldAt) v += 10;
  if (a.knell) v += 20;
  if (a.rise) v += 12;
  if (a.gentle || a.silver) v += 8;
  if (a.nextDie || a.nextHit || a.dieBonus || a.untarget || a.missNext || a.soak || a.rally || a.mark || a.reroll1s || a.disarm || a.root) v += 6;
  if (a.dmgBuff) v += 3;
  if (a.allRolls) v += 3;
  if (a.thorns) v += avg(a.thorns[0], a.thorns[1]) * a.thorns[2] * 0.6;
  if (a.utility && !v) v = 0.5;
  v += a.tier * 0.15; // break ties toward newer abilities
  return v;
}

// Focused build: every tier pick from the focus branch, with weaving/Empower on the off levels.
export function buildHero(lifeform, role, level, focus, opts = {}) {
  const R = ROLES[role], L = LIFEFORMS[lifeform];
  const st = { P: 0, E: 0, S: 0, C: 0 };
  for (const k of ['P', 'E', 'S', 'C']) st[k] += (R[k] || 0) + (L[k] || 0);
  const all = byRole(role);
  const focusAbs = all.filter(a => a.branch === focus);
  // stat priority: main, then the stat the focus branch uses most, then the rest
  const cnt = { P: 0, E: 0, S: 0, C: 0 };
  focusAbs.forEach(a => a.stat && cnt[a.stat]++);
  const order = [R.main, ...Object.keys(cnt).filter(k => k !== R.main).sort((a, b) => cnt[b] - cnt[a])];
  let points = Math.floor(level / 2);
  for (const k of order) { while (points > 0 && st[k] < CFG.statCap) { st[k]++; points--; } }

  const known = new Map(); // name -> {ab, rank}
  const learn = a => known.set(a.name, { ab: a, rank: 1 });
  const empower = () => {
    const c = [...known.values()].filter(k => k.rank < 3 && !k.ab.passive && (k.ab.dmg || k.ab.heal || k.ab.hot)).sort((x, y) => staticScore(y.ab, st) - staticScore(x.ab, st))[0];
    if (c) c.rank++; else weave();
  };
  const weave = () => {
    const open = all.filter(a => a.branch !== focus && a.tier <= level && !known.has(a.name) && !a.utility)
      .sort((x, y) => staticScore(y, st) - staticScore(x, st));
    if (open[0]) learn(open[0]);
  };
  for (let lv = 1; lv <= level; lv += 2) {
    if (TIERS.includes(lv)) learn(focusAbs.find(a => a.tier === lv));
    else if (lv === 5 || lv === 13) weave();
    else empower();
  }
  // branch bonus
  const branchCount = {};
  for (const k of known.values()) branchCount[k.ab.branch] = (branchCount[k.ab.branch] || 0) + 1;
  // loadout: best 4 by score (aoe counts double in group fights)
  const aoeW = opts.aoeWeight || 1;
  const loadout = [...known.values()].sort((x, y) => staticScore(y.ab, st, aoeW) * (1 + 0.25 * (y.rank - 1)) - staticScore(x.ab, st, aoeW) * (1 + 0.25 * (x.rank - 1))).slice(0, 4);
  const def = 10 + (L.def || 0) + (R.def || 0) + Math.floor(level / 5);
  const life = R.life + CFG.lifeGrowth[role] * (level - 1);
  return {
    id: `${lifeform} ${role} (${focus})`, lifeform, role, focus, level, st, def, life,
    weapon: [R.weapon[0] + CFG.weaponDieLevels.filter(l => level >= l).length, R.weapon[1]],
    dmgBonus: R.dmg || 0, main: R.main,
    abilities: loadout.map(k => ({ ab: k.ab, rank: k.rank, bonusHit: Math.floor((branchCount[k.ab.branch] || 0) / 3) * CFG.branchBonusHit })),
    lifeAction: L.action,
  };
}

// ---------------------------------------------------------------- units
function heroUnit(h, side) {
  return {
    name: h.id, side, hero: true, sentient: true, h, max: h.life, life: h.life, baseDef: h.def,
    st: { ...h.st }, weapon: h.weapon, dmgBonus: h.dmgBonus,
    abs: h.abilities.map(a => ({ ...a, cd: 0 })), fx: [], once: {}, lifeAction: h.lifeAction,
    passive: {
      rise: h.abilities.some(a => a.ab.rise), gentle: h.abilities.some(a => a.ab.gentle), silver: h.abilities.some(a => a.ab.silver),
      inspire: h.abilities.reduce((s, a) => s + (a.ab.inspire || 0), 0),
    },
  };
}
function terrorUnit(t, side, tag) {
  return { name: t.name + (tag || ''), side, hero: false, sentient: !!t.sentient, inspireLvl: t.inspireLvl || 0, t, max: t.life, life: t.life, baseDef: t.def, st: { P: 0, E: 0, S: t.S ?? 1, C: t.C || 0 }, fx: [], once: {}, abs: [], passive: {} };
}

const fxSum = (u, key) => u.fx.reduce((s, f) => s + (f[key] || 0), 0);
const hasFx = (u, key) => u.fx.some(f => f[key]);
function addFx(u, f) { u.fx.push(f); }
function tickFx(u) { u.fx = u.fx.filter(f => { if (f.dur === Infinity) return true; f.dur--; return f.dur > 0; }); }
const statOf = (u, k) => Math.max(0, (u.st[k] || 0) + u.fx.reduce((s, f) => s + (f.stat && f.stat[k] || 0), 0));
const defOf = (u, ignoreBuffs) => u.baseDef + u.fx.reduce((s, f) => s + (f.def ? (ignoreBuffs && f.def > 0 ? 0 : f.def) : 0), 0);

// d20 with Die Curse / Die Blessing / reroll-1s / Quick Tune
function d20(u) {
  let r = d(20);
  if (r === 1 && (hasFx(u, 'reroll1s') || u.quickTune)) { r = d(20); u.quickTune = false; }
  if (r === 1 && u.rerolls > 0) { u.rerolls--; r = d(20); }
  const curse = u.fx.find(f => f.curse);
  if (curse) { u.fx.splice(u.fx.indexOf(curse), 1); if (r >= 2 && r <= 9) r = 1; }
  const bless = u.fx.find(f => f.bless);
  if (bless) { u.fx.splice(u.fx.indexOf(bless), 1); if (r >= 11 && r <= 19) r = 20; }
  return r;
}

function personalCalamity(u, F) {
  F.stats.calamities++;
  switch (d(12)) {
    case 1: addFx(u, { curse: true, dur: Infinity }); break;
    case 4: addFx(u, { stat: { C: -2 }, dur: Infinity }); break;
    case 5: u.skip = (u.skip || 0) + 1; break;
    case 6: case 11: addFx(u, { def: -2, dur: 1 }); break;
    case 7: { const a = pick(u.abs.length ? u.abs : [null]); if (a) a.cd = Math.max(a.cd, 2); break; }
    case 12: if (F.zone) { const z = d(6); if (z === 2) addFx(u, { hit: -2, dur: 1 }); if (z === 3) { hurt(u, roll(1, 6), F); u.plague = 3; } if (z === 6) addFx(u, { curse: true, dur: Infinity }); } break;
    default: break; // movement / pack / Fear meter results: no effect in a dice-only fight
  }
}
function battleEnhancement(u, F) {
  F.stats.enhancements++;
  switch (d(12)) {
    case 1: heal(u, roll(1, 6) + statOf(u, 'E'), F); break;
    case 3: addFx(u, { dieBonus: 1, dur: Infinity }); break;
    case 4: addFx(u, { stat: { C: 2 }, dur: Infinity }); break;
    case 5: addFx(u, { def: 1, dur: Infinity }); break;
    case 6: u.abs.forEach(a => a.cd = 0); break;
    case 7: addFx(u, { hit: 1, dur: Infinity }); break;
    case 9: u.rerolls = (u.rerolls || 0) + 1; break;
    case 11: u.bonusAction = true; break;
    case 12: addFx(u, { bless: true, dur: Infinity }); break;
    default: break;
  }
}

function heal(u, n, F) {
  if (F.noHeal) return;
  u.life = Math.min(u.max, u.life + n);
}
function hurt(u, n, F, src) {
  if (n <= 0 || u.life <= 0) return;
  const soak = u.fx.find(f => f.soak > 0);
  if (soak) { const s = Math.min(soak.soak, n); soak.soak -= s; n -= s; }
  u.life -= n;
  if (u.sleeping) u.sleeping = 0;
  if (u.life <= 0 && u.passive.rise && !u.once.rose) { u.once.rose = true; u.life = Math.ceil(u.max / 4); }
  if (u.life <= 0) { u.life = 0; u.down = true; }
}

// attack roll + damage. Returns hit boolean.
function attack(att, tgt, spec, F) {
  // spec: {dmg:[n,s], stat, hits, critMin, auto, ignoreBuffs, bonusHit, rank, noCounter, flatDie}
  if (tgt.fx.some(f => f.untarget)) return false;
  const missNext = tgt.fx.find(f => f.missNext);
  let hitAny = false;
  const hits = spec.hits || 1;
  for (let i = 0; i < hits; i++) {
    if (tgt.down) break;
    let crit = false, ok = true;
    if (!spec.auto) {
      const r = d20(att);
      const nh = att.fx.find(f => f.nextHit);
      const total = r + (spec.stat ? statOf(att, spec.stat) : 0) + fxSum(att, 'hit') + fxSum(att, 'allRolls') + (spec.bonusHit || 0) + (nh ? nh.nextHit : 0) + (att.t ? att.t.toHit : 0) + (F.partyHit && att.hero ? F.partyHit : 0);
      const critMin = Math.min(spec.critMin || 20, nh && nh.nextCrit ? nh.nextCrit : 20, spec.rank >= 3 ? 19 : 20);
      if (nh) att.fx.splice(att.fx.indexOf(nh), 1);
      if (r === 1) { ok = false; if (att.hero && CFG.calamities) personalCalamity(att, F); }
      else if (r >= critMin) { crit = true; if (r === 20 && att.hero && CFG.calamities) battleEnhancement(att, F); }
      else ok = total > defOf(tgt, spec.ignoreBuffs);
    }
    if (ok && missNext) { tgt.fx.splice(tgt.fx.indexOf(missNext), 1); ok = false; }
    if (!ok) continue;
    hitAny = true;
    if (spec.dmg) {
      let n = spec.dmg[0] + (spec.rank >= 2 ? 1 : 0) + fxSum(att, 'dieBonus');
      const nd = att.fx.find(f => f.nextDie);
      if (nd) { n += nd.nextDie; att.fx.splice(att.fx.indexOf(nd), 1); }
      if (crit) n *= 2;
      let dmg = roll(n, spec.dmg[1]) + (spec.stat && !(spec.weapon && att.disarmed) ? statOf(att, spec.stat) : 0) + (att.dmgBonus || 0) + fxSum(att, 'dmgBuff');
      if (tgt.fx.some(f => f.mark)) dmg += roll(1, 6);
      hurt(tgt, dmg, F, att);
      F.stats.dmg[att.side] += dmg;
      // reactive effects
      const th = tgt.fx.find(f => f.thorns); if (th) hurt(att, roll(th.thorns[0], th.thorns[1]), F);
      const ct = tgt.fx.find(f => f.counter);
      if (ct && !spec.noCounter && !tgt.down) hurt(att, roll(ct.counter[0], ct.counter[1]) + statOf(tgt, ct.counter[2]), F);
    }
  }
  return hitAny;
}

function applyFoeFx(a, rank, tgt, att) {
  if (a.stun) tgt.skip = Math.max(tgt.skip || 0, a.stun);
  if (a.loseSpeed) tgt.loseSpeed = true;
  if (a.hit) addFx(tgt, { hit: a.hit[0], dur: a.hit[1] });
  if (a.def) addFx(tgt, { def: a.def[0], dur: a.def[1] });
  if (a.statMod) { const { dur, ...s } = a.statMod; addFx(tgt, { stat: s, dur }); }
  if (a.allRolls) addFx(tgt, { allRolls: a.allRolls[0], dur: a.allRolls[1] });
  if (a.dot) tgt.dots.push({ n: a.dot[0], s: a.dot[1], flat: a.dot[2], left: a.dot[3] });
  if (a.noAbil) tgt.noAbil = a.noAbil;
  if (a.disarm) tgt.disarmed = 1;
  if (a.mark) addFx(tgt, { mark: true, dur: a.mark[0] });
  if (a.hold) tgt.held = { n: a.hold[0], s: a.hold[1], dc: a.hold[2], by: att, rounds: a.hold[3] || 3 };
}

function applySelfFx(a, rank, u, F) {
  if (a.selfDef) addFx(u, { def: a.selfDef[0], dur: a.selfDef[1] + 1 });
  if (a.dmgBuff) addFx(u, { dmgBuff: a.dmgBuff[0], dur: a.dmgBuff[1] + 1 });
  if (a.nextHit) addFx(u, { nextHit: a.nextHit, nextCrit: a.nextCrit, dur: 3 });
  if (a.nextDie) addFx(u, { nextDie: a.nextDie, dur: 3 });
  if (a.counter) addFx(u, { counter: a.counter, dur: a.counter[3] + 1 });
  if (a.thorns) addFx(u, { thorns: a.thorns, dur: a.thorns[2] + 1 });
  if (a.untarget) addFx(u, { untarget: true, dur: a.untarget + 1 });
  if (a.dieBonus) addFx(u, { dieBonus: a.dieBonus[0], dur: a.dieBonus[1] + 1 });
  if (a.rally) addFx(u, { allRolls: a.rally[0], dur: a.rally[1] + 1 });
  if (a.reroll1s) addFx(u, { reroll1s: true, dur: a.reroll1s[0] + 1 });
  if (a.missNext) addFx(u, { missNext: true, dur: 4 });
  if (a.soak) addFx(u, { soak: roll(a.soak[0] + (rank >= 2 ? 1 : 0), a.soak[1]) + statOf(u, a.soak[2]), dur: 4 });
  if (a.extraAttack) u.extraAttack = true;
  if (a.heal) heal(u, roll(a.heal[0] + (rank >= 2 ? 1 : 0), a.heal[1]) + (a.heal[2] ? statOf(u, a.heal[2]) : 0), F);
  if (a.hot) u.hots.push({ n: a.hot[0] + (rank >= 2 ? 1 : 0), s: a.hot[1], left: a.hot[2] });
  if (a.cleanse) { u.fx = u.fx.filter(f => !(f.hit < 0 || f.def < 0 || f.curse || (f.stat && Object.values(f.stat).some(v => v < 0)))); u.dots = []; u.plague = 0; }
}

// ---------------------------------------------------------------- hero AI
const inspireDCof = foe => foe.sentient ? CFG.inspireBase + statOf(foe, 'C') + (foe.inspireLvl || 0) : CFG.inspireDC;
function inspireChance(u, foe) {
  const need = inspireDCof(foe) - statOf(u, 'C') - u.passive.inspire - fxSum(u, 'allRolls');
  const p = Math.min(0.95, Math.max(0.05, (21 - need) / 20));
  return u.passive.silver ? 1 - (1 - p) * (1 - p) : p;
}
function expectedHit(u, foe, a, bonusHit) {
  if (a.auto) return 1;
  const need = defOf(foe, a.ignoreBuffs) + 1 - (a.stat ? statOf(u, a.stat) : 0) - fxSum(u, 'hit') - fxSum(u, 'allRolls') - (bonusHit || 0);
  return Math.min(0.95, Math.max(0.05, (21 - need) / 20));
}
function abilityValue(u, foe, slot, foes, F) {
  const a = slot.ab, rank = slot.rank;
  if (a.passive || a.utility) return -1;
  const p = expectedHit(u, foe, a, slot.bonusHit);
  let v = 0;
  const targets = a.aoe ? foes.length : (a.aoe2 ? Math.min(2, foes.length) : 1);
  if (a.dmg) v += p * (a.hits || 1) * (avg(a.dmg[0] + (rank >= 2 ? 1 : 0) + fxSum(u, 'dieBonus'), a.dmg[1]) + (a.stat ? statOf(u, a.stat) : 0) + (u.dmgBonus || 0)) * targets;
  if (a.dot) v += p * (a.dot[0] ? avg(a.dot[0], a.dot[1]) : a.dot[2]) * a.dot[3] * 0.8;
  if (a.stun && !foe.skip) v += p * 8 * targets;
  if (a.sleep) v += 0.5 * 8 * targets;
  if (a.hold && !foe.held) v += p * 10;
  if (a.hit && !foe.fx.some(f => f.hit < 0)) v += p * 5 * targets;
  if (a.def && !foe.fx.some(f => f.def < 0)) v += p * 4;
  if (a.statMod) v += p * 2;
  if (a.mark && !hasFx(foe, 'mark')) v += p * 7;
  if (a.disarm) v += p * 3;
  if (a.root) v += p * 1;
  const hurtFrac = 1 - u.life / u.max;
  if (a.heal) v += (u.life / u.max < 0.6 ? 1.2 : 0.2) * (avg(a.heal[0], a.heal[1]) + (a.heal[2] ? statOf(u, a.heal[2]) : 0));
  if (a.orHeal && u.life / u.max < 0.35) v = Math.max(v, avg(1, 10) + statOf(u, 'E'));
  if (a.hot && !u.hots.length) v += hurtFrac > 0.3 ? avg(a.hot[0], a.hot[1]) * a.hot[2] : 1;
  if (a.selfDef && !u.fx.some(f => f.def > 0)) v += a.selfDef[0] * 2.2;
  if (a.counter && !hasFx(u, 'counter')) v += 9;
  if (a.thorns && !hasFx(u, 'thorns')) v += 4;
  if (a.soak && !u.fx.some(f => f.soak > 0)) v += avg(a.soak[0], a.soak[1]) + statOf(u, a.soak[2]);
  if (a.untarget && !hasFx(u, 'untarget')) v += 9;
  if (a.nextHit && !hasFx(u, 'nextHit')) v += 6;
  if (a.nextDie && !hasFx(u, 'nextDie')) v += 6;
  if (a.dieBonus) v += 12;
  if (a.rally && !u.fx.some(f => f.allRolls > 0)) v += 6;
  if (a.reroll1s && !hasFx(u, 'reroll1s')) v += 3;
  if (a.missNext && !hasFx(u, 'missNext')) v += 7;
  if (a.dmgBuff && !hasFx(u, 'dmgBuff')) v += 3;
  if (a.extraAttack) v += 10;
  if (a.extraTurn) v += 14;
  if (a.knell && foe.sentient) v += 25;
  if (a.knell && !foe.sentient) v += avg(6, 10) + statOf(u, 'E');
  if ((a.execute || a.yieldAt) && foe.life / foe.max <= (a.execute || a.yieldAt)) v += 1000;
  return v;
}

function heroTurn(u, F) {
  const foes = F.units.filter(x => x.side !== u.side && !x.down && !x.gone);
  if (!foes.length) return;
  const allies = F.units.filter(x => x.side === u.side && !x.down && !x.gone);
  // target: lowest Life targetable foe
  const tgts = foes.filter(f => !f.fx.some(x => x.untarget));
  const foe = (tgts.length ? tgts : foes).slice().sort((a, b) => a.life - b.life)[0];
  // 1. win by Inspire / Cleanse / execute
  const thr = u.passive.gentle ? 0.5 : CFG.inspireAt;
  const canCalm = (foe.sentient && !foe.noInspire) || (F.cleanse && (foe.t && (foe.t.boss ? foe.life / foe.max <= foe.t.cleanseAt : true)));
  const ready = u.abs.filter(s => s.cd === 0 && !(u.noAbil > 0));
  const exec = ready.find(s => (s.ab.execute || s.ab.yieldAt) && foe.life / foe.max <= (s.ab.execute || s.ab.yieldAt) && (foe.sentient || s.ab.execute));
  if (exec && !foe.fx.some(x => x.untarget)) { exec.cd = cdOf(exec); F.stats.execute[u.side]++; win(foe, F, 'execute'); return; }
  if (CFG.inspire && canCalm && foe.life / foe.max <= (foe.sentient ? thr : foe.t.boss ? foe.t.cleanseAt : 0.5) && inspireChance(u, foe) >= 0.4) {
    let r = d20(u); if (u.passive.silver) r = Math.max(r, d20(u));
    const total = r + statOf(u, 'C') + u.passive.inspire + fxSum(u, 'allRolls') - (F.stench || 0);
    if (r !== 1 && total >= inspireDCof(foe)) { F.stats.inspire[u.side]++; win(foe, F, 'inspire'); }
    return;
  }
  // 2. lifeform action once per fight
  if (!u.once.life) {
    const la = u.lifeAction;
    const lifeFrac = u.life / u.max;
    if ((la === 'forage' && lifeFrac < 0.6) || (la === 'ward' && lifeFrac < 0.7) || la === 'standProud' || la === 'quickTune' || la === 'heave') {
      u.once.life = true;
      if (la === 'forage') heal(u, roll(1, 6), F);
      if (la === 'ward') addFx(u, { def: 2, dur: 2 });
      if (la === 'standProud') foes.forEach(f => addFx(f, { hit: -1, dur: 1 }));
      if (la === 'quickTune') u.quickTune = true;
      if (la === 'heave') { attack(u, foe, { dmg: [1, 6], stat: 'P' }, F); return; }
      if (la !== 'quickTune') return; // Quick Tune is a free hum before acting (counts as half the turn)
    }
  }
  // 3. best ability or weapon
  let best = null, bestV = expectedHit(u, foe, { stat: u.h.main }) * (avg(...u.weapon) + (u.disarmed ? 0 : statOf(u, u.h.main)) + (u.dmgBonus || 0));
  for (const s of ready) { const v = abilityValue(u, foe, s, foes, F); if (v > bestV) { bestV = v; best = s; } }
  if (!best) { attack(u, foe, { dmg: u.weapon, stat: u.h.main, weapon: true }, F); return; }
  useAbility(u, best, foe, foes, F);
}
const cdOf = s => Math.max(0, (TIER_CD[s.ab.tier] || 1) - (s.rank >= 3 ? 1 : 0));

function useAbility(u, s, foe, foes, F) {
  const a = s.ab; s.cd = cdOf(s) + 1; // +1 because cooldowns tick at the end of the user's own turn
  F.stats.used[a.name] = (F.stats.used[a.name] || 0) + 1;
  applySelfFx(a, s.rank, u, F);
  if (a.orHeal && u.life / u.max < 0.35) { heal(u, roll(1 + (s.rank >= 2 ? 1 : 0), 10) + statOf(u, 'E'), F); return; }
  if (a.knell) {
    if (foe.sentient) { if (d20(u) >= 11) { F.stats.knell[u.side]++; win(foe, F, 'knell'); } }
    else attack(u, foe, { dmg: a.dmgBeast, stat: 'E', auto: true, rank: s.rank }, F);
    return;
  }
  if (a.extraTurn) { u.bonusAction = true; return; }
  const offensive = a.dmg || a.stun || a.hit || a.def || a.statMod || a.dot || a.mark || a.disarm || a.hold || a.sleep || a.allRolls || a.root;
  if (!offensive || (a.heal && !a.dmg)) return;
  const tg = a.aoe ? foes : a.aoe2 ? [foe, ...foes.filter(f => f !== foe).slice(0, 1)] : [foe];
  for (const t of tg) {
    if (a.sleep) { // contested d20 + Charm
      if (d20(u) + statOf(u, a.contested) > d20(t) + statOf(t, 'C')) t.sleeping = a.sleep;
      continue;
    }
    if (a.freeShot) { attack(u, t, { dmg: a.dmg, auto: false, stat: 'S', rank: s.rank }, F); continue; }
    const selfOnlyFx = (a.selfDef || a.heal) && !a.dmg && !a.stat;
    if (selfOnlyFx) continue;
    const hit = attack(u, t, { dmg: a.dmg, stat: a.stat, hits: a.hits, critMin: a.critMin, auto: a.auto, ignoreBuffs: a.ignoreBuffs, bonusHit: s.bonusHit, rank: s.rank, noCounter: a.noCounter }, F);
    if (hit) applyFoeFx(a, s.rank, t, u);
    if (hit && a.heal && a.dmg && !a.heal[2]) {/* Soul Syphon heal already applied above */ }
  }
}

function win(foe, F, how) { foe.gone = how; }

// ---------------------------------------------------------------- terror AI
function terrorTurn(u, F) {
  const heroes = F.units.filter(x => x.side !== u.side && !x.down && !x.gone && !x.fx.some(f => f.untarget));
  if (!heroes.length) return;
  const t = u.t;
  if (t.flees && u.life / u.max <= t.flees && !F.cleanse) { u.gone = 'fled'; return; }
  if (t.screech && F.round % t.screech === 0) { heroes.forEach(h => addFx(h, { hit: -1, dur: 1 })); return; }
  if (t.summon && !u.once.summon && u.life / u.max <= t.summon) {
    u.once.summon = true;
    F.units.push(terrorUnit(TERRORS.gremlin, u.side, ' A'), terrorUnit(TERRORS.gremlin, u.side, ' B'));
    F.units.slice(-2).forEach(g => { g.dots = []; g.hots = []; });
    return;
  }
  const tgt = pick(heroes);
  const at = pick(t.attacks);
  const hit = attack(u, tgt, { dmg: at.dmg, stat: null }, F);
  if (hit && at.plague && rng() < at.plague) tgt.plague = 3;
}

// ---------------------------------------------------------------- fight loop
export function fight(sideA, sideB, opts = {}) {
  const F = { units: [...sideA, ...sideB], round: 0, zone: !!opts.zone, cleanse: !!opts.cleanse, stats: { dmg: { A: 0, B: 0 }, inspire: { A: 0, B: 0 }, execute: { A: 0, B: 0 }, knell: { A: 0, B: 0 }, calamities: 0, enhancements: 0, used: {} } };
  F.units.forEach(u => { u.dots = []; u.hots = []; });
  const alive = side => F.units.some(u => u.side === side && !u.down && !u.gone);
  while (alive('A') && alive('B') && F.round < CFG.maxRounds) {
    F.round++;
    F.noHeal = false; F.partyHit = 0; F.stench = 0;
    if (opts.zone && d(20) <= 3) { // Farluck Farm zone hazard
      switch (d(6)) {
        case 1: F.partyHit = -1; break;
        case 2: F.units.filter(u => u.hero && !u.down).forEach(u => { if (rng() < 0.5) hurt(u, roll(1, 4), F); }); break;
        case 3: F.noHeal = true; break;
        case 5: F.stench = 1; break;
        case 6: F.units.filter(u => u.hero).forEach(u => addFx(u, { curse: true, dur: Infinity })); break;
      }
    }
    const order = F.units.filter(u => !u.down && !u.gone).map(u => ({ u, s: d(20) + statOf(u, 'S') - (u.loseSpeed ? 20 : 0) + rng() }))
      .sort((a, b) => b.s - a.s).map(x => x.u);
    order.forEach(u => u.loseSpeed = false);
    for (const u of order) {
      if (u.down || u.gone) continue;
      if (!alive('A') || !alive('B')) break;
      // start of turn ticks
      for (const dt of u.dots) { hurt(u, (dt.n ? roll(dt.n, dt.s) : 0) + dt.flat, F); dt.left--; }
      u.dots = u.dots.filter(x => x.left > 0);
      for (const h of u.hots) { heal(u, roll(h.n, h.s), F); h.left--; }
      u.hots = u.hots.filter(x => x.left > 0);
      if (u.plague > 0) { hurt(u, 1, F); u.plague--; }
      if (u.down) continue;
      let acts = 1;
      if (u.held) {
        if (u.held.by.down || u.held.by.gone || u.held.rounds <= 0) u.held = null;
        else { hurt(u, roll(u.held.n, u.held.s) + statOf(u.held.by, 'P'), F); u.held.rounds--; if (d20(u) + statOf(u, 'P') >= u.held.dc) u.held = null; else acts = 0; }
      }
      if (u.sleeping > 0) { u.sleeping--; acts = 0; }
      if (u.skip > 0) { u.skip--; acts = 0; }
      if (acts && u.extraAttack) { u.extraAttack = false; acts = 2; }
      for (let i = 0; i < acts && !u.down; i++) {
        u.hero ? heroTurn(u, F) : terrorTurn(u, F);
        if (u.bonusAction) { u.bonusAction = false; u.hero ? heroTurn(u, F) : terrorTurn(u, F); }
      }
      // end of own turn
      u.abs.forEach(s => { if (s.cd > 0) s.cd--; });
      if (u.noAbil > 0) u.noAbil--;
      if (u.disarmed > 0) u.disarmed--;
      tickFx(u);
    }
  }
  const aWin = alive('A') && !alive('B'), bWin = alive('B') && !alive('A');
  return { winner: aWin ? 'A' : bWin ? 'B' : null, rounds: F.round, F, lifeLeftA: sideA.reduce((s, u) => s + u.life / u.max, 0) / sideA.length };
}

export { heroUnit, terrorUnit };
