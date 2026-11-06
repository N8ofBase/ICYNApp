# "Give the Gift of Crit!" banner on the Duel and Starvos setup screens (user 2026-11-06).
# Opens the Gift a Crit Pass panel. Also: ?giftpass opens it from an outside link
# (e.g. https://icyn.prismcortex.net/?giftpass for social posts).
# Needs unlock_patch.py first. Usage: python3 tools/gift_banner_patch.py index.html
import sys

CSS = r"""
/* Give the Gift of Crit! banner (2026-11-06) */
.giftban{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:14px;max-width:560px;width:calc(100% - 8px);margin:18px auto 0;padding:12px 16px;border-radius:14px;
  background:linear-gradient(100deg,#3a0f18 0%,#6b1a2a 45%,#7a5a1c 100%);border:1px solid rgba(224,184,98,.7);box-shadow:0 6px 18px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.05);
  color:#f3ead8;position:relative;overflow:hidden;text-align:left}
.giftban::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 35%,rgba(255,235,180,.22) 50%,transparent 65%);transform:translateX(-100%);animation:giftshine 4.5s ease-in-out infinite}
@keyframes giftshine{0%,60%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
.giftban:hover,.giftban:focus-visible{border-color:var(--gold);box-shadow:0 8px 22px rgba(0,0,0,.4),0 0 0 2px rgba(224,184,98,.45)}
.giftban svg{flex:0 0 auto;width:52px;height:52px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))}
.giftban .gb-t{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
.giftban b{font-family:var(--f-display);font-size:clamp(1.15rem,4.6vw,1.5rem);color:var(--gold);line-height:1.05;text-shadow:0 2px 0 #000;font-weight:400}
.giftban small{font-size:.85rem;opacity:.9}
.giftban .gb-go{flex:0 0 auto;font-weight:800;font-size:.8rem;letter-spacing:.04em;padding:6px 12px;border-radius:999px;background:var(--gold);color:#1d1708}
@media (max-width:420px){.giftban .gb-go{display:none}.giftban svg{width:44px;height:44px}}
@media (prefers-reduced-motion:reduce){.giftban::after{animation:none}}
"""

# An original gift box with a D20 tag, drawn inline.
SVG = ('<svg viewBox="0 0 64 64" aria-hidden="true">'
       '<rect x="9" y="27" width="40" height="30" rx="3" fill="#b8323f" stroke="#2a0a10" stroke-width="2"/>'
       '<rect x="6" y="20" width="46" height="10" rx="2.5" fill="#d0414f" stroke="#2a0a10" stroke-width="2"/>'
       '<rect x="25" y="20" width="8" height="37" fill="#e0b862" stroke="#2a0a10" stroke-width="1.5"/>'
       '<path d="M29 20c-6-9-15-8-14-2s9 3 14 2zM29 20c6-9 15-8 14-2s-9 3-14 2z" fill="#e0b862" stroke="#2a0a10" stroke-width="1.8"/>'
       '<path d="M52 30l9 5v10l-9 5-9-5V35z" fill="#f3ead8" stroke="#2a0a10" stroke-width="1.8"/>'
       '<path d="M52 30v6l9-1M52 36l-9-1M52 36l-5 10h10z" fill="none" stroke="#2a0a10" stroke-width="1"/>'
       '<text x="52" y="45" font-size="7" font-weight="800" text-anchor="middle" fill="#2a0a10" font-family="sans-serif">20</text>'
       '</svg>')

JS = r"""
// "Give the Gift of Crit!" banner (user 2026-11-06): opens the Gift a Crit Pass panel.
const giftBanner=()=>PAYWALL()?`<button class="giftban" data-giftban type="button">__SVG__<span class="gb-t"><b>Give the Gift of Crit!</b><small>Send a friend the Crit Pass: Online duels, Starvos and Print &amp; Play. $5.</small></span><span class="gb-go">Gift it</span></button>`:'';
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('[data-giftban]'))giftPanel()});
addEventListener('load',()=>{const q=new URLSearchParams(location.search);if(!q.has('giftpass')||!PAYWALL())return;q.delete('giftpass');history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:'')+location.hash);Promise.resolve(window.ICYNAuth&&ICYNAuth.ready).catch(()=>{}).then(()=>giftPanel())});
""".replace('__SVG__', SVG)

def patch(path):
    s = open(path, encoding='utf-8').read()
    if 'data-giftban' in s:
        print(path, 'already has the gift banner'); return
    assert 'function hasArena()' in s, 'run unlock_patch.py first'
    def r(a, b, n=1):
        nonlocal s
        assert s.count(a) == n, f'{path}: expected {n} of {a[:60]!r}, found {s.count(a)}'
        s = s.replace(a, b)
    r('</style>', CSS + '</style>')
    r('// Players who joined before the Crit Pass launched', JS.strip() + '\n// Players who joined before the Crit Pass launched')
    # Duel and Starvos setup screens: just above How to play
    r('<details class="how"', '${giftBanner()}<details class="how"', 2)
    open(path, 'w', encoding='utf-8').write(s); print(path, 'patched')

for p in sys.argv[1:]:
    patch(p)
