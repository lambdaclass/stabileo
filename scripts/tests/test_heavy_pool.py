"""Where heavy dispatched jobs run, and the workflows that ask."""
import calendar
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPT = ROOT / '.github/scripts/heavy-pool.py'
spec = importlib.util.spec_from_file_location('heavy_pool', SCRIPT)
heavy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(heavy)

MAIN = 'refs/heads/main'
CI_1 = ['self-hosted', 'stabileo-pr']
NIGHTLY = ['self-hosted', 'stabileo-nightly']


def runs_on(event='workflow_dispatch', pool='', ref=MAIN, self_hosted=True, pr_pool=True, hour=12):
    return heavy.choose(event, pool, ref, self_hosted, pr_pool, hour)[0]


class Choose(unittest.TestCase):
    def test_a_dispatch_takes_stabileo_ci_1_only_outside_the_nightly_window(self):
        for hour in range(24):
            with self.subTest(hour=hour):
                self.assertEqual(runs_on(hour=hour), NIGHTLY if hour < 7 else CI_1)
                self.assertEqual(runs_on(pool='stabileo-pr', hour=hour), NIGHTLY if hour < 7 else CI_1)

    def test_a_scheduled_run_always_takes_the_nightly_pool(self):
        for hour in range(24):
            for pool in ['', 'stabileo-pr', 'ubuntu-24.04', 'nightly']:
                with self.subTest(hour=hour, pool=pool):
                    self.assertEqual(runs_on('schedule', pool=pool, hour=hour), NIGHTLY)

    def test_pool_nightly_keeps_the_scheduled_routing(self):
        for hour in range(24):
            with self.subTest(hour=hour):
                self.assertEqual(runs_on(pool='nightly', hour=hour), NIGHTLY if hour < 7 else 'ubuntu-24.04')

    def test_github_hosted_when_asked_untrusted_or_the_pool_is_off(self):
        self.assertEqual(runs_on(pool='ubuntu-24.04'), 'ubuntu-24.04')
        self.assertEqual(runs_on(pr_pool=False), 'ubuntu-24.04')
        self.assertEqual(runs_on(self_hosted=False), 'ubuntu-24.04')
        self.assertEqual(runs_on('schedule', self_hosted=False), 'ubuntu-24.04')
        self.assertEqual(runs_on(ref='refs/heads/feature'), 'ubuntu-24.04')
        for event in ['pull_request', 'merge_group', 'push', '']:
            with self.subTest(event=event):
                self.assertEqual(runs_on(event), 'ubuntu-24.04')

    def test_an_unknown_pool_is_refused(self):
        for pool in ['stabileo', 'stabileo-engine', 'self-hosted', 'Stabileo-PR']:
            with self.subTest(pool=pool), self.assertRaises(ValueError):
                runs_on(pool=pool)

    def test_only_a_dispatch_outside_the_window_reaches_a_merge_queue_runner_label(self):
        queue_pool = {'stabileo', 'stabileo-pr', 'stabileo-e2e', 'stabileo-timing', 'stabileo-engine'}
        for event in ['schedule', 'workflow_dispatch']:
            for pool in ['', *heavy.POOLS]:
                for hour in range(24):
                    for self_hosted in [True, False]:
                        for pr_pool in [True, False]:
                            target = runs_on(event, pool, MAIN, self_hosted, pr_pool, hour)
                            labels = set(target) if isinstance(target, list) else {target}
                            with self.subTest(event=event, pool=pool, hour=hour, self_hosted=self_hosted, pr_pool=pr_pool):
                                self.assertEqual(bool(labels & queue_pool), event == 'workflow_dispatch'
                                                 and pool in ('', 'stabileo-pr') and hour >= 7 and self_hosted and pr_pool)

    def test_a_window_that_wraps_midnight(self):
        self.assertTrue(heavy.in_window(23, 22, 4))
        self.assertTrue(heavy.in_window(3, 22, 4))
        self.assertFalse(heavy.in_window(12, 22, 4))
        self.assertEqual(heavy.choose('workflow_dispatch', '', MAIN, True, True, 23, 22, 4)[0], NIGHTLY)
        self.assertEqual(heavy.choose('workflow_dispatch', '', MAIN, True, True, 5, 22, 4)[0], CI_1)


