import importlib.util
import json
import subprocess
import os
import tempfile
import datetime
from pathlib import Path
import unittest

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('catalog', root / 'tools/catalog.py')
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)

row = {'name': 'response', 'source': 'paper', 'metric': 'absolute difference', 'observed': 0, 'passed': True, 'tolerance': 0}


class PublishedEvidence(unittest.TestCase):
    def test_an_in_tolerance_scalar_still_reports_its_actual_error(self):
        measurement = {**row, 'reference': 1, 'computed': 1 + 5e-10, 'tolerance': 1e-9}
        self.assertFalse(catalog.valid_checks([measurement], published=True))
        measurement['observed'] = measurement['computed'] - measurement['reference']
        self.assertTrue(catalog.valid_checks([measurement], published=True))

    def test_regenerating_shape_evidence_records_the_toolchain_and_run_date(self):
        with tempfile.TemporaryDirectory(dir=root) as scratch:
            folder = Path(scratch)
            evidence = folder / 'reference-results'
            evidence.mkdir()
            (evidence / 'replay.json').write_text('new replay')
            manifest = evidence / 'MANIFEST.json'
            manifest.write_text(json.dumps({'platform': 'earlier toolchain', 'files_sha256': {'replay.json': 'old hash'}}))
            runner = folder / 'run'
            runner.write_text('#!/bin/sh\nif [ "$1" != cargo ]; then exec "$@"; fi\n')
            runner.chmod(0o755)
            compiler = folder / 'rustc'
            compiler.write_text('#!/bin/sh\nprintf "%s\\n" "rustc fixture" "host: fixture-host"\n')
            compiler.chmod(0o755)
            env = {**os.environ, 'PATH': str(folder) + ':' + os.environ['PATH']}
            today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
            subprocess.run(['make', '-s', 'evidence.research.feher', f'FEHER_DIR={folder}', f'NIX_RUN={runner}'],
                           cwd=root.parent, env=env, check=True, capture_output=True)
            data = json.loads(manifest.read_text())
            self.assertIn('rustc fixture', data['platform'])
            self.assertIn('fixture-host', data['platform'])
            self.assertIn(today, data['platform'])

    def test_shape_control_catalog_count_matches_the_paper_comparisons(self):
        papers = json.loads((root / 'papers.json').read_text())['papers']
        entry = next(p for p in papers if p['id'] == 'feher-sipos-varkonyi-2026')
        rows = json.loads((root / entry['implementation'] / 'reference-results/published_comparison.json').read_text())['checks']
        self.assertIn(f"{len(rows)} comparisons", entry['relevance'])
        self.assertIn(f"{sum(r['passed'] for r in rows)} pass", entry['relevance'])

    def test_roundoff_cannot_certify_an_out_of_tolerance_scalar(self):
        for delta, expected in [(0, True), (5e-10, False)]:
            self.assertEqual(catalog.valid_checks([{**row, 'reference': 1, 'computed': 1 + delta}], published=True), expected)

    def test_a_point_count_alone_cannot_certify_a_curve(self):
        for data in [{}, {'samples': [[0, 0]]}, {'samples': [[0, 0], [1, 2]]}]:
            with self.subTest(data=data):
                self.assertFalse(catalog.valid_checks([{**row, 'points': 2, **data}], published=True))
        self.assertTrue(catalog.valid_checks([{**row, 'points': 2, 'samples': [[0, 0], [1, 1]]}], published=True))

    def test_fig5_records_the_ten_eta_values_used_for_error_bars(self):
        evidence = json.loads((root / 'metamaterials/grossman-2026/reference-results/published_comparison.json').read_text())
        curve = next(r for r in evidence['checks'] if r['id'] == 'fig5-periodic')
        self.assertEqual([p[0] for p in curve.get('samples', [])], [i / 20 for i in range(10)])
        self.assertEqual(curve['points'], len(curve['samples']))

    def test_secondary_comparisons_do_not_certify_heymans_own_paper(self):
        papers = json.loads((root / 'papers.json').read_text())['papers']
        paper = next(p for p in papers if p['id'] == 'heyman-1966')
        self.assertEqual(paper['status'], 'numerically-validated')
        self.assertFalse(paper['reproduced_published_results'])


if __name__ == '__main__':
    unittest.main()
