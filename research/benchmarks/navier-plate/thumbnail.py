import json
from pathlib import Path

root = Path(__file__).resolve().parents[3]
data = json.loads((root / 'engine/tests/benchmarks/navier_plate.json').read_text())
results = json.loads((Path(__file__).parent / 'results/stabileo_results.json').read_text())
case = data['cases'][-1]['input']
values = results['rows'][-1]['values']
maximum = max(values)
parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400">', '<rect width="640" height="400" fill="#101b2c"/>']
for cell in case['quads'].values():
    nodes = [case['nodes'][str(i)] for i in cell['nodes']]
    points = ' '.join(f"{320 + 70*n['x'] - 42*n['y']:.2f},{70 + 30*n['x'] + 30*n['y']:.2f}" for n in nodes)
    value = sum(values[i-1] for i in cell['nodes']) / (4 * maximum)
    colour = f'rgb({int(40 + 210*value)},{int(90 + 90*value)},{int(210 - 150*value)})'
    parts.append(f'<polygon points="{points}" fill="{colour}" stroke="#14243c" stroke-width="0.5"/>')
parts.append('</svg>')
(root / 'web/public/research-thumbs/navier-plate.svg').write_text('\n'.join(parts) + '\n')
