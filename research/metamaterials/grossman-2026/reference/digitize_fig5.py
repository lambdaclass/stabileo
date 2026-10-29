"""Usage: python3 -I digitize_fig5.py <fig5.png> <out.csv>   (needs numpy, Pillow)

Digitise the simulation markers and error bars of Fig. 5 (left panel) of Grossman & Boudaoud,
PRR 8, 013224 (2026), CC BY 4.0. The input is the figure's raster image as embedded in the PDF
(`pdfimages -f 6 -l 6 -png paper.pdf f6`, first image, 1601 x 558 px).

Axis calibration from the drawn major ticks, found in the image: x ticks at columns 119, 259.6,
400.2, 540.8, 681.4, 822 for eta = 0 ... 0.5; y ticks at rows 56.5, 146, 236, 326, 416 for
nu = 0.3 ... -0.1 (row 326 is also the grey nu = 0 line). Markers: dark red pixels clustered by
column; the value is the centre of the marker's bounding box (the triangle's centroid differs by
about 2 px = 0.002). Error bars: the light-blue (145, 168, 205) pixels continuing the marker in its
column (gaps of up to 4 px of antialiasing allowed). The last marker (eta = 0.49) points down: the paper says its mean lies
below the plotted range, so only an upper bound is recorded.
"""
import sys
import numpy as np
from PIL import Image

a = np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(int)[:, :850]
x_of = lambda c: (c - 119.0) / 1406.0
y_of = lambda r: (326.0 - r) / 899.0
red = (a[:, :, 0] > 90) & (a[:, :, 0] < 170) & (a[:, :, 1] < 40) & (a[:, :, 2] < 40)
bar = (np.abs(a - np.array([145, 168, 205])).max(axis=2) <= 22)
ys, xs = np.where(red)
order = np.argsort(xs)
groups = []
for i in order:
    if groups and xs[i] - groups[-1][-1][0] <= 3:
        groups[-1].append((xs[i], ys[i]))
    else:
        groups.append([(xs[i], ys[i])])
rows = ["eta,nu,nu_bar_low,nu_bar_high,marker"]
for g in groups:
    g = np.array(g)
    cx = int(round(g[:, 0].mean()))
    top, bot = g[:, 1].min(), g[:, 1].max()
    cy = 0.5 * (top + bot)
    col = bar[:, cx - 1:cx + 2].any(axis=1)
    def extend(start, step, stop):
        # Walk away from the marker; bar pixels may be separated by up to 4 px of antialiasing
        # (or the grey zero line).
        end, gap, r = start, 0, start
        while 6 <= r + step < 454 and r + step != stop:
            r += step
            if col[r] or red[r, cx]:
                end, gap = r, 0
            else:
                gap += 1
                if gap > 4:
                    break
        return end
    hi = extend(top, -1, 5)
    lo = extend(bot, 1, 454)
    down = top > 430  # the clipped, downward marker at the bottom edge
    eta = round(x_of(cx), 3)
    if down:
        rows.append(f"{eta},,{y_of(lo):.4f},{y_of(hi):.4f},below_range")
    else:
        rows.append(f"{eta},{y_of(cy):.4f},{y_of(lo):.4f},{y_of(hi):.4f},up")
open(sys.argv[2], "w").write("\n".join(rows) + "\n")
print("\n".join(rows))
