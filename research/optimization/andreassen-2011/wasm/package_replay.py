import gzip
import json
import pathlib
import struct
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[1]
out = pathlib.Path(sys.argv[1])
for ft in [1, 2]:
    frames = json.loads(subprocess.check_output(['cargo', 'run', '--release', '--locked', '--quiet', '--bin', 'reproduce', '--', str(ft)], cwd=root))
    header = dict(config=dict(nelx=60, nely=20, volfrac=0.5, penal=3, rmin=2.4, ft=ft),
                  frames=[{k: v for k, v in f.items() if k != 'density'} for f in frames])
    encoded = json.dumps(header, separators=(',', ':')).encode()
    data = b'SRPL' + struct.pack('<II', 2, len(encoded)) + encoded
    data += bytes(int(max(0, min(255, x * 255 + 0.5))) for f in frames for x in f['density'])
    (out / f'ft{ft}.srpl').write_bytes(gzip.compress(data, mtime=0))
    refs = json.loads((root / f'reference-results/ft{ft}.json').read_text())
    (out / f'ft{ft}.json').write_text(json.dumps([{k: v for k, v in f.items() if k != 'density'} for f in refs]))
