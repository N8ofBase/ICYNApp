# Adds the $5 Crit Pass unlock to the game page (works on src.html or the built index.html).
# Free: Vs Computer + Pass & Play duels. Unlock: Online duels, Starvos Catastrophe, Print & Play files.
# Usage: python3 tools/unlock_patch.py <file.html> [more.html ...]
import sys

CSS = r"""
/* $5 Crit Pass unlock (2026-11-04) */
.lock{display:inline-block;margin-left:6px;font-size:.66rem;font-weight:800;letter-spacing:.03em;padding:1px 6px;border-radius:999px;background:rgba(224,184,98,.16);color:var(--gold);border:1px solid rgba(224,184,98,.5);vertical-align:1px}
.mode button[aria-pressed="true"] .lock{background:rgba(0,0,0,.18);color:var(--ink);border-color:rgba(0,0,0,.35)}
.unlock{max-width:440px;margin:18px auto 0;display:grid;gap:10px;text-align:center;padding:16px;border:1px solid rgba(224,184,98,.45);border-radius:14px;background:linear-gradient(rgba(224,184,98,.08),rgba(224,184,98,.02))}
.unlock .ul-k{margin:0;font-family:var(--f-title);color:var(--gold);font-size:1.1rem}
.unlock p{margin:0}
.unlock .ul-perks{margin:0;padding:0;list-style:none;display:grid;gap:6px;text-align:left}
.unlock .ul-perks li{padding-left:22px;position:relative}
.unlock .ul-perks li::before{content:"✦";position:absolute;left:4px;color:var(--gold)}
.unlock .row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.unlock small{color:var(--muted)}
.over .card .unlock{margin:0;border:0;background:none;padding:0}
.pnp-files{display:grid;gap:8px}
.unlock .ul-more{font-size:.9rem;color:var(--muted)}
.unlock input{font:inherit;font-weight:800;letter-spacing:.08em;text-align:center;text-transform:uppercase;padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:#120f16;color:var(--text);width:13em;max-width:100%}
.gift-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.gift-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.gift-row code,.gift-code code{font-weight:800;letter-spacing:.06em;color:var(--gold)}
.gift-row span{flex:1;color:var(--muted);font-size:.85rem}.gift-row.used code{color:var(--muted);text-decoration:line-through}
.gift-code{font-size:1.4rem;margin:4px 0}
.pnp-files a{display:block;box-sizing:border-box;width:100%;max-width:100%;text-align:center;text-decoration:none}
"""

