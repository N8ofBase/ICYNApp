# Draws the Talus map as a hand-inked, quill-and-parchment SVG, traced from N8's painted map (TalusMap.png).
# Usage: python3 ink_map.py out.svg   (then render with Playwright)
import math, random, sys
random.seed(7)
W, H = 2000, 1545
INK = '#2b1d12'; INK2 = '#4a3320'; RED = '#7a2232'

def jitter(pts, amt=6, step=14):
    """Densify a closed polygon and wobble it like a quill line."""
    out = []
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % n]
        seg = max(1, int(math.hypot(x2 - x1, y2 - y1) / step))
        for k in range(seg):
            t = k / seg
            out.append((x1 + (x2 - x1) * t, y1 + (y2 - y1) * t))
    # smooth noise
    ph = [random.uniform(0, 6.28) for _ in range(3)]
    res = []
    for i, (x, y) in enumerate(out):
        a = i / len(out) * 6.28
        d = amt * (0.6 * math.sin(a * 23 + ph[0]) + 0.3 * math.sin(a * 57 + ph[1]) + 0.25 * math.sin(a * 131 + ph[2]))
        px, py = out[(i + 1) % len(out)]
        dx, dy = px - x, py - y; L = math.hypot(dx, dy) or 1
        res.append((x - dy / L * d, y + dx / L * d))
    return res

def path(pts, closed=True):
    s = 'M%.1f %.1f' % pts[0]
    # Catmull-Rom to bezier
    n = len(pts)
    rng = range(n if closed else n - 1)
    for i in rng:
        p0 = pts[(i - 1) % n] if closed or i > 0 else pts[0]
        p1 = pts[i]; p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if closed or i + 2 < n else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        s += ' C%.1f %.1f %.1f %.1f %.1f %.1f' % (c1 + c2 + p2)
    return s + (' Z' if closed else '')

