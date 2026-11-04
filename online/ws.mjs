// WebSocket Lambda for online duels (API Gateway WebSocket API, route
// selection $request.body.action). The server is the referee: it keeps each
// duel's secret seed and replays the engine for every move, so neither
// browser can fake a roll.
//
// Client -> server                         Server -> client
//   {action:'create', hero, life}            {type:'created', gameId, code}
//   {action:'join', code, hero}              {type:'state', ...} to both players
//   {action:'resume', gameId, since}         {type:'state', ...}
//   {action:'act', gameId, kind, choice?}    {type:'state', ...} to both players
//   {action:'nudge', gameId}                 auto-plays a prompt left waiting > 45 s
//   {action:'forfeit', gameId}               {type:'state', ...} with result
//                                            {type:'error', error, code?}  code 'pass' = needs a Crit Pass
// state = {type, gameId, code, status, you, players:[{name, hero}], since,
//          events (from index `since`), eventCount, pending, result}
import crypto from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { replay, accepts, HEROES } from './engine.mjs';
import { replayBoss, acceptsBoss, waitingOn } from './boss.mjs';
import { recordMatch } from './record.mjs';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const GAMES = process.env.GAMES_TABLE || 'icyn-games';
const CONNS = process.env.CONNECTIONS_TABLE || 'icyn-connections';
const POOL = process.env.USER_POOL_ID || 'us-east-1_slqC7oLPd';
const CLIENT = process.env.CLIENT_ID || '32atvvme5lvlrfpaqhcj7v5vai';
const ISSUER = `https://cognito-idp.us-east-1.amazonaws.com/${POOL}`;
const NUDGE_MS = 45000;
const DAY = 86400;
const BOSS_SEATS = 5;
// Crit Pass: set PASSES_TABLE to require a pass to host (create) an online game.
// Joining a friend's game stays free. Unset, everyone can host (the old behavior).
const PASSES = process.env.PASSES_TABLE || '';
async function hasPass(userId) {
  if (!PASSES) return true;
  const it = (await db.send(new GetCommand({ TableName: PASSES, Key: { userId } }))).Item;
  return !!(it && it.active !== false);
}
const isBoss = (game) => game.setup.mode === 'boss';
const run = (game) => (isBoss(game) ? replayBoss : replay)(game.seed, game.setup, game.inputs);

// ---------- Cognito ID token check (RS256 against the pool's JWKS) ----------
let jwks = null;
async function verifyIdToken(token) {
  const [h, p, s] = String(token || '').split('.');
  if (!s) return null;
  const header = JSON.parse(Buffer.from(h, 'base64url'));
  if (header.alg !== 'RS256') return null;
  if (!jwks) jwks = (await (await fetch(`${ISSUER}/.well-known/jwks.json`)).json()).keys;
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'));
  if (!ok) return null;
  const c = JSON.parse(Buffer.from(p, 'base64url'));
  if (c.iss !== ISSUER || c.aud !== CLIENT || c.token_use !== 'id' || c.exp * 1000 < Date.now()) return null;
  return c;
}

const cleanName = (s) => String(s || '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 24);
const nameOf = (c) => cleanName(c.nickname) || cleanName((c.email || '').split('@')[0]) || 'Hero';
const newCode = () => Array.from(crypto.randomBytes(5), (b) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('');

function client(event) {
  const { domainName, stage } = event.requestContext;
  return new ApiGatewayManagementApiClient({ endpoint: `https://${domainName}/${stage}` });
}
async function send(api, connectionId, msg) {
  if (!connectionId) return;
  try { await api.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: JSON.stringify(msg) })); }
  catch (e) { if (e.name !== 'GoneException') console.error(e); }
}

