// Crit Climb tournaments (N8 2026-11-10): scheduled single-elimination brackets of 4, 8 or 16 players.
// Shared by icyn-api (sign-ups, owner tools, bracket views) and icyn-ws (playing the matches).
// Keep backend/api/climb.mjs and backend/ws/climb.mjs identical.
//
// Rules: the Crit Pass is needed to sign up; every match is a Standard online duel (100 Life,
// Calamities on) and each player picks any Hero for each match. The owner (developers group)
// schedules a Crit Climb; at its start time the bracket is drawn at random from whoever signed up
// (a bracket shrinks to the smallest of 2/4/8/16 that fits, and the top seeds get any byes).
// A match must be played within `matchHours` of both rivals being known. If the deadline passes,
// a player waiting in the arena wins by walkover; if neither showed, the higher seed advances.
// The owner can also decide a stuck match. Badges: champion, finalist, climber (everyone else).
//
// Item in table icyn-climbs (key id):
//   {id, name, size, matchHours, startsAt (ms), status: open|live|done|cancelled, createdAt, createdBy, version,
//    entrants: [{u: userId, n: name, av: avatar, at}], seeds: [seed number per entrant] (once live),
//    rounds: [[{a, b, w, how, due, state, gameId, code, host}]] (a/b = entrant index; w = 0 for a, 1 for b),
//    champion, runnerUp, endedAt, awarded}
import crypto from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

