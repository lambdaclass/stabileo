import importlib.util
import json
import os
import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPT = ROOT / '.github/scripts/mutants-plan.py'
spec = importlib.util.spec_from_file_location('mutants_plan', SCRIPT)
plan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plan)


class MutantsPlan(unittest.TestCase):
    def test_with_no_markers_it_starts_at_shard_zero(self):
        self.assertEqual(plan.pick(512, 32, {}), list(range(32)))

    def test_unfinished_shards_of_a_fresh_start_run_again_the_next_night(self):
        first = plan.pick(512, 32, {})
        finished = {k: '2026-11-05T06:00:00Z' for k in first[:28]}
        self.assertEqual(plan.pick(512, 32, finished), first[28:] + list(range(32, 60)))

    def test_a_shard_lost_last_night_runs_again_tonight(self):
        day = 20397
        last_night = plan.rotation(512, 32, day - 1)
        finished = {k: '2026-11-04T06:00:00Z' for k in last_night[:28]}
        older = {k: '2026-10-20T06:00:00Z' for k in range(512) if k not in last_night}
        tonight = plan.pick(512, 32, {**older, **finished})
        self.assertTrue(set(last_night[28:]) <= set(tonight))
        self.assertEqual(len(tonight), 32)
        self.assertEqual(len(set(tonight)), 32)

    def test_a_shard_that_fails_twice_gives_its_slot_to_the_rest(self):
        nights = ['2026-11-01T05:00:00Z', '2026-11-02T05:00:00Z', '2026-11-03T05:00:00Z']
        attempts = {k: nights[:2] for k in range(4)}
        self.assertEqual(plan.pick(8, 4, {}, attempts), [4, 5, 6, 7])
        done = {k: nights[2] for k in range(4, 8)}
        self.assertEqual(plan.pick(8, 4, done, attempts), [0, 1, 2, 3])

    def test_one_failure_keeps_the_place_and_a_finished_run_resets_the_count(self):
        attempts = {0: ['2026-11-01T05:00:00Z', '2026-11-03T05:00:00Z'], 1: ['2026-11-02T05:00:00Z']}
        last = {0: '2026-11-02T06:00:00Z', 1: '2026-10-01T06:00:00Z', 2: '2026-10-15T06:00:00Z'}
        self.assertEqual(plan.pick(3, 2, last, attempts), [1, 2])

    def test_unmarked_shards_go_first_then_the_oldest(self):
        last = {k: f'2026-10-{10 + k % 20:02d}T00:00:00Z' for k in range(8)}
        del last[5]
        self.assertEqual(plan.pick(8, 3, last), [5, 0, 1])

    def run_script(self, fake_gh):
        with tempfile.TemporaryDirectory() as directory:
            gh = pathlib.Path(directory) / 'gh'
            gh.write_text(fake_gh)
            gh.chmod(0o755)
            env = {**os.environ, 'PATH': f'{directory}:{os.environ["PATH"]}', 'GH_REPO': 'o/r'}
            return subprocess.run(['python3', '-I', str(SCRIPT), '8', '3', '0'], env=env, capture_output=True, text=True, check=True)

    def test_markers_of_another_total_or_expired_do_not_count(self):
        runs = json.dumps([{'workflow_runs': [{'id': 1, 'created_at': '2026-11-02T05:00:00Z'}, {'id': 2, 'created_at': '2026-11-03T05:00:00Z'}]}])
        jobs = json.dumps([{'jobs': [{'name': 'mutants (3)', 'status': 'completed'}, {'name': 'mutants (4)', 'status': 'in_progress'},
                                     {'name': 'mutants (9)', 'status': 'completed'}, {'name': 'plan', 'status': 'completed'}]}])
        arts = json.dumps([{'artifacts': [
            {'name': 'mutants-done-0-of-8', 'expired': False, 'created_at': '2026-11-01T00:00:00Z'},
            {'name': 'mutants-done-1-of-8', 'expired': True, 'created_at': '2026-11-01T00:00:00Z'},
            {'name': 'mutants-done-2-of-16', 'expired': False, 'created_at': '2026-11-01T00:00:00Z'},
            {'name': 'mutants-report-2', 'expired': False, 'created_at': '2026-11-01T00:00:00Z'}]}])
        result = self.run_script(f"#!/bin/sh\ncase \"$*\" in *workflows/nightly.yml/runs*) echo '{runs}' ;; *runs/1/artifacts*) echo '{arts}' ;; *runs/*/artifacts*) echo '[]' ;; *runs/*/jobs*) echo '{jobs}' ;; esac\n")
        self.assertEqual(json.loads(result.stdout), [1, 2, 4])
        self.assertIn('1 of 8 shards have a marker', result.stderr)

    def test_unreadable_markers_fall_back_to_the_rotation_and_warn(self):
        result = self.run_script('#!/bin/sh\nexit 1\n')
        self.assertEqual(json.loads(result.stdout), plan.rotation(8, 3, 0))
        self.assertIn('::warning title=Mutants rotation::', result.stderr)


if __name__ == '__main__':
    unittest.main()
