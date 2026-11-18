// Crit Climb tournaments (N8 2026-11-10): single-elimination brackets of 4, 8 or 16 players, run like an
// online Starvos lobby. Shared by icyn-api (lobbies, brackets) and icyn-ws (playing the matches).
// Keep backend/api/climb.mjs and backend/ws/climb.mjs identical.
//
// A Crit Pass holder hosts a Climb (4, 8 or 16 seats, public or private) and gets a 5 letter code. Others join
// with the code, or from the public list if the host made it public. The host presses Begin (2 or more players):
// the Computer takes every open seat and the bracket is drawn at random. Computer vs Computer matches are played
// by the arena at once; against a player, the referee answers the Computer's prompts (random ready ability).
// Every match is a Standard online duel (100 Life, Calamities on). Carryover (N8 2026-11-17): a player picks a Hero for
// their first match; whoever wins keeps that Hero and carries its Life, stats, Weapon dice and Ability dice into the next
// match (entrant.hero, entrant.carry); cooldowns reset and the weapon starts whole. A bye, walkover or no-show carries as is.
// Once both rivals of a match are known they have 10 minutes to meet in the arena: if one waits and the other
// never comes, the one who waited climbs on; if neither comes, the higher seed does (the Computer always comes). A lobby that never begins
// closes after a day. Rewards: the winner earns the gold "Crit Climb Conqueror" ring around their profile
// picture, every other player the silver "Crit Climb Competitor" ring (gold outranks silver for good).
// Climb names are checked by isProfane(). The free solo Climb (you + 3 Computers) runs in the browser only.
//
// Item in table icyn-climbs (key id = the join code; ttl removes it 30 days later):
//   {id, name, size, public, host: userId, status: open|live|done|cancelled, createdAt, version, ttl,
//    entrants: [{u: userId, n: name, av: avatar, ring, at, hero?, carry?}] (entrant 0 is the host), seeds: [seed per entrant] (once live),
//    rounds: [[{a, b, w, how, due, state, gameId, code, host}]] (a/b = entrant index; w = 0 for a, 1 for b),
//    champion, runnerUp, endedAt, awarded}
import crypto from 'node:crypto';
import { replay, HEROES, carryOf } from './engine.mjs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

export const cdb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
export const CLIMBS = process.env.CLIMBS_TABLE || 'icyn-climbs';
const PLAYERS_T = process.env.PLAYERS_TABLE || 'icyn-players';
export const SIZES = [4, 8, 16];
export const MIN_PLAYERS = 2; // real players; the Computer fills every other seat
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const MATCH_MS = 10 * MIN;
const LOBBY_MS = DAY;

// ---------- pure bracket logic (no database; tested in tools/climb/test-climb.mjs) ----------

// Bracket positions so seed 1 meets seed n, and the top two seeds can only meet in the final.
export function seedOrder(n) {
  let o = [1];
  while (o.length < n) { const m = o.length * 2 + 1; o = o.flatMap((s) => [s, m - s]); }
  return o;
}
const winnerOf = (m) => (m.w === 0 ? m.a : m.w === 1 ? m.b : null);
const loserOf = (m) => (m.w === 0 ? m.b : m.w === 1 ? m.a : null);

