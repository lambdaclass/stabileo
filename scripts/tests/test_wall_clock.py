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
    def test_the_slow_suite_runs_every_spec_and_passes_the_switch(self):
        self.assertIn('NO_WALL_CLOCK=1 npx playwright test --grep "@slow" --grep-invert "visual baselines|@flaky" ',
                      dry_run('e2e.web.slow', 'NO_WALL_CLOCK=1'))
        self.assertIn('NO_WALL_CLOCK= npx playwright test --grep "@slow" --grep-invert "visual baselines|@flaky" ',
                      dry_run('e2e.web.slow'))

    def test_only_the_wall_clock_asserts_of_the_e2e_specs_are_gated(self):
        gated = {'rebar-workspace-open.spec.ts': 3, 'model-fluidity.spec.ts': 1}
        for name, count in gated.items():
            spec = (ROOT / 'web/e2e' / name).read_text()
            self.assertIn("const WALL_CLOCK = process.env.NO_WALL_CLOCK !== '1';", spec)
            lines = [line for line in spec.splitlines() if 'WALL_CLOCK' in line and 'const WALL_CLOCK' not in line]
            self.assertEqual(len(lines), count, name)
            for line in lines:
                self.assertRegex(line, r'^\s*if \(WALL_CLOCK\) expect\(', name)
            gated_asserts = spec.count('if (WALL_CLOCK) expect(')
            self.assertGreater(len(re.findall(r'\bexpect(?:\.poll)?\(', spec)) - gated_asserts, gated_asserts, name)
        for spec in (ROOT / 'web/e2e').glob('*.spec.ts'):
            if spec.name not in gated:
                self.assertNotIn('NO_WALL_CLOCK', spec.read_text(), spec.name)

    def test_the_build_pass_passes_the_switch_to_the_scale_budgets(self):
        self.assertIn('NO_WALL_CLOCK=1 npx vitest run --project build', dry_run('test.web.build', 'NO_WALL_CLOCK=1'))
        self.assertIn('NO_WALL_CLOCK= npx vitest run --project build', dry_run('test.web.build'))
        test = (ROOT / 'web/src/lib/engine/__tests__/scale-budget.test.ts').read_text()
        self.assertIn("const WALL_CLOCK = process.env.NO_WALL_CLOCK !== '1';", test)
        budgets = re.findall(r'^\s*(.*)expect\(MEASURED\.(\w+)\)\.toBeLessThan\(BUDGET\.\2\);$', test, re.M)
        self.assertEqual(budgets, [('if (WALL_CLOCK) ', k) for k in ('tables', 'report', 'scene')])

    def test_every_self_hosted_step_sets_the_switch(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        for name, target in [('Build and production-build tests', 'make test.web.build'),
                             ('E2E slow suite (shard ${{ matrix.shard }}/${{ needs.changes.outputs.e2e_total }})', 'make e2e.web.slow')]:
            body = step(workflow, name)
            self.assertIn("NO_WALL_CLOCK: ${{ runner.environment == 'self-hosted' && '1' || '' }}", body)
            self.assertEqual(body.count(target), 2)
            self.assertEqual(body.count('NO_WALL_CLOCK="$NO_WALL_CLOCK"'), 2)
        self.assertEqual(workflow.count('NO_WALL_CLOCK:'), 2)

    def test_the_budgets_run_on_a_hosted_vm_wherever_shared_runners_skip_them(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        job = workflow.split('\n  timing-budgets:\n', 1)[1].split('\n\n  ', 1)[0]
        self.assertIn('    runs-on: ubuntu-24.04\n', job)
        self.assertNotIn('self-hosted', job)
        self.assertIn("    if: needs.changes.outputs.web == 'true' && needs.changes.outputs.retest == 'true' && (github.event_name != 'pull_request' || vars.STABILEO_PR_POOL == 'true')\n", job)
        self.assertNotIn('NO_WALL_CLOCK', job)
        self.assertIn('run: make test.web.timing\n', job + '\n')
        self.assertIn('run: make e2e.web.timing\n', job + '\n')
        ci_ok = workflow.split('\n  ci-ok:\n', 1)[1].split('    steps:', 1)[0]
        self.assertIn('      - timing-budgets\n', ci_ok)
        vitest = dry_run('test.web.timing')
        self.assertIn('npx vitest run --project build src/lib/engine/__tests__/scale-budget.test.ts', vitest)
        playwright = dry_run('e2e.web.timing')
        for spec in ('rebar-workspace-open.spec.ts', 'model-fluidity.spec.ts'):
            self.assertIn(f'e2e/{spec}', playwright)
        for command in (vitest, playwright):
            self.assertNotIn('NO_WALL_CLOCK', command)


if __name__ == '__main__':
    unittest.main()
