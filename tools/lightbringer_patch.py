# "Read Project Lightbringer" (user 2026-11-10): a banner on the Duel and Starvos setup screens opens a
# book reader for N8's novel Project Lightbringer (Terror on Talus). The text lives in lightbringer.json
# (made by tools/lightbringer/make_json.py from the Google Doc) and loads only when the reader opens.
# The first LB_FREE chapters are free; the rest open with the Crit Pass (only on the live site, where
# the paywall exists; the claude.ai preview keeps everything open). ?read opens the reader from a link.
# Needs unlock_patch.py first. Usage: python3 tools/lightbringer_patch.py index.html
import sys

LB_FREE = 3   # Prologue, Terror on Talus, Stranger in a Strange Land (the Crit Pass starts at Harder Than It Looks)

CSS = r"""
/* Read Project Lightbringer (2026-11-10) */
.lbban{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:14px;max-width:560px;width:calc(100% - 8px);margin:14px auto 0;padding:12px 16px;border-radius:14px;
  background:radial-gradient(120% 140% at 0% 50%,#2f3f7a 0%,#1c1d44 45%,#120f24 100%);border:1px solid rgba(224,184,98,.6);box-shadow:0 6px 18px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.05);
  color:#f3ead8;position:relative;overflow:hidden;text-align:left}
.lbban::before{content:"";position:absolute;inset:0;background:radial-gradient(1.5px 1.5px at 22% 30%,#fff8 50%,transparent 51%),radial-gradient(1px 1px at 48% 70%,#fff7 50%,transparent 51%),radial-gradient(1.5px 1.5px at 72% 22%,#fff6 50%,transparent 51%),radial-gradient(1px 1px at 88% 64%,#fff8 50%,transparent 51%),radial-gradient(1px 1px at 61% 44%,#fff5 50%,transparent 51%);pointer-events:none}
.lbban:hover,.lbban:focus-visible{border-color:var(--gold);box-shadow:0 8px 22px rgba(0,0,0,.4),0 0 0 2px rgba(224,184,98,.45)}
.lbban svg{flex:0 0 auto;width:52px;height:52px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));position:relative}
.lbban .lb-glow{animation:lbglow 3.2s ease-in-out infinite;transform-origin:32px 22px}
@keyframes lbglow{0%,100%{opacity:.55;transform:scale(.9)}50%{opacity:1;transform:scale(1.1)}}
.lbban .gb-t{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;position:relative}
.lbban b{font-family:var(--f-display);font-size:clamp(1.15rem,4.6vw,1.5rem);color:var(--gold);line-height:1.05;text-shadow:0 2px 0 #000;font-weight:400}
.lbban small{font-size:.85rem;opacity:.9}
.lbban .gb-go{flex:0 0 auto;font-weight:800;font-size:.8rem;letter-spacing:.04em;padding:6px 12px;border-radius:999px;background:var(--gold);color:#1d1708;position:relative}
@media (max-width:420px){.lbban .gb-go{display:none}.lbban svg{width:44px;height:44px}}
@media (prefers-reduced-motion:reduce){.lbban .lb-glow{animation:none}}

.lbr{position:fixed;inset:0;z-index:29;display:flex;flex-direction:column;background:radial-gradient(120% 80% at 50% 0%,#232046 0%,#0d0b14 70%);color:var(--text);
  padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) 0 env(safe-area-inset-left,0px);animation:lbin .3s ease-out both}
@keyframes lbin{from{opacity:0}to{opacity:1}}
.lbr-bar{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid rgba(224,184,98,.25);background:rgba(10,8,16,.6)}
.lbr-bar .lbr-t{flex:1;min-width:0;text-align:center;font-family:var(--f-display);color:var(--gold);font-weight:400;font-size:1.15rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lbr-bar button{background:rgba(255,255,255,.06);border:1px solid rgba(224,184,98,.35);border-radius:10px;padding:6px 11px;min-height:36px;color:var(--text)}
.lbr-bar button:hover{border-color:var(--gold)}
.lbr-scroll{flex:1;min-height:0;overflow:auto;padding:22px 16px 40px;overscroll-behavior:contain}
.lbr-page{box-sizing:border-box;max-width:720px;margin:0 auto;padding:clamp(22px,5vw,52px) clamp(18px,6vw,64px) 28px;border-radius:6px;color:var(--ink);
  background:radial-gradient(120% 80% at 50% 40%,var(--parch) 55%,#e2cc9c 100%);
  box-shadow:0 0 0 2px #6d1d29,0 0 0 4px var(--gold-deep),0 0 0 6px #3a0f18,0 22px 50px rgba(0,0,0,.6),inset 0 0 60px rgba(120,80,20,.18)}
.lbr-part{margin:0 0 4px;text-align:center;font-family:var(--f-display);font-size:.85rem;letter-spacing:.08em;color:#7a2232}
.lbr-page h2{margin:0 0 6px;text-align:center;font-family:var(--f-title);font-weight:700;font-size:clamp(1.6rem,6vw,2.3rem);line-height:1.1;color:#3a0f18}
.lbr-orn{display:block;margin:4px auto 22px;width:160px;height:14px;color:var(--gold-deep)}
.lbr-text{font-family:Georgia,"Iowan Old Style","Palatino Linotype",serif;font-size:var(--lbfs,1.08rem);line-height:1.7;hyphens:auto;-webkit-hyphens:auto}
.lbr-text p{margin:0 0 .95em;text-indent:1.4em}
.lbr-text h3{margin:1.5em 0 .5em;font-family:var(--f-display);font-weight:400;color:#7a2232;font-size:1.2em;text-align:center}
.lbr-text h3+p,.lbr-text .lb-verse,.lbr-text .lb-tbc{text-indent:0}
.lbr-text>p:first-child{text-indent:0}
body.lb-open .sfx-btn{display:none}
.lbr-text>p.lb-dc:first-child::first-letter{float:left;font-family:var(--f-title);font-weight:700;font-size:3.3em;line-height:.82;margin:.08em .1em 0 0;color:#7a2232}
.lbr-text .lb-verse{margin:1.2em auto;padding:.9em 1.2em;max-width:30em;font-style:italic;text-align:center;border-block:1px solid rgba(168,130,42,.55);background:rgba(168,130,42,.08)}
.lbr-text .lb-units{list-style:none;margin:0 auto 1em;padding:0;max-width:30em;display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:2px 22px;font-size:.92em}
.lbr-text .lb-units b{white-space:nowrap}
.lbr-text .lb-units li{display:flex;justify-content:space-between;gap:10px;border-bottom:1px dotted rgba(109,92,72,.45);padding:2px 0}
.lbr-text .lb-units span{color:var(--ink-2);text-align:right}
.lbr-text .lb-cycles{margin:0 auto 1em;padding:0 0 0 1.6em;max-width:32em;columns:4 7em;font-size:.92em}
.lbr-text .lb-tbc{text-align:center;font-family:var(--f-title);font-style:italic;color:#7a2232;margin-top:1.6em}
.lbr-nav{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:26px;padding-top:16px;border-top:1px solid rgba(168,130,42,.45);font-family:var(--f-body)}
.lbr-nav span{color:var(--ink-2);font-size:.85rem}
.lbr-nav button{border:1px solid rgba(122,34,50,.5);background:rgba(122,34,50,.08);color:#3a0f18;border-radius:999px;padding:8px 14px;font-weight:700;min-height:40px}
.lbr-nav button:hover{background:rgba(122,34,50,.16)}
.lbr-nav button[disabled]{visibility:hidden}
.lbr-cover{text-align:center}
.lbr-cover .lbr-sub{font-family:var(--f-title);font-size:1.25rem;color:#7a2232;margin:0 0 4px}
.lbr-cover .lbr-by{font-family:Georgia,"Iowan Old Style",serif;font-style:italic;color:var(--ink-2);margin:0 0 18px}
.lbr-cover p.lbr-blurb{font-family:Georgia,serif;font-size:1.05rem;line-height:1.6;max-width:30em;margin:0 auto 14px}
.lbr-cover .lbr-go{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:18px 0 6px}
.lbr-cover .lbr-go button{border:0;border-radius:999px;padding:11px 20px;font-weight:800;background:#7a2232;color:#fff;min-height:44px}
.lbr-cover .lbr-go button.alt{background:transparent;color:#3a0f18;border:1px solid rgba(122,34,50,.55)}
.lbr-cover small{color:var(--ink-2)}
.lbr-cover .lbr-call{font-family:var(--f-title);font-style:italic;color:#7a2232;font-size:1.15rem}
.lbr-toc{position:absolute;inset:0;z-index:2;display:flex;justify-content:flex-start;background:rgba(5,4,8,.6)}
.lbr-toc[hidden]{display:none}
.lbr-toc-in{width:min(380px,88vw);height:100%;overflow:auto;background:#17142a;border-right:1px solid rgba(224,184,98,.35);padding:16px 14px calc(16px + env(safe-area-inset-bottom,0px));box-shadow:10px 0 30px rgba(0,0,0,.5);animation:lbslide .25s ease-out both}
@keyframes lbslide{from{transform:translateX(-30px);opacity:0}to{transform:none;opacity:1}}
.lbr-toc-in h3{margin:4px 4px 12px;font-family:var(--f-display);color:var(--gold);font-weight:400}
.lbr-toc-in ol{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.lbr-toc-in .lbp{margin:12px 6px 2px;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.lbr-toc-in button{width:100%;text-align:left;display:flex;align-items:center;gap:8px;background:transparent;border:1px solid transparent;border-radius:10px;padding:9px 10px;color:var(--text)}
.lbr-toc-in button:hover{background:rgba(255,255,255,.05)}
.lbr-toc-in button[aria-current="true"]{border-color:rgba(224,184,98,.55);background:rgba(224,184,98,.1)}
.lbr-toc-in button span{flex:1}
.lbr-toc-in button small{color:var(--muted);white-space:nowrap}
.lbr-lockfade{position:relative;max-height:9.5em;overflow:hidden}
.lbr-lockfade::after{content:"";position:absolute;inset:auto 0 0 0;height:70%;background:linear-gradient(transparent,var(--parch))}
.lbr-lockbox{margin:8px -6px 0;padding:6px 10px 14px;border-radius:12px;background:#1f1b25;color:var(--text)}
.lbr-lockbox .unlock{margin-top:8px}
.lbr-lockbox .ul-story{margin:10px 0 0;text-align:center;font-family:var(--f-title);color:var(--gold);font-size:1.15rem}
.lbr-msg{text-align:center;font-family:Georgia,serif;padding:40px 0}
@media (max-width:520px){.lbr-bar .lbr-tbl{display:none}.lbr-bar{gap:6px;padding:8px 10px}}
/* Glossary: reference panel over the reader */
.lbr-gl{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;background:radial-gradient(120% 80% at 50% 0%,#232046 0%,#0d0b14 70%);animation:lbin .2s ease-out both}
.lbr-gl[hidden]{display:none}
.lbr-gl-tabs{flex:0 0 auto;display:flex;gap:6px;overflow-x:auto;padding:10px 14px;border-bottom:1px solid rgba(224,184,98,.2);scrollbar-width:thin}
.lbr-gl-tabs button{flex:0 0 auto;border-radius:999px;padding:6px 13px;min-height:34px;background:rgba(255,255,255,.05);border:1px solid rgba(224,184,98,.3);color:var(--text);font-size:.9rem}
.lbr-gl-tabs .lbr-gl-back{position:sticky;left:0;z-index:1;background:#7a2232;border-color:#7a2232;color:#fff;font-weight:800;box-shadow:-16px 0 0 2px #15122a,6px 0 10px rgba(13,11,20,.9)}
.lbr-gl-tabs button[aria-selected="true"]{background:var(--gold);color:#1d1708;border-color:var(--gold);font-weight:800}
.lbr-gl .lbr-page h2{margin-bottom:2px}
.lbr-gl .lbr-text p{text-indent:0}
.lbg-note{text-align:center;font-style:italic;color:var(--ink-2);margin:0 0 14px;font-size:.92em}
.lbg-map{display:block;margin:0 -8px;filter:drop-shadow(0 3px 6px rgba(60,30,10,.35))}
.lbg-map img{display:block;width:100%;height:auto}
.lbg-tbl{width:100%;border-collapse:collapse;margin:0 0 1.2em;font-size:.95em}
.lbg-tbl caption{caption-side:top;font-family:var(--f-display);color:#7a2232;font-size:1.15em;padding:.6em 0 .3em}
.lbg-tbl th,.lbg-tbl td{text-align:left;vertical-align:top;padding:5px 8px;border-bottom:1px dotted rgba(109,92,72,.45)}
.lbg-tbl th{white-space:nowrap;font-weight:700;color:#3a0f18;width:1%}
.lbg-tbl td{color:var(--ink-2)}
.lbg-tbl .n{color:#7a2232;font-variant-numeric:tabular-nums;width:1%;padding-right:2px}
.lbg-sw{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.lbg-sw li{display:flex;align-items:center;gap:10px;padding:6px;border-radius:10px;background:rgba(255,255,255,.35);border:1px solid rgba(109,92,72,.25)}
.lbg-sw i{flex:0 0 auto;width:34px;height:34px;border-radius:50%;box-shadow:inset 0 0 0 2px rgba(0,0,0,.25),0 1px 2px rgba(0,0,0,.3)}
.lbg-sw b{display:block;color:#3a0f18}.lbg-sw small{color:var(--ink-2)}
.lbg-ent{display:flex;gap:16px;align-items:flex-start;padding:14px 0;border-bottom:1px dotted rgba(109,92,72,.45)}
.lbg-ent:last-child{border-bottom:0}
.lbg-ent img{flex:0 0 auto;width:96px;height:auto;border-radius:8px;background:#e7dcc3;box-shadow:0 0 0 2px var(--gold-deep),0 3px 8px rgba(0,0,0,.25)}
.lbg-ent h3{margin:0 0 4px!important;text-align:left!important}
.lbg-ent p{margin:0}
@media (max-width:460px){.lbg-ent img{width:72px}}
"""

