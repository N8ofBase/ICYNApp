# Online duels (server-refereed)

- `engine.mjs` is the headless rules engine. It mirrors the game page's rules and is driven by prompts and inputs. `replay(seed, setup, inputs)` re-runs a duel, so a game is stored as just `{seed, setup, inputs}`. The seed never leaves the server, so nobody can predict a roll.
- `ws.mjs` is the WebSocket Lambda: create/join by code, act, resume, nudge (auto-plays a prompt left waiting more than 45 s), forfeit. Finished duels count as ranked `online` results.
- `../online.js` is the browser client (`window.ICYNOnline`).

## Prompts (state.pending)

| kind | who | input |
| --- | --- | --- |
| `speed` | either player (`p: null`) | `act('speed')` |
| `luck` | either player | `act('luck')` |
| `scroll` | `p` (`table`: `cal` or `enh`) | `act('scroll')` |
| `attack` | `p` (`second` true on the all-cooldown second attack) | `act('attack')` |
| `ability` | `p` (`options`: usable indexes) | `act('ability', index)` |

## Events (state.events, in order)

`start`, `round`, `speed {nat, tot}`, `first {p, skip}`, `sitOut`, `turn`, `table {p, table, v, F}`, `randomAbility {p, i}`, `attack {p, d, bonus, tot, def, result: hit|miss|tie|crit|fumble}`, `luck {reason, rolls}`, `damage {p, source: weapon|ability, i?, dice, bonus, dmg, max?, debuff?, healDice?, healed?, F}`, `allCooldown`, `repaired`, `end {winner, ko, rounds, life, peakMax, F}`. Each event carries `round`. Events with `F` include a snapshot of both fighters' stats.

## AWS

- Tables: `icyn-games` (gameId, GSI `byCode` on `code`, TTL `ttl`) and `icyn-connections` (connectionId, TTL `ttl`).
- WebSocket API: route selection `$request.body.action`, routes `$connect`, `$disconnect`, `create`, `join`, `resume`, `act`, `nudge`, `forfeit`. The ID token is passed as `?token=` on connect.
- `record.mjs` exports `recordMatch(userId, claims, match)`, the same ranked-stats logic as the HTTP API with mode `online` counted as ranked.
