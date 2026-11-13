const LIFEFORMS = { Dimoneesh: { def: 1, E: 1 }, Leyf: { E: 1, S: 1 }, Lizerus: { def: 1, P: 1 }, Melkin: { S: 1, C: 1 }, Sapien: { P: 1, C: 1 } };
const ROLES = {
  Brawler:     { life: 40, grow: 4, P: 1, S: 1, main: 'P', wRange: 1, weapon: 'Fists', color: '#7a2232', branches: ['Que Bao', 'Fury', 'Bedrock'] },
  Champion:    { life: 33, grow: 5, def: 1, P: 2, E: 1, main: 'P', wRange: 1, weapon: 'Blade', color: '#a8913a', branches: ['Honor', 'Sacred', 'Oath'] },
  Maverick:    { life: 30, grow: 4, S: 1, C: 2, main: 'C', wRange: 8, weapon: 'Stringbow', color: '#5e6a3e', branches: ['Sharpsight', 'Trickster', 'Wayfinder'] },
  'Soul Seer': { life: 30, grow: 4, E: 2, S: 1, main: 'E', wRange: 4, weapon: 'Staff spark', color: '#3f7480', branches: ['Mender', 'Sound', 'Nature'] },
  Whisper:     { life: 30, grow: 4, S: 1, C: 1, dmg: 1, main: 'S', wRange: 1, weapon: 'Daggers', color: '#4a4a63', branches: ['Wind', 'Shadow', 'Blade'] },
};
const STATN = { P: 'Power', E: 'Energy', S: 'Speed', C: 'Charm' };
const TIER_CD = { 1: 1, 3: 2 };

// Each Focus slot (level 1 and level 3) offers the 2 abilities N8 approved on Nov 11 (tab "Updated abilities").
// A slot is named "<Focus> <level>"; Combos pair slots, so either pick counts.
const FAMS = [];
const F = (role, branch, tier, versions) => FAMS.push({ role, branch, tier, fam: `${branch} ${tier}`, versions: versions.map(v => ({ role, branch, tier, fam: `${branch} ${tier}`, kind: 'foe', ...v })) });
F('Brawler', 'Que Bao', 1, [
  { name: 'Suplex', range: 1, stat: 'P', dmg: [1, 8], on: { last: 1 }, t: 'Slam the foe down: 1d8+P, and it acts last next round.' },
  { name: 'Body Slam', range: 1, stat: 'P', dmg: [1, 10], t: 'A plain, heavy slam: 1d10+P.' }]);
F('Brawler', 'Que Bao', 3, [
  { name: 'Crushing Hug', range: 1, stat: 'P', dmg: [2, 6], on: { hit: [-2, 1] }, t: '2d6+P, and the foe is -2 to hit on its next turn.' },
  { name: 'Calming Hug', range: 1, stat: 'C', dmg: [1, 6], on: { root: 2 }, t: '1d6+C. The foe can’t move for 2 rounds.' }]);
F('Brawler', 'Fury', 1, [
  { name: 'Hammer Fist', range: 1, stat: 'P', dmg: [1, 8], critMin: 18, t: '1d8+P that crits on 18 to 20.' },
  { name: 'Rushing Crush', range: 1, stat: 'S', dmg: [2, 6], self: { def: [-2, 1] }, t: '2d6+S, but you are -2 Defense until your next turn.' }]);
F('Brawler', 'Fury', 3, [
  { name: 'Fury Flurry', kind: 'attacks', n: 3, hitMod: -3, t: 'Three Fists attacks, each rolled to hit at -3.' },
  { name: 'Focused Fury', kind: 'attacks', n: 1, hitMod: 3, extraDie: 1, t: 'One Fists attack at +3 to hit with an extra die (2d6+P).' }]);
F('Brawler', 'Bedrock', 1, [
  { name: 'Sky Crash', leap: 4, stat: 'S', dmg: [1, 4], on: { hit: [-1, 1] }, t: 'Jump up to 4 hexes to a foe, then 1d4+S; it is -1 to hit on its next turn.' },
  { name: 'Jump Punch', leap: 2, stat: 'P', dmg: [1, 8], t: 'Jump up to 2 hexes to a foe, then 1d8+P.' }]);
F('Brawler', 'Bedrock', 3, [
  { name: 'Second Wind', kind: 'self', self: { heal: [1, 6, 'E'], defUp: [2, 2] }, t: 'Heal 1d6+E and get +2 Defense for 2 rounds.' },
  { name: 'Thick Skin', kind: 'self', self: { defUp: [3, 2] }, t: '+3 Defense for 2 rounds.' }]);

F('Champion', 'Honor', 1, [
  { name: 'Mighty Strike', range: 1, stat: 'P', dmg: [1, 10], t: 'A two-handed swing: 1d10+P.' },
  { name: 'Guard Strike', range: 1, stat: 'P', dmg: [1, 6], self: { defUp: [1, 1] }, t: '1d6+P, and you get +1 Defense until your next turn.' }]);
F('Champion', 'Honor', 3, [
  { name: 'Shield Bash', range: 1, stat: 'P', dmg: [1, 8], on: { knock: 1, last: 1 }, t: '1d8+P, knock the foe back 1 hex, and it acts last next round.' },
  { name: 'Shield Wall', kind: 'aura', radius: 1, self: { defUp: [1, 2] }, t: 'You and allies next to you get +1 Defense for 2 rounds.' }]);
F('Champion', 'Sacred', 1, [
  { name: 'Holy Spark', range: 4, stat: 'E', dmg: [1, 8], on: { hit: [-1, 1] }, t: '1d8+E at range 4; the foe is -1 to hit for 1 round.' },
  { name: 'Mending Light', kind: 'ally', range: 4, self: { heal: [2, 6, 'E'] }, t: 'Heal an ally (or yourself) within 4 for 2d6+E.' }]);
F('Champion', 'Sacred', 3, [
  { name: 'Weaken', range: 4, stat: 'E', dmg: [1, 6], on: { weak: [2, 2] }, t: '1d6+E at range 4; the foe deals 2 less for 2 rounds.' },
  { name: 'Expose', range: 4, stat: 'C', on: { def: [-2, 2] }, t: 'Charm roll at range 4: the foe is -2 Defense for 2 rounds.' }]);
F('Champion', 'Oath', 1, [
  { name: 'Refresh', kind: 'ally', range: 2, self: { heal: [2, 6, 'C'] }, t: 'Heal an ally (or yourself) within 2 for 2d6+C.' },
  { name: 'Vigor', kind: 'self', self: { defUp: [1, 2], hitUp: [1, 2] }, t: '+1 Defense and +1 to hit for 2 rounds.' }]);
F('Champion', 'Oath', 3, [
  { name: 'Sworn Strike', range: 2, stat: 'C', dmg: [2, 6], t: '2d6+C to a foe within 2.' },
  { name: 'Rally', kind: 'aura', radius: 2, self: { hitUp: [1, 2] }, t: 'You and allies within 2 get +1 to hit for 2 rounds.' }]);

