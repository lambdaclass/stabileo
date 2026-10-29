"""Usage: python3 -I extract_vector_figures.py <paper.pdf> <out.json>   (needs PyMuPDF)

Extract plotted data from the vector figures 7, 8, 9 of Grossman & Boudaoud, PRR 8, 013224 (2026).
Axis calibration uses the major tick marks drawn in the PDF (positions in PDF points)."""
import sys, json, pymupdf
import numpy as np
doc = pymupdf.open(sys.argv[1]); out = sys.argv[2]
def cal(p0, v0, p1, v1):
    return lambda p: v0 + (p - p0) * (v1 - v0) / (p1 - p0)
def pts(d):
    P = []
    for it in d['items']:
        if it[0] == 'l': P += [it[1], it[2]]
        elif it[0] == 'c': P += [it[1], it[4]]
    return P
def polyline(d, fx, fy):
    P = pts(d); xs = []; ys = []
    for p in P:
        x, y = fx(p.x), fy(p.y)
        if xs and abs(xs[-1]-x) < 1e-9 and abs(ys[-1]-y) < 1e-9: continue
        xs.append(x); ys.append(y)
    return xs, ys
def band(d, fx, fy, grid):
    P = [(fx(p.x), fy(p.y)) for p in pts(d)]
    segs = list(zip(P, P[1:] + P[:1]))
    lo, hi = [], []
    for g in grid:
        ys = []
        for (x0, y0), (x1, y1) in segs:
            if (x0 - g) * (x1 - g) <= 0 and x0 != x1:
                ys.append(y0 + (g - x0) * (y1 - y0) / (x1 - x0))
        lo.append(min(ys) if ys else None); hi.append(max(ys) if ys else None)
    return lo, hi
res = {}
# Fig 7 (page index 6): dots = filled circles, line = drawing with many segments
p = doc[6]; D = p.get_drawings()
fx = cal(336.1, 0.0, 545.2, 3.0); fy = cal(207.4, 0.0, 76.8, 1.0)
dots = [d for d in D if d['type'] == 'f' and len(d['items']) == 8 and d['rect'].y1 < 215]
line = [d for d in D if d['type'] == 's' and len(d['items']) > 500][0]
res['fig7'] = {
  'simulation_dots': [[fx((d['rect'].x0+d['rect'].x1)/2), fy((d['rect'].y0+d['rect'].y1)/2)] for d in dots],
  'calculation_line': list(map(list, zip(*polyline(line, fx, fy)))),
}
fx8 = cal(336.4, 0.0, 552.5, 0.5); fy8 = cal(672.9, 0.6, 564.4, 1.0)
line8 = [d for d in D if d['type'] == 's' and len(d['items']) == 177][0]
band8 = [d for d in D if d['type'] == 'f' and len(d['items']) == 572][0]
grid = [round(0.0 + 0.01*i, 2) for i in range(51)]
lo, hi = band(band8, fx8, fy8, grid)
res['fig8'] = {'mean_line': list(map(list, zip(*polyline(line8, fx8, fy8)))), 'band_grid': grid, 'band_lo': lo, 'band_hi': hi}
p = doc[7]; D = p.get_drawings()
fx9 = cal(73.4, 0.0, 289.5, 0.5); fy9 = cal(189.2, 0.3, 90.5, 0.8)
res['fig9'] = {}
for name, nitems, bitems in [('B', 142, 360), ('G', 323, 657)]:
    l = [d for d in D if d['type'] == 's' and len(d['items']) == nitems][0]
    b = [d for d in D if d['type'] == 'f' and len(d['items']) == bitems][0]
    lo, hi = band(b, fx9, fy9, grid)
    res['fig9'][name] = {'mean_line': list(map(list, zip(*polyline(l, fx9, fy9)))), 'band_lo': lo, 'band_hi': hi}
res['fig9']['band_grid'] = grid
def rnd(x):
    if isinstance(x, list): return [rnd(i) for i in x]
    if isinstance(x, dict): return {k: rnd(v) for k, v in x.items()}
    if isinstance(x, float): return round(x, 5)
    return x
res['source'] = 'Grossman & Boudaoud, Phys. Rev. Research 8, 013224 (2026), doi:10.1103/17sg-gzhl, CC BY 4.0; Figs. 7 (p. 7), 8 (p. 7), 9 (p. 8)'
json.dump(rnd(res), open(out, 'w'), separators=(',', ':'))
