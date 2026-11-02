import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('validated', Path(__file__).with_name('snapshot_validated.py'))
validated = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validated)

ok = {'name': 'CI OK', 'status': 'completed', 'conclusion': 'success'}
failed = {'name': 'CI OK', 'status': 'completed', 'conclusion': 'failure'}
running = {'name': 'CI OK', 'status': 'in_progress', 'conclusion': None}
other = {'name': 'Web Unit (1/2)', 'status': 'completed', 'conclusion': 'success'}


class ValidatedTests(unittest.TestCase):
    def test_verdicts(self):
        self.assertEqual(validated.verdict([ok, other]), 'pass')
        self.assertEqual(validated.verdict([failed]), 'fail')
        self.assertEqual(validated.verdict([running]), 'wait')
        self.assertEqual(validated.verdict([other]), 'wait')
        self.assertEqual(validated.verdict([]), 'wait')
        self.assertEqual(validated.verdict([failed, ok]), 'pass')
        self.assertEqual(validated.verdict([{**failed, 'conclusion': 'cancelled'}]), 'fail')

    def test_main_waits_then_refuses_or_passes(self):
        with patch.object(validated, 'check_runs', side_effect=[[running], [failed]]), patch.object(validated.time, 'sleep') as sleep:
            self.assertEqual(validated.main('o/r', 'c' * 40), 1)
            self.assertEqual(sleep.call_count, 1)
        with patch.object(validated, 'check_runs', side_effect=[[], [ok]]), patch.object(validated.time, 'sleep'):
            self.assertEqual(validated.main('o/r', 'c' * 40), 0)
        with patch.object(validated, 'check_runs', return_value=[running]), patch.object(validated.time, 'sleep'):
            self.assertEqual(validated.main('o/r', 'c' * 40, attempts=3), 1)


if __name__ == '__main__':
    unittest.main()
