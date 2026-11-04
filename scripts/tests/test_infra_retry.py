"""Infrastructure retry: real job logs and annotations from November 2026, and the decision around them."""
import copy
import importlib.util
import json
import re
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / 'scripts/tests/fixtures/infra-retry'
spec = importlib.util.spec_from_file_location('infra_retry', ROOT / '.github/scripts/infra-retry.py')
infra = importlib.util.module_from_spec(spec)
spec.loader.exec_module(infra)
REPO = 'lambdaclass/stabileo'


def fixture(name):
    return json.loads((FIXTURES / f'{name}.json').read_text())


def run(**changes):
    base = {'id': 7, 'event': 'pull_request', 'run_attempt': 1, 'conclusion': 'failure',
            'head_repository': {'full_name': REPO}, 'head_branch': 'feature', 'workflow_id': 3}
    return {**base, **changes}


def verdict(case):
    return infra.classify(case['job'], case['annotations'], case['log'])


def replace_last(text, old, new):
    head, sep, tail = text.rpartition(old)
    assert sep, old
    return head + new + tail


class RealLogs(unittest.TestCase):
    def test_infrastructure_failures_retry(self):
        for name in ['infra-research-wasm-timeout', 'infra-research-wasm-timeout-revert', 'infra-e2e-site-timeout']:
            with self.subTest(name=name):
                result, why = verdict(fixture(name))
                self.assertEqual(result, 'infra', why)
                self.assertIn('job timeout', why)

    def test_real_failures_never_retry(self):
        for name, expected in [('real-nextest-assert', 'real'), ('real-vitest-timeout-with-cache-429', 'real'),
                               ('real-vitest-unhandled-error', 'real'), ('real-playwright-failure', 'real'),
                               ('real-prerender-timeout', 'unsure'), ('oom-without-log-evidence', 'real'),
                               ('cancelled-by-concurrency', 'unsure')]:
            with self.subTest(name=name):
                result, why = verdict(fixture(name))
                self.assertEqual(result, expected, why)

    def test_cache_429_warnings_beside_a_real_failure_are_not_evidence(self):
        case = fixture('real-vitest-timeout-with-cache-429')
        self.assertTrue(any('429' in a['message'] for a in case['annotations'] if a['annotation_level'] == 'warning'))
        case['annotations'] = [a for a in case['annotations'] if a['title'] == '']
        result, why = verdict(case)
        self.assertEqual(result, 'real', why)

    def test_a_clippy_error_never_retries(self):
        case = fixture('real-nextest-assert')
        clippy = ('error: this loop could be written as a `for` loop\n'
                  '  --> engine/src/solver/linear.rs:41:5\n'
                  '   |\n   = help: for further information visit https://rust-lang.github.io/rust-clippy\n'
                  'error: could not compile `dedaliano-engine` (lib) due to 1 previous error\n')
        case['log'] = replace_last(case['log'], '##[error]Process completed with exit code 2.',
                                   clippy + '##[error]Process completed with exit code 101.')
        self.assertEqual(verdict(case)[0], 'real')

    def test_a_hang_after_real_failures_is_not_retried_by_its_timeout(self):
        case = fixture('real-nextest-assert')
        case['job'].update(conclusion='cancelled', started_at='2026-11-03T18:00:00Z', completed_at='2026-11-03T18:45:10Z')
        case['annotations'] = [{'annotation_level': 'failure', 'message': 'The job has exceeded the maximum execution time of 45m0s',
                                'path': '.github', 'title': ''},
                               {'annotation_level': 'failure', 'message': 'The operation was canceled.', 'path': '.github', 'title': ''}]
        case['log'] = replace_last(case['log'], '##[error]Process completed with exit code 2.', '##[error]The operation was canceled.')
        self.assertEqual(verdict(case)[0], 'real')

    def test_a_timeout_annotation_needs_a_cancelled_job_that_ran_its_budget(self):
        case = fixture('infra-research-wasm-timeout')
        early = copy.deepcopy(case)
        early['job']['completed_at'] = early['job']['started_at'].replace('T09', 'T09').replace(':02:', ':12:')
        self.assertEqual(verdict(early)[0], 'unsure')
        failed = copy.deepcopy(case)
        failed['job']['conclusion'] = 'failure'
        self.assertEqual(verdict(failed)[0], 'unsure')

    def test_a_spoofed_timeout_on_a_real_test_failure_does_not_retry(self):
        case = fixture('real-playwright-failure')
        case['annotations'].append({'annotation_level': 'failure', 'path': '.github', 'title': '',
                                    'message': 'The job has exceeded the maximum execution time of 45m0s'})
        self.assertEqual(verdict(case)[0], 'real')

    def killed(self, name, error):
        case = fixture(name)
        case['job']['conclusion'] = 'failure'
        case['log'] = replace_last(case['log'], error, '##[error]Process completed with exit code 137.')
        case['annotations'] = [{'annotation_level': 'failure', 'message': 'Process completed with exit code 137.',
                                'path': '.github', 'title': ''}]
        return verdict(case)

    def test_exit_137_counts_only_in_a_build_or_download_step(self):
        result, why = self.killed('infra-research-wasm-timeout', '##[error]The operation was canceled.')
        self.assertEqual(result, 'infra', why)
        self.assertIn('exit 137', why)
        self.assertEqual(self.killed('real-prerender-timeout', '##[error]Process completed with exit code 2.')[0], 'unsure')
        self.assertEqual(self.killed('real-nextest-assert', '##[error]Process completed with exit code 2.')[0], 'real')

    def test_a_timeout_inside_a_test_step_is_not_retried(self):
        case = fixture('real-vitest-unhandled-error')
        body = case['log'].split('##[group]Run make test.web.unit')[1]
        case['log'] = case['log'].split('##[group]Run make test.web.unit')[0] + '##[group]Run make test.web.unit' + body.split('\n')[0] + '\n' + \
            '\n'.join(line for line in body.split('\n')[1:30]) + '\n2026-11-04T04:10:00.0000000Z ##[error]The operation was canceled.\n'
        case['job'].update(conclusion='cancelled', started_at='2026-11-04T03:00:00Z', completed_at='2026-11-04T03:30:05Z')
        case['annotations'] = [{'annotation_level': 'failure', 'message': 'The job has exceeded the maximum execution time of 30m0s',
                                'path': '.github', 'title': ''},
                               {'annotation_level': 'failure', 'message': 'The operation was canceled.', 'path': '.github', 'title': ''}]
        result, why = verdict(case)
        self.assertEqual(result, 'unsure', why)
        self.assertIn('not a download or known build', why)

    def test_a_lost_runner_after_a_visible_test_failure_is_not_retried(self):
        case = fixture('real-nextest-assert')
        case['log'] = case['log'].replace('##[error]Process completed with exit code 2.', '')
        case['annotations'] = [{'annotation_level': 'failure', 'path': '.github', 'title': '',
                                'message': 'The self-hosted runner: stabileo-ci-1-sgha3 lost communication with the server.'}]
        self.assertEqual(verdict(case)[0], 'real')

    def test_a_lost_runner_cannot_cover_an_exit_failure_without_a_log(self):
        job = {'name': 'Engine Suite (1/4)', 'conclusion': 'failure'}
        annotations = [{'annotation_level': 'failure', 'path': '.github', 'title': '', 'message': message}
                       for message in ['Process completed with exit code 2.',
                                       'The self-hosted runner: stabileo-ci-1-sgha3 lost communication with the server.']]
        self.assertEqual(infra.classify(job, annotations, None)[0], 'unsure')

    def test_the_log_must_agree_with_the_api_on_failed_steps(self):
        case = fixture('infra-research-wasm-timeout')
        case['job']['steps'] = [{'name': 'Build research WASM (grossman-2026, cache miss)', 'conclusion': 'cancelled'}]
        self.assertEqual(verdict(case)[0], 'infra')
        case['job']['steps'].append({'name': 'Test suite', 'conclusion': 'failure'})
        self.assertEqual(verdict(case)[0], 'unsure')

    def test_a_timeout_in_an_unknown_script_is_not_retried(self):
        case = fixture('infra-research-wasm-timeout')
        case['log'] = case['log'].replace('research/metamaterials/grossman-2026/wasm/build.sh', 'scripts/verify-everything.sh')
        self.assertEqual(verdict(case)[0], 'unsure')

    def test_too_many_annotations_is_unsure(self):
        case = fixture('infra-e2e-site-timeout')
        case['annotations'] += [{'annotation_level': 'warning', 'message': 'w', 'path': '.github', 'title': ''}] * 100
        self.assertEqual(verdict(case)[0], 'unsure')

    def test_a_lost_runner_retries_even_without_a_log(self):
        job = {'name': 'Engine Suite (1/4)', 'conclusion': 'failure'}
        lost = [{'annotation_level': 'failure', 'path': '.github', 'title': '',
                 'message': 'The self-hosted runner: stabileo-ci-1-sgha3 lost communication with the server. '
                            'Verify the machine is running and has a healthy network connection.'}]
        self.assertEqual(infra.classify(job, lost, None)[0], 'infra')
        self.assertEqual(infra.classify(job, [], None)[0], 'unsure')


