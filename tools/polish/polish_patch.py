#!/usr/bin/env python3
"""Duel shadows fitted to each Hero pose + Print & Play parchment scrolls with an ornate frame (N8, 2026-11-05).
Usage: python3 tools/polish/polish_patch.py path/to/index.html|src.html   (edits in place; safe to run once)"""
import sys, base64, pathlib, subprocess
here = pathlib.Path(__file__).parent
p = pathlib.Path(sys.argv[1]); s = p.read_text()
if 'class="figbox"' in s: sys.exit('already patched')
def rep(old, new):
    global s
    assert s.count(old) == 1, ('not found once', old[:80]); s = s.replace(old, new)

# ---------- 1. ground shadows fitted to each Hero ----------
a = s.index('.arena:not(.boss) .fighter .figwrap{isolation:isolate}'); b = s.index('.fighter[data-p="0"]{--dir:1}')
s = s[:a] + '''.figbox{position:relative;display:block;height:calc(var(--scale,1) * 100%);max-width:100%;isolation:isolate;transform-origin:50% 100%}
.figbox>.fig{height:100%;max-width:none}
/* ground shadow fitted to each Hero pose: --shx = center offset, --shw = width, --sha = width/height, --sho = darkness (fractions of the art; N8 2026-11-05) */
.figbox::after{content:"";position:absolute;z-index:-1;bottom:3.4%;left:calc(50% + var(--sx,1) * var(--shx,0) * 100%);width:calc(var(--shw,.6) * 100%);aspect-ratio:var(--sha,5.5);translate:-50% 50%;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,var(--sho,.62)),rgba(0,0,0,calc(var(--sho,.62) * .45)) 55%,transparent);filter:blur(1.5px);pointer-events:none}
.fighter.active .figbox::before{content:"";position:absolute;z-index:-2;bottom:3.4%;left:calc(50% + var(--sx,1) * var(--shx,0) * 100%);width:calc(var(--shw,.6) * 125%);aspect-ratio:var(--sha,5.5);translate:-50% 50%;border-radius:50%;background:radial-gradient(closest-side,var(--c),transparent);opacity:.75;pointer-events:none}
''' + s[b:]
rep('.fighter.lunge .fig{animation:lunge .45s}\n.fighter.hit .fig{animation:shake .45s}',
    '.fighter.lunge .fig,.fighter.lunge .figbox{animation:lunge .45s}\n.fighter.lunge .figbox>.fig{animation:none}\n.fighter.hit .fig{animation:shake .45s}\n.fighter.hit .figbox{animation:shakebox .45s}\n@keyframes shakebox{20%{translate:-6px 0}40%{translate:6px 0}60%{translate:-4px 0}80%{translate:3px 0}}')
rep('<div class="figwrap"><img class="fig" alt=""></div><div class="ring" data-p="${p}">',
    '<div class="figwrap"><span class="figbox"><img class="fig" alt=""></span></div><div class="ring" data-p="${p}">')
rep("function figPose(el,f){const g=el.querySelector('.fig'),src=f.life<=0?LOSE[f.id]:IMG[f.id];if(g&&g.getAttribute('src')!==src)g.src=src}",
'''// Ground shadow per pose, in fractions of the art: x = shadow center, w = width, a = width/height, o = darkness (N8 2026-11-05: fit each Hero)
const SHADOW = {brawler:{x:.34,w:.66,a:5.5,o:.62},champion:{x:.39,w:.6,a:5.5,o:.62},maverick:{x:.385,w:.5,a:5,o:.6},soulseer:{x:.36,w:.7,a:5.5,o:.62},whisper:{x:.41,w:.78,a:7,o:.42},
  brawler_lose:{x:.36,w:.78,a:5,o:.62},champion_lose:{x:.48,w:.98,a:7.5,o:.55},maverick_lose:{x:.36,w:.76,a:6.5,o:.58},soulseer_lose:{x:.46,w:.84,a:7,o:.6},whisper_lose:{x:.39,w:.78,a:6,o:.6}};
function figPose(el,f){const g=el.querySelector('.fig'),lose=f.life<=0,src=lose?LOSE[f.id]:IMG[f.id];if(g&&g.getAttribute('src')!==src)g.src=src;
  const b=el.querySelector('.figbox'),d=SHADOW[f.id+(lose?'_lose':'')];if(b&&d){b.style.setProperty('--shx',d.x-.5);b.style.setProperty('--shw',d.w);b.style.setProperty('--sha',d.a);b.style.setProperty('--sho',d.o)}}''')