# An original open book with a glowing star sphere above it, drawn inline.
SVG = ('<svg viewBox="0 0 64 64" aria-hidden="true">'
       '<circle class="lb-glow" cx="32" cy="22" r="13" fill="#9ec8ff" opacity=".7" style="filter:blur(4px)"/>'
       '<circle cx="32" cy="21" r="6.5" fill="#cfe4ff" stroke="#2a3a7a" stroke-width="1.5"/>'
       '<circle cx="30" cy="19" r="1.2" fill="#fff"/><circle cx="34.5" cy="22.5" r=".9" fill="#fff"/>'
       '<path d="M6 33c9-3 18-2 26 3v20c-8-5-17-6-26-3z" fill="#f5ead2" stroke="#2a0a10" stroke-width="2" stroke-linejoin="round"/>'
       '<path d="M58 33c-9-3-18-2-26 3v20c8-5 17-6 26-3z" fill="#eadbb8" stroke="#2a0a10" stroke-width="2" stroke-linejoin="round"/>'
       '<path d="M10 39c6-1.5 12-1 18 1.5M10 44c6-1.5 12-1 18 1.5M36 40.5c6-2.5 12-3 18-1.5M36 45.5c6-2.5 12-3 18-1.5" stroke="#a8822a" stroke-width="1.2" fill="none"/>'
       '<path d="M4 54c10-3 19-2 28 3 9-5 18-6 28-3" stroke="#7a2232" stroke-width="2.5" fill="none" stroke-linecap="round"/>'
       '</svg>')

