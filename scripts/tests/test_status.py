import copy
import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('status', ROOT / 'scripts/status.py')
status = importlib.util.module_from_spec(spec)
spec.loader.exec_module(status)


def page(nodes, cursor=None):
    return {'nodes': nodes, 'pageInfo': {'hasNextPage': cursor is not None, 'endCursor': cursor}}


def pr(number, rollup=None):
    return {'number': number, 'title': 'a\tb\nc', 'author': {'login': 'maintainer'},
            'isDraft': False, 'mergeStateStatus': 'CLEAN', 'autoMergeRequest': None,
            'commits': {'nodes': [{'commit': {'statusCheckRollup': rollup}}]}}


class Status(unittest.TestCase):
    def test_paginates_all_prs_and_all_checks(self):
        failure = {'__typename': 'CheckRun', 'name': 'gate', 'conclusion': 'FAILURE', 'status': 'COMPLETED'}
        pending = {'__typename': 'StatusContext', 'context': 'external', 'state': 'PENDING'}
        first = pr(1, {'id': 'rollup', 'contexts': page([failure], 'checks-next')})
        responses = [
            {'repository': {'pullRequests': page([first, *[pr(i) for i in range(2, 31)]], 'prs-next')}},
            {'node': {'contexts': page([pending])}},
            {'repository': {'pullRequests': page([pr(31)])}},
        ]
        with patch.object(status, 'gh_json', return_value={'nameWithOwner': 'owner/repo'}), \
                patch.object(status, 'graphql', side_effect=copy.deepcopy(responses)) as query:
            prs = status.pull_requests()
        self.assertEqual([p['number'] for p in prs], list(range(1, 32)))
        self.assertEqual(query.call_args_list[1].kwargs, {'id': 'rollup', 'checksCursor': 'checks-next'})
        self.assertEqual(query.call_args_list[2].kwargs['cursor'], 'prs-next')
        self.assertIn('first: 30', status.QUERY)
        self.assertEqual(list(status.table(prs))[1], [1, 'a b c', 'ready', 'CLEAN', 'off', 'gate', 1])

    def test_gateway_errors_retry_same_page(self):
        for code in (502, 503, 504):
            with self.subTest(code=code), patch.object(status.subprocess, 'run', side_effect=[
                    subprocess.CompletedProcess([], 1, '', f'HTTP {code}'),
                    subprocess.CompletedProcess([], 0, '{"data": {}}', '')]) as run, \
                    patch.object(status.time, 'sleep') as sleep:
                self.assertEqual(status.gh_json('api', 'graphql'), {'data': {}})
                self.assertEqual(run.call_args_list[0], run.call_args_list[1])
                sleep.assert_called_once_with(1)

    def test_request_timeout_is_retried_and_bounded(self):
        with patch.object(status.subprocess, 'run', side_effect=subprocess.TimeoutExpired('gh', 60)) as run, \
                patch.object(status.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, 'timed out'):
                status.gh_json('api', 'graphql')
            self.assertEqual(run.call_count, 3)
            self.assertEqual(run.call_args.kwargs['timeout'], 60)

    def test_retries_are_bounded_and_auth_errors_fail_immediately(self):
        for error, attempts in [('HTTP 504', 3), ('HTTP 401', 1)]:
            with self.subTest(error=error), patch.object(status.subprocess, 'run', return_value=
                    subprocess.CompletedProcess([], 1, '', error)) as run, patch.object(status.time, 'sleep'):
                with self.assertRaisesRegex(RuntimeError, error):
                    status.gh_json('api', 'graphql')
                self.assertEqual(run.call_count, attempts)

    def test_failed_later_page_prints_no_partial_table(self):
        with patch.object(status, 'pull_requests', side_effect=RuntimeError('HTTP 504')), \
                patch('builtins.print') as output:
            self.assertEqual(status.main(), 1)
            self.assertEqual(output.call_count, 1)
            self.assertEqual(output.call_args.kwargs, {'file': status.sys.stderr})

    def test_excluded_authors_and_missing_author(self):
        prs = [pr(i) for i in range(3)]
        for item in prs:
            item['statusCheckRollup'] = []
        prs[0]['author'] = {'login': 'Dependabot[bot]'}
        prs[1]['author'] = {'login': 'DIMANK92'}
        prs[2]['author'] = None
        self.assertEqual([row[0] for row in status.table(prs)], ['PR', 2])


if __name__ == '__main__':
    unittest.main()