class AcquisitionSteps(unittest.TestCase):
    def download_failure(self, script, body):
        case = fixture('infra-e2e-site-timeout')
        header = '\n'.join(f'2026-11-04T06:30:00.0000000Z \x1b[36;1m{line}\x1b[0m' for line in script)
        title = script[0]
        step = (f'2026-11-04T06:30:00.0000000Z ##[group]Run {title}\n{header}\n'
                '2026-11-04T06:30:00.0000000Z shell: /usr/bin/bash -e {0}\n2026-11-04T06:30:00.0000000Z ##[endgroup]\n'
                + ''.join(f'2026-11-04T06:30:01.0000000Z {line}\n' for line in body)
                + '2026-11-04T06:31:00.0000000Z ##[error]Process completed with exit code 1.\n')
        case['log'] = case['log'].split('##[group]Run actions/upload-artifact')[0].rsplit('\n', 1)[0] + '\n' + step
        case['job']['conclusion'] = 'failure'
        case['annotations'] = [{'annotation_level': 'failure', 'message': 'Process completed with exit code 1.',
                                'path': '.github', 'title': ''}]
        return verdict(case)

    def test_artifact_5xx_in_a_download_step_retries(self):
        result, why = self.download_failure(
            ['.github/scripts/retry-infra.sh nix develop --command gh run download "$RUN_ID" --name wasm --dir web/src/lib/wasm'],
            ['error downloading wasm: HTTP 502: Bad Gateway (https://api.github.com/...)', 'Known infrastructure failure; retry 2/2',
             'error downloading wasm: HTTP 502: Bad Gateway (https://api.github.com/...)',
             'make: *** [Makefile:12: web.deps] Error 1'])
        self.assertEqual(result, 'infra', why)
        self.assertIn('HTTP 502', why)

    def test_the_same_text_in_a_build_or_test_step_does_not(self):
        for script in [['make test.web.unit SHARD=1/4'],
                       ['.github/scripts/retry-infra.sh nix develop --command cargo fetch --locked',
                        'nix develop --command research/x/wasm/build.sh'],
                       ['.github/scripts/retry-infra.sh nix develop --command cargo fetch --locked && make lint.engine'],
                       ['.github/scripts/retry-infra.sh make test.web.unit'],
                       ['.github/scripts/retry-infra.sh nix develop --command bash -c "cd web && npx vitest run"']]:
            with self.subTest(script=script):
                result, _ = self.download_failure(script, ['upstream answered HTTP 503 Service Unavailable'])
                self.assertEqual(result, 'unsure')

    def test_a_signature_only_in_a_recovered_attempt_does_not(self):
        result, why = self.download_failure(['.github/scripts/retry-infra.sh make web.deps'],
                                            ['npm error 503 Service Unavailable', 'Known infrastructure failure; retry 1/2',
                                             'npm error code ETARGET', 'npm error notarget No matching version'])
        self.assertEqual(result, 'unsure', why)

    def test_a_signature_followed_by_another_error_does_not(self):
        result, why = self.download_failure(['.github/scripts/retry-infra.sh make web.deps'],
                                            ['npm error 503 Service Unavailable', 'npm error code ETARGET',
                                             'npm error notarget No matching version'])
        self.assertEqual(result, 'unsure', why)

    def test_a_download_step_without_a_signature_does_not(self):
        result, why = self.download_failure(['.github/scripts/retry-infra.sh make web.deps'],
                                            ['npm error code ETARGET', 'npm error notarget No matching version'])
        self.assertEqual(result, 'unsure', why)

    def test_unrecognised_error_lines_do_not(self):
        case = fixture('infra-e2e-site-timeout')
        case['log'] = case['log'].replace('##[error]The operation was canceled.',
                                          '##[error]Something new went wrong\n2026-11-04T06:40:12.0609330Z ##[error]The operation was canceled.')
        self.assertEqual(verdict(case)[0], 'unsure')


