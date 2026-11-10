// WebSocket Lambda for online duels (API Gateway WebSocket API, route
// selection $request.body.action). The server is the referee: it keeps each
// duel's secret seed and replays the engine for every move, so neither
// browser can fake a roll.
//
// Client -> server                         Server -> client
//   {action:'create', hero, life, easy?}     {type:'created', gameId, code}   (easy: 50 Life, no Calamity before each turn)
//   {action:'join', code, hero}              {type:'state', ...} to both players
//   {action:'resume', gameId, since}         {type:'state', ...}
//   {action:'act', gameId, kind, choice?}    {type:'state', ...} to both players
//   {action:'nudge', gameId}                 auto-plays a prompt left waiting > 45 s
//   {action:'forfeit', gameId}               {type:'state', ...} with result
//   {action:'climb', climbId, hero}          enters your Crit Climb match: creates its duel or joins the one your rival made
//                                            {type:'error', error}
// state = {type, gameId, code, status, you, players:[{name, hero}], since,
//          events (from index `since`), eventCount, pending, result}
import crypto from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { replay, accepts, HEROES } from './engine.mjs';
import { replayBoss, acceptsBoss, waitingOn } from './boss.mjs';
import { recordMatch } from './record.mjs';
import { loadClimb, refresh, currentMatch, markMatch, climbResult, withClimb } from './climb.mjs';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const GAMES = process.env.GAMES_TABLE || 'icyn-games';
const CONNS = process.env.CONNECTIONS_TABLE || 'icyn-connections';
const POOL = process.env.USER_POOL_ID || 'us-east-1_slqC7oLPd';
const CLIENT = process.env.CLIENT_ID || '32atvvme5lvlrfpaqhcj7v5vai';
const ISSUER = `https://cognito-idp.us-east-1.amazonaws.com/${POOL}`;
const NUDGE_MS = 45000;
const DAY = 86400;
const BOSS_SEATS = 5;
// Online play is part of the $5 Crit Pass unlock (stored as `unlock` on the icyn-players item;
// the developers group always has it). FREE_JOIN=true lets anyone join a game an unlocked player hosts.
const PLAYERS = process.env.PLAYERS_TABLE || 'icyn-players';
const FREE_JOIN = process.env.FREE_JOIN === 'true';
const NEED_UNLOCK = 'Online play needs the Crit Pass. Get it on the setup screen.';
const isDev = (c) => { const g = c?.['cognito:groups']; return (Array.isArray(g) ? g : String(g || '').split(/[\s,\[\]]+/)).includes('developers'); };
async function unlocked(conn) {
  if (conn.dev) return true;
  const p = (await db.send(new GetCommand({ TableName: PLAYERS, Key: { userId: conn.userId }, ProjectionExpression: '#u', ExpressionAttributeNames: { '#u': 'unlock' } }))).Item;
  return !!(p && p.unlock);
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
    pending: r.pending, pendingSince: game.pendingSince || null, climb: game.setup.climb || null,
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
    gameMode: game.setup.easy ? 'easy' : 'standard',
  }).catch((e) => console.error('record', e))));
  // A Crit Climb match moves the winner up the bracket (after the stats save, so badges never race it).
  if (game.setup.climb) await climbResult(game, result).catch((e) => console.error('climb', e));
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
    await db.send(new PutCommand({ TableName: CONNS, Item: { connectionId, userId: claims.sub, name: nameOf(claims), dev: isDev(claims), ttl: Math.floor(Date.now() / 1000) + DAY } }));
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

  if ((msg.action === 'create' || msg.action === 'climb') && !(await unlocked(conn))) return fail(msg.action === 'climb' ? 'Crit Climb needs the Crit Pass.' : NEED_UNLOCK);
  if (msg.action === 'climb') return climbDuel(api, conn, connectionId, msg, fail);
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
    const easy = msg.easy === true;
    const game = {
      gameId: crypto.randomUUID(), code: newCode(), status: 'waiting', seed: crypto.randomBytes(16).toString('hex'),
      setup: easy ? { heroes: [msg.hero, null], life: 50, easy: true } : { heroes: [msg.hero, null], life: Number(msg.life) }, players: [conn.userId, null], names: [conn.name, null],
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
      if (game.setup.climb && !game.players.includes(conn.userId)) return fail('That is a Crit Climb match. Enter it from the Crit Climb screen.');
    } else {
      game = (await db.send(new GetCommand({ TableName: GAMES, Key: { gameId: String(msg.gameId || '') } }))).Item;
      if (!game) return fail('Duel not found');
    }
    const prev = game.version;
    let you = game.players.indexOf(conn.userId);

    const boss = isBoss(game);
    if (msg.action === 'join' && you === -1 && !FREE_JOIN && !(await unlocked(conn))) return fail(NEED_UNLOCK);
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

