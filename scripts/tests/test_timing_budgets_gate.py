import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
CI = (ROOT / '.github/workflows/ci.yml').read_text()
REPORT_ONLY = "github.event_name == 'pull_request' || github.event_name == 'merge_group'"


def job(name):
    return re.split(r'\n  [\w-]+:\n', CI.split(f'\n  {name}:\n', 1)[1], 1)[0]


def steps(body):
    return {m.group(1): m.group(0) for m in re.finditer(r'      - name: ([^\n]+)\n(?:        [^\n]*\n)*', body)}


class TimingBudgetsGate(unittest.TestCase):
    def setUp(self):
        self.body = job('timing-budgets')
        self.steps = steps(self.body)

    def test_only_the_timing_is_soft_and_only_on_pull_requests_and_the_merge_queue(self):
        soft = f"WALL_CLOCK_REPORT: ${{{{ ({REPORT_ONLY}) && format('{{0}}/wall-clock-overruns.jsonl', runner.temp) || '' }}}}"
        for name in ('Scale budgets', 'E2E wall-clock budgets'):
            with self.subTest(step=name):
                self.assertIn(soft, self.steps[name])
                self.assertNotIn('continue-on-error', self.steps[name])

    def test_the_e2e_budgets_still_run_after_a_scale_failure(self):
        self.assertIn("if: ${{ !cancelled() }}", self.steps['E2E wall-clock budgets'])

    def test_an_overrun_on_a_pull_request_or_the_merge_queue_is_reported(self):
        step = self.steps['Report budget overruns without failing']
        self.assertIn(f"if: ${{{{ !cancelled() && ({REPORT_ONLY}) }}}}", step)
        self.assertIn('OVERRUNS: ${{ runner.temp }}/wall-clock-overruns.jsonl', step)
        self.assertIn('[ -s "$OVERRUNS" ] || exit 0', step)
        self.assertIn('::warning title=Timing Budgets::', step)
        self.assertIn('$GITHUB_STEP_SUMMARY', step)

    def test_every_wall_clock_budget_goes_through_the_report_aware_helper(self):
        web = ROOT / 'web'
        for path in ('src/lib/engine/__tests__/scale-budget.test.ts', 'e2e/model-fluidity.spec.ts'):
            text = (web / path).read_text()
            with self.subTest(path=path):
                self.assertNotIn('NO_WALL_CLOCK', text)
                self.assertNotRegex(text, r'\bif \(WALL_CLOCK\)')
                self.assertIn("import { assertBudget } from '", text)
                self.assertRegex(text, r'if \(assertBudget\(')

    def test_only_a_main_only_job_may_write_issues(self):
        self.assertNotIn('permissions:', self.body)
        self.assertNotIn('github-script', self.body)
        self.assertIn('      scale: ${{ steps.scale.outcome }}\n      e2e: ${{ steps.e2e.outcome }}\n', self.body)
        alert = job('timing-budgets-alert')
        self.assertIn('    needs: timing-budgets\n', alert)
        self.assertIn("    if: ${{ !cancelled() && github.event_name != 'pull_request' && github.event_name != 'merge_group' && github.ref == 'refs/heads/main' && needs.timing-budgets.result != 'skipped' }}\n", alert)
        self.assertIn('    permissions:\n      contents: read\n      issues: write\n', alert)
        self.assertIn("require('./.github/scripts/timing-budget-alert.cjs')", alert)
        self.assertIn('SCALE_OUTCOME: ${{ needs.timing-budgets.outputs.scale }}', alert)
        self.assertIn('E2E_OUTCOME: ${{ needs.timing-budgets.outputs.e2e }}', alert)
        self.assertNotIn('timing-budgets-alert', job('ci-ok'))
        writers = [m.group(1) for m in re.finditer(r'\n  ([\w-]+):\n(?:(?!\n  [\w-]+:\n)[\s\S])*?issues: write', CI)]
        self.assertEqual(sorted(set(writers)), ['ci-ok', 'timing-budgets-alert'])

    def test_ci_ok_still_fails_on_a_failed_timing_job(self):
        ok = job('ci-ok')
        self.assertIn('      - timing-budgets\n', ok)
        self.assertIn('case "$r" in success|skipped) ;; *) exit 1 ;; esac', ok)

    def test_no_step_of_the_job_is_allowed_to_fail(self):
        for name, step in self.steps.items():
            with self.subTest(step=name):
                self.assertNotIn('continue-on-error', step)


if __name__ == '__main__':
    unittest.main()