F('Maverick', 'Sharpsight', 1, [
  { name: 'Long Shot', range: 10, stat: 'C', dmg: [1, 8], noCover: true, t: 'Stringbow 1d8+C out to 10 hexes, ignoring cover.' },
  { name: 'Pierce', range: 8, stat: 'C', dmg: [1, 6], on: { root: 1 }, t: 'Stringbow 1d6+C; the foe can’t move on its next turn.' }]);
F('Maverick', 'Sharpsight', 3, [
  { name: 'Flight', kind: 'fly', fly: 3, shot: [1, 8, 'S'], t: 'Fly up to 3 hexes, then take a free 1d8+S shot.' },
  { name: 'Quick Shot', range: 8, stat: 'S', dmg: [1, 6], hits: 2, hitMod: -2, t: 'Two stringbow shots of 1d6+S, each at -2 to hit.' }]);
F('Maverick', 'Trickster', 1, [
  { name: 'Mock', range: 4, stat: 'C', on: { charm: [-2, 2], hit: [-1, 2] }, t: 'Charm roll at range 4: the foe is -2 Charm and -1 to hit for 2 rounds.' },
  { name: 'Sly Shot', range: 8, stat: 'C', dmg: [1, 6], on: { hit: [-1, 2] }, t: 'Stringbow 1d6+C; the foe is -1 to hit for 2 rounds.' }]);
F('Maverick', 'Trickster', 3, [
  { name: 'Tangle Bola', range: 4, stat: 'C', dmg: [1, 4], on: { root: 2 }, t: '1d4+C at range 4; the foe can’t move for 2 rounds.' },
  { name: 'Weighted Bola', range: 3, stat: 'P', dmg: [1, 8], on: { exposed: 1, slow: [3, 1] }, t: '1d8+P at range 3; the foe is knocked down and -3 Speed next round.' }]);
F('Maverick', 'Wayfinder', 1, [
  { name: 'Venom Shot', range: 8, stat: 'E', dmg: [1, 6], on: { dot: [1, 3] }, t: 'Stringbow 1d6+E; the foe loses 1 Life a turn for 3 turns.' },
  { name: 'Numbing Dart', range: 4, stat: 'C', on: { move: [-2, 2], slow: [2, 2] }, t: 'Charm roll at range 4: the foe is Move -2 and Speed -2 for 2 rounds.' }]);
F('Maverick', 'Wayfinder', 3, [
  { name: 'Snare', range: 4, stat: 'C', dmg: [1, 6], on: { exposed: 1, root: 1 }, t: '1d6+C at range 4; the foe is knocked down and can’t move on its next turn.' },
  { name: 'Stop Shot', range: 4, stat: 'E', dmg: [1, 8], on: { root: 2 }, t: '1d8+E at range 4; the foe can’t move for 2 rounds.' }]);

F('Soul Seer', 'Mender', 1, [
  { name: 'Life Thread', range: 4, stat: 'E', dmg: [1, 6], mendAlly: [1, 6], t: '1d6+E at range 4, and your most hurt ally within 4 heals 1d6 if it hits.' },
  { name: 'Wither Touch', range: 2, stat: 'E', dmg: [1, 10], t: '1d10+E to a foe within 2.' }]);
F('Soul Seer', 'Mender', 3, [
  { name: 'Gust', range: 4, stat: 'S', dmg: [2, 6], on: { knock: 1 }, t: '2d6+S at range 4, and the foe is pushed back 1 hex.' },
  { name: 'Cleansing Breeze', kind: 'aura', radius: 2, self: { heal: [1, 4], cleanse: true }, t: 'You and allies within 2 heal 1d4 and shake off holds, poison and penalties.' }]);
F('Soul Seer', 'Sound', 1, [
  { name: 'Shriek', range: 4, stat: 'E', dmg: [1, 6], on: { last: 1 }, t: '1d6+E at range 4; the foe acts last next round.' },
  { name: 'Rumble', range: 2, stat: 'P', dmg: [1, 10], t: 'A low, heavy tone: 1d10+P at range 2.' }]);
F('Soul Seer', 'Sound', 3, [
  { name: 'Mind Spike', range: 4, stat: 'E', dmg: [1, 6], on: { hit: [-2, 2] }, t: '1d6+E at range 4; the foe is -2 to hit for 2 rounds.' },
  { name: 'Shatter Blast', kind: 'burst', radius: 1, stat: 'C', dmg: [2, 6], t: 'Every foe next to you takes 2d6+C.' }]);
F('Soul Seer', 'Nature', 1, [
  { name: 'Bramble Shield', kind: 'ally', range: 4, self: { thorns: 2 }, t: 'For 2 rounds, foes that hit an ally (or you) within 4 take 1d6.' },
  { name: 'Thorn Shot', range: 4, stat: 'S', dmg: [1, 6], on: { move: [-1, 2] }, t: '1d6+S at range 4; the foe is Move -1 for 2 rounds.' }]);
F('Soul Seer', 'Nature', 3, [
  { name: 'Root Grip', range: 4, stat: 'S', on: { root: 2, def: [-1, 2] }, t: 'Speed roll at range 4: the foe can’t move for 2 rounds and is -1 Defense.' },
  { name: 'Vine Lash', range: 4, stat: 'E', dmg: [1, 8], on: { pull: 1, root: 1 }, t: '1d8+E at range 4; pull the foe 1 hex closer, and it can’t move on its next turn.' }]);

F('Whisper', 'Wind', 1, [
  { name: 'Double Strike', range: 1, stat: 'S', dmg: [1, 4], hits: 2, t: 'Two quick hits of 1d4+S.' },
  { name: 'Speed Strike', range: 1, stat: 'S', dmg: [1, 6], self: { moveNow: 2 }, t: '1d6+S, and you get +2 Move for the rest of this turn.' }]);
F('Whisper', 'Wind', 3, [
  { name: 'Pressing Wind', range: 2, stat: 'P', dmg: [1, 10], on: { knock: 2 }, t: '1d10+P at range 2, and the foe is pushed back 2 hexes.' },
  { name: 'Tailwind', kind: 'aura', radius: 2, self: { moveUp: [2, 2] }, t: 'You and allies within 2 get +2 Move for 2 rounds.' }]);
F('Whisper', 'Shadow', 1, [
  { name: 'Shade', kind: 'self', self: { defUp: [3, 2] }, t: 'Wrap yourself in shadow: +3 Defense for 2 rounds.' },
  { name: 'Shadow Stab', range: 1, stat: 'E', dmg: [1, 8], allyBonus: 2, t: '1d8+E, and +2 to hit if one of your allies is next to the foe.' }]);
F('Whisper', 'Shadow', 3, [
  { name: 'Fade Strike', range: 1, stat: 'C', dmg: [2, 6], fadeAfter: 4, t: '2d6+C, then vanish and reappear up to 4 hexes away.' },
  { name: 'Ambush', blink: 3, stat: 'S', dmg: [1, 8], on: { exposed: 1 }, t: 'Step to a foe within 3, strike 1d8+S, and knock it down.' }]);
