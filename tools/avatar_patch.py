# Adds profile pictures to the game page (works on src.html or the built index.html, before or after unlock_patch.py).
# Signed-in players pick a Hero portrait, Starvos or an emblem (no uploads: user 2026-11-05).
# Usage: python3 tools/avatar_patch.py <file.html> [more.html ...]
import base64, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
def uri(f): return 'data:image/webp;base64,' + base64.b64encode(open(os.path.join(HERE, 'avatars', f), 'rb').read()).decode()

CSS = r"""
/* Profile pictures (2026-11-04) */
.av{--s:28px;position:relative;width:var(--s);height:var(--s);border-radius:50%;display:inline-grid;place-items:center;overflow:hidden;flex:none;box-sizing:border-box;border:1.5px solid var(--gold);background:radial-gradient(circle at 35% 30%,var(--a1,#3d3546),var(--a2,#1f1b25));color:var(--af,var(--gold));vertical-align:middle;line-height:1}
.av>b{font-family:var(--f-display);font-size:calc(var(--s)*.46);color:var(--gold);font-weight:700}
.av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.av svg{width:72%;height:72%}
.acct .avb{all:unset;cursor:pointer;border-radius:50%;display:inline-grid;line-height:0}
.acct .avb:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.acct .avb:hover .av{box-shadow:0 0 0 3px rgba(224,184,98,.35)}
.top .acct .avb{display:none}
@media (max-width:520px){.acct .avb~.nm{display:none}}
.sp-av{display:flex;align-items:center;gap:12px}
.sp-av>div{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
.sp-av small{color:var(--muted)}
.sp-board .av{margin-right:2px}
.over.avp{z-index:31}
.avp .card{gap:8px}
.avp-head{display:flex;align-items:center;gap:14px}
.avp-head h2{margin:0;font-family:var(--f-title);color:var(--gold);font-size:1.3rem}
.avp-head p{margin:2px 0 0;color:var(--muted);font-size:.86rem}
.avp-head .x{margin-left:auto;align-self:flex-start;background:none;border:0;color:var(--muted);font-size:1.1rem;cursor:pointer;padding:4px}
.avp h3{margin:6px 0 0;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-family:var(--f-body)}
.avp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(62px,1fr));gap:6px;justify-items:center}
.avp-o{all:unset;cursor:pointer;border-radius:50%;padding:3px;line-height:0;border:2px solid transparent;transition:transform .12s}
.avp-o:hover{transform:scale(1.06)}
.avp-o:focus-visible{outline:2px solid var(--text);outline-offset:1px}
.avp-o[aria-pressed="true"]{border-color:var(--text);box-shadow:0 0 0 3px rgba(224,184,98,.45)}
.avp-up{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.avp .avp-note{color:var(--muted)}
.avp .row{justify-content:flex-end;margin-top:4px}
"""

