// Headless I Crit You Not! duel engine for server-refereed online play.
// Mirrors the rules in the game page (src.html): revised tables, Speed every
// round, nat 1 on Speed = Calamity + lost turn, nat 20 = Enhancement first,
// Weapon Broken for one round (setup.wb1, N8 2026-11-17: it spoils only the Hero's next
// turn of attacks, older games keep 'through the next round'), Weapon Increase repairs and adds a die.
// Crit Climb (setup.carry, N8 2026-11-17): a Hero who climbs on keeps its Life, stats, Weapon dice and
// leveled Ability dice for the next match; cooldowns reset and the weapon starts whole.
//
// The engine is a generator. It yields a prompt ({kind, p}) whenever a player
// must act, and receives that player's input ({choice} for 'ability').
// replay() re-runs a duel from its secret seed and the list of inputs so far,
// so nothing but {seed, setup, inputs} needs storing between moves.

export const HEROES = {
  brawler: { name: 'Brawler', main: 'power', stats: { def: 10, power: 3, energy: 1, speed: 2, charm: 0 },
    abilities: [{ name: 'Crush', dice: 1, stat: 'power' }, { name: 'Energy Blocker', dice: 1, stat: 'energy', debuff: 'energy' }, { name: 'Flurry Fist', dice: 2, stat: 'speed' }, { name: 'Sweep', dice: 1, stat: 'charm', debuff: 'speed' }] },
  champion: { name: 'Champion', main: 'power', stats: { def: 13, power: 3, energy: 2, speed: 0, charm: 1 },
    abilities: [{ name: 'Overpower', dice: 1, stat: 'power' }, { name: 'Radiant Strike', dice: 1, stat: 'energy' }, { name: 'Shield Slam', dice: 1, stat: 'speed' }, { name: 'Concuss', dice: 1, stat: 'charm', debuff: 'charm' }] },
  maverick: { name: 'Maverick', main: 'charm', stats: { def: 11, power: 1, energy: 0, speed: 2, charm: 3 },
    abilities: [{ name: 'Pierce', dice: 1, stat: 'power', debuff: 'power' }, { name: 'Soul Shot', dice: 1, stat: 'energy' }, { name: 'Multi Shot', dice: 2, stat: 'speed' }, { name: 'Bola', dice: 1, stat: 'charm', debuff: 'speed' }] },
  soulseer: { name: 'Soul Seer', main: 'energy', stats: { def: 10, power: 0, energy: 3, speed: 1, charm: 2 },
    abilities: [{ name: 'Explosion', dice: 2, stat: 'power' }, { name: 'Soul Syphon', dice: 1, stat: 'energy', heal: 1 }, { name: 'Mind-Spike', dice: 1, stat: 'speed' }, { name: 'Psylance', dice: 1, stat: 'charm' }] },
  whisper: { name: 'Whisper', main: 'speed', stats: { def: 11, power: 2, energy: 0, speed: 3, charm: 1 },
    abilities: [{ name: 'Death-Strike', dice: 1, stat: 'power' }, { name: 'Darkness', dice: 1, stat: 'energy', debuff: 'power' }, { name: 'Double-Strike', dice: 2, stat: 'speed' }, { name: 'Soul Strike', dice: 1, stat: 'charm' }] },
};
const STATS = ['def', 'power', 'energy', 'speed', 'charm'];

const CAL_CLASSIC = { 1: [['half'], ['all', -1]], 2: [['rcd'], ['all', -1]], 3: [['broken'], ['all', -1]], 4: [['main', -2]], 5: [['stat', 'def', -1], ['half']],
  6: [['stat', 'speed', -1], ['broken']], 7: [['stat', 'power', -1], ['broken']], 8: [['stat', 'energy', -1], ['rcd']], 9: [['stat', 'charm', -1], ['rcd']], 10: [['main', -1]],
  11: [['broken']], 12: [['rcd']], 13: [['broken']], 14: [['rcd']], 15: [['stat', 'power', -1]], 16: [['stat', 'speed', -1]], 17: [['stat', 'def', -1]], 18: [['stat', 'energy', -1]], 19: [['stat', 'charm', -1]], 20: [] };
const ENH_CLASSIC = { 1: [], 2: [['maxlife', 5]], 3: [['maxlife', 5]], 4: [['stat', 'power', 1]], 5: [['stat', 'energy', 1]], 6: [['stat', 'speed', 1]], 7: [['stat', 'charm', 1]], 8: [['weapon']], 9: [['rai']],
  10: [['life', 10], ['main', 1], ['clear']], 11: [['life', 10], ['stat', 'charm', 1]], 12: [['life', 10], ['stat', 'speed', 1]], 13: [['weapon'], ['stat', 'power', 1]], 14: [['rai'], ['stat', 'energy', 1]],
  15: [['life', 10], ['weapon']], 16: [['life', 10], ['rai']], 17: [['life', 10], ['main', 2], ['clear']], 18: [['clear'], ['maxlife', 10]], 19: [['all', 1], ['clear'], ['maxlife', 10]], 20: [['full'], ['weapon'], ['rai'], ['main', 2]] };
