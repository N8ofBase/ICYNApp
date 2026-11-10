// I Crit You Not! player API: stats, streaks, leaderboards, match history, prefs, and the $5 Full Arena unlock (unlock.mjs).
// HTTP API (payload v2). Authorized routes carry Cognito ID-token claims.
// Stats logic lives in record.mjs, shared with the online-duel WebSocket Lambda.
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { db, PLAYERS, MATCHES, RecordError, cleanName, defaultName, stats, loadPlayer, recordMatch } from './record.mjs';
import { hasUnlock, isDeveloper, checkout, confirm, webhook, pnp, gifts, redeem, promo } from './unlock.mjs';
import { listClimbs, getClimb, createClimb, joinClimb, leaveClimb, startClimb, ringOf, isProfane } from './climb.mjs';
// Names other players see are kept friendly (N8 2026-11-10): new ones are refused, old ones are hidden.
import { openGames } from './lobby.mjs';
const shown = (n) => (isProfane(n) ? 'Hero' : n);

const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const bad = (msg) => json(400, { error: msg });

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try { return JSON.parse(raw); } catch { return null; }
}

async function leaderboard(event) {
  const by = (event.queryStringParameters || {}).by === 'streak' ? 'streak' : 'wins';
  const r = await db.send(new QueryCommand({
    TableName: PLAYERS, IndexName: by === 'streak' ? 'byStreak' : 'byWins',
    KeyConditionExpression: 'lb = :lb', ExpressionAttributeValues: { ':lb': 'ALL' },
    ScanIndexForward: false, Limit: 100,
  }));
  return json(200, (r.Items || []).map((p, i) => ({
    rank: i + 1, name: shown(p.name), avatar: typeof p.prefs?.avatar === 'string' && /^(h|i):[a-z0-9-]{1,20}$/.test(p.prefs.avatar) ? p.prefs.avatar : '', wins: p.wins, losses: p.losses, draws: p.draws,
    bestWinStreak: p.bestWinStreak, currentStreak: p.currentStreak,
    fastestWin: p.fastestWin ?? null, fastestLoss: p.fastestLoss ?? null, highestMaxLife: p.highestMaxLife || 0,
    ring: ringOf(p),
  })));
}

async function getMe(userId, claims) {
  const p = await loadPlayer(userId, claims);
  return json(200, { stats: stats(p), prefs: p.prefs || {}, unlocked: hasUnlock(p, claims), passVia: p.unlock?.via || null, owner: isDeveloper(claims), badges: p.badges || [], ring: ringOf(p) });
}

async function putMe(userId, claims, body) {
  const sets = ['#n = if_not_exists(#n, :dn)'], vals = { ':dn': defaultName(claims) }, names = { '#n': 'name' };
  if (body.name !== undefined) {
    const n = cleanName(body.name);
    if (!n) return bad('name must have visible characters');
    if (isProfane(n)) return bad('Please pick a friendlier name');
    sets[0] = '#n = :n'; vals[':n'] = n; delete vals[':dn'];
  }
  if (body.prefs !== undefined) {
    if (typeof body.prefs !== 'object' || body.prefs === null || Array.isArray(body.prefs)) return bad('prefs must be an object');
    if (Buffer.byteLength(JSON.stringify(body.prefs)) > 2000) return bad('prefs over 2000 bytes');
    sets.push('prefs = :p'); vals[':p'] = body.prefs;
  }
  // Seed counters so a profile created here is still a complete record.
  for (const k of ['wins', 'losses', 'draws', 'played', 'kos', 'currentStreak', 'bestWinStreak', 'worstLossStreak', 'version']) {
    sets.push(`${k} = if_not_exists(${k}, :zero)`);
  }
  sets.push('heroCounts = if_not_exists(heroCounts, :empty)');
  vals[':zero'] = 0; vals[':empty'] = {};
  const r = await db.send(new UpdateCommand({
    TableName: PLAYERS, Key: { userId }, UpdateExpression: 'SET ' + sets.join(', '),
    ExpressionAttributeNames: names, ExpressionAttributeValues: vals, ReturnValues: 'ALL_NEW',
  }));
  return json(200, { stats: stats(r.Attributes), prefs: r.Attributes.prefs || {}, unlocked: hasUnlock(r.Attributes, claims) });
}

