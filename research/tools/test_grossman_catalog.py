import json
import math
import unittest
from pathlib import Path

import importlib.util

spec = importlib.util.spec_from_file_location('catalog', Path(__file__).with_name('catalog.py'))
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)
check_entry, valid_checks = catalog.check_entry, catalog.valid_checks


def compare_paper_rows(validation, published):
    paper = {c['id'] for c in validation if c['category'] == 'paper'}
    expected_ids = (paper - {'fig9'}) | {'fig9-bulk', 'fig9-shear'}
    assert 'fig9' in paper and sorted(row['id'] for row in published) == sorted(expected_ids)


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
    published = json.loads((implementation / 'reference-results' / 'published_comparison.json').read_text())['checks']
    compare_paper_rows(validation, published)
    assert not (implementation / 'PUBLISHED_COMPARISON.json').exists()
    strip = json.loads((implementation / 'reference-results' / 'fig5_strip_comparison.json').read_text())['checks']
    assert [row['eta'] for row in strip if not row['passed']] == [0.0, 0.05, 0.1, 0.2]
    assert valid_checks([row for row in strip if row['passed']], published=True)
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


class PublicationConsistency(unittest.TestCase):
    @unittest.skip("known wrong result: #2505")
    def test_unchanged_id_does_not_mask_a_different_measurement(self):
        root = Path(__file__).resolve().parents[1] / 'metamaterials/grossman-2026'
        validation = json.loads((root / 'VALIDATION.json').read_text())['checks']
        rows = json.loads((root / 'reference-results/published_comparison.json').read_text())['checks']
        compare_paper_rows(validation, rows)
        for row_id, key, value in [('fig7', 'observed', 0), ('fig9-bulk', 'observed', 0),
                                   ('honey-3', 'tolerance', 1), ('fig9-shear', 'passed', False)]:
            with self.subTest(id=row_id, key=key), self.assertRaises(AssertionError):
                compare_paper_rows(validation, [{**r, key: value} if r['id'] == row_id else r for r in rows])


if __name__ == '__main__':
    main()
    unittest.main()