F('Whisper', 'Blade', 1, [
  { name: 'Weak Spot', range: 4, stat: 'C', dmg: [1, 4], on: { mark: 2, def: [-1, 2] }, t: 'Charm roll at range 4: 1d4+C, and the foe is Marked and -1 Defense for 2 rounds.' },
  { name: 'Throwing Knife', range: 4, stat: 'P', dmg: [1, 8], critMin: 19, t: '1d8+P at range 4; crits on 19 to 20.' }]);
F('Whisper', 'Blade', 3, [
  { name: 'Knife Fan', kind: 'burst', radius: 2, max: 3, stat: 'P', dmg: [1, 6], t: '1d6+P to up to 3 foes within 2.' },
  { name: 'Hidden Dagger', range: 1, stat: 'S', dmg: [2, 8], t: '2d8+S.' }]);
const famOf = (role, branch, tier) => FAMS.find(x => x.role === role && x.branch === branch && x.tier === tier);

// Combos: levels 1 and 3 (tab "Combos: all levels"). Each pairs two slots; either pick in a slot counts.
// The partner must be within 4 hexes of the leader. Combo dice add no stat; the hit roll uses the leader's main stat +2 for teamwork.
const COMBOS = [
  { name: 'Snare and Slam', pair: ['Trickster 3', 'Que Bao 1'], range: 4, dice: [[3, 8]], on: { stun: 1 }, t: 'The bola trips the foe into the slam: 3d8 at range 4, and the foe loses its next turn.' },
  { name: 'Hammerfall', pair: ['Bedrock 1', 'Honor 3'], range: 4, dice: [[3, 6]], on: { exposed: 1 }, t: 'Leap in and slam together: 3d6 to a foe within 4, and it is knocked down.' },
  { name: 'Skyfall', pair: ['Sharpsight 3', 'Honor 1'], range: 4, dice: [[3, 8]], on: { root: 1 }, t: 'The Maverick lifts the Champion and drops them on a foe within 4: 3d8, and it can’t move on its next turn.' },
  { name: 'Inescapable', pair: ['Que Bao 3', 'Wind 3'], range: 4, adjTo: 'Que Bao 3', dice: [[2, 8]], on: { held: [[[1, 6]], 2] }, t: 'The wind pins the hold: 2d8 to a foe next to the Brawler; it is held for 2 rounds and takes 1d6 at the start of its turns.' },
  { name: 'Eclipse', pair: ['Shadow 1', 'Sacred 3'], range: 4, dice: [[2, 8]], on: { def: [-2, 2] }, t: '2d8 at range 4, and the foe is -2 Defense for 2 rounds.' },
  { name: 'Rootbind', pair: ['Wayfinder 3', 'Nature 3'], range: 4, dice: [[2, 6]], on: { held: [[[1, 6]], 2] }, t: '2d6 at range 4; the foe is held for 2 rounds and takes 1d6 at the start of its turns.' },
  { name: 'Sanctuary', pair: ['Oath 1', 'Mender 3'], kind: 'party', heal: [[2, 6]], self: { defUp: [1, 1] }, t: 'Your whole party heals 2d6 plus the leader’s main stat and gets +1 Defense until their next turn.' },
  { name: 'Piercing Truth', pair: ['Sharpsight 1', 'Blade 1'], range: 8, sure: true, dice: [[2, 8]], on: { mark: 2 }, t: 'A shot that can’t miss: 2d8 at range 8, and the foe is Marked for 2 rounds.' },
  { name: 'Thorned Bulwark', pair: ['Bedrock 3', 'Nature 1'], kind: 'guard', holder: 'Bedrock 3', self: { defUp: [2, 2], thorns: 2, thornsN: 2 }, t: 'For 2 rounds the Brawler gets +2 Defense, and foes that hit the Brawler take 2d6.' },
  { name: 'Vanishing Slam', pair: ['Shadow 3', 'Fury 1'], range: 4, dice: [[2, 8]], critMin: 18, t: 'The Whisper slips the Brawler behind a foe within 4: 2d8 that crits on 18 to 20.' },
  { name: 'Storm Surge', pair: ['Fury 3', 'Wind 1'], range: 4, adjEither: true, hits: 4, dice: [[1, 6]], critMin: 18, t: 'Four quick hits of 1d6 on a foe next to either Hero; each one crits on 18 to 20.' },
  { name: 'Mind Games', pair: ['Trickster 1', 'Sound 3'], range: 4, dice: [[2, 6]], on: { hit: [-3, 2] }, t: '2d6 at range 4, and the foe is -3 to hit for 2 rounds.' },
  { name: 'Battle Hymn', pair: ['Sound 1', 'Oath 3'], kind: 'burst', radius: 1, dice: [[1, 8]], aura: { radius: 3, self: { hitUp: [2, 2] } }, t: 'Every foe next to the leader takes 1d8, and allies within 3 get +2 to hit for 2 rounds.' },
  { name: 'Lifelight', pair: ['Sacred 1', 'Mender 1'], kind: 'lifelight', range: 4, heal: [[3, 6]], payback: [[2, 6]], t: 'An ally within 4 heals 3d6, and the foe that last hit them takes 2d6.' },
  { name: 'Venom Fan', pair: ['Wayfinder 1', 'Blade 3'], kind: 'burst', radius: 3, max: 3, dice: [[1, 8]], on: { dot: [1, 3] }, t: 'Poisoned knives: up to 3 foes within 3 take 1d8 each and lose 1 Life a turn for 3 turns.' },
];

