# Split the Project Lightbringer book (2026-11-25) so the Crit Pass chapters are locked on the server, not just in the browser.
#   python3 tools/lightbringer/split_paid.py full.json lightbringer.json backend/book/lightbringer-paid.json
# Reads the full book (what make_json.py writes) and writes:
#   - the public lightbringer.json the site serves: free chapters in full, Crit Pass chapters as a two-paragraph teaser
#     with "locked": true (the reader shows the teaser behind the Crit Pass card)
#   - lightbringer-paid.json: {"chapters": {"3": html, ...}} for the private bucket (s3://icyn-premium-files/book/),
#     which GET /book hands only to players with the pass. Upload it with deploy-unlock.ps1 -Step 6.
# Safe to re-run on an already split file only if the full text is still present (it refuses a teaser-only input).
import json, sys

LB_FREE = 3   # must match LB_FREE in index.html (Prologue, Terror on Talus, Stranger in a Strange Land)
src, pub, paid = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(src, encoding='utf-8'))
out = {}
for i, c in enumerate(d['chapters']):
    if i < LB_FREE:
        continue
    if c.get('locked'):
        sys.exit(f'{src} is already split (chapter {i} is a teaser). Run make_json.py first, or use the paid file.')
    out[str(i)] = c['html']
    c['html'] = '\n'.join(c['html'].split('\n')[:2])
    c['locked'] = True
json.dump({'chapters': out}, open(paid, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.dump(d, open(pub, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'{len(out)} Crit Pass chapters moved to {paid}; {pub} keeps {LB_FREE} free chapters and teasers.')
