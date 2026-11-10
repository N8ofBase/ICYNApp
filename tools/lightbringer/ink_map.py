# Draws the Talus map as a hand-inked, quill-and-parchment SVG, traced from N8's painted map (TalusMap.png).
# Usage: python3 ink_map.py out.svg   (then render with Playwright: scratch render.js, IM Fell English fonts)
# 2026-11-10 v2 (N8): more natural coast/mountains/forests, towns drawn from their Terror on Talus descriptions,
# Rork and Sartina swapped, Turantia in ruins, Oracle lake-on-a-hill waterfall feeding the river to Umatu.
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
# ---------------------------------------------------------------- natural helpers
def fractal(poly, depth=4, rough=.16):
    """Midpoint displacement: turns a traced outline into a natural, ragged coast."""
    pts = list(poly)
    for d in range(depth):
        nxt = []
        for i in range(len(pts)):
            (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % len(pts)]
            L = math.hypot(x2 - x1, y2 - y1) or 1
            off = random.gauss(0, rough) * L
            nxt += [(x1, y1), ((x1 + x2) / 2 - (y2 - y1) / L * off, (y1 + y2) / 2 + (x2 - x1) / L * off)]
        pts = nxt; rough *= .62
    return pts

def lpath(pts, closed=True):
    s = 'M%.1f %.1f ' % pts[0] + ' '.join('L%.1f %.1f' % p for p in pts[1:])
    return s + (' Z' if closed else '')

def edge_dist(pt, poly):
    x, y = pt; best = 1e9
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i], poly[i - 1]
        dx, dy = x2 - x1, y2 - y1; L2 = dx * dx + dy * dy or 1
        t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / L2))
        best = min(best, math.hypot(x - x1 - t * dx, y - y1 - t * dy))
    return best

def poisson(poly, r, tries=4000, avoid=()):
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    pts = []
    for _ in range(tries):
        q = (random.uniform(min(xs), max(xs)), random.uniform(min(ys), max(ys)))
        if not inside(q, poly) or any(inside(q, a) for a in avoid): continue
        if all((q[0] - a) ** 2 + (q[1] - b) ** 2 > r * r for a, b in pts): pts.append(q)
    return pts

def blob(cx, cy, rx, ry, n=16, wob=.18):
    return [(cx + rx * math.cos(a) * (1 + random.uniform(-wob, wob)), cy + ry * math.sin(a) * (1 + random.uniform(-wob, wob)))
            for a in [i * 6.283 / n for i in range(n)]]

PARCH = '#f1e4c4'
# Book (Terror on Talus) + N8 2026-11-10: Rork = Dimoneesh fortress high in the mountains on the Talon of Talus (south-west tip);
# Sartina = Melkin city carved in a cliff face (north rim of the Scorched Valley). Oracle = lake on a hill whose waterfall
# becomes the river through Hinon, ending in a waterfall at the coastal city Umatu into the sea. Turantia lies in ruins.
TALON = [(232,1100),(300,1080),(390,1090),(440,1080),(420,1150),(380,1200),(330,1225),(275,1205),(250,1150)]
MOUNT.append(TALON)
RIVER = [(1648,512),(1650,545),(1640,575),(1618,610),(1600,650),(1588,690),(1578,730),(1560,780),(1548,830),(1530,880),
         (1505,930),(1488,980),(1470,1030),(1452,1075),(1440,1120),(1432,1168)]
FORESTS = [((1330,800),205,175),((1135,1085),95,150),((1490,520),85,70),((1700,640),62,80),((1660,880),75,95),
           ((1720,470),40,45),((1545,1010),40,40),((1235,1190),40,30)]
HOLES = [blob(1335,790,62,58,10,.05), blob(1615,618,80,62,10,.05)]   # clearings for Yelena's tree and Hinon's farms

