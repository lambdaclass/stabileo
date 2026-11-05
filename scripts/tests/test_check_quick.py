import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


def plan(*paths, built=False):
    with tempfile.TemporaryDirectory() as directory:
        repo = Path(directory)
        git = lambda *args: subprocess.run(['git', '-C', directory, *args], check=True, capture_output=True)
        git('init', '-q')
        (repo / 'scripts').mkdir()
        shutil.copy(ROOT / 'scripts/check-quick.sh', repo / 'scripts/check-quick.sh')
        if built:
            (repo / 'web/src/lib/wasm').mkdir(parents=True)
            (repo / 'web/src/lib/wasm/dedaliano_engine.d.ts').write_text('')
        git('add', '.')
        git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base')
        for path in paths:
            (repo / path).parent.mkdir(parents=True, exist_ok=True)
            (repo / path).write_text('x\n')
        result = subprocess.run(['scripts/check-quick.sh', '--dry-run'], cwd=repo, capture_output=True, text=True,
                                env={**os.environ, 'BASE': 'HEAD'}, check=True)
        return result.stdout


def targets(out):
    line = next(l for l in out.splitlines() if l.startswith('check.quick: make '))
    return line.removeprefix('check.quick: make ').split()


REPO = ['check.changelog', 'check-pins', 'check.test-targets']


class CheckQuick(unittest.TestCase):
    def test_nothing_changed_runs_only_the_repository_checks(self):
        out = plan()
        self.assertEqual(targets(out), REPO)
        self.assertNotIn('make wasm', out)

    def test_each_area_adds_the_checks_ci_runs_first_for_it(self):
        self.assertEqual(targets(plan('engine/src/lib.rs')), REPO + ['lint.engine'])
        self.assertEqual(targets(plan('backend/apps/x.ex')), REPO + ['lint.backend'])
        self.assertEqual(targets(plan('.github/workflows/ci.yml')), REPO + ['test.ci-scripts'])
        self.assertEqual(targets(plan('scripts/x.sh')), REPO + ['test.ci-scripts'])
        out = plan('web/src/x.ts')
        self.assertEqual(targets(out), REPO + ['typecheck.web'])
        self.assertIn('make wasm first', out)

    def test_the_engine_is_rebuilt_for_a_web_change_only_when_missing_or_changed(self):
        self.assertNotIn('make wasm', plan('web/src/x.ts', built=True))
        self.assertIn('make wasm first', plan('web/src/x.ts', 'engine/src/lib.rs', built=True))
        self.assertIn('make wasm first', plan('web/src/x.ts', 'Cargo.lock', built=True))
        self.assertNotIn('make wasm', plan('engine/src/lib.rs'))

    def test_uncommitted_and_untracked_work_counts_and_the_related_tests_follow(self):
        out = plan('engine/src/a.rs', 'web/src/b.ts', 'ai-backend/src/c.rs')
        self.assertEqual(targets(out), REPO + ['lint.engine', 'typecheck.web'])
        self.assertIn('then scripts/test-changed.sh --base HEAD', out)

    def test_an_early_match_in_a_long_change_list_still_selects_its_check(self):
        out = plan('backend/a.ex', *[f'docs/many/{i:05}.md' for i in range(20000)])
        self.assertIn('lint.backend', targets(out))

    def test_make_exposes_it(self):
        makefile = (ROOT / 'Makefile').read_text()
        self.assertIn('check.quick:\n\tBASE=$(BASE) scripts/check-quick.sh\n', makefile)


if __name__ == '__main__':
    unittest.main()
