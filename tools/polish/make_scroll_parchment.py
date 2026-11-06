#!/usr/bin/env python3
"""Paints the in-game scroll parchment (RGBA webp, torn edges) in the same style as the
Print & Play rulebook parchment (rulebook-2026/print-and-play/source/parchment.py).
Used as a CSS border-image (slice 90) so the torn edge never stretches."""
import numpy as np, sys, pathlib
from PIL import Image, ImageFilter
W = H = 900
rng = np.random.default_rng(int(sys.argv[1]) if len(sys.argv) > 1 else 11)

def fnoise(w, h, octaves=6, base=4, persist=.55):
    out = np.zeros((h, w), np.float32); amp = 1; tot = 0
    for o in range(octaves):
        n = base * 2 ** o
        g = rng.random((max(2, int(n * h / w)) + 1, n + 1)).astype(np.float32)
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        out += np.asarray(im, np.float32) / 255 * amp; tot += amp; amp *= persist
    out /= tot
    return (out - out.min()) / (out.max() - out.min())

def mix(a, b, t):
    t = t[..., None] if t.ndim == 2 else t
    return a * (1 - t) + b * t

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
M = 34  # margin to the torn edge
edge = fnoise(W, H, 6, 10); big = fnoise(W, H, 4, 4)
jag = (big - .5) * 26 + (edge - .5) * 14 + (fnoise(W, H, 3, 70) - .5) * 6
d = np.minimum.reduce([xx - M, W - M - xx, yy - M, H - M - yy]) + jag
alpha = np.clip(d / 2.2, 0, 1)

cx, cy = W * .5, H * .48
r = np.sqrt(((xx - cx) / (W * .5)) ** 2 + ((yy - cy) / (H * .5)) ** 2)
cream = np.array([253, 247, 230], np.float32); tan = np.array([240, 212, 156], np.float32)
gold = np.array([226, 166, 82], np.float32); burnt = np.array([110, 62, 28], np.float32)
m1 = fnoise(W, H, 6, 5); m2 = fnoise(W, H, 6, 9)
t = np.clip(r * 1.08 + (m1 - .5) * .6, 0, 1)
paper = mix(cream, tan, np.clip(t * 1.4 - .3, 0, 1))
paper = mix(paper, gold, np.clip((t - .58) * 2.2, 0, 1) * .9)
st = fnoise(W, H, 5, 4)
paper = mix(paper, np.array([226, 190, 132], np.float32), np.clip((st - .66) * 4, 0, 1) * .28 * np.clip(r * 1.4, 0, 1))
paper = mix(paper, cream, np.clip((.32 - m2) * 3, 0, 1) * .45)
rim = np.clip(1 - d / 80, 0, 1) ** 1.4
paper = mix(paper, gold, rim * .8)
paper = mix(paper, np.array([196, 120, 52], np.float32), np.clip(1 - d / 26, 0, 1) * .6)
paper = mix(paper, burnt, np.clip(1 - d / 9, 0, 1) * .85)
grain = rng.random((H, W)).astype(np.float32)
fib = np.asarray(Image.fromarray((grain * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(1)), np.float32) / 255 - .5
paper += (fib * 14)[..., None]
img = np.dstack([np.clip(paper, 0, 255), alpha * 255]).astype(np.uint8)
out = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else pathlib.Path(__file__).parent / 'scroll-parchment.webp')
Image.fromarray(img, 'RGBA').save(out, 'WEBP', quality=72, method=6)
print(out, out.stat().st_size)
