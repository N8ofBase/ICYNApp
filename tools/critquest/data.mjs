// Crit Quest balance data (Phase 1, rules on paper).
// Source: the "Crit Quest: Design Plan" doc (Hero creation + Ability trees, Recommendation column).
// Balance test 1 fixes (N8 approved 2026-11-10) are built in and marked "test 1 fix".
// Stats: P = power, E = energy, S = speed, C = charm.
// Ability fields read by sim.js:
//   dmg:[n,sides]  stat  hits  aoe  critMin  auto (no to-hit roll)  ignoreBuffs
//   foe effects: stun  sleep  hold  hit:[mod,dur]  def:[mod,dur]  stat:{X:mod,dur}  dot:[n,sides|0,flat,dur]
//                loseSpeed  noAbil  disarm  mark:[dur]  allRolls:[mod,dur]
//   self effects: heal:[n,sides,stat]  hot:[n,sides,dur]  selfDef:[mod,dur]  nextDie  nextHit  nextCrit
//                 extraAttack  counter:[n,sides,stat,dur]  thorns:[n,sides,dur]  untarget  rise  soak:[n,sides,stat]
//                 rally:[mod,dur]  reroll1s:[dur]  missNext  extraTurn  dieBonus:[n,dur]
//   win paths: execute (foe <= 25% Life is beaten), yieldAt (foe <= 25% yields), knell (d20 >= 11 wins)
//   inspire: +bonus to Inspire while equipped; gentle (Inspire allowed at half Life); silver (Inspire twice)
//   utility: true = value comes from Fear/party/hex play the duel sim cannot see

export const LIFEFORMS = {
  // No Lifeform battle actions (N8 2026-11-10).
  Dimoneesh: { def: 1, E: 1 },
  Leyf:      { E: 1, S: 1 },
  Lizerus:   { def: 1, P: 1 },
  Melkin:    { S: 1, C: 1 },
  Sapien:    { P: 1, C: 1 },
};

export const ROLES = {
  Brawler:   { life: 40, P: 1, S: 1, main: 'P', weapon: [1, 6], branches: ['Que Bao', 'Fury', 'Iron Body'] },
  Champion:  { life: 33, def: 1, P: 2, E: 1, main: 'P', weapon: [1, 6], branches: ['Honor', 'Sacred', 'Oath'] },
  Maverick:  { life: 30, S: 1, C: 2, main: 'C', weapon: [1, 6], branches: ['Sharpsight', 'Trickster', 'Wayfinder'] },
  'Soul Seer': { life: 30, E: 2, S: 1, main: 'E', weapon: [1, 6], branches: ['Mender', 'Sound', 'Nature'] },
  Whisper:   { life: 30, S: 1, C: 1, dmg: 1, main: 'S', weapon: [1, 6], branches: ['Wind', 'Shadow', 'Heart'] },
};

// Cooldown (rounds the ability rests after use) by tier level.
export const TIER_CD = { 1: 1, 3: 2, 7: 2, 11: 3, 15: 3, 19: 4 };
export const TIERS = [1, 3, 7, 11, 15, 19];

const A = (role, branch, tier, name, o) => ({ role, branch, tier, name, ...o });

