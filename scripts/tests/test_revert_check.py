import contextlib
import importlib.util
import io
import json
import os
import pathlib
import subprocess
import tempfile
import textwrap
import time
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('revert_check', ROOT / '.github/scripts/revert-check.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)

DAY = 86400
NOW = 1_800_000_000


def git(repo, *args, when=NOW):
    env = {**os.environ, 'GIT_AUTHOR_DATE': f'@{when} +0000', 'GIT_COMMITTER_DATE': f'@{when} +0000'}
    return subprocess.run(['git', '-c', 'user.name=t', '-c', 'user.email=t@localhost', '-c', 'commit.gpgsign=false', *args],
                          cwd=repo, check=True, capture_output=True, text=True, env=env).stdout.strip()


def commit(repo, files, message, when):
    for path, text in files.items():
        p = pathlib.Path(repo, path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', message, when=when)


class RevertCheck(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = self.tmp.name
        git(self.repo, 'init', '-q', '-b', 'main')
        commit(self.repo, {'old.txt': 'o1\no2\no3\n', 'new.txt': 'n1\n'}, 'base', NOW - 100 * DAY)
        git(self.repo, 'branch', 'fork-point')

    def tearDown(self):
        self.tmp.cleanup()

    def pr_merges_main_work_then_drops_it(self, path, text, kept, when):
        git(self.repo, 'checkout', '-q', '-b', 'pr', 'fork-point')
        git(self.repo, 'checkout', '-q', 'main')
        commit(self.repo, {path: text}, 'Newer work on main', when)
        git(self.repo, 'checkout', '-q', 'pr')
        git(self.repo, 'merge', '-q', '--no-ff', '-m', 'Merge main', 'main', when=NOW - DAY)
        commit(self.repo, {path: kept}, 'Drop it', NOW)

    def run_check(self, *extra):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = check.main(['main', 'pr', '--repo', self.repo, '--now', str(NOW), '--event', '', '--labels', '', *extra])
        return code, out.getvalue()

    def test_a_pr_deleting_another_authors_recent_lines_is_flagged(self):
        git(self.repo, 'checkout', '-q', '-b', 'pr', 'fork-point')
        commit(self.repo, {'other.txt': 'x\n'}, 'PR work', NOW - 4 * DAY)
        git(self.repo, 'checkout', '-q', 'main')
        commit(self.repo, {'new.txt': 'n1\nrecent a\nrecent b\n'}, 'Newer work on main', NOW - 3 * DAY)
        git(self.repo, 'checkout', '-q', 'pr')
        git(self.repo, 'merge', '-q', '--no-ff', '-m', 'Merge main', 'main', when=NOW - 2 * DAY)
        commit(self.repo, {'new.txt': 'n1\n'}, 'Stale copy', NOW - DAY)
        rows, conflicts = check.recent_foreign_deletions(self.repo, 'main', 'pr', 21, NOW)
        self.assertEqual(conflicts, [])
        self.assertEqual([(r['file'], r['lines'], r['subject']) for r in rows], [('new.txt', 2, 'Newer work on main')])
        self.assertEqual(rows[0]['date'], git(self.repo, 'show', '-s', '--format=%cs', 'main'))
        self.assertEqual(rows[0]['commit'], git(self.repo, 'rev-parse', '--short', 'main'))
        code, out = self.run_check()
        self.assertEqual(code, 1)
        self.assertIn('new.txt: 2 lines from', out)
        self.assertIn('Newer work on main', out)

    def test_editing_recent_lines_the_branch_started_from_is_not_flagged(self):
        commit(self.repo, {'new.txt': 'n1\nrecent\n'}, 'Newer work on main', NOW - 3 * DAY)
        git(self.repo, 'checkout', '-q', '-b', 'pr', 'main')
        commit(self.repo, {'new.txt': 'n1\nrecent, edited\n'}, 'Edit', NOW - 2 * DAY)
        self.assertEqual(check.recent_foreign_deletions(self.repo, 'main', 'pr', 21, NOW), ([], []))

    def test_a_merge_of_main_resolved_to_the_stale_side_is_flagged(self):
        git(self.repo, 'checkout', '-q', '-b', 'pr', 'fork-point')
        commit(self.repo, {'new.txt': 'n1 stale edit\n'}, 'PR edit', NOW - 4 * DAY)
        git(self.repo, 'checkout', '-q', 'main')
        commit(self.repo, {'new.txt': 'n1\nnewer\n'}, 'Newer work on main', NOW - 3 * DAY)
        git(self.repo, 'checkout', '-q', 'pr')
        git(self.repo, 'merge', '-q', '-s', 'ours', '-m', 'Merge main, keep ours', 'main', when=NOW - 2 * DAY)
        rows, _ = check.recent_foreign_deletions(self.repo, 'main', 'pr', 21, NOW)
        self.assertEqual([(r['file'], r['subject']) for r in rows], [('new.txt', 'Newer work on main')])

    def test_lines_main_added_where_the_pr_did_not_edit_are_kept(self):
        git(self.repo, 'checkout', '-q', '-b', 'pr', 'fork-point')
        commit(self.repo, {'other.txt': 'x\n'}, 'Unrelated', NOW - 2 * DAY)
        git(self.repo, 'checkout', '-q', 'main')
        commit(self.repo, {'new.txt': 'n1\nrecent\n'}, 'Newer work on main', NOW - 1 * DAY)
        self.assertEqual(self.run_check()[0], 0)

    def test_deleting_its_own_lines_is_not_flagged(self):
        git(self.repo, 'checkout', '-q', '-b', 'pr', 'main')
        commit(self.repo, {'new.txt': 'n1\nmine\n'}, 'Add mine', NOW - 2 * DAY)
        git(self.repo, 'checkout', '-q', 'main')
        git(self.repo, 'merge', '-q', '--no-ff', '-m', 'Integration merges pr', 'pr', when=NOW - DAY)
        git(self.repo, 'checkout', '-q', 'pr')
        commit(self.repo, {'new.txt': 'n1\n'}, 'Drop mine', NOW)
        rows, conflicts = check.recent_foreign_deletions(self.repo, 'main', 'pr', 21, NOW)
        self.assertEqual((rows, conflicts), ([], []))

    def test_deleting_old_lines_is_not_flagged(self):
        self.pr_merges_main_work_then_drops_it('new.txt', 'n1\nold\n', 'n1\n', NOW - 30 * DAY)
        code, out = self.run_check()
        self.assertEqual(code, 0)
        self.assertIn('deletes no line', out)
        self.assertEqual(self.run_check('--days', '31')[0], 1)

    def test_a_deleted_file_counts_every_line(self):
        self.pr_merges_main_work_then_drops_it('gone.txt', 'g1\ng2\ng3\n', '', NOW - 5 * DAY)
        git(self.repo, 'rm', '-q', 'gone.txt')
        git(self.repo, 'commit', '-q', '-m', 'Remove gone', when=NOW)
        rows, _ = check.recent_foreign_deletions(self.repo, 'main', 'pr', 21, NOW)
        self.assertEqual([(r['file'], r['lines']) for r in rows], [('gone.txt', 3)])

    def test_paths_git_quotes_are_still_checked(self):
        for name in ['say "hi".txt', 'año\\x.txt', 'tab\there.txt']:
            with self.subTest(name=name):
                self.tearDown()
                self.setUp()
                self.pr_merges_main_work_then_drops_it(name, 'kept\nrecent\n', 'kept\n', NOW - 3 * DAY)
                rows, _ = check.recent_foreign_deletions(self.repo, 'main', 'pr', 21, NOW)
                self.assertEqual([(r['file'], r['lines']) for r in rows], [(name, 1)])

    def test_a_deleted_line_that_looks_like_a_file_header_does_not_hide_later_hunks(self):
        old_text = '-- /dev/null\n-- old comment\n' + ''.join(f'keep {i}\n' for i in range(10))
        commit(self.repo, {'q.sql': old_text}, 'Old SQL', NOW - 100 * DAY)
        git(self.repo, 'branch', '-f', 'fork-point')
        self.pr_merges_main_work_then_drops_it('q.sql', old_text + 'recent\n', ''.join(f'keep {i}\n' for i in range(10)), NOW - 3 * DAY)
        rows, _ = check.recent_foreign_deletions(self.repo, 'main', 'pr', 21, NOW)
        self.assertEqual([(r['file'], r['lines']) for r in rows], [('q.sql', 1)])

    def test_form_feeds_and_carriage_returns_in_deleted_lines_do_not_hide_later_hunks(self):
        keep = ''.join(f'keep {i}\n' for i in range(10))
        old_text = 'x\fdiff --git a/fake b/fake\ny\rdiff --git a/other b/other\n' + keep
        commit(self.repo, {'f.txt': old_text}, 'Old text', NOW - 100 * DAY)
        git(self.repo, 'branch', '-f', 'fork-point')
        self.pr_merges_main_work_then_drops_it('f.txt', old_text + 'recent\n', keep, NOW - 3 * DAY)
        rows, _ = check.recent_foreign_deletions(self.repo, 'main', 'pr', 21, NOW)
        self.assertEqual([(r['file'], r['lines']) for r in rows], [('f.txt', 1)])

    def test_attributes_the_branch_adds_cannot_hide_its_deletions(self):
        git(self.repo, 'checkout', '-q', '-b', 'pr', 'fork-point')
        git(self.repo, 'checkout', '-q', 'main')
        commit(self.repo, {'src.rs': 'kept\nrecent\n'}, 'Newer work on main', NOW - 3 * DAY)
        git(self.repo, 'checkout', '-q', 'pr')
        git(self.repo, 'merge', '-q', '--no-ff', '-m', 'Merge main', 'main', when=NOW - DAY)
        commit(self.repo, {'src.rs': 'kept\n', '.gitattributes': '*.rs -diff\n'}, 'Drop it', NOW)
        rows, _ = check.recent_foreign_deletions(self.repo, 'main', 'pr', 21, NOW)
        self.assertEqual([(r['file'], r['lines']) for r in rows], [('src.rs', 1)])

    def test_a_nul_byte_the_branch_adds_cannot_hide_its_deletions(self):
        git(self.repo, 'checkout', '-q', '-b', 'pr', 'fork-point')
        git(self.repo, 'checkout', '-q', 'main')
        commit(self.repo, {'src.rs': 'kept\nrecent\n'}, 'Newer work on main', NOW - 3 * DAY)
        git(self.repo, 'checkout', '-q', 'pr')
        git(self.repo, 'merge', '-q', '--no-ff', '-m', 'Merge main', 'main', when=NOW - DAY)
        commit(self.repo, {'src.rs': 'kept\n\x00\n'}, 'Drop it', NOW)
        rows, _ = check.recent_foreign_deletions(self.repo, 'main', 'pr', 21, NOW)
        self.assertEqual([(r['file'], r['lines']) for r in rows], [('src.rs', 1)])

    def test_a_merge_with_the_base_as_first_parent_is_still_checked(self):
        git(self.repo, 'checkout', '-q', '-b', 'pr', 'fork-point')
        commit(self.repo, {'other.txt': 'x\n'}, 'PR work', NOW - 4 * DAY)
        git(self.repo, 'checkout', '-q', 'main')
        commit(self.repo, {'new.txt': 'n1\nrecent\n'}, 'Newer work on main', NOW - 3 * DAY)
        git(self.repo, 'checkout', '-q', '--detach', 'main')
        git(self.repo, 'merge', '-q', '--no-ff', '--no-commit', 'pr', when=NOW - DAY)
        pathlib.Path(self.repo, 'new.txt').write_text('n1\n')
        git(self.repo, 'add', '-A')
        git(self.repo, 'commit', '-q', '-m', 'Merge pr into main, stale', when=NOW - DAY)
        git(self.repo, 'branch', '-f', 'pr', 'HEAD')
        git(self.repo, 'checkout', '-q', 'main')
        self.assertEqual(git(self.repo, 'rev-parse', 'pr^1'), git(self.repo, 'rev-parse', 'main'))
        rows, _ = check.recent_foreign_deletions(self.repo, 'main', 'pr', 21, NOW)
        self.assertEqual([(r['file'], r['lines']) for r in rows], [('new.txt', 1)])

    def test_diff_settings_in_the_git_config_do_not_change_what_is_found(self):
        keep = ''.join(f'keep {i}\n' for i in range(4))
        commit(self.repo, {'c.txt': keep}, 'Old text', NOW - 100 * DAY)
        git(self.repo, 'branch', '-f', 'fork-point')
        self.pr_merges_main_work_then_drops_it('c.txt', 'recent a\n' + keep + 'recent b\n', keep, NOW - 3 * DAY)
        for key, value in [('diff.noprefix', 'true'), ('diff.interHunkContext', '10'), ('diff.mnemonicPrefix', 'true')]:
            git(self.repo, 'config', key, value)
        rows, _ = check.recent_foreign_deletions(self.repo, 'main', 'pr', 21, NOW)
        self.assertEqual([(r['file'], r['lines']) for r in rows], [('c.txt', 2)])

    def test_a_conflict_git_reports_without_naming_a_file_still_fails(self):
        real = check.git
        def git_stub(repo, *args, ok=(0,)):
            if args[0] == 'merge-tree':
                return subprocess.CompletedProcess(args, 1, stdout='0' * 40 + '\n', stderr='')
            return real(repo, *args, ok=ok)
        check.git = git_stub
        try:
            git(self.repo, 'branch', 'pr', 'main')
            rows, conflicts = check.recent_foreign_deletions(self.repo, 'main', 'pr', 21, NOW)
            code, out = self.run_check()
        finally:
            check.git = real
        self.assertIsNone(rows)
        self.assertEqual(conflicts, ['(no conflicted file named)'])
        self.assertEqual(code, 2)

    def test_a_conflicting_merge_reports_the_conflict(self):
        git(self.repo, 'checkout', '-q', '-b', 'pr', 'main')
        commit(self.repo, {'new.txt': 'theirs\n'}, 'PR edit', NOW - DAY)
        git(self.repo, 'checkout', '-q', 'main')
        commit(self.repo, {'new.txt': 'ours\n'}, 'Main edit', NOW - DAY)
        rows, conflicts = check.recent_foreign_deletions(self.repo, 'main', 'pr', 21, NOW)
        self.assertIsNone(rows)
        self.assertEqual(conflicts, ['new.txt'])
        code, out = self.run_check()
        self.assertEqual(code, 2)
        self.assertIn('does not merge cleanly', out)
        self.assertIn('  new.txt', out)

    def test_the_reverts_ok_label_acknowledges_the_deletions(self):
        self.pr_merges_main_work_then_drops_it('new.txt', 'n1\nrecent\n', 'n1\n', NOW - 3 * DAY)
        with tempfile.TemporaryDirectory() as d:
            event = pathlib.Path(d, 'event.json')
            event.write_text(json.dumps({'pull_request': {'labels': [{'name': 'other'}]}}))
            self.assertEqual(self.run_check('--event', str(event))[0], 1)
            event.write_text(json.dumps({'pull_request': {'labels': [{'name': 'reverts-ok'}]}}))
            code, out = self.run_check('--event', str(event))
        self.assertEqual(code, 0)
        self.assertIn('new.txt: 1 line from', out)
        self.assertIn('Acknowledged by the reverts-ok label', out)
        self.assertEqual(self.run_check('--labels', 'run-e2e')[0], 1)
        self.assertEqual(self.run_check('--labels', 'run-e2e,reverts-ok')[0], 0)


class Workflow(unittest.TestCase):
    def test_the_gate_runs_the_base_branchs_checker_not_the_pull_requests(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        job = workflow.split('\n  revert-check:\n', 1)[1].split('\n  check-migrations:\n', 1)[0]
        self.assertIn('git show "$BASE:.github/scripts/revert-check.py" > "$RUNNER_TEMP/revert-check.py"', job)
        self.assertIn('python3 -B -I "$RUNNER_TEMP/revert-check.py" "$BASE" HEAD', job)
        self.assertNotIn('make ', job)
        self.assertNotIn('retry-infra.sh', job)
        self.assertNotIn('cp .github/scripts/revert-check.py', job)
        self.assertNotIn('python3 -B -I .github/scripts/revert-check.py', job)

    def test_the_merge_queue_runs_it_on_the_group_against_the_group_base(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        job = workflow.split('\n  revert-check:\n', 1)[1].split('\n  check-migrations:\n', 1)[0]
        self.assertIn("if: github.event_name == 'pull_request' || github.event_name == 'merge_group'", job)
        self.assertIn('ref: ${{ github.event.pull_request.head.sha || github.event.merge_group.head_sha }}', job)
        self.assertIn("github.event_name == 'merge_group' && github.event.merge_group.base_sha", job)
        self.assertNotIn('QUEUE_REF', job)
        self.assertIn('merge_group:', workflow.split('\njobs:\n', 1)[0])


FAKE_GH = """#!/usr/bin/env python3
import json, os, sys
pr = json.load(open(os.path.join(os.environ['FAKE_GH'], sys.argv[2].rsplit('/', 1)[1] + '.json')))
expr = sys.argv[sys.argv.index('--jq') + 1]
print(pr['head']['sha'] if expr == '.head.sha' else ','.join(l['name'] for l in pr['labels']))
"""


class MergeQueue(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = pathlib.Path(self.tmp.name, 'repo')
        self.bin = pathlib.Path(self.tmp.name, 'bin')
        self.prs = pathlib.Path(self.tmp.name, 'prs')
        for d in (self.repo, self.bin, self.prs):
            d.mkdir()
        gh = self.bin / 'gh'
        gh.write_text(FAKE_GH)
        gh.chmod(0o755)
        now = int(time.time())
        self.repo = str(self.repo)
        git(self.repo, 'init', '-q', '-b', 'main')
        checker = (ROOT / '.github/scripts/revert-check.py').read_text()
        commit(self.repo, {'.github/scripts/revert-check.py': checker, 'new.txt': 'n1\n', 'b.txt': 'b\n'}, 'base', now - 100 * DAY)
        git(self.repo, 'branch', 'fork-point')
        commit(self.repo, {'new.txt': 'n1\nrecent\n'}, 'Newer work on main', now - 3 * DAY)
        git(self.repo, 'checkout', '-q', '-b', 'a', 'fork-point')
        git(self.repo, 'merge', '-q', '--no-ff', '-m', 'Merge main', 'main', when=now - 2 * DAY)
        commit(self.repo, {'new.txt': 'n1\n'}, 'Drop it, as #2 says', now - DAY)
        git(self.repo, 'checkout', '-q', '-b', 'b', 'main')
        commit(self.repo, {'b.txt': 'b2\n'}, 'Harmless', now - DAY)
        git(self.repo, 'checkout', '-q', 'main')
        self.base = git(self.repo, 'rev-parse', 'main')
        self.now = now

    def tearDown(self):
        self.tmp.cleanup()

    def queue(self, first_subject='Merge pull request #1 from lambdaclass/a'):
        git(self.repo, 'checkout', '-q', '--detach', self.base)
        git(self.repo, 'merge', '-q', '--no-ff', '-m', first_subject, 'a', when=self.now)
        git(self.repo, 'merge', '-q', '--no-ff', '-m', 'Merge pull request #2 from lambdaclass/b', 'b', when=self.now)

    def pr(self, number, branch, labels):
        sha = git(self.repo, 'rev-parse', branch)
        (self.prs / f'{number}.json').write_text(json.dumps({'head': {'sha': sha}, 'labels': [{'name': l} for l in labels]}))

    def run_job(self, **extra):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        job = workflow.split('\n  revert-check:\n', 1)[1].split('\n  check-migrations:\n', 1)[0]
        script = textwrap.dedent(job.split('        run: |\n', 1)[1])
        env = {**os.environ, 'PATH': f'{self.bin}:{os.environ["PATH"]}', 'FAKE_GH': str(self.prs), 'BASE': self.base,
               'EVENT': 'merge_group', 'GH_REPO': 'lambdaclass/stabileo', 'RUNNER_TEMP': self.tmp.name, 'PR_LABELS': ''}
        env.pop('GITHUB_EVENT_PATH', None)
        env.update(extra)
        r = subprocess.run(['bash', '--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], cwd=self.repo, env=env, capture_output=True, text=True)
        return r.returncode, r.stdout + r.stderr

    def test_each_pull_request_needs_its_own_acknowledgement(self):
        self.queue()
        self.pr(1, 'a', [])
        self.pr(2, 'b', ['reverts-ok'])
        code, out = self.run_job()
        self.assertEqual(code, 1, out)
        self.assertIn('Pull request #1:', out)
        self.assertIn('new.txt: 1 line from', out)
        self.assertNotIn('Acknowledged', out)

    def test_the_deleting_pull_requests_own_label_acknowledges_it(self):
        self.queue()
        self.pr(1, 'a', ['reverts-ok'])
        self.pr(2, 'b', [])
        code, out = self.run_job()
        self.assertEqual(code, 0, out)
        self.assertIn('Acknowledged by the reverts-ok label.', out)

    def test_a_label_removed_since_the_event_does_not_acknowledge(self):
        stale = pathlib.Path(self.tmp.name, 'event.json')
        stale.write_text(json.dumps({'pull_request': {'labels': [{'name': 'reverts-ok'}]}}))
        git(self.repo, 'checkout', '-q', 'a')
        code, out = self.run_job(EVENT='pull_request', GITHUB_EVENT_PATH=str(stale), PR_LABELS='run-e2e')
        self.assertEqual(code, 1, out)
        self.assertIn('new.txt: 1 line from', out)
        self.assertNotIn('Acknowledged', out)
        self.assertEqual(self.run_job(EVENT='pull_request', GITHUB_EVENT_PATH=str(stale), PR_LABELS='run-e2e,reverts-ok')[0], 0)
        self.queue()
        self.pr(1, 'a', [])
        self.pr(2, 'b', [])
        code, out = self.run_job(GITHUB_EVENT_PATH=str(stale))
        self.assertEqual(code, 1, out)
        self.assertNotIn('Acknowledged', out)

    def test_a_group_commit_that_is_not_a_queue_merge_fails(self):
        self.queue('Merge branch a')
        self.pr(1, 'a', ['reverts-ok'])
        self.pr(2, 'b', ['reverts-ok'])
        code, out = self.run_job()
        self.assertEqual(code, 1, out)
        self.assertIn("is not the merge queue's merge", out)

    def test_a_merge_of_anything_but_the_pull_requests_head_fails(self):
        self.queue()
        self.pr(1, 'b', ['reverts-ok'])
        self.pr(2, 'b', [])
        code, out = self.run_job()
        self.assertEqual(code, 1, out)
        self.assertIn("is not the merge queue's merge", out)


if __name__ == '__main__':
    unittest.main()
