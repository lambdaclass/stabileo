import datetime
import hashlib
import json
import subprocess
import sys
from pathlib import Path

path = Path(sys.argv[1])
manifest = json.loads(path.read_text())
compiler = subprocess.check_output(['rustc', '-vV'], text=True).splitlines()
host = next(line.removeprefix('host: ') for line in compiler if line.startswith('host: '))
date = datetime.datetime.now(datetime.timezone.utc).date()
manifest['platform'] = f'{compiler[0]}, {host}, {date}'
reference = 'fig9c_digitized.json'
if hashlib.sha256(path.with_name(reference).read_bytes()).hexdigest() != manifest['files_sha256'].get(reference):
    raise ValueError(f'{reference} differs from the recorded digitization')
manifest['files_sha256'].update({
    name: hashlib.sha256(path.with_name(name).read_bytes()).hexdigest()
    for name in manifest['files_sha256'] if name != reference
})
path.write_text(json.dumps(manifest, indent=2) + '\n')
