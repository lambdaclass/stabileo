import importlib.util
import os
import pathlib
import re
import subprocess
import unittest

spec = importlib.util.spec_from_file_location('test_revert_check', pathlib.Path(__file__).resolve().parent / 'test_revert_check.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

ROOT = base.ROOT
SCRIPT = ROOT / '.github/scripts/revert-check-trusted.sh'
WORKFLOW = ROOT / '.github/workflows/revert-check-trusted.yml'


class Script(unittest.TestCase):
    setUp = base.MergeQueue.setUp
    tearDown = base.MergeQueue.tearDown
    queue = base.MergeQueue.queue
    pr = base.MergeQueue.pr

    def run_script(self, **extra):
        env = {**os.environ, 'PATH': f'{self.bin}:{os.environ["PATH"]}', 'FAKE_GH': str(self.prs), 'GH_REPO': 'lambdaclass/stabileo'}
        env.pop('GITHUB_EVENT_PATH', None)
        env.pop('LABELS', None)
        env.update(extra)
        r = subprocess.run([str(SCRIPT)], cwd=self.repo, env=env, capture_output=True, text=True)
        return r.returncode, r.stdout + r.stderr

    def pull_request(self, **extra):
        head = base.git(self.repo, 'rev-parse', 'a')
        return self.run_script(MODE='pr', BASE=self.base, HEAD=head, PR='1', **extra)

    def queued(self, branch=None):
        head = base.git(self.repo, 'rev-parse', 'HEAD')
        return self.run_script(MODE='queue', HEAD=head, QUEUE_BRANCH=branch or f'gh-readonly-queue/main/pr-2-{self.base}')

    def test_a_pull_request_that_drops_main_work_fails_until_reverts_ok_is_on_it_live(self):
        self.pr(1, 'a', ['status:in-queue'])
        code, out = self.pull_request()
        self.assertEqual(code, 1, out)
        self.assertIn('Labels: status:in-queue', out)
        self.assertIn('new.txt: 1 line from', out)
        self.pr(1, 'a', ['status:in-queue', 'reverts-ok'])
        code, out = self.pull_request()
        self.assertEqual(code, 0, out)
        self.assertIn('Acknowledged by the reverts-ok label.', out)

    def test_a_label_it_could_not_read_live_never_acknowledges(self):
        code, out = self.pull_request(LABELS='reverts-ok')
        self.assertEqual(code, 1, out)
        self.assertIn("Couldn't read the labels of #1 live; re-run this check.", out)
        self.assertNotIn('Acknowledged', out)

    def test_the_pull_requests_own_copy_of_the_checker_does_not_judge_it(self):
        base.git(self.repo, 'checkout', '-q', 'a')
        base.commit(self.repo, {'.github/scripts/revert-check.py': 'import sys\nsys.exit(0)\n'}, 'Always pass', self.now - 3600)
        base.git(self.repo, 'checkout', '-q', 'main')
        self.pr(1, 'a', [])
        code, out = self.pull_request()
        self.assertEqual(code, 1, out)
        self.assertIn('new.txt: 1 line from', out)

    def test_in_the_queue_each_pull_request_needs_its_own_acknowledgement(self):
        self.queue()
        self.pr(1, 'a', [])
        self.pr(2, 'b', ['reverts-ok'])
        code, out = self.queued()
        self.assertEqual(code, 1, out)
        self.assertIn('Pull request #1:', out)
        self.assertIn('new.txt: 1 line from', out)
        self.assertNotIn('Acknowledged', out)
        self.pr(1, 'a', ['reverts-ok'])
        code, out = self.queued()
        self.assertEqual(code, 0, out)
        self.assertIn('Acknowledged by the reverts-ok label.', out)

    def test_in_the_queue_a_label_it_could_not_read_live_never_acknowledges(self):
        self.queue()
        self.pr(1, 'a', ['reverts-ok'])
        self.pr(2, 'b', [])
        gh = self.bin / 'gh'
        gh.rename(self.bin / 'gh-real')
        gh.write_text('#!/bin/sh\ncase "$*" in *.head.sha*) exec "$(dirname "$0")/gh-real" "$@";; esac\nexit 1\n')
        gh.chmod(0o755)
        code, out = self.queued()
        self.assertEqual(code, 1, out)
        self.assertIn("Couldn't read the labels of #1 live", out)
        self.assertNotIn('Acknowledged', out)

    def test_in_the_queue_a_group_commit_that_is_not_a_queue_merge_fails(self):
        self.queue('Merge branch a')
        self.pr(1, 'a', ['reverts-ok'])
        self.pr(2, 'b', ['reverts-ok'])
        code, out = self.queued()
        self.assertEqual(code, 1, out)
        self.assertIn("is not the merge queue's merge", out)

    def test_in_the_queue_the_base_must_come_from_a_queue_branch_and_be_an_ancestor(self):
        self.queue()
        self.pr(1, 'a', ['reverts-ok'])
        self.pr(2, 'b', ['reverts-ok'])
        code, out = self.queued('main')
        self.assertEqual(code, 1, out)
        self.assertIn('is not a merge queue branch', out)
        other = base.git(self.repo, 'commit-tree', '-m', 'Elsewhere', base.git(self.repo, 'rev-parse', 'fork-point^{tree}'))
        code, out = self.queued(f'gh-readonly-queue/main/pr-2-{other}')
        self.assertEqual(code, 1, out)
        self.assertIn('is not an ancestor', out)
        head = base.git(self.repo, 'rev-parse', 'HEAD')
        code, out = self.queued(f'gh-readonly-queue/main/pr-2-{head}')
        self.assertEqual(code, 1, out)
        self.assertIn('merges nothing onto', out)


class Workflow(unittest.TestCase):
    def setUp(self):
        self.text = WORKFLOW.read_text()
        parts = re.split(r'\n  ([a-z][\w-]*):\n', '\n' + self.text.split('\njobs:\n', 1)[1])
        self.jobs = dict(zip(parts[1::2], parts[2::2]))

    def test_it_runs_from_the_base_branch_on_pull_requests_and_queue_groups(self):
        triggers = self.text.split('\njobs:\n', 1)[0]
        self.assertIn('pull_request_target:\n    types: [opened, synchronize, reopened, edited, labeled, unlabeled]', triggers)
        self.assertIn('workflow_run:\n    workflows: [CI]\n    types: [requested]', triggers)
        self.assertNotIn('\n  pull_request:', triggers)
        self.assertIn('permissions: {}', triggers)
        self.assertEqual(sorted(self.jobs), ['check', 'report', 'start'])

    def test_the_job_that_reads_the_pull_request_has_a_read_only_token_and_never_checks_it_out(self):
        job = self.jobs['check']
        self.assertIn('    permissions:\n      contents: read\n      pull-requests: read\n    steps:', job)
        self.assertNotIn('ref:', job)
        self.assertIn('persist-credentials: false', job)
        self.assertIn('git fetch --no-tags --quiet origin "$HEAD_SHA"', job)
        runs = [line.strip() for line in job.split('\n') if line.strip().startswith('run:')]
        self.assertEqual(runs, ['run: git fetch --no-tags --quiet origin "$HEAD_SHA"', 'run: .github/scripts/revert-check-trusted.sh'])
        self.assertIn("BASE: ${{ github.event_name == 'pull_request_target' && github.sha || '' }}", job)

    def test_only_the_status_jobs_have_a_write_token_and_they_touch_no_code(self):
        for name in ('start', 'report'):
            job = self.jobs[name]
            self.assertIn('    permissions:\n      statuses: write\n    steps:', job)
            self.assertNotIn('- uses:', job)
            runs = [line.strip() for line in job.split('\n') if line.strip().startswith('run:')]
            self.assertEqual(len(runs), 1)
            self.assertTrue(runs[0].startswith('run: gh api -X POST "repos/$GH_REPO/statuses/$SHA"'), runs[0])
            self.assertIn("-f context='Revert Check (trusted)'", runs[0])
        self.assertIn("if: always() && needs.start.result == 'success' && needs.check.result != 'cancelled'", self.jobs['report'])
        self.assertIn("STATE: ${{ needs.check.result == 'success' && 'success' || 'failure' }}", self.jobs['report'])

    def test_only_pull_requests_into_the_default_branch_and_reverts_ok_label_events_run_it(self):
        start = self.jobs['start']
        eligible = re.search(r'^    if: (.+)$', start, re.M).group(1)
        group = self.text.split('concurrency:\n', 1)[1].split('\njobs:', 1)[0]
        self.assertIn(f'${{{{ ({eligible})\n    && format(\'revert-check-trusted-{{0}}\'', group)
        self.assertIn("|| format('revert-check-trusted-ignored-{0}', github.run_id) }}", group)
        self.assertIn('github.event.pull_request.base.ref == github.event.repository.default_branch', start)
        self.assertIn("(github.event.action != 'edited' || github.event.changes.base != null)", start)
        self.assertIn("((github.event.action != 'labeled' && github.event.action != 'unlabeled') || github.event.label.name == 'reverts-ok')", start)
        self.assertIn("(github.event_name == 'workflow_run' && github.event.workflow_run.event == 'merge_group')", start)


if __name__ == '__main__':
    unittest.main()