// Draw the bracket from the entrants (random seeds) and start the Climb.
export const HERO_IDS = Object.keys(HEROES);
export function begin(t, now, rand = Math.random) {
  if (t.entrants.length < 2) { t.status = 'cancelled'; t.note = 'Not enough Heroes joined'; t.endedAt = now; return; }
  // N8 2026-11-10: the Computer takes every open seat, so a Climb always fills its bracket
  // N8 2026-11-18: each Computer gets its Hero at Begin and is shown as that Hero with (COMP) after it.
  // Heroes are dealt from a shuffled deck so a bracket spreads them out before any repeats.
  const deck = [];
  for (let c = 1; t.entrants.length < t.size; c++) {
    if (!deck.length) { deck.push(...HERO_IDS); for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; } }
    const hero = deck.pop();
    t.entrants.push({ u: `cpu:${c}`, n: `${HEROES[hero].name} (COMP)`, cpu: true, hero, av: '', ring: '', at: now });
  }
  const n = t.entrants.length;
  let size = 2;
  while (size < n) size *= 2;
  const order = t.entrants.map((e, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  t.seeds = t.entrants.map(() => 0);
  order.forEach((e, k) => { t.seeds[e] = k + 1; });
  const slots = seedOrder(size).map((s) => (s <= n ? order[s - 1] : null));
  t.rounds = [];
  for (let c = size / 2; c >= 1; c /= 2) t.rounds.push(Array.from({ length: c }, () => ({ a: null, b: null, w: null })));
  t.rounds[0].forEach((m, i) => {
    m.a = slots[2 * i]; m.b = slots[2 * i + 1];
    if (m.b === null) { m.w = 0; m.how = 'bye'; } else if (m.a === null) { m.w = 1; m.how = 'bye'; }
  });
  t.bracketSize = size;
  t.status = 'live';
  t.startedAt = now;
  settle(t, now);
}

// Move winners forward, set deadlines, resolve missed deadlines and crown the champion.
// Returns true when anything changed.
export function settle(t, now) {
  if (t.status !== 'live') return false;
  let changed = false;
  t.rounds.forEach((round, r) => round.forEach((m, i) => {
    if (m.w === null && m.a !== null && m.b !== null) {
      const ca = !!t.entrants[m.a].cpu, cb = !!t.entrants[m.b].cpu;
      if (ca && cb) { // two Computers: the arena plays their duel at once
        const A = t.entrants[m.a], Bn = t.entrants[m.b], heroes = [A.hero || pickHero(), Bn.hero || pickHero()];
        const res = cpuDuel(heroes, [A.carry || null, Bn.carry || null]);
        m.w = res.winner; m.how = 'cpu'; m.heroes = heroes; m.state = 'done'; changed = true;
        keepHero(t.entrants[winnerOf(m)], heroes[m.w], res.carry && res.carry[m.w]);
      } else if (!m.due) { m.due = now + MATCH_MS; changed = true; }
      if (m.w === null && now > m.due && m.state !== 'active') {
        if (m.state === 'waiting' && (m.host === 0 || m.host === 1)) { m.w = m.host; m.how = 'walkover'; }
        else if (ca || cb) { m.w = ca ? 0 : 1; m.how = 'noshow'; } // the Computer always shows up
        else { m.w = t.seeds[m.a] <= t.seeds[m.b] ? 0 : 1; m.how = 'noshow'; }
        m.state = 'done';
        changed = true;
      }
    }
    if (m.w !== null && r + 1 < t.rounds.length) {
      const next = t.rounds[r + 1][i >> 1], side = i & 1 ? 'b' : 'a';
      if (next[side] !== winnerOf(m)) { next[side] = winnerOf(m); changed = true; }
    }
  }));
  const fin = t.rounds[t.rounds.length - 1][0];
  if (fin.w !== null) {
    t.status = 'done'; t.champion = winnerOf(fin); t.runnerUp = loserOf(fin); t.endedAt = now;
    changed = true;
  }
  return changed;
}

// Lobbies that never begin close after a day; live Climbs settle deadlines. True when the item changed.
export function refresh(t, now) {
  if (t.status === 'open' && now - t.createdAt > LOBBY_MS) { t.status = 'cancelled'; t.note = 'The lobby closed after a day without a start'; t.endedAt = now; return true; }
  return settle(t, now);
}

// The match a player must play now: {r, i, side} or null.
export function currentMatch(t, e) {
  if (t.status !== 'live' || e < 0) return null;
  for (let r = 0; r < t.rounds.length; r++) {
    const i = t.rounds[r].findIndex((m) => m.w === null && (m.a === e || m.b === e));
    if (i >= 0) return { r, i, side: t.rounds[r][i].a === e ? 0 : 1, ready: t.rounds[r][i].a !== null && t.rounds[r][i].b !== null };
  }
  return null;
}

// The winner of a played duel keeps its Hero and carries its state into the next match.
function keepHero(e, hero, carry) {
  if (!e || !HEROES[hero]) return;
  e.hero = hero;
  if (carry) e.carry = carry;
}

// Record a played duel. winnerUser is the winner's userId; hero/carry are the winner's Hero and its state at the end.
export function applyResult(t, r, i, gameId, winnerUser, forfeit, now, hero, carry) {
  const m = t.rounds?.[r]?.[i];
  if (!m || m.w !== null || m.gameId !== gameId) return false;
  const side = t.entrants[m.a]?.u === winnerUser ? 0 : t.entrants[m.b]?.u === winnerUser ? 1 : null;
  if (side === null) return false;
  m.w = side; m.how = forfeit ? 'forfeit' : 'duel'; m.state = 'done';
  keepHero(t.entrants[side ? m.b : m.a], hero, carry);
  settle(t, now);
  return true;
}

// Who earns which badge once a Climb is done.
export function badgesFor(t) {
  if (t.status !== 'done') return [];
  return t.entrants.map((e, k) => ({ u: e.u, cpu: !!e.cpu, k: k === t.champion ? 'conqueror' : 'competitor' }))
    .filter((b) => !b.cpu).map(({ u, k }) => ({ u, k }));
}

// The Computer: a random Hero for each match; ability picks are random among those ready.
export const pickHero = () => HERO_IDS[crypto.randomInt(HERO_IDS.length)];
export function cpuInput(pending, p) {
  return { kind: pending.kind, p, ...(pending.kind === 'ability' ? { choice: pending.options[crypto.randomInt(pending.options.length)] } : {}) };
}
// A whole Standard duel between two Computers.
export function cpuDuel(heroes, carry) {
  const seed = crypto.randomBytes(16).toString('hex'), setup = { heroes, life: 100, wb1: true, carry: carry || [null, null] }, inputs = [];
  for (let n = 0; n < 3000; n++) {
    const r = replay(seed, setup, inputs);
    if (r.result) return r.result;
    inputs.push(cpuInput(r.pending, r.pending.p ?? 0));
  }
  return { winner: crypto.randomInt(2) };
}

// Names people choose (Climb names) must be friendly. Letters are normalised so l33t spellings are caught.
// Long words match anywhere (so 'F u c k' and 'xXfuckXx' are caught); short ones only as whole words (so Scunthorpe, peacock and grape pass).
const BAD_ANY = ['fuck', 'shit', 'bitch', 'nigg', 'fagg', 'whore', 'pussy', 'wank', 'bastard', 'retard', 'tranny', 'dildo', 'jizz', 'asshole', 'motherf', 'porn'];
const BAD_WORD = ['ass', 'arse', 'dick', 'fag', 'cum', 'tit', 'tits', 'sex', 'piss', 'kys', 'stfu', 'cunt', 'cock', 'twat', 'rape', 'nazi', 'kike', 'spic', 'chink', 'dyke', 'slut', 'penis', 'vagina', 'boob', 'boobs', 'nude', 'nudes'];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'l', '+': 't' };
export function isProfane(s) {
  const low = String(s || '').toLowerCase().replace(/[0-9@$!|+]/g, (c) => LEET[c] || c);
  const squashed = low.replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
  const words = low.split(/[^a-z]+/).filter(Boolean).map((w) => w.replace(/(.)\1+/g, '$1'));
  return BAD_ANY.some((b) => squashed.includes(b.replace(/(.)\1+/g, '$1'))) || words.some((w) => BAD_WORD.some((b) => w === b.replace(/(.)\1+/g, '$1') || w === b.replace(/(.)\1+/g, '$1') + 's'));
}