class Decision(unittest.TestCase):
    def jobs(self, *names):
        cases = {name: fixture(name) for name in names}
        jobs = [{**case['job'], 'id': index} for index, case in enumerate(cases.values())]
        jobs.append({**fixture('aggregate-ci-ok')['job'], 'id': 99})
        annotations_ok = fixture('aggregate-ci-ok')['annotations']
        jobs.append({'id': 98, 'name': 'Lint Repo', 'conclusion': 'success'})
        annotations = {index: case['annotations'] for index, case in enumerate(cases.values())}
        annotations[99] = annotations_ok
        logs = {index: case['log'] for index, case in enumerate(cases.values())}
        return jobs, annotations, logs

    def test_only_infrastructure_reruns(self):
        retry, _, rows = infra.decide(run(), *self.jobs('infra-research-wasm-timeout', 'infra-e2e-site-timeout'), 7, REPO)
        self.assertTrue(retry)
        self.assertEqual([row[2] for row in rows], ['infra', 'infra', 'derived'])

    def test_one_real_failure_blocks_the_rerun(self):
        retry, reason, rows = infra.decide(run(), *self.jobs('infra-research-wasm-timeout', 'real-nextest-assert'), 7, REPO)
        self.assertFalse(retry)
        self.assertIn('not proven', reason)
        self.assertIn('real', [row[2] for row in rows])

    def test_gates(self):
        jobs = self.jobs('infra-research-wasm-timeout')
        for changed, why in [(run(event='merge_group'), 'merge_group'), (run(event='push'), 'push'),
                             (run(run_attempt=2), 'already rerun'), (run(conclusion='success'), 'success'),
                             (run(head_repository={'full_name': 'someone/fork'}), 'fork')]:
            with self.subTest(why=why):
                retry, reason, _ = infra.decide(changed, *jobs, 7, REPO)
                self.assertFalse(retry)
                self.assertIn(why, reason)
        self.assertFalse(infra.decide(run(), *jobs, 8, REPO)[0])
        self.assertFalse(infra.decide(run(), [{'id': 1, 'name': 'CI OK', 'conclusion': 'failure'}], {}, {}, 7, REPO)[0])

    def test_an_aggregate_that_failed_on_its_own_blocks_the_rerun(self):
        jobs, annotations, logs = self.jobs('infra-research-wasm-timeout')
        broken = copy.deepcopy(jobs)
        broken[1]['steps'][0]['conclusion'] = 'failure'
        self.assertFalse(infra.decide(run(), broken, annotations, logs, 7, REPO)[0])
        odd = dict(annotations)
        odd[99] = [{'annotation_level': 'failure', 'message': 'Process completed with exit code 2.', 'path': '.github', 'title': ''}]
        retry, _, rows = infra.decide(run(), jobs, odd, logs, 7, REPO)
        self.assertFalse(retry)
        self.assertEqual(rows[-1][2], 'unsure')


