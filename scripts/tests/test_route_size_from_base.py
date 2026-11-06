import pathlib
import re
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPT = ROOT / '.github/scripts/route-size-from-base.sh'
FILES = ['check-research-route-size.mjs', 'research-route-budget.mjs', 'research-route-allowances.json']


def checkout(root, name, tag, extra=()):
    scripts = pathlib.Path(root, name, 'web/scripts')
    scripts.mkdir(parents=True)
    for f in [*FILES, *extra]:
        (scripts / f).write_text(f'{tag} {f}\n')
    return pathlib.Path(root, name)


def route_job():
    workflow = (ROOT / '.github/workflows/research.yml').read_text()
    return workflow.split('\n  route-size:\n', 1)[1].split('\n  catalog:\n', 1)[0]


class FromBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = checkout(self.tmp.name, 'route-main', 'main', ['new-helper.mjs'])
        self.candidate = checkout(self.tmp.name, 'candidate', 'stale')

    def tearDown(self):
        self.tmp.cleanup()

    def run_script(self, *extra):
        return subprocess.run([str(SCRIPT), str(self.base), str(self.candidate), *extra], check=True, capture_output=True, text=True).stdout.strip()

    def test_the_candidate_is_measured_with_the_base_scripts_and_budgets(self):
        dest = pathlib.Path(self.run_script())
        self.assertEqual(dest, self.candidate / 'web/.route-base')
        for f in [*FILES, 'new-helper.mjs']:
            self.assertEqual((dest / f).read_text(), f'main {f}\n')
        for f in FILES:
            self.assertEqual((self.candidate / 'web/scripts' / f).read_text(), f'stale {f}\n')

    def test_a_previous_copy_never_survives(self):
        dest = self.candidate / 'web/.route-base'
        dest.mkdir(parents=True)
        (dest / 'leftover.mjs').write_text('stale\n')
        self.run_script()
        self.assertFalse((dest / 'leftover.mjs').exists())

    def test_only_an_allowance_change_of_the_pull_request_itself_is_kept(self):
        dest = pathlib.Path(self.run_script('--pr-allowances'))
        self.assertEqual((dest / 'research-route-allowances.json').read_text(), 'stale research-route-allowances.json\n')
        self.assertEqual((dest / 'check-research-route-size.mjs').read_text(), 'main check-research-route-size.mjs\n')
        self.assertEqual((dest / 'research-route-budget.mjs').read_text(), 'main research-route-budget.mjs\n')

    def test_a_base_without_the_check_fails(self):
        (self.base / 'web/scripts/check-research-route-size.mjs').unlink()
        self.assertNotEqual(subprocess.run([str(SCRIPT), str(self.base), str(self.candidate)], capture_output=True).returncode, 0)


class Workflow(unittest.TestCase):
    def test_route_main_is_the_base_ref(self):
        job = route_job()
        self.assertIn("ref: ${{ github.event.merge_group.base_sha || 'main' }}", job)
        self.assertIn('path: route-main', job)

    def test_the_candidate_runs_the_check_resolved_from_the_base(self):
        job = route_job()
        self.assertIn('.github/scripts/route-size-from-base.sh route-main .', job)
        self.assertIn('cd web && node --test scripts/research-route-budget.test.mjs', job)
        self.assertIn("node .route-base/check-research-route-size.mjs --baseline '$RUNNER_TEMP/route-main.json'\"", job)
        self.assertIn("cd route-main/web && node scripts/check-research-route-size.mjs --baseline '$RUNNER_TEMP/route-main.json' --update", job)
        self.assertEqual(re.findall(r'node (\S*check-research-route-size\.mjs)', job), ['scripts/check-research-route-size.mjs', '.route-base/check-research-route-size.mjs'])
        self.assertNotRegex(job, r'cp [^\n]*web/scripts/[^\n]*route-main')
        self.assertLess(job.index('route-size-from-base.sh'), job.index('node .route-base/'))

    def test_the_pull_request_allowances_are_used_only_when_it_changes_them(self):
        job = route_job()
        self.assertIn("grep -qx 'web/scripts/research-route-allowances.json'", job)
        self.assertIn('.github/scripts/route-size-from-base.sh route-main . --pr-allowances', job)


if __name__ == '__main__':
    unittest.main()