// Entrants are not shown publicly; a browser recognises itself by this key (same recipe in index.html).
export const entrantKey = (userId) => crypto.createHash('sha256').update(`icyn-climb:${userId}`).digest('hex').slice(0, 16);

// Profile ring earned in Crit Climbs: 'gold' (Conqueror) outranks 'silver' (Competitor).
export const ringOf = (p) => (p?.climbWins > 0 ? 'gold' : p?.climbPlays > 0 ? 'silver' : '');

// What everyone may see.
export function view(t) {
  return {
    id: t.id, code: t.id, name: t.name, size: t.size, public: !!t.public, bracketSize: t.bracketSize || null,
    status: t.status, note: t.note || null, createdAt: t.createdAt, endedAt: t.endedAt || null, matchMinutes: MATCH_MS / MIN,
    entrants: t.entrants.map((e, k) => ({ n: e.n, av: e.av || '', ring: e.ring || '', k: e.cpu ? `cpu${k}` : entrantKey(e.u), cpu: !!e.cpu, seed: t.seeds ? t.seeds[k] : null, hero: e.hero || null, carry: e.carry || null })),
    rounds: (t.rounds || []).map((round) => round.map((m) => ({
      a: m.a, b: m.b, w: m.w, how: m.how || null, due: m.due || null, state: m.state || null, host: m.host ?? null, heroes: m.heroes || null,
    }))),
    champion: t.champion ?? null, runnerUp: t.runnerUp ?? null,
  };
}

