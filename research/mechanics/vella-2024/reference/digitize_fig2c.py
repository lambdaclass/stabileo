"""Reads the simulation points and the experiment crosses off Fig. 2c of arXiv:2312.13908v2.

Usage: python3 -I digitize_fig2c.py <2312.13908v2.pdf> <out.csv>   (needs PyMuPDF)

The panel is a raster (page 3, the image whose bounding box starts at x = 391 pt). Axes are
calibrated on the frame's tick marks: bottom ticks at |mu_dot| = 0, 0.2, 0.4, 0.6 and left
ticks at A = 20 and 40 (A = 0 is the bottom of the frame). Orange (simulation) markers are
connected components. A component of n marker areas is n overlapping markers, located by k-means on its
pixels. Where the markers merge into a line along A ~ 1, the line is sampled every 5.17 px,
the spacing of the isolated markers. Black crosses outside the legend are the experiments.
Values are reported to the pixel; one pixel is 0.00105 in mu_dot and 0.102 in A.
"""
import csv
import sys

import fitz

doc = fitz.open(sys.argv[1])
page = doc[2]
xref = next(i["xref"] for i in page.get_image_info(xrefs=True) if abs(i["bbox"][0] - 391.4) < 1)
pix = fitz.Pixmap(doc, xref)
if pix.n - pix.alpha >= 4:
    pix = fitz.Pixmap(fitz.csRGB, pix)
W, H, N, S = pix.width, pix.height, pix.n, pix.samples


def rgb(x, y):
    i = (y * W + x) * N
    return S[i], S[i + 1], S[i + 2]


def grey(x, y):
    return sum(rgb(x, y)) / 3


rows = [y for y in range(H) if sum(max(rgb(x, y)) < 80 for x in range(W)) > 0.6 * W]
cols = [x for x in range(W) if sum(max(rgb(x, y)) < 80 for y in range(H)) > 0.5 * H]
top, bottom, left, right = min(rows), max(rows), min(cols), max(cols)


def runs(values):
    groups, current = [], [values[0]]
    for v in values[1:]:
        if v == current[-1] + 1:
            current.append(v)
        else:
            groups.append(current)
            current = [v]
    groups.append(current)
    return [sum(g) / len(g) for g in groups]


ticks_x = runs([x for x in range(left + 6, right - 6) if sum(255 - grey(x, y) for y in range(bottom - 10, bottom - 2)) > 1000])
ticks_y = runs([y for y in range(top + 6, bottom - 6) if sum(255 - grey(x, y) for x in range(left + 3, left + 11)) > 1400])
x0 = ticks_x[0]
x06 = next(t for t in ticks_x if abs((t - x0) - 3 * (ticks_x[1] - x0)) < 3)
y20, y40 = next((t, u) for t in ticks_y for u in ticks_y if u < t and abs((t - u) - (bottom - 1.5 - t)) < 3)
per_a = (y20 - y40) / 20.0
y0 = y20 + 20 * per_a
mu = lambda x: (x - x0) * 0.6 / (x06 - x0)
amp = lambda y: (y0 - y) / per_a


def components(test):
    pts = {(x, y) for y in range(top + 2, bottom - 1) for x in range(left + 2, right - 1) if test(rgb(x, y))}
    seen, out = set(), []
    for p in sorted(pts):
        if p in seen:
            continue
        stack, comp = [p], []
        seen.add(p)
        while stack:
            q = stack.pop()
            comp.append(q)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    r = (q[0] + dx, q[1] + dy)
                    if r in pts and r not in seen:
                        seen.add(r)
                        stack.append(r)
        out.append(comp)
    return out


def centres(pixels, count):
    """Centres of `count` overlapping round markers: k-means on the pixels, seeded along x."""
    ordered = sorted(pixels)
    seeds = [ordered[int((k + 0.5) * len(ordered) / count)] for k in range(count)]
    centre = [(float(x), float(y)) for x, y in seeds]
    for _ in range(50):
        groups = [[] for _ in centre]
        for x, y in pixels:
            k = min(range(count), key=lambda i: (x - centre[i][0]) ** 2 + (y - centre[i][1]) ** 2)
            groups[k].append((x, y))
        centre = [(sum(p[0] for p in g) / len(g), sum(p[1] for p in g) / len(g)) if g else centre[i] for i, g in enumerate(groups)]
    return sorted(centre)


legend = lambda c: min(p[0] for p in c) > 590 and max(p[1] for p in c) < 300
orange = [c for c in components(lambda c: c[0] > 180 and 60 < c[1] < 150 and c[2] < 90) if len(c) >= 6 and not legend(c)]
single = sorted(len(c) for c in orange if len(c) < 40)[len([c for c in orange if len(c) < 40]) // 2]
points = []
for c in orange:
    xs = [p[0] for p in c]
    if max(xs) - min(xs) > 40:
        x = min(xs) + 2.0
        while x < max(xs) - 1:
            column = [p[1] for p in c if abs(p[0] - x) < 2.6]
            if column:
                points.append(("simulation", mu(x), amp(sum(column) / len(column))))
            x += 5.17
        continue
    count = max(1, round(len(c) / single))
    for cx, cy in centres(c, count):
        points.append(("simulation", mu(cx), amp(cy)))
crosses = [c for c in components(lambda c: max(c) < 90) if 60 <= len(c) <= 130 and not legend(c)]
for c in crosses:
    xs, ys = [p[0] for p in c], [p[1] for p in c]
    if max(xs) - min(xs) < 20 and max(ys) - min(ys) < 20:
        points.append(("experiment", mu((min(xs) + max(xs)) / 2), amp((min(ys) + max(ys)) / 2)))
points.sort()
with open(sys.argv[2], "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["series", "mu_dot", "amplification"])
    for s, m, a in points:
        w.writerow([s, f"{m:.4f}", f"{a:.2f}"])
print(f"frame x {left}-{right} y {top}-{bottom}; ticks x {ticks_x}; y {ticks_y}; marker area {single}; {len(points)} points")
