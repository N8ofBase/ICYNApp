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

## Starvos co-op (`boss.mjs`)

`create {mode:'boss', hero?}` opens a lobby (seat 0 = host). Friends `join {mode:'boss', code}`, then `claim {hero}` / `release {hero}`; `leave` quits the lobby (the host leaving closes it). The host sends `start` once 2 to 5 players are in and each leads at least one Hero. Setup is `{mode:'boss', heroes, owners}`; Starvos has 80 Life per Hero.

Prompts: `scroll`, `attack`, `ability` belong to Hero `p` (its owner answers). An `ability` choice is the Ability index, or `10 + h` to have Radiant Strike heal standing Hero `h` 1D6 + Energy instead of striking (those choices are listed in `options` while Radiant Strike is ready). Soul Syphon heals every standing Hero with one 1D6 roll. Group prompts `fear`, `speed`, `dodge`, `enh` carry `ps` (Heroes rolling) and `wait` (seats still to press); each seat sends one `act` and the dice roll after the last. State adds `mode:'boss'`, `heroes`, `owners`, `waiting` (seats the game waits on) and `away` (seats that left mid-battle).

`nudge` autoplays seats that have dropped or left at once, and anyone after 45 s. `forfeit` mid-battle hands your Heroes to autopilot; the host's `forfeit {all:true}` abandons the battle. Results go to `recordMatch` with mode `starvos` (Starvos profile stats); battles abandoned before round 3 are not recorded.

Events: `start`, `round`, `fearWave {ps}`, `fear {ps, rolls, tot, afraid}`, `fearDamage {ps, dice, dmg}`, `strike {a}`, `dodge {ps, rolls, caught}`, `strikeHit {a, ps, dice, bonus, dmg}`, `speed {ps, nat, tot}`, `order {order, lost}`, `turn`, `attack`, `damage` (a Radiant Strike heal has `dmg: 0, mend: h, heal, healed`), `table`, `randomAbility`, `allCooldown`, `repaired`, `fallen {p}`, `end {outcome: win|fallen|annihilate, rounds, bossLife, bossLeft, survivors, life, dealt}`. `F` is `{heroes, boss}`.