function actIcon(act, u) {
  const G1 = '#e8c260', D = '#1d140c', sw = `stroke="${D}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;
  const svg = b => `<svg viewBox="0 0 32 32" aria-hidden="true">${b}</svg>`;
  const SH = (fill, extra = '') => `<path d="M16 4 L26 8 V15 Q26 24 16 28 Q6 24 6 15 V8Z" fill="${fill}" ${sw}/>${extra}`;
  const HEART = (cx, cy, s, f) => `<path transform="translate(${cx} ${cy}) scale(${s})" d="M0 6 C-9 0 -7 -7 -3 -7 C-1 -7 0 -5 0 -4 C0 -5 1 -7 3 -7 C7 -7 9 0 0 6Z" fill="${f}" ${sw}/>`;
  if (act === 'move') return svg(`<path d="M9 6 h6 v12 q7 1 9 6 v2 H8 Z" fill="#8a5a32" ${sw}/><path d="M8 22 h16" stroke="#5a3a1e" stroke-width="1.6"/><path d="M10 10 h4 M10 14 h4" stroke="${G1}" stroke-width="1.4"/>`);
  if (act === 'defend') return svg(SH('#6a7a8a', `<path d="M16 8 V25 M10 14 h12" stroke="${G1}" stroke-width="2"/>`));
  if (act === 'end') return svg(`<path d="M9 5h14M9 27h14" stroke="${G1}" stroke-width="2.2" stroke-linecap="round"/><path d="M10 5 Q10 13 16 16 Q10 19 10 27 H22 Q22 19 16 16 Q22 13 22 5Z" fill="#e6d3a8" ${sw}/><path d="M12 26 Q16 21 20 26Z M13 9 h6 Q18 13 16 14 Q14 13 13 9Z" fill="#c99a3c"/>`);
  if (act.startsWith('combo')) return svg(`<circle cx="12" cy="16" r="7" fill="none" stroke="${G1}" stroke-width="3"/><circle cx="20" cy="16" r="7" fill="none" stroke="#6fc8e8" stroke-width="3"/><path d="M16 4 l1.4 3 3 .4 -2.2 2 .6 3 -2.8 -1.5 -2.8 1.5 .6 -3 -2.2 -2 3 -.4z" fill="#ffe2a0"/>`);
  if (act === 'attack') {
    const w = (u && u.weapon) || '';
    if (/Fist/.test(w)) return svg(`<path d="M8 13 q0 -4 4 -4 h9 q4 0 4 4 v6 q0 6 -6 7 h-6 q-5 -1 -5 -6Z" fill="#a26a42" ${sw}/><path d="M12 9 v6 M16 9 v6 M20 9 v6 M8 17 q5 1 8 -1" stroke="${D}" stroke-width="1.3" fill="none"/>`);
    if (/Stringbow/.test(w)) return svg(`<path d="M10 4 Q24 16 10 28" fill="none" stroke="#8a5a32" stroke-width="3"/><path d="M10 4 V28" stroke="#e6d3a8" stroke-width="1"/><path d="M6 16 H27" stroke="${G1}" stroke-width="2"/><path d="M27 16 l-5 -3 v6z" fill="#cfd6dc" ${sw}/><path d="M6 13 l3 3 -3 3" stroke="#b5462a" stroke-width="2" fill="none"/>`);
    if (/Staff/.test(w)) return svg(`<path d="M10 28 L20 10" stroke="#8a5a32" stroke-width="3" stroke-linecap="round"/><circle cx="21" cy="9" r="4" fill="#9fd8f0" ${sw}/><path d="M21 1 v4 M21 13 v4 M13 9 h4 M25 9 h4" stroke="#ffe2a0" stroke-width="1.6" stroke-linecap="round"/>`);
    if (/Dagger/.test(w)) return svg(`<path d="M7 25 L19 9 l4 -3 -2 5 L9 27Z" fill="#cfd6dc" ${sw}/><path d="M25 25 L13 9 l-4 -3 2 5 L23 27Z" fill="#b8c0c8" ${sw}/><path d="M6 22 l4 4 M26 22 l-4 4" stroke="${G1}" stroke-width="2.4" stroke-linecap="round"/>`);
    return svg(`<path d="M16 3 l3 4 v13 h-6 V7Z" fill="#cfd6dc" ${sw}/><path d="M9 20 h14" stroke="${G1}" stroke-width="3" stroke-linecap="round"/><path d="M16 21 v7" stroke="#8a5a32" stroke-width="3"/>`);
  }
  if (act.startsWith('ab') && u) {
    const a = u.abs[+act[2]] || {}, se = a.self || {};
    if (a.kind === 'fly') return svg(`<path d="M4 20 Q10 6 28 6 Q22 10 24 12 Q18 12 20 15 Q14 15 15 18 Q10 18 4 20Z" fill="#e6d3a8" ${sw}/><path d="M6 26 H26" stroke="${G1}" stroke-width="1.6" stroke-dasharray="3 3"/>`);
    if (a.kind === 'burst') return svg(`<path d="M16 3 l3 8 8 -3 -4 7 7 4 -8 2 2 8 -7 -5 -4 7 -1 -8 -8 1 5 -6 -6 -6 8 0z" fill="#e0584a" ${sw}/><circle cx="16" cy="16" r="4" fill="#ffe2a0"/>`);
    if (a.kind === 'attacks') return svg(`<path d="M6 26 L22 6 l4 -2 -2 4 L8 28Z" fill="#cfd6dc" ${sw}/><path d="M26 26 L10 6 l-4 -2 2 4 L24 28Z" fill="#b8c0c8" ${sw}/><path d="M5 23 l4 4 M27 23 l-4 4" stroke="${G1}" stroke-width="2.6" stroke-linecap="round"/>`);
    if (a.kind === 'party' || a.kind === 'lifelight') return svg(`<circle cx="16" cy="16" r="12" fill="#ffe2a033"/>${HEART(11, 15, 1, '#e0584a')}${HEART(21, 17, 1, '#e0584a')}`);
    if (a.kind === 'aura') return svg(`<circle cx="16" cy="16" r="12" fill="none" stroke="${G1}" stroke-width="1.6" stroke-dasharray="3 2.5"/>${se.heal ? HEART(16, 17, 1.1, '#6fc8a0') : se.moveUp ? `<path d="M8 20 Q16 8 26 12 M20 9 l6 3 -5 4" stroke="#9fd8f0" stroke-width="2.4" fill="none"/>` : se.hitUp ? `<path d="M16 24 V9 M10 14 l6 -6 6 6" stroke="#ffe2a0" stroke-width="3" fill="none"/>` : SH('#6a7a8a').replace('M16 4', 'M16 8').replace('V15 Q26 24 16 28 Q6 24 6 15', 'V16 Q24 22 16 25 Q8 22 8 16')}`);
    if (a.kind === 'ally') return svg(se.thorns ? `<path d="M16 28 V12 M16 18 q-6 -2 -8 -8 M16 15 q6 -2 8 -7" stroke="#4f6b3a" stroke-width="2.6" fill="none"/><path d="M10 12 l-3 -1 M22 10 l3 -2 M12 21 l-3 1 M20 21 l3 0" stroke="#8aa04a" stroke-width="2"/>` : `<path d="M5 24 q4 -6 11 -4 q7 -2 11 4" fill="#a26a42" ${sw}/>${HEART(16, 12, 1.2, '#6fc8a0')}`);
    if (a.kind === 'guard') return svg(SH('#5a6a3a', `<path d="M16 2 v4 M4 9 l3 1 M28 9 l-3 1 M6 20 l3 -1 M26 20 l-3 -1" stroke="#8aa04a" stroke-width="2"/>`));
    if (a.kind === 'self') return svg(se.heal ? SH('#3f6b45', HEART(16, 16, 1, '#6fc8a0')) : SH(a.name === 'Shade' ? '#2f3a4a' : '#6a7a8a', `<path d="M11 15 l4 4 7 -8" stroke="${G1}" stroke-width="2.4" fill="none"/>`));
    if (a.on && a.on.dot) return svg(`<path d="M16 4 Q24 15 24 20 a8 8 0 0 1 -16 0 Q8 15 16 4Z" fill="#7ab04a" ${sw}/><circle cx="13" cy="20" r="2" fill="#d6f0a0"/>`);
    return svg(`<circle cx="16" cy="16" r="11" fill="#2a1612" ${sw}/><circle cx="16" cy="16" r="7" fill="none" stroke="#e0584a" stroke-width="2"/><circle cx="16" cy="16" r="2.5" fill="#ffe2a0"/><path d="M16 2 v6 M16 24 v6 M2 16 h6 M24 16 h6" stroke="${G1}" stroke-width="1.6"/>`);
  }
  return svg(`<circle cx="16" cy="16" r="10" fill="#3a2e24" ${sw}/>`);
}
const SKIN={Leyf:"#7fa36a",Sapien:"#8a5e3c",Lizerus:"#8fae5a",Melkin:"#c9a0d8",Dimoneesh:"#8fa8d0"};
const ROLE_LOOK={Maverick:"#3f6b45",Brawler:"#8a4a2a",Champion:"#b08a2a","Soul Seer":"#5a4a8a",Whisper:"#2f3a4a"};
function shade(c,f){ const n=parseInt(c.slice(1),16); let r=n>>16,g=n>>8&255,b=n&255; r=Math.min(255,Math.round(r*f)); g=Math.min(255,Math.round(g*f)); b=Math.min(255,Math.round(b*f)); return "#"+((1<<24)|(r<<16)|(g<<8)|b).toString(16).slice(1); }
const OL="#1d140c";
function heroSVG(L){
  const lf=L.lf, role=L.role, sk=L.skin, skD=shade(sk,.72), skL=shade(sk,1.18);
  const cl=L.cloak, clD=shade(cl,.62), clL=shade(cl,1.3);
  const robe=role==="Soul Seer", hooded=role==="Whisper"||role==="Soul Seer", armored=role==="Champion", brawl=role==="Brawler";
  const tun=armored?"#b9bcc6":brawl?"#6a4a2c":role==="Maverick"?"#7a5634":shade(cl,.8), tunD=shade(tun,.7);
  const hoof=lf==="Dimoneesh";
  const sw=`stroke="${OL}" stroke-width="1.6" stroke-linejoin="round"`;
  const leg=(id,x,dark)=>`<g id="${id}"><path d="M${x-4} -36 L${x+4} -36 L${x+4} -8 L${x-4} -8Z" fill="${dark?shade("#4a3a28",.75):"#4a3a28"}" ${sw}/>${hoof?`<path d="M${x-5} -9 h10 l1 9 h-12z" fill="#2a2420" ${sw}/><path d="M${x} -6 v6" stroke="#5a5048" stroke-width="1"/>`:`<path d="M${x-5} -12 h9 q6 0 7 8 v4 h-16z" fill="${dark?"#3a2616":"#5a3a1e"}" ${sw}/><path d="M${x-4} -10 h8" stroke="#8a6a3a" stroke-width="1.4"/>`}</g>`;
  // head per Lifeform (faces right)
  let head;
  if(lf==="Leyf") head=`<path d="M-8 -84 Q-12 -104 4 -106 Q20 -106 22 -92 Q24 -84 16 -80 L-4 -78Z" fill="${sk}" ${sw}/>
    <path d="M10 -86 Q20 -86 22 -90" stroke="${skD}" stroke-width="1.6" fill="none"/>
    <path d="M-4 -102 q6 -3 12 0 M-6 -96 q6 -3 12 0" stroke="${skD}" stroke-width="1.2" fill="none" opacity=".7"/>
    <ellipse cx="11" cy="-95" rx="4.2" ry="4.6" fill="#fff" ${sw}/><circle cx="12.5" cy="-95" r="2.4" fill="#1b140c"/><circle cx="13.3" cy="-96" r=".8" fill="#fff"/>
    <path d="M5 -101 Q12 -104 16 -99" fill="none" stroke="${skL}" stroke-width="2" opacity=".7"/>`;
  else if(lf==="Lizerus") head=`<path d="M-8 -82 Q-10 -102 4 -104 Q14 -104 18 -96 L30 -92 Q32 -86 26 -84 L6 -80Z" fill="${sk}" ${sw}/>
    <path d="M10 -103 Q4 -116 -6 -118 L-4 -110 Q-12 -114 -18 -108 L-13 -103 Q-20 -102 -22 -94 L-14 -93 Q-12 -100 -4 -104 Q2 -106 10 -103Z" fill="${shade(sk,.78)}" ${sw}/>
    <path d="M6 -105 L-4 -116 M0 -106 L-15 -109 M-6 -103 L-20 -96" stroke="${shade(sk,.5)}" stroke-width="1.3"/>
    <path d="M14 -86 L28 -87" stroke="${OL}" stroke-width="1.2"/><circle cx="27" cy="-91" r=".9" fill="${OL}"/>
    <ellipse cx="10" cy="-96" rx="3.4" ry="3" fill="#f2d23a" ${sw}/><rect x="9.6" y="-98.4" width="1.2" height="4.8" fill="#1b140c"/>
    ${[0,1,2].map(k=>`<circle cx="${-2+k*5}" cy="${-90+k%2*3}" r="1.3" fill="${skD}"/>`).join("")}`;
  else if(lf==="Sapien"){
    const locks=(ox,oy,sc)=>{ let d=`M${ox+11*sc} ${oy-13*sc}`; const pts=[[16,-6],[14,4],[17,12],[10,10],[11,20],[4,14],[2,24],[-4,16],[-8,24],[-11,14],[-17,18],[-16,6],[-20,2],[-16,-6],[-18,-14],[-12,-14],[-12,-22],[-4,-18],[-2,-26],[4,-18],[10,-22],[10,-14]];
      pts.forEach(([x,y])=>{ const a=Math.atan2(y,x), bx=Math.cos(a)*15, by=Math.sin(a)*17; x=bx+(x-bx)*.45; y=by+(y-by)*.45; d+=` L${(ox+x*sc).toFixed(1)} ${(oy+y*sc).toFixed(1)}`; }); return d+"Z"; };
    head=`<path d="${locks(1,-92,1.05)}" fill="${skD}" ${sw}/><path d="${locks(1.5,-93,.9)}" fill="${sk}"/>
    <path d="M5 -96 Q15 -98 19 -90 Q20 -82 12 -81 Q4 -82 5 -96Z" fill="${skL}" ${sw}/>
    <path d="M5 -100 q7 -4 13 -1" stroke="${skD}" stroke-width="3" stroke-linecap="round" fill="none"/>
    <circle cx="12" cy="-95" r="2" fill="#1b140c"/><circle cx="12.6" cy="-95.6" r=".7" fill="#fff"/>
    <ellipse cx="18" cy="-89" rx="2.4" ry="1.8" fill="#2a1a10"/><path d="M11 -84 q4 2 7 0" stroke="${OL}" stroke-width="1.3" fill="none"/>
    ${[[-10,-98],[-6,-104],[0,-108],[-12,-88],[-6,-86],[-2,-100],[2,-78],[-4,-76]].map(([x,y])=>`<path d="M${x} ${y} q2 5 0 10" stroke="${skL}" stroke-width="1.3" fill="none" opacity=".75"/>`).join("")}`; }
  else if(lf==="Melkin") head=`<path d="M-10 -86 Q-12 -106 4 -108 Q20 -106 20 -90 Q18 -78 4 -78 Q-8 -78 -10 -86Z" fill="${sk}" ${sw}/>
    <path d="M-6 -100 L-20 -112 L-4 -94Z" fill="${sk}" ${sw}/><path d="M-8 -100 L-16 -108" stroke="${skD}" stroke-width="2"/>
    <ellipse cx="11" cy="-94" rx="4.6" ry="5.4" fill="#fff" ${sw}/><circle cx="12.4" cy="-93.4" r="3" fill="#3a2a5a"/><circle cx="13.4" cy="-95" r="1" fill="#fff"/>
    <path d="M12 -84 q3 1 5 -1" stroke="${OL}" stroke-width="1.2" fill="none"/><circle cx="6" cy="-86" r="2.4" fill="#e88aa8" opacity=".5"/>`;
  else head=`<path d="M-10 -82 Q-12 -104 4 -106 Q20 -104 20 -90 Q20 -78 6 -77 Q-6 -76 -10 -82Z" fill="${sk}" ${sw}/>
    <path d="M-4 -102 Q-14 -114 -4 -120 Q-8 -112 2 -104Z" fill="#e8e0d0" ${sw}/><path d="M6 -105 Q4 -118 14 -120 Q8 -112 12 -104Z" fill="#e8e0d0" ${sw}/>
    <ellipse cx="12" cy="-93" rx="3.6" ry="3.2" fill="#e8f4ff" ${sw}/><circle cx="13" cy="-93" r="1.8" fill="#4a6aa8"/>
    <path d="M12 -84 q4 1 6 -1" stroke="${OL}" stroke-width="1.2" fill="none"/><path d="M-2 -98 q4 4 2 10" stroke="${skL}" stroke-width="2" fill="none" opacity=".6"/>`;
  const hood="";
  const mask="";
  const tail="";
  // body
  const cape=`<path d="M-12 -76 Q-30 -56 -30 -22 Q-22 -16 -14 -22 Q-10 -18 -4 -24 L4 -74Z" fill="${cl}" ${sw}/>
    <path d="M-20 -60 Q-24 -40 -22 -22 M-12 -58 Q-14 -40 -12 -24" stroke="${clD}" stroke-width="2" fill="none" opacity=".8"/>
    <path d="M-10 -74 Q-22 -60 -26 -40" stroke="${clL}" stroke-width="2" fill="none" opacity=".6"/>`;
  const torso=robe?`<path d="M-12 -76 L14 -76 Q18 -40 20 -6 Q2 0 -16 -6 Q-16 -40 -12 -76Z" fill="${cl}" ${sw}/><path d="M2 -74 L4 -6" stroke="${clL}" stroke-width="2.5"/><path d="M-6 -60 Q-8 -30 -10 -8" stroke="${clD}" stroke-width="2" fill="none"/>`
    :`<path d="M-12 -76 L13 -76 Q16 -56 14 -32 L15 -26 Q0 -22 -14 -26 L-13 -32 Q-15 -56 -12 -76Z" fill="${tun}" ${sw}/>
    <path d="M6 -74 Q10 -54 9 -34" stroke="${shade(tun,1.3)}" stroke-width="3" fill="none" opacity=".6"/><path d="M-8 -72 Q-10 -52 -9 -34" stroke="${tunD}" stroke-width="3" fill="none" opacity=".6"/>
    ${armored?`<path d="M-11 -74 Q2 -66 13 -74 L12 -50 Q0 -44 -11 -50Z" fill="#d8dae2" ${sw}/><circle cx="1" cy="-60" r="4" fill="#e8b83a" ${sw}/>`:""}
    ${brawl?`<path d="M-14 -78 Q0 -70 16 -78 L14 -68 Q0 -62 -14 -68Z" fill="#8a6a3a" ${sw}/>${[-10,-4,2,8].map(x=>`<path d="M${x} -66 l2 6 l2 -6" fill="#8a6a3a" ${sw}/>`).join("")}`:""}
    <rect x="-14" y="-38" width="29" height="6" fill="#3a2414" ${sw}/><rect x="-1" y="-39" width="7" height="8" rx="1" fill="#d8b04a" ${sw}/>`;
  const furMantle=lf==="Sapien"?`<path d="M-15 -80 L-15 -70 L-12 -72 L-10 -67 L-6 -71 L-3 -66 L0 -71 L3 -67 L6 -72 L9 -68 L12 -73 L15 -70 L16 -80 Q0 -86 -15 -80Z" fill="${sk}" ${sw}/>`:"";
  const collar=lf==="Sapien"?furMantle:`<path d="M-13 -78 Q0 -70 15 -78 Q12 -84 0 -82 Q-10 -84 -13 -78Z" fill="${clD}" ${sw}/>`;
  const armBack=`<path d="M8 -72 Q14 -60 16 -48" stroke="${OL}" stroke-width="8.5" stroke-linecap="round" fill="none"/><path d="M8 -72 Q14 -60 16 -48" stroke="${shade(robe?cl:tun,.7)}" stroke-width="6" stroke-linecap="round" fill="none"/><circle cx="16.5" cy="-46" r="3.6" fill="${skD}" ${sw}/>`;
  const armFront=`<path d="M-2 -72 Q2 -56 12 -50" stroke="${OL}" stroke-width="9.5" stroke-linecap="round" fill="none"/><path d="M-2 -72 Q2 -56 12 -50" stroke="${robe?cl:brawl?sk:tun}" stroke-width="7" stroke-linecap="round" fill="none"/>${brawl?`<path d="M6 -54 l6 3" stroke="#e8e0cc" stroke-width="5"/>`:""}<circle cx="14" cy="-49" r="4.2" fill="${sk}" ${sw}/>${lf==="Sapien"?`<path d="M6 -56 l3 4 l1 -5 l3 5 l1 -4" stroke="${skD}" stroke-width="2" fill="none" stroke-linejoin="round"/>`:""}`;
  // role props, drawn in hand at (14,-49)
  let back="", front="";
  if(role==="Maverick"){ back=`<rect x="-16" y="-80" width="8" height="30" rx="2" fill="#6a4426" ${sw} transform="rotate(-18 -12 -65)"/>${[0,1,2].map(k=>`<path d="M${-16+k*3} -82 l-2 -9 M${-16+k*3} -91 l-2 3 m2 -3 l2 3" stroke="#e8e0cc" stroke-width="1.4" transform="rotate(-18 -12 -65)"/>`).join("")}`;
    front=`<path d="M22 -90 Q36 -50 22 -10" fill="none" stroke="${OL}" stroke-width="5" stroke-linecap="round"/><path d="M22 -90 Q36 -50 22 -10" fill="none" stroke="#9a6a34" stroke-width="3" stroke-linecap="round"/><line x1="22" y1="-90" x2="22" y2="-10" stroke="#efe6cc" stroke-width="1"/><path d="M28 -52 h6" stroke="#5a3a1e" stroke-width="4"/>`; }
  else if(role==="Champion"){ back=`<path d="M19 -50 L44 -86 L47 -84 L22 -47Z" fill="#e6e8f0" ${sw}/><path d="M21 -51 L45 -85" stroke="#fff" stroke-width="1"/><path d="M13 -52 L25 -42" stroke="#7a5a2a" stroke-width="4" stroke-linecap="round"/><circle cx="16" cy="-48" r="3" fill="${skD}" ${sw}/><circle cx="12" cy="-53" r="2.2" fill="#d8b04a" ${sw}/>`;
    front=`<path d="M8 -70 h22 v20 q-11 18 -22 0z" fill="#c9a03c" ${sw}/><circle cx="19" cy="-58" r="5.5" fill="#f2d86a" ${sw}/>${[0,45,90,135,180,225,270,315].map(a=>`<path d="M${(19+Math.cos(a*Math.PI/180)*6).toFixed(1)} ${(-58+Math.sin(a*Math.PI/180)*6).toFixed(1)} l${(Math.cos(a*Math.PI/180)*4).toFixed(1)} ${(Math.sin(a*Math.PI/180)*4).toFixed(1)}" stroke="#7a5a22" stroke-width="1.3"/>`).join("")}<path d="M10 -68 v14" stroke="#e8c868" stroke-width="1.5" opacity=".7"/>`; }
  else if(role==="Soul Seer"){ front=`<rect x="22" y="-82" width="4" height="82" rx="2" fill="#6b4a2a" ${sw}/><path d="M20 -82 q4 -6 8 0" fill="none" stroke="#6b4a2a" stroke-width="2.5"/><path d="M24 -94 l4.5 7 l-4.5 6 l-4.5 -6z" fill="#bfe4ff" ${sw}/><circle cx="24" cy="-87" r="9" fill="#bfe4ff" opacity=".25"/><circle cx="33" cy="-78" r="2.4" fill="#e8f6ff" opacity=".8"/><path d="M14 -49 L22 -50" stroke="${OL}" stroke-width="1"/>`; }
  else if(role==="Whisper"){ back=`<path d="M-14 -40 q-6 -6 0 -12 q6 -6 12 0" fill="none" stroke="#a88a5a" stroke-width="3"/>`;
    front=`<path d="M16 -52 L32 -66 L34 -63 L19 -49Z" fill="#d8dae4" ${sw}/><path d="M12 -52 l6 4" stroke="#3a2414" stroke-width="4"/><path d="M14 -42 L22 -26 L19 -25 L12 -40Z" fill="#c8cad4" ${sw}/>`; }
  else { front=`<circle cx="14" cy="-49" r="6" fill="${sk}" ${sw}/><path d="M9 -52 h10 M9 -48 h10" stroke="#e8e0cc" stroke-width="2"/>${[0,1,2].map(k=>`<path d="M${11+k*3} -55 l1 -4 l1 4" fill="#c8c8d0" ${sw}/>`).join("")}`; }
  return `<g id="heroInner"><g transform="scale(${L.size})">
   <ellipse cx="0" cy="0" rx="24" ry="6.5" fill="rgba(0,0,0,.35)"/>
   ${cape}${tail}${back}${armBack}
   <g id="legs">${leg("legR",4,true)}${leg("legL",-5,false)}</g>
   ${torso}${collar}${hood}${head}${mask}${armFront}${front}
  </g></g>`;
}
function cecilArt(x,y){ const sw=`stroke="${OL}" stroke-width="1.6" stroke-linejoin="round"`; return `<g transform="translate(${x} ${y}) scale(-1 1)"><ellipse cx="0" cy="0" rx="24" ry="6.5" fill="rgba(0,0,0,.3)"/>
  <path d="M26 -10 L34 -112" stroke="${OL}" stroke-width="5"/><path d="M26 -10 L34 -112" stroke="#8a6a3a" stroke-width="3"/><path d="M24 -112 h20 l-2 10 h-16z" fill="#8a8a92" ${sw}/>
  <path d="M-9 -36 h8 v28 h-8z M2 -36 h8 v28 h-8z" fill="#3e5a7a" ${sw}/><path d="M-11 -10 h10 q4 0 4 6 v4 h-14z M1 -10 h10 q4 0 4 6 v4 h-14z" fill="#4a2e18" ${sw}/>
  <path d="M-15 -78 Q-18 -56 -15 -34 L15 -34 Q18 -56 15 -78 Q0 -84 -15 -78Z" fill="#b84a3a" ${sw}/>
  <path d="M-15 -66 h30 M-15 -54 h30 M-6 -80 v46 M6 -80 v46" stroke="#7a2a20" stroke-width="1.6" opacity=".7"/>
  <path d="M-12 -62 h24 v26 h-24z" fill="#4f6f8f" ${sw}/><path d="M-10 -62 L-12 -80 M10 -62 L12 -80" stroke="#4f6f8f" stroke-width="4"/><rect x="-5" y="-56" width="10" height="7" fill="#3e5a7a" ${sw}/><circle cx="-8" cy="-60" r="1.6" fill="#d8b04a"/><circle cx="8" cy="-60" r="1.6" fill="#d8b04a"/>
  <path d="M12 -74 Q22 -60 26 -50" stroke="${OL}" stroke-width="9" stroke-linecap="round" fill="none"/><path d="M12 -74 Q22 -60 26 -50" stroke="#b84a3a" stroke-width="6.5" stroke-linecap="round" fill="none"/><circle cx="27" cy="-48" r="4" fill="#8a5a3a" ${sw}/>
  <path d="M-12 -82 Q-14 -104 2 -106 Q16 -104 15 -88 Q14 -78 2 -78 Q-10 -78 -12 -82Z" fill="#8a5a3a" ${sw}/>
  <path d="M-8 -86 Q2 -66 14 -86 Q10 -80 2 -80 Q-4 -80 -8 -86Z" fill="#eeeae2" ${sw}/><path d="M-4 -88 q6 -3 12 0" stroke="#eeeae2" stroke-width="3" stroke-linecap="round"/>
  <circle cx="-3" cy="-94" r="1.6" fill="#1b140c"/><circle cx="8" cy="-94" r="1.6" fill="#1b140c"/><path d="M-6 -98 q3 -2 6 0 M5 -98 q3 -2 6 0" stroke="#eeeae2" stroke-width="1.6" fill="none"/><circle cx="2" cy="-90" r="2.6" fill="#6e4228"/>
  <ellipse cx="2" cy="-102" rx="26" ry="6" fill="#d8b65a" ${sw}/><path d="M-11 -102 Q-10 -120 2 -120 Q14 -120 15 -102Z" fill="#e2c46a" ${sw}/><path d="M-11 -106 h26" stroke="#8a3a2a" stroke-width="3"/>
  <path d="M-20 -101 l4 2 M-10 -98 l2 3 M14 -98 l-1 3 M24 -101 l-4 2" stroke="#a8863a" stroke-width="1.2"/></g>`; }
