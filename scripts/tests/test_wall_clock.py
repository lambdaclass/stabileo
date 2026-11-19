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
    def test_shared_targets_exclude_timing_tests(self):
        self.assertIn('--grep @smoke --grep-invert "@flaky|@timing"', dry_run('e2e.web.smoke'))
        self.assertIn('--grep "@slow" --grep-invert "visual baselines|@flaky|@timing"', dry_run('e2e.web.slow'))

    def test_timing_only_specs_are_absent_from_both_shared_shard_plans(self):
        for suite in ('smoke', 'slow'):
            result = subprocess.run(
                ['node', 'scripts/e2e-shard.mjs', '--suite', suite, '1', '1'],
                cwd=ROOT / 'web', check=True, capture_output=True, text=True,
            )
            files = {pathlib.PurePath(file).name for file in result.stdout.splitlines()}
            for spec in ('model-fluidity', 'rebar-workspace-open'):
                self.assertNotIn(f'{spec}.spec.ts', files)
                self.assertNotIn(f'{spec}.timing.spec.ts', files)
            self.assertIn('project-restore.spec.ts', files)

    def test_timing_job_uses_the_dedicated_pool_for_trusted_runs(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        job = workflow.split('\n  timing-budgets:\n', 1)[1].split('\n\n  ', 1)[0]
        self.assertIn('["self-hosted","stabileo-timing"]', job)
        self.assertIn("vars.STABILEO_TIMING_POOL == 'true'", job)
        self.assertIn("github.event_name == 'merge_group'", job)
        self.assertIn("|| 'ubuntu-24.04' }}", job)

    def test_only_the_wall_clock_asserts_of_the_e2e_specs_are_gated(self):
        gated = {'rebar-workspace-open.timing.spec.ts': 3, 'model-fluidity.timing.spec.ts': 1}
        for name, count in gated.items():
            spec = (ROOT / 'web/e2e' / name).read_text()
            self.assertRegex(spec, r"\btest(?:\.describe)?\('@timing ", name)
            self.assertIn("import { assertBudget } from '../src/lib/engine/__tests__/wall-clock-budget';", spec)
            self.assertNotIn('WALL_CLOCK', spec, name)
            lines = [line for line in spec.splitlines() if 'assertBudget(' in line]
            self.assertEqual(len(lines), count, name)
            for line in lines:
                self.assertRegex(line, r'^\s*if \(assertBudget\(.*\)\) expect\(', name)
            self.assertGreater(len(re.findall(r'\bexpect(?:\.poll)?\(', spec)) - count, count, name)
        for spec in (ROOT / 'web/e2e').glob('*.spec.ts'):
            if spec.name not in gated:
                self.assertNotIn('NO_WALL_CLOCK', spec.read_text(), spec.name)
                self.assertNotIn('assertBudget', spec.read_text(), spec.name)

    def test_restore_journey_uses_timing_and_its_toast_check_stays_in_smoke(self):
        spec = (ROOT / 'web/e2e/project-restore.spec.ts').read_text()
        self.assertIn("test('@timing restore, design, view in 3-D", spec)
        self.assertIn("test('@smoke the toast recorder", spec)
        self.assertNotIn("test('@slow", spec)

    def test_the_budget_helper_honours_the_switch(self):
        helper = (ROOT / 'web/src/lib/engine/__tests__/wall-clock-budget.ts').read_text()
        self.assertIn("if (env.NO_WALL_CLOCK === '1') return false;", helper)

    def test_the_build_pass_passes_the_switch_to_the_scale_budgets(self):
        self.assertIn('NO_WALL_CLOCK=1 npx vitest run --project build', dry_run('test.web.build', 'NO_WALL_CLOCK=1'))
        self.assertIn('NO_WALL_CLOCK= npx vitest run --project build', dry_run('test.web.build'))
        test = (ROOT / 'web/src/lib/engine/__tests__/scale-budget.test.ts').read_text()
        self.assertIn("import { assertBudget } from './wall-clock-budget';", test)
        self.assertNotIn('WALL_CLOCK', test)
        budgets = re.findall(r"^\s*if \(assertBudget\(MEASURED\.(\w+), BUDGET\.\1, '[^']+'\)\) expect\(MEASURED\.\1\)\.toBeLessThan\(BUDGET\.\1\);$", test, re.M)
        self.assertEqual(budgets, ['tables', 'report', 'scene'])

    def test_the_self_hosted_build_pass_sets_the_switch(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        body = step(workflow, 'Build and production-build tests')
        self.assertIn("NO_WALL_CLOCK: ${{ runner.environment == 'self-hosted' && '1' || '' }}", body)
        self.assertEqual(body.count('make test.web.build'), 2)
        self.assertEqual(body.count('NO_WALL_CLOCK="$NO_WALL_CLOCK"'), 2)
        self.assertEqual(workflow.count('NO_WALL_CLOCK:'), 1)

    def test_the_timing_job_is_required_where_web_tests_run(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        job = workflow.split('\n  timing-budgets:\n', 1)[1].split('\n\n  ', 1)[0]
        self.assertIn("    if: needs.changes.outputs.web == 'true' && needs.changes.outputs.retest == 'true'\n", job)
        self.assertNotIn('NO_WALL_CLOCK', job)
        self.assertIn('run: make test.web.timing\n', job + '\n')
        self.assertIn('nix develop .#e2e -c make e2e.web.timing NIX_RUN=', job)
        self.assertIn('            make e2e.web.timing\n', job)
        ci_ok = workflow.split('\n  ci-ok:\n', 1)[1].split('    steps:', 1)[0]
        self.assertIn('      - timing-budgets\n', ci_ok)
        vitest = dry_run('test.web.timing')
        self.assertIn('npx vitest run --project build src/lib/engine/__tests__/scale-budget.test.ts', vitest)
        playwright = dry_run('e2e.web.timing')
        self.assertIn('--grep "@timing" --grep-invert "@flaky"', playwright)
        for command in (vitest, playwright):
            self.assertNotIn('NO_WALL_CLOCK', command)


if __name__ == '__main__':
    unittest.main()
