"""Short landscape phones (N8 2026-11-25): all 20 Calamity/Enhancement rows fit the scroll with no
scrolling, and the victory/defeat card (Solo Climb bracket too) fits so Rematch / New duel are never cut off. Idempotent."""
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
MARK = '/* short-fit: '
if MARK in s: print('already patched'); sys.exit()
assert s.count('</style>') == 1, 'expected one style block'
css = MARK + '''C&E scroll + end card fit short landscape phones (N8 2026-11-25) */
@media (orientation:landscape) and (max-height:520px){
.scroll{width:min(900px,calc(100% - 76px))}
.scroll .paper{padding:0 2px}
.scroll .sc-head{padding-bottom:1px}
.scroll .sc-head .k{font-size:.52rem;letter-spacing:.12em}
.scroll .sc-head h2{font-size:1.02rem;line-height:1.05}
.scroll .sc-head::after{margin-top:2px}
.scroll .faces{gap:0 8px;padding:2px 3px}
.scroll .faces li{font-size:clamp(.66rem,3.15vh,.92rem);line-height:1.14;padding:1.5px 6px;gap:6px;font-weight:600}
.scroll .faces li b{width:1.5em}
.scroll .sc-foot{padding:2px 0 3px;gap:8px;margin-top:1px}
.scroll .sc-die{padding:1px}
.scroll .sc-die .die{--sz:32px}
.scroll .sc-hint{font-size:.85rem}
.over:not(.sp):not(.avp):not(.sv-end)>.card{max-width:min(640px,100%);display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:1fr repeat(8,auto) 1fr;column-gap:18px;row-gap:6px;align-items:center;padding:12px 16px;max-height:calc(100dvh - 16px);overflow:auto}
.over:not(.sp):not(.avp):not(.sv-end)>.card>*{grid-column:2}
.over:not(.sp):not(.avp):not(.sv-end)>.card>img{grid-column:1;grid-row:1 / -1;height:min(230px,calc(100dvh - 60px));max-width:34vw;align-self:center}
.over:not(.sp):not(.avp):not(.sv-end)>.card>:nth-child(2){grid-row:2}
.over:not(.sp):not(.avp):not(.sv-end)>.card>:nth-child(3){grid-row:3}
.over:not(.sp):not(.avp):not(.sv-end)>.card>:nth-child(4){grid-row:4}
.over:not(.sp):not(.avp):not(.sv-end)>.card>:nth-child(5){grid-row:5}
.over:not(.sp):not(.avp):not(.sv-end)>.card>:nth-child(6){grid-row:6}
.over:not(.sp):not(.avp):not(.sv-end)>.card>:nth-child(7){grid-row:7}
.over:not(.sp):not(.avp):not(.sv-end)>.card>:nth-child(8){grid-row:8}
.over:not(.sp):not(.avp):not(.sv-end)>.card>:nth-child(9){grid-row:9}
.over:not(.sp):not(.avp):not(.sv-end)>.card h2{font-size:1.55rem;line-height:1.05}
.over:not(.sp):not(.avp):not(.sv-end)>.card p{font-size:.92rem;line-height:1.25}
.over:not(.sp):not(.avp):not(.sv-end)>.card .row button{padding-block:9px}
.over:not(.sp):not(.avp):not(.sv-end){padding:8px}
.over .card .cl-bracket{gap:6px 12px;padding:0 2px 2px}
.over .card .cl-col{gap:5px}
.over .card .cl-col h5{font-size:.64rem}
.over .card .cl-p{padding:2px 8px;font-size:.78rem}
.over .card .cl-soloend{margin:0}
}
@media (max-height:700px) and (orientation:portrait){
.over:not(.sp):not(.avp):not(.sv-end)>.card>img{height:min(140px,18dvh)}
.over:not(.sp):not(.avp):not(.sv-end)>.card{max-height:calc(100dvh - 24px);overflow:auto}
}
'''
s = s.replace('</style>', css + '</style>')
open(p, 'w', encoding='utf-8').write(s); print('patched')
