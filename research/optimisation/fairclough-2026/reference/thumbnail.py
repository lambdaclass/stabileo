import json
from pathlib import Path

root = Path(__file__).resolve().parents[4]
result = json.loads((Path(__file__).resolve().parents[1] / 'results/stabileo_results.json').read_text())
paths = []
for curve in result['layout']['curves']:
    points = [(320 + 225 * (p[0] - p[1]), 325 - 190 * p[2] - 85 * (p[0] + p[1])) for p in curve]
    paths.append('<polyline points="' + ' '.join(f'{x:.3f},{y:.3f}' for x, y in points) + '" fill="none" stroke="#84dbc6" stroke-width="7" stroke-linecap="round"/>')
(root / 'web/public/research-thumbs/fairclough-2026.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#111c24"/>' + ''.join(paths) + '</svg>\n')
