"""check-full-history-checkouts.py: a job that builds or tests the web app checks out with the whole history."""
import importlib.util
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


if __name__ == '__main__':
    unittest.main()