out = []
A = out.append
A(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">')
A('''<defs>
<filter id="paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".008" numOctaves="4" seed="3"/>
<feColorMatrix values="0 0 0 0 .93  0 0 0 0 .85  0 0 0 0 .69  0 0 0 -.9 .55"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="9"/><feColorMatrix values="0 0 0 0 .35 0 0 0 0 .22 0 0 0 0 .1 0 0 0 .22 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<filter id="rough"><feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="2" seed="5" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5"/></filter>
<filter id="quill"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" result="d"/><feGaussianBlur in="d" stdDeviation=".4"/></filter>
<radialGradient id="vig" cx="50%" cy="50%" r="70%"><stop offset="55%" stop-color="#7a4a1c" stop-opacity="0"/><stop offset="100%" stop-color="#5a3210" stop-opacity=".55"/></radialGradient>
<pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="7" stroke="#4a3320" stroke-width="1" opacity=".6"/></pattern>
<pattern id="water" width="16" height="7" patternUnits="userSpaceOnUse"><path d="M0 4 q4 -3 8 0 t8 0" fill="none" stroke="#4a3320" stroke-width=".9" opacity=".5"/></pattern>
</defs>''')
edge = torn([(110,120),(1890,120),(1890,1430),(110,1430)])
for f in ('fill="#ecdcb6"', 'fill="#e6d2a6" filter="url(#paper)"', 'fill="#000" filter="url(#grain)"', 'fill="url(#vig)"',
          'fill="none" stroke="#6b4421" stroke-width="5" opacity=".55" filter="url(#rough)"'):
    A(f'<path d="{path(edge)}" {f}/>')
A(f'<rect x="160" y="165" width="1680" height="1220" fill="none" stroke="{INK}" stroke-width="3" filter="url(#rough)"/>')
A(f'<rect x="172" y="177" width="1656" height="1196" fill="none" stroke="{INK}" stroke-width="1.2" filter="url(#rough)"/>')

g = ['<g filter="url(#quill)" stroke-linecap="round" stroke-linejoin="round">']
G = g.append
coast = fractal(COAST, 5, .14); tur = fractal(TURANTIA, 4, .12)
# sea: ripple lines that follow the shore, fading out
for poly in (coast, tur):
    for k, (f, op) in enumerate([(1.025, .55), (1.05, .38), (1.08, .24), (1.115, .13)]):
        G(f'<path d="{lpath(scale(poly, f))}" fill="none" stroke="{INK2}" stroke-width="1.3" opacity="{op}" stroke-dasharray="{16-k*3} {4+k*5}"/>')
for poly in (coast, tur):
    G(f'<path d="{lpath(poly)}" fill="{PARCH}" fill-opacity=".6" stroke="{INK}" stroke-width="3.6"/>')
    G(f'<path d="{lpath(scale(poly, .992))}" fill="none" stroke="{INK}" stroke-width="1" opacity=".55"/>')
# wave strokes out at sea
for _ in range(70):
    x, y = random.uniform(190, 1810), random.uniform(200, 1360)
    if inside((x, y), scale(coast, 1.12)) or inside((x, y), scale(tur, 1.15)) or (850 < x < 1150 and y < 330): continue
    w = random.uniform(14, 24)
    G(f'<path d="M{x:.0f} {y:.0f} q{w/2:.0f} -{w*.35:.0f} {w:.0f} 0 q{w/2:.0f} -{w*.35:.0f} {w:.0f} 0" fill="none" stroke="{INK2}" stroke-width="1.3" opacity=".6"/>')
# little rocks and isles off the coast
for (x, y, r) in [(1835,610,9),(1820,1010,12),(1210,1290,10),(560,1060,8),(470,250,7),(1500,250,9)]:
    G(f'<path d="{lpath(fractal(blob(x,y,r,r*.7,8,.2),2,.1))}" fill="{PARCH}" stroke="{INK}" stroke-width="2"/>')

# Great Gash: a dark scar of hatching with cracks
gash = fractal(GASH, 3, .1)
G(f'<path d="{lpath(gash)}" fill="url(#hatch)" stroke="{INK}" stroke-width="2.2"/>')
for i in range(10):
    x = random.uniform(718, 830); y = random.uniform(760, 930); pts = [(x, y)]
    for _ in range(5): x += random.uniform(-12, 12); y += random.uniform(6, 16); pts.append((x, y))
    G('<polyline points="%s" fill="none" stroke="%s" stroke-width="1.5"/>' % (' '.join('%.0f,%.0f' % p for p in pts), INK))

# desert stipple + dunes, valley pebbles, open-land tufts
for x, y in poisson(DESERT, 13, 9000):
    G(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{random.uniform(.8,1.7):.1f}" fill="{INK2}" opacity=".7"/>')
for x, y in poisson(DESERT, 55, 600):
    w = random.uniform(16, 26)
    G(f'<path d="M{x-w:.0f} {y:.0f} q{w*.6:.0f} -{w*.45:.0f} {w*2:.0f} 0 M{x-w*.2:.0f} {y-w*.18:.0f} q{w*.4:.0f} {w*.1:.0f} {w*.7:.0f} {w*.35:.0f}" fill="none" stroke="{INK2}" stroke-width="1.2"/>')
for x, y in poisson(VALLEY, 17, 5000):
    r = random.random()
    if r < .25: G(f'<path d="M{x-5:.0f} {y:.0f} q5 -8 10 0 z" fill="none" stroke="{INK2}" stroke-width="1.1"/>')
    elif r < .8: G(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="1.3" fill="{INK2}"/>')
for x, y in poisson(coast, 46, 3000, avoid=MOUNT + [DESERT, VALLEY, GASH, HILLS]):
    if random.random() < .45:
        G(f'<path d="M{x-4:.0f} {y:.0f} l2 -7 M{x:.0f} {y:.0f} l0 -9 M{x+4:.0f} {y:.0f} l-2 -7" stroke="{INK2}" stroke-width="1.1"/>')

# rolling hills (Hills of Will), sorted back to front
for x, y in sorted(poisson(HILLS, 40, 1500), key=lambda p: p[1]):
    w = random.uniform(20, 34)
    G(f'<path d="M{x-w:.0f} {y:.0f} Q{x-w*.2:.0f} {y-w*.95:.0f} {x+w:.0f} {y:.0f}" fill="{PARCH}" stroke="{INK}" stroke-width="2"/>')
    for k in range(3):
        G(f'<path d="M{x+w*(.1+k*.22):.0f} {y-w*(.5-k*.13):.0f} l{w*.12:.0f} {w*.25:.0f}" stroke="{INK2}" stroke-width="1"/>')

# mountains: back-to-front, tallest along each range's spine, shaded east flank
def peak(x, y, s):
    wl = s * random.uniform(.75, 1.05); wr = s * random.uniform(.8, 1.15)
    tx, ty = x + random.uniform(-s * .18, s * .18), y - s * random.uniform(.95, 1.25)
    k1 = (tx - wl * .45, ty + s * .45 + random.uniform(-4, 4))
    G(f'<path d="M{x-wl:.1f} {y:.1f} L{k1[0]:.1f} {k1[1]:.1f} L{tx:.1f} {ty:.1f} L{x+wr:.1f} {y:.1f}" fill="{PARCH}" stroke="{INK}" stroke-width="2"/>')
    G(f'<path d="M{tx:.1f} {ty:.1f} L{tx+wr*.12:.1f} {ty+s*.35:.1f} L{tx+wr*.05:.1f} {y-s*.25:.1f}" fill="none" stroke="{INK}" stroke-width="1.2"/>')
    for k in range(1, 7):
        t = k / 7
        ax, ay = tx + (x + wr - tx) * t, ty + (y - ty) * t
        G(f'<line x1="{ax:.1f}" y1="{ay:.1f}" x2="{ax-wr*.3*(1-t)-3:.1f}" y2="{min(y-1, ay + s*.55):.1f}" stroke="{INK2}" stroke-width=".9"/>')
peaks = []
for m in MOUNT:
    fm = fractal(m, 2, .06)
    for q in poisson(fm, 27, 4000):
        d = edge_dist(q, m)
        peaks.append((q, 20 + min(d, 70) * .42 + random.uniform(-4, 6)))
for (x, y), s in sorted(peaks, key=lambda p: p[0][1]): peak(x, y, s)

# forests: ragged outlines, trees back to front, a few conifers
def tree(x, y, r):
    if random.random() < .2:
        G(f'<path d="M{x:.1f} {y-r*1.6:.1f} l{r*.7:.1f} {r*1.3:.1f} h-{r*.35:.1f} l{r*.55:.1f} {r*.9:.1f} h-{r*1.8:.1f} l{r*.55:.1f} -{r*.9:.1f} h-{r*.35:.1f} z" fill="{PARCH}" stroke="{INK}" stroke-width="1.5"/>'
          f'<path d="M{x:.1f} {y+r*.6:.1f} v{r*.5:.1f}" stroke="{INK}" stroke-width="1.5"/>')
        return
    G(f'<path d="M{x:.1f} {y+r*1.5:.1f} v-{r*.8:.1f}" stroke="{INK}" stroke-width="1.5"/>')
    bumps = ' '.join(f'a{r*.55:.1f} {r*.55:.1f} 0 0 1 {dx:.1f} {dy:.1f}' for dx, dy in [(r*.7,-r*.7),(r*.7,r*.4),(-r*.2,r*.8),(-r*1.2,0),(-r*.2,-r*.8)])
    G(f'<path d="M{x-r*.6:.1f} {y+r*.4:.1f} {bumps} z" fill="{PARCH}" stroke="{INK}" stroke-width="1.6"/>')
    G(f'<path d="M{x+r*.2:.1f} {y-r*.15:.1f} q{r*.3:.1f} {r*.2:.1f} {r*.2:.1f} {r*.6:.1f}" fill="none" stroke="{INK2}" stroke-width=".9"/>')
trees = []
for (cx, cy), rx, ry in FORESTS:
    f = fractal(blob(cx, cy, rx, ry, 12, .22), 3, .1)
    trees += [(q, random.uniform(8, 12.5)) for q in poisson(f, 19, 5000, avoid=HOLES) if inside(q, coast)]
for (x, y), r in sorted(trees, key=lambda p: p[0][1]): tree(x, y, r)

# Oracle: a lake on a hill, its waterfall cascading down into the river
ox, oy = 1648, 470
for k, rr in enumerate([88]):
    G(f'<path d="{path(blob(ox, oy + 6, rr, rr*.72, 14, .07))}" fill="{PARCH}" stroke="{INK}" stroke-width="{2.4 - k*.5:.1f}" stroke-dasharray="{"" if k == 0 else "10 4"}"/>')
for a in range(200, 340, 9):
    ra = math.radians(a); G(f'<line x1="{ox+92*math.cos(ra):.0f}" y1="{oy+6+66*math.sin(ra):.0f}" x2="{ox+80*math.cos(ra):.0f}" y2="{oy+6+56*math.sin(ra):.0f}" stroke="{INK2}" stroke-width="1"/>')
G(f'<path d="{lpath(fractal(blob(ox, oy, 34, 20, 10, .1), 2, .06))}" fill="url(#water)" stroke="{INK}" stroke-width="2.4"/>')
# cascade: stepped falls down the hill's south face
for i, (y0, y1) in enumerate([(492, 506), (510, 522), (526, 540)]):
    G(f'<path d="M{ox-8:.0f} {y0} v{y1-y0} M{ox-3:.0f} {y0} v{y1-y0+2} M{ox+2:.0f} {y0} v{y1-y0} M{ox+7:.0f} {y0} v{y1-y0-2}" stroke="{INK}" stroke-width="1.3"/>')
    G(f'<path d="M{ox-12:.0f} {y1+2} q12 4 24 0" fill="none" stroke="{INK}" stroke-width="1.4"/>')

# the river: meanders from the Oracle through Hinon to Umatu, widening as it goes
dense = []
for i in range(len(RIVER) - 1):
    (x1, y1), (x2, y2) = RIVER[i], RIVER[i + 1]
    for k in range(6):
        t = k / 6; dense.append((x1 + (x2 - x1) * t, y1 + (y2 - y1) * t))
dense.append(RIVER[-1])
ph = random.uniform(0, 6)
mean = []
for i, (x, y) in enumerate(dense):
    nx, ny = dense[min(i + 1, len(dense) - 1)]; px, py = dense[max(i - 1, 0)]
    dx, dy = nx - px, ny - py; L = math.hypot(dx, dy) or 1
    a = 9 * math.sin(i * .55 + ph) * (0 if i in (0, len(dense) - 1) else 1)
    mean.append((x - dy / L * a, y + dx / L * a))
seg = len(mean) // 3
for k in range(3):
    part = mean[k * seg: (k + 1) * seg + 1] if k < 2 else mean[k * seg:]
    G(f'<path d="{path(part, False)}" fill="none" stroke="{INK}" stroke-width="{4 + k*1.6:.1f}"/>')
    G(f'<path d="{path(part, False)}" fill="none" stroke="{PARCH}" stroke-width="{1.6 + k*1.4:.1f}"/>')
# the river's last fall, off the cliffs at Umatu into the sea
mx, my = RIVER[-1]
G(f'<path d="M{mx-7} {my} v26 M{mx-2} {my} v30 M{mx+3} {my} v28 M{mx+8} {my} v24" stroke="{INK}" stroke-width="1.4"/>')
for k in range(7):
    G(f'<circle cx="{mx + random.uniform(-16,16):.0f}" cy="{my + 32 + random.uniform(-4,6):.0f}" r="{random.uniform(1.5,3.5):.1f}" fill="none" stroke="{INK2}" stroke-width="1"/>')
G(f'<path d="M{mx-26} {my+40} q13 -6 26 0 t26 0" fill="none" stroke="{INK2}" stroke-width="1.3"/>')

# Lake Femrul, the eastern crater
G(f'<path d="{lpath(fractal(blob(985, 640, 36, 16, 10, .12), 2, .08))}" fill="url(#water)" stroke="{INK}" stroke-width="2"/>')
G(f'<path d="{lpath(fractal(blob(1740, 822, 30, 23, 12, .1), 2, .07))}" fill="url(#hatch)" stroke="{INK}" stroke-width="2.4"/>'
  f'<ellipse cx="1740" cy="824" rx="12" ry="9" fill="{INK}" opacity=".65"/>')

def crystal(x, y, s=1):
    G(f'<g transform="translate({x} {y}) scale({s})"><path d="M0 -14 L7 -2 L0 10 L-7 -2 Z" fill="{PARCH}" stroke="{INK}" stroke-width="1.6"/>'
      f'<path d="M-7 -2 h14 M0 -14 v24" stroke="{INK2}" stroke-width=".9"/>'
      + ''.join(f'<line x1="{11*math.cos(math.radians(a)):.1f}" y1="{-2+11*math.sin(math.radians(a)):.1f}" x2="{16*math.cos(math.radians(a)):.1f}" y2="{-2+16*math.sin(math.radians(a)):.1f}" stroke="{INK2}" stroke-width="1"/>' for a in range(0, 360, 45))
      + '</g>')

def cottage(x, y, s=1):
    G(f'<g transform="translate({x:.1f} {y:.1f}) scale({s})"><path d="M-9 6 v-9 l9 -8 l9 8 v9 z" fill="{PARCH}" stroke="{INK}" stroke-width="1.6"/>'
      f'<path d="M-2 6 v-5 h4 v5" fill="none" stroke="{INK}" stroke-width="1.2"/><path d="M-9 -3 l9 -8 l9 8" fill="none" stroke="{INK}" stroke-width="2.4"/></g>')

# --- Hinon: quiet fishing and farming village, Life Crystal among farmland and gardens, statue of Hinon above the great tomb
hx, hy = 1615, 612   # N8: just below the Oracle falls, farmland on both banks
for (fx, fy, w, h, a) in [(-50,-24,28,18,-8),(-56,0,26,18,6),(-48,26,26,16,-4),(42,-26,28,18,8),(48,0,28,18,-6),(38,26,26,16,4)]:
    # furrowed fields: no hard box, just a soft hedge line and rows that change direction field to field
    rows = ''.join(f'<path d="M{-w/2+2} {-h/2+k} q{w/2} {random.uniform(-1.5,1.5):.1f} {w-4} 0" fill="none" stroke="{INK2}" stroke-width=".9"/>' for k in range(3, int(h), 4))
    G(f'<g transform="translate({hx+fx} {hy+fy}) rotate({a + random.choice((0, 90))})"><path d="{lpath(fractal([(-w/2,-h/2),(w/2,-h/2),(w/2,h/2),(-w/2,h/2)],2,.04))}" fill="none" stroke="{INK}" stroke-width="1" stroke-dasharray="3 2"/>{rows}</g>')
for (cx, cy) in [(-22,-10),(-24,12),(20,-12),(18,12)]: cottage(hx + cx, hy + cy, .85)
crystal(hx - 4, hy + 40, .7)
# statue on its tomb
G(f'<g transform="translate({hx-46} {hy+52})"><rect x="-13" y="2" width="26" height="10" fill="{PARCH}" stroke="{INK}" stroke-width="1.6"/>'
  f'<path d="M-9 2 v-4 h18 v4" fill="none" stroke="{INK}" stroke-width="1.4"/><circle cx="0" cy="-17" r="3.5" fill="{PARCH}" stroke="{INK}" stroke-width="1.4"/>'
  f'<path d="M-5 -2 l1 -11 h8 l1 11 M4 -12 l7 -9 M11 -21 l-3 -2 h7 z" fill="none" stroke="{INK}" stroke-width="1.5"/></g>')
# little boats on the river by the village
G(f'<path d="M{hx-14} {hy-8} q7 5 14 0 z M{hx-7} {hy-8} v-8 l5 5 z" fill="{PARCH}" stroke="{INK}" stroke-width="1.2"/>')

# --- Rork: wheck stone fortress high on the Talon of Talus, Life Crystal in a grand courtyard
rx_, ry_ = 318, 1150
G(f'<g transform="translate({rx_} {ry_})">'
  f'<path d="M-62 30 L-40 -6 L-20 6 L0 -22 L22 4 L44 -8 L64 30 Z" fill="{PARCH}" stroke="{INK}" stroke-width="2"/>'
  + ''.join(f'<line x1="{x}" y1="{y}" x2="{x-8}" y2="30" stroke="{INK2}" stroke-width=".9"/>' for x, y in [(4,-16),(10,-9),(16,-2),(28,0),(36,-4),(48,4),(56,16)])
  + f'<path d="M-36 -2 h72 v-26 h-72 z" fill="#fbf5e6" stroke="{INK}" stroke-width="2.2"/>'
  + ''.join(f'<path d="M{x-7} -2 v-38 h14 v38 M{x-7} -40 v-5 h4 v4 h3 v-4 h4 v5" fill="#fbf5e6" stroke="{INK}" stroke-width="2"/>' for x in (-36, 36))
  + f'<path d="M-8 -28 v-26 l8 -10 l8 10 v26" fill="#fbf5e6" stroke="{INK}" stroke-width="2"/><path d="M0 -64 v-10 l9 3 l-9 3" fill="{RED}" stroke="{INK}" stroke-width="1.1"/>'
  + ''.join(f'<path d="M{x} -28 v-4 h5 v4" fill="none" stroke="{INK}" stroke-width="1.4"/>' for x in (-28, -18, 12, 22))
  + f'<path d="M-3 -2 v-9 a3 3 0 0 1 6 0 v9" fill="{INK}"/></g>')
crystal(rx_ - 18, ry_ - 12, .55)

# --- Sartina: an intricate city carved in a cliff face, tunnels leading deep underground to a grerde oasis
sx, sy = 606, 650
top = [(-78, 22), (-72, -20)]
x = -72
while x < 72:
    x += random.uniform(8, 16); top.append((x, -34 - random.uniform(0, 22)))
top += [(80, -18), (84, 22)]
G(f'<g transform="translate({sx} {sy})"><path d="{lpath(top)} Z" fill="{PARCH}" stroke="{INK}" stroke-width="2.4"/>')
for x in range(-70, 80, 5):   # rock face hatching, heavier on the shaded east side
    y0 = max(py for px, py in top if abs(px - x) < 12) if False else -18 - random.uniform(0, 12)
    G(f'<line x1="{x}" y1="{y0:.0f}" x2="{x + random.uniform(-2,2):.0f}" y2="20" stroke="{INK2}" stroke-width="{.6 if x < 20 else .9}" opacity=".75"/>')
for y in (-14, 0, 13):          # carved terraces
    G(f'<path d="M-68 {y} q34 {random.uniform(-3,3):.0f} 68 0 t70 0" fill="none" stroke="{INK}" stroke-width="1.2"/>')
for _ in range(26):             # windows and doorways cut into the rock
    x, y = random.uniform(-64, 70), random.choice((-22, -8, 6, 18)) + random.uniform(-2, 1)
    w = random.uniform(2.5, 4.5)
    G(f'<path d="M{x-w/2:.1f} {y:.1f} v-{w*1.4:.1f} a{w/2:.1f} {w/2:.1f} 0 0 1 {w:.1f} 0 v{w*1.4:.1f} z" fill="{INK}"/>')
G(f'<path d="M-4 22 v-9 a7 7 0 0 1 14 0 v9 z" fill="{INK}"/><path d="M-30 22 l8 -8 h10 l8 -8 h10" fill="none" stroke="{INK}" stroke-width="1.3"/></g>')
crystal(sx + 2, sy + 44, .55)

# --- Umatu: thriving coastal city with walls of the Lazur Shield, the first temple of Icosa, a harbor at the river's fall
ux, uy = 1478, 1118
G(f'<g transform="translate({ux} {uy})">'
  f'<path d="M-46 22 v-26 l10 -4 v-8 h8 v8 h20 v-6 h8 v6 h22 v-8 h8 v8 l10 4 v26 z" fill="{PARCH}" stroke="{INK}" stroke-width="2"/>'
  + ''.join(f'<path d="M{x} -4 v-5 h4 v5" fill="none" stroke="{INK}" stroke-width="1.2"/>' for x in (-30, -20, 0, 10, 20))
  + f'<path d="M-12 -10 v-14 a12 12 0 0 1 24 0 v14 z" fill="#fbf5e6" stroke="{INK}" stroke-width="2"/><path d="M0 -36 v-8 M-4 -40 h8" stroke="{INK}" stroke-width="1.6"/>'
  + f'<path d="M-6 -10 v-8 M0 -10 v-8 M6 -10 v-8" stroke="{INK2}" stroke-width="1.2"/>'
  + ''.join(f'<path d="M{x-6} 22 v-10 l6 -5 l6 5 v10" fill="{PARCH}" stroke="{INK}" stroke-width="1.4"/>' for x in (-34, 30))
  + '</g>')
# pier and ships in the bay
G(f'<path d="M{ux+40} {uy+44} h40" stroke="{INK}" stroke-width="2.4"/>')
for bx, by in [(ux + 92, uy + 64), (ux + 44, uy + 82)]:
    G(f'<path d="M{bx-14} {by} q14 9 28 0 z" fill="{PARCH}" stroke="{INK}" stroke-width="1.5"/><path d="M{bx} {by} v-22 M{bx} {by-20} q10 6 0 14" fill="none" stroke="{INK}" stroke-width="1.4"/>')
crystal(mx - 2, my - 12, .5)   # the holy crystal cave behind the waterfall

# --- Yelena: a gigantic Riverwood tree city of trunks and branches, the sealed vault beneath its roots
G(f'<g transform="translate(1335 798) scale(.82)">'
  f'<path d="M-40 42 q20 -10 28 -24 M40 42 q-20 -10 -28 -24 M-22 46 q12 -10 14 -26 M22 46 q-12 -10 -14 -26 M0 46 v-18" fill="none" stroke="{INK}" stroke-width="2.4"/>'
  f'<path d="M-12 20 q-6 -28 -2 -52 M12 20 q6 -28 2 -52 M-8 -14 q-18 -10 -34 -22 M8 -20 q18 -8 34 -20 M-4 -30 q-10 -14 -12 -30 M4 -30 q10 -16 18 -28" fill="none" stroke="{INK}" stroke-width="3"/>'
  f'<path d="M-62 -30 a24 24 0 0 1 28 -32 a28 28 0 0 1 48 -4 a24 24 0 0 1 26 30 a22 22 0 0 1 -18 30 q-10 8 -24 2 q-14 8 -30 0 q-16 4 -26 -6 a20 20 0 0 1 -4 -20 z" fill="{PARCH}" stroke="{INK}" stroke-width="3"/>'
  f'<path d="M-30 -40 q8 6 16 0 M6 -52 q8 6 16 0 M-44 -22 q8 6 16 0 M24 -30 q8 6 16 0 M-8 -34 q8 6 16 0" fill="none" stroke="{INK2}" stroke-width="1.4"/>'
  + ''.join(f'<path d="M{x-6} {y} h12 M{x-4} {y} v-7 h8 v7" fill="none" stroke="{INK}" stroke-width="1.3"/>' for x, y in [(-34,-14),(30,-10),(-6,-58),(22,-46),(-26,-44)])
  + f'<path d="M-12 46 h24 v8 h-24 z" fill="url(#hatch)" stroke="{INK}" stroke-width="1.4"/></g>')
crystal(1335, 793, .4)

# --- Turantia: the shattered city of Light, ruins on its isolated plateau
tur_in = scale(TURANTIA, .86)
for i in range(0, len(tur_in)):
    (x1, y1), (x2, y2) = tur_in[i], tur_in[(i + 1) % len(tur_in)]
    for k in range(6):
        t = k / 6; x, y = x1 + (x2 - x1) * t, y1 + (y2 - y1) * t
        cx_, cy_ = 320, 430; dx, dy = x - cx_, y - cy_; L = math.hypot(dx, dy)
        G(f'<line x1="{x:.0f}" y1="{y:.0f}" x2="{x + dx/L*18:.0f}" y2="{y + dy/L*18:.0f}" stroke="{INK2}" stroke-width="1.2"/>')   # cliff hachures
def broken_tower(x, y, h, w=12):
    G(f'<path d="M{x-w/2:.0f} {y:.0f} v-{h:.0f} l{w*.25:.0f} {random.uniform(4,9):.0f} l{w*.25:.0f} -{random.uniform(6,12):.0f} l{w*.2:.0f} {random.uniform(3,8):.0f} l{w*.3:.0f} -{random.uniform(2,6):.0f} V{y:.0f} z" fill="#fbf5e6" stroke="{INK}" stroke-width="1.8"/>'
      f'<path d="M{x-2:.0f} {y-h*.55:.0f} v-6 a2 2 0 0 1 4 0 v6" fill="none" stroke="{INK}" stroke-width="1.1"/>')
for x, y, h in [(262,440,14),(305,412,20),(345,428,12),(382,452,10),(236,482,8)]: broken_tower(x, y, h, 10)   # stumps only
for _ in range(14):   # rubble heaps
    x, y = random.uniform(230, 410), random.uniform(370, 510)
    if not inside((x, y), tur_in): continue
    w = random.uniform(10, 20)
    G(f'<path d="M{x-w:.0f} {y:.0f} l{w*.3:.0f} -{w*.35:.0f} l{w*.25:.0f} {w*.1:.0f} l{w*.3:.0f} -{w*.3:.0f} l{w*.4:.0f} {w*.25:.0f} l{w*.3:.0f} -{w*.05:.0f} l{w*.45:.0f} {w*.35:.0f} z" fill="{PARCH}" stroke="{INK}" stroke-width="1.4"/>'
      f'<path d="M{x-w*.4:.0f} {y-w*.12:.0f} l3 -3 M{x+w*.2:.0f} {y-w*.15:.0f} l3 -2" stroke="{INK2}" stroke-width="1"/>')
# broken wall runs, toppled columns, rubble
for (x1, y1, x2, y2) in [(225,500,285,505),(300,505,350,500),(365,492,410,470),(225,500,215,455)]:
    G(f'<path d="M{x1} {y1} L{(x1+x2)/2:.0f} {(y1+y2)/2-3:.0f} L{x2} {y2}" fill="none" stroke="{INK}" stroke-width="5"/>'
      f'<path d="M{x1} {y1} L{(x1+x2)/2:.0f} {(y1+y2)/2-3:.0f} L{x2} {y2}" fill="none" stroke="{PARCH}" stroke-width="2"/>')
for (x, y, a) in [(280,370,20),(360,380,-35),(250,410,70),(395,415,10)]:
    G(f'<g transform="translate({x} {y}) rotate({a})"><rect x="-14" y="-3" width="28" height="6" fill="{PARCH}" stroke="{INK}" stroke-width="1.4"/><path d="M-6 -3 v6 M3 -3 v6" stroke="{INK}" stroke-width="1"/></g>')
for _ in range(90):
    x, y = random.uniform(220, 420), random.uniform(350, 520)
    if inside((x, y), tur_in): G(f'<path d="M{x:.0f} {y:.0f} l3 -4 l4 3 l-2 3 z" fill="{INK2}" opacity=".8"/>')

# small settlements and old ruins inland (from N8's painted map)
for (x, y) in [(865, 735), (1310, 450), (1200, 650), (1190, 845)]:
    for k in range(3): cottage(x + (k - 1) * 14 + random.uniform(-2, 2), y + (k % 2) * 6, .8)
for (x, y) in [(1100, 470), (905, 900)]:
    broken_tower(x - 12, y + 10, 22, 10); broken_tower(x + 6, y + 10, 30, 10)
    G(f'<path d="M{x-26} {y+10} h52" stroke="{INK}" stroke-width="2"/>')
g.append('</g>')
out += g

# compass rose
cx, cy = 1700, 1240
A(f'<g transform="translate({cx} {cy})" stroke="{INK}" stroke-width="2" filter="url(#quill)">'
  '<circle r="62" fill="none"/><circle r="54" fill="none" stroke-width="1"/>'
  + ''.join(f'<path d="M0 -80 L10 -10 L0 0 Z" fill="{INK}" transform="rotate({a})"/><path d="M0 -80 L-10 -10 L0 0 Z" fill="{PARCH}" transform="rotate({a})"/>' for a in (0, 90, 180, 270))
  + ''.join(f'<path d="M0 -50 L6 -6 L0 0 L-6 -6 Z" fill="{PARCH}" transform="rotate({a})" stroke-width="1.3"/>' for a in (45, 135, 225, 315))
  + '</g>')
A(f'<text x="{cx}" y="{cy-92}" text-anchor="middle" font-family="IM Fell English SC, serif" font-size="34" fill="{INK}">N</text>')

def label(t, x, y, size=34, big=False, ital=False):
    fam = 'IM Fell English SC' if big else 'IM Fell English'
    st = 'italic' if ital else 'normal'
    A(f'<text x="{x}" y="{y}" text-anchor="middle" font-family="{fam}, serif" font-style="{st}" font-size="{size}" fill="{INK}" '
      f'stroke="{PARCH}" stroke-width="{6 if big else 5}" paint-order="stroke" stroke-linejoin="round">{t}</text>')
for t, x, y, s, b in [('Turantia',320,565,46,True),('Sartina',606,735,48,True),('Rork',330,1252,48,True),('Yelena',1335,728,44,True),
                      ('Hinon',1712,650,44,True),('Umatu',1372,1100,46,True)]:
    label(t, x, y, s, b)
for t, x, y, s in [('Scorched Valley',545,830,30),('Salt Sand Desert',915,545,28),('Femrul',990,606,26),('Oashim',865,775,26),
                   ('Ruins',1100,438,24),('Ruins',905,868,24),('Nio Plains',1085,745,30),('Hills of Will',1305,525,32),
                   ('Oracle',1648,382,28),('Mikelwoods',1300,960,32),('The Talon',395,1060,24)]:
    label(t, x, y, s, ital=True)
A(f'<text x="770" y="845" text-anchor="middle" font-family="IM Fell English, serif" font-style="italic" font-size="26" fill="{INK}" stroke="{PARCH}" stroke-width="5" paint-order="stroke">'
  '<tspan x="770">The Great</tspan><tspan x="770" dy="30">Gash</tspan></text>')
A(f'<g transform="translate(1000 250)" filter="url(#quill)"><path d="M-230 -50 h460 q-30 50 0 100 h-460 q30 -50 0 -100 z" fill="{PARCH}" stroke="{INK}" stroke-width="3"/>'
  f'<path d="M-214 -38 h428 q-22 38 0 76 h-428 q22 -38 0 -76 z" fill="none" stroke="{INK}" stroke-width="1.2"/></g>')
A(f'<text x="1000" y="270" text-anchor="middle" font-family="IM Fell English SC, serif" font-size="62" letter-spacing="6" fill="{INK}">Talus</text>')
A('</svg>')
open(sys.argv[1], 'w').write('\n'.join(out))
