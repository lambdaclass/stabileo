import contextlib
import io
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('replay', Path(__file__).with_name('replay.py'))
replay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(replay)

CHECK = dict(name='force', metric='relative difference', observed=0.0, tolerance=1e-6, passed=True)


class ReplayTests(unittest.TestCase):
    def run_replay(self, baseline, produced):
        with tempfile.TemporaryDirectory() as tmp:
            paper = Path(tmp) / 'field' / 'paper'
            (paper / 'target').mkdir(parents=True)
            if baseline is not None:
                (paper / 'VALIDATION.json').write_text(baseline)
            (paper / 'target/VALIDATION.json').write_text(json.dumps({'checks': [CHECK]}))

            def cargo(*args, **kwargs):
                self.assertFalse((paper / 'target/VALIDATION.json').exists())
                (paper / 'target/VALIDATION.json').write_text(json.dumps({'checks': produced}))
                return type('Run', (), {'returncode': 0})()

            # Expected failures must not become GitHub Actions error annotations.
            with contextlib.redirect_stdout(io.StringIO()), patch.object(replay.subprocess, 'run', side_effect=cargo):
                return replay.replay(paper)

    def test_invalid_baselines_fail(self):
        for value in [None, '{', '{}', 'null', '{"checks": []}', '{"checks": [null]}',
                      json.dumps({'checks': [CHECK, CHECK]}),
                      json.dumps({'checks': [{**CHECK, 'observed': float('nan')}]}),
                      json.dumps({'checks': [{**CHECK, 'passed': 'yes'}]})]:
            with self.subTest(value=value):
                self.assertTrue(self.run_replay(value, [CHECK])[0])

    def test_added_and_removed_checks_fail(self):
        baseline = json.dumps({'checks': [CHECK]})
        for produced, status in [([CHECK, {**CHECK, 'name': 'damage'}], 'ADDED'),
                                 ([{**CHECK, 'name': 'damage'}], 'REMOVED')]:
            failed, rows = self.run_replay(baseline, produced)
            self.assertTrue(failed)
            self.assertIn(status, [row[-1] for row in rows])

    def test_metric_or_tolerance_changes_fail(self):
        for changed in [{**CHECK, 'metric': 'absolute difference'}, {**CHECK, 'tolerance': 1.0}, {**CHECK, 'tolerance': 1e-9}]:
            failed, rows = self.run_replay(json.dumps({'checks': [CHECK]}), [changed])
            self.assertTrue(failed)
            self.assertEqual(rows[0][-1], 'FAIL')

    def test_recorded_checks_pass(self):
        self.assertFalse(self.run_replay(json.dumps({'checks': [CHECK]}), [CHECK])[0])

    def test_invalid_or_failed_produced_checks_fail(self):
        for produced in [[], [{**CHECK, 'observed': float('inf')}], [{**CHECK, 'passed': False}]]:
            self.assertTrue(self.run_replay(json.dumps({'checks': [CHECK]}), produced)[0])

    def test_passed_beyond_tolerance_fails(self):
        contradictory = {**CHECK, 'observed': 1.0}
        failed, rows = self.run_replay(json.dumps({'checks': [CHECK]}), [contradictory])
        self.assertTrue(failed)
        self.assertEqual(rows[0][-1], 'FAIL')

    def test_checks_without_names_are_keyed_by_metric(self):
        unnamed = {k: v for k, v in CHECK.items() if k != 'name'}
        self.assertFalse(self.run_replay(json.dumps({'checks': [unnamed]}), [unnamed])[0])
        self.assertTrue(self.run_replay(json.dumps({'checks': [unnamed, unnamed]}), [unnamed])[0])

    def test_in_place_writers_are_compared_and_the_committed_file_restored(self):
        committed = json.dumps({'checks': [CHECK]})
        for produced, should_fail in [([CHECK], False), ([{**CHECK, 'passed': False}], True), (None, True)]:
            with self.subTest(produced=produced), tempfile.TemporaryDirectory() as tmp:
                paper = Path(tmp) / 'field' / 'paper'
                paper.mkdir(parents=True)
                (paper / 'VALIDATION.json').write_text(committed)

                def writer(*args, **kwargs):
                    self.assertFalse((paper / 'VALIDATION.json').exists())
                    if produced is not None:
                        (paper / 'VALIDATION.json').write_text(json.dumps({'checks': produced}))
                    return type('Run', (), {'returncode': 0})()

                with contextlib.redirect_stdout(io.StringIO()), patch.object(replay.subprocess, 'run', side_effect=writer), \
                        patch.dict(replay.IN_PLACE, {'field/paper': (['writer'], {})}):
                    self.assertEqual(replay.replay(paper)[0], should_fail)
                self.assertEqual((paper / 'VALIDATION.json').read_text(), committed)


if __name__ == '__main__':
    unittest.main()
