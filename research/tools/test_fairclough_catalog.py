import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('catalog', Path(__file__).with_name('catalog.py'))
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)
root = Path(__file__).resolve().parents[1]
paper = next(p for p in json.loads((root / 'papers.json').read_text())['papers'] if p['id'] == 'fairclough-2026')
errors = []
catalog.check_entry(paper, errors)
assert not errors, errors
assert paper['status'] == 'numerically-validated'
folder = root / paper['implementation']
manifest = json.loads((folder / 'reference-results/MANIFEST.json').read_text())
assert manifest['source_modified'] is False
assert manifest['source_version'] == '10.15131/shef.data.29046755.v1'
assert manifest['license'] == 'GPL-3.0-or-later'
assert manifest['source_sha256'] == '030f30b6ef42a1a038b42bc251be6206d9909e65d9c73008bb3b657b9a6ba98c'
assert not list(folder.rglob('vaultopt.py'))
for name, digest in manifest['files_sha256'].items():
    assert hashlib.sha256((folder / 'reference-results' / name).read_bytes()).hexdigest() == digest
published = json.loads((folder / 'PUBLISHED_COMPARISON.json').read_text())['checks']
assert len(published) == 1
assert published[0]['reference'] == 13.8394
assert 'Table 1' in published[0]['source']
assert 'page 29' in published[0]['source']
assert catalog.valid_checks(published, published=True)
assert not catalog.valid_checks([{**published[0], 'observed': 0.001}], published=True)
print('ok Fairclough scope, external GPL reference, hashes and published comparison')
