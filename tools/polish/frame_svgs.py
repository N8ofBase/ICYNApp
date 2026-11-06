#!/usr/bin/env python3
"""Corner + center flourishes for the scroll frame, printed as CSS data URIs."""
import urllib.parse
C, G = '#8f2f17', '#a97f2a'
corner = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="none" stroke-linecap="round">
<path d="M3 3h30M3 3v30" stroke="{C}" stroke-width="3"/>
<path d="M9 40C9 22 22 9 40 9" stroke="{G}" stroke-width="1.6"/>
<path d="M40 9c7 0 9 7 4.5 9s-6.5-2.5-3-4.5" stroke="{C}" stroke-width="1.6"/>
<path d="M9 40c0 7 7 9 9 4.5s-2.5-6.5-4.5-3" stroke="{C}" stroke-width="1.6"/>
<path d="M17 28c3-6 5-8 11-11" stroke="{G}" stroke-width="1.2"/></g>
<rect x="9" y="9" width="10" height="10" transform="rotate(45 14 14)" fill="{C}"/><rect x="11.5" y="11.5" width="5" height="5" transform="rotate(45 14 14)" fill="{G}"/>
<circle cx="50" cy="4" r="1.8" fill="{G}"/><circle cx="4" cy="50" r="1.8" fill="{G}"/></svg>'''
center = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 20"><g fill="none" stroke="{C}" stroke-width="1.6" stroke-linecap="round">
<path d="M38 10C30 3 20 3 16 9c-3 5 3 8 6 4.5s0-6-3-3.5"/><path d="M58 10c8-7 18-7 22-1 3 5-3 8-6 4.5s0-6 3-3.5"/>
<path d="M4 10h10M82 10h10" stroke="{G}"/></g><rect x="42" y="4" width="12" height="12" transform="rotate(45 48 10)" fill="{C}"/><rect x="45" y="7" width="6" height="6" transform="rotate(45 48 10)" fill="{G}"/></svg>'''
def uri(svg, tf=None):
    if tf: svg = svg.replace('<g ', f'<g transform="{tf}"><g ', 1).replace('</svg>', '</g></svg>') if False else svg
    svg = ' '.join(svg.split()).replace('"', "'")
    return 'url("data:image/svg+xml,' + urllib.parse.quote(svg, safe=":/=' ,()") + '")'
def flip(svg, sx, sy, w=64, h=64):
    inner = svg[svg.index('>') + 1:svg.rindex('</svg>')]
    return svg[:svg.index('>') + 1] + f'<g transform="translate({w if sx < 0 else 0} {h if sy < 0 else 0}) scale({sx} {sy})">' + inner + '</g></svg>'
cs = [uri(flip(corner, sx, sy)) for sx, sy in ((1, 1), (-1, 1), (1, -1), (-1, -1))]
ct = uri(center); cb = uri(flip(center, 1, -1, 96, 20))
knob = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40"><defs>
<linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22100a"/><stop offset=".22" stop-color="#6e3f1a"/><stop offset=".4" stop-color="#c98d50"/><stop offset=".52" stop-color="#93592a"/><stop offset=".8" stop-color="#3f2210"/><stop offset="1" stop-color="#180a04"/></linearGradient>
<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3e0e"/><stop offset=".3" stop-color="#f6dc8e"/><stop offset=".5" stop-color="#c99b3a"/><stop offset="1" stop-color="#46300a"/></linearGradient></defs><g>
<rect x="47" y="14" width="13" height="12" fill="url(#w)"/>
<rect x="43" y="9.5" width="5" height="21" rx="1.5" fill="url(#b)"/>
<ellipse cx="36" cy="20" rx="7.5" ry="13" fill="url(#w)"/>
<path d="M32 9.5q-2 10.5 0 21M40 9.5q2 10.5 0 21" fill="none" stroke="#1e0d05" stroke-width=".9" opacity=".7"/>
<rect x="27" y="12" width="3.5" height="16" rx="1.2" fill="url(#b)"/>
<rect x="21.5" y="15" width="6" height="10" fill="url(#w)"/>
<ellipse cx="13.5" cy="20" rx="9.5" ry="10.5" fill="url(#w)"/>
<ellipse cx="13.5" cy="15.5" rx="5.5" ry="2.2" fill="#fff" opacity=".2"/>
<circle cx="3.6" cy="20" r="3.6" fill="url(#b)"/></g></svg>'''
print('--sc-knob-l:' + uri(knob) + ';--sc-knob-r:' + uri(flip(knob, -1, 1, 60, 40)) + ';')
print('--sc-corners:' + ','.join(cs) + ',' + ct + ',' + cb + ';')
