// End-to-end test of Crit Climb against an in-memory DynamoDB (no AWS needed).
// Needs the AWS SDK v3 packages somewhere: NM=/path/to/folder-with-node_modules node tools/climb/test-climb.mjs
// It copies backend/api and backend/ws next to that node_modules and drives the real handlers:
// owner schedules a Climb, players join, the bracket is drawn, every match is played through the
// WebSocket referee (moves auto-answered), byes / walkovers / no-shows resolve, badges are awarded.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const NM = process.env.NM; if (!NM) throw new Error('set NM to a folder that has node_modules/@aws-sdk');
const work = path.join(NM, 'climb-test');
fs.rmSync(work, { recursive: true, force: true });
fs.cpSync(path.join(here, '../../backend/api'), path.join(work, 'api'), { recursive: true });
fs.cpSync(path.join(here, '../../backend/ws'), path.join(work, 'ws'), { recursive: true });
assert.equal(fs.readFileSync(path.join(work, 'api/climb.mjs'), 'utf8'), fs.readFileSync(path.join(work, 'ws/climb.mjs'), 'utf8'), 'api/climb.mjs and ws/climb.mjs must match');

const { DynamoDBDocumentClient } = await import(path.join(NM, 'node_modules/@aws-sdk/lib-dynamodb/dist-cjs/index.js'));
const { ApiGatewayManagementApiClient } = await import(path.join(NM, 'node_modules/@aws-sdk/client-apigatewaymanagementapi/dist-cjs/index.js'));

