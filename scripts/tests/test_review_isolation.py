import importlib.util
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]
LIB = ROOT / 'scripts/review/lib.sh'
spec = importlib.util.spec_from_file_location('readonly', ROOT / 'scripts/review/readonly.py')
readonly = importlib.util.module_from_spec(spec)
spec.loader.exec_module(readonly)


class ReviewIsolation(unittest.TestCase):
    def test_clean_checkout_at_wrong_commit_is_not_published(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run(['bash', '-c', '''
source "$1"
PREFIX=$2/review
WORK_ROOT=$2
SHA=expected
printf 'ready\n' > "$PREFIX-codex.raw"
git() {
  case "$*" in
    *'rev-parse HEAD') echo switched;;
    *'status --porcelain') return 0;;
  esac
}
review_publish codex Codex
''', 'test', str(LIB), tmp], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('changed HEAD', result.stderr)
            self.assertFalse(list(Path(tmp).glob('*.md')))

    def test_each_attempt_uses_its_own_checkout_and_sandbox(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name in ('codex', 'kimi', 'grok', 'adversarial'):
                (Path(tmp) / name).mkdir()
            result = subprocess.run(['bash', '-c', '''
set -eu
source "$1"
WORK_ROOT=$2
PREFIX=$2/review
REPO=/source
GIT_COMMON=/metadata
REVIEW_SCRIPTS=/scripts
python3() { printf '%s\n' "$PWD $*" >> "$WORK_ROOT/calls"; echo ready; }
for name in codex kimi grok adversarial; do review_attempt "$name" reviewer; done
''', 'test', str(LIB), tmp], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            calls = (Path(tmp) / 'calls').read_text().splitlines()
            self.assertEqual(len(calls), 4)
            for name, call in zip(('codex', 'kimi', 'grok', 'adversarial'), calls):
                self.assertEqual(call, f'{tmp}/{name} /scripts/readonly.py /source /metadata {tmp} -- reviewer')

    def test_readonly_covers_checkout_and_git_metadata(self):
        paths = ['/tmp/source', '/tmp/metadata', '/tmp/checkouts']
        mac = readonly.sandbox_command(paths, ['reviewer'], 'darwin')
        linux = readonly.sandbox_command(paths, ['reviewer'], 'linux')
        self.assertIn('(deny file-write*', mac[2])
        for path in paths:
            resolved = str(Path(path).resolve())
            self.assertIn(f'(subpath "{resolved}")', mac[2])
            self.assertIn(['--ro-bind', resolved, resolved],
                          [linux[i:i + 3] for i in range(len(linux))])

    def test_term_kills_stubborn_process_tree_and_cleans_checkout(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            child = root / 'child.py'
            child.write_text('import os, signal, time, sys\n'
                             'signal.signal(signal.SIGTERM, signal.SIG_IGN)\n'
                             'open(sys.argv[1], "w").write(str(os.getpid()))\n'
                             'while True:\n    open(sys.argv[1] + ".tick", "w").write(str(time.monotonic()))\n    time.sleep(0.02)\n')
            process = subprocess.Popen(['bash', '-c', '''
set -eu
source "$1"
REPO=$2
WORK_ROOT=$2/work
mkdir -p "$WORK_ROOT/codex"
git() { printf '%s\n' "$*" >> "$REPO/cleanup"; rmdir "$WORK_ROOT/codex"; }
trap review_cleanup EXIT
trap 'exit 143' TERM
set -m
(python3 "$2/child.py" "$2/child.pid" & wait) & CODEX_PID=$!
wait "$CODEX_PID"
''', 'test', str(LIB), tmp], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            pid = None
            try:
                deadline = time.monotonic() + 5
                while not (root / 'child.pid').exists() and time.monotonic() < deadline:
                    time.sleep(0.02)
                pid = int((root / 'child.pid').read_text())
                start = time.monotonic()
                process.terminate()
                _, err = process.communicate(timeout=4)
                self.assertEqual(process.returncode, 143, err)
                self.assertLess(time.monotonic() - start, 3)
                self.assertFalse((root / 'work').exists())
                self.assertIn('worktree remove --force', (root / 'cleanup').read_text())
                tick = root / 'child.pid.tick'
                stopped_at = tick.read_text()
                time.sleep(0.15)
                self.assertEqual(tick.read_text(), stopped_at)
            finally:
                if process.poll() is None:
                    process.kill()
                    process.communicate()
                if pid:
                    try:
                        os.kill(pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass


if __name__ == '__main__':
    unittest.main()
