// Headless Starvos Catastrophe engine for server-refereed online co-op.
// Mirrors the boss mode in the game page (src.html, S.mode==='boss'): every
// Hero has 50 Life, Starvos has 80 Life per Hero. Each round: Fear Wave,
// Starvos' round Ability (no to-hit roll), Speed, Hero turns, Enhancements.
// Starvos falls: win. All Heroes fall, or Starvos survives round 8: loss.
//
// Like the duel engine it is a generator driven by prompts and inputs.
// Heroes are indexed 0..n-1 in setup.heroes; setup.owners[h] is the player
// (seat) who controls Hero h. A prompt's `p` is a Hero index. Group prompts
// (fear, speed, dodge, enh) list the Heroes rolling in `ps` and the seats
// still to press in `wait`; the dice roll once every seat has pressed.
import { HEROES, CAL, ENH, rngFrom } from './engine.mjs';

export const STARVOS = { lifePerHero: 80, heroLife: 50, fear: 5, rounds: 8,
  stats: { def: 12, power: 5, energy: 4, speed: 6, charm: 4 },
  abilities: {
    claw: { name: 'Claw Strike', dice: 2, sides: 6, stat: 'speed', all: false },
    fire: { name: 'Fire Blast', dice: 2, sides: 6, stat: 'energy', all: true },
    bite: { name: 'Bite', dice: 1, sides: 20, stat: 'power', all: false },
    dev: { name: 'Devastate', dice: 3, sides: 6, stat: 'charm', all: true } },
  order: ['claw', 'fire', 'bite', 'dev', 'fire', 'claw', 'bite', 'dev'] };
const STATS = ['def', 'power', 'energy', 'speed', 'charm'];
const GROUP = ['fear', 'speed', 'dodge', 'enh'];

function makeHero(id, p, owner) {
  const h = HEROES[id];
  return { p, id, owner, name: h.name, main: h.main, ...h.stats, life: STARVOS.heroLife, maxLife: STARVOS.heroLife, weaponDice: 1,
    broken: false, brokenUntil: 0, afraid: false, dealt: 0, abilities: h.abilities.map((a) => ({ ...a, cd: false })) };
}

// Public view of the Heroes and Starvos, sent with events that change them.
export function snapshot(F, B) {
  return {
    heroes: F.map((f) => ({ id: f.id, life: f.life, maxLife: f.maxLife, def: f.def, power: f.power, energy: f.energy, speed: f.speed, charm: f.charm,
      weaponDice: f.weaponDice, broken: f.broken, brokenUntil: f.brokenUntil, afraid: f.afraid, abilities: f.abilities.map((a) => ({ dice: a.dice, cd: a.cd })) })),
    boss: { life: B.life, maxLife: B.maxLife, def: B.def, power: B.power, energy: B.energy, speed: B.speed, charm: B.charm },
  };
}

