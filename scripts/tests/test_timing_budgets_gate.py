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

    def test_both_budgets_fail_the_job_only_outside_pull_requests_and_the_merge_queue(self):
        for name in ('Scale budgets', 'E2E wall-clock budgets'):
            with self.subTest(step=name):
                self.assertIn(f'continue-on-error: ${{{{ {REPORT_ONLY} }}}}', self.steps[name])

    def test_the_e2e_budgets_still_run_after_a_scale_overrun(self):
        self.assertIn("if: ${{ !cancelled() }}", self.steps['E2E wall-clock budgets'])

    def test_an_overrun_on_a_pull_request_or_the_merge_queue_is_reported(self):
        step = self.steps['Report an overrun without failing']
        self.assertIn(f'({REPORT_ONLY})', step)
        self.assertIn("steps.scale.outcome == 'failure' || steps.e2e.outcome == 'failure'", step)
        self.assertIn('::warning title=Timing Budgets::', step)
        self.assertIn('$GITHUB_STEP_SUMMARY', step)

    def test_main_runs_open_or_close_the_issue_and_pull_requests_never_do(self):
        step = self.steps['Open, update or close the Timing Budgets issue']
        self.assertIn("github.event_name != 'pull_request' && github.event_name != 'merge_group' && github.ref == 'refs/heads/main'", step)
        self.assertIn("require('./.github/scripts/timing-budget-alert.cjs')", step)
        self.assertIn('SCALE_OUTCOME: ${{ steps.scale.outcome }}', step)
        self.assertIn('E2E_OUTCOME: ${{ steps.e2e.outcome }}', step)
        self.assertRegex(self.body, r'permissions:\n      contents: read\n      actions: read\n      issues: write\n')

    def test_ci_ok_still_fails_on_a_failed_timing_job(self):
        ok = job('ci-ok')
        self.assertIn('      - timing-budgets\n', ok)
        self.assertIn('case "$r" in success|skipped) ;; *) exit 1 ;; esac', ok)

    def test_no_other_step_of_the_job_is_allowed_to_fail(self):
        allowed = {'Scale budgets', 'E2E wall-clock budgets', 'Open, update or close the Timing Budgets issue'}
        for name, step in self.steps.items():
            if name not in allowed:
                with self.subTest(step=name):
                    self.assertNotIn('continue-on-error', step)


if __name__ == '__main__':
    unittest.main()