function gremlinArt(x,y){ const sw=`stroke="#1e2a0c" stroke-width="1.5" stroke-linejoin="round"`; return `<g transform="translate(${x} ${y})"><ellipse cx="0" cy="0" rx="13" ry="3.5" fill="rgba(0,0,0,.3)"/>
  <path d="M-6 -2 l-3 2 M-4 -2 l0 2 M5 -2 l3 2 M3 -2 l0 2" stroke="#1e2a0c" stroke-width="1.4"/>
  <path d="M-10 -1 Q-13 -16 -6 -22 Q0 -26 6 -22 Q13 -16 10 -1Z" fill="#5f8a2e" ${sw}/><path d="M-4 -4 Q-6 -14 0 -18" stroke="#8fbf4e" stroke-width="2" fill="none"/>
  <circle cx="-5" cy="-10" r="1.6" fill="#a8c84a"/><circle cx="5" cy="-6" r="1.3" fill="#a8c84a"/><circle cx="2" cy="-14" r="1.1" fill="#7a4a8a"/>
  <path d="M-7 -20 L-20 -30 L-9 -16Z M7 -20 L20 -30 L9 -16Z" fill="#6f9a3a" ${sw}/><path d="M-8 -20 L-16 -26 M8 -20 L16 -26" stroke="#c87a8a" stroke-width="1.5"/>
  <ellipse cx="-3.5" cy="-17" rx="2.6" ry="3" fill="#ffe24a" ${sw}/><ellipse cx="3.5" cy="-17" rx="2.6" ry="3" fill="#ffe24a" ${sw}/><circle cx="-3" cy="-16.5" r="1" fill="#1e2a0c"/><circle cx="4" cy="-16.5" r="1" fill="#1e2a0c"/>
  <path d="M-4 -11 Q0 -8 4 -11" fill="#3a1a14" ${sw}/><path d="M-2 -10.5 l1 2 l1 -2 M1 -10.5 l1 2 l1 -2" fill="#fff"/>
  <path d="M-10 -10 l-6 4 l2 -1 l-1 3 M10 -10 l6 4 l-2 -1 l1 3" stroke="#5f8a2e" stroke-width="3" fill="none" stroke-linecap="round"/></g>`; }
