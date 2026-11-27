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
manifest['files_sha256'] = {
    name: hashlib.sha256(path.with_name(name).read_bytes()).hexdigest()
    for name in manifest['files_sha256']
}
path.write_text(json.dumps(manifest, indent=2) + '\n')
