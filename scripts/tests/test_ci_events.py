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
        self.assertIn("needs.changes.outputs.run_e2e == 'true'", job('e2e'))

    def test_a_label_never_restarts_ci_and_run_e2e_is_read_when_the_run_starts(self):
        text = (ROOT / '.github/workflows/ci.yml').read_text()
        self.assertIn('    types: [opened, synchronize, reopened]\n', text)
        self.assertNotIn('github.event.pull_request.labels', text)
        changes = job('changes')
        self.assertIn('gh api "repos/$GH_REPO/pulls/$PR"', changes)
        self.assertIn("FORCE_FULL: ${{ steps.labels.outputs.run_e2e == 'true' }}", changes)
        self.assertIn("run_e2e: ${{ steps.labels.outputs.run_e2e == 'true' }}", changes)

    def test_ci_ok_reports_unless_a_newer_run_replaces_it_and_counts_skipped_jobs_as_passing(self):
        ok = job('ci-ok')
        self.assertIn("    if: ${{ always() && needs.superseded.outputs.newer != 'true' }}\n", ok)
        self.assertIn('case "$r" in success|skipped) ;; *) exit 1 ;; esac', ok)

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
        self.assertIn("if: ${{ always() && needs.superseded.outputs.newer != 'true' }}", ci_ok)
        self.assertIn('success|skipped', ci_ok)

    def condition(self, name):
        return job(name).split('    if: ${{ ', 1)[1].split(' }}', 1)[0]

    def evaluate(self, expression, values):
        for key, value in values.items():
            expression = expression.replace(key, repr(value))
        expression = expression.replace('&&', ' and ').replace('||', ' or ').replace('!cancelled()', 'not cancelled()')
        return eval(expression, {'__builtins__': {}, 'always': lambda: True, 'cancelled': lambda: values['cancelled()']}, {})

    def test_ci_ok_skips_only_when_a_newer_run_on_the_same_head_replaces_a_cancelled_pull_request_run(self):
        for event in ['pull_request', 'merge_group', 'push', 'schedule', 'workflow_dispatch']:
            for cancelled in [False, True]:
                checks = self.evaluate(self.condition('superseded'), {'github.event_name': event, 'cancelled()': cancelled})
                self.assertEqual(checks, event == 'pull_request' and cancelled, (event, cancelled))
                for newer in (['true', 'false', ''] if checks else ['']):
                    runs = self.evaluate(self.condition('ci-ok'), {'needs.superseded.outputs.newer': newer, 'cancelled()': cancelled})
                    self.assertEqual(runs, newer != 'true', (event, cancelled, newer))

    def test_the_supersession_check_waits_for_every_job_and_looks_only_at_newer_runs_on_this_head(self):
        superseded = job('superseded')
        ci_ok = job('ci-ok')
        needs = lambda block: re.findall(r'^      - ([\w-]+)$', re.match(r'(?:      - [\w-]+\n)+', block.split('    needs:\n', 1)[1]).group(0), re.M)
        self.assertEqual(sorted(needs(superseded) + ['superseded']), sorted(needs(ci_ok)))
        self.assertIn('SHA: ${{ github.event.pull_request.head.sha }}', superseded)
        self.assertIn('actions/runs?event=pull_request&head_sha=$SHA', superseded)
        self.assertIn('select(.name == \\"$GITHUB_WORKFLOW\\" and .id > $RUN_ID)', superseded)


if __name__ == '__main__':
    unittest.main()
