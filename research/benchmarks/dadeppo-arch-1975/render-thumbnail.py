import json
from pathlib import Path

root = Path(__file__).resolve().parents[3]
case = json.loads((root / 'engine/tests/benchmarks/dadeppo_arch.json').read_text())
replay = json.loads((Path(__file__).parent / 'results/stabileo_results.json').read_text())
frame = next(f for f in replay['frames'] if f['step'] == 260)
nodes = sorted(case['input']['solver']['nodes'].values(), key=lambda n: n['id'])
displacements = {d['nodeId']: d for d in frame['displacements']}
original = [(n['x'], n['z']) for n in nodes]
deformed = [(n['x'] + displacements[n['id']]['ux'], n['z'] + displacements[n['id']]['uz']) for n in nodes]
points = original + deformed
xmin, xmax = min(p[0] for p in points), max(p[0] for p in points)
ymin, ymax = min(p[1] for p in points), max(p[1] for p in points)
scale = min(540 / (xmax - xmin), 300 / (ymax - ymin))


def xy(point):
    return 320 + (point[0] - (xmin + xmax) / 2) * scale, 200 - (point[1] - (ymin + ymax) / 2) * scale


def path(points):
    return ' '.join(('M' if i == 0 else 'L') + f'{xy(p)[0]:.3f},{xy(p)[1]:.3f}' for i, p in enumerate(points))


svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><title>DaDeppo–Schmidt arch: native production replay, step 260</title><rect width="640" height="400" fill="#0c1620"/><path d="{path(original)}" fill="none" stroke="#667789" stroke-width="2" stroke-dasharray="6 5"/><path d="{path(deformed)}" fill="none" stroke="#61b6ff" stroke-width="5" stroke-linejoin="round"/>'
for point in (original[0], original[-1]):
    x, y = xy(point)
    svg += f'<path d="M{x-10:.3f},{y+12:.3f}L{x:.3f},{y:.3f}L{x+10:.3f},{y+12:.3f}Z" fill="#f0b578"/>'
(root / 'web/public/research-thumbs/dadeppo-arch-1975.svg').write_text(svg + '</svg>\n')