const ROLE_FRAME={Maverick:"#3f6b45",Brawler:"#8a4a2a",Champion:"#a8821f","Soul Seer":"#5a4a8a",Whisper:"#3d4b5c"};
function cornerSVG(role){
  const c="#e8c260";
  const g={Maverick:`<path d="M8 38 Q10 10 38 8 Q30 22 20 26 Q26 30 8 38Z" fill="${c}"/>`,
    Brawler:`<rect x="6" y="6" width="16" height="16" rx="3" fill="${c}"/><circle cx="30" cy="10" r="5" fill="${c}"/><circle cx="10" cy="30" r="5" fill="${c}"/>`,
    Champion:`<circle cx="18" cy="18" r="9" fill="${c}"/>${[0,45,90,135,180,225,270,315].map(a=>`<rect x="17" y="2" width="2" height="7" fill="${c}" transform="rotate(${a} 18 18)"/>`).join("")}`,
    "Soul Seer":`<polygon points="18,2 22,14 34,18 22,22 18,34 14,22 2,18 14,14" fill="${c}"/>`,
    Whisper:`<path d="M30 6 A16 16 0 1 0 30 34 A12 12 0 1 1 30 6Z" fill="${c}"/>`};
  return `<svg viewBox="0 0 40 40">${g[role]||g.Maverick}</svg>`;
}