function stateFor(game, you, since = 0) {
  const r = game.status === 'waiting' ? { events: [], pending: null, result: null } : run(game);
  if (isBoss(game)) {
    const from = Math.max(0, Math.min(since, r.events.length));
    return {
      type: 'state', mode: 'boss', gameId: game.gameId, code: game.code, status: game.status, you, host: 0,
      players: game.players.map((u, i) => ({ name: game.names[i] || null, heroes: game.setup.heroes.filter((h, k) => game.setup.owners[k] === i) })),
      heroes: game.setup.heroes, owners: game.setup.owners,
      since: from, events: r.events.slice(from), eventCount: r.events.length,
      pending: r.pending, waiting: waitingOn(r.pending, game.setup.owners), away: game.left || [], pendingSince: game.pendingSince || null,
      result: game.forfeit ? { outcome: 'abandoned', forfeit: true } : r.result,
    };
  }
  const from = Math.max(0, Math.min(since, r.events.length));
  return {
    type: 'state', gameId: game.gameId, code: game.code, status: game.status, you,
    players: game.players.map((u, i) => ({ name: game.names[i] || null, hero: game.setup.heroes[i] || null })),
    since: from, events: r.events.slice(from), eventCount: r.events.length,
    pending: r.pending, pendingSince: game.pendingSince || null,
    result: game.forfeit ? { winner: 1 - game.forfeit.by, forfeit: true } : r.result,
  };
}
async function broadcast(api, game) {
  await Promise.all(game.conns.map((c, i) => send(api, c, stateFor(game, i, 0))));
}

async function saveGame(game, prevVersion) {
  game.version = prevVersion + 1;
  game.ttl = Math.floor(Date.now() / 1000) + 7 * DAY;
  await db.send(new PutCommand({ TableName: GAMES, Item: game, ConditionExpression: 'version = :v', ExpressionAttributeValues: { ':v': prevVersion } }));
}

// Apply one input (or an auto-play) and record results when the duel ends.
async function advance(game, p, input) {
  const before = run(game);
  const boss = isBoss(game);
  if (!(boss ? acceptsBoss(before.pending, p, input, game.setup.owners) : accepts(before.pending, p, input))) return 'Not your move';
  game.inputs = [...game.inputs, { kind: input.kind, [boss ? 'by' : 'p']: p, ...(input.kind === 'ability' ? { choice: input.choice } : {}),
    ...(boss && input.kind === 'ability' && Number.isInteger(input.target) ? { target: input.target } : {}) }];
  const after = run(game);
  game.pendingSince = Date.now();
  if (after.result) finish(game, after.result);
  return null;
}
// Marks the duel done; the results are recorded only after the game saves.
function finish(game, result) {
  game.status = 'done';
  game.finished = result;
}
async function recordResults(game) {
  const result = game.finished;
  if (isBoss(game)) return recordBoss(game, result);
  // An early forfeit (before round 3) is history only, so two accounts can't farm wins.
  const mode = result.forfeit && result.rounds < 3 ? 'online-unranked' : 'online';
  await Promise.all(game.players.map((userId, i) => recordMatch(userId, { nickname: game.names[i] }, {
    result: result.winner === i ? 'win' : 'loss', mode, forfeit: !!result.forfeit, hero: HEROES[game.setup.heroes[i]].name,
    opponentHero: HEROES[game.setup.heroes[1 - i]].name, rounds: result.rounds || 8, ko: !!result.ko,
    startingLife: game.setup.life, maxLife: result.peakMax ? result.peakMax[i] : undefined,
  }).catch((e) => console.error('record', e))));
}

