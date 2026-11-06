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


class EngineWallClockGate(unittest.TestCase):
    def setUp(self):
        self.body = job('test-engine-gates')
        self.steps = steps(self.body)

    def test_only_pull_requests_and_the_merge_queue_report_instead_of_failing(self):
        step = self.steps['Named correctness gates']
        self.assertIn(f"WALL_CLOCK_REPORT: ${{{{ ({REPORT_ONLY}) && format('{{0}}/engine-wall-clock-overruns.jsonl', runner.temp) || '' }}}}", step)
        self.assertIn('run: make test.engine.gates\n', step)
        self.assertNotIn('continue-on-error', self.body.split('      - name: Fetch Rust dependencies', 1)[1])

    def test_an_overrun_is_reported(self):
        step = self.steps['Report wall-clock overruns without failing']
        self.assertIn(f"if: ${{{{ !cancelled() && ({REPORT_ONLY}) }}}}", step)
        self.assertIn('OVERRUNS: ${{ runner.temp }}/engine-wall-clock-overruns.jsonl', step)
        self.assertIn('[ -s "$OVERRUNS" ] || exit 0', step)
        self.assertIn('::warning title=Engine wall-clock budgets::', step)
        self.assertIn('$GITHUB_STEP_SUMMARY', step)

    def test_no_other_engine_job_sets_the_report_file(self):
        self.assertEqual(CI.count('WALL_CLOCK_REPORT: ${{') - CI.count("format('{0}/wall-clock-overruns.jsonl'"), 1)

    def test_the_helper_reports_only_when_the_variable_names_a_file(self):
        source = (ROOT / 'engine/src/wall_clock.rs').read_text()
        self.assertIn('std::env::var_os("WALL_CLOCK_REPORT")', source)
        self.assertIn('None => panic!("{what}")', source)
        self.assertIn('report.filter(|path| !path.is_empty())', source)


if __name__ == '__main__':
    unittest.main()
