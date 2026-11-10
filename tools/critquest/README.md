# Crit Quest balance simulator (Phase 1: rules on paper)

Dice-only simulator for the Crit Quest Hero rules in the "Crit Quest: Design Plan" doc.
Nothing here is used by the live game.

- `data.mjs`: Lifeforms, Roles, all 90 abilities (Recommendation column of the Ability trees tab) as plain data, plus the Farluck Farm terrors.
- `sim.mjs`: Hero builder (stats, Life, focused builds with weaving and Empower, 4-ability loadout) and the fight engine (Speed order, d20 to hit, crits, personal Calamities, battle Enhancements, Inspire/Cleanse, zone hazards).
- `run.mjs`: reports.
  - Hero vs Hero round robin: 75 Heroes (5 Lifeforms x 5 Roles x 3 focus branches) at levels 1, 3, 5, 10, 15 and 20.
  - Level gauntlets against a made-up raider and beast pack.
  - The Farluck Farm fights.

```
node tools/critquest/run.mjs 20             # current rules -> results-base.json
CHARM=CE node tools/critquest/run.mjs 20    # variant: Inspire adds the higher of Charm or Energy
CHARM=melkin node tools/critquest/run.mjs 20 # variant: Melkin get Speed +1, Energy +1
LEVELS=1,10 node tools/critquest/run.mjs 6  # quick run
```

The Balance test 1 fixes are built into `data.mjs` and `sim.mjs`. N8 approved them on 2026-11-10, and Lifeform battle actions were removed the same day.
The saved reports:

- `report-test1-before.txt` and `report-test1-after.txt` are test 1 (the old rules, then the proposed fixes).
- `report-test2.txt` is the adopted rules.

The simulator does not model yet:

- the hex map (range, movement, flanking, cover)
- Features
- Combos and party support abilities
- items
