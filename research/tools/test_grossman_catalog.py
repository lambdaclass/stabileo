import json
from pathlib import Path

import importlib.util

spec = importlib.util.spec_from_file_location('catalog', Path(__file__).with_name('catalog.py'))
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)
check_entry, valid_checks = catalog.check_entry, catalog.valid_checks


def main():
    root = Path(__file__).resolve().parents[1]
    papers = json.loads((root / 'papers.json').read_text())['papers']
    for paper in papers:
        errors = []
        check_entry(paper, errors)
        assert not errors, errors
    grossman = next(p for p in papers if p['id'] == 'grossman-2026')
    implementation = root / grossman['implementation']
    validation = json.loads((implementation / 'VALIDATION.json').read_text())['checks']
    published = json.loads((implementation / 'PUBLISHED_COMPARISON.json').read_text())['checks']
    assert published == [c for c in validation if c['category'] == 'paper']
    for name in ['dilution z = 5.4']:
        check = next(c for c in validation if c['name'].startswith(name))
        assert check['observed'] == check['tolerance'] == 0
        assert valid_checks([check])
        assert not valid_checks([{**check, 'observed': 0.001}])
        assert not valid_checks([{**check, 'observed': -0.001}])
    regression = next(c for c in validation if c['name'].startswith('foam: periodic ensemble regression'))
    assert regression['category'] != 'paper'
    assert regression['tolerance'] == 0.017
    assert valid_checks([regression])
    assert not valid_checks([{**regression, 'observed': 100}])
    assert valid_checks(published, published=True)
    print('ok   committed catalog, Grossman signed checks and published comparisons')


if __name__ == '__main__':
    main()