ORN = ('<svg class="lbr-orn" viewBox="0 0 160 14" aria-hidden="true"><path d="M4 7h58M98 7h58" stroke="currentColor" stroke-width="1.2"/>'
       '<path d="M80 1l6 6-6 6-6-6z" fill="currentColor"/><circle cx="68" cy="7" r="2" fill="currentColor"/><circle cx="92" cy="7" r="2" fill="currentColor"/></svg>')

JS = r"""
// Read Project Lightbringer (user 2026-11-10): N8's novel in a book reader. Text loads from lightbringer.json on first open.
// The first LB_FREE chapters are free; the rest need the Crit Pass on the live site (hasArena()).
const LB_FREE=__LB_FREE__,LB_KEY='icyn.lb',LB_FS=['.98rem','1.08rem','1.2rem','1.34rem'];
let LB=null;
const lbState=()=>{try{return JSON.parse(localStorage.getItem(LB_KEY))||{}}catch(e){return{}}};
const lbSave=o=>{try{localStorage.setItem(LB_KEY,JSON.stringify(Object.assign(lbState(),o)))}catch(e){}};
const lbOpenCh=i=>!PAYWALL()||i<LB_FREE||hasArena();
const lbBanner=()=>`<button class="lbban" data-lbban type="button">__SVG__<span class="gb-t"><b>Read Project Lightbringer</b><small>Step into Talus, the world behind the Heroes, in N8’s novel. Free to start.</small></span><span class="gb-go">Read</span></button>`;
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('[data-lbban]'))lbReader()});
async function lbReader(at){document.querySelector('.lbr')?.remove();
  const o=document.createElement('div');o.className='lbr';o.setAttribute('role','dialog');o.setAttribute('aria-modal','true');o.setAttribute('aria-label','Project Lightbringer');
  o.innerHTML=`<div class="lbr-bar"><button class="lbr-tb" aria-label="Chapters" aria-expanded="false">☰ <span class="lbr-tbl">Chapters</span></button><b class="lbr-t">Project Lightbringer</b><button class="lbr-gb" aria-label="Glossary" aria-expanded="false">📜 <span class="lbr-tbl">Glossary</span></button><button class="lbr-aa" aria-label="Text size">Aa</button><button class="lbr-x" aria-label="Close">✕</button></div>
    <div class="lbr-scroll"><article class="lbr-page"><p class="lbr-msg">Opening the book…</p></article></div><div class="lbr-toc" hidden></div><div class="lbr-gl" hidden></div>`;
  document.body.append(o);document.body.style.overflow='hidden';document.body.classList.add('lb-open');
  const gl=o.querySelector('.lbr-gl'),gb=o.querySelector('.lbr-gb'),sc=o.querySelector('.lbr-scroll'),pg=o.querySelector('.lbr-page'),toc=o.querySelector('.lbr-toc'),tb=o.querySelector('.lbr-tb');
  let cur=-1,saveT=0;
  const setFs=()=>{const f=lbState().fs??1;o.style.setProperty('--lbfs',LB_FS[f]||LB_FS[1])};setFs();
  const close=()=>{if(cur>=0)lbSave({c:cur,y:sc.scrollTop/Math.max(1,sc.scrollHeight-sc.clientHeight)});o.remove();document.body.style.overflow='';document.body.classList.remove('lb-open');removeEventListener('keydown',key)};
  const key=e=>{if(e.key==='Escape'&&!document.querySelector('.over')){if(!toc.hidden)showToc(false);else if(!gl.hidden)showGl(false);else close()}};
  addEventListener('keydown',key);
  o.querySelector('.lbr-x').onclick=close;
  o.querySelector('.lbr-aa').onclick=()=>{const f=((lbState().fs??1)+1)%LB_FS.length;lbSave({fs:f});setFs()};
  sc.addEventListener('scroll',()=>{clearTimeout(saveT);saveT=setTimeout(()=>{if(cur>=0)lbSave({c:cur,y:sc.scrollTop/Math.max(1,sc.scrollHeight-sc.clientHeight)})},400)},{passive:true});
  if(!LB){try{const r=await fetch('lightbringer.json',{cache:'no-cache'});if(!r.ok)throw 0;LB=await r.json()}catch(e){pg.innerHTML='<p class="lbr-msg">The book could not be opened right now. Please try again in a moment.</p>';return}}
  if(!o.isConnected)return;
  const C=LB.chapters;
  function showToc(on){toc.hidden=!on;tb.setAttribute('aria-expanded',on);if(!on)return;let part='';
    toc.innerHTML=`<div class="lbr-toc-in"><h3>${esc(LB.title)}</h3><ol>${C.map((c,i)=>{const p=c.part!==part?`<li class="lbp">${esc(part=c.part)}</li>`:'';
      return p+`<li><button data-i="${i}"${i===cur?' aria-current="true"':''}><span>${esc(c.title)}</span><small>${c.teaser?'Coming soon':lbOpenCh(i)?Math.max(1,Math.round(c.words/230))+' min':'🔒 Crit Pass'}</small></button></li>`}).join('')}</ol></div>`;
    toc.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{showToc(false);show(+b.dataset.i)});toc.querySelector('button')?.focus()}
  toc.onclick=e=>{if(e.target===toc)showToc(false)};tb.onclick=()=>showToc(toc.hidden);
  function cover(){cur=-1;const st=lbState(),go=st.c!=null&&C[st.c]&&!C[st.c].teaser;
    // N8 2026-11-10: readers start at the Prologue or where they left off
    pg.innerHTML=`<div class="lbr-cover"><p class="lbr-part">A novel in progress</p><h2>${esc(LB.title)}</h2><p class="lbr-sub">${esc(LB.subtitle)}</p><p class="lbr-by">by ${esc(LB.author)}</p>__ORN__
      <p class="lbr-blurb"><b>Somewhere in a grand and loving universe, one small world has fallen into Fear.</b></p>
      <p class="lbr-blurb">In this universe, death is not an ending. It is a doorway. When a mortal life is over, the true adventure begins: a journey across trillions of young, evolving worlds, helping each one rise toward perfection by bringing Love wherever Fear has taken root.</p>
      <p class="lbr-blurb">For your next journey you have chosen the greatest honor of all. You will become the Lightbringer, the heart of a celestial project sent to stop an army of Fear before it devours Talus and spills out into the galaxies beyond. Victory is not promised. But with the power of Love, the gifts of Project Lightbringer, and the noble peoples of Talus at your side, the Fear Rift can be sealed.</p>
      <p class="lbr-blurb lbr-call">Go forth, champion of Love. Light and Life are waiting.</p>
      <div class="lbr-go">${go?`<button data-go="${st.c}">Continue: ${esc(C[st.c].title)}</button><button class="alt" data-go="0">Start at the Prologue</button>`:'<button data-go="0">Begin with the Prologue</button>'}</div>
      <small>${PAYWALL()&&!hasArena()?`The first ${LB_FREE} chapters are free. The rest open with the Crit Pass.`:'New chapters arrive as N8 writes them.'}</small></div>`;
    pg.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>show(+b.dataset.go,b.dataset.go==st.c?st.y:0));sc.scrollTop=0}
  function show(i,y){cur=i;const c=C[i],open=lbOpenCh(i);lbSave({c:i,y:y||0});
    const nav=`<nav class="lbr-nav"><button data-n="-1"${i?'':' disabled'}>‹ Back</button><span>${i+1} / ${C.length}</span><button data-n="1"${i<C.length-1?'':' disabled'}>Next ›</button></nav>`;
    pg.innerHTML=`<p class="lbr-part">${esc(c.part)}</p><h2>${esc(c.title)}</h2>__ORN__`+(open?`<div class="lbr-text">${c.html}</div>${nav}`
      :`<div class="lbr-text lbr-lockfade">${c.html.split('\n').slice(0,2).join('')}</div><div class="lbr-lockbox"><p class="ul-story">The story continues with the Crit Pass</p>${unlockCard('read')}</div>${nav}`);
    if(!open)wireUnlock(pg);
    pg.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>show(cur+ +b.dataset.n));
    requestAnimationFrame(()=>{sc.scrollTop=y?y*(sc.scrollHeight-sc.clientHeight):0});o.querySelector('.lbr-t').textContent=c.title}
  // Glossary: free reference built from what the book has told the reader so far (the print edition's glossary + Terror on Talus)
  let glTab=lbState().g||'map';
  function showGl(on){gl.hidden=!on;gb.setAttribute('aria-expanded',on);if(!on){gb.focus();return}if(!toc.hidden)showToc(false);glRender()}
  function glRender(){const G=LB.glossary||{},row=(a,b)=>`<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`,
      ent=(name,txt,img,cls)=>`<div class="lbg-ent">${img?`<img class="${cls||''}" src="${img}" alt="" loading="lazy">`:''}<div><h3>${esc(name)}</h3><p>${esc(txt)}</p></div></div>`,
      T={map:['Map of Talus',()=>`<p class="lbg-note">The map of Talus by N8. Tap the map to open it full size.</p><a class="lbg-map" href="lb/map.webp" target="_blank" rel="noopener"><img src="lb/map.webp" alt="Map of Talus with Turantia, Lake Femrul, the Oracle, and the towns of Rork, Sartina, Hinon, Umatu and Yelena" width="1600" height="1236"></a>`],
        time:['Time & Sky',()=>`<table class="lbg-tbl"><caption>Time on Talus</caption>${(G.time||[]).map(x=>row(...x)).join('')}</table>
          <p class="lbg-note">400 rotations make one grand rotation. Each planet cycle is named for the moon or planet that rules the sky.</p>
          <table class="lbg-tbl"><caption>Rising Season</caption>${(G.rising||[]).map((x,i)=>`<tr><td class="n">${i+1}</td><th>${esc(x[0])}</th><td>${esc(x[1])}</td></tr>`).join('')}</table>
          <table class="lbg-tbl"><caption>Retreating Season</caption>${(G.retreating||[]).map((x,i)=>`<tr><td class="n">${i+11}</td><th>${esc(x[0])}</th><td>${esc(x[1])}</td></tr>`).join('')}</table>`],
        measures:['Measures',()=>`<table class="lbg-tbl"><caption>Distance</caption>${(G.distance||[]).map(x=>row(...x)).join('')}</table><table class="lbg-tbl"><caption>Weight</caption>${(G.weight||[]).map(x=>row(...x)).join('')}</table>`],
        colors:['Colors',()=>`<ul class="lbg-sw">${(G.colors||[]).map(c=>`<li><i style="background:${c[2]}"></i><span><b>${esc(c[0])}</b><small>${esc(c[1])}</small></span></li>`).join('')}</ul>`],
        peoples:['Peoples',()=>(G.peoples||[]).map(x=>ent(x[0],x[1],'lb/race-'+(x[0]==='Sapiens'?'sapien':x[0].toLowerCase())+'.webp')).join('')],
        roles:['Roles',()=>(G.roles||[]).map(x=>ent(x[0],x[1])).join('')],
        heroes:['Heroes of the Scorch',()=>(G.heroes||[]).map(x=>ent(x[0],x[1],'lb/hero-'+x[0].toLowerCase()+'.webp')).join('')],
        towns:['Towns',()=>(G.towns||[]).map(x=>ent(x[0],x[1])).join('')],
        cosmos:['Cosmos',()=>(G.cosmos||[]).map(x=>ent(x[0],x[1])).join('')]};
    if(!T[glTab])glTab='map';
    gl.innerHTML=`<div class="lbr-gl-tabs" role="tablist" aria-label="Glossary sections"><button class="lbr-gl-back" type="button" aria-label="Back to the story">‹ Back to story</button>${Object.keys(T).map(k=>`<button role="tab" data-g="${k}" aria-selected="${k===glTab}">${esc(T[k][0])}</button>`).join('')}</div>
      <div class="lbr-scroll"><article class="lbr-page"><p class="lbr-part">Glossary</p><h2>${esc(T[glTab][0])}</h2>__ORN__<div class="lbr-text">${T[glTab][1]()}</div></article></div>`;
    gl.querySelector('.lbr-gl-back').onclick=()=>showGl(false);
    gl.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{glTab=b.dataset.g;lbSave({g:glTab});glRender();gl.querySelector(`[data-g="${glTab}"]`)?.focus()});
    gl.querySelector('[aria-selected="true"]')?.scrollIntoView({inline:'center',block:'nearest'})}
  gb.onclick=()=>showGl(gl.hidden);
  if(at!=null&&C[at])show(at);else cover()}
addEventListener('load',()=>{const q=new URLSearchParams(location.search);if(!q.has('read'))return;q.delete('read');history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:'')+location.hash);Promise.resolve(window.ICYNAuth&&ICYNAuth.ready).catch(()=>{}).then(()=>lbReader())});
""".replace('__SVG__', SVG).replace('__ORN__', ORN).replace('__LB_FREE__', str(LB_FREE))

