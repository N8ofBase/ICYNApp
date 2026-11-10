// Open games anyone can join (N8 2026-11-10): GET /games/open?mode=duel|boss (public).
// Public duels and Starvos battles that are still waiting sit on the sparse index byOpen of icyn-games
// (partition `open` = 'OPEN', sort `openAt`); icyn-ws keeps that up to date. A game is shown only while
// its host is still connected, so tabs closed without cancelling never linger on the list.
import { QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { cdb, isProfane } from './climb.mjs';
import { HEROES } from './engine.mjs';

const GAMES = process.env.GAMES_TABLE || 'icyn-games';
const CONNS = process.env.CONNECTIONS_TABLE || 'icyn-connections';
const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const heroName = (id) => (HEROES[id] ? HEROES[id].name : null);

export async function openGames(event) {
  const mode = (event.queryStringParameters || {}).mode === 'boss' ? 'boss' : 'duel';
  const r = await cdb.send(new QueryCommand({
    TableName: GAMES, IndexName: 'byOpen', KeyConditionExpression: '#o = :o AND openAt > :since',
    ExpressionAttributeNames: { '#o': 'open' }, ExpressionAttributeValues: { ':o': 'OPEN', ':since': Date.now() - 6 * 3600000 },
    ScanIndexForward: false, Limit: 60,
  }));
  const games = (r.Items || []).filter((g) => g.status === 'waiting' && (g.setup.mode === 'boss') === (mode === 'boss') && !g.setup.climb);
  const live = await Promise.all(games.map(async (g) => !!g.conns[0]
    && !!(await cdb.send(new GetCommand({ TableName: CONNS, Key: { connectionId: g.conns[0] } }))).Item));
  return json(200, games.filter((g, k) => live[k]).slice(0, 30).map((g) => {
    const host = isProfane(g.names[0]) ? 'Hero' : g.names[0] || 'Hero';
    return mode === 'boss'
      ? { code: g.code, mode, host, players: g.players.length, seats: 5, heroes: g.setup.heroes.map(heroName), openAt: g.openAt }
      : { code: g.code, mode, host, hero: heroName(g.setup.heroes[0]), easy: !!g.setup.easy, life: g.setup.life, openAt: g.openAt };
  }));
}