const HERO_NAMES = ['Brawler', 'Champion', 'Maverick', 'Soul Seer', 'Whisper'];
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// Starvos Catastrophe: you command 1-5 Heroes (50 Life each) against Starvos (80 Life per Hero) for up to 8 rounds.
function validStarvos(b) {
  if (!['win', 'loss'].includes(b.result)) return 'result must be win or loss';
  if (!['win', 'fallen', 'annihilate'].includes(b.outcome) || (b.outcome === 'win') !== (b.result === 'win')) return 'outcome must match result';
  if (!int(b.rounds, 1, 8)) return 'rounds must be 1-8';
  if (b.outcome === 'annihilate' && b.rounds !== 8) return 'annihilate ends in round 8';
  if (!Array.isArray(b.heroes) || b.heroes.length < 1 || b.heroes.length > 5 || new Set(b.heroes).size !== b.heroes.length
    || !b.heroes.every((h) => HERO_NAMES.includes(h))) return 'heroes must be 1-5 different Heroes';
  if (b.bossLife !== b.heroes.length * 80) return 'bossLife must be 80 per Hero';
  if (!int(b.damage, 0, b.bossLife) || (b.result === 'win') !== (b.damage === b.bossLife)) return 'damage must fit the result';
  if (!int(b.survivors, 0, b.heroes.length) || (b.outcome === 'fallen') !== (b.survivors === 0)) return 'survivors must fit the result';
  if (b.heroDamage !== undefined) {
    const hd = b.heroDamage;
    if (typeof hd !== 'object' || hd === null || Array.isArray(hd)) return 'heroDamage must be an object';
    const ks = Object.keys(hd);
    if (!ks.every((h) => b.heroes.includes(h) && int(hd[h], 0, 999))) return 'heroDamage must map party Heroes to damage';
    if (ks.reduce((a, h) => a + hd[h], 0) < b.damage) return 'heroDamage must add up to damage';
  }
  return null;
}

// Browsers may only report cpu, pnp and starvos games; online results come from the WebSocket referee.
function validMatch(b) {
  if (b.mode === 'starvos') return validStarvos(b);
  if (!['win', 'loss', 'draw'].includes(b.result)) return 'result must be win, loss or draw';
  if (!['cpu', 'pnp'].includes(b.mode)) return 'mode must be cpu or pnp';
  if (!Number.isInteger(b.rounds) || b.rounds < 1 || b.rounds > 8) return 'rounds must be 1-8';
  if (typeof b.ko !== 'boolean') return 'ko must be boolean';
  if (![50, 100].includes(b.startingLife)) return 'startingLife must be 50 or 100';
  for (const k of ['hero', 'opponentHero']) {
    if (typeof b[k] !== 'string' || !b[k].trim() || b[k].length > 40) return `${k} must be a short string`;
  }
  return null;
}

async function postMatch(userId, claims, body) {
  const err = validMatch(body);
  if (err) return bad(err);
  try {
    return json(200, await recordMatch(userId, claims, body));
  } catch (e) {
    if (e instanceof RecordError) return json(e.statusCode, { error: e.message });
    throw e;
  }
}

async function getMatches(userId) {
  const r = await db.send(new QueryCommand({
    TableName: MATCHES, KeyConditionExpression: 'userId = :u', ExpressionAttributeValues: { ':u': userId },
    ScanIndexForward: false, Limit: 20,
  }));
  return json(200, (r.Items || []).map(({ userId: _, ...m }) => m));
}

export const handler = async (event) => {
  try {
    const route = event.routeKey;
    if (route === 'GET /leaderboard') return await leaderboard(event);
    if (route === 'POST /square/webhook') return await webhook(event);
    // Crit Climb tournaments (climb.mjs)
    const climbId = event.pathParameters?.id;
    if (route === 'GET /games/open') return await openGames(event);
    if (route === 'GET /climbs') return await listClimbs();
    if (route === 'GET /climbs/{id}') return await getClimb(climbId);

    const claims = event.requestContext?.authorizer?.jwt?.claims;
    if (!claims?.sub) return json(401, { error: 'sign in required' });
    const userId = claims.sub;

    if (route === 'GET /me') return await getMe(userId, claims);
    if (route === 'GET /matches') return await getMatches(userId);
    if (route === 'GET /pnp') return pnp(claims, await loadPlayer(userId, claims));
    if (route === 'GET /gifts') return await gifts(await loadPlayer(userId, claims));

    const body = parseBody(event);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return bad('body must be a JSON object');
    if (route === 'PUT /me') return await putMe(userId, claims, body);
    if (route === 'POST /matches') return await postMatch(userId, claims, body);
    if (route === 'POST /checkout') return await checkout(userId, claims, await loadPlayer(userId, claims), event, body);
    if (route === 'POST /checkout/confirm') return await confirm(userId, claims, await loadPlayer(userId, claims));
    if (route === 'POST /gift/redeem') return await redeem(userId, claims, await loadPlayer(userId, claims), body);
    if (route === 'POST /gifts/promo') return await promo(userId, claims, body);
    if (route === 'POST /climbs') { const p = await loadPlayer(userId, claims); return await createClimb(userId, claims, p, body, hasUnlock(p, claims)); }
    if (route === 'POST /climbs/{id}/join') { const p = await loadPlayer(userId, claims); return await joinClimb(userId, claims, p, climbId, hasUnlock(p, claims)); }
    if (route === 'POST /climbs/{id}/leave') return await leaveClimb(userId, climbId);
    if (route === 'POST /climbs/{id}/start') return await startClimb(userId, climbId);
    return json(404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    return json(500, { error: 'server error' });
  }
};
