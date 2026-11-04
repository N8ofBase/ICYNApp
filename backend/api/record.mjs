// Shared player-stats logic for I Crit You Not! (used by icyn-api and icyn-ws).
// Ranked modes ('cpu' from browsers, 'online' from the WebSocket referee) update
// stats, streaks and the leaderboard; 'pnp' and 'online-unranked' (early forfeits) are history only.
// A ranked forfeit counts for W/L and streaks but never for quickest win/loss or KOs.
// 'starvos' (co-op boss battles) keeps its own record in player.sv and never touches duel stats or the leaderboard.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

export const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
export const PLAYERS = process.env.PLAYERS_TABLE || 'icyn-players';
export const MATCHES = process.env.MATCHES_TABLE || 'icyn-matches';
const RANKED_GAP_MS = 15000;
const RANKED = new Set(['cpu', 'online']);

// Thrown for results the caller should report back (429 too soon, 409 version clash).
export class RecordError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}

export const cleanName = (s) =>
  String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);

export function defaultName(claims) {
  return cleanName(claims.nickname) || cleanName(String(claims.email || '').split('@')[0]) || 'Adventurer';
}

export function blankPlayer(userId, claims) {
  return {
    userId, name: defaultName(claims), wins: 0, losses: 0, draws: 0, played: 0, kos: 0,
    currentStreak: 0, bestWinStreak: 0, worstLossStreak: 0, heroCounts: {}, prefs: {}, version: 0,
  };
}

function favoriteHero(counts) {
  let best = null, n = 0;
  for (const [h, c] of Object.entries(counts || {})) if (c > n) { best = h; n = c; }
  return best;
}

export function stats(p) {
  return {
    name: p.name, wins: p.wins, losses: p.losses, draws: p.draws, played: p.played, kos: p.kos,
    currentStreak: p.currentStreak, bestWinStreak: p.bestWinStreak, worstLossStreak: p.worstLossStreak,
    favoriteHero: favoriteHero(p.heroCounts),
    fastestWin: p.fastestWin ?? null, fastestLoss: p.fastestLoss ?? null, highestMaxLife: p.highestMaxLife || 0,
    starvos: starvosStats(p.sv),
  };
}

function topOf(counts) {
  let best = null, n = 0;
  for (const [h, c] of Object.entries(counts || {})) if (c > n) { best = h; n = c; }
  return best ? { hero: best, value: n } : null;
}

function starvosStats(sv) {
  const s = sv || {};
  return {
    played: s.played || 0, wins: s.wins || 0, losses: s.losses || 0, fallen: s.fallen || 0, annihilated: s.annihilated || 0,
    flawless: s.flawless || 0, currentStreak: s.currentStreak || 0, bestWinStreak: s.bestWinStreak || 0,
    fastestWin: s.fastestWin ?? null, roundsSurvived: s.roundsSurvived || 0,
    damage: s.damage || 0, bestDamage: s.bestDamage || 0, heroesLost: s.heroesLost || 0,
    favoriteHero: favoriteHero(s.heroCounts), topHero: topOf(s.heroDamage), bestHit: s.bestHit || null,
    heroCounts: s.heroCounts || {}, heroWins: s.heroWins || {}, heroDamage: s.heroDamage || {},
  };
}

// match fields for mode 'starvos' (already validated): result, outcome, rounds, heroes, survivors, damage, bossLife, heroDamage?
function addStarvos(prev, m) {
  const sv = { ...(prev || {}) };
  for (const k of ['heroCounts', 'heroWins', 'heroDamage']) sv[k] = { ...(sv[k] || {}) };
  const won = m.result === 'win';
  sv.played = (sv.played || 0) + 1;
  sv.roundsSurvived = (sv.roundsSurvived || 0) + (m.outcome === 'fallen' ? m.rounds - 1 : m.rounds);
  sv.damage = (sv.damage || 0) + m.damage;
  sv.bestDamage = Math.max(sv.bestDamage || 0, m.damage);
  sv.heroesLost = (sv.heroesLost || 0) + (m.heroes.length - m.survivors);
  for (const h of m.heroes) {
    sv.heroCounts[h] = (sv.heroCounts[h] || 0) + 1;
    if (won) sv.heroWins[h] = (sv.heroWins[h] || 0) + 1;
  }
  for (const [h, d] of Object.entries(m.heroDamage || {})) {
    sv.heroDamage[h] = (sv.heroDamage[h] || 0) + d;
    if (!sv.bestHit || d > sv.bestHit.value) sv.bestHit = { hero: h, value: d };
  }
  if (won) {
    sv.wins = (sv.wins || 0) + 1;
    sv.fastestWin = minOf(sv.fastestWin, m.rounds);
    if (m.survivors === m.heroes.length) sv.flawless = (sv.flawless || 0) + 1;
    sv.currentStreak = (sv.currentStreak || 0) > 0 ? sv.currentStreak + 1 : 1;
    sv.bestWinStreak = Math.max(sv.bestWinStreak || 0, sv.currentStreak);
  } else {
    sv.losses = (sv.losses || 0) + 1;
    if (m.outcome === 'fallen') sv.fallen = (sv.fallen || 0) + 1;
    else sv.annihilated = (sv.annihilated || 0) + 1;
    sv.currentStreak = (sv.currentStreak || 0) < 0 ? sv.currentStreak - 1 : -1;
  }
  return sv;
}