def patch(path):
    s = open(path, encoding='utf-8').read()
    if 'data-lbban' in s:
        print(path, 'already has the Lightbringer reader'); return
    assert 'function hasArena()' in s, 'run unlock_patch.py first'
    def r(a, b, n=1):
        nonlocal s
        assert s.count(a) == n, f'{path}: expected {n} of {a[:60]!r}, found {s.count(a)}'
        s = s.replace(a, b)
    r('</style>', CSS + '</style>')
    r('// Players who joined before the Crit Pass launched', JS.strip() + '\n// Players who joined before the Crit Pass launched')
    # Crit Pass perks mention the story; the reader's lock card gets its own heading
    r("pnp:'Print & Play files',any:", "pnp:'Print & Play files',read:'Read the whole story so far',any:")
    r('<li><b>Print &amp; Play</b> rulebook and Hero sheets (PDF)</li></ul>',
      '<li><b>Print &amp; Play</b> rulebook and Hero sheets (PDF)</li><li><b>Project Lightbringer</b>, every chapter of N8’s novel</li></ul>')
    # Duel and Starvos setup screens: right after How to play
    r('</ol></div></details>\n   ', '</ol></div></details>\n   ${lbBanner()}\n   ', 2)
    open(path, 'w', encoding='utf-8').write(s); print(path, 'patched')

for p in sys.argv[1:]:
    patch(p)
