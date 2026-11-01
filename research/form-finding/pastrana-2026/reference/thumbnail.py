import json
from pathlib import Path
root = Path(__file__).resolve().parents[4]
form = json.loads((root / 'research/form-finding/pastrana-2026/results/stabileo_results.json').read_text())[-1]
points = [(320 + 80*(x-.55*y), 165 - 80*(z+.35*y)) for x,y,z in form['nodes']]
svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400"><rect width="640" height="400" fill="#182328"/>']
for a,b in form['edges']:
    x,y=points[a]; u,v=points[b]
    svg.append(f'<path d="M{x},{y} L{u},{v}" stroke="#f0ba60" stroke-width="7"/>')
for i,(x,y) in enumerate(points):
    svg.append(f'<circle cx="{x}" cy="{y}" r="{8 if i else 11}" fill="{chr(35)}e4ece9"/>')
svg.append('</svg>')
(root/'web/public/research-thumbs/pastrana-2026.svg').write_text('\n'.join(svg)+'\n')
