import pathlib
import re
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]


def dry_run(*args):
    return subprocess.run(['make', '-n', '-C', str(ROOT), *args, 'NIX_RUN='],
                          check=True, capture_output=True, text=True).stdout


def step(workflow, name):
    return workflow.split(f'      - name: {name}', 1)[1].split('\n      - ', 1)[0]


class WallClockOutsideTheQueue(unittest.TestCase):
    def test_the_slow_suite_drops_only_the_wall_clock_specs_when_asked(self):
        excluded = re.search(r'^WALL_CLOCK_E2E := (.+)$', (ROOT / 'Makefile').read_text(), re.M).group(1).split('|')
        for spec in excluded:
            self.assertTrue((ROOT / 'web/e2e' / spec.replace('\\.', '.').replace('.spec', '.spec.ts')).exists(), spec)
        self.assertIn('--grep-invert "visual baselines|@flaky|' + '|'.join(excluded) + '"',
                      dry_run('e2e.web.slow', 'NO_WALL_CLOCK=1'))
        self.assertIn('--grep-invert "visual baselines|@flaky" ', dry_run('e2e.web.slow'))

    def test_the_build_pass_passes_the_switch_to_the_scale_budgets(self):
        self.assertIn('NO_WALL_CLOCK=1 npx vitest run --project build', dry_run('test.web.build', 'NO_WALL_CLOCK=1'))
        self.assertIn('NO_WALL_CLOCK= npx vitest run --project build', dry_run('test.web.build'))
        test = (ROOT / 'web/src/lib/engine/__tests__/scale-budget.test.ts').read_text()
        self.assertIn("const WALL_CLOCK = process.env.NO_WALL_CLOCK !== '1';", test)
        budgets = re.findall(r'^\s*(.*)expect\(MEASURED\.(\w+)\)\.toBeLessThan\(BUDGET\.\2\);$', test, re.M)
        self.assertEqual(budgets, [('if (WALL_CLOCK) ', k) for k in ('tables', 'report', 'scene')])

    def test_only_merge_group_runs_set_the_switch(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        for name, target in [('Build and production-build tests', 'make test.web.build'),
                             ('E2E slow suite (shard ${{ matrix.shard }}/10)', 'make e2e.web.slow')]:
            body = step(workflow, name)
            self.assertIn("NO_WALL_CLOCK: ${{ github.event_name == 'merge_group' && '1' || '' }}", body)
            self.assertEqual(body.count(target), 2)
            self.assertEqual(body.count('NO_WALL_CLOCK="$NO_WALL_CLOCK"'), 2)
        self.assertEqual(workflow.count('NO_WALL_CLOCK:'), 2)


if __name__ == '__main__':
    unittest.main()
