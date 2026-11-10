# "A Note from the Developer" (user 2026-11-10): a button on the Duel and Starvos setup screens
# that unrolls a parchment scroll with N8's note. Reuses the Calamity/Enhancement scroll styles.
# ?devnote opens it from an outside link. Usage: python3 tools/devnote_patch.py index.html
import sys

CSS = r"""
/* A Note from the Developer (2026-11-10) */
.devbtn{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:12px;max-width:560px;width:calc(100% - 8px);margin:14px auto 0;padding:10px 16px;border-radius:14px;
  background:linear-gradient(100deg,#f3e4c2,#e2cc9c);border:1px solid #a97f2a;box-shadow:0 6px 18px rgba(0,0,0,.3),inset 0 0 0 1px rgba(255,255,255,.35);color:#3b2410;text-align:left}
.devbtn:hover,.devbtn:focus-visible{border-color:#8f2f17;box-shadow:0 8px 22px rgba(0,0,0,.4),0 0 0 2px rgba(169,127,42,.5)}
.devbtn svg{flex:0 0 auto;width:46px;height:46px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))}
.devbtn .db-t{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0}
.devbtn b{font-family:var(--f-display);font-size:clamp(1.1rem,4.4vw,1.4rem);color:#8f2f17;line-height:1.05;font-weight:400}
.devbtn small{font-size:.85rem;opacity:.85}
.devbtn .db-go{flex:0 0 auto;font-weight:800;font-size:.8rem;letter-spacing:.04em;padding:6px 12px;border-radius:999px;background:#8f2f17;color:#f3ead8}
@media (max-width:420px){.devbtn .db-go{display:none}.devbtn svg{width:40px;height:40px}}
.scroll.devnote .dn-body{font-family:var(--f-title);font-size:1.02rem;line-height:1.5;color:var(--ink);padding:2px 6px}
.scroll.devnote .dn-body p{margin:0 0 .8em}
.scroll.devnote .dn-body p:first-child::first-letter{font-family:var(--f-display);font-size:2.6em;float:left;line-height:.85;margin:.06em .08em 0 0;color:#8f2f17}
.scroll.devnote .dn-body a,.scroll.devnote .dn-body .linkish{color:#8f2f17;font-weight:700;text-decoration:underline;text-underline-offset:2px}
.scroll.devnote .dn-body .linkish{all:unset;cursor:pointer;color:#8f2f17;font-weight:700;text-decoration:underline;text-underline-offset:2px}
.scroll.devnote .dn-n{font-family:var(--f-title);font-weight:700}
.scroll.devnote .dn-sig{text-align:right;font-family:var(--f-display);font-size:1.5rem;color:#8f2f17;margin:.2em 0 .4em}
@media (max-width:520px){.scroll.devnote .dn-body{font-size:.95rem;padding:0}}
"""

# An original rolled scroll with a wax seal, drawn inline.
SVG = ('<svg viewBox="0 0 64 64" aria-hidden="true">'
       '<rect x="12" y="12" width="40" height="40" rx="2" fill="#f3e4c2" stroke="#5a3a18" stroke-width="2"/>'
       '<rect x="6" y="6" width="52" height="9" rx="4.5" fill="#a06a35" stroke="#3d240c" stroke-width="2"/>'
       '<rect x="6" y="49" width="52" height="9" rx="4.5" fill="#a06a35" stroke="#3d240c" stroke-width="2"/>'
       '<path d="M19 23h26M19 29h26M19 35h18" stroke="#8a6a40" stroke-width="2" stroke-linecap="round"/>'
       '<circle cx="42" cy="41" r="6.5" fill="#8f2f17" stroke="#4a140a" stroke-width="1.5"/>'
       '<text x="42" y="44.2" font-size="8" font-weight="800" text-anchor="middle" fill="#f3d9a0" font-family="serif">N</text>'
       '</svg>')