JS = r"""
// ---------- Profile pictures (user 2026-11-04) ----------
// Signed-in players pick a Hero portrait, Starvos or an emblem (no uploads, user 2026-11-05).
// Saved in prefs.avatar on the account (works with today's server). Values: 'h:<hero>' | 'i:<emblem>' |
// '' (first letter of the name). The leaderboard shows `avatar` per player once the server sends it.
// Emblems are original drawings for this game; Hero portraits are crops of the game's own Hero art.
const AV_HERO={brawler:"__AV_brawler__",champion:"__AV_champion__",maverick:"__AV_maverick__",soulseer:"__AV_soulseer__",whisper:"__AV_whisper__",starvos:IMG.starvosHead};
const AV_HERO_NAME={brawler:'Brawler',champion:'Champion',maverick:'Maverick',soulseer:'Soul Seer',whisper:'Whisper',starvos:'Starvos'};
const AV_ICONS=[
__ICONS__
];
const AV_KEY='icyn.avatar.';
function avStore(k,v){try{if(v===undefined)return localStorage.getItem(k);v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){return null}}
function avUid(){const u=window.ICYNAuth&&ICYNAuth.user&&ICYNAuth.user();return u?u.id:''}
function myAvatar(){const id=avUid();if(!id)return '';if(S.avUid!==id){S.avUid=id;S.avatar=avStore(AV_KEY+id)||''}return S.avatar||''}
function avTake(r){if(!r)return;const id=avUid();if(!id)return;const v='avatar' in r?r.avatar:(r.prefs&&r.prefs.avatar);if(typeof v!=='string')return;myAvatar();if(v===S.avatar)return;S.avatar=v;avStore(AV_KEY+id,v);renderAcct()}
function avHTML(v,size,name){
  const n=String(name||'').trim(),init=`<b aria-hidden="true">${esc((n[0]||'?').toUpperCase())}</b>`;
  let src='',sty=`--s:${size||28}px`,body=init,title='';
  if(/^h:/.test(v||'')&&AV_HERO[v.slice(2)]){src=AV_HERO[v.slice(2)];title=AV_HERO_NAME[v.slice(2)]}
  else if(/^i:/.test(v||'')){const i=AV_ICONS.find(x=>'i:'+x.id===v);if(i){sty+=`;--a1:${i.bg[0]};--a2:${i.bg[1]};--af:${i.fg}`;body=`<svg viewBox="0 0 64 64" aria-hidden="true">${i.svg}</svg>`;title=i.label}}
  if(src)body=init+`<img src="${esc(src)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`;
  return `<span class="av" style="${sty}"${title?` title="${esc(title)}"`:''}>${body}</span>`}
// save a choice ('' = first letter). Resolves, or throws a message for the player.
async function avSave(v){
  const id=avUid();if(!id||!window.ICYNStats)throw new Error('Sign in to save a profile picture.');
  const cur=await ICYNStats.me();if(!cur)throw new Error('Couldn’t save. Check your connection.');
  const r=await ICYNStats.setProfile({prefs:{...(cur.prefs||{}),avatar:v}});
  if(!r)throw new Error('Couldn’t save. Try again.');
  S.avatar=v;avStore(AV_KEY+id,v);renderAcct()}
function avatarPanel(after){
  document.querySelector('.over.avp')?.remove();
  if(!avUid()){toast('Sign in to choose a profile picture.');return}
  const name=(S.me&&S.me.name)||ICYNAuth.user().name||'';
  let pick=myAvatar(),busy=false;
  const opt=(v,label)=>`<button type="button" class="avp-o" data-v="${esc(v)}" aria-label="${esc(label)}" title="${esc(label)}">${avHTML(v,56,name)}</button>`;
  const o=document.createElement('div');o.className='over avp';
  o.innerHTML=`<div class="card wide" role="dialog" aria-modal="true" aria-label="Profile picture">
    <div class="avp-head"><span id="avp-prev"></span><div><h2>Profile picture</h2><p id="avp-msg" role="status">Pick the one that fits you best.</p></div><button type="button" class="x" aria-label="Close">✕</button></div>
    <h3>Heroes</h3><div class="avp-grid">${Object.keys(AV_HERO).map(k=>opt('h:'+k,AV_HERO_NAME[k])).join('')}</div>
    <h3>Emblems</h3><div class="avp-grid">${AV_ICONS.map(i=>opt('i:'+i.id,i.label)).join('')}</div>
    <div class="avp-up"><button type="button" class="avp-o" data-v="" aria-label="My first letter" title="My first letter">${avHTML('',56,name)}</button><small class="avp-note">Or keep the first letter of your name.</small></div>
    <div class="row"><button type="button" class="ghost" id="avp-cancel">Cancel</button><button type="button" class="act" id="avp-save">Save</button></div></div>`;
  document.body.append(o);
  const msg=t=>{o.querySelector('#avp-msg').textContent=t};
  const sync=()=>{o.querySelector('#avp-prev').innerHTML=avHTML(pick,72,name);
    o.querySelectorAll('.avp-o').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===pick))};
  const wire=()=>o.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{if(busy)return;pick=b.dataset.v;sync()});
  const close=()=>{o.remove();document.removeEventListener('keydown',esc_)};
  const esc_=e=>{if(e.key==='Escape')close()};document.addEventListener('keydown',esc_);
  o.querySelector('.x').onclick=close;o.querySelector('#avp-cancel').onclick=close;o.onclick=e=>{if(e.target===o)close()};
  o.querySelector('#avp-save').onclick=async()=>{if(busy)return;const b=o.querySelector('#avp-save');busy=true;b.textContent='Saving…';msg('Saving…');
    try{await avSave(pick);close();toast('Profile picture saved.');if(after)after()}
    catch(err){busy=false;b.textContent='Save';msg(err.message||'Couldn’t save. Try again.')}};
  wire();sync();o.querySelector('.avp-o[aria-pressed="true"]')?.focus()}
// every me() answer carries the account's picture
addEventListener('load',()=>{if(window.ICYNStats&&ICYNStats.me&&!ICYNStats.me.avWrapped){const me0=ICYNStats.me;ICYNStats.me=async(...a)=>{const r=await me0(...a);avTake(r);return r};ICYNStats.me.avWrapped=true}});
"""

