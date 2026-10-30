import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
import sys

from jax_fdm.datastructures import FDNetwork
from jax_fdm.equilibrium import fdm

out = Path(sys.argv[1])
archive = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
cases = []
for q, load in [(1., 4.), (.5, 4.), (2., 4.), (1., 1.), (1., 8.)]:
    network = FDNetwork()
    points = [[0., 0., 0.], [-2., -2., 0.], [2., -2., 0.], [2., 2., 0.], [-2., 2., 0.]]
    for i, (x, y, z) in enumerate(points):
        network.add_node(i, x=x, y=y, z=z, is_support=i > 0, pz=-load if i == 0 else 0.)
    for i in range(1, 5):
        network.add_edge(0, i, q=q)
    result = fdm(network, sparse=False)
    cases.append(dict(q=q, load=load, nodes=[result.node_coordinates(i) for i in range(5)],
                      forces=[result.edge_attribute((0, i), 'force') for i in range(1, 5)]))
path = out / 'four_bar.json'
path.write_text(json.dumps(cases, indent=2) + '\n')
manifest = dict(code='https://github.com/arpastrana/jax_fdm', commit='9a17fd379071fb3511ca914f46e8d1e8c286460e',
                license='MIT', source_archive_sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),
                command='python -I reference/run_reference.py reference-results SOURCE_ARCHIVE.tar.gz',
                python=sys.version, platform=platform.platform(), date='2026-10-29',
                packages={d.metadata['Name']: d.version for d in importlib.metadata.distributions()},
                source_modified=False, configuration='fdm(sparse=False), float64; our explicit Fig. 2 topology instantiation, not published dimensions',
                files_sha256={path.name: hashlib.sha256(path.read_bytes()).hexdigest()})
(out / 'MANIFEST.json').write_text(json.dumps(manifest, indent=2) + '\n')