export const cdb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
export const CLIMBS = process.env.CLIMBS_TABLE || 'icyn-climbs';
const PLAYERS_T = process.env.PLAYERS_TABLE || 'icyn-players';
export const SIZES = [4, 8, 16];
export const MATCH_HOURS = [1, 2, 4, 12, 24, 48, 72];
const HOUR = 3600000;

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
export function begin(t, now, rand = Math.random) {
  const n = t.entrants.length;
  if (n < 2) { t.status = 'cancelled'; t.note = 'Not enough Heroes signed up'; t.endedAt = now; return; }
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
      if (!m.due) { m.due = now + (t.matchHours || 24) * HOUR; changed = true; }
      if (now > m.due && m.state !== 'active') {
        if (m.state === 'waiting' && (m.host === 0 || m.host === 1)) { m.w = m.host; m.how = 'walkover'; }
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

// Open Climbs start at their time; live ones settle deadlines. True when the item changed.
export function refresh(t, now, rand) {
  if (t.status === 'open' && now >= t.startsAt) { begin(t, now, rand); return true; }
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

// Record a played duel. winnerUser is the winner's userId.
export function applyResult(t, r, i, gameId, winnerUser, forfeit, now) {
  const m = t.rounds?.[r]?.[i];
  if (!m || m.w !== null || m.gameId !== gameId) return false;
  const side = t.entrants[m.a]?.u === winnerUser ? 0 : t.entrants[m.b]?.u === winnerUser ? 1 : null;
  if (side === null) return false;
  m.w = side; m.how = forfeit ? 'forfeit' : 'duel'; m.state = 'done';
  settle(t, now);
  return true;
}

// Who earns which badge once a Climb is done.
export function badgesFor(t) {
  if (t.status !== 'done') return [];
  return t.entrants.map((e, k) => ({
    u: e.u, k: k === t.champion ? 'champion' : k === t.runnerUp ? 'finalist' : 'climber',
  }));
}

// Entrant ids are not shown publicly; a browser recognises itself by this key (same recipe in index.html).
export const entrantKey = (userId) => crypto.createHash('sha256').update(`icyn-climb:${userId}`).digest('hex').slice(0, 16);

// What everyone may see.
export function view(t) {
  return {
    id: t.id, name: t.name, size: t.size, bracketSize: t.bracketSize || null, matchHours: t.matchHours,
    startsAt: t.startsAt, status: t.status, note: t.note || null, createdAt: t.createdAt, endedAt: t.endedAt || null,
    entrants: t.entrants.map((e, k) => ({ n: e.n, av: e.av || '', k: entrantKey(e.u), seed: t.seeds ? t.seeds[k] : null })),
    rounds: (t.rounds || []).map((round) => round.map((m) => ({
      a: m.a, b: m.b, w: m.w, how: m.how || null, due: m.due || null, state: m.state || null, host: m.host ?? null,
    }))),
    champion: t.champion ?? null, runnerUp: t.runnerUp ?? null,
  };
}

// ---------- database ----------

export async function loadClimb(id) {
  return (await cdb.send(new GetCommand({ TableName: CLIMBS, Key: { id: String(id || '') } }))).Item || null;
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
    if (!t) return { error: 'No such Crit Climb' };
    const prev = t.version || 0;
    const refreshed = refresh(t, now);
    let out = await fn(t);
    const error = typeof out === 'string' ? out : null;
    if (error && !refreshed) return { error };
    const award = t.status === 'done' && !t.awarded;
    if (award) t.awarded = true;
    try { await saveClimb(t, prev); }
    catch (e) { if (e.name === 'ConditionalCheckFailedException') continue; throw e; }
    if (award) await awardBadges(t);
    return error ? { error } : { t, out };
  }
  return { error: 'The arena is busy. Please try again.' };
}

export async function awardBadges(t) {
  const at = new Date(t.endedAt || Date.now()).toISOString();
  await Promise.all(badgesFor(t).map(({ u, k }) => cdb.send(new UpdateCommand({
    TableName: PLAYERS_T, Key: { userId: u }, ConditionExpression: 'attribute_exists(userId)',
    // version moves too, so a stats save that loaded the player before this can't wipe the badge
    UpdateExpression: 'SET badges = list_append(if_not_exists(badges, :e), :b), version = if_not_exists(version, :z) + :one'
      + (k === 'champion' ? ', climbWins = if_not_exists(climbWins, :z) + :one' : ''),
    ExpressionAttributeValues: { ':e': [], ':b': [{ k, id: t.id, name: t.name, size: t.bracketSize || t.size, at }], ':z': 0, ':one': 1 },
  })).catch((e) => console.error('badge', u, e))));
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
  const c = game.setup.climb;
  return withClimb(c.id, (t) => (applyResult(t, c.r, c.i, game.gameId, game.players[result.winner], !!result.forfeit, Date.now()) ? null : 'gone'));
}

// ---------- icyn-api routes ----------

const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const avatarOf = (p) => (typeof p?.prefs?.avatar === 'string' && /^(h|i):[a-z0-9-]{1,20}$/.test(p.prefs.avatar) ? p.prefs.avatar : '');
const newId = () => Array.from(crypto.randomBytes(10), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
const done = (r) => (r.error ? json(r.error === 'No such Crit Climb' ? 404 : 400, { error: r.error }) : json(200, view(r.t)));

// GET /climbs (public): live, open and recent Climbs. Starts and settles any that are due.
export async function listClimbs() {
  const items = [];
  let key;
  do {
    const r = await cdb.send(new ScanCommand({ TableName: CLIMBS, ExclusiveStartKey: key }));
    items.push(...(r.Items || []));
    key = r.LastEvaluatedKey;
  } while (key && items.length < 500);
  const now = Date.now();
  const out = await Promise.all(items.map(async (t) => {
    const copy = structuredClone(t);
    if (!refresh(copy, now)) return t;
    const r = await withClimb(t.id, () => null, now).catch(() => ({}));
    return r.t || copy;
  }));
  const weekAgo = now - 7 * 24 * HOUR, monthsAgo = now - 90 * 24 * HOUR;
  const keep = out.filter((t) => t.status === 'open' || t.status === 'live'
    || (t.status === 'done' && (t.endedAt || 0) > monthsAgo) || (t.status === 'cancelled' && (t.endedAt || t.createdAt || 0) > weekAgo));
  const rank = { live: 0, open: 1, done: 2, cancelled: 3 };
  keep.sort((x, y) => rank[x.status] - rank[y.status] || (x.status === 'open' ? x.startsAt - y.startsAt : (y.endedAt || y.startsAt) - (x.endedAt || x.startsAt)));
  return json(200, keep.slice(0, 40).map(view));
}

// GET /climbs/{id} (public)
export async function getClimb(id) {
  const t = await loadClimb(id);
  if (!t) return json(404, { error: 'No such Crit Climb' });
  if (refresh(structuredClone(t), Date.now())) return done(await withClimb(id, () => null));
  return json(200, view(t));
}

// POST /climbs (owner): {name, size, startsAt (ms or ISO), matchHours}
export async function createClimb(userId, claims, body, isOwner) {
  if (!isOwner) return json(403, { error: 'Only the arena owner can schedule a Crit Climb' });
  const name = clean(body.name, 40);
  const size = Number(body.size), matchHours = Number(body.matchHours || 24);
  const startsAt = typeof body.startsAt === 'number' ? body.startsAt : Date.parse(body.startsAt);
  const now = Date.now();
  if (!name) return json(400, { error: 'Give the Crit Climb a name' });
  if (!SIZES.includes(size)) return json(400, { error: 'Size must be 4, 8 or 16 players' });
  if (!MATCH_HOURS.includes(matchHours)) return json(400, { error: `Hours per match must be one of ${MATCH_HOURS.join(', ')}` });
  if (!Number.isFinite(startsAt) || startsAt < now - 5 * 60000 || startsAt > now + 90 * 24 * HOUR) return json(400, { error: 'Pick a start time within the next 90 days' });
  const t = { id: newId(), name, size, matchHours, startsAt, status: 'open', entrants: [], createdAt: now, createdBy: userId, version: 0 };
  await saveClimb(t, 0);
  return json(200, view(t));
}

// POST /climbs/{id}/join (Crit Pass)
export async function joinClimb(userId, claims, player, id, unlocked) {
  if (!unlocked) return json(403, { error: 'Crit Climb needs the Crit Pass. Get it on the setup screen.' });
  return done(await withClimb(id, (t) => {
    if (t.status !== 'open') return t.status === 'live' ? 'This Crit Climb has already begun' : 'This Crit Climb is closed';
    if (t.entrants.some((e) => e.u === userId)) return null;
    if (t.entrants.length >= t.size) return 'This Crit Climb is full';
    t.entrants.push({ u: userId, n: clean(player?.name, 24) || clean(claims.nickname, 24) || 'Hero', av: avatarOf(player), at: Date.now() });
  }));
}

// POST /climbs/{id}/leave (before it begins)
export async function leaveClimb(userId, id) {
  return done(await withClimb(id, (t) => {
    if (t.status !== 'open') return 'The bracket is already drawn';
    t.entrants = t.entrants.filter((e) => e.u !== userId);
  }));
}

// POST /climbs/{id}/start | /cancel | /decide {r, i, w} (owner)
export async function ownerAction(isOwner, id, what, body) {
  if (!isOwner) return json(403, { error: 'Only the arena owner can do that' });
  return done(await withClimb(id, (t) => {
    if (what === 'start') {
      if (t.status !== 'open') return 'This Crit Climb is not waiting to start';
      begin(t, Date.now());
    } else if (what === 'cancel') {
      if (t.status !== 'open' && t.status !== 'live') return 'This Crit Climb is already over';
      t.status = 'cancelled'; t.note = 'Cancelled by the arena'; t.endedAt = Date.now();
    } else if (what === 'decide') {
      const m = t.rounds?.[body.r]?.[body.i];
      if (t.status !== 'live' || !m || m.w !== null || m.a === null || m.b === null || ![0, 1].includes(body.w)) return 'That match cannot be decided';
      m.w = body.w; m.how = 'judge'; m.state = 'done';
      settle(t, Date.now());
    } else return 'Unknown action';
  }));
}