// ---------- Crit Climb: enter your bracket match (climb.mjs keeps the bracket) ----------
// The first rival to arrive creates a Standard duel (100 Life, Calamities on) and waits in it;
// the second joins it. Nobody else can join, even with the code.
async function climbDuel(api, conn, connectionId, msg, fail) {
  if (!HEROES[msg.hero]) return fail('Pick a Hero');
  const id = String(msg.climbId || '');
  for (let attempt = 0; attempt < 3; attempt++) {
    const t = await loadClimb(id);
    if (!t) return fail('No such Crit Climb');
    refresh(t, Date.now());
    if (t.status === 'open') return fail('The Crit Climb has not begun yet');
    if (t.status !== 'live') return fail('This Crit Climb is over');
    const me = t.entrants.findIndex((e) => e.u === conn.userId);
    if (me < 0) return fail('You are not in this Crit Climb');
    const cur = currentMatch(t, me);
    if (!cur) return fail('Your climb is over. Watch the bracket to see who takes the crown!');
    if (!cur.ready) return fail('Your next rival is still being decided');
    const m = t.rounds[cur.r][cur.i];
    const rival = t.entrants[cur.side ? m.a : m.b];

    if (m.gameId) {
      const game = (await db.send(new GetCommand({ TableName: GAMES, Key: { gameId: m.gameId } }))).Item;
      if (game && game.players.includes(conn.userId)) {
        // back to a duel you are already in
        const you = game.players.indexOf(conn.userId), prev = game.version;
        game.conns[you] = connectionId;
        try { await saveGame(game, prev); } catch (e) { if (e.name === 'ConditionalCheckFailedException') continue; throw e; }
        await db.send(new UpdateCommand({ TableName: CONNS, Key: { connectionId }, UpdateExpression: 'SET gameId = :g', ExpressionAttributeValues: { ':g': game.gameId } }));
        if (game.status === 'waiting') await send(api, connectionId, { type: 'created', gameId: game.gameId, code: game.code, climb: game.setup.climb });
        else await send(api, connectionId, stateFor(game, you, 0));
        return { statusCode: 200 };
      }
      if (game && game.status === 'waiting') {
        const prev = game.version;
        game.players[1] = conn.userId; game.names[1] = conn.name; game.setup.heroes[1] = msg.hero;
        game.conns[1] = connectionId; game.status = 'active'; game.pendingSince = Date.now();
        try { await saveGame(game, prev); } catch (e) { if (e.name === 'ConditionalCheckFailedException') continue; throw e; }
        await markMatch(id, cur.r, cur.i, game.gameId, { state: 'active' });
        await db.send(new UpdateCommand({ TableName: CONNS, Key: { connectionId }, UpdateExpression: 'SET gameId = :g', ExpressionAttributeValues: { ':g': game.gameId } }));
        await broadcast(api, game);
        return { statusCode: 200 };
      }
      if (game && game.status === 'active') return fail('Your match is already under way on another device');
      // the old duel is gone (expired): make a new one below
    }

    const game = {
      gameId: crypto.randomUUID(), code: newCode(), status: 'waiting', seed: crypto.randomBytes(16).toString('hex'),
      setup: { heroes: [msg.hero, null], life: 100, climb: { id, r: cur.r, i: cur.i, name: t.name, rounds: t.rounds.length } },
      players: [conn.userId, null], names: [conn.name, null], conns: [connectionId, null], climbRival: rival.u,
      inputs: [], version: 0, createdAt: new Date().toISOString(), ttl: Math.floor(Date.now() / 1000) + 7 * DAY,
    };
    await db.send(new PutCommand({ TableName: GAMES, Item: game }));
    const claimed = await withClimb(id, (tt) => {
      const mm = tt.rounds?.[cur.r]?.[cur.i];
      if (!mm || mm.w !== null) return 'This match is already decided';
      if (mm.gameId && mm.gameId !== m.gameId) return 'raced';
      Object.assign(mm, { gameId: game.gameId, code: game.code, host: cur.side, state: 'waiting' });
    });
    if (claimed.error) {
      await db.send(new DeleteCommand({ TableName: GAMES, Key: { gameId: game.gameId } }));
      if (claimed.error === 'raced') continue; // your rival arrived first: join theirs
      return fail(claimed.error);
    }
    await db.send(new UpdateCommand({ TableName: CONNS, Key: { connectionId }, UpdateExpression: 'SET gameId = :g', ExpressionAttributeValues: { ':g': game.gameId } }));
    await send(api, connectionId, { type: 'created', gameId: game.gameId, code: game.code, climb: game.setup.climb });
    return { statusCode: 200 };
  }
  return fail('The arena is busy. Please try again.');
}