class Main(unittest.TestCase):
    def api(self, attempt_now=1, status='completed', newest=(7, 7)):
        case = fixture('infra-research-wasm-timeout')
        job = {**case['job'], 'id': 11}
        answers = {
            f'repos/{REPO}/actions/runs/7/attempts/1': run(),
            f'repos/{REPO}/actions/runs/7/attempts/1/jobs?per_page=100&page=1': {'jobs': [job, {**fixture('aggregate-ci-ok')['job'], 'id': 12}]},
            f'repos/{REPO}/check-runs/12/annotations?per_page=100': fixture('aggregate-ci-ok')['annotations'],
            f'repos/{REPO}/actions/workflows/3/runs?branch=feature&event=pull_request&per_page=1': None,
            f'repos/{REPO}/check-runs/11/annotations?per_page=100': case['annotations'],
            f'repos/{REPO}/actions/runs/7': {'run_attempt': attempt_now, 'status': status},
        }
        newest_ids = iter(newest)

        def get(path):
            if path.startswith(f'repos/{REPO}/actions/workflows/3/runs'):
                return {'workflow_runs': [{'id': next(newest_ids)}]}
            return answers[path]
        return get, lambda repo, job_id: case['log']

    def call(self, env=None, **api):
        get, log = self.api(**api)
        posted = []
        with tempfile.NamedTemporaryFile('r') as out:
            env = {'GITHUB_REPOSITORY': REPO, 'RUN_ID': '7', 'RUN_ATTEMPT': '1', 'GITHUB_STEP_SUMMARY': out.name, **(env or {})}
            self.assertEqual(infra.main(env, get, log, posted.append), 0)
            return posted, out.read()

    def test_reruns_once_and_reports_why(self):
        posted, text = self.call()
        self.assertEqual(posted, [f'repos/{REPO}/actions/runs/7/rerun-failed-jobs'])
        self.assertIn('Decision: RERUN', text)
        self.assertIn('| Research WASM | cancelled | infra | job timeout', text)

    def test_no_rerun_when_someone_already_reran(self):
        for api in [{'attempt_now': 2}, {'status': 'in_progress'}, {'newest': (7, 8)}]:
            posted, text = self.call(**api)
            self.assertEqual(posted, [])
            self.assertIn('restarted or superseded meanwhile', text)

    def test_dry_run_and_errors_never_post(self):
        posted, text = self.call({'DRY_RUN': '1'})
        self.assertEqual(posted, [])
        self.assertIn('would rerun', text)
        posted, text = self.call({'RUN_ATTEMPT': '2'})
        self.assertEqual(posted, [])
        self.assertIn('unsure: KeyError', text)