// ============================================================ Crit Dice on the field (look follows the duel and Starvos dice)
const DICE_LOOK = { A: { body: '#f0c04f', num: '#0c0f1f', finish: 'plain' }, B: { body: '#7f9e3a', num: '#16200a', finish: 'plain' } };
let dieN = 0;
function dieSVG(s, v, look) {
  const id = 'dg' + (++dieN), b = look.body, n = look.num, ed = shade(b, .55);
  const grad = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(b, 1.25)}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${shade(b, .7)}"/></linearGradient></defs>`;
  const fin = look.finish === 'marbled' ? `<path d="M10 30 Q40 20 55 45 T92 60" stroke="#fff" stroke-width="5" fill="none" opacity=".35"/><path d="M12 70 Q38 58 60 74" stroke="#000" stroke-width="4" fill="none" opacity=".15"/>`
    : look.finish === 'starlit' ? [[30, 30], [70, 58], [45, 80], [74, 30], [24, 62]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="#fff" opacity=".9"/>`).join('') : '';
  const num = (y, fs) => `<text x="50" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="Alegreya SC,Georgia,serif" font-weight="700" font-size="${fs}" fill="${n}" stroke="rgba(0,0,0,.25)" stroke-width=".6" paint-order="stroke">${v}</text>`;
  if (s === 20) { const HEX = '50,3 91,26.5 91,73.5 50,97 9,73.5 9,26.5';
    return `<svg viewBox="0 0 100 100">${grad}<polygon points="${HEX}" fill="url(#${id})"/>
      <polygon points="50,3 91,26.5 50,22 9,26.5" fill="#fff" opacity=".18"/><polygon points="9,26.5 23,67 9,73.5" fill="#000" opacity=".2"/><polygon points="91,26.5 77,67 91,73.5" fill="#000" opacity=".28"/>
      <polygon points="9,73.5 23,67 50,97" fill="#000" opacity=".26"/><polygon points="91,73.5 77,67 50,97" fill="#000" opacity=".36"/><polygon points="50,22 77,67 23,67" fill="#fff" opacity=".1"/>${fin}
      <g fill="none" stroke="${ed}" stroke-width="1.4" stroke-linejoin="round" opacity=".85"><polygon points="${HEX}"/><polygon points="50,22 77,67 23,67"/><path d="M50 22 9 26.5M50 22 91 26.5M50 22 50 3M23 67 9 26.5M23 67 9 73.5M23 67 50 97M77 67 91 26.5M77 67 91 73.5M77 67 50 97"/></g>
      ${num(v > 9 ? 55 : 56, v > 9 ? 22 : 25)}</svg>`; }
  if (s === 6) { const P = { 1: [[50, 50]], 2: [[30, 30], [70, 70]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[30, 30], [70, 30], [30, 70], [70, 70]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[30, 26], [70, 26], [30, 50], [70, 50], [30, 74], [70, 74]] };
    return `<svg viewBox="0 0 100 100">${grad}<rect x="6" y="6" width="88" height="88" rx="18" fill="url(#${id})" stroke="${ed}" stroke-width="2"/>${fin}<rect x="14" y="14" width="72" height="72" rx="12" fill="#fff" opacity=".08"/>${P[v].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="${n}"/>`).join('')}</svg>`; }
  const shape = s === 4 ? '50,6 94,88 6,88' : s === 8 ? '50,4 94,50 50,96 6,50' : s === 10 ? '50,4 92,42 50,96 8,42' : '50,4 93,35 77,90 23,90 7,35';
  return `<svg viewBox="0 0 100 100">${grad}<polygon points="${shape}" fill="url(#${id})" stroke="${ed}" stroke-width="2" stroke-linejoin="round"/>${fin}
    <polygon points="${shape}" fill="none" stroke="#fff" stroke-width="1" opacity=".25" transform="translate(50 50) scale(.8) translate(-50 -50)"/>${num(s === 4 ? 66 : 52, 26)}</svg>`;
}
