import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('red_nightlies', ROOT / '.github/scripts/red-nightlies.py')
red = importlib.util.module_from_spec(spec)
spec.loader.exec_module(red)
RUNS = json.loads((ROOT / 'scripts/tests/fixtures/red-nightlies/runs.json').read_text())
NIGHTLY = 'Nightly verification'


def found():
    out = {}
    for workflow, runs in RUNS.items():
        out.update(red.verdicts(workflow, runs))
    return out


def states():
    return {t: v['state'] for t, v in found().items()}


class Verdicts(unittest.TestCase):
    def test_two_timeouts_in_a_row_are_red(self):
        v = found()[red.title(NIGHTLY, 'opensees-diff')]
        self.assertEqual(v['state'], 'red')
        self.assertEqual([e['run']['id'] for e in v['entries']], [3003, 3002])
        self.assertIn('timed out', red.red_body(v))

    def test_one_failure_after_a_green_run_is_not_yet_red(self):
        self.assertNotIn(red.title(NIGHTLY, 'codeaster-diff'), states())

    def test_matrix_shards_count_as_one_job_whichever_shard_failed(self):
        self.assertEqual(states()[red.title(NIGHTLY, 'fuzz')], 'red')
        self.assertEqual(states()[red.title(NIGHTLY, 'mutants')], 'red')
        body = red.red_body(found()[red.title(NIGHTLY, 'fuzz')])
        self.assertIn('fuzz (json_plastic)', body)
        self.assertIn('fuzz (json_static)', body)

    def test_a_green_latest_run_is_green(self):
        self.assertEqual(states()[red.title(NIGHTLY, 'bench')], 'green')

    def test_manual_cancellations_and_skips_are_ignored(self):
        self.assertNotIn(red.title(NIGHTLY, 'triage'), states())
        v = found()[red.title(NIGHTLY, 'properties')]
        self.assertEqual((v['state'], v['entries'][0]['run']['id']), ('green', 3002))

    def test_a_run_that_never_started_its_jobs_is_red_as_a_whole(self):
        self.assertEqual(states()[red.title('Verify', '(run)')], 'red')

    def test_a_successful_run_after_runs_that_never_started_is_green(self):
        runs = [{**RUNS['Verify'][0], 'id': 4003, 'conclusion': 'success', 'jobs': [{'name': 'kani', 'conclusion': 'success'}]}, *RUNS['Verify']]
        v = red.verdicts('Verify', runs)
        self.assertEqual(v[red.title('Verify', '(run)')]['state'], 'green')
        acts = red.plan(v, [{'number': 5, 'title': red.title('Verify', '(run)'), 'text': ''}])
        self.assertEqual([(a['action'], a['number']) for a in acts], [('close', 5)])

    def test_cancelled_counts_only_when_github_timed_it_out(self):
        self.assertEqual(red.outcome({'conclusion': 'cancelled', 'timed_out': True}), 'red')
        self.assertIsNone(red.outcome({'conclusion': 'cancelled', 'timed_out': False}))
        self.assertIsNone(red.outcome({'conclusion': 'cancelled'}))
        self.assertEqual(red.outcome({'conclusion': 'timed_out'}), 'red')
        self.assertIsNone(red.outcome({'conclusion': 'skipped'}))


class Plan(unittest.TestCase):
    def actions(self, issues):
        return {(a['action'], a.get('title') or a.get('number')): a for a in red.plan(found(), issues)}

    def test_a_red_job_without_an_open_issue_opens_one(self):
        acts = self.actions([])
        opened = acts[('open', red.title(NIGHTLY, 'opensees-diff'))]
        self.assertIn('/actions/runs/3003', opened['body'])
        self.assertIn('/actions/runs/3002', opened['body'])
        self.assertEqual(sorted(k[1] for k in acts if k[0] == 'open'), sorted([
            red.title(NIGHTLY, 'opensees-diff'), red.title(NIGHTLY, 'fuzz'), red.title(NIGHTLY, 'mutants'), red.title('Verify', '(run)')]))
        self.assertFalse([k for k in acts if k[0] != 'open'])

    def test_an_open_issue_gets_one_comment_per_new_red_run(self):
        issue = {'number': 7, 'title': red.title(NIGHTLY, 'opensees-diff'), 'text': 'run 3002 https://github.com/lambdaclass/stabileo/actions/runs/3002'}
        acts = self.actions([issue])
        self.assertNotIn(('open', issue['title']), acts)
        self.assertIn('/actions/runs/3003', acts[('comment', 7)]['body'])
        issue['text'] += '\nhttps://github.com/lambdaclass/stabileo/actions/runs/3003'
        self.assertNotIn(('comment', 7), self.actions([issue]))

    def test_a_green_job_closes_its_open_issue_and_nothing_else(self):
        acts = self.actions([{'number': 9, 'title': red.title(NIGHTLY, 'bench'), 'text': ''},
                             {'number': 10, 'title': red.title(NIGHTLY, 'codeaster-diff'), 'text': ''}])
        self.assertIn('/actions/runs/3003', acts[('close', 9)]['body'])
        self.assertNotIn(('close', 10), acts)
        self.assertNotIn(('comment', 10), acts)

    def test_duplicate_open_issues_are_matched_to_the_oldest(self):
        title = red.title(NIGHTLY, 'bench')
        acts = self.actions([{'number': 12, 'title': title, 'text': ''}, {'number': 11, 'title': title, 'text': ''}])
        self.assertIn(('close', 11), acts)
        self.assertNotIn(('close', 12), acts)


if __name__ == '__main__':
    unittest.main()