// ---------- in-memory tables ----------
const KEYS = { 'icyn-climbs': 'id', 'icyn-players': 'userId', 'icyn-matches': 'mkey', 'icyn-games': 'gameId', 'icyn-connections': 'connectionId' };
const T = Object.fromEntries(Object.keys(KEYS).map((k) => [k, new Map()]));
const clone = (x) => (x === undefined ? undefined : structuredClone(x));
const strip = (o) => JSON.parse(JSON.stringify(o));
function cond(expr, item, vals = {}) {
  if (!expr) return true;
  return expr.split(' OR ').some((c) => {
    c = c.trim();
    let m;
    if ((m = /^attribute_not_exists\((\w+)\)$/.exec(c))) return !item || item[m[1]] === undefined;
    if ((m = /^attribute_exists\((\w+)\)$/.exec(c))) return !!item && item[m[1]] !== undefined;
    if ((m = /^(\w+) = (:\w+)$/.exec(c))) return !!item && item[m[1]] === vals[m[2]];
    throw new Error('cond ' + c);
  });
}
const fail = () => Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' });
function setExpr(item, expr, vals, names = {}) {
  const nm = (k) => names[k] || k;
  const val = (e) => {
    e = e.trim(); let m;
    if ((m = /^(.*) \+ (:\w+)$/.exec(e))) return val(m[1]) + vals[m[2]];
    if ((m = /^if_not_exists\((#?\w+), (:\w+)\)$/.exec(e))) return item[nm(m[1])] !== undefined ? item[nm(m[1])] : clone(vals[m[2]]);
    if ((m = /^list_append\((.*), (:\w+)\)$/.exec(e))) return [...val(m[1]), ...clone(vals[m[2]])];
    if (e.startsWith(':')) return clone(vals[e]);
    throw new Error('expr ' + e);
  };
  const body = expr.replace(/^SET /, '');
  const parts = []; let depth = 0, cur = '';
  for (const ch of body) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { parts.push(cur); cur = ''; } else cur += ch; }
  parts.push(cur);
  for (const p of parts) { const [k, e] = p.split(/ = (.*)/s); item[nm(k.trim())] = val(e); }
}
DynamoDBDocumentClient.prototype.send = async function (cmd) {
  const n = cmd.constructor.name, i = cmd.input, t = T[i.TableName];
  if (n === 'GetCommand') return { Item: clone(t.get(i.Key[KEYS[i.TableName]])) };
  if (n === 'PutCommand') {
    const k = i.Item[KEYS[i.TableName]];
    if (!cond(i.ConditionExpression, t.get(k), i.ExpressionAttributeValues)) throw fail();
    t.set(k, strip(i.Item)); return {};
  }
  if (n === 'DeleteCommand') { t.delete(i.Key[KEYS[i.TableName]]); return {}; }
  if (n === 'UpdateCommand') {
    const k = i.Key[KEYS[i.TableName]], item = clone(t.get(k));
    if (!cond(i.ConditionExpression, item, i.ExpressionAttributeValues)) throw fail();
    const it = item || { ...i.Key };
    setExpr(it, i.UpdateExpression, i.ExpressionAttributeValues, i.ExpressionAttributeNames);
    t.set(k, it); return { Attributes: clone(it) };
  }
  if (n === 'QueryCommand') {
    if (i.IndexName === 'byCode') return { Items: [...t.values()].filter((g) => g.code === i.ExpressionAttributeValues[':c']).map(clone) };
    throw new Error('query');
  }
  if (n === 'ScanCommand') return { Items: [...t.values()].map(clone) };
  if (n === 'TransactWriteCommand') {
    for (const x of i.TransactItems) if (x.Put.TableName === 'icyn-matches') x.Put.Item.mkey = x.Put.Item.userId + '#' + x.Put.Item.playedAt;
    for (const x of i.TransactItems) { const p = x.Put, tt = T[p.TableName]; if (!cond(p.ConditionExpression, tt.get(p.Item[KEYS[p.TableName]]), p.ExpressionAttributeValues)) throw Object.assign(new Error('tx'), { name: 'TransactionCanceledException' }); }
    for (const x of i.TransactItems) { const p = x.Put; T[p.TableName].set(p.Item[KEYS[p.TableName]], strip(p.Item)); }
    return {};
  }
  throw new Error('unsupported ' + n);
};
const inbox = new Map(); // connectionId -> messages
ApiGatewayManagementApiClient.prototype.send = async function (cmd) {
  const { ConnectionId, Data } = cmd.input;
  if (!inbox.has(ConnectionId)) inbox.set(ConnectionId, []);
  inbox.get(ConnectionId).push(JSON.parse(Data));
  return {};
};

const climbMod = await import(path.join(work, 'api/climb.mjs'));
const api = await import(path.join(work, 'api/index.mjs'));
const ws = await import(path.join(work, 'ws/ws.mjs'));

// ---------- pure logic ----------
assert.deepEqual(climbMod.seedOrder(4), [1, 4, 2, 3]);
assert.deepEqual(climbMod.seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 12, 16]) {
  const t = { status: 'open', matchHours: 24, entrants: Array.from({ length: n }, (_, k) => ({ u: 'u' + k })) };
  climbMod.begin(t, 1000);
  const size = t.bracketSize;
  assert.ok(size >= n && size / 2 < n, `size for ${n}`);
  assert.equal(t.rounds[0].flatMap((m) => [m.a, m.b]).filter((x) => x !== null).length, n);
  assert.ok(t.rounds[0].every((m) => m.a !== null || m.b !== null), 'never two byes in one match');
  // nobody shows: every match resolves by seed at its deadline; the top seed wins
  let now = 1000;
  for (let k = 0; k < 10 && t.status === 'live'; k++) { now += 25 * 3600000; climbMod.settle(t, now); }
  assert.equal(t.status, 'done');
  assert.equal(t.seeds[t.champion], 1, 'top seed advances on no-shows');
}

// ---------- end to end ----------
const ctx = { requestContext: { domainName: 'x', stage: 'prod' } };
const owner = { sub: 'owner', nickname: 'N8', 'cognito:groups': ['developers'] };
const P = (k) => ({ sub: 'p' + k, nickname: 'Player' + k });
const call = (routeKey, claims, body, id) => api.handler({ routeKey, pathParameters: id ? { id } : undefined,
  requestContext: { authorizer: claims ? { jwt: { claims } } : undefined }, body: body ? JSON.stringify(body) : undefined })
  .then((r) => ({ status: r.statusCode, body: JSON.parse(r.body) }));

// players 1..4 have the Crit Pass, player 5 does not
for (let k = 1; k <= 5; k++) T['icyn-players'].set('p' + k, { userId: 'p' + k, name: 'Player' + k, wins: 0, losses: 0, draws: 0, played: 0, kos: 0, currentStreak: 0, bestWinStreak: 0, worstLossStreak: 0, heroCounts: {}, prefs: { avatar: 'i:sun' }, version: 0, ...(k < 5 ? { unlock: { via: 'gift' } } : {}) });

let r = await call('POST /climbs', P(5), { size: 4, public: true });
assert.equal(r.status, 403, 'hosting needs the Crit Pass');
r = await call('POST /climbs', P(1), { size: 4, public: true });
assert.equal(r.status, 200); const id = r.body.code; assert.match(id, /^[A-Z2-9]{5}$/);
assert.equal(r.body.entrants.length, 1, 'the host is in'); assert.equal(r.body.name, "Player1's Crit Climb");
assert.equal((await call('POST /climbs/{id}/join', P(5), {}, id)).status, 403, 'Crit Pass needed');
assert.equal((await call('POST /climbs/{id}/join', P(2), {}, id.toLowerCase())).status, 200, 'codes are not case sensitive');
r = await call('POST /climbs/{id}/start', P(1), {}, id); assert.equal(r.status, 400, 'needs 3 players');
r = await call('POST /climbs/{id}/join', P(3), {}, id); assert.equal(r.body.entrants.length, 3);
r = await call('POST /climbs/{id}/leave', P(3), {}, id); assert.equal(r.body.entrants.length, 2);
await call('POST /climbs/{id}/join', P(3), {}, id); await call('POST /climbs/{id}/join', P(4), {}, id);
r = await call('GET /climbs'); assert.equal(r.body.length, 0, 'a full lobby leaves the public list');
r = await call('GET /climbs/{id}', null, null, id);
assert.ok(!JSON.stringify(r.body).includes('"p1"'), 'user ids stay private');
assert.equal(r.body.entrants[0].k, climbMod.entrantKey('p1'));
assert.equal((await call('POST /climbs/{id}/start', P(2), {}, id)).status, 400, 'only the host begins');
r = await call('POST /climbs/{id}/start', P(1), {}, id);
assert.equal(r.body.status, 'live'); assert.equal(r.body.rounds.length, 2);

const conns = {};
for (const k of [1, 2, 3, 4]) { conns[k] = 'c' + k; T['icyn-connections'].set('c' + k, { connectionId: 'c' + k, userId: 'p' + k, name: 'Player' + k, dev: false }); }
const wsSend = (k, msg) => ws.handler({ requestContext: { ...ctx.requestContext, routeKey: msg.action, connectionId: conns[k] }, body: JSON.stringify(msg) });
const last = (k) => { const m = inbox.get(conns[k]) || []; return m[m.length - 1]; };
const errOf = (k) => { const m = last(k); return m && m.type === 'error' ? m.error : null; };

// play one bracket match between entrants ka and kb through the referee
async function playMatch(ka, kb) {
  await wsSend(ka, { action: 'climb', climbId: id, hero: 'brawler' });
  assert.equal(last(ka).type, 'created', 'first arrival waits'); assert.ok(last(ka).climb);
  const code = last(ka).code;
  await wsSend(5, { action: 'join', code, hero: 'whisper' }).catch(() => {}); // stranger (no conn) ignored
  T['icyn-connections'].set('c9', { connectionId: 'c9', userId: 'p9', name: 'Stranger', dev: true });
  await ws.handler({ requestContext: { ...ctx.requestContext, routeKey: 'join', connectionId: 'c9' }, body: JSON.stringify({ action: 'join', code, hero: 'whisper' }) });
  assert.match(inbox.get('c9').at(-1).error, /Crit Climb match/, 'strangers cannot join by code');
  await wsSend(kb, { action: 'climb', climbId: id, hero: 'soulseer' });
  let st = last(kb); assert.equal(st.type, 'state'); assert.equal(st.status, 'active'); assert.equal(st.climb.id, id);
  for (let n = 0; n < 2000; n++) {
    st = last(kb);
    if (st.type !== 'state') throw new Error('unexpected ' + JSON.stringify(st));
    if (st.status === 'done') return st;
    const p = st.pending; const who = p.p === null || p.p === undefined ? 1 : p.p; // seat
    const k = who === st.you ? kb : ka;
    await wsSend(k, { action: 'act', gameId: st.gameId, kind: p.kind, ...(p.kind === 'ability' ? { choice: p.options[0] } : {}) });
    if (errOf(k)) throw new Error(errOf(k));
  }
  throw new Error('duel never ended');
}
const entrantNo = (t, e) => Number(t.entrants[e].u.slice(1));
let t = T['icyn-climbs'].get(id);
for (const m of t.rounds[0]) {
  const st = await playMatch(entrantNo(t, m.a), entrantNo(t, m.b));
  assert.ok(st.result && (st.result.winner === 0 || st.result.winner === 1));
}
t = T['icyn-climbs'].get(id);
assert.ok(t.rounds[0].every((m) => m.how === 'duel'));
const fin = t.rounds[1][0]; assert.ok(fin.a !== null && fin.b !== null, 'finalists set');
// a semifinal loser cannot enter again
const loser = t.rounds[0][0].w === 0 ? t.rounds[0][0].b : t.rounds[0][0].a;
await wsSend(entrantNo(t, loser), { action: 'climb', climbId: id, hero: 'brawler' });
assert.match(errOf(entrantNo(t, loser)), /climb is over/);
// final: the second finalist forfeits mid-duel
const fa = entrantNo(t, fin.a), fb = entrantNo(t, fin.b);
await wsSend(fa, { action: 'climb', climbId: id, hero: 'maverick' });
await wsSend(fb, { action: 'climb', climbId: id, hero: 'champion' });
await wsSend(fb, { action: 'forfeit', gameId: last(fb).gameId });
t = T['icyn-climbs'].get(id);
assert.equal(t.status, 'done'); assert.equal(t.champion, fin.a); assert.equal(t.rounds[1][0].how, 'forfeit');
const champ = T['icyn-players'].get('p' + fa);
assert.equal(champ.climbWins, 1); assert.equal(champ.badges[0].k, 'conqueror');
assert.equal(T['icyn-players'].get('p' + fb).badges[0].k, 'competitor');
assert.equal(T['icyn-players'].get('p' + entrantNo(t, loser)).badges[0].k, 'competitor');
assert.ok(champ.wins >= 1, 'climb duels still count as ranked online duels');
r = await call('GET /me', P(fa)); assert.equal(r.body.ring, 'gold');
r = await call('GET /me', P(fb)); assert.equal(r.body.ring, 'silver');
r = await call('GET /climbs/{id}', null, null, id); assert.equal(r.body.status, 'done'); assert.equal(r.body.champion, fin.a);

// walkover: in a second Climb, one rival waits and the other never comes
r = await call('POST /climbs', P(2), { size: 8, public: false, name: 'Walkover Cup' });
const id2 = r.body.code;
assert.equal((await call('GET /climbs')).body.length, 0, 'private lobbies stay off the public list');
for (const k of [1, 3]) await call('POST /climbs/{id}/join', P(k), {}, id2);
r = await call('POST /climbs/{id}/start', P(2), {}, id2);
assert.equal(r.body.status, 'live'); assert.equal(r.body.bracketSize, 4, '3 players play a 4 bracket');
assert.equal(r.body.entrants.find((e) => e.k === climbMod.entrantKey('p' + fa)).ring, 'gold', 'rings show in later Climbs');
const t2 = T['icyn-climbs'].get(id2);
const real = t2.rounds[0].find((m) => m.how !== 'bye');
assert.equal(t2.rounds[0].filter((m) => m.how === 'bye').length, 1);
assert.ok(real.due - Date.now() <= 10 * 60000 && real.due - Date.now() > 9 * 60000, '10 minutes to meet');
const waiter = entrantNo(t2, real.b);
await wsSend(waiter, { action: 'climb', climbId: id2, hero: 'whisper' });
assert.equal(last(waiter).type, 'created');
T['icyn-climbs'].get(id2).rounds[0].forEach((m) => { if (m.due) m.due = Date.now() - 1; });
r = await call('GET /climbs/{id}', null, null, id2);
const m2 = r.body.rounds[0].find((m) => m.how === 'walkover');
assert.ok(m2, 'the player who waited wins by walkover'); assert.equal(m2.w, 1);
// nobody comes to the final: higher seed takes it
T['icyn-climbs'].get(id2).rounds[1][0].due = Date.now() - 1;
r = await call('GET /climbs/{id}', null, null, id2);
assert.equal(r.body.status, 'done'); assert.equal(r.body.rounds[1][0].how, 'noshow');

// the host leaving closes the lobby; a stale lobby closes after a day
r = await call('POST /climbs', P(1), { size: 4, public: true });
assert.equal((await call('GET /climbs')).body.length, 1, 'public lobby is listed');
r = await call('POST /climbs/{id}/leave', P(1), {}, r.body.code); assert.equal(r.body.status, 'cancelled');
r = await call('POST /climbs', P(1), { size: 16, public: true });
T['icyn-climbs'].get(r.body.code).createdAt -= 25 * 3600000;
r = await call('GET /climbs/{id}', null, null, r.body.code); assert.equal(r.body.status, 'cancelled');

console.log('Crit Climb tests passed');