export const ABILITIES = [
  // ---------- Brawler ----------
  A('Brawler', 'Que Bao', 1, 'Suplex', { dmg: [1, 8], stat: 'P', loseSpeed: true }),
  A('Brawler', 'Que Bao', 3, 'Bear Hug', { dmg: [1, 6], stat: 'P', hold: [1, 6, 12, 2] }), // test 1 fix: 2 rounds max
  A('Brawler', 'Que Bao', 7, 'Throat Grab', { dmg: [2, 6], stat: 'P', noAbil: 1 }),
  A('Brawler', 'Que Bao', 11, 'Submit', { stat: 'C', yieldAt: 0.5, auto: true }), // test 1 fix: half Life
  A('Brawler', 'Que Bao', 15, 'Tackle', { dmg: [3, 6], stat: 'P', def: [-2, 1], aoe2: true }),
  A('Brawler', 'Que Bao', 19, 'Skull Crusher', { dmg: [5, 8], stat: 'P', stun: 1 }),
  A('Brawler', 'Fury', 1, 'Crush', { dmg: [1, 10], stat: 'P' }),
  A('Brawler', 'Fury', 3, 'Fury', { extraAttack: true, auto: true }),
  A('Brawler', 'Fury', 7, 'Flurry Fist', { dmg: [1, 6], hits: 3, stat: 'S' }),
  A('Brawler', 'Fury', 11, 'Punish', { counter: [2, 6, 'P', 2], auto: true }),
  A('Brawler', 'Fury', 15, 'Earthshaker', { dmg: [3, 6], stat: 'P', aoe: true }),
  A('Brawler', 'Fury', 19, 'Decimate', { dmg: [6, 6], stat: 'P', aoe: true }),
  A('Brawler', 'Iron Body', 1, 'Leap', { dmg: [1, 6], stat: 'S' }),
  A('Brawler', 'Iron Body', 3, 'Breather', { heal: [2, 6, 'P'], cleanse: true, auto: true }),
  A('Brawler', 'Iron Body', 7, 'Energy Blocker', { auto: false, stat: 'E', statMod: { E: -2, dur: 3 } }),
  A('Brawler', 'Iron Body', 11, 'Sweep', { dmg: [2, 6], stat: 'C', aoe: true, statMod: { S: -1, dur: 2 } }),
  A('Brawler', 'Iron Body', 15, 'Guardian Stance', { utility: true, auto: true, selfDef: [1, 2] }),
  A('Brawler', 'Iron Body', 19, 'Unbreakable', { rise: true, passive: true }),
  // ---------- Champion ----------
  A('Champion', 'Honor', 1, 'Overpower', { dmg: [1, 8], stat: 'P' }),
  A('Champion', 'Honor', 3, 'Shield Slam', { dmg: [2, 6], stat: 'P', hit: [-2, 1] }),
  A('Champion', 'Honor', 7, 'Arc', { dmg: [3, 6], stat: 'P', aoe: true }),
  A('Champion', 'Honor', 11, 'Counter', { counter: [3, 8, 'S', 2], auto: true }),
  A('Champion', 'Honor', 15, 'Shieldwall', { selfDef: [3, 2], auto: true }),
  A('Champion', 'Honor', 19, 'Juggernaut', { dmg: [6, 6], stat: 'P' }),
  A('Champion', 'Sacred', 1, 'Radiant Strike', { dmg: [1, 10], stat: 'E', orHeal: true }),
  A('Champion', 'Sacred', 3, 'Weakness', { dmg: [1, 8], stat: 'E', def: [-1, 3] }),
  A('Champion', 'Sacred', 7, 'Radiant Ward', { soak: [2, 6, 'E'], auto: true }),
  A('Champion', 'Sacred', 11, 'Sanctify', { inspire: 2, fearHit: -2, utility: true, auto: true }),
  A('Champion', 'Sacred', 15, 'Purge', { heal: [2, 6, 'E'], cleanse: true, auto: true }),
  A('Champion', 'Sacred', 19, 'Radiant Blast', { dmg: [8, 8], stat: 'E' }),
  A('Champion', 'Oath', 1, 'Refresh', { heal: [2, 6, 'C'], auto: true }),
  A('Champion', 'Oath', 3, 'Protect', { selfDef: [2, 2], dmgBuff: [1, 2], auto: true }),
  A('Champion', 'Oath', 7, 'Concuss', { dmg: [1, 8], stat: 'C', statMod: { C: -2, dur: 3 } }),
  A('Champion', 'Oath', 11, 'Rally', { rally: [1, 3], auto: true }),
  A('Champion', 'Oath', 15, 'Stand Firm', { utility: true, auto: true }),
  A('Champion', 'Oath', 19, 'Oath of Light', { utility: true, auto: true, revive: true }),
  // ---------- Maverick ----------
  A('Maverick', 'Sharpsight', 1, 'Pierce', { dmg: [1, 8], stat: 'P', statMod: { P: -1, dur: 2 } }),
  A('Maverick', 'Sharpsight', 3, 'Flight', { selfDef: [3, 1], dmg: [1, 6], stat: 'S', freeShot: true }),
  A('Maverick', 'Sharpsight', 7, 'Steady Aim', { nextHit: 4, nextCrit: 19, auto: true }),
  A('Maverick', 'Sharpsight', 11, 'Volley', { dmg: [1, 6], hits: 3, stat: 'S' }),
  A('Maverick', 'Sharpsight', 15, 'Fated Mark', { mark: [3], stat: 'S' }),
  A('Maverick', 'Sharpsight', 19, 'Arrow Rain', { dmg: [4, 6], stat: 'S', aoe: true }),
  A('Maverick', 'Trickster', 1, 'Discourage', { stat: 'C', hit: [-2, 2] }),
  A('Maverick', 'Trickster', 3, 'Bola', { dmg: [1, 6], stat: 'C', root: 1 }),
  A('Maverick', 'Trickster', 7, 'Parley', { stat: 'C', stun: 1, inspire: 2 }),
  A('Maverick', 'Trickster', 11, 'Disarm', { stat: 'C', disarm: 1 }),
  A('Maverick', 'Trickster', 15, 'Silver Tongue', { silver: true, passive: true }),
  A('Maverick', 'Trickster', 19, 'Bladestorm', { dmg: [5, 6], stat: 'C', aoe: true }),
  A('Maverick', 'Wayfinder', 1, 'Poison', { stat: 'C', dot: [0, 0, 2, 3] }),
  A('Maverick', 'Wayfinder', 3, 'Snare', { dmg: [2, 6], stat: 'C', stun: 1 }), // test 1 fix: Charm roll to spring
  A('Maverick', 'Wayfinder', 7, 'Soul Shot', { dmg: [2, 8], stat: 'E', ignoreBuffs: true }),
  A('Maverick', 'Wayfinder', 11, 'Camouflage', { untarget: 1, nextDie: 1, auto: true }),
  A('Maverick', 'Wayfinder', 15, 'Rocsprey Call', { dmg: [3, 6], auto: true }),
  A('Maverick', 'Wayfinder', 19, 'Windrunner', { extraTurn: true, auto: true }),
  // ---------- Soul Seer ----------
  A('Soul Seer', 'Mender', 1, 'Soul Syphon', { dmg: [1, 8], stat: 'E', heal: [1, 6, null] }),
  A('Soul Seer', 'Mender', 3, 'Healing Breeze', { heal: [2, 6, 'E'], auto: true }),
  A('Soul Seer', 'Mender', 7, 'Calm', { inspire: 1, utility: true, auto: true }),
  A('Soul Seer', 'Mender', 11, 'Soul Shield', { utility: true, auto: true }),
  A('Soul Seer', 'Mender', 15, 'Renewal', { hot: [1, 6, 3], auto: true }),
  A('Soul Seer', 'Mender', 19, 'Salvation', { utility: true, auto: true, revive: true }),
  A('Soul Seer', 'Sound', 1, 'Psylance', { dmg: [1, 8], stat: 'C' }),
  A('Soul Seer', 'Sound', 3, 'Mind-Spike', { dmg: [1, 10], stat: 'E', statMod: { S: -2, dur: 2 } }),
  A('Soul Seer', 'Sound', 7, 'Sonic Slice', { dmg: [3, 8], /* test 1 fix */ stat: 'E', aoe: true }),
  A('Soul Seer', 'Sound', 11, 'Lullaby', { sleep: 2, contested: 'C', aoe: true, auto: true }),
  A('Soul Seer', 'Sound', 15, 'Echo Sight', { selfDef: [2, 2], auto: true }),
  A('Soul Seer', 'Sound', 19, 'Death Knell', { knell: true, knellAt: 0.5, /* test 1 fix */ dmgBeast: [6, 10], stat: 'E', auto: true }),
  A('Soul Seer', 'Nature', 1, 'Thorns', { thorns: [1, 6, 2], dmg: [1, 4], stat: 'E' }),
  A('Soul Seer', 'Nature', 3, 'Entangle', { stat: 'E', stun: 1 }),
  A('Soul Seer', 'Nature', 7, 'Explosion', { dmg: [2, 6], stat: 'P', aoe: true }),
  A('Soul Seer', 'Nature', 11, 'Engulf', { dmg: [3, 8], stat: 'E', stun: 1 }),
  A('Soul Seer', 'Nature', 15, 'Glowvine Grove', { hot: [1, 8, 3], auto: true }),
  A('Soul Seer', 'Nature', 19, 'Nature Blast', { dmg: [8, 6], stat: 'E', aoe: true }),
  // ---------- Whisper ----------
  A('Whisper', 'Wind', 1, 'Double Strike', { dmg: [1, 6], hits: 2, stat: 'S' }),
  A('Whisper', 'Wind', 3, 'Downdraft', { dmg: [1, 8], stat: 'P', def: [-2, 2] }),
  A('Whisper', 'Wind', 7, 'Gale Gust', { dmg: [2, 8], stat: 'P', critMin: 18 }),
  A('Whisper', 'Wind', 11, 'Crosswind', { stat: 'S', def: [-2, 2], statMod: { S: -2, dur: 2 } }),
  A('Whisper', 'Wind', 15, 'Stinging Breeze', { dmg: [2, 6], stat: 'S', dot: [1, 6, 0, 3] }),
  A('Whisper', 'Wind', 19, 'Eye of the Storm', { execute: 0.5, auto: true }), // test 1 fix: half Life
  A('Whisper', 'Shadow', 1, 'Darkness', { dmg: [1, 6], /* test 1 fix */ stat: 'E', statMod: { P: -2, dur: 2 }, selfDef: [2, 2], auto: true }),
  A('Whisper', 'Shadow', 3, 'Shadow Step', { dmg: [1, 6], stat: 'S', nextDie: 1 }), // test 1 fix
  A('Whisper', 'Shadow', 7, 'Smoke', { hit: [-3, 1], aoe: true, auto: true }),
  A('Whisper', 'Shadow', 11, 'Shadow-Strike', { dmg: [3, 6], stat: 'S', noCounter: true }),
  A('Whisper', 'Shadow', 15, 'Nightfall', { hit: [-4, 1], aoe: true, auto: true }),
  A('Whisper', 'Shadow', 19, 'One with Shadow', { untarget: 2, dieBonus: [1, 2], auto: true }),
  A('Whisper', 'Heart', 1, 'Heartbreak', { dmg: [1, 8], stat: 'C', allRolls: [-1, 2] }),
  A('Whisper', 'Heart', 3, 'Heartbreath', { heal: [1, 8, 'C'], cleanse: true, auto: true }),
  A('Whisper', 'Heart', 7, 'Whispered Truth', { inspire: 2, utility: true, auto: true }),
  A('Whisper', 'Heart', 11, 'Gentle Word', { gentle: true, passive: true }),
  A('Whisper', 'Heart', 15, 'Kindness Unseen', { missNext: true, auto: true }),
  A('Whisper', 'Heart', 19, 'Hope', { reroll1s: [2], inspire: 2, auto: true }),
];

// Farluck Farm terrors (First quest tab). toHit and Defense are draft guesses.
export const TERRORS = {
  gremlin: { name: 'Plague Gremlin', life: 8, /* test 1 fix */ def: 10, toHit: 2, attacks: [{ dmg: [1, 6], plague: 0.3 }], flees: 0.25 },
  spitter: { name: 'Gremlin Spitter', life: 8, def: 11, toHit: 2, attacks: [{ dmg: [1, 6] }], flees: 0.25 },
  rotfang: { name: 'Rotfang', life: 25, perHero: 15, def: 12, toHit: 3, partyToHit: 4, /* test 1 fix: solo 25 Life */ attacks: [{ dmg: [2, 6], plague: 0.5 }], screech: 3, summon: 0.5, cleanseAt: 0.25, boss: true },
};
