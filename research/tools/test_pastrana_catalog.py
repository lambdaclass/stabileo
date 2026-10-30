import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import catalog
import yaml

root = Path(__file__).resolve().parents[1]
paper = next(p for p in yaml.safe_load((root / 'papers.yaml').read_text())['papers'] if p['id'] == 'pastrana-2026')
assert paper['implementation'] == 'form-finding/pastrana-2026'
assert paper['reproduced_published_results'] is False
errors = []
catalog.check_entry(paper, errors)
assert not errors, errors
folder = root / paper['implementation']
manifest = json.loads((folder / 'reference-results/MANIFEST.json').read_text())
assert manifest['commit'] == paper['code'][0]['commit']
assert manifest['source_modified'] is False
assert len(manifest['source_archive_sha256']) == 64
for name, digest in manifest['files_sha256'].items():
    assert hashlib.sha256((folder / 'reference-results' / name).read_bytes()).hexdigest() == digest
comparison = json.loads((folder / 'PUBLISHED_COMPARISON.json').read_text())
assert comparison['reproduced_published_results'] is False
assert 'Fig. 2' in comparison['source']
checks = json.loads((folder / 'VALIDATION.json').read_text())['checks']
assert len(checks) == 30
assert catalog.valid_checks(checks)
print('ok Pastrana scope, pinned reference, hashes and numerical evidence')