export const CAL = { ...CAL_CLASSIC, 1: [['lifeloss', 10], ['all', -1]], 4: [['main', -2], ['lifeloss', 3]], 5: [['stat', 'def', -1], ['lifeloss', 10]],
  10: [['main', -1], ['lifeloss', 3]], 11: [['broken'], ['lifeloss', 3]], 12: [['rcd'], ['lifeloss', 3]], 13: [['broken'], ['lifeloss', 3]], 14: [['rcd'], ['lifeloss', 3]] };
export const ENH = { ...ENH_CLASSIC, 4: [['stat', 'power', 1], ['maxlife', 3]], 5: [['stat', 'energy', 1], ['maxlife', 3]], 6: [['stat', 'speed', 1], ['maxlife', 3]], 7: [['stat', 'charm', 1], ['maxlife', 3]], 20: [['weapon'], ['rai'], ['main', 2]] };

// Enhancement table v2 (N8 2026-11-25): fewer big heals. 4-7 stat only; 10-12 +3 Max & Life; 15 Main +1 & Weapon; 16 Random Stat & Ability; 17 no Life
export const ENH2 = { ...ENH_CLASSIC, 10: [['maxlife', 3], ['main', 1], ['clear']], 11: [['maxlife', 3], ['stat', 'charm', 1]], 12: [['maxlife', 3], ['stat', 'speed', 1]],
  15: [['main', 1], ['weapon']], 16: [['rstat'], ['rai']], 17: [['main', 2], ['clear']], 20: [['weapon'], ['rai'], ['main', 2]] };

// sfc32 seeded from a 128-bit hex seed; the server keeps the seed secret.
export function rngFrom(seedHex) {
  let [a, b, c, d] = [0, 8, 16, 24].map((i) => parseInt(seedHex.slice(i, i + 8), 16) >>> 0);
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return (sides) => 1 + Math.floor(next() * sides);
}

const num = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
function makeFighter(id, life, p, carry) {
  const h = HEROES[id];
  const f = { p, id, name: h.name, main: h.main, ...h.stats, life, maxLife: life, peakMax: life, weaponDice: 1, broken: false, brokenUntil: 0, swing: 0,
    abilities: h.abilities.map((a) => ({ ...a, cd: false })) };
  if (carry && typeof carry === 'object') {
    for (const s of STATS) f[s] = num(carry[s], 0, 99, f[s]);
    f.maxLife = num(carry.maxLife, 1, 999, f.maxLife); f.life = num(carry.life, 1, f.maxLife, f.life); f.peakMax = f.maxLife;
    f.weaponDice = num(carry.weaponDice, 1, 20, 1);
    if (Array.isArray(carry.dice)) f.abilities.forEach((a, k) => { a.dice = num(carry.dice[k], a.dice, 20, a.dice); });
  }
  return f;
}
// What a Crit Climb Hero takes into its next match (cooldowns and a broken weapon are left behind).
export function carryOf(f) {
  return { life: Math.max(1, f.life), maxLife: f.maxLife, def: f.def, power: f.power, energy: f.energy, speed: f.speed, charm: f.charm,
    weaponDice: f.weaponDice, dice: f.abilities.map((a) => a.dice) };
}

// Public view of both fighters, sent with every update.
export function snapshot(F) {
  return F.map((f) => ({ id: f.id, life: f.life, maxLife: f.maxLife, def: f.def, power: f.power, energy: f.energy, speed: f.speed, charm: f.charm,
    weaponDice: f.weaponDice, broken: f.broken, brokenUntil: f.brokenUntil, abilities: f.abilities.map((a) => ({ dice: a.dice, cd: a.cd })) }));
}

