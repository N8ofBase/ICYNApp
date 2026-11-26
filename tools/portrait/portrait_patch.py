"""Upright phones in the browser (N8 2026-11-26): the duel shows the arena, the Chronicle and an
action bar with the D20 under it. Hero sheets and the Round Table move into the Tables popup.
The C&E scroll fits all 20 rows on an upright phone. Idempotent."""
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
MARK = '/* portrait-duel: '
if MARK in s: print('already patched'); sys.exit()

def rep(old, new):
    global s
    assert s.count(old) == 1, 'anchor not found: ' + old[:60]
    s = s.replace(old, new)

# 1) a "tall" view for upright phones (duels only; Starvos keeps its own screen)
rep("function setLayout(v){",
    "const TALL=matchMedia('(orientation:portrait) and (max-width:640px)');const tallView=()=>TALL.matches&&!fullView();\n"
    "TALL.addEventListener?.('change',()=>{if(S.screen==='duel')applyLayout()});\n"
    "function setLayout(v){")
# 2) applyLayout: in tall view the Round Table lives in the Tables popup and the D20 sits in a bar under the Chronicle
rep("$('#tolayout').textContent=full?'Show tables beside the arena':'Full-screen arena';$('#tolayout').hidden=!BIG.matches}",
    "$('#tolayout').textContent=full?'Show tables beside the arena':'Full-screen arena';$('#tolayout').hidden=!BIG.matches;\n"
    "  const tall=tallView();d.classList.toggle('tall',tall);if(!tall&&!full)d.classList.remove('sheets-open');\n"
    "  const rtc=d.querySelector('.rtcard'),act=$('#act');if(tall&&rtc)d.querySelector('.sidecol').append(rtc);\n"
    "  let bar=d.querySelector('.actbar');if(tall&&!bar){bar=document.createElement('div');bar.className='actbar';d.querySelector('.log').after(bar)}\n"
    "  if(act){if(tall)bar.append(act);else{const ro=$('#readout');ro&&ro.before(act)}}if(!tall&&bar)bar.remove()}")
# 3) the Tables button opens the popup in tall view too
rep("function openSheets(p,what){if(!fullView())return;",
    "function openSheets(p,what){if(!fullView()&&!tallView())return;")

# 4) Install app button at the top of the start screen (N8 2026-11-26); Android without a prompt gets menu steps
a = s.index('function renderSetup(){'); b0 = s.index('<div class="setup"><div class="setup-acct"><span class="acct" id="acct" hidden></span></div>', a)
s = s[:b0] + s[b0:].replace('<div class="setup"><div class="setup-acct"><span class="acct" id="acct" hidden></span></div>',
    '<div class="setup"><div class="setup-acct">${!APP&&document.querySelector(\'link[rel="manifest"]\')?\'<button class="ghost inst-top" id="install-top">Install app</button>\':\'\'}<span class="acct" id="acct" hidden></span></div>', 1)
rep("if($('#install'))$('#install').onclick=installApp;",
    "if($('#install'))$('#install').onclick=installApp;if($('#install-top'))$('#install-top').onclick=installApp;")
rep("<p>1. Tap the <b>Share</b> button in Safari (the square with an arrow).</p><p>2. Choose <b>Add to Home Screen</b>, then <b>Add</b>.</p>",
    "${IOS?'<p>1. Tap the <b>Share</b> button in Safari (the square with an arrow).</p><p>2. Choose <b>Add to Home Screen</b>, then <b>Add</b>.</p>':'<p>1. Open your browser menu (the <b>⋮</b> dots at the top right in Chrome).</p><p>2. Choose <b>Install app</b> or <b>Add to Home screen</b>, then <b>Install</b>.</p>'}")

css = MARK + '''upright phone duel: arena, Chronicle, D20 action bar; sheets + Round Table in the Tables popup (N8 2026-11-26) */
.duel.tall>.sidecol{display:none;position:fixed;inset:0;z-index:40;background:rgba(5,3,8,.72);padding:max(12px,env(safe-area-inset-top,0px)) 12px 12px;overflow:auto;flex-direction:column;align-items:stretch;gap:12px}
.duel.tall.sheets-open>.sidecol{display:flex}
.duel.tall .sidecol .sc-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;position:sticky;top:0;z-index:2;background:var(--stone);border:1px solid var(--line);border-radius:12px;padding:8px 12px}
.duel.tall .sidecol .sc-bar b{display:block;flex:1}
.duel.tall .sidecol .sc-bar #tolayout{display:none}
.duel.tall .sidecol .sc-bar .x{display:grid}
.duel.tall .sidecol .log{display:none}
body:has(.duel.tall) .top-actions #tables{display:inline-flex}
body:has(.duel.tall) .top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 8px}
body:has(.duel.tall) .top .logo{font-size:1.1rem;gap:8px;min-width:0}
body:has(.duel.tall) .top .logo .mark{width:40px}
body:has(.duel.tall) .top .logo>span{white-space:nowrap;min-width:0}
body:has(.duel.tall) .top .logo small{white-space:normal;font-size:.56rem;line-height:1.3}
body:has(.duel.tall) .top-actions{gap:6px}
body:has(.duel.tall) .top-actions .ghost{padding:5px 10px;font-size:.8rem;white-space:nowrap}
body:has(.duel.tall) .top .acct{display:none}
body:has(.duel.tall) .top-actions #chron{display:none}
.duel.tall .arena{aspect-ratio:1/1.08;max-height:58vh}
.duel.tall .log ol{margin-bottom:0}
.duel.tall .actbar{order:3;position:sticky;bottom:0;z-index:20;display:flex;justify-content:center;padding:8px 0 calc(8px + env(safe-area-inset-bottom,0px));margin:0 -4px;background:linear-gradient(rgba(12,10,15,0),rgba(12,10,15,.92) 30%)}
.duel.tall .actbar .act-d20{position:static;translate:none;flex-direction:row;gap:12px;width:auto;max-width:100%;pointer-events:auto}
.duel.tall .actbar .act-d20:disabled{display:flex}
.duel.tall .actbar .act-d20 .d20b{width:56px;height:56px}
.duel.tall .actbar .act-d20 .lbl{font-size:.95rem;padding:6px 12px;text-align:left}
.duel.tall .actbar .act-d20 .who{display:block;font-size:.58rem}
.setup-acct{align-items:center;gap:8px}
.setup-acct .inst-top{margin-right:auto;padding:5px 12px;font-size:.85rem}
.setup-acct button{white-space:nowrap}
@media (max-width:480px){.setup-acct{flex-wrap:wrap;row-gap:6px}.setup-acct button{padding:5px 10px;font-size:.8rem}}
@media (orientation:portrait) and (max-width:640px){
.scroll .faces li{font-size:clamp(.74rem,1.85vh,.92rem);line-height:1.15;padding:2px 7px}
.scroll .sc-head h2{font-size:1.25rem}
.scroll .sc-foot{padding:4px 0 6px}
.scroll .sc-die .die{--sz:40px}
}
'''
rep('</style>', css + '</style>')
open(p, 'w', encoding='utf-8').write(s); print('patched')
