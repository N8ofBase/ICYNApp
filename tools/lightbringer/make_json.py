# Builds lightbringer.json for the in-game reader from two plain-text Google Drive exports
# (one paragraph per non-empty line):
#   mission1.txt = "Project Lightbringer Edit"  (Prologue, Terror on Talus, Mission 1 up to Castle Comet)
#   mission2.txt = "PLMission2"                 (Mission 2, still being written)
# Usage: python3 tools/lightbringer/make_json.py tools/lightbringer/mission1.txt tools/lightbringer/mission2.txt lightbringer.json
# Chapter starts are found by their heading lines, so later edits to the docs keep working
# as long as the headings stay the same.
import json, re, sys, html

m1, m2, out = sys.argv[1], sys.argv[2], sys.argv[3]
def load(src):
    raw = open(src, encoding='utf-8').read()
    for a, b in (('\\!', '!'), ('\\.', '.'), ('\\~', '~'), ('\\-', '-'), ('\\*', '*')):
        raw = raw.replace(a, b)
    return [p.strip() for p in raw.split('\n') if p.strip()]
P1, P2 = load(m1), load(m2)

M1, M2 = 'Mission 1 · The Universe Medallion', 'Mission 2 · The Strength of Love'
# (source, heading in the doc, title shown, part label). The opening has no heading in the doc.
CHAPTERS = [
    (1, None, 'The Vision', 'Prologue'),
    (1, 'Terror on Talus', 'Terror on Talus', 'The Knowledge Beacon'),
    (1, 'Stranger in a Strange Land', 'Stranger in a Strange Land', M1),
    (1, 'Harder Than it Looks', 'Harder Than It Looks', M1),
    (1, 'Castle Comet', 'Castle Comet', M1),
    (2, 'The Strength of Love', 'The Supernal Star Sphere of Strength', M2),
    (2, 'L.O.S.E.R', 'L.O.S.E.R', M2),
    (2, 'Have You Heard of Hinon? Everyone is Dying to Go There.', 'Have You Heard of Hinon? Everyone Is Dying to Go There.', M2),
    (2, 'Funny Meeting You Here', 'Funny Meeting You Here', M2),
    (2, 'Kilnor’s Coronation', 'Kilnor’s Coronation', M2),
    (2, 'The Blightbringer', 'The Blightbringer', M2),
]
M1_END = 'The Strength of Love'     # Mission 1 doc still holds older drafts of Mission 2; stop there
SKIP = {'Mission 1', 'The Universe Medallion'}          # part headings, shown as the chapter's part label
SUBHEADS = {'Time', 'Colors', 'Distance', 'Weight', 'Celestial Hierarchy of the Nebrom System'}
VERSE_INTRO = ('titled Creator’s Creed', 'titled Psalm of the Lightbringer', "words of the Creator's Creed", 'words of the Creator’s Creed')

SRC = {1: P1[:P1.index(M1_END)], 2: P2}
def span(i):
    src, h = CHAPTERS[i][0], CHAPTERS[i][1]
    paras = SRC[src]
    a = paras.index(h) + 1 if h else 0
    nxt = [paras.index(c[1]) for c in CHAPTERS[i + 1:] if c[0] == src]
    return paras[a: nxt[0] if nxt else len(paras)]

e = html.escape
def unit_line(p):   # "1 sectick = 3 seconds" / "Rojed = Red"
    return ' = ' in p and len(p) < 70

chapters = []
for i, (_, h, title, part) in enumerate(CHAPTERS):
    body = span(i)
    blocks, j = [], 0
    while j < len(body):
        p = body[j]
        if p in SKIP:
            j += 1; continue
        if p in SUBHEADS:
            blocks.append(f'<h3>{e(p)}</h3>'); j += 1; continue
        if unit_line(p):
            items = []
            while j < len(body) and unit_line(body[j]):
                a, b = body[j].split(' = ', 1); items.append(f'<li><b>{e(a)}</b><span>{e(b)}</span></li>'); j += 1
            blocks.append(f'<ul class="lb-units">{"".join(items)}</ul>'); continue
        if p.startswith('Icona 2.'):        # the 20 planet cycles (a numbered list in the doc)
            names = []
            while j < len(body) and re.match(r'^(Icona 2\.|\d+\. )', body[j]):
                names += [n.strip() for n in re.split(r'\s*\d+\.\s*', body[j]) if n.strip()]; j += 1
            blocks.append('<ol class="lb-cycles">' + ''.join(f'<li>{e(n)}</li>' for n in names) + '</ol>'); continue
        if any(v in p for v in VERSE_INTRO):
            blocks.append(f'<p>{e(p)}</p>'); j += 1
            lines = []
            while j < len(body) and len(body[j]) < 60 and not body[j].startswith(('“', '"')):
                lines.append(e(body[j])); j += 1
            blocks.append('<p class="lb-verse">' + '<br>'.join(lines) + '</p>'); continue
        m = re.match(r'^([A-Z][\w ’\']{1,22}): (.+)$', p)
        if i == 1 and m:                     # glossary-style terms in the knowledge beacon
            blocks.append(f'<p><b>{e(m.group(1))}:</b> {e(m.group(2))}</p>'); j += 1; continue
        blocks.append(f'<p>{e(p)}</p>'); j += 1
    if blocks and re.match(r'^<p>[A-Za-z]', blocks[0]):   # drop cap only when the chapter opens on a letter
        blocks[0] = '<p class="lb-dc">' + blocks[0][3:]
    words = sum(len(re.sub('<[^>]+>', ' ', b).split()) for b in blocks)
    chapters.append({'title': title, 'part': part, 'words': words, 'html': '\n'.join(blocks)})

chapters[-1]['html'] += '\n<p class="lb-tbc">To be continued… N8 is still writing this chapter.</p>'
chapters[-1]['wip'] = True
data = {'title': 'Project Lightbringer', 'subtitle': 'Terror on Talus', 'author': 'N8', 'chapters': chapters}
json.dump(data, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
for c in chapters:
    print(f"{c['words']:6}  {c['part']} / {c['title']}")