// Starvos battles count toward each player's Starvos stats (player.sv), not the duel rankings.
// A battle abandoned before round 3 is not recorded.
async function recordBoss(game, result) {
  if (result.forfeit && result.rounds < 3) return;
  const names = game.setup.heroes.map((id) => HEROES[id].name);
  const heroDamage = Object.fromEntries(names.map((n, k) => [n, (result.dealt || [])[k] || 0]));
  // Each profile's Hero stats credit only the Heroes that player led (heroes, heroDamage); damage is the whole party's.
  await Promise.all(game.players.map((userId, i) => {
    const mine = names.filter((n, k) => game.setup.owners[k] === i);
    return recordMatch(userId, { nickname: game.names[i] }, {
      mode: 'starvos', online: true, result: result.outcome === 'win' ? 'win' : 'loss', outcome: result.outcome, rounds: result.rounds || 8,
      heroes: mine, party: names, players: game.players.length,
      survivors: game.setup.owners.filter((o, k) => o === i && (result.life || [])[k] > 0).length,
      damage: (result.bossLife || 0) - (result.bossLeft || 0), bossLife: result.bossLife,
      heroDamage: Object.fromEntries(mine.map((n) => [n, heroDamage[n]])),
    }).catch((e) => console.error('record', e));
  }));
}
// Seats whose connection has dropped: their prompts autoplay at once.
async function dropped(game, seats) {
  const out = [];
  for (const s of seats) {
    const c = game.conns[s] && (await db.send(new GetCommand({ TableName: CONNS, Key: { connectionId: game.conns[s] } }))).Item;
    if (!c) out.push(s);
  }
  return out;
}
const autoInput = (pending) => ({ kind: pending.kind, choice: pending.kind === 'ability' ? pending.options[0] : undefined });