// ---------- database ----------

export async function loadClimb(id) {
  return (await cdb.send(new GetCommand({ TableName: CLIMBS, Key: { id: String(id || '').trim().toUpperCase() } }))).Item || null;
}
export async function saveClimb(t, prevVersion) {
  t.version = prevVersion + 1;
  await cdb.send(new PutCommand({
    TableName: CLIMBS, Item: t,
    ConditionExpression: prevVersion === 0 ? 'attribute_not_exists(id)' : 'version = :v',
    ...(prevVersion === 0 ? {} : { ExpressionAttributeValues: { ':v': prevVersion } }),
  }));
}

// Load, change and save a Climb, retrying when someone else saved first.
// fn(t) returns an error string to stop, or anything else to save. Returns {t, out} or {error}.
export async function withClimb(id, fn, now = Date.now()) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const t = await loadClimb(id);
    if (!t) return { error: 'No Crit Climb with that code' };
    const prev = t.version || 0;
    const refreshed = refresh(t, now);
    const out = await fn(t);
    const error = typeof out === 'string' ? out : null;
    if (error && !refreshed) return { error };
    const award = t.status === 'done' && !t.awarded;
    if (award) t.awarded = true;
    try { await saveClimb(t, prev); }
    catch (e) { if (e.name === 'ConditionalCheckFailedException') continue; throw e; }
    if (award) await awardRings(t);
    return error ? { error } : { t, out };
  }
  return { error: 'The arena is busy. Please try again.' };
}

export async function awardRings(t) {
  const at = new Date(t.endedAt || Date.now()).toISOString();
  await Promise.all(badgesFor(t).map(({ u, k }) => cdb.send(new UpdateCommand({
    TableName: PLAYERS_T, Key: { userId: u }, ConditionExpression: 'attribute_exists(userId)',
    // version moves too, so a stats save that loaded the player before this can't wipe the ring
    UpdateExpression: 'SET badges = list_append(if_not_exists(badges, :e), :b), version = if_not_exists(version, :z) + :one, climbPlays = if_not_exists(climbPlays, :z) + :one'
      + (k === 'conqueror' ? ', climbWins = if_not_exists(climbWins, :z) + :one' : ''),
    ExpressionAttributeValues: { ':e': [], ':b': [{ k, id: t.id, name: t.name, size: t.bracketSize || t.size, players: t.entrants.length, at }], ':z': 0, ':one': 1 },
  })).catch((e) => console.error('ring', u, e))));
}

// icyn-ws: a duel has started or ended. patch is applied to match (r, i) if it still belongs to gameId.
export async function markMatch(id, r, i, gameId, patch) {
  return withClimb(id, (t) => {
    const m = t.rounds?.[r]?.[i];
    if (!m || m.gameId !== gameId || m.w !== null) return 'gone';
    Object.assign(m, patch);
  });
}
export async function climbResult(game, result) {
  const c = game.setup.climb, w = result.winner;
  // a forfeit ends the duel early: the winner carries its state as it stood
  let carry = result.carry && result.carry[w];
  if (!carry) {
    const snap = replay(game.seed, game.setup, game.inputs || []).events.reduce((x, e) => e.F || x, null);
    if (snap && snap[w]) carry = carryOf({ ...snap[w], abilities: snap[w].abilities });
  }
  return withClimb(c.id, (t) => (applyResult(t, c.r, c.i, game.gameId, game.players[w], !!result.forfeit, Date.now(), game.setup.heroes[w], carry) ? null : 'gone'));
}

// ---------- icyn-api routes ----------

