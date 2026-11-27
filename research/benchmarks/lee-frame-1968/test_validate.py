import copy
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('lee', Path(__file__).with_name('validate.py'))
lee = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lee)


class LeeEvidence(unittest.TestCase):
    def test_declared_readings_and_limits_are_exact(self):
        row = {'reference': 1.0, 'computed': 1.0, 'observed': 0.0, 'tolerance': 1e-10}
        for key in ('reference', 'tolerance'):
            with self.subTest(key=key):
                self.assertFalse(lee.same(row, {**row, key: row[key] + 1e-10}))
        self.assertTrue(lee.same(row, row))

    def test_rejects_incorrect_paper_result_selector(self):
        reading = lee.load(lee.READING)
        reading['rows'][1]['computed'] = 'elements20'
        with patch.object(lee, 'load', side_effect=lambda p: reading if p == lee.READING else original(p)):
            with self.assertRaisesRegex(ValueError, 'selector'):
                lee.evidence(self.run)

    def test_duplicate_study_settings_cannot_verify_step_sensitivity(self):
        self.case['convergence']['cases'] += self.case['convergence']['cases'][:1]
        self.run['study'] += self.run['study'][:1]
        with patch.object(lee, 'load', side_effect=lambda p: self.case if p == lee.CASE else original(p)):
            with self.assertRaisesRegex(ValueError, 'refinement'):
                lee.evidence(self.run)

    def test_equal_or_reversed_refined_peaks_withhold_extrapolation(self):
        p40 = min((r for r in self.run['study'] if r['split'] == 2), key=lambda r: r['stepScale'])['firstPeak']
        for offset in (0, 1):
            for r in self.run['study']:
                if r['split'] == 4:
                    r['firstPeak'] = p40 + offset
            validation, comparison = lee.evidence(self.run)
            self.assertFalse(next(c for c in validation['checks'] if 'ratio of successive' in c['name'])['passed'])
            self.assertIsNone(comparison['checks'][1]['computed'])

    def setUp(self):
        self.case = lee.load(lee.CASE)
        self.run = lee.load(lee.HERE / 'results/stabileo_results.json')
        self.run['study'] = copy.deepcopy(self.case['convergence']['cases'])

    def test_replay_requires_each_step_and_node_once(self):
        for mutation in ['truncate', 'duplicate', 'step']:
            with self.subTest(mutation=mutation):
                run = copy.deepcopy(self.run)
                frame = run['frames'][1]
                if mutation == 'truncate':
                    frame['displacement'].pop()
                elif mutation == 'duplicate':
                    frame['displacement'][-1]['nodeId'] = frame['displacement'][0]['nodeId']
                else:
                    frame['step'] += 1
                with self.assertRaises(ValueError):
                    lee.evidence(run)

    def test_finest_step_uses_measurements_and_is_order_independent(self):
        def extrapolated():
            return lee.evidence(self.run)[1]['checks'][1]['computed']
        before = extrapolated()
        self.run['study'].reverse()
        self.assertEqual(extrapolated(), before)
        finest = min((r for r in self.run['study'] if r['split'] == 4), key=lambda r: r['stepScale'])
        finest['firstPeak'] += self.case['convergence']['absoluteTolerance'] / 2
        self.assertNotEqual(extrapolated(), before)

    def test_each_paper_row_is_required_once(self):
        reading = lee.load(lee.READING)
        for rows in [[], reading['rows'][:-1], reading['rows'][:2] + reading['rows'][:1]]:
            with self.subTest(count=len(rows)), patch.object(lee, 'load', side_effect=lambda p: {**reading, 'rows': rows} if p == lee.READING else original(p)):
                with self.assertRaises(ValueError):
                    lee.evidence(self.run)


original = lee.load
if __name__ == '__main__':
    unittest.main()