export async function handler(event) {
  const { routeKey, connectionId } = event.requestContext;
  const api = client(event);

  if (routeKey === '$connect') {
    const claims = await verifyIdToken(event.queryStringParameters?.token).catch(() => null);
    if (!claims) return { statusCode: 401 };
    await db.send(new PutCommand({ TableName: CONNS, Item: { connectionId, userId: claims.sub, name: nameOf(claims), ttl: Math.floor(Date.now() / 1000) + DAY } }));
    return { statusCode: 200 };
  }
  if (routeKey === '$disconnect') {
    await db.send(new DeleteCommand({ TableName: CONNS, Key: { connectionId } }));
    return { statusCode: 200 };
  }

  const conn = (await db.send(new GetCommand({ TableName: CONNS, Key: { connectionId } }))).Item;
  if (!conn) return { statusCode: 401 };
  let msg;
  try { msg = JSON.parse(event.body || '{}'); } catch (e) { await send(api, connectionId, { type: 'error', error: 'Bad JSON' }); return { statusCode: 400 }; }
  const fail = async (error) => { await send(api, connectionId, { type: 'error', error, action: msg.action }); return { statusCode: 200 }; };
  const needPass = async () => { await send(api, connectionId, { type: 'error', code: 'pass', error: 'Hosting an online game needs a Crit Pass. Joining a friend\u2019s game is free.', action: msg.action }); return { statusCode: 200 }; };
  if (msg.action === 'create' && !(await hasPass(conn.userId))) return needPass();

  if (msg.action === 'create' && msg.mode === 'boss') {
    const heroes = [...new Set([].concat(msg.heroes || msg.hero || []))].filter((h) => HEROES[h]);
    const game = {
      gameId: crypto.randomUUID(), code: newCode(), status: 'waiting', seed: crypto.randomBytes(16).toString('hex'),
      setup: { mode: 'boss', v: 3, heroes, owners: heroes.map(() => 0) }, players: [conn.userId], names: [conn.name],
      conns: [connectionId], inputs: [], version: 0, createdAt: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + DAY,
    };
    await db.send(new PutCommand({ TableName: GAMES, Item: game }));
    await db.send(new UpdateCommand({ TableName: CONNS, Key: { connectionId }, UpdateExpression: 'SET gameId = :g', ExpressionAttributeValues: { ':g': game.gameId } }));
    await send(api, connectionId, { type: 'created', mode: 'boss', gameId: game.gameId, code: game.code });
    await send(api, connectionId, stateFor(game, 0));
    return { statusCode: 200 };
  }
  if (msg.action === 'create') {
    if (!HEROES[msg.hero] || ![50, 100].includes(Number(msg.life))) return fail('Pick a Hero and a starting Life of 50 or 100');
    const game = {
      gameId: crypto.randomUUID(), code: newCode(), status: 'waiting', seed: crypto.randomBytes(16).toString('hex'),
      setup: { heroes: [msg.hero, null], life: Number(msg.life) }, players: [conn.userId, null], names: [conn.name, null],
      conns: [connectionId, null], inputs: [], version: 0, createdAt: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + DAY,
    };
    await db.send(new PutCommand({ TableName: GAMES, Item: game }));
    await db.send(new UpdateCommand({ TableName: CONNS, Key: { connectionId }, UpdateExpression: 'SET gameId = :g', ExpressionAttributeValues: { ':g': game.gameId } }));
    await send(api, connectionId, { type: 'created', gameId: game.gameId, code: game.code });
    return { statusCode: 200 };
  }

  // Every other action loads the game; retry once if a simultaneous move bumped its version.
  for (let attempt = 0; attempt < 2; attempt++) {
    let game;
    if (msg.action === 'join') {
      if (!HEROES[msg.hero] && !msg.mode) return fail('Pick a Hero');
      const q = await db.send(new QueryCommand({ TableName: GAMES, IndexName: 'byCode', KeyConditionExpression: 'code = :c', ExpressionAttributeValues: { ':c': String(msg.code || '').toUpperCase() } }));
      game = q.Items && q.Items[0] && (await db.send(new GetCommand({ TableName: GAMES, Key: { gameId: q.Items[0].gameId } }))).Item;
      if (!game) return fail('No duel with that code');
    } else {
      game = (await db.send(new GetCommand({ TableName: GAMES, Key: { gameId: String(msg.gameId || '') } }))).Item;
      if (!game) return fail('Duel not found');
    }
    const prev = game.version;
    let you = game.players.indexOf(conn.userId);

    const boss = isBoss(game);
    if (!boss && msg.action === 'join' && !HEROES[msg.hero]) return fail('Pick a Hero');
    if (boss && msg.action === 'join') {
      if (you === -1) {
        if (game.status !== 'waiting') return fail('That battle has already begun');
        if (game.players.length >= BOSS_SEATS) return fail('That battle is full');
        you = game.players.length;
        game.players.push(conn.userId); game.names.push(conn.name); game.conns.push(null);
      }
      game.conns[you] = connectionId;
    } else if (boss && (msg.action === 'claim' || msg.action === 'release')) {
      if (you === -1) return fail('You are not in this battle');
      if (game.status !== 'waiting') return fail('The battle has already begun');
      const h = String(msg.hero || ''), k = game.setup.heroes.indexOf(h);
      if (!HEROES[h]) return fail('Pick a Hero');
      if (msg.action === 'claim') {
        if (k >= 0) return fail(game.setup.owners[k] === you ? 'You already lead that Hero' : `${game.names[game.setup.owners[k]]} already leads that Hero`);
        game.setup.heroes.push(h); game.setup.owners.push(you);
      } else {
        if (k < 0 || game.setup.owners[k] !== you) return fail('That Hero is not yours');
        game.setup.heroes.splice(k, 1); game.setup.owners.splice(k, 1);
      }
    } else if (boss && msg.action === 'leave' && game.status === 'waiting') {
      if (you === -1) return fail('You are not in this battle');
      if (you === 0) { game.status = 'done'; game.forfeit = { by: 0, at: new Date().toISOString() }; game.finished = { outcome: 'abandoned', forfeit: true, rounds: 0 }; }
      else {
        // later seats shift down one
        game.players.splice(you, 1); game.names.splice(you, 1); game.conns.splice(you, 1);
        const keep = game.setup.owners.map((o) => o !== you);
        game.setup.heroes = game.setup.heroes.filter((h, k) => keep[k]);
        game.setup.owners = game.setup.owners.filter((o, k) => keep[k]).map((o) => (o > you ? o - 1 : o));
      }
    } else if (boss && msg.action === 'start') {
      if (you !== 0) return fail('Only the host can begin the battle');
      if (game.status !== 'waiting') return fail('The battle has already begun');
      if (game.players.length < 2) return fail('Wait for at least one friend to join');
      const idle = game.players.map((u, i) => i).filter((i) => !game.setup.owners.includes(i));
      if (idle.length) return fail(`${idle.map((i) => game.names[i]).join(', ')} must lead a Hero first`);
      game.status = 'active'; game.pendingSince = Date.now();
    } else if (msg.action === 'join') {
      if (you === 0 && game.status === 'waiting') return fail('Share the code with a friend; you cannot join your own duel');
      if (you === -1) {
        if (game.status !== 'waiting') return fail('That duel has already started');
        you = 1;
        game.players[1] = conn.userId; game.names[1] = conn.name; game.setup.heroes[1] = msg.hero;
        game.status = 'active'; game.pendingSince = Date.now();
      }
      game.conns[you] = connectionId;
    } else if (you === -1) {
      return fail('You are not in this duel');
    } else if (msg.action === 'resume') {
      game.conns[you] = connectionId;
      if (game.left) game.left = game.left.filter((s) => s !== you);
    } else if (game.status !== 'active') {
      return fail('This duel is not in play');
    } else if (msg.action === 'act') {
      const err = await advance(game, you, { kind: msg.kind, choice: msg.choice, target: msg.target });
      if (err) return fail(err);
    } else if (boss && msg.action === 'nudge') {
      const { pending } = run(game);
      if (!pending) return fail('Nothing is waiting');
      const late = waitingOn(pending, game.setup.owners).filter((s) => s !== you);
      if (!late.length) return fail('It is your move');
      const gone = [...new Set([...(game.left || []).filter((s) => late.includes(s)), ...(await dropped(game, late))])];
      const seats = Date.now() - (game.pendingSince || 0) >= NUDGE_MS ? late : gone;
      if (!seats.length) return fail('Give your allies a little longer');
      // group prompts take one press per seat; a solo prompt plays once
      for (const s of seats) { const cur = run(game).pending; if (!cur || !waitingOn(cur, game.setup.owners).includes(s)) break; await advance(game, s, autoInput(cur)); }
    } else if (boss && msg.action === 'forfeit') {
      // Leaving mid-battle: your Heroes fight on autopilot; the host may abandon the whole battle.
      if (you !== 0 || !msg.all) {
        game.left = [...new Set([...(game.left || []), you])];
      } else {
        game.forfeit = { by: you, at: new Date().toISOString() };
        game.status = 'done';
        const r = run(game);
        finish(game, { outcome: 'abandoned', forfeit: true, rounds: Math.max(1, ...r.events.map((e) => e.round || 0)) });
      }
    } else if (msg.action === 'nudge') {
      if (Date.now() - (game.pendingSince || 0) < NUDGE_MS) return fail('Give your rival a little longer');
      const { pending } = replay(game.seed, game.setup, game.inputs);
      if (!pending) return fail('Nothing is waiting');
      const p = pending.p === null ? 1 - you : pending.p;
      if (p === you) return fail('It is your move');
      await advance(game, p, { kind: pending.kind, choice: pending.kind === 'ability' ? pending.options[0] : undefined });
    } else if (msg.action === 'forfeit') {
      game.forfeit = { by: you, at: new Date().toISOString() };
      game.status = 'done';
      const r = replay(game.seed, game.setup, game.inputs);
      finish(game, { winner: 1 - you, ko: false, forfeit: true, rounds: Math.max(1, ...r.events.map((e) => e.round || 0)), peakMax: null });
    } else {
      return fail('Unknown action');
    }

    const justFinished = game.finished && !game.recorded;
    if (justFinished) game.recorded = true;
    try {
      await saveGame(game, prev);
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException' && attempt === 0) continue;
      throw e;
    }
    if (justFinished) await recordResults(game);
    await db.send(new UpdateCommand({ TableName: CONNS, Key: { connectionId }, UpdateExpression: 'SET gameId = :g', ExpressionAttributeValues: { ':g': game.gameId } }));
    if (msg.action === 'resume') await send(api, connectionId, stateFor(game, you, Number(msg.since) || 0));
    else await broadcast(api, game);
    return { statusCode: 200 };
  }
  return fail('Busy, please try again');
}