def patch(path):
    s = open(path, encoding='utf-8').read()
    if 'function avatarPanel(' in s:
        print(path, 'already patched'); return

    def r(a, b, count=1):
        nonlocal s
        n = s.count(a)
        assert n == count, f'{path}: expected {count} of {a[:80]!r}, found {n}'
        s = s.replace(a, b)

    js = JS.replace('__ICONS__', ICONS)
    for k in ['brawler', 'champion', 'maverick', 'soulseer', 'whisper']:
        js = js.replace(f'__AV_{k}__', uri(f'{k}-av.webp'))
    r('</style>', CSS + '</style>')
    # the picture code sits just before renderAcct, so its load listener wraps me() before the account loads
    r("function renderAcct(){const el=$('#acct');", js.strip() + "\nfunction renderAcct(){const el=$('#acct');")
    # account bar: the picture (a button that opens the picker) before the name
    r("el.innerHTML=u?`${S.me?streakBadge(S.me.currentStreak):''}<span class=\"nm\">Signed in as</span>",
      "el.innerHTML=u?`${S.me?streakBadge(S.me.currentStreak):''}<button class=\"avb\" data-a=\"av\" aria-label=\"Change profile picture\" title=\"Profile picture\">${avHTML(myAvatar(),26,(S.me&&S.me.name)||u.name||u.email)}</button><span class=\"nm\">Signed in as</span>")
    r("b.onclick=()=>b.dataset.a==='stats'?statsPanel(u?'me':'wins'):",
      "b.onclick=()=>b.dataset.a==='av'?avatarPanel():b.dataset.a==='stats'?statsPanel(u?'me':'wins'):")
    # My Stats: picture row above the leaderboard name
    r('b.innerHTML=`<div class="sp-name"><label>Leaderboard name',
      'b.innerHTML=`<div class="sp-av">${avHTML(myAvatar(),56,st.name)}<div><b>Profile picture</b><small>Shows next to your name on the leaderboard</small></div><button class="ghost" id="sp-av">Change</button></div><div class="sp-name"><label>Leaderboard name')
    r("b.querySelector('#sp-save').onclick=async()=>{",
      "b.querySelector('#sp-av').onclick=()=>avatarPanel(()=>{if(o.isConnected)show('me')});b.querySelector('#sp-save').onclick=async()=>{")
    # leaderboard: the API answers with a plain list; each row gets the player's picture
    r("const ps=(r&&r.players)||[];", "const ps=Array.isArray(r)?r:(r&&r.players)||[];")
    # match history also comes back as a plain list
    r("(h&&h.matches)||[]", "(Array.isArray(h)?h:(h&&h.matches)||[])", 2)
    r('<span class="rk">${x.rank}</span>',
      '<span class="rk">${x.rank}</span>${(()=>{const mine=!!(me&&(x.id===me.id||x.name===(S.me&&S.me.name)));return avHTML(mine?myAvatar():x.avatar,24,x.name)})()}')
    assert '__AV_' not in s
    open(path, 'w', encoding='utf-8').write(s)
    print(path, 'patched')

