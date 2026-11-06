import contextlib
import importlib.util
import io
import json
import os
import pathlib
import subprocess
import tempfile
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


if __name__ == '__main__':
    unittest.main()
