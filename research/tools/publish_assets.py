import gzip
import hashlib
import json
from pathlib import Path
import shutil
import struct
import sys

from asset_identity import identity


def publish(root, out):
    build_id = identity(root, out)
    replay = out / 'replay.srpl'
    raw = gzip.decompress(replay.read_bytes())
    length = struct.unpack_from('<I', raw, 8)[0]
    header = json.loads(raw[12:12 + length])
    header['build_id'] = build_id
    encoded = json.dumps(header, separators=(',', ':')).encode()
    prefix = raw[:8] + struct.pack('<I', len(encoded)) + encoded
    prefix += b' ' * (-len(prefix) % 4)
    replay.write_bytes(gzip.compress(prefix + raw[(12 + length + 3) // 4 * 4:], mtime=0))
    names = ['phasefield_bg.wasm', 'phasefield.js', 'reference_ex2_steps.csv', 'replay.srpl']
    (out / 'SHA256SUMS').write_text(''.join(f'{hashlib.sha256((out / name).read_bytes()).hexdigest()}  {name}\n' for name in names))
    destination = out.parent / 'builds' / build_id
    if not destination.exists():
        destination.mkdir(parents=True)
        shutil.copytree(out, destination / 'shauer-2025')
        shutil.copytree(out.parent / 'viewer', destination / 'viewer')
    (out.parent / 'build.json').write_text(json.dumps({'build_id': build_id}) + '\n')
    return build_id


if __name__ == '__main__':
    print(publish(Path(sys.argv[1]), Path(sys.argv[2])))