ICONS = r"""// Each: id, label, two background colors, SVG body in a 64x64 box (fill/stroke use currentColor = the emblem color).

 {id:'d20',label:'Natural 20',bg:['#5a2a7a','#2a1238'],fg:'#f3d27a',svg:'<path d="M32 6 54 19v26L32 58 10 45V19z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M32 6 20 30h24zM20 30 10 19M44 30l10-11M20 30 10 45M44 30l10 15M20 30l12 28 12-28M32 58V58" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" opacity=".7"/><text x="32" y="27.5" font-size="11" font-weight="900" text-anchor="middle" fill="currentColor" font-family="Georgia,serif">20</text>'},
 {id:'swords',label:'Crossed swords',bg:['#7a2232','#3a0f18'],fg:'#f0e2c4',svg:'<g stroke="currentColor" stroke-linecap="round" fill="none"><path d="M12 10 40 38M52 10 24 38" stroke-width="5"/><path d="M12 10l3 0M52 10" stroke-width="5"/><path d="M34 44l10-10M30 44 20 34" stroke-width="4"/><path d="M41 41l8 8M23 41l-8 8" stroke-width="5"/></g><circle cx="51" cy="51" r="4" fill="currentColor"/><circle cx="13" cy="51" r="4" fill="currentColor"/>'},
 {id:'shield',label:'Shield',bg:['#b08a2c','#5a4210'],fg:'#fff3d0',svg:'<path d="M32 7 52 14v15c0 14-9 23-20 28C21 52 12 43 12 29V14z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/><path d="M20 26l12 10 12-10v8L32 44 20 34z" fill="currentColor"/>'},
 {id:'crown',label:'Crown',bg:['#8a6a1a','#3d2c06'],fg:'#ffd56b',svg:'<path d="M10 22l11 10 11-16 11 16 11-10-5 26H15z" fill="currentColor"/><rect x="15" y="50" width="34" height="5" rx="1.5" fill="currentColor"/><circle cx="10" cy="20" r="3" fill="currentColor"/><circle cx="54" cy="20" r="3" fill="currentColor"/><circle cx="32" cy="13" r="3" fill="currentColor"/><circle cx="32" cy="38" r="3.5" fill="#7a2232"/>'},
 {id:'skull',label:'Skull',bg:['#3a3540','#141218'],fg:'#ece4d4',svg:'<path d="M32 8c-12 0-20 8-20 19 0 6 3 10 6 12v8h6v-5h4v5h8v-5h4v5h6v-8c3-2 6-6 6-12 0-11-8-19-20-19z" fill="currentColor"/><circle cx="24" cy="28" r="5.5" fill="#141218"/><circle cx="40" cy="28" r="5.5" fill="#141218"/><path d="M32 33l-3 6h6z" fill="#141218"/>'},
 {id:'flame',label:'Flame',bg:['#b5401c','#4a1206'],fg:'#ffcf6a',svg:'<path d="M33 6c2 9 13 14 13 28 0 10-7 18-14 18s-14-7-14-17c0-8 5-12 7-17 1 5 3 7 5 8-1-8 1-14 3-20z" fill="currentColor"/><path d="M32 30c1 5 7 8 7 14 0 5-3 8-7 8s-7-3-7-8c0-4 3-6 4-9 1 2 2 3 3 3 0-3-1-5 0-8z" fill="#b5401c" opacity=".8"/>'},
 {id:'eye',label:'Seer’s eye',bg:['#1c6e70','#082a2b'],fg:'#bff6ee',svg:'<path d="M6 32c7-11 16-16 26-16s19 5 26 16c-7 11-16 16-26 16S13 43 6 32z" fill="none" stroke="currentColor" stroke-width="3.5"/><circle cx="32" cy="32" r="9" fill="currentColor"/><circle cx="32" cy="32" r="4" fill="#082a2b"/><path d="M32 6v6M14 11l4 5M50 11l-4 5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'},
 {id:'bow',label:'Bow and arrow',bg:['#626e2e','#262c0e'],fg:'#f2e6bf',svg:'<path d="M18 8c18 6 24 30 6 48" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M18 8 24 56" stroke="currentColor" stroke-width="1.5" opacity=".8"/><path d="M12 32h40" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M54 32l-9-6v12z" fill="currentColor"/><path d="M12 32l-4-5M12 32l-4 5M16 32l-4-5M16 32l-4 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'},
 {id:'moon',label:'Moon and stars',bg:['#2f3a6a','#0e1230'],fg:'#e9e3ff',svg:'<path d="M38 10a22 22 0 1 0 16 34A18 18 0 0 1 38 10z" fill="currentColor"/><path d="M46 14l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5zM54 28l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill="currentColor"/>'},
 {id:'bolt',label:'Lightning',bg:['#46506a','#161a26'],fg:'#ffe36b',svg:'<path d="M37 5 15 36h14l-4 23 24-34H35z" fill="currentColor" stroke="#161a26" stroke-width="1" stroke-linejoin="round"/>'},
 {id:'potion',label:'Potion',bg:['#7a2232','#2c0a12'],fg:'#f3ead8',svg:'<path d="M26 8h12v4h-2v10c8 3 13 10 13 18 0 10-8 17-17 17S15 50 15 40c0-8 5-15 13-18V12h-2z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M18.5 40h27c0 8-6 13-13.5 13S18.5 48 18.5 40z" fill="#e0475a"/><circle cx="27" cy="45" r="2" fill="#fff" opacity=".7"/>'},
 {id:'claw',label:'Dragon claw',bg:['#8a1c14','#2a0604'],fg:'#ffb08a',svg:'<path d="M18 8c-2 18 4 34 18 48-6-16-8-30-6-46zM32 6c-2 18 3 32 15 46-4-14-6-28-4-44zM46 10c-1 12 1 24 9 34-2-10-3-22-1-32z" fill="currentColor"/>'},
{id:'d6',label:'Six-sided die',bg:['#2d5a8a','#0e2238'],fg:'#f3ead8',svg:'<rect x="12" y="12" width="40" height="40" rx="8" fill="currentColor"/><g fill="#0e2238"><circle cx="22" cy="22" r="4"/><circle cx="42" cy="22" r="4"/><circle cx="22" cy="32" r="4"/><circle cx="42" cy="32" r="4"/><circle cx="22" cy="42" r="4"/><circle cx="42" cy="42" r="4"/></g>'},
 {id:'axe',label:'Battle axe',bg:['#6a3a22','#26120a'],fg:'#e8dcc4',svg:'<path d="M30 6h4v52h-4z" fill="#b98a55"/><path d="M34 10c10 0 18 6 20 16-6-2-12-2-20 2zM30 10c-10 0-18 6-20 16 6-2 12-2 20 2z" fill="currentColor"/><path d="M34 28c8-4 14-4 20-2-2 10-10 16-20 16zM30 28c-8-4-14-4-20-2 2 10 10 16 20 16z" fill="currentColor" opacity=".8"/>'},
 {id:'hammer',label:'War hammer',bg:['#5a5f6a','#1d2026'],fg:'#f0e6d0',svg:'<rect x="29" y="22" width="6" height="36" rx="2" fill="#b98a55"/><rect x="12" y="8" width="40" height="16" rx="3" fill="currentColor"/><rect x="18" y="11" width="28" height="3" rx="1.5" fill="#1d2026" opacity=".35"/><circle cx="32" cy="58" r="3" fill="currentColor"/>'},
 {id:'helm',label:'Knight’s helm',bg:['#5c6470','#20242b'],fg:'#e8e4da',svg:'<path d="M32 8c-12 0-20 9-20 22v24h40V30C52 17 44 8 32 8z" fill="currentColor"/><path d="M18 30h28v5H18zM30 35h4v14h-4z" fill="#20242b"/><path d="M32 8V2" stroke="#c23b3b" stroke-width="5" stroke-linecap="round"/>'},
 {id:'heart',label:'Heart',bg:['#8a1f3d','#300814'],fg:'#ff8fa8',svg:'<path d="M32 54C14 41 8 32 8 23c0-7 5-13 12-13 5 0 9 3 12 7 3-4 7-7 12-7 7 0 12 6 12 13 0 9-6 18-24 31z" fill="currentColor"/><path d="M18 20c2-3 5-4 8-3" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5" fill="none"/>'},
 {id:'gem',label:'Gem',bg:['#1f6a5a','#06261f'],fg:'#8ff2d6',svg:'<path d="M20 12h24l12 14-24 30L8 26z" fill="currentColor"/><path d="M8 26h48M20 12l6 14 6 30 6-30 6-14M26 26l6-14 6 14" fill="none" stroke="#06261f" stroke-width="2" opacity=".5" stroke-linejoin="round"/>'},
 {id:'key',label:'Key',bg:['#7a5a1a','#2e2006'],fg:'#ffd56b',svg:'<circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" stroke-width="5"/><path d="M28 28l24 24M42 42l6-6M48 48l6-6" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>'},
 {id:'scroll',label:'Scroll',bg:['#7a6440','#2e2412'],fg:'#f5ead2',svg:'<path d="M16 14h32v34a6 6 0 0 1-6 6H18" fill="currentColor"/><circle cx="16" cy="18" r="6" fill="currentColor"/><path d="M12 48a6 6 0 0 0 6 6h24a6 6 0 0 1-6-6z" fill="#d8c49c"/><path d="M24 24h18M24 31h18M24 38h12" stroke="#7a6440" stroke-width="2.5" stroke-linecap="round"/>'},
 {id:'hourglass',label:'Hourglass',bg:['#4a3a6a','#1a1228'],fg:'#f0d38a',svg:'<path d="M16 8h32M16 56h32" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M20 10c0 12 10 16 10 22s-10 10-10 22h24c0-12-10-16-10-22s10-10 10-22z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M25 20h14c-2 5-7 8-7 8s-5-3-7-8zM22 52c1-6 6-9 10-11 4 2 9 5 10 11z" fill="currentColor"/>'},
 {id:'sun',label:'Sun',bg:['#b8792a','#4a2a06'],fg:'#fff0a8',svg:'<circle cx="32" cy="32" r="11" fill="currentColor"/><g stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M32 6v8M32 50v8M6 32h8M50 32h8M13.6 13.6l5.6 5.6M44.8 44.8l5.6 5.6M13.6 50.4l5.6-5.6M44.8 19.2l5.6-5.6"/></g>'},
 {id:'tower',label:'Tower',bg:['#4a5560','#181e24'],fg:'#e6e0d2',svg:'<path d="M18 8h6v6h5V8h6v6h5V8h6v12l-4 4v32H22V24l-4-4z" fill="currentColor"/><path d="M28 56V44a4 4 0 0 1 8 0v12zM30 28h4v8h-4z" fill="#181e24"/>'},
 {id:'paw',label:'Beast paw',bg:['#5a4a2a','#201808'],fg:'#f0dcb4',svg:'<ellipse cx="32" cy="42" rx="13" ry="11" fill="currentColor"/><ellipse cx="16" cy="28" rx="5" ry="7" fill="currentColor" transform="rotate(-20 16 28)"/><ellipse cx="26" cy="18" rx="5" ry="7" fill="currentColor"/><ellipse cx="38" cy="18" rx="5" ry="7" fill="currentColor"/><ellipse cx="48" cy="28" rx="5" ry="7" fill="currentColor" transform="rotate(20 48 28)"/>'},
"""

for p in sys.argv[1:]:
    patch(p)
