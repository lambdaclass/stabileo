import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('steel_cb_replay', ROOT / 'scripts/replay-steel-cb-advisory.py')
replay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(replay)
RECORDS = json.loads((ROOT / 'docs/advisories/replays/SA-2026-064.json').read_text())['records']


def observations():
    return [dict(fraction=r['oracle']['momentFraction'], input=r['input'], oracle=r['oracle'],
                 result=copy.deepcopy(r['before']), singleCombinationControls=r['singleCombinationControls']['before'])
            for r in RECORDS]


class SteelCbReplay(unittest.TestCase):
    def observe(self, rows):
        with tempfile.TemporaryDirectory(dir=ROOT) as temporary:
            destination = Path(temporary) / 'observations.jsonl'
            destination.write_text(''.join(json.dumps(row) + '\n' for row in rows))
            with patch.object(replay.subprocess, 'run') as run:
                run.return_value.returncode = 1
                return replay.observe(destination, 1)

    def test_valid_before_witnesses(self):
        self.assertEqual(len(self.observe(observations())), 2)

    @unittest.expectedFailure
    def test_rejects_a_correct_before_result_even_when_the_process_fails(self):
        rows = observations()
        rows[0]['result']['interaction']['ratio'] = rows[0]['oracle']['utilization']
        with self.assertRaises(RuntimeError):
            self.observe(rows)

    @unittest.expectedFailure
    def test_validates_the_second_witness_independently(self):
        rows = observations()
        rows[1]['result']['interaction']['ratio'] = rows[1]['oracle']['utilization']
        with self.assertRaises(RuntimeError):
            self.observe(rows)

    @unittest.expectedFailure
    def test_rejects_an_unrelated_failure(self):
        rows = observations()
        rows[0]['result']['interaction']['ratio'] = -1
        with self.assertRaises(RuntimeError):
            self.observe(rows)


if __name__ == '__main__':
    unittest.main()
