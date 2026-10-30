import hashlib
import json
import pathlib
import shutil
import sys

out = pathlib.Path(sys.argv[1])
names = ['topopt.js', 'topopt_bg.wasm', 'ft1.srpl', 'ft2.srpl', 'ft1.json', 'ft2.json', 'SHA256SUMS']
build = hashlib.sha256(b''.join((out / n).read_bytes() for n in names)).hexdigest()
dest = out / build
dest.mkdir(exist_ok=True)
for name in names:
    shutil.copyfile(out / name, dest / name)
(out / 'build.json').write_text(json.dumps(dict(build_id=build)) + '\n')
