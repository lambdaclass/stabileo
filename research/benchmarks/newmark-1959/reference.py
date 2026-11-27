import hashlib
import json
import math
import sys
from pathlib import Path

here = Path(__file__).parent
case = json.loads((here.parents[2] / 'engine/tests/benchmarks/newmark_1959.json').read_text())
ref = case['reference']
solver = case['input']['solver']
length = math.dist(*[[solver['nodes'][n][c] for c in 'xyz'] for n in ('1', '2')])
e, area, density = solver['materials']['1']['e'], solver['sections']['1']['a'], case['input']['densities']['1']
stiffness, mass = 1000 * e * area / length, density * area * length / 3 / 1000
if not (math.isclose(stiffness, ref['stiffness'], rel_tol=1e-12) and math.isclose(mass, ref['mass'], rel_tol=1e-12)):
    raise ValueError("Invalid benchmark data: math.isclose(stiffness, ref['stiffness'], rel_tol=1e-12) and math.isclose(mass, ref['mass'], rel_tol=1e-12)")
omega = math.sqrt(stiffness / mass)
if not math.isclose(omega, ref['omega'], rel_tol=1e-12):
    raise ValueError("Invalid benchmark data: math.isclose(omega, ref['omega'], rel_tol=1e-12)")
period, amplitude = 2 * math.pi / omega, ref['force'] / stiffness
runs = []
for ratio in case['ratios']:
    dt = ratio * period
    steps = round(case['cycles'] / ratio)
    theta = 2 * math.atan(omega * dt / 2)
    lag = steps * (omega * dt - theta)
    runs.append({'ratio': ratio, 'steps': steps, 'theta': theta, 'discretePeriod': 2 * math.pi * dt / theta,
                 'elongation': 2 * math.pi * dt / theta / period - 1,
                 'uncappedPhaseLagBound': amplitude * lag,
                 'phaseLagBound': 2 * amplitude * math.sin(min(math.pi, lag) / 2)})
reference = {'omega': omega, 'period': period, 'amplitude': amplitude, 'runs': runs}
text = json.dumps(reference, indent=2) + '\n'
target = here / 'reference-results' / 'closed-form.json'
if sys.argv[1:] == ['--write']:
    target.write_text(text)
    manifest = json.loads((here / 'reference-results' / 'MANIFEST.json').read_text())
    manifest['files_sha256'] = {'closed-form.json': hashlib.sha256(text.encode()).hexdigest()}
    (here / 'reference-results' / 'MANIFEST.json').write_text(json.dumps(manifest, indent=2) + '\n')
committed = target.read_text()
manifest = json.loads((here / 'reference-results' / 'MANIFEST.json').read_text())
if manifest['files_sha256'] != {'closed-form.json': hashlib.sha256(committed.encode()).hexdigest()}:
    raise ValueError('MANIFEST.json hashes are stale: rerun with --write')
stored = json.loads(committed)
if len(stored['runs']) != len(runs):
    raise ValueError((len(stored['runs']), len(runs)))
for a, b in zip(stored['runs'], runs):
    for key in b:
        if not math.isclose(a[key], b[key], rel_tol=1e-12, abs_tol=1e-15):
            raise ValueError((key, a[key], b[key]))
for key in ('omega', 'period', 'amplitude'):
    if not math.isclose(stored[key], reference[key], rel_tol=1e-12):
        raise ValueError('Invalid benchmark data: math.isclose(stored[key], reference[key], rel_tol=1e-12)')
print(text, end='')
