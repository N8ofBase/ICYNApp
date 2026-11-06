# Owner promo codes (user 2026-11-06): the owner (developers group) makes free one-use Crit Pass
# codes from the Gift a Crit Pass panel, with a note, and can download them as CSV.
# Needs unlock_patch.py first. Usage: python3 tools/promo_patch.py index.html
import sys

CSS = r"""
/* Owner promo codes (2026-11-06) */
.promo{border:1px dashed rgba(224,184,98,.6);border-radius:12px;padding:12px;display:grid;gap:8px}
.promo h3{margin:0}
.promo .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.promo input,.promo select{font:inherit;padding:7px 10px;border-radius:10px;border:1px solid var(--line);background:#120f16;color:var(--text)}
.promo input{flex:1;min-width:10em}
.promo .promo-out:empty{display:none}
.promo .promo-out{display:grid;gap:6px}
.gift-row em{font-style:normal;color:var(--gold)}
"""

JS = r"""
// Owner promo codes (user 2026-11-06): free one-use codes for giveaways, events and game boxes.
const PROMO_HTML=`<div class="promo"><h3>Owner: make promo codes</h3><p><small>Free one-use Crit Pass codes to hand out. Only your account sees this.</small></p>
  <div class="row"><input id="promo-note" maxlength="60" placeholder="Note, e.g. Comic Con 2026"><select id="promo-n" aria-label="How many">${[1,5,10,25,50].map(n=>`<option${n===5?' selected':''}>${n}</option>`).join('')}</select><button class="act" id="promo-go">Make codes</button></div>
  <div class="promo-out" id="promo-out"></div><div class="row"><button class="ghost" id="promo-csv">Download all my codes (CSV)</button></div></div>`;
function codesCsv(list){const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  return 'code,link,note,type,used,created\n'+list.map(g=>[g.code,giftLink(g.code),g.note||'',g.via||'square',g.redeemed?'yes':'no',g.createdAt||''].map(q).join(',')).join('\n')}
function saveCsv(name,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv'}));a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
function wirePromo(o,reload){const go=o.querySelector('#promo-go');if(!go)return;const out=o.querySelector('#promo-out');
  go.onclick=async()=>{const note=o.querySelector('#promo-note').value.trim(),n=+o.querySelector('#promo-n').value;go.disabled=true;go.textContent='Making…';
    const r=await ICYNStats.promoCodes(n,note);go.disabled=false;go.textContent='Make codes';
    if(!r||!r.codes){out.innerHTML=`<p class="nb-err" role="alert">${esc((r&&r.error)||'Could not make codes. Please try again.')}</p>`;return}
    const list=r.codes.map(code=>({code,note:r.note,via:r.via,redeemed:false,createdAt:new Date().toISOString()}));
    out.innerHTML=`<p><b>${r.codes.length} new code${r.codes.length>1?'s':''}${r.note?' · '+esc(r.note):''}</b></p><ul class="gift-list">${list.map(giftRow).join('')}</ul>
      <div class="row"><button class="ghost" data-copy="${esc(list.map(g=>giftLink(g.code)).join('\n'))}">Copy all links</button><button class="ghost" id="promo-csv-new">Download these (CSV)</button></div>`;
    wireCopy(out);out.querySelector('#promo-csv-new').onclick=()=>saveCsv(`crit-pass-codes-${(r.note||'promo').replace(/[^\w-]+/g,'-')}.csv`,codesCsv(list));reload()};
  o.querySelector('#promo-csv').onclick=async()=>{const r=await ICYNStats.gifts();saveCsv('crit-pass-codes-all.csv',codesCsv((r&&r.gifts)||[]))}}
"""

def patch(path):
    s = open(path, encoding='utf-8').read()
    if 'PROMO_HTML' in s:
        print(path, 'already has promo codes'); return
    assert 'function giftPanel()' in s, 'run unlock_patch.py first'
    def r(a, b):
        nonlocal s
        assert s.count(a) == 1, f'{path}: expected 1 of {a[:70]!r}, found {s.count(a)}'
        s = s.replace(a, b)
    r('</style>', CSS + '</style>')
    r('function giftRow(g){', JS.strip() + '\nfunction giftRow(g){')
    # code list rows show the promo note
    r("<span>${g.redeemed?'Redeemed':'Not used yet'}</span>",
      "<span>${g.redeemed?'Redeemed':'Not used yet'}${g.via&&g.via!=='square'?` · <em>${esc(g.note||'Promo')}</em>`:''}</span>")
    # owner section in the Gift panel, above the code list
    r("${s?'<h3>Your gift codes</h3><ul class=\"gift-list\"><li>Loading…</li></ul>':''}`);",
      "${s&&S.owner?PROMO_HTML:''}${s?'<h3>Your gift codes</h3><ul class=\"gift-list\" id=\"my-gifts\"><li>Loading…</li></ul>':''}`);")
    r("wireUnlock(o);if(!s)return;const r=await ICYNStats.gifts();const ul=o.querySelector('.gift-list');",
      "wireUnlock(o);if(!s)return;if(S.owner)wirePromo(o,()=>giftList(o));giftList(o)}\nasync function giftList(o){const r=await ICYNStats.gifts();const ul=o.querySelector('#my-gifts');")
    # /me says whether this is the owner
    r("if(r&&r.passVia==='early')earlyThanks();", "S.owner=!!(r&&r.owner);if(r&&r.passVia==='early')earlyThanks();")
    open(path, 'w', encoding='utf-8').write(s); print(path, 'patched')

for p in sys.argv[1:]:
    patch(p)