// setup = {mode: 'boss', heroes: [id...], owners: [seat...]}
export function* catastrophe(setup, rnd, ev) {
  const F = setup.heroes.map((id, p) => makeHero(id, p, setup.owners[p]));
  const L = F.length * STARVOS.lifePerHero;
  const B = { life: L, maxLife: L, ...STARVOS.stats };
  const S = { round: 0 };
  const emit = (e) => ev.push({ round: S.round, ...e });
  const snap = () => snapshot(F, B);
  const standing = () => F.filter((f) => f.life > 0).map((f) => f.p);
  const bossDown = () => B.life <= 0;
  const heroesDown = () => !standing().length;
  const hurt = (p, n) => { F[p].life = Math.max(0, F[p].life - n); if (F[p].life <= 0) emit({ t: 'fallen', p }); };
  const bossHit = (p, n) => { const d = Math.min(B.life, n); B.life -= d; F[p].dealt += d; };

  function applyEffects(p, list) {
    const f = F[p];
    for (const e of list) {
      switch (e[0]) {
        case 'lifeloss': f.life = Math.max(1, f.life - e[1]); break;
        case 'half': f.life = Math.ceil(f.life / 2); break;
        case 'all': for (const s of STATS) f[s] = Math.max(0, f[s] + e[1]); break;
        case 'main': f[f.main] = Math.max(0, f[f.main] + e[1]); break;
        case 'stat': f[e[1]] = Math.max(0, f[e[1]] + e[2]); break;
        case 'broken': f.broken = true; f.brokenUntil = S.round + 1; break;
        case 'rcd': { const i = rnd(4) - 1; emit({ t: 'randomAbility', p, i }); f.abilities[i].cd = true; break; }
        case 'maxlife': f.maxLife += e[1]; f.life += e[1]; break;
        case 'life': f.life = Math.min(f.maxLife, f.life + e[1]); break;
        case 'full': f.life = f.maxLife; break;
        case 'clear': f.abilities.forEach((a) => { a.cd = false; }); break;
        case 'weapon': f.broken = false; f.weaponDice++; break;
        case 'rai': { f.abilities.forEach((a) => { a.cd = false; }); const i = rnd(4) - 1; emit({ t: 'randomAbility', p, i }); f.abilities[i].dice++; break; }
      }
    }
  }

  // A Calamity or Enhancement on the scroll, rolled by the Hero's owner (the
  // end-of-round Enhancements roll together instead, see below).
  function* tableRoll(p, table, prompt = true) {
    if (prompt) yield { kind: 'scroll', p, table };
    const v = rnd(20);
    applyEffects(p, (table === 'cal' ? CAL : ENH)[v]);
    emit({ t: 'table', p, table, v, F: snap() });
    return v;
  }

  // Every seat that owns one of the Heroes `ps` presses once, then the dice roll.
  function* group(kind, ps, extra = {}) {
    const wait = [...new Set(ps.map((p) => F[p].owner))].sort((a, b) => a - b);
    while (wait.length) {
      const input = yield { kind, p: null, ps, wait: wait.slice(), ...extra };
      const k = wait.indexOf(input && input.by);
      if (k >= 0) wait.splice(k, 1);
    }
  }

  function* fearWave() {
    const ps = standing();
    emit({ t: 'fearWave', ps });
    yield* group('fear', ps);
    const rolls = ps.map((p) => rnd(20));
    const afraid = [];
    ps.forEach((p, i) => {
      const v = rolls[i];
      if (v === 1 || (v !== 20 && v + F[p].charm <= STARVOS.fear)) { afraid.push(p); F[p].afraid = true; }
    });
    emit({ t: 'fear', ps, rolls, tot: ps.map((p, i) => rolls[i] + F[p].charm), afraid });
    for (const [i, p] of ps.entries()) {
      if (rolls[i] === 1) yield* tableRoll(p, 'cal');
      if (rolls[i] === 20) yield* tableRoll(p, 'enh');
    }
    if (!afraid.length) return;
    const dmg = afraid.map(() => rnd(6));
    afraid.forEach((p, i) => hurt(p, dmg[i]));
    emit({ t: 'fearDamage', ps: afraid, dice: dmg.map((d) => [d]), dmg, F: snap() });
  }

  // Claw Strike and Bite: the standing Heroes each roll a plain D20 and the lowest takes the blow (tied lowest roll again).
  function* randomTarget() {
    let ps = standing();
    if (ps.length === 1) return ps[0];
    for (let again = false; ; again = true) {
      yield* group('dodge', ps, { again });
      const rolls = ps.map(() => rnd(20));
      const lo = Math.min(...rolls), low = ps.filter((p, i) => rolls[i] === lo);
      emit({ t: 'dodge', ps, rolls, caught: low.length === 1 ? low[0] : null });
      if (low.length === 1) return low[0];
      ps = low;
    }
  }

  function* starvosStrike() {
    const key = STARVOS.order[S.round - 1], a = STARVOS.abilities[key];
    emit({ t: 'strike', a: key });
    const targets = a.all ? standing() : [yield* randomTarget()];
    const bonus = B[a.stat];
    const dice = targets.map(() => Array.from({ length: a.dice }, () => rnd(a.sides)));
    const dmg = dice.map((d) => d.reduce((x, y) => x + y, 0) + bonus);
    targets.forEach((p, i) => hurt(p, dmg[i]));
    emit({ t: 'strikeHit', a: key, ps: targets, dice, bonus, dmg, F: snap() });
  }

  function* speed() {
    const ps = standing().filter((p) => !F[p].afraid);
    if (!ps.length) return { order: [], acted: [] };
    yield* group('speed', ps);
    const nat = ps.map(() => rnd(20)), tot = ps.map((p, i) => nat[i] + F[p].speed), tie = ps.map(() => rnd(1000));
    emit({ t: 'speed', ps, nat, tot });
    const lost = new Set();
    for (const [i, p] of ps.entries()) {
      if (nat[i] === 1) { yield* tableRoll(p, 'cal'); lost.add(p); }
      if (nat[i] === 20) yield* tableRoll(p, 'enh');
    }
    // natural 20s act first; otherwise highest Speed (teammates break ties at random)
    const key = (i) => (nat[i] === 20 ? 1000 : 0) + tot[i] + tie[i] / 10000;
    const order = ps.map((p, i) => i).filter((i) => !lost.has(ps[i])).sort((x, y) => key(y) - key(x)).map((i) => ps[i]);
    emit({ t: 'order', order, lost: [...lost] });
    return { order, acted: ps };
  }

  function* weapon(p, second) {
    const f = F[p];
    yield { kind: 'attack', p, second: !!second };
    const d = rnd(20);
    if (d === 1) { emit({ t: 'attack', p, d, result: 'fumble' }); yield* tableRoll(p, 'cal'); return 'end'; }
    let max = false;
    if (d === 20) { emit({ t: 'attack', p, d, result: 'crit' }); yield* tableRoll(p, 'enh'); max = true; }
    else {
      const bonus = f.broken ? 0 : f[f.main], tot = d + bonus, hit = tot >= B.def; // ties go to the Heroes
      emit({ t: 'attack', p, d, bonus, tot, def: B.def, result: hit ? 'hit' : 'miss' });
      if (!hit) return 'ok';
    }
    const bonus = f.broken ? 0 : f[f.main];
    const dice = max ? Array(f.weaponDice).fill(6) : Array.from({ length: f.weaponDice }, () => rnd(6));
    const dmg = dice.reduce((a, b) => a + b, 0) + bonus;
    bossHit(p, dmg);
    emit({ t: 'damage', p, source: 'weapon', dice, bonus, dmg, max, F: snap() });
    return 'ok';
  }

  function* ability(p) {
    const f = F[p];
    let i;
    for (;;) {
      const input = yield { kind: 'ability', p, options: f.abilities.map((a, k) => (a.cd ? null : k)).filter((k) => k !== null) };
      i = input && Number.isInteger(input.choice) ? input.choice : -1;
      if (f.abilities[i] && !f.abilities[i].cd) break;
    }
    const a = f.abilities[i];
    a.cd = true;
    const dice = Array.from({ length: a.dice }, () => rnd(6));
    const dmg = Math.max(0, dice.reduce((x, y) => x + y, 0) + f[a.stat]);
    bossHit(p, dmg);
    const debuff = a.debuff && B[a.debuff] > 0 ? a.debuff : null;
    if (debuff) B[debuff]--;
    let healDice = null, healed = 0;
    if (a.heal) {
      healDice = Array.from({ length: a.heal }, () => rnd(6));
      const before = f.life;
      f.life = Math.min(f.maxLife, f.life + healDice.reduce((x, y) => x + y, 0));
      healed = f.life - before;
    }
    emit({ t: 'damage', p, source: 'ability', i, dice, bonus: f[a.stat], dmg, debuff, healDice, healed, F: snap() });
  }

  function* turn(p) {
    const f = F[p];
    emit({ t: 'turn', p });
    const res = yield* weapon(p, false);
    if (res === 'end' || bossDown()) return;
    if (f.abilities.some((a) => !a.cd)) yield* ability(p);
    else { emit({ t: 'allCooldown', p }); yield* weapon(p, true); }
  }

  // End of round: the Heroes who stood firm roll their Enhancements together.
  function* enhancements(ps) {
    if (!ps.length) return;
    yield* group('enh', ps);
    for (const p of ps) yield* tableRoll(p, 'enh', false);
  }

  emit({ t: 'start', setup, F: snap() });
  for (S.round = 1; S.round <= STARVOS.rounds; S.round++) {
    F.forEach((f) => { f.afraid = false; });
    emit({ t: 'round' });
    yield* fearWave(); if (heroesDown()) break;
    yield* starvosStrike(); if (heroesDown()) break;
    const sp = yield* speed();
    for (const p of sp.order) { if (F[p].life <= 0) continue; yield* turn(p); if (bossDown()) break; }
    if (bossDown()) break;
    for (const f of F) if (f.broken && S.round >= f.brokenUntil) { f.broken = false; emit({ t: 'repaired', p: f.p }); }
    if (S.round < STARVOS.rounds) yield* enhancements(sp.acted.filter((p) => F[p].life > 0));
  }
  const rounds = Math.min(STARVOS.rounds, S.round);
  const outcome = bossDown() ? 'win' : heroesDown() ? 'fallen' : 'annihilate';
  F.forEach((f) => { f.afraid = false; });
  const result = { outcome, rounds, bossLife: B.maxLife, bossLeft: B.life, survivors: standing().length,
    life: F.map((f) => f.life), dealt: F.map((f) => f.dealt) };
  emit({ t: 'end', ...result, F: snap() });
  return result;
}

// Same contract as the duel replay(): inputs are [{kind, by, choice?}].
export function replayBoss(seedHex, setup, inputs) {
  const events = [];
  const g = catastrophe(setup, rngFrom(seedHex), events);
  let step = g.next();
  for (const input of inputs) {
    if (step.done) break;
    step = g.next(input);
  }
  return step.done ? { events, pending: null, result: step.value } : { events, pending: step.value, result: null };
}

// Seats who may answer the waiting prompt.
export function waitingOn(pending, owners) {
  if (!pending) return [];
  return GROUP.includes(pending.kind) ? pending.wait : [owners[pending.p]];
}

// Whether `input` from seat `by` answers the waiting prompt.
export function acceptsBoss(pending, by, input, owners) {
  if (!pending || !input || input.kind !== pending.kind) return false;
  if (!waitingOn(pending, owners).includes(by)) return false;
  if (pending.kind === 'ability') return pending.options.includes(input.choice);
  return true;
}
