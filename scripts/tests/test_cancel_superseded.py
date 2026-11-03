import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('cancel', ROOT / '.github/scripts/cancel-superseded-merge-groups.py')
cancel = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cancel)


def run(run_id, sha, status='queued', event='merge_group'):
    return {'id': run_id, 'head_sha': sha, 'status': status, 'event': event}


class CancelSuperseded(unittest.TestCase):
    def test_cancels_only_unfinished_merge_group_runs_outside_the_queue(self):
        runs = [run(1, 'live'), run(2, 'old'), run(3, 'old', 'in_progress'), run(4, 'old', 'completed'),
                run(5, 'old', event='push'), run(6, 'own')]
        self.assertEqual(cancel.superseded(runs, {'live', 'own'}, 'own'), [2, 3])

    def test_a_run_is_live_if_its_head_is_a_queue_entry_or_a_merge_group_ref(self):
        entries = [{'headCommit': {'oid': 'entry'}}, {'headCommit': None}]
        refs = [{'ref': 'refs/heads/gh-readonly-queue/main/pr-1-base', 'object': {'sha': 'group'}}]
        heads = cancel.live_heads(entries, refs)
        self.assertEqual(heads, {'entry', 'group'})
        runs = [run(1, 'entry'), run(2, 'group'), run(3, 'gone')]
        self.assertEqual(cancel.superseded(runs, heads, 'group'), [3])

    def test_a_head_seen_in_any_snapshot_is_never_cancelled(self):
        runs = [run(1, 'rebuilt'), run(2, 'gone'), run(3, 'own')]
        self.assertEqual(cancel.confirmed(runs, [{'own'}, {'own', 'rebuilt'}], 'own'), [2])
        self.assertEqual(cancel.confirmed(runs, [{'own', 'rebuilt'}, {'own'}, {'own'}], 'own'), [2])

    def test_cancels_nothing_unless_every_snapshot_holds_its_own_head(self):
        runs = [run(1, 'gone')]
        self.assertEqual(cancel.confirmed(runs, [{'own'}, set()], 'own'), [])
        self.assertEqual(cancel.confirmed(runs, [], 'own'), [])

    def test_cancels_nothing_when_its_own_head_is_not_queued(self):
        self.assertEqual(cancel.superseded([run(1, 'old')], set(), 'own'), [])
        self.assertEqual(cancel.superseded([run(1, 'old')], {'live'}, 'own'), [])

    def test_a_rebuilt_entry_cancels_its_own_old_run_and_never_another_prs(self):
        refs = [{'ref': 'refs/heads/gh-readonly-queue/main/pr-7-newbase', 'object': {'sha': 'pr7-new'}},
                {'ref': 'refs/heads/gh-readonly-queue/main/pr-8-newbase', 'object': {'sha': 'pr8-new'}}]
        entries = [{'headCommit': {'oid': 'pr7-new'}}, {'headCommit': {'oid': 'pr8-new'}}]
        heads = cancel.live_heads(entries, refs)
        runs = [run(1, 'pr7-old', 'in_progress'), run(2, 'pr8-new', 'in_progress'), run(3, 'pr7-new')]
        self.assertEqual(cancel.confirmed(runs, [heads, heads, heads], 'pr7-new'), [1])
        self.assertEqual(cancel.confirmed(runs, [heads, heads, heads], 'pr8-new'), [1])

    def test_every_page_of_every_status_and_workflow_is_read(self):
        calls = []

        def fake_gh(*args):
            calls.append(args)
            workflow = args[-1].split('/workflows/', 1)[1].split('/', 1)[0]
            status = args[-1].split('status=', 1)[1].split('&', 1)[0]
            if status != 'in_progress':
                return ''
            return '\n'.join(f'{{"id": {i}, "workflow": "{workflow}"}}' for i in range(150)) + '\n'
        real, cancel.gh = cancel.gh, fake_gh
        try:
            runs = cancel.unfinished_runs('o/r', ['ci.yml', 'verify.yml'])
        finally:
            cancel.gh = real
        self.assertEqual(len(runs), 300)
        self.assertTrue(all(c[:3] == ('api', '--paginate', '--jq') for c in calls))
        self.assertEqual(len(calls), 10)

    def test_the_cancelling_script_comes_from_main_not_from_the_queued_prs(self):
        workflow = (ROOT / '.github/workflows/merge-queue-supersede.yml').read_text()
        self.assertIn('ref: ${{ github.event.merge_group.base_sha }}', workflow)

    def test_every_workflow_on_merge_group_is_covered(self):
        workflow = (ROOT / '.github/workflows/merge-queue-supersede.yml').read_text()
        listed = set(workflow.split('cancel-superseded-merge-groups.py ', 1)[1].split('\n', 1)[0].split())
        on_queue = {p.name for p in (ROOT / '.github/workflows').glob('*.yml')
                    if p.name != 'merge-queue-supersede.yml'
                    and '\n  merge_group:' in p.read_text().split('\njobs:\n', 1)[0]}
        self.assertLessEqual(on_queue, listed)

    def test_workflow_cancels_ci_and_supply_chain_and_only_on_merge_group(self):
        workflow = (ROOT / '.github/workflows/merge-queue-supersede.yml').read_text()
        self.assertIn('merge_group:', workflow)
        self.assertNotIn('pull_request', workflow)
        self.assertNotIn('push:', workflow)
        self.assertIn('cancel-superseded-merge-groups.py ci.yml supply-chain.yml verify.yml', workflow)
        self.assertIn('actions: write', workflow)
        self.assertIn('timeout-minutes:', workflow)


if __name__ == '__main__':
    unittest.main()