const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const avatarOf = (p) => (typeof p?.prefs?.avatar === 'string' && /^(h|i):[a-z0-9-]{1,20}$/.test(p.prefs.avatar) ? p.prefs.avatar : '');
const newCode = () => Array.from(crypto.randomBytes(5), (b) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('');
const done = (r) => (r.error ? json(/^No Crit Climb/.test(r.error) ? 404 : 400, { error: r.error }) : json(200, view(r.t)));
const NEED_PASS = 'Crit Climb needs the Crit Pass. Get it on the setup screen.';
const entrantOf = (userId, claims, player) => ({ u: userId, n: [clean(player?.name, 24), clean(claims.nickname, 24)].find((x) => x && !isProfane(x)) || 'Hero', av: avatarOf(player), ring: ringOf(player), at: Date.now() });

// GET /climbs (public): open public lobbies that still have seats, newest first.
export async function listClimbs() {
  const items = [];
  let key;
  do {
    const r = await cdb.send(new ScanCommand({ TableName: CLIMBS, ExclusiveStartKey: key }));
    items.push(...(r.Items || []));
    key = r.LastEvaluatedKey;
  } while (key && items.length < 2000);
  const now = Date.now();
  const open = items.filter((t) => t.public && t.status === 'open' && now - t.createdAt <= LOBBY_MS && t.entrants.length < t.size);
  open.sort((x, y) => y.createdAt - x.createdAt);
  return json(200, open.slice(0, 30).map(view));
}

// GET /climbs/{code} (public)
export async function getClimb(id) {
  const t = await loadClimb(id);
  if (!t) return json(404, { error: 'No Crit Climb with that code' });
  if (refresh(structuredClone(t), Date.now())) return done(await withClimb(id, () => null));
  return json(200, view(t));
}

// POST /climbs (Crit Pass): {size: 4|8|16, public: bool, name?} -> the new lobby; you are its host.
export async function createClimb(userId, claims, player, body, unlocked) {
  if (!unlocked) return json(403, { error: NEED_PASS });
  const size = Number(body.size);
  if (!SIZES.includes(size)) return json(400, { error: 'Size must be 4, 8 or 16 players' });
  const me = entrantOf(userId, claims, player);
  if (isProfane(body.name)) return json(400, { error: 'Please pick a friendlier name for your Climb' });
  const name = clean(body.name, 40) || `${me.n}'s Crit Climb`;
  const now = Date.now();
  for (let attempt = 0; attempt < 5; attempt++) {
    const t = { id: newCode(), name, size, public: body.public === true, host: userId, status: 'open', entrants: [me],
      createdAt: now, version: 0, ttl: Math.floor(now / 1000) + 30 * 86400 };
    try { await saveClimb(t, 0); return json(200, view(t)); }
    catch (e) { if (e.name !== 'ConditionalCheckFailedException') throw e; }
  }
  return json(500, { error: 'Please try again' });
}

// POST /climbs/{code}/join (Crit Pass)
export async function joinClimb(userId, claims, player, id, unlocked) {
  if (!unlocked) return json(403, { error: NEED_PASS });
  return done(await withClimb(id, (t) => {
    if (t.entrants.some((e) => e.u === userId)) return null;
    if (t.status !== 'open') return t.status === 'live' ? 'This Crit Climb has already begun' : 'This Crit Climb is closed';
    if (t.entrants.length >= t.size) return 'This Crit Climb is full';
    t.entrants.push(entrantOf(userId, claims, player));
  }));
}

// POST /climbs/{code}/leave (before it begins). The host leaving closes the lobby.
export async function leaveClimb(userId, id) {
  return done(await withClimb(id, (t) => {
    if (t.status !== 'open') return 'The bracket is already drawn';
    if (t.host === userId) { t.status = 'cancelled'; t.note = 'The host closed the lobby'; t.endedAt = Date.now(); return null; }
    t.entrants = t.entrants.filter((e) => e.u !== userId);
  }));
}

// POST /climbs/{code}/start (host): draw the bracket and begin.
export async function startClimb(userId, id) {
  return done(await withClimb(id, (t) => {
    if (t.host !== userId) return 'Only the host can begin the Climb';
    if (t.status !== 'open') return 'This Crit Climb is not waiting to begin';
    if (t.entrants.length < MIN_PLAYERS) return 'Wait for at least one rival to join. The Computer fills the other seats.';
    begin(t, Date.now());
  }));
}