def inside(pt, poly):
    x, y = pt; c = False
    for i in range(len(poly)):
        x1, y1 = poly[i]; x2, y2 = poly[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c

def scale(poly, f, cx=None, cy=None):
    cx = cx or sum(p[0] for p in poly) / len(poly); cy = cy or sum(p[1] for p in poly) / len(poly)
    return [(cx + (x - cx) * f, cy + (y - cy) * f) for x, y in poly]

COAST = [(640,345),(700,400),(800,430),(900,400),(980,360),(1100,375),(1200,400),(1280,400),(1330,335),(1450,320),
 (1600,330),(1700,360),(1780,340),(1805,395),(1780,500),(1760,580),(1772,680),(1790,770),(1780,870),(1730,950),
 (1680,1020),(1600,1050),(1530,1075),(1490,1120),(1450,1180),(1400,1175),(1370,1130),(1330,1090),(1270,1120),
 (1235,1160),(1215,1215),(1150,1250),(1080,1215),(1030,1135),(990,1060),(900,1052),(800,1035),(710,1012),
 (600,992),(500,1012),(452,1075),(430,1125),(400,1170),(370,1215),(318,1243),(262,1212),(240,1142),(270,1092),
 (215,1050),(200,950),(208,810),(210,700),(222,640),(205,612),(260,620),(350,662),(430,600),(500,560),(545,470),(600,420)]
TURANTIA = [(185,330),(250,290),(340,300),(430,320),(470,380),(460,460),(420,540),(350,580),(270,570),(210,520),(180,440)]

MOUNT = [  # mountain ranges (polygons)
 [(520,560),(560,470),(610,425),(700,410),(800,440),(900,410),(990,370),(1100,385),(1200,410),(1270,405),(1240,450),
  (1100,440),(980,450),(900,480),(840,520),(800,620),(760,700),(700,640),(620,620),(520,620)],
 [(1340,345),(1450,330),(1600,340),(1640,365),(1560,385),(1420,390),(1350,400)],
 [(215,650),(300,640),(380,660),(430,620),(420,720),(380,860),(390,950),(420,1040),(330,1060),(260,1060),(215,980),(212,800)],
 [(420,960),(520,880),(620,870),(700,880),(720,960),(700,1005),(600,990),(500,1005),(440,1010)],
 [(830,950),(900,940),(980,980),(1010,1040),(900,1045),(830,1030)],
]
VALLEY = [(420,700),(520,630),(700,650),(760,710),(700,860),(600,875),(500,880),(410,940),(390,840)]
DESERT = [(840,520),(920,470),(1000,430),(990,500),(960,590),(985,680),(1050,800),(1090,880),(1040,940),(990,975),
          (920,955),(860,935),(850,850),(830,760),(820,660),(800,620)]
GASH = [(712,735),(790,728),(840,800),(852,950),(800,985),(712,905),(696,800)]
HILLS = [(1060,470),(1250,420),(1450,430),(1560,470),(1540,560),(1400,590),(1250,600),(1100,590),(1040,540)]
FORESTS = [((1330,800),200,170),((1135,1080),95,150),((1500,520),80,70),((1680,640),70,80),((1645,860),80,95),
           ((1600,580),45,40),((1700,470),35,40),((1530,900),35,40)]
RIVER = [(1645,490),(1630,560),(1640,620),(1600,690),(1570,770),(1545,860),(1520,950),(1490,1010),(1462,1060),(1455,1110)]

out = []
A = out.append
A(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">')
A('''<defs>
<filter id="paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".008" numOctaves="4" seed="3"/>
<feColorMatrix values="0 0 0 0 .93  0 0 0 0 .85  0 0 0 0 .69  0 0 0 -.9 .55"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="9"/><feColorMatrix values="0 0 0 0 .35 0 0 0 0 .22 0 0 0 0 .1 0 0 0 .22 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<filter id="rough"><feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="2" seed="5" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5"/></filter>
<filter id="inkbleed"><feGaussianBlur stdDeviation=".45"/></filter>
<radialGradient id="vig" cx="50%" cy="50%" r="70%"><stop offset="55%" stop-color="#7a4a1c" stop-opacity="0"/><stop offset="100%" stop-color="#5a3210" stop-opacity=".55"/></radialGradient>
<pattern id="hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="9" stroke="#4a3320" stroke-width="1.1" opacity=".55"/></pattern>
</defs>''')
# parchment with torn edge
def torn(pts, step=9):
    out = []
    for i in range(len(pts)):
        x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % len(pts)]
        seg = int(math.hypot(x2 - x1, y2 - y1) / step); L = math.hypot(x2 - x1, y2 - y1)
        v = 0
        for k in range(seg):
            t = k / seg; v = v * .55 + random.uniform(-1, 1) * 9 + (random.uniform(-22, 6) if random.random() < .04 else 0)
            out.append((x1 + (x2 - x1) * t - (y2 - y1) / L * v, y1 + (y2 - y1) * t + (x2 - x1) / L * v))
    return out
edge = torn([(110,120),(1890,120),(1890,1430),(110,1430)])
A(f'<path d="{path(edge)}" fill="#ecdcb6"/>')
edge_d = path(edge)
A(f'<path d="{path(edge)}" fill="#e6d2a6" filter="url(#paper)"/>')
A(f'<path d="{path(edge)}" fill="#000" filter="url(#grain)"/>')
A(f'<path d="{path(edge)}" fill="url(#vig)"/>')
A(f'<path d="{path(edge)}" fill="none" stroke="#6b4421" stroke-width="5" opacity=".55" filter="url(#rough)"/>')
# double ruled border
A(f'<rect x="160" y="165" width="1680" height="1220" fill="none" stroke="{INK}" stroke-width="3" filter="url(#rough)"/>')
A(f'<rect x="172" y="177" width="1656" height="1196" fill="none" stroke="{INK}" stroke-width="1.2" filter="url(#rough)"/>')

g = ['<g filter="url(#inkbleed)" stroke-linecap="round" stroke-linejoin="round">']
def land(poly, amt=7):
    j = jitter(poly, amt)
    # offshore echo lines
    for k, (f, op) in enumerate([(1.035, .45), (1.07, .28), (1.11, .16)]):
        e = jitter(scale(poly, f), amt * 1.3)
        g.append(f'<path d="{path(e)}" fill="none" stroke="{INK2}" stroke-width="1.4" opacity="{op}" stroke-dasharray="{14-k*3} {5+k*4}"/>')
    g.append(f'<path d="{path(j)}" fill="#f1e4c4" fill-opacity=".55" stroke="{INK}" stroke-width="4"/>')
    g.append(f'<path d="{path(jitter(poly, amt*.7))}" fill="none" stroke="{INK}" stroke-width="1.2" opacity=".7"/>')
land(COAST); land(TURANTIA, 5)

# Great Gash: cracked canyon
g.append(f'<path d="{path(jitter(GASH,4))}" fill="url(#hatch)" stroke="{INK}" stroke-width="2.2"/>')
for i in range(9):
    x = random.uniform(715, 835); y = random.uniform(760, 930)
    pts = [(x, y)]
    for _ in range(4): x += random.uniform(-14, 14); y += random.uniform(8, 20); pts.append((x, y))
    g.append('<polyline points="%s" fill="none" stroke="%s" stroke-width="1.6"/>' % (' '.join('%.0f,%.0f' % p for p in pts), INK))

def scatter(poly, gap, fn, jit=.45):
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    y = min(ys)
    row = 0
    while y < max(ys):
        x = min(xs) + (gap / 2 if row % 2 else 0)
        while x < max(xs):
            px, py = x + random.uniform(-gap * jit, gap * jit), y + random.uniform(-gap * jit, gap * jit)
            if inside((px, py), poly): fn(px, py)
            x += gap
        y += gap * .8; row += 1

def peak(x, y, s=None):
    s = s or random.uniform(26, 40); w = s * random.uniform(.8, 1.1)
    top = (x + random.uniform(-4, 4), y - s)
    g.append(f'<path d="M{x-w:.1f} {y:.1f} L{top[0]:.1f} {top[1]:.1f} L{x+w:.1f} {y:.1f}" fill="#f1e4c4" stroke="{INK}" stroke-width="2.2"/>')
    # shaded right flank hatching
    for k in range(1, 6):
        t = k / 6
        ax, ay = top[0] + (x + w - top[0]) * t, top[1] + (y - top[1]) * t
        g.append(f'<line x1="{ax:.1f}" y1="{ay:.1f}" x2="{ax-w*.35*(1-t)-4:.1f}" y2="{y-1:.1f}" stroke="{INK2}" stroke-width="1"/>')
    # snow cap tick
    g.append(f'<path d="M{top[0]-w*.22:.1f} {top[1]+s*.22:.1f} l{w*.12:.1f} -4 l{w*.1:.1f} 5" fill="none" stroke="{INK}" stroke-width="1.2"/>')
for m in MOUNT: scatter(m, 42, peak)

def stip(x, y):
    for _ in range(3):
        g.append(f'<circle cx="{x+random.uniform(-9,9):.1f}" cy="{y+random.uniform(-9,9):.1f}" r="{random.uniform(.9,1.8):.1f}" fill="{INK2}" opacity=".75"/>')
scatter(DESERT, 22, stip, .6)
def dune(x, y):
    if random.random() < .18:
        g.append(f'<path d="M{x-18:.0f} {y:.0f} q18 -10 36 0" fill="none" stroke="{INK2}" stroke-width="1.3"/>')
scatter(DESERT, 40, dune)
def rock(x, y):
    r = random.random()
    if r < .35: g.append(f'<path d="M{x-6:.0f} {y:.0f} q6 -9 12 0 z" fill="none" stroke="{INK2}" stroke-width="1.2"/>')
    elif r < .8: g.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="1.4" fill="{INK2}"/>')
scatter(VALLEY, 20, rock, .6)
def hill(x, y):
    w = random.uniform(22, 34)
    g.append(f'<path d="M{x-w:.0f} {y:.0f} Q{x:.0f} {y-w*.9:.0f} {x+w:.0f} {y:.0f}" fill="none" stroke="{INK}" stroke-width="2"/>')
    g.append(f'<path d="M{x+3:.0f} {y-w*.35:.0f} q{w*.35:.0f} 6 {w*.6:.0f} {w*.3:.0f}" fill="none" stroke="{INK2}" stroke-width="1"/>')
scatter(HILLS, 48, hill)
def tuft(x, y):
    if random.random() < .5:
        g.append(f'<path d="M{x-4:.0f} {y:.0f} l2 -7 M{x:.0f} {y:.0f} l0 -9 M{x+4:.0f} {y:.0f} l-2 -7" stroke="{INK2}" stroke-width="1.1"/>')
grass = [(980,420),(1330,410),(1790,380),(1785,900),(1600,1050),(1100,1230),(1000,1080),(1050,800),(990,500)]
def tree(x, y):
    r = random.uniform(9, 13)
    g.append(f'<path d="M{x:.1f} {y+r*1.6:.1f} v-{r*.8:.1f}" stroke="{INK}" stroke-width="1.6"/>')
    bumps = ' '.join(f'a{r*.55:.1f} {r*.55:.1f} 0 0 1 {dx:.1f} {dy:.1f}' for dx, dy in [(r*.7,-r*.7),(r*.7,r*.4),(-r*.2,r*.8),(-r*1.2,0),(-r*.2,-r*.8)])
    g.append(f'<path d="M{x-r*.6:.1f} {y+r*.4:.1f} {bumps} z" fill="#f1e4c4" stroke="{INK}" stroke-width="1.7"/>')
    g.append(f'<path d="M{x+r*.15:.1f} {y-r*.1:.1f} q{r*.3:.1f} {r*.2:.1f} {r*.25:.1f} {r*.6:.1f}" fill="none" stroke="{INK2}" stroke-width="1"/>')
for (cx, cy), rx, ry in FORESTS:
    ell = [(cx + rx * math.cos(a) * random.uniform(.85, 1.1), cy + ry * math.sin(a) * random.uniform(.85, 1.1)) for a in [i * 6.283 / 18 for i in range(18)]]
    pts = []
    scatter(ell, 26, lambda x, y: pts.append((x, y)))
    for x, y in sorted(pts, key=lambda p: p[1]): tree(x, y)
# scattered grass tufts on open green land
GREEN = [(1000,430),(1250,420),(1330,410),(1780,400),(1770,900),(1600,1040),(1220,1180),(1080,1150),(1060,900),(1000,700)]
scatter(GREEN, 55, tuft, .5)
# river
rv = RIVER
g.append(f'<path d="{path(rv, False)}" fill="none" stroke="{INK}" stroke-width="5"/>')
g.append(f'<path d="{path(rv, False)}" fill="none" stroke="#f1e4c4" stroke-width="2.2"/>')
# lake Femrul + Oracle pool + crater
g.append(f'<ellipse cx="985" cy="640" rx="34" ry="16" fill="url(#hatch)" stroke="{INK}" stroke-width="2"/>')
g.append(f'<circle cx="1645" cy="460" r="30" fill="none" stroke="{INK}" stroke-width="2.4"/><circle cx="1645" cy="460" r="18" fill="none" stroke="{INK2}" stroke-width="1.2" stroke-dasharray="4 4"/>')
for a in range(0, 360, 30):
    ra = math.radians(a); g.append(f'<line x1="{1645+36*math.cos(ra):.0f}" y1="{460+36*math.sin(ra):.0f}" x2="{1645+48*math.cos(ra):.0f}" y2="{460+48*math.sin(ra):.0f}" stroke="{INK2}" stroke-width="1.4"/>')
g.append(f'<ellipse cx="1740" cy="822" rx="28" ry="22" fill="url(#hatch)" stroke="{INK}" stroke-width="2.4"/><ellipse cx="1740" cy="822" rx="12" ry="9" fill="{INK}" opacity=".7"/>')
# Turantia: shattered city on its plateau
for i in range(16):
    x = random.uniform(250, 380); y = random.uniform(360, 470); h = random.uniform(18, 46)
    g.append(f'<path d="M{x:.0f} {y:.0f} v-{h:.0f} l6 -8 l6 8 v{h:.0f}" fill="#f1e4c4" stroke="{INK}" stroke-width="1.8"/>')
for a in range(0, 360, 24):
    ra = math.radians(a); peak(315 + 150 * math.cos(ra), 450 + 125 * math.sin(ra), 26)
# town icons
def town(x, y, s=1, crown=False):
    g.append(f'<g transform="translate({x} {y}) scale({s})"><path d="M-22 10 v-18 h8 v-8 h6 v8 h16 v-14 l6 -9 l6 9 v14 h6 v18 z" fill="#f1e4c4" stroke="{INK}" stroke-width="2.2"/>'
             f'<path d="M-16 10 v-6 h5 v6 M4 10 v-8 h5 v8" fill="none" stroke="{INK}" stroke-width="1.4"/>'
             + (f'<path d="M14 -31 v-12 l10 4 l-10 4" fill="{RED}" stroke="{INK}" stroke-width="1.2"/>' if crown else '') + '</g>')
town(605, 655, 1.3, True); town(305, 1160, 1.2, True); town(1580, 690, 1.1, True); town(1470, 1020, 1.3, True)
town(865, 735, .8); town(1310, 450, .8); town(1200, 650, .7); town(1190, 840, .7)
# ruins
for (x, y) in [(1100, 470), (905, 900)]:
    g.append(f'<path d="M{x-18} {y+10} v-14 l5 -4 v18 M{x-4} {y+10} v-22 l4 3 l3 -6 v25 M{x+10} {y+10} v-10 l6 2 v8 M{x-24} {y+10} h48" fill="none" stroke="{INK}" stroke-width="2"/>')
# Yelena great tree
g.append(f'<g transform="translate(1335 790)"><path d="M-6 30 q-4 -22 0 -40 M6 30 q4 -22 0 -40 M-18 32 q12 -8 18 -2 q6 -6 18 2" fill="none" stroke="{INK}" stroke-width="3"/>'
         f'<path d="M-46 -12 a22 22 0 0 1 26 -30 a26 26 0 0 1 44 -2 a22 22 0 0 1 22 30 a20 20 0 0 1 -26 22 a24 24 0 0 1 -40 0 a20 20 0 0 1 -26 -20 z" fill="#f1e4c4" stroke="{INK}" stroke-width="3"/>'
         f'<path d="M-20 -14 q8 6 16 0 M8 -24 q8 6 16 0 M0 2 q8 6 16 0" fill="none" stroke="{INK2}" stroke-width="1.4"/></g>')
g.append('</g>')
out += g

# compass rose
cx, cy = 1700, 1230
A(f'<g transform="translate({cx} {cy})" stroke="{INK}" stroke-width="2" filter="url(#inkbleed)">'
  '<circle r="62" fill="none"/><circle r="54" fill="none" stroke-width="1"/>'
  + ''.join(f'<path d="M0 -80 L10 -10 L0 0 Z" fill="{INK}" transform="rotate({a})"/><path d="M0 -80 L-10 -10 L0 0 Z" fill="#f1e4c4" transform="rotate({a})"/>' for a in (0, 90, 180, 270))
  + ''.join(f'<path d="M0 -50 L6 -6 L0 0 L-6 -6 Z" fill="#f1e4c4" transform="rotate({a})" stroke-width="1.3"/>' for a in (45, 135, 225, 315))
  + '</g>')
A(f'<text x="{cx}" y="{cy-92}" text-anchor="middle" font-family="IM Fell English SC, serif" font-size="34" fill="{INK}">N</text>')

# labels
def label(t, x, y, size=34, big=False, ital=False):
    fam = 'IM Fell English SC' if big else 'IM Fell English'
    st = 'italic' if ital else 'normal'
    A(f'<text x="{x}" y="{y}" text-anchor="middle" font-family="{fam}, serif" font-style="{st}" font-size="{size}" fill="{INK}" '
      f'stroke="#f1e4c4" stroke-width="{6 if big else 5}" paint-order="stroke" stroke-linejoin="round">{t}</text>')
for t, x, y, s, b in [('Turantia',320,535,46,True),('Rork',605,720,50,True),('Sartina',410,1100,46,True),('Yelena',1335,700,48,True),
                      ('Hinon',1615,760,50,True),('Umatu',1510,975,48,True)]:
    label(t, x, y, s, b)
for t, x, y, s in [('Scorched Valley',545,815,30),('Salt Sand Desert',915,545,28),('Femrul',990,605,26),('Oashim',865,780,26),
                   ('Ruins',1090,425,24),('Ruins',905,860,24),('Nio Plains',1085,745,30),('Hills of Will',1305,520,32),
                   ('Oracle',1645,525,26),('Mikelwoods',1300,930,32)]:
    label(t, x, y, s, ital=True)
A(f'<text x="770" y="845" text-anchor="middle" font-family="IM Fell English, serif" font-style="italic" font-size="26" fill="{INK}" stroke="#f1e4c4" stroke-width="5" paint-order="stroke">'
  '<tspan x="770">The Great</tspan><tspan x="770" dy="30">Gash</tspan></text>')
# title cartouche
A(f'<g transform="translate(1000 250)" filter="url(#inkbleed)"><path d="M-230 -50 h460 q-30 50 0 100 h-460 q30 -50 0 -100 z" fill="#f1e4c4" stroke="{INK}" stroke-width="3"/>'
  f'<path d="M-214 -38 h428 q-22 38 0 76 h-428 q22 -38 0 -76 z" fill="none" stroke="{INK}" stroke-width="1.2"/></g>')
A(f'<text x="1000" y="270" text-anchor="middle" font-family="IM Fell English SC, serif" font-size="62" letter-spacing="6" fill="{INK}">Talus</text>')
A('</svg>')
open(sys.argv[1], 'w').write('\n'.join(out))
