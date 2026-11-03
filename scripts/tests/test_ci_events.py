import importlib.util
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('select_ci', ROOT / '.github/scripts/select-ci.py')
selection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(selection)
WORKFLOW = (ROOT / '.github/workflows/ci.yml').read_text()
QUEUE_KEEPS = ['engine', 'web', 'web_build', 'results', 'backend', 'ai_backend', 'ci_scripts', 'research']
HEAVY = ['slow_e2e', 'docker', 'determinism', 'flaky']


def job(name):
    return re.split(r'\n  [a-z][\w-]*:\n', WORKFLOW.split(f'\n  {name}:\n', 1)[1])[0]


class JobSelectionPerEvent(unittest.TestCase):
    def test_merge_queue_runs_the_gating_jobs_and_skips_the_heavy_ones(self):
        out = selection.select('merge_group', [])
        for key in QUEUE_KEEPS:
            self.assertEqual(out[key], 'true', key)
        for key in HEAVY:
            self.assertEqual(out[key], 'false', key)
        self.assertEqual(out['research_route_only'], 'true')
        self.assertEqual(out['e2e_shards'], str(list(range(1, 11))))
        self.assertEqual(out['scope'], 'full')

    def test_main_pushes_and_the_schedule_run_everything(self):
        for event in ['push', 'schedule', 'workflow_dispatch']:
            out = selection.select(event, [])
            for key in QUEUE_KEEPS + HEAVY:
                self.assertEqual(out[key], 'true', (event, key))
            self.assertEqual(out['research_route_only'], 'false', event)

    def test_pull_requests_never_run_the_slow_suite_unless_labelled(self):
        for paths in [['web/src/App.svelte'], ['engine/src/lib.rs'], ['docs/a.md']]:
            self.assertEqual(selection.select('pull_request', paths)['slow_e2e'], 'false')
        self.assertIn("contains(github.event.pull_request.labels.*.name, 'run-e2e')", job('e2e'))

    def test_pull_requests_keep_their_path_selection(self):
        full = selection.select('pull_request', ['web/src/App.svelte'])
        self.assertEqual([full[k] for k in HEAVY], ['false', 'true', 'true', 'true'])
        self.assertEqual(full['research_route_only'], 'false')
        engine = selection.select('pull_request', ['engine/src/lib.rs'])
        self.assertEqual(engine['determinism'], 'true')
        self.assertEqual(engine['docker'], 'true')
        self.assertEqual(selection.select('pull_request', ['web/src/components/tools/a.svelte'])['research_route_only'], 'true')

    def test_workflow_uses_the_selection(self):
        self.assertIn("schedule:\n    - cron: '30 3 * * *'\n  workflow_dispatch:", WORKFLOW)
        e2e = job('e2e')
        slow = e2e.split('- name: E2E slow suite', 1)[1].split('- name:', 1)[0]
        self.assertIn("needs.changes.outputs.slow_e2e == 'true'", slow)
        visual = e2e.split('- name: E2E visual baselines', 1)[1].split('- name:', 1)[0]
        self.assertIn("needs.changes.outputs.slow_e2e == 'true'", visual)
        self.assertNotIn('merge_group', slow + visual)
        self.assertIn("route_only: ${{ needs.changes.outputs.research_route_only == 'true' }}", job('research'))
        for key in ['slow_e2e', 'research_route_only']:
            self.assertIn(f'{key}: ${{{{ steps.select.outputs.{key} }}}}', job('changes'))
        self.assertIn("needs.changes.outputs.docker == 'true'", job('docker-smoke'))
        self.assertIn("needs.changes.outputs.determinism == 'true'", job('determinism'))
        self.assertIn("needs.changes.outputs.flaky == 'true'", job('e2e-flaky'))
        self.assertIn("github.event_name != 'schedule'", job('check-migrations'))

    def test_ci_ok_still_gates_everything_and_the_audit_names_stay_free(self):
        self.assertNotRegex(WORKFLOW, r'\n  (rust|npm):\n')
        self.assertNotRegex(WORKFLOW, r"\n    name: (rust|npm)\n")
        ci_ok = job('ci-ok')
        for name in ['changes', 'docker-smoke', 'determinism', 'e2e', 'research', 'web-unit', 'test-engine-gates']:
            self.assertIn(f'      - {name}\n', ci_ok)
        self.assertIn('if: always()', ci_ok)
        self.assertIn('success|skipped', ci_ok)


if __name__ == '__main__':
    unittest.main()
