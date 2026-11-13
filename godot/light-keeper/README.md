# Path of the Light Keeper (Godot prototype)

A Godot 4.5 port of the Farluck Farm seed shed fight from `tools/critquest/farluck-battle.html`:
one level 1 Light Keeper against three plague gremlins on the same hex field, with the same rules,
Calamities, Enhancements and computer play.

## Open it
1. Install Godot 4.5 (standard build, no .NET needed): https://godotengine.org/download
2. In the Project Manager choose **Import**, pick `godot/light-keeper/project.godot`, then press **Run** (F5).

## What is where
- `scripts/battle.gd` rules, turn flow and the gremlins' choices (ported line by line from the HTML engine)
- `scripts/board.gd` the hex field, trees, rocks, fence, units, target rings, beams, damage numbers
- `scripts/main.gd` the Light Keeper picker and the battle screen (Role frame, action bar, action ring, Crit Dice, windows, tips)
- `scripts/ring_button.gd` one round action icon
- `scripts/hexmap.gd` map, hex math, line of sight and cover
- `scripts/rules_data.gd`, `scripts/art_data.gd` generated from the HTML prototype (abilities, stats, classic SVG art)

## Regenerate the data from the HTML prototype
```
# pull the data and drawing code out of the HTML (line ranges are found by markers)
S=../../tools/critquest/farluck-battle.html
L1=$(grep -n "^const LIFEFORMS" $S | cut -d: -f1); L2=$(grep -n "^// ======.* map: a mirror" $S | cut -d: -f1)
A1=$(grep -n "^function actIcon" $S | cut -d: -f1); A2=$(grep -n "^function renderPace" $S | cut -d: -f1)
B1=$(grep -n "^const SKIN=" $S | cut -d: -f1); B2=$(grep -n "^function unitXY" $S | cut -d: -f1)
{ sed -n "${L1},$((L2-1))p" $S; sed -n "${A1},$((A2-1))p" $S; sed -n "${B1},$((B2-1))p" $S; } > tools/src_extract.js
node tools/gen_data.mjs
```

## Export
`godot --headless --export-release "Web"` (single-threaded web build, no special server headers needed)
or `"Windows"` (one .exe with the game inside). Output goes to `build/` at the repo root (not committed).
Add `?auto=1` to the web address to watch the computer play your Light Keeper (handy for testing).

Fonts: Alegreya and Alegreya SC (SIL Open Font License, see `fonts/OFL.txt`).
