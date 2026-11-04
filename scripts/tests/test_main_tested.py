"""main-tested.py: a push to main skips re-testing only for a tree a successful merge-queue CI run built."""
import importlib.util
import io
from pathlib import Path
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('main_tested', ROOT / '.github/scripts/main-tested.py')
main_tested = importlib.util.module_from_spec(spec)
spec.loader.exec_module(main_tested)

WORKFLOW = (ROOT / '.github/workflows/ci.yml').read_text()
REPO = 'lambdaclass/stabileo'


def job(name):
    return re.split(r'\n  [a-z][\w-]*:\n', WORKFLOW.split(f'\n  {name}:\n', 1)[1])[0]


def condition(name):
    return re.search(r'^    if: (.*)$', job(name), re.MULTILINE)[1]
TREES = {'main-sha': 'tree-a', 'group-ok': 'tree-a', 'group-other': 'tree-b', 'group-failed': 'tree-a'}
PUSH = {'GITHUB_EVENT_NAME': 'push', 'GITHUB_REF': 'refs/heads/main', 'GITHUB_SHA': 'main-sha', 'GITHUB_REPOSITORY': REPO}


def api_with(runs, trees=TREES, calls=None):
    def api(path):
        if calls is not None:
            calls.append(path)
        if path.startswith(f'repos/{REPO}/git/commits/'):
            return {'tree': {'sha': trees[path.rsplit('/', 1)[1]]}}
        assert path.startswith(f'repos/{REPO}/actions/workflows/ci.yml/runs?event=merge_group&status=success'), path
        return {'workflow_runs': runs}
    return api


def run(sha, conclusion='success', event='merge_group'):
    return {'id': 1, 'head_sha': sha, 'conclusion': conclusion, 'event': event}


def output(env, api):
    out = io.StringIO()
    main_tested.main(env=env, api=api, out=out)
    return out.getvalue()


class MainTested(unittest.TestCase):
    def test_tree_of_a_successful_merge_group_run_is_tested(self):
        calls = []
        self.assertEqual(output(PUSH, api_with([run('group-other'), run('group-ok')], calls=calls)), 'tested=true\n')
        self.assertIn(f'repos/{REPO}/git/commits/main-sha', calls)
        self.assertIn(f'repos/{REPO}/git/commits/group-ok', calls)

    def test_no_matching_tree_runs_everything(self):
        self.assertEqual(output(PUSH, api_with([run('group-other')])), 'tested=false\n')
        self.assertEqual(output(PUSH, api_with([])), 'tested=false\n')

    def test_a_matching_tree_whose_run_did_not_succeed_runs_everything(self):
        self.assertEqual(output(PUSH, api_with([run('group-failed', conclusion='failure')])), 'tested=false\n')
        self.assertEqual(output(PUSH, api_with([run('group-ok', event='push')])), 'tested=false\n')

    def test_api_errors_run_everything(self):
        def broken(path):
            raise subprocess.CalledProcessError(1, ['gh', 'api', path])
        self.assertEqual(output(PUSH, broken), 'tested=false\n')
        self.assertEqual(output(PUSH, lambda path: {}), 'tested=false\n')

    def test_only_a_push_to_main_is_ever_tested(self):
        api = api_with([run('group-ok')])
        for env in [{**PUSH, 'GITHUB_REF': 'refs/heads/other'}, {**PUSH, 'GITHUB_EVENT_NAME': 'merge_group'},
                    {**PUSH, 'GITHUB_EVENT_NAME': 'schedule'}, {**PUSH, 'GITHUB_EVENT_NAME': 'pull_request'}]:
            with self.subTest(env=env):
                self.assertEqual(output(env, api), 'tested=false\n')

    def test_workflow_wiring(self):
        changes = job('changes')
        self.assertIn('      actions: read\n', changes)
        self.assertIn('      retest: ${{ steps.select.outputs.retest }}\n', changes)
        self.assertIn("""        id: tested
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        env:
          GH_TOKEN: ${{ github.token }}
        run: python3 .github/scripts/main-tested.py
""", changes)
        self.assertIn('          TESTED: ${{ steps.tested.outputs.tested }}\n', changes)
        self.assertLess(changes.index('id: tested'), changes.index('id: select'))
        for name in ['web-unit', 'timing-budgets']:
            self.assertIn("needs.changes.outputs.retest == 'true'", condition(name), name)
        for name in ['wasm', 'research-wasm', 'site-e2e', 'web-build', 'e2e', 'e2e-flaky', 'determinism', 'docker-smoke', 'research']:
            self.assertNotIn('retest', condition(name), name)

if __name__ == '__main__':
    unittest.main()