JS = r"""
// A Note from the Developer (user 2026-11-10): N8's note on a parchment scroll.
const devNoteBtn=()=>`<button class="devbtn" data-devnote type="button">__SVG__<span class="db-t"><b>A Note from the Developer</b><small>How this game was born, and what comes next</small></span><span class="db-go">Read</span></button>`;
function devNote(){
  if(document.querySelector('.scroll.devnote'))return;
  const pass=PAYWALL()?'<button class="linkish" type="button" data-dn-pass>Crit Pass</button>':'<b>Crit Pass</b>';
  const ov=document.createElement('div');ov.className='scroll-ov';
  ov.innerHTML=`<div class="scroll devnote" role="dialog" aria-modal="true" aria-label="A Note from the Developer"><div class="rod"></div><div class="paper">
    <div class="sc-head"><div class="k">From the Developer</div><h2>A Note from N<span class="dn-n">8</span></h2></div>
    <div class="dn-body">
      <p>Greetings players! Thanks for trying out my game. I originally built this as a tabletop game that I created in my basement using laminated hero sheets and dry erase markers. It was inspired by my love of rolling D-20s and a battle mini-game at the Golden Saucer in OG Final Fantasy 7. I built all the rules and hero stats myself, then plugged them in to my good friend <a href="https://claude.ai" target="_blank" rel="noopener">Claude.ai</a> and we sculpted, tweaked, and deployed this live version. This is just the foundation. I have imagined a whole new universe of beings in a fantasy novel I am writing called, <i>Project Lightbringer</i>, and I want you to venture into that world by letting you create your own hero/role combinations to navigate the terrors on Talus with your trusty D-20 in: <b>Crit Quest</b>.</p>
      <p>That is a much bigger project, though, and I want to get local artists to help with characters and scenery. So. Please get the ${pass} and buy my boardgames @ <a href="https://beardedboardgames.com" target="_blank" rel="noopener">beardedboardgames.com</a> so we can spread the fun.</p>
      <p class="dn-sig">Love -N<span class="dn-n">8</span></p>
    </div>
    <div class="sc-foot"><button class="act" id="dn-ok">Close</button></div></div><div class="rod"></div></div>`;
  document.body.append(ov);
  let done=false;const close=async()=>{if(done)return;done=true;document.removeEventListener('keydown',key);ov.classList.add('closing');await sleep(REDUCED?50:450);ov.remove()};
  const key=e=>{if(e.key==='Escape')close()};document.addEventListener('keydown',key);
  ov.onclick=e=>{if(e.target===ov)close()};
  ov.querySelector('#dn-ok').onclick=close;ov.querySelector('#dn-ok').focus({preventScroll:true});
  const pb=ov.querySelector('[data-dn-pass]');if(pb)pb.onclick=()=>{close();hasArena()?toast('You already have the Crit Pass. Thank you!'):unlockPanel('any')};
}
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('[data-devnote]'))devNote()});
addEventListener('load',()=>{const q=new URLSearchParams(location.search);if(!q.has('devnote'))return;q.delete('devnote');history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:'')+location.hash);devNote()});
""".replace('__SVG__', SVG)

def patch(path):
    s = open(path, encoding='utf-8').read()
    if 'data-devnote' in s:
        print(path, 'already has the developer note'); return
    assert 'function unlockPanel(' in s, 'run unlock_patch.py first'
    def r(a, b, n=1):
        nonlocal s
        assert s.count(a) == n, f'{path}: expected {n} of {a[:60]!r}, found {s.count(a)}'
        s = s.replace(a, b)
    r('</style>', CSS + '</style>')
    r('// Players who joined before the Crit Pass launched', JS.strip() + '\n// Players who joined before the Crit Pass launched')
    # Duel and Starvos setup screens: just above How to play (under the gift banner)
    r('${giftBanner()}<details class="how"', '${giftBanner()}${devNoteBtn()}<details class="how"', 2)
    open(path, 'w', encoding='utf-8').write(s); print(path, 'patched')

for p in sys.argv[1:]:
    patch(p)
