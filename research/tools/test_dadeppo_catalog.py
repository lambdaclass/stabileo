import json
from pathlib import Path

import yaml

root = Path(__file__).resolve().parents[2]
folder = root / 'research/benchmarks/dadeppo-arch-1975'
paper = yaml.safe_load((folder / 'paper.yaml').read_text())
case = json.loads((root / paper['case']).read_text())
assert paper['comparison']['reference'] == case['reference']
assert paper['comparison']['relative_tolerance'] == case['relativeTolerance']
crown = {'u_over_R': 'uOverR', 'v_over_R': 'vOverR', 'rotation': 'rotation'}
assert {k: paper['crown_reference'][k] for k in crown} == {k: case['crownReference'][v] for k, v in crown.items()}
assert {k: paper['crown_relative_tolerance'][k] for k in crown} == {k: case['crownRelativeTolerance'][v] for k, v in crown.items()}
results = json.loads((folder / 'results/stabileo_results.json').read_text())
assert [m['elements'] for m in results['convergence']['meshes']] == paper['mesh_study']['elements']
assert results['convergence']['gciSafetyFactor'] == paper['mesh_study']['gci_safety_factor']
print('ok DaDeppo paper.yaml agrees with the shared case and the mesh study')