JS = r"""
// ---------- $5 Crit Pass unlock (user 2026-11-04) ----------
// Free: Vs Computer and Pass & Play. Unlock (one time, tied to the account): Online duels,
// the Starvos Catastrophe, and the Print & Play files. The server checks it too (online games, file links).
// Without the live site's account scripts (the claude.ai preview) everything stays open.
const PAYWALL=()=>!!(window.ICYNAuth&&window.ICYNStats&&ICYNStats.checkout);
const UNLOCK_KEY='icyn.unlock';
function hasArena(){if(!PAYWALL()||S.unlocked)return true;const u=signedIn()&&ICYNAuth.user();try{return !!u&&localStorage.getItem(UNLOCK_KEY)===u.id}catch(e){return false}}
function setUnlocked(on){S.unlocked=!!on;const u=signedIn()&&ICYNAuth.user();try{if(on&&u)localStorage.setItem(UNLOCK_KEY,u.id);else if(!on)localStorage.removeItem(UNLOCK_KEY)}catch(e){}}
const lockTag=()=>hasArena()?'':' <span class="lock">$5</span>';
const UL_WHY={online:'Duel your friends online',starvos:'Face the Starvos Catastrophe',pnp:'Print & Play files',any:'Get the Crit Pass'};
function unlockCard(why){const s=signedIn();
  return `<div class="unlock"><p class="ul-k">${esc(UL_WHY[why]||UL_WHY.any)}</p>
    <p>The <b>Crit Pass</b> is a one-time <b>$5</b> unlock, yours for good:</p>
    <ul class="ul-perks"><li><b>Online duels</b> with friends on any device</li><li><b>The Starvos Catastrophe</b>, alone or with up to 4 friends</li><li><b>Print &amp; Play</b> rulebook and Hero sheets (PDF)</li></ul>
    <p><small>Vs Computer and Pass &amp; Play stay free forever.</small></p>
    ${s?`<div class="row"><button class="act" data-ul="buy">Get the Crit Pass · $5</button></div><small>Secure checkout by Square. The Crit Pass stays with your account on every device.</small>`
      :`<p>First, sign in so the Crit Pass stays with you on every device.</p><div class="row"><button class="act" data-ul="up">Create account</button><button class="ghost" data-ul="in">Sign in</button></div>`}
    <p class="ul-more"><button class="linkish" data-ul="gift">Gift one to a friend</button> · <button class="linkish" data-ul="code">Have a code?</button></p></div>`}
function wireUnlock(root){root.querySelectorAll('[data-ul]').forEach(b=>b.onclick=()=>{const a=b.dataset.ul;if(a==='in')ICYNAuth.signIn();else if(a==='up')ICYNAuth.signUp();else if(a==='gift')giftPanel();else if(a==='code')redeemPanel();else if(a==='giftbuy')buyArena(b,true);else buyArena(b)})}
async function buyArena(b,gift){b.disabled=true;const t=b.textContent;b.textContent='Opening checkout…';
  const r=await ICYNStats.checkout(gift);if(r&&r.url){location.assign(r.url);return}
  if(r&&r.unlocked){setUnlocked(true);document.querySelector('.over.ul')?.remove();toast('You already have the Crit Pass.');if(S.screen==='setup')renderSetup();return}
  b.disabled=false;b.textContent=t;toast('Checkout could not open. Please try again in a moment.')}
function arenaPanel(title,body){document.querySelector('.over.ul')?.remove();
  const o=document.createElement('div');o.className='over sp ul';o.innerHTML=`<div class="card wide" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sp-tabs"><b class="pv-t">${esc(title)}</b><button class="x" aria-label="Close">✕</button></div><div class="sp-body">${body}</div></div>`;
  o.querySelector('.x').onclick=()=>o.remove();o.onclick=e=>{if(e.target===o)o.remove()};document.body.append(o);return o}
function unlockPanel(why){const o=arenaPanel('Crit Pass',unlockCard(why));wireUnlock(o)}
async function pnpPanel(){if(!hasArena())return unlockPanel('pnp');
  const o=arenaPanel('Print & Play','<p>Fetching your files…</p>'),b=o.querySelector('.sp-body');
  const r=await ICYNStats.pnpFiles();if(!o.isConnected)return;
  if(!r||!r.files){b.innerHTML='<p>The files could not be fetched. Please try again in a moment.</p>';return}
  b.innerHTML=`<p>Print these at home and play I Crit You Not! at the table with a D20 and a few D6. Links last 15 minutes; come back here anytime for fresh ones.</p><div class="pnp-files">${r.files.map(f=>`<a class="act" href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)} (PDF)</a>`).join('')}</div>`}
// Back from Square checkout: ?unlock=done (Square may add orderId/transactionId; the server looks up the player's own order)
// Gift codes: buy a Crit Pass for someone else; they redeem the code on their own account.
const GIFT_KEY='icyn.gift';
const giftLink=c=>location.origin+'/?gift='+encodeURIComponent(c);
function copyText(t,b){try{navigator.clipboard.writeText(t);if(b){const o=b.textContent;b.textContent='Copied';setTimeout(()=>b.textContent=o,1500)}}catch(e){toast(t)}}
function giftRow(g){return `<li class="gift-row${g.redeemed?' used':''}"><code>${esc(g.code)}</code><span>${g.redeemed?'Redeemed':'Not used yet'}</span>${g.redeemed?'':`<button class="ghost" data-copy="${esc(giftLink(g.code))}">Copy link</button>`}</li>`}
function wireCopy(root){root.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copyText(b.dataset.copy,b))}
async function giftPanel(){const s=signedIn();
  const o=arenaPanel('Gift a Crit Pass',`<div class="unlock"><p class="ul-k">Give a friend the Crit Pass</p>
    <p>Pay <b>$5</b> and you get a one-time code. Send it to anyone. When they redeem it, the Crit Pass (Online duels, the Starvos Catastrophe and the Print &amp; Play files) unlocks on their account.</p>
    ${s?'<div class="row"><button class="act" data-ul="giftbuy">Buy a gift · $5</button></div><small>Secure checkout by Square. Buy as many as you like.</small>':'<p>First, sign in so your gift codes are saved to your account.</p><div class="row"><button class="act" data-ul="up">Create account</button><button class="ghost" data-ul="in">Sign in</button></div>'}</div>
    ${s?'<h3>Your gift codes</h3><ul class="gift-list"><li>Loading…</li></ul>':''}`);
  wireUnlock(o);if(!s)return;const r=await ICYNStats.gifts();const ul=o.querySelector('.gift-list');if(!ul||!o.isConnected)return;
  const gs=(r&&r.gifts)||[];ul.innerHTML=gs.length?gs.map(giftRow).join(''):'<li>None yet. Codes you buy show up here.</li>';wireCopy(ul)}
function redeemPanel(pre){const s=signedIn();if(pre)try{sessionStorage.setItem(GIFT_KEY,pre)}catch(e){}
  const o=arenaPanel('Redeem a code',`<div class="unlock"><p class="ul-k">${pre?'Someone gifted you a Crit Pass!':'Have a Crit Pass code?'}</p>
    ${s?`<p>Enter the code to unlock Online duels, the Starvos Catastrophe and the Print &amp; Play files on your account.</p><div class="row"><input id="gift-code" maxlength="14" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CRIT-XXXX-XXXX" value="${esc(pre||'')}"><button class="act" id="gift-go">Redeem</button></div><p class="nb-err" id="gift-err" role="alert" hidden></p>`
      :'<p>Sign in or create a free account to claim it. Your code is kept while you sign in.</p><div class="row"><button class="act" data-ul="up">Create account</button><button class="ghost" data-ul="in">Sign in</button></div>'}</div>`);
  wireUnlock(o);if(!s)return;const inp=o.querySelector('#gift-code'),go=o.querySelector('#gift-go'),er=o.querySelector('#gift-err');
  const run=async()=>{const c=inp.value.trim();if(!c)return;go.disabled=true;er.hidden=true;const r=await ICYNStats.redeemGift(c);go.disabled=false;
    if(r&&r.unlocked){try{sessionStorage.removeItem(GIFT_KEY)}catch(e){}setUnlocked(true);refreshMe();if(S.screen==='setup')renderSetup();welcomePass('A friend gifted you the Crit Pass.');return}
    er.textContent=(r&&r.error)||'That code could not be redeemed right now. Please try again.';er.hidden=false};
  go.onclick=run;inp.onkeydown=e=>{if(e.key==='Enter')run()};inp.focus()}
function welcomePass(extra){const o=arenaPanel('Crit Pass unlocked',`<p class="herald">“Hear ye! A new Crit Pass holder walks among us!”</p><p>${extra?esc(extra)+' ':''}Online duels, the Starvos Catastrophe and the Print &amp; Play files are yours. Thank you for supporting I Crit You Not!</p><div class="row"><button class="act" id="ul-pnp">Get the Print &amp; Play files</button></div>`);o.querySelector('#ul-pnp').onclick=()=>pnpPanel()}
// ?gift=CODE opens the redeem panel (the code survives the sign-in round trip in sessionStorage)
async function giftArrive(){if(!PAYWALL())return;const q=new URLSearchParams(location.search);let c=q.get('gift');
  if(c){q.delete('gift');history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:'')+location.hash)}else try{c=sessionStorage.getItem(GIFT_KEY)}catch(e){}
  if(!c)return;try{await ICYNAuth.ready}catch(e){}redeemPanel(c)}
async function unlockReturn(){const q=new URLSearchParams(location.search),st=q.get('unlock');if(!st||!PAYWALL())return;
  for(const k of ['unlock','orderId','transactionId','checkoutId','referenceId'])q.delete(k);history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:'')+location.hash);
  if(st!=='done'&&st!=='gift'){toast('Checkout cancelled. Nothing was charged.');return}
  try{await ICYNAuth.ready}catch(e){}
  for(let i=0;i<8;i++){const r=await ICYNStats.confirmCheckout();
    if(st==='gift'&&r&&r.gift){const o=arenaPanel('Your gift is ready',`<div class="unlock"><p class="ul-k">Thank you for gifting a Crit Pass!</p><p>Send this code or link to your friend. It works once, on any account.</p><p class="gift-code"><code>${esc(r.gift)}</code></p><div class="row"><button class="act" data-copy="${esc(giftLink(r.gift))}">Copy gift link</button><button class="ghost" data-copy="${esc(r.gift)}">Copy code</button></div><small>Your codes are always listed under Gift a Crit Pass.</small></div>`);wireCopy(o);return}
    if(st==='done'&&r&&r.unlocked){setUnlocked(true);refreshMe();if(S.screen==='setup')renderSetup();welcomePass();return}
    await new Promise(z=>setTimeout(z,2500))}
  toast('Payment is still on its way. Reload in a minute; if the unlock is missing, send us feedback.')}
addEventListener('load',()=>{const q=new URLSearchParams(location.search);if(q.get('unlock'))unlockReturn();else giftArrive()});
"""

