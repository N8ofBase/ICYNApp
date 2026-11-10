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
# ---- Glossary (reference panel in the reader). Only what the book has already told the reader:
# the print edition's glossary tables plus the Terror on Talus entries, quoted from the doc text.
T = span(1)
def para(start):
    for q in T:
        if q.startswith(start): return q
    raise SystemExit(f'glossary: no paragraph starting {start!r}')
def after_colon(start): return para(start).split(': ', 1)[1]
RISING = [('Icona', 'Large gresh colored planet that is dominant in the sky throughout Rising Season'),
    ('Caspien', 'Abluza moon that appears from behind Icona'), ('Olphine', 'Swirling abluza and wheck gas planet'),
    ('Silva', 'Norangia and yemillow striped planet'), ('Avendwel', 'Distant but bright wheck star that shines until Distar'),
    ('Horace', 'Small brozn moon of Silva'), ('Ego', 'Rojed and bleck lava moon of Icona'),
    ('Distar', 'Gresh planet with a grerde ring; eclipses Avendwel until both are covered by Illconus in the Retreating Season'),
    ('Ryovess', 'Smallest moon of Icona, grerde in color'), ('Nachuun', 'Abluza ice moon of Olphine')]
RETREAT = [('Illconus', 'Large brozn and grerde planet that dominates the sky during the Retreating Season'),
    ('Clovum', 'Rojed star that peeks from under Illconus'), ('Orkun', 'Wheck gas planet with two rocky rings surrounding it'),
    ('Shuntu', 'Largest moon of Illconus, pale gresh in color'), ('Alecra', 'Gaseous moon of Orkun striped in shades of anildigo and verado'),
    ('Hresh', 'Smallest moon of Illconus, brozn with bleck patches'), ('Envereen', 'Grerde, yemillow, and abluza colored planet'),
    ('Diyaposa', 'Largest moon of Envereen, brozn in color'), ('Ryovinn', 'Anildigo moon of Envereen'), ('Nio', 'Small yemillow moon of Envereen')]
COLORS = [('Rojed', 'Red', '#c0392b'), ('Norangia', 'Orange', '#e67e22'), ('Yemillow', 'Yellow', '#f1c40f'), ('Grerde', 'Green', '#27ae60'),
    ('Abluza', 'Blue', '#2e86de'), ('Anildigo', 'Indigo', '#3f3d9b'), ('Verado', 'Violet', '#8e44ad'), ('Brozn', 'Brown', '#7b4f2c'),
    ('Gresh', 'Grey', '#8a8a8a'), ('Bleck', 'Black', '#111111'), ('Wheck', 'White', '#f7f4ec'), ('Slata', 'Silver', '#c0c6cc')]
glossary = {
  'time': [['Sectick', '3 seconds'], ['Mintick', '20 secticks · 60 seconds'], ['Trintick', '20 minticks · 20 minutes'],
           ['Tick', '3 trinticks · 1 hour'], ['Rotation', '20 ticks · 1 day'], ['Planet Cycle', '20 rotations · 1 month'],
           ['Grand Rotation', '20 planet cycles · 1 year']],
  'rising': RISING, 'retreating': RETREAT,
  'distance': [['Ting', '1 centimeter'], ['Link', '20 tings · 20 cm · about 8 inches'], ['Length', '10 links · 2 meters · about 6.5 feet'],
               ['Tang', '200 lengths · 400 meters · about ¼ mile'], ['Tong', '20 tangs · 8 km · about 5 miles']],
  'weight': [['Parse', '20 grams'], ['Pec', '20 parse · 400 grams · about 1 pound'], ['Chunk', '20 pecs · 8 kg · about 20 pounds'],
             ['Gort', '20 chunks · 160 kg · about 400 pounds']],
  'colors': COLORS,
  'cosmos': [['Icosa', after_colon('Icosa: ')], ['Life Carrier', after_colon('Life Carrier: ')], ['All Spirit', after_colon('All Spirit: ')],
             ['Talus', para('The world of Talus is')], ['Starvos', para('From the ashes of the impact')]],
  'peoples': [[k, para(f'The {k}')] for k in ('Dimoneesh', 'Leyf', 'Lizerus', 'Melkin', 'Sapiens')],
  'roles': [[k, after_colon(k + ': ')] for k in ('Brawler', 'Champion', 'Maverick', 'Soul Seer', 'Whisper')],
  'heroes': [[k, para(k + ', a ')] for k in ('Hinon', 'Rork', 'Sartina', 'Umatu', 'Yelena')],
  'towns': [[k, para(st)] for k, st in (('Hinon', 'Hinon is a'), ('Rork', 'Rork has'), ('Sartina', 'Sartina itself'),
                                         ('Umatu', 'Umatu is'), ('Yelena', 'Yelena’s Life Crystal'))],
}
data = {'title': 'Project Lightbringer', 'subtitle': 'Terror on Talus', 'author': 'N8', 'chapters': chapters, 'glossary': glossary}
json.dump(data, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
for c in chapters:
    print(f"{c['words']:6}  {c['part']} / {c['title']}")