// setup = {heroes: [id0, id1], life: 75|100, easy?: true, enh2?: true} (Easy = 75 Life since 2026-11-25 (was 50); enh2 = Enhancement table v2; Calamities only on natural 1s). Events are plain objects the client animates in order.
export function* duel(setup, rnd, ev) {
  const carry = Array.isArray(setup.carry) ? setup.carry : [];
  const F = [makeFighter(setup.heroes[0], setup.life, 0, carry[0]), makeFighter(setup.heroes[1], setup.life, 1, carry[1])];
  const S = { round: 0, F };
  const over = () => F.some((f) => f.life <= 0);
  const emit = (e) => ev.push({ round: S.round, ...e });
  const peak = () => F.forEach((f) => { f.peakMax = Math.max(f.peakMax, f.maxLife); });

  function applyEffects(p, list) {
    const f = F[p];
    for (const e of list) {
      switch (e[0]) {
        case 'lifeloss': f.life = Math.max(1, f.life - e[1]); break;
        case 'half': f.life = Math.ceil(f.life / 2); break;
        case 'all': for (const s of STATS) f[s] = Math.max(0, f[s] + e[1]); break;
        case 'main': f[f.main] = Math.max(0, f[f.main] + e[1]); break;
        case 'stat': f[e[1]] = Math.max(0, f[e[1]] + e[2]); break;
        // One round (wb1): broken before this round's swing, it spoils this round; after it, the next one.
        case 'broken': f.broken = true; f.brokenUntil = setup.wb1 && f.swing !== S.round ? S.round : S.round + 1; break;
        case 'rcd': { const i = rnd(4) - 1; emit({ t: 'randomAbility', p, i }); f.abilities[i].cd = true; break; }
        case 'maxlife': f.maxLife += e[1]; f.life += e[1]; break;
        case 'life': f.life = Math.min(f.maxLife, f.life + e[1]); break;
        case 'full': f.life = f.maxLife; break;
        case 'clear': f.abilities.forEach((a) => { a.cd = false; }); break;
        case 'weapon': f.broken = false; f.weaponDice++; break;
        case 'rai': { f.abilities.forEach((a) => { a.cd = false; }); const i = rnd(4) - 1; emit({ t: 'randomAbility', p, i }); f.abilities[i].dice++; break; }
        case 'rstat': { const s = STATS[rnd(5) - 1]; emit({ t: 'randomStat', p, s }); f[s]++; break; }
      }
    }
    peak();
  }

  function* tableRoll(p, kind) {
    yield { kind: 'scroll', p, table: kind };
    const v = rnd(20);
    applyEffects(p, (kind === 'cal' ? CAL : setup.enh2 ? ENH2 : ENH)[v]);
    emit({ t: 'table', p, table: kind, v, F: snapshot(F) });
    return v;
  }

  function* luckOff(reason) {
    for (;;) {
      yield { kind: 'luck', p: null, reason };
      const x = rnd(20), y = rnd(20);
      emit({ t: 'luck', reason, rolls: [x, y] });
      if (x !== y) return x > y ? 0 : 1;
    }
  }

  function* weaponAttack(p, second) {
    const f = F[p], q = 1 - p, r = F[q];
    f.swing = S.round;
    yield { kind: 'attack', p, second: !!second };
    const d = rnd(20);
    if (d === 1) {
      emit({ t: 'attack', p, d, result: 'fumble' });
      yield* tableRoll(p, 'cal');
      return 'end';
    }
    let max = false;
    if (d === 20) {
      emit({ t: 'attack', p, d, result: 'crit' });
      yield* tableRoll(p, 'enh');
      max = true;
    } else {
      const bonus = f.broken ? 0 : f[f.main], tot = d + bonus;
      let hit = tot > r.def;
      if (tot === r.def) { emit({ t: 'attack', p, d, bonus, tot, def: r.def, result: 'tie' }); hit = (yield* luckOff('attack')) === p; }
      if (!hit) { emit({ t: 'attack', p, d, bonus, tot, def: r.def, result: 'miss' }); return 'ok'; }
      emit({ t: 'attack', p, d, bonus, tot, def: r.def, result: 'hit' });
    }
    const bonus = f.broken ? 0 : f[f.main];
    const dice = max ? Array(f.weaponDice).fill(6) : Array.from({ length: f.weaponDice }, () => rnd(6));
    const dmg = Math.max(0, dice.reduce((a, b) => a + b, 0) + bonus);
    r.life = Math.max(0, r.life - dmg);
    emit({ t: 'damage', p, source: 'weapon', dice, bonus, dmg, max, F: snapshot(F) });
    return 'ok';
  }

  function* useAbility(p, i) {
    const f = F[p], q = 1 - p, a = f.abilities[i];
    a.cd = true;
    const dice = Array.from({ length: a.dice }, () => rnd(6));
    const dmg = Math.max(0, dice.reduce((x, y) => x + y, 0) + f[a.stat]);
    F[q].life = Math.max(0, F[q].life - dmg);
    if (a.debuff) F[q][a.debuff] = Math.max(0, F[q][a.debuff] - 1);
    let healDice = null, healed = 0;
    if (a.heal) {
      healDice = Array.from({ length: a.heal }, () => rnd(6));
      const before = f.life;
      f.life = Math.min(f.maxLife, f.life + healDice.reduce((x, y) => x + y, 0));
      healed = f.life - before;
    }
    emit({ t: 'damage', p, source: 'ability', i, dice, bonus: f[a.stat], dmg, debuff: a.debuff || null, healDice, healed, F: snapshot(F) });
  }

  function* takeTurn(p) {
    const f = F[p];
    emit({ t: 'turn', p });
    // Easy mode (setup.easy, N8 2026-11-06): no Calamity before each turn; natural 1s still bring one.
    if (!setup.easy) {
      yield* tableRoll(p, 'cal');
      if (over()) return;
    }
    const res = yield* weaponAttack(p, false);
    if (res === 'end' || over()) return;
    if (f.abilities.some((a) => !a.cd)) {
      let i;
      for (;;) {
        const input = yield { kind: 'ability', p, options: f.abilities.map((a, k) => (a.cd ? null : k)).filter((k) => k !== null) };
        i = input && Number.isInteger(input.choice) ? input.choice : -1;
        if (f.abilities[i] && !f.abilities[i].cd) break;
      }
      yield* useAbility(p, i);
    } else {
      emit({ t: 'allCooldown', p });
      yield* weaponAttack(p, true);
    }
  }

  emit({ t: 'start', setup, F: snapshot(F) });
  let lastRound = 8;
  for (S.round = 1; S.round <= 8; S.round++) {
    emit({ t: 'round' });
    yield { kind: 'speed', p: null };
    const a = rnd(20), b = rnd(20), nat = [a, b], tot = [a + F[0].speed, b + F[1].speed];
    emit({ t: 'speed', nat, tot });
    const skip = [false, false];
    let ended = false;
    for (const i of [0, 1]) {
      if (nat[i] === 1) { yield* tableRoll(i, 'cal'); skip[i] = true; if (over()) { ended = true; break; } }
      if (nat[i] === 20) yield* tableRoll(i, 'enh');
    }
    if (ended) { lastRound = S.round; break; }
    let first;
    if (nat[0] === 1 && nat[1] !== 1) first = 1; else if (nat[1] === 1 && nat[0] !== 1) first = 0;
    else if (nat[0] === 20 && nat[1] !== 20) first = 0; else if (nat[1] === 20 && nat[0] !== 20) first = 1;
    else if (tot[0] !== tot[1]) first = tot[0] > tot[1] ? 0 : 1;
    else first = yield* luckOff('speed');
    emit({ t: 'first', p: first, skip });
    for (const p of [first, 1 - first]) {
      if (skip[p]) { emit({ t: 'sitOut', p }); continue; }
      yield* takeTurn(p);
      if (over()) break;
    }
    if (over()) { lastRound = S.round; break; }
    for (const f of F) {
      if (!f.broken || S.round < f.brokenUntil) continue;
      if (setup.wb1 && f.swing !== S.round) { f.brokenUntil = S.round + 1; continue; } // sat out: it waits for the Hero's next turn
      f.broken = false; emit({ t: 'repaired', p: f.p });
    }
    if (S.round < 8) for (const p of [first, 1 - first]) yield* tableRoll(p, 'enh');
  }
  let w;
  const ko = over();
  if (ko) w = F[0].life > 0 ? 0 : 1;
  else if (F[0].life !== F[1].life) w = F[0].life > F[1].life ? 0 : 1;
  else { S.round = 8; w = yield* luckOff('final'); }
  const result = { winner: w, ko, rounds: ko ? lastRound : 8, life: F.map((f) => f.life), peakMax: F.map((f) => f.peakMax), ...(setup.climb || setup.carry ? { carry: F.map(carryOf) } : {}) };
  emit({ t: 'end', ...result, F: snapshot(F) });
  return result;
}

// Re-run a duel from its seed and inputs. Returns everything that has happened,
// the prompt now waiting (or null when finished) and the result when done.
// inputs: [{kind, p, choice?}] in the order they were accepted.
export function replay(seedHex, setup, inputs) {
  const events = [];
  const g = duel(setup, rngFrom(seedHex), events);
  let step = g.next();
  for (const input of inputs) {
    if (step.done) break;
    step = g.next(input);
  }
  return step.done
    ? { events, pending: null, result: step.value }
    : { events, pending: step.value, result: null };
}

// Whether `input` from player `p` answers the waiting prompt. Prompts with
// p === null (Speed, Luck Off) may be answered by either player.
export function accepts(pending, p, input) {
  if (!pending || !input || input.kind !== pending.kind) return false;
  if (pending.p !== null && pending.p !== p) return false;
  if (pending.kind === 'ability') return pending.options.includes(input.choice);
  return true;
}
