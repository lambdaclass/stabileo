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

    def test_cancels_nothing_when_its_own_head_is_not_queued(self):
        self.assertEqual(cancel.superseded([run(1, 'old')], set(), 'own'), [])
        self.assertEqual(cancel.superseded([run(1, 'old')], {'live'}, 'own'), [])

    def test_workflow_cancels_ci_and_supply_chain_and_only_on_merge_group(self):
        workflow = (ROOT / '.github/workflows/merge-queue-supersede.yml').read_text()
        self.assertIn('merge_group:', workflow)
        self.assertNotIn('pull_request', workflow)
        self.assertNotIn('push:', workflow)
        self.assertIn('cancel-superseded-merge-groups.py ci.yml supply-chain.yml', workflow)
        self.assertIn('actions: write', workflow)
        self.assertIn('timeout-minutes:', workflow)


if __name__ == '__main__':
    unittest.main()