def patch(path):
    s = open(path, encoding='utf-8').read()
    if 'function hasArena()' in s:
        print(path, 'already patched'); return

    def r(a, b, count=1):
        nonlocal s
        n = s.count(a)
        assert n == count, f'{path}: expected {count} of {a[:80]!r}, found {n}'
        s = s.replace(a, b)

    # styles
    r('</style>', CSS + '</style>')
    # the unlock code sits just before refreshMe (needs S, esc, toast, signedIn in scope at call time)
    r('async function refreshMe(){if(!statsOn()||!signedIn()){S.me=null;return}const r=await ICYNStats.me();S.me=r&&r.stats||null;renderAcct()}',
      JS.strip() + '\n' +
      'async function refreshMe(){if(!statsOn()||!signedIn()){S.me=null;S.unlocked=false;return}const was=hasArena(),r=await ICYNStats.me();S.me=r&&r.stats||null;if(r)setUnlocked(!!r.unlocked);renderAcct();if(was!==hasArena()&&S.screen===\'setup\'&&!document.activeElement?.matches?.(\'input\'))renderSetup()}')
    # lock tags on the paid buttons
    r('<button id="m-net" aria-pressed="${S.mode===\'online\'}">Online</button>',
      '<button id="m-net" aria-pressed="${S.mode===\'online\'}">Online${lockTag()}</button>')
    r('<button id="g-boss" aria-pressed="${S.mode===\'boss\'}">Starvos Catastrophe</button>',
      '<button id="g-boss" aria-pressed="${S.mode===\'boss\'}">Starvos Catastrophe${lockTag()}</button>')
    # Online duel box -> unlock card when locked
    r("function renderNetBox(){const el=$('#netbox');if(!el)return;const O=window.ICYNOnline;\n",
      "function renderNetBox(){const el=$('#netbox');if(!el)return;const O=window.ICYNOnline;\n  if(!hasArena()){el.innerHTML=unlockCard('online');wireUnlock(el);return}\n")
    # Starvos online lobby -> unlock card when locked
    r("function renderBossNet(){const el=$('#svnet');if(!el)return;",
      "function renderBossNet(){const el=$('#svnet');if(!el)return;if(!hasArena()){el.innerHTML=unlockCard('starvos');wireUnlock(el);return}")
    # Starvos solo: the Face Starvos button becomes the unlock card (Heroes can still be picked)
    r("    if(i>=0){if(S.party.length>1)S.party.splice(i,1)}else S.party=ORDER.filter(x=>x===id||S.party.includes(x));renderSetup()});\n  $('#begin').onclick=startCatastrophe;\n",
      "    if(i>=0){if(S.party.length>1)S.party.splice(i,1)}else S.party=ORDER.filter(x=>x===id||S.party.includes(x));renderSetup()});\n  if(!hasArena()){const b=$('#begin'),d=document.createElement('div');d.innerHTML=unlockCard('starvos');b.replaceWith(d.firstElementChild);wireUnlock(app);return}\n  $('#begin').onclick=startCatastrophe;\n")
    r("function startCatastrophe(){", "function startCatastrophe(){if(!hasArena())return unlockPanel('starvos');")
    # Print & Play link in the setup footer
    r('<button class="linkish" data-fb>Feedback</button> <button class="linkish" id="privacy">Privacy</button></p>',
      '<button class="linkish" id="pnp">Print &amp; Play</button> <button class="linkish" id="giftlink">Gift a Crit Pass</button> <button class="linkish" data-fb>Feedback</button> <button class="linkish" id="privacy">Privacy</button></p>')
    r("if($('#privacy'))$('#privacy').onclick=privacyPanel;",
      "if($('#privacy'))$('#privacy').onclick=privacyPanel;if($('#pnp')&&PAYWALL()){$('#pnp').onclick=pnpPanel;$('#giftlink').onclick=()=>giftPanel()}else{$('#pnp')?.remove();$('#giftlink')?.remove()}")
    open(path, 'w', encoding='utf-8').write(s)
    print(path, 'patched')

for p in sys.argv[1:]:
    patch(p)
