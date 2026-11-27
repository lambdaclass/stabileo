import contextlib
import copy
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('compare_evidence', Path(__file__).with_name('compare_evidence.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

EVIDENCE = {
    'command': 'cargo test',
    'study': {'alpha': 0.38, 'frames': [1000.0, 2.5]},
    'checks': [
        {'name': 'frequency 1', 'metric': 'relative difference', 'observed': 0.0, 'tolerance': 1e-8, 'passed': True},
        {'name': 'beta', 'metric': 'relative difference', 'reference': 0.4, 'computed': 0.45, 'observed': 0.12,
         'tolerance': 0.05, 'passed': False},
    ],
}


def changed(edit):
    value = copy.deepcopy(EVIDENCE)
    edit(value)
    return value


class CompareEvidenceTests(unittest.TestCase):
    def test_identical_evidence_matches(self):
        self.assertEqual(module.differences(EVIDENCE, copy.deepcopy(EVIDENCE)), [])

    def test_check_numbers_move_within_a_tenth_of_their_tolerance(self):
        fresh = changed(lambda v: v['checks'][0].update(observed=0.9e-9))
        self.assertEqual(module.differences(EVIDENCE, fresh), [])
        fresh = changed(lambda v: v['checks'][0].update(observed=1.1e-9))
        self.assertEqual(module.differences(EVIDENCE, fresh), ['$.checks[0].observed: 0.0 != 1.1e-09'])
        fresh = changed(lambda v: v['checks'][1].update(computed=0.454))
        self.assertTrue(module.differences(EVIDENCE, fresh))

    def test_measurements_and_paper_constants_have_independent_budgets(self):
        row = {'passed': True, 'reference': 0.002, 'computed': 0.001, 'tolerance': 0.05}
        for key, value in [('reference', 0.002000000000001), ('computed', 0.003),
                           ('computed', 0.001000000002), ('tolerance', 0.050000000000001)]:
            with self.subTest(key=key, value=value):
                self.assertTrue(module.differences(row, {**row, key: value}))
        self.assertFalse(module.differences(row, {**row, 'computed': 0.0010000000005}))

    def test_cli_rejects_nonfinite_evidence_on_either_side(self):
        with tempfile.TemporaryDirectory() as tmp:
            left, right = (Path(tmp, name) for name in ('left.json', 'right.json'))
            for key, value in [('computed', float('inf')), ('tolerance', float('nan'))]:
                for good, bad in [(left, right), (right, left)]:
                    with self.subTest(key=key, side=bad.name):
                        good.write_text(json.dumps(EVIDENCE))
                        bad.write_text(json.dumps(changed(lambda v: v['checks'][1].update({key: value}))))
                        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
                            module.main([left, right])

    def test_ferrari_derivative_and_buckling_keep_original_drift_budgets(self):
        evidence = Path(__file__).resolve().parents[1] / 'stability/ferrari-sigmund-2025/VALIDATION.json'
        rows = json.loads(evidence.read_text())['checks']
        for row in rows[:6]:
            observed = row['observed']
            limit = 1e-3 * abs(observed) + 1e-14 if row in rows[:4] else 1e-9
            with self.subTest(name=row['name']):
                self.assertTrue(module.differences({**row, 'observed': observed + 1.01 * limit}, row))

    def test_other_numbers_move_within_1e9_relative_with_a_floor_of_one(self):
        fresh = changed(lambda v: v['study'].update(alpha=0.38 + 0.9e-9))
        self.assertEqual(module.differences(EVIDENCE, fresh), [])
        fresh = changed(lambda v: v['study'].update(alpha=0.38 + 1.1e-9))
        self.assertEqual(len(module.differences(EVIDENCE, fresh)), 1)
        fresh = changed(lambda v: v['study']['frames'].__setitem__(0, 1000.0 * (1 + 0.9e-9)))
        self.assertEqual(module.differences(EVIDENCE, fresh), [])
        fresh = changed(lambda v: v['study']['frames'].__setitem__(0, 1000.0 * (1 + 1.1e-9)))
        self.assertEqual(module.differences(EVIDENCE, fresh)[0].split(':')[0], '$.study.frames[0]')

    def test_verdicts_tolerances_names_metrics_and_structure_must_match(self):
        cases = {
            '$.checks[1].passed': lambda v: v['checks'][1].update(passed=True),
            '$.checks[0].tolerance': lambda v: v['checks'][0].update(tolerance=2e-8),
            '$.checks[0].name': lambda v: v['checks'][0].update(name='frequency 2'),
            '$.checks[1].metric': lambda v: v['checks'][1].update(metric='absolute difference'),
            '$.command': lambda v: v.update(command='cargo run'),
            '$.checks': lambda v: v['checks'].pop(),
            '$.study': lambda v: v['study'].pop('alpha'),
            '$.checks[0].observed': lambda v: v['checks'][0].update(observed='0.0'),
        }
        for path, edit in cases.items():
            with self.subTest(path=path):
                found = module.differences(EVIDENCE, changed(edit))
                self.assertEqual(len(found), 1, found)
                self.assertTrue(found[0].startswith(path + ':'), found)

    def test_cli_prints_every_differing_path_and_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            committed, fresh = Path(tmp, 'committed.json'), Path(tmp, 'fresh.json')
            committed.write_text(json.dumps(EVIDENCE))
            fresh.write_text(json.dumps(changed(lambda v: (v['checks'][1].update(passed=True), v['study'].update(alpha=0.5)))))
            out = io.StringIO()
            with contextlib.redirect_stdout(out), self.assertRaises(SystemExit) as failure:
                module.main([str(committed), str(fresh)])
            self.assertIn('2 differences', str(failure.exception))
            self.assertEqual(out.getvalue().splitlines(), ['$.study.alpha: 0.38 != 0.5', '$.checks[1].passed: False != True'])
            fresh.write_text(json.dumps(EVIDENCE))
            with contextlib.redirect_stdout(io.StringIO()):
                module.main([str(committed), str(fresh)])
            with self.assertRaises(SystemExit) as failure:
                module.main([str(committed)])
            self.assertEqual(str(failure.exception), module.USAGE)


if __name__ == '__main__':
    unittest.main()
