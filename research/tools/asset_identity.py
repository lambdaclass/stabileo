import hashlib
import gzip
import json
import struct
from pathlib import Path
import sys


def identity(root, out):
    files = set()
    for folder in [root / 'research/fracture/shauer-2025/src', root / 'research/fracture/shauer-2025/reference-results', root / 'web/src/components/research', root / 'web/src/components/viewport']:
        files.update(p for p in folder.rglob('*') if p.is_file())
    files.update(p for p in (out.parent / 'viewer').rglob('*') if p.is_file())
    files.update([out / 'phasefield.js', out / 'phasefield_bg.wasm'])
    digest = hashlib.sha256()
    for p in sorted(files):
        if p.is_relative_to(out):
            label = 'bundle/' + p.relative_to(out).as_posix()
        elif p.is_relative_to(out.parent / 'viewer'):
            label = 'viewer/' + p.relative_to(out.parent / 'viewer').as_posix()
        else:
            label = p.relative_to(root).as_posix()
        digest.update(label.encode())
        digest.update(b'\0')
        digest.update(p.read_bytes())
    replay = out / 'replay.srpl'
    if replay.exists():
        raw = gzip.decompress(replay.read_bytes())
        length = struct.unpack_from('<I', raw, 8)[0]
        header = json.loads(raw[12:12 + length])
        header.pop('build_id', None)
        digest.update(json.dumps(header, sort_keys=True, separators=(',', ':')).encode())
        digest.update(raw[(12 + length + 3) // 4 * 4:])
    return digest.hexdigest()


if __name__ == '__main__':
    print(identity(Path(sys.argv[1]), Path(sys.argv[2])))