# ---------- 2. parchment scrolls like the Print & Play rulebook, with an ornate frame ----------
parch = base64.b64encode((here / 'scroll-parchment.webp').read_bytes()).decode()
corners = subprocess.run([sys.executable, str(here / 'frame_svgs.py')], capture_output=True, text=True, check=True).stdout.strip()
css = '''
/* parchment scrolls: torn-edge parchment painted like the Print & Play rulebook, ornate double frame (N8 2026-11-05) */
.scroll{box-sizing:border-box;--bw:34px;--fi:24px;''' + corners + '''
  padding:calc(var(--fi) + 10px) calc(var(--fi) + 10px);border-image:url(data:image/webp;base64,''' + parch + ''') 90 fill / var(--bw) stretch}
.scroll .rod{display:none}
.scroll::before{content:"";position:absolute;inset:var(--fi);z-index:1;border:1.5px solid #8f2f17;outline:1px solid #a97f2a;outline-offset:-5px;pointer-events:none}
.scroll::after{content:"";position:absolute;inset:calc(var(--fi) - 6px);z-index:1;pointer-events:none;background:var(--sc-corners);
  background-repeat:no-repeat;background-size:44px 44px,44px 44px,44px 44px,44px 44px,78px 16px,78px 16px;background-position:0 0,100% 0,0 100%,100% 100%,50% 0,50% 100%;
  background-origin:padding-box;translate:0 0}
.scroll::after{background-position:left top,right top,left bottom,right bottom,center 0,center 100%}
.paper{background:none;box-shadow:none;padding:6px 8px 0}
.sc-head h2{color:#8f2f17;letter-spacing:.02em}
.sc-head::after{content:"";display:block;width:min(60%,220px);height:1.5px;margin:6px auto 0;background:linear-gradient(90deg,transparent,#a97f2a 20%,#a97f2a 80%,transparent)}
.faces li:nth-child(odd){background:rgba(150,100,40,.09)}
.sc-foot{background:radial-gradient(48% 100% at 50% 100%,rgba(252,240,214,.95) 45%,rgba(252,240,214,0))}
.scroll .reveal{inset:calc(var(--fi) + 6px)}
@media (max-width:520px){.scroll{--bw:26px;--fi:17px;padding:calc(var(--fi) + 8px) calc(var(--fi) + 6px)}.scroll::after{background-size:34px 34px,34px 34px,34px 34px,34px 34px,62px 13px,62px 13px}.paper{padding:4px 4px 0}}
'''
rep('/* scroll reveal: the chosen result fills the scroll before it rolls up */', css + '/* scroll reveal: the chosen result fills the scroll before it rolls up */')
# compact landscape scrolls: thinner frame (appended after the landscape block so it wins)
css2 = '''@media (orientation:landscape) and (max-height:520px){.scroll{--bw:22px;--fi:13px;padding:calc(var(--fi) + 6px) calc(var(--fi) + 10px)}.scroll::after{background-size:28px 28px,28px 28px,28px 28px,28px 28px,52px 11px,52px 11px}.paper{padding:2px 4px 0}.scroll .reveal{inset:calc(var(--fi) + 4px)}}
'''
i = s.index('/* scrolls on short landscape screens (phone held sideways) */'); j = s.index('\n}\n', i) + 3
s = s[:j] + css2 + s[j:]
p.write_text(s); print('patched', p)
