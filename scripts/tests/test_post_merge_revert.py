import base64
import importlib.util
import json
import os
import pathlib
import stat
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('revert', ROOT / '.github/scripts/post-merge-revert.py')
revert = importlib.util.module_from_spec(spec)
spec.loader.exec_module(revert)
GIT = ['git', '-c', 'user.name=t', '-c', 'user.email=t@localhost', '-c', 'commit.gpgsign=false']


def git(repo, *args):
    return subprocess.run([*GIT, *args], cwd=repo, check=True, capture_output=True, text=True).stdout.strip()


def write(repo, path, text):
    p = pathlib.Path(repo, path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)


def merge_pr(repo, number, edit):
    git(repo, 'checkout', '-q', '-b', f'pr{number}', 'main')
    edit()
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', f'change {number}')
    git(repo, 'checkout', '-q', 'main')
    git(repo, 'merge', '-q', '--no-ff', '-m', f'Merge pull request #{number} from org/pr{number}', f'pr{number}')
    return git(repo, 'rev-parse', 'HEAD')


class Repo(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = self.tmp.name
        git(self.repo, 'init', '-q', '-b', 'main')
        write(self.repo, 'keep.txt', 'a\n')
        write(self.repo, 'gone.txt', 'old\n')
        git(self.repo, 'add', '-A')
        git(self.repo, 'commit', '-q', '-m', 'base')
        self.good = git(self.repo, 'rev-parse', 'HEAD')

    def tearDown(self):
        self.tmp.cleanup()


class SuspectRange(Repo):
    def test_every_merge_since_the_last_green_push_is_suspect(self):
        first = merge_pr(self.repo, 1, lambda: write(self.repo, 'one.txt', '1\n'))
        second = merge_pr(self.repo, 2, lambda: write(self.repo, 'two.txt', '2\n'))
        self.assertEqual(revert.suspect_merges(self.repo, self.good, second), [second, first])
        self.assertEqual(revert.pr_numbers(self.repo, [second, first]), ['2', '1'])

    def test_without_a_green_ancestor_nothing_is_reverted_automatically(self):
        merge_pr(self.repo, 1, lambda: write(self.repo, 'one.txt', '1\n'))
        second = merge_pr(self.repo, 2, lambda: write(self.repo, 'two.txt', '2\n'))
        self.assertIsNone(revert.suspect_merges(self.repo, None, second))
        self.assertIsNone(revert.suspect_merges(self.repo, '0' * 40, second))


class RevertChanges(Repo):
    def test_the_revert_restores_the_tree_before_the_merges_on_top_of_main(self):
        def edit():
            write(self.repo, 'keep.txt', 'b\n')
            write(self.repo, 'new.txt', 'n\n')
            os.remove(os.path.join(self.repo, 'gone.txt'))
        bad = merge_pr(self.repo, 1, edit)
        later = merge_pr(self.repo, 2, lambda: write(self.repo, 'later.txt', 'l\n'))
        changes = revert.revert_changes(self.repo, later, [bad])
        additions = {a['path']: base64.b64decode(a['contents']).decode() for a in changes['additions']}
        self.assertEqual(additions, {'keep.txt': 'a\n', 'gone.txt': 'old\n'})
        self.assertEqual(changes['deletions'], [{'path': 'new.txt'}])
        self.assertEqual(changes['unsupported'], [])
        self.assertEqual(git(self.repo, 'worktree', 'list').count('\n'), 0)

    def test_reverting_an_added_symlink_is_a_plain_deletion(self):
        added = merge_pr(self.repo, 1, lambda: os.symlink('keep.txt', os.path.join(self.repo, 'link')))
        changes = revert.revert_changes(self.repo, added, [added])
        self.assertEqual(changes['deletions'], [{'path': 'link'}])
        self.assertEqual(changes['unsupported'], [])

    def test_restoring_a_symlink_needs_a_manual_revert(self):
        merge_pr(self.repo, 1, lambda: os.symlink('keep.txt', os.path.join(self.repo, 'link')))
        removed = merge_pr(self.repo, 2, lambda: os.remove(os.path.join(self.repo, 'link')))
        self.assertEqual(revert.revert_changes(self.repo, removed, [removed])['unsupported'], ['link'])

    def test_a_mode_change_needs_a_manual_revert(self):
        path = os.path.join(self.repo, 'keep.txt')
        changed = merge_pr(self.repo, 1, lambda: os.chmod(path, os.stat(path).st_mode | stat.S_IXUSR))
        self.assertEqual(revert.revert_changes(self.repo, changed, [changed])['unsupported'], ['keep.txt'])

    def test_editing_an_executable_needs_a_manual_revert(self):
        path = os.path.join(self.repo, 'keep.txt')
        merge_pr(self.repo, 1, lambda: os.chmod(path, os.stat(path).st_mode | stat.S_IXUSR))
        edited = merge_pr(self.repo, 2, lambda: write(self.repo, 'keep.txt', 'b\n'))
        self.assertEqual(revert.revert_changes(self.repo, edited, [edited])['unsupported'], ['keep.txt'])

    def test_a_conflicting_revert_gives_none(self):
        bad = merge_pr(self.repo, 1, lambda: write(self.repo, 'keep.txt', 'b\n'))
        later = merge_pr(self.repo, 2, lambda: write(self.repo, 'keep.txt', 'c\n'))
        self.assertIsNone(revert.revert_changes(self.repo, later, [bad]))


class Decisions(unittest.TestCase):
    runs = [{'conclusion': 'success', 'created_at': '2026-11-02T10:00:00Z', 'head_sha': 'g1'},
            {'conclusion': 'failure', 'created_at': '2026-11-02T11:00:00Z', 'head_sha': 'b1'},
            {'conclusion': 'success', 'created_at': '2026-11-02T09:00:00Z', 'head_sha': 'g0'}]

    def test_last_green_before_and_green_after(self):
        self.assertEqual(revert.last_green_before(self.runs, '2026-11-02T11:00:00Z'), 'g1')
        self.assertIsNone(revert.last_green_before(self.runs, '2026-11-02T08:00:00Z'))
        self.assertFalse(revert.green_after(self.runs, '2026-11-02T11:00:00Z'))
        self.assertTrue(revert.green_after(self.runs, '2026-11-02T09:30:00Z'))

    def test_runs_are_paged_until_a_green_push_before_the_failure(self):
        pages = {1: [{'conclusion': 'failure', 'created_at': '2026-11-02T12:00:00Z', 'head_sha': 'b1'}],
                 2: [{'conclusion': 'success', 'created_at': '2026-11-02T13:00:00Z', 'head_sha': 'g9'}],
                 3: [{'conclusion': 'success', 'created_at': '2026-11-02T10:00:00Z', 'head_sha': 'g0'}],
                 4: [{'conclusion': 'success', 'created_at': '2026-11-02T09:00:00Z', 'head_sha': 'never'}]}
        asked = []

        def fake_gh(*args, **_):
            page = int(args[1].rsplit('page=', 1)[1])
            asked.append(page)
            return json.dumps({'workflow_runs': pages.get(page, [])})
        real, revert.gh = revert.gh, fake_gh
        try:
            runs = revert.main_runs('o/r', '2026-11-02T12:00:00Z')
            self.assertEqual(asked, [1, 2, 3])
            self.assertEqual(revert.last_green_before(runs, '2026-11-02T12:00:00Z'), 'g0')
            asked.clear()
            self.assertIsNone(revert.last_green_before(revert.main_runs('o/r', '2026-11-02T08:00:00Z', pages=3), '2026-11-02T08:00:00Z'))
            self.assertEqual(asked, [1, 2, 3])
        finally:
            revert.gh = real

    def test_only_one_run_holds_the_revert_lock(self):
        refs, calls = set(), []

        def fake_gh(*args, token=None, check=True):
            calls.append((args, token))
            if args[:3] == ('api', '-X', 'POST'):
                ref = args[5].split('=', 1)[1]
                if ref in refs:
                    raise RuntimeError('Reference already exists')
                refs.add(ref)
            elif args[:3] == ('api', '-X', 'DELETE'):
                refs.discard(args[3].split('/git/', 1)[1])
            return ''
        real, revert.gh = revert.gh, fake_gh
        try:
            self.assertIsNone(revert.acquire('o/r', 'abc', 'bot'))
            self.assertIn('already exists', revert.acquire('o/r', 'abc', 'bot'))
            revert.release('o/r', 'bot')
            self.assertEqual(refs, set())
            self.assertIsNone(revert.acquire('o/r', 'abc', 'bot'))
            self.assertEqual(refs, {revert.LOCK})
            self.assertTrue(all(token == 'bot' for _, token in calls))
        finally:
            revert.gh = real

    def test_enqueue_only_when_approved_and_every_required_check_passed(self):
        self.assertTrue(revert.ready({'review': 'APPROVED', 'checks': ['pass', 'skipping']}))
        self.assertFalse(revert.ready({'review': 'REVIEW_REQUIRED', 'checks': ['pass']}))
        self.assertFalse(revert.ready({'review': 'APPROVED', 'checks': []}))
        self.assertFalse(revert.ready({'review': 'APPROVED', 'checks': ['pass', 'pending']}))
        self.assertTrue(revert.failed({'review': '', 'checks': ['pass', 'fail']}))
        self.assertTrue(revert.failed({'review': '', 'checks': ['cancel']}))
        self.assertFalse(revert.failed({'review': '', 'checks': ['pending']}))

    def test_a_second_failure_waits_for_the_open_auto_revert(self):
        prs = [{'headRefName': 'fix/x', 'url': 'u1'}, {'headRefName': 'revert/auto-abc', 'url': 'u2'}]
        self.assertEqual(revert.open_revert(prs), 'u2')
        self.assertIsNone(revert.open_revert(prs[:1]))

    def test_the_script_never_approves_its_own_revert(self):
        source = (ROOT / '.github/scripts/post-merge-revert.py').read_text()
        self.assertNotIn('event=APPROVE', source)
        self.assertIn('jump: true', source)
        self.assertIn('createCommitOnBranch', source)


class Workflow(unittest.TestCase):
    def test_reacts_only_to_failed_main_pushes_of_ci(self):
        text = (ROOT / '.github/workflows/post-merge.yml').read_text()
        self.assertIn('workflows: [CI]', text)
        self.assertIn('branches: [main]', text)
        self.assertIn("github.event.workflow_run.event == 'push' && github.event.workflow_run.conclusion == 'failure'", text)
        self.assertNotIn('concurrency:', text)
        self.assertIn('timeout-minutes:', text)
        self.assertIn('secrets.REVERT_BOT_TOKEN', text)
        self.assertIn('secrets.NTFY_TOPIC', text)
        self.assertNotIn('pull-requests: write', text)


class Ntfy(unittest.TestCase):
    def send(self, env, *args):
        with tempfile.TemporaryDirectory() as tmp:
            curl = pathlib.Path(tmp, 'curl')
            curl.write_text('#!/bin/sh\nfor a; do printf "%s\\n" "$a"; done > "$OUT/args"\n'
                            'while [ $# -gt 0 ]; do [ "$1" = -K ] && cat "$2" > "$OUT/cfg"; shift; done\ncat > "$OUT/body"\n')
            curl.chmod(curl.stat().st_mode | stat.S_IEXEC)
            full = {'PATH': f'{tmp}:/usr/bin:/bin', 'OUT': tmp, **env}
            result = subprocess.run([str(ROOT / '.github/scripts/ntfy-send.sh'), *args], env=full, capture_output=True, text=True)
            files = {p.name: p.read_text() for p in pathlib.Path(tmp).iterdir() if p.name in ('args', 'cfg', 'body')}
        return result, files

    def test_sends_to_the_topic_without_putting_it_on_the_command_line(self):
        topic = 'a' * 30
        result, files = self.send({'NTFY_TOPIC': topic, 'NTFY_TOKEN': 'tok'}, 'urgent', 'title', 'body text')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(f'url = "https://ntfy.sh/{topic}"', files['cfg'])
        self.assertIn('Authorization: Bearer tok', files['cfg'])
        self.assertNotIn(topic, files['args'])
        self.assertIn('Priority: urgent', files['args'])
        self.assertEqual(files['body'], 'body text')

    def test_without_a_topic_it_only_prints_and_with_a_bad_one_it_fails(self):
        result, files = self.send({}, 'high', 't', 'b')
        self.assertEqual(result.returncode, 0)
        self.assertEqual(files, {})
        result, files = self.send({'NTFY_TOPIC': 'short'}, 'high', 't', 'b')
        self.assertEqual(result.returncode, 1)
        self.assertEqual(files, {})


class JobToken(unittest.TestCase):
    def test_the_job_token_can_read_every_api_the_script_calls_without_the_bot_token(self):
        workflow = (ROOT / '.github/workflows/post-merge.yml').read_text()
        granted = workflow.split('    permissions:\n', 1)[1].split('    steps:', 1)[0]
        script = (ROOT / '.github/scripts/post-merge-revert.py').read_text()
        calls = [line for line in script.splitlines() if "gh('pr', 'list'" in line and 'token=bot' not in line]
        self.assertTrue(calls)
        self.assertIn('      pull-requests: read\n', granted)
        self.assertNotIn('write', granted)


if __name__ == '__main__':
    unittest.main()
