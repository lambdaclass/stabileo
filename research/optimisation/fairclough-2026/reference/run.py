from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import runpy
import sys

import cvxpy
import numpy as np

SOURCE_SHA256 = '030f30b6ef42a1a038b42bc251be6206d9909e65d9c73008bb3b657b9a6ba98c'
source = Path(sys.argv[1]).resolve()
assert hashlib.sha256(source.read_bytes()).hexdigest() == SOURCE_SHA256
assert 'MOSEK' not in cvxpy.installed_solvers()
os.environ['MPLBACKEND'] = 'Agg'
os.environ['MPLCONFIGDIR'] = '/private/tmp/fairclough-matplotlib'
module = runpy.run_path(str(source))
nodes = np.array([[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5], [0., 0.]])
connections = np.array([[i, j, np.linalg.norm(nodes[j]-nodes[i]), True]
                        for i in range(5) for j in range(i+1, 5)])
forces = np.zeros(15)
forces[-1] = -1.
dof = np.array([[0, 0, 0]] * 4 + [[1, 1, 1]])
volume, area, q, w, u = module['solveIteration'](nodes, connections, forces, dof, 1., 1., 1.65)
z = module['getZ'](w, 1.65, 1.)
curves = []
for edge, force in zip(connections, q):
    if force[0] > 1e-5:
        i, j = edge[:2].astype(int)
        curves.append(module['getCentreline'](32, nodes[[i, j]], z[[i, j]], 1.65, 1., edge[2], force))
result = dict(volume=volume, nodes=nodes.tolist(), connections=connections[:, :2].astype(int).tolist(),
              forces=np.asarray(q).tolist(), elevations=z.tolist(), curves=curves,
              rho_g=1.65, sigma=1., L=1., F=1.)
out = Path(__file__).resolve().parents[1] / 'reference-results'
payload = json.dumps(result, indent=2) + '\n'
(out / 'five-node.json').write_text(payload)
manifest = dict(run_date_utc=datetime.now(timezone.utc).date().isoformat(), source_url='https://ndownloader.figshare.com/files/54492344',
                source_version='10.15131/shef.data.29046755.v1', source_sha256=SOURCE_SHA256,
                license='GPL-3.0-or-later', source_modified=False,
                command='python reference/run.py /scratch/vaultopt.py',
                execution='runpy executes the entire unchanged script, including its default example; then calls its public functions for Table 1.',
                python=platform.python_version(), platform=platform.platform(),
                packages={p: importlib.metadata.version(p) for p in ['cvxpy', 'clarabel', 'numpy', 'scipy', 'matplotlib']},
                installed_solvers=cvxpy.installed_solvers(),
                solver='CLARABEL (CVXPY default SOCP solver; no MOSEK installed)',
                files_sha256={'five-node.json': hashlib.sha256(payload.encode()).hexdigest()})
(out / 'MANIFEST.json').write_text(json.dumps(manifest, indent=2)+'\n')
print(json.dumps({'five_node_volume': volume, 'elevations': z.tolist()}))
