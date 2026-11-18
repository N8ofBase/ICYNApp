"""Clearer C&E scroll text (N8 2026-11-18): bigger, heavier, darker rows on a calm wash so the
mottled parchment doesn't fight the words while scrolling; no scaling/blur on rows. Idempotent."""
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
MARK = '/* ce-clear: '
if MARK in s: print('already patched'); sys.exit()
anchor = '.scroll .reveal{inset:calc(var(--fi) + 6px)}\n'
assert s.count(anchor) == 1, 'anchor not found'
css = MARK + '''clearer Calamity & Enhancement rows while scrolling (N8 2026-11-18) */
.scroll .faces{position:relative;background:rgba(253,246,228,.72);border-radius:8px;padding:4px;box-shadow:0 0 0 1px rgba(169,127,42,.25)}
.scroll .faces li{font-size:1rem;line-height:1.3;font-weight:600;color:#1d140b;padding:5px 9px;text-rendering:optimizeLegibility;-webkit-font-smoothing:auto}
.scroll .faces li:nth-child(odd){background:rgba(150,100,40,.11)}
.scroll .faces li b{font-weight:800;color:#7a2a14;width:1.7em}
.scroll .faces li.picked{transform:none;font-weight:700;animation:none}
.scroll .faces li.flick{background:color-mix(in srgb,var(--hero) 34%,#fdf6e4)}
.scroll .paper{-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.scroll .sc-hint{color:#1d140b;font-weight:700}
.scroll .sc-foot{background:linear-gradient(rgba(250,240,216,0),rgba(250,240,216,.97) 30%,#f7ead0);margin:0 -8px;padding-left:8px;padding-right:8px}
@media (max-width:520px){.scroll .faces li{font-size:.98rem;line-height:1.25;padding:4px 7px}}
'''
s = s.replace(anchor, anchor + css)
open(p, 'w', encoding='utf-8').write(s); print('patched')
