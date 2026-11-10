"""check-full-history-checkouts.py: a job that builds or tests the web app checks out with the whole history."""
import importlib.util
import json
import os
import re
import subprocess
import textwrap
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('check', ROOT / '.github/scripts/check-full-history-checkouts.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)

WORKFLOW = '''name: x
on: [push]
jobs:
  web:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@abc # v7
        with:
          persist-credentials: false
{extra}      - run: {command}
  engine:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@abc
      - run: make test.engine.suite
'''


def violations(command, extra=''):
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / '.github/workflows').mkdir(parents=True)
        (root / '.github/workflows/x.yml').write_text(WORKFLOW.format(command=command, extra=extra))
        return check.violations(root)


FULL = '          fetch-depth: 0\n          filter: blob:none\n'


class FullHistoryCheckouts(unittest.TestCase):
    def test_the_repository_workflows_pass(self):
        self.assertEqual(check.violations(ROOT), [])

    def test_a_web_job_with_a_shallow_checkout_fails(self):
        for command in ('make e2e.web.smoke SHARD=1/14', 'make test.web.unit', 'make typecheck.web', 'make web.build',
                        "nix develop -c sh -c 'cd web && npx vitest run a.test.ts'", 'make check.results-snapshot-gate'):
            found = violations(command)
            self.assertEqual(len(found), 1, command)
            self.assertIn('job web', found[0])

    def test_a_web_job_with_the_whole_history_passes(self):
        self.assertEqual(violations('make e2e.web.smoke', FULL), [])

    def test_a_job_that_does_not_touch_the_web_app_may_stay_shallow(self):
        self.assertEqual(violations('make lint.engine'), [])

    def test_another_repository_is_not_this_one(self):
        other = '      - uses: actions/checkout@abc\n        with:\n          repository: lambdaclass/other\n'
        self.assertEqual(violations('make web.build', FULL + other), [])


class ResultsSnapshotHistory(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=ROOT)
        self.addCleanup(self.tmp.cleanup)
        source = Path(self.tmp.name) / 'origin'
        source.mkdir()
        self.git(source, 'init', '--initial-branch=main')
        self.git(source, 'commit', '--allow-empty', '-m', 'Before the registry')
        registry = source / 'web/src/lib/provenance/result-changes'
        registry.mkdir(parents=True)
        (registry / 'numbered.json').write_text('{}')
        self.commit(source, 'Introduce the registry')
        (registry / 'landed.json').write_text('{}')
        self.commit(source, 'Register a landed result change')
        self.queue_base = self.git(source, 'rev-parse', 'HEAD').strip()
        (registry / 'pending.json').write_text('{}')
        self.commit(source, 'Register the queued result change')
        self.clone = Path(self.tmp.name) / 'checkout'
        self.git(source, 'clone', '--no-local', source.as_uri(), str(self.clone))
        module = (ROOT / 'web/scripts/result-changes/registry.mjs').as_uri()
        self.probe = f'''import {{ execFileSync }} from 'node:child_process';
import {{ landingsAt }} from {json.dumps(module)};
const git = (...args) => execFileSync('git', args, {{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }});
console.log(JSON.stringify({{ base: landingsAt(git, process.env.BASE), head: landingsAt(git, 'HEAD') }}));'''
        (self.clone / 'Makefile').write_text(
            'check.results-snapshot-gate:\n\t@node --input-type=module -e "$$REGISTRY_PROBE"\n')
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        job = workflow.split('\n  results-snapshot:\n', 1)[1].split('\n  determinism:\n', 1)[0]
        step = job.split('      - name: A changed snapshot is registered\n', 1)[1]
        self.script = textwrap.dedent(re.search(r'        run: \|\n((?:          [^\n]*\n)+)', step).group(1))
        self.expected = {'base': [['landed']], 'head': [['landed'], ['pending']]}
        before = subprocess.run(['node', '--input-type=module', '-e', self.probe], cwd=self.clone,
                                env={**os.environ, 'BASE': self.queue_base}, capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(before.stdout), self.expected)
        self.assertEqual(self.git(self.clone, 'rev-parse', '--is-shallow-repository').strip(), 'false')

    def git(self, cwd, *args):
        return subprocess.run(['git', '-c', 'user.name=CI test', '-c', 'user.email=ci@example.invalid',
                               '-c', 'commit.gpgsign=false', *args], cwd=cwd,
                              capture_output=True, text=True, check=True).stdout

    def commit(self, cwd, message):
        self.git(cwd, 'add', '.')
        self.git(cwd, 'commit', '-m', message)

    def run_gate(self, queue_base):
        result = subprocess.run(['bash', '-e', '-c', self.script], cwd=self.clone,
                                env={**os.environ, 'QUEUE_BASE': queue_base, 'REGISTRY_PROBE': self.probe,
                                     'MAKEFLAGS': '--no-print-directory'},
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), self.expected)
        self.assertEqual(self.git(self.clone, 'rev-parse', '--is-shallow-repository').strip(), 'false')

    @unittest.skip('known wrong result: #1895')
    def test_queue_base_fetch_preserves_registry_landings(self):
        self.run_gate(self.queue_base)

    def test_pull_request_base_preserves_registry_landings(self):
        self.run_gate('')


if __name__ == '__main__':
    unittest.main()