// Optional per-match peak Max Life; anything malformed is ignored rather than rejected.
const cleanMaxLife = (v) => (Number.isInteger(v) && v >= 1 && v <= 999 ? v : undefined);
const minOf = (a, b) => (a == null ? b : Math.min(a, b));

export async function loadPlayer(userId, claims) {
  const r = await db.send(new GetCommand({ TableName: PLAYERS, Key: { userId } }));
  return r.Item || blankPlayer(userId, claims);
}

// match: {result, mode, hero, opponentHero, rounds, ko, startingLife, maxLife?, forfeit?}, already validated.
export async function recordMatch(userId, claims, input) {
  const now = Date.now();
  const p = await loadPlayer(userId, claims);
  const ranked = RANKED.has(input.mode);
  const forfeit = input.forfeit === true;
  if (input.mode === 'starvos') return recordStarvos(userId, p, input, now);
  const hero = String(input.hero).trim().slice(0, 40);
  const match = {
    userId, playedAt: new Date(now).toISOString(), result: input.result, mode: input.mode, hero,
    opponentHero: String(input.opponentHero).trim().slice(0, 40), rounds: input.rounds, ko: !forfeit && !!input.ko,
    startingLife: input.startingLife, ranked, maxLife: cleanMaxLife(input.maxLife), forfeit,
  };

  // Online results come from the server referee, so only browser-reported cpu games are rate limited.
  if (input.mode === 'cpu' && p.lastRankedAt && now - p.lastRankedAt < RANKED_GAP_MS) {
    throw new RecordError(429, 'ranked results must be at least 15 seconds apart');
  }

  const prevVersion = p.version || 0;
  const next = { ...p, heroCounts: { ...(p.heroCounts || {}) }, version: prevVersion + 1 };
  if (ranked) {
    next.played += 1;
    if (input.mode === 'cpu') next.lastRankedAt = now;
    next.lb = 'ALL';
    next.heroCounts[hero] = (next.heroCounts[hero] || 0) + 1;
    if (match.maxLife) next.highestMaxLife = Math.max(p.highestMaxLife || 0, match.maxLife);
    if (input.result === 'win') {
      next.wins += 1;
      if (!forfeit) next.fastestWin = minOf(p.fastestWin, input.rounds);
      if (match.ko) next.kos += 1;
      next.currentStreak = p.currentStreak > 0 ? p.currentStreak + 1 : 1;
      next.bestWinStreak = Math.max(p.bestWinStreak, next.currentStreak);
    } else if (input.result === 'loss') {
      next.losses += 1;
      if (!forfeit) next.fastestLoss = minOf(p.fastestLoss, input.rounds);
      next.currentStreak = p.currentStreak < 0 ? p.currentStreak - 1 : -1;
      next.worstLossStreak = Math.max(p.worstLossStreak, -next.currentStreak);
    } else {
      next.draws += 1;
      next.currentStreak = 0;
    }
  }

  await save(p, next, match);
  return { stats: stats(next), match };
}

async function recordStarvos(userId, p, m, now) {
  if (p.sv && p.sv.lastAt && now - p.sv.lastAt < RANKED_GAP_MS) {
    throw new RecordError(429, 'results must be at least 15 seconds apart');
  }
  const match = {
    userId, playedAt: new Date(now).toISOString(), mode: 'starvos', ranked: false, result: m.result, outcome: m.outcome,
    rounds: m.rounds, hero: m.heroes.join(', '), opponentHero: 'Starvos', heroes: m.heroes, survivors: m.survivors,
    damage: m.damage, bossLife: m.bossLife, heroDamage: m.heroDamage, startingLife: 50,
  };
  const next = { ...p, version: (p.version || 0) + 1, sv: { ...addStarvos(p.sv, m), lastAt: now } };
  await save(p, next, match);
  return { stats: stats(next), match };
}

async function save(p, next, match) {
  const prevVersion = p.version || 0;
  try {
    await db.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: PLAYERS, Item: next,
            ConditionExpression: 'attribute_not_exists(userId) OR version = :v',
            ExpressionAttributeValues: { ':v': prevVersion },
          },
        },
        { Put: { TableName: MATCHES, Item: match, ConditionExpression: 'attribute_not_exists(playedAt)' } },
      ],
    }));
  } catch (e) {
    if (e.name === 'TransactionCanceledException') throw new RecordError(409, 'stats changed, retry');
    throw e;
  }
}
