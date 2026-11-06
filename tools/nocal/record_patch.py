#!/usr/bin/env python3
"""Game Mode in player stats (N8 2026-11-06). Patches the shared record.mjs used by BOTH Lambdas
(icyn-api and icyn-ws). Each duel record gets gameMode 'easy'|'standard' (missing = standard), and
ranked duels also count wins/losses/draws per mode in player.modes, returned as stats.modes.
Usage: record_patch.py path/to/record.mjs"""
import sys

REPS = [
 ("""    favoriteHero: favoriteHero(p.heroCounts),""",
  """    favoriteHero: favoriteHero(p.heroCounts),
    modes: p.modes || {},"""),
 ("""    startingLife: input.startingLife, ranked, maxLife: cleanMaxLife(input.maxLife), forfeit,
  };""",
  """    startingLife: input.startingLife, ranked, maxLife: cleanMaxLife(input.maxLife), forfeit,
    gameMode: input.gameMode === 'easy' ? 'easy' : 'standard',
  };"""),
 ("""    next.heroCounts[hero] = (next.heroCounts[hero] || 0) + 1;""",
  """    next.heroCounts[hero] = (next.heroCounts[hero] || 0) + 1;
    const gm = { wins: 0, losses: 0, draws: 0, ...((p.modes || {})[match.gameMode] || {}) };
    gm[input.result === 'win' ? 'wins' : input.result === 'loss' ? 'losses' : 'draws'] += 1;
    next.modes = { ...(p.modes || {}), [match.gameMode]: gm };"""),
]
path = sys.argv[1]
s = open(path, encoding='utf-8').read()
if 'gameMode' in s:
    sys.exit(print(path, 'already patched'))
for a, b in REPS:
    n = s.count(a)
    if n != 1: sys.exit(f'{path}: expected 1 match, found {n}: {a[:70]!r}')
    s = s.replace(a, b)
open(path, 'w', encoding='utf-8').write(s)
print(path, 'patched')
