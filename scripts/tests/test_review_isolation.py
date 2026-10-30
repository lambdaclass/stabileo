import importlib.util
import os
from pathlib import Path
import signal
import shutil
import sys
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch

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
                self.assertEqual(call, f'{tmp}/{name} /scripts/readonly.py -- reviewer')

    def test_readonly_default_with_private_writable_exception(self):
        scratch = str(Path('/tmp/private-scratch').resolve())
        mac = readonly.sandbox_command([scratch], ['reviewer'], 'darwin')
        linux = readonly.sandbox_command([scratch], ['reviewer'], 'linux')
        self.assertIn('(deny file-write*)', mac[2])
        self.assertIn(f'(allow file-write* (subpath "{scratch}"))', mac[2])
        self.assertEqual(linux[2:5], ['--ro-bind', '/', '/'])
        self.assertEqual(linux[5:8], ['--bind', scratch, scratch])
        self.assertIn('--unshare-pid', linux)
        self.assertIn('--proc', linux)

    def test_private_config_and_scratch_are_cleaned_up(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = Path(tmp)
            for directory in ('.kimi', '.grok', '.config'):
                (original / directory).mkdir()
                (original / directory / 'settings').write_text('original')
            scratch_paths = []

            def run(command, env):
                scratch = Path(env['TMPDIR'])
                scratch_paths.append(scratch)
                self.assertEqual(command, readonly.sandbox_command([scratch], ['reviewer']))
                home = Path(env['HOME'])
                for directory in ('.kimi', '.grok', '.config'):
                    config = home / directory / 'settings'
                    self.assertEqual(config.read_text(), 'original')
                    config.write_text('private changes')
                for variable in ('XDG_CONFIG_HOME', 'XDG_CACHE_HOME',
                                 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'TMP', 'TEMP'):
                    self.assertTrue(Path(env[variable]).is_relative_to(scratch))
                return 7

            with patch.object(readonly.Path, 'home', return_value=original), \
                 patch.dict(os.environ, {'XDG_CONFIG_HOME': str(original / '.config')}), \
                 patch.object(readonly.subprocess, 'call', side_effect=run):
                self.assertEqual(readonly.main(['reviewer']), 7)
            self.assertFalse(scratch_paths[0].exists())
            for directory in ('.kimi', '.grok', '.config'):
                self.assertEqual((original / directory / 'settings').read_text(), 'original')

    def test_cannot_overwrite_other_reviewer_artifacts(self):
        sandbox = 'sandbox-exec' if sys.platform == 'darwin' else 'bwrap'
        if not shutil.which(sandbox):
            self.skipTest(f'{sandbox} is unavailable')
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            scratch = root / 'scratch'
            scratch.mkdir()
            artifacts = [root / name for name in ('codex.raw', 'codex.md')]
            for path in artifacts:
                path.write_text('original')
            script = """
import pathlib, sys
for name in sys.argv[1:]:
    path = pathlib.Path(name)
    try:
        path.write_text('forged')
    except PermissionError:
        pass
    else:
        raise AssertionError('artifact was writable: ' + name)
    try:
        path.unlink()
    except PermissionError:
        pass
    else:
        raise AssertionError('artifact was removable: ' + name)
pathlib.Path('scratch/probe').write_text('allowed')
print('ready')
"""
            # The parent can open its own output before entering the sandbox.
            with (root / 'kimi.raw').open('w') as output:
                result = subprocess.run(readonly.sandbox_command(
                    [scratch], [sys.executable, '-c', script, *map(str, artifacts)]),
                    cwd=root, stdout=output, stderr=subprocess.PIPE, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((root / 'kimi.raw').read_text(), 'ready\n')
            self.assertEqual((scratch / 'probe').read_text(), 'allowed')
            for path in artifacts:
                self.assertEqual(path.read_text(), 'original')

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