class Script(unittest.TestCase):
    def run_script(self, hour, **env):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / 'out'
            now = calendar.timegm((2026, 11, 8, hour, 30, 0))
            full = {'PATH': os.environ.get('PATH', ''), 'GITHUB_OUTPUT': str(out), 'NOW': str(now),
                    'EVENT': 'workflow_dispatch', 'REF': MAIN, 'SELF_HOSTED': 'true', 'PR_POOL': 'true', **env}
            proc = subprocess.run([sys.executable, '-B', '-I', str(SCRIPT)], env=full, capture_output=True, text=True)
            written = out.read_text() if out.exists() else ''
        return proc, written

    def test_writes_runs_on_as_json(self):
        proc, written = self.run_script(12, POOL='stabileo-pr')
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(written, f'runs_on={json.dumps(CI_1)}\n')
        self.assertIn('::notice title=Heavy jobs::stabileo-ci-1', proc.stdout)
        proc, written = self.run_script(3, POOL='stabileo-pr')
        self.assertEqual(written, f'runs_on={json.dumps(NIGHTLY)}\n')
        self.assertIn('only outside 00:00-07:00 UTC', proc.stdout)
        proc, written = self.run_script(12, POOL='ubuntu-24.04')
        self.assertEqual(written, 'runs_on="ubuntu-24.04"\n')

    def test_an_unknown_pool_fails_without_an_output(self):
        proc, written = self.run_script(12, POOL='stabileo')
        self.assertEqual(proc.returncode, 1)
        self.assertIn('::error::unknown pool', proc.stdout)
        self.assertEqual(written, '')


def job_block(text, name):
    return re.search(r'(?ms)^  %s:\n(.*?)(?=^  [\w-]+:\n|\Z)' % re.escape(name), text.split('\njobs:\n', 1)[1]).group(1)


class NightlyWiring(unittest.TestCase):
    TEXT = (ROOT / '.github/workflows/nightly.yml').read_text()

    def test_only_opensees_diff_takes_the_heavy_pool(self):
        users = re.findall(r'(?m)^  ([\w-]+):\n(?:(?:    .*|\s*)\n)*?    runs-on: \$\{\{ fromJSON\(needs\.plan\.outputs\.heavy_runs_on\) \}\}',
                           self.TEXT.split('\njobs:\n', 1)[1])
        self.assertEqual(users, ['opensees-diff'])
        self.assertIn('needs: plan', job_block(self.TEXT, 'opensees-diff'))

    def test_the_plan_computes_the_pool_from_the_dispatch_input(self):
        plan = job_block(self.TEXT, 'plan')
        self.assertIn('heavy_runs_on: ${{ steps.heavy.outputs.runs_on }}', plan)
        self.assertIn('run: python3 -B -I .github/scripts/heavy-pool.py', plan)
        for line in ['POOL: ${{ inputs.pool }}', 'EVENT: ${{ github.event_name }}', 'REF: ${{ github.ref }}',
                     'SELF_HOSTED: ${{ vars.STABILEO_SELF_HOSTED }}', 'PR_POOL: ${{ vars.STABILEO_PR_POOL }}']:
            self.assertIn(line, plan.split('id: heavy', 1)[1])
        self.assertIn('    env:\n      NIGHT_END_HOUR: 7\n', plan)
        self.assertIn('.github/scripts/', plan.split('sparse-checkout: |', 1)[1].split('sparse-checkout-cone-mode', 1)[0])

    def test_the_pool_input_defaults_to_stabileo_ci_1_and_its_options_are_the_scripts(self):
        block = self.TEXT.split('\n      pool:\n', 1)[1].split('\n      force_failure:', 1)[0]
        self.assertIn('default: stabileo-pr', block)
        self.assertIn('options: [%s]' % ', '.join(heavy.POOLS), block)

    def test_the_workflow_says_how_to_dispatch_outside_the_window(self):
        self.assertIn('gh workflow run nightly.yml --ref main -f only=opensees-diff -f pool=stabileo-pr', self.TEXT)


if __name__ == '__main__':
    unittest.main()
