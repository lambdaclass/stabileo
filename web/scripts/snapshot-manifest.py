import hashlib
import json
from pathlib import Path
import sys

root = Path(sys.argv[1])
manifest = root / 'SNAPSHOT.json'
meta = json.loads(manifest.read_text())
meta['assets'] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root / 'assets').iterdir()) if p.is_file()}
manifest.write_text(json.dumps(meta, indent=2) + '\n')