class Workflow(unittest.TestCase):
    def test_least_privilege_and_no_pull_request_code(self):
        text = (ROOT / '.github/workflows/infra-retry.yml').read_text()
        self.assertIn('  workflow_run:\n    workflows: [CI, Research, Supply chain]\n    types: [completed]\n', text)
        self.assertIn('\npermissions: {}\n', text)
        self.assertIn('    permissions:\n      actions: write\n      checks: read\n      contents: read\n    steps:', text)
        self.assertEqual(text.count('permissions:'), 2)
        for guard in ["workflow_run.event == 'pull_request'", 'workflow_run.run_attempt == 1',
                      'head_repository.full_name == github.repository']:
            self.assertIn(guard, text.split('    runs-on:')[0])
        self.assertIn('ref: ${{ github.event.repository.default_branch }}', text)
        self.assertIn('persist-credentials: false', text)
        for unsafe in ['head_sha', 'head_branch', 'pull_request.head', 'workflow_run.head_commit']:
            self.assertNotIn(unsafe, text)
        run_lines = [line for line in text.splitlines() if line.strip().startswith('run:')]
        self.assertEqual(run_lines, ['        run: python3 -I .github/scripts/infra-retry.py'])
        for name in ['ci.yml', 'research.yml', 'supply-chain.yml']:
            first = (ROOT / f'.github/workflows/{name}').read_text().splitlines()
            self.assertTrue(any(line.startswith('name: ') and line[6:] in ('CI', 'Research', 'Supply chain') for line in first), name)

    def test_aggregate_names_exist(self):
        ci = (ROOT / '.github/workflows/ci.yml').read_text()
        job = ci.split('\n  ci-ok:\n', 1)[1]
        self.assertEqual(infra.AGGREGATES, {re.search(r'^    name: (.+)$', job, re.MULTILINE)[1]})

    def test_wired_into_the_ci_scripts_suite(self):
        make = (ROOT / 'Makefile').read_text()
        self.assertIn('python3 -B -I scripts/tests/test_infra_retry.py', make)
        self.assertIn('.github/workflows/infra-retry.yml', make)


if __name__ == '__main__':
    unittest.main()
