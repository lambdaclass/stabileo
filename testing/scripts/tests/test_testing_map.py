import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
CHECK = ROOT / 'scripts/check-testing-map.py'
FIXTURES = pathlib.Path(__file__).parent / 'fixtures/testing-map'


class TestingMap(unittest.TestCase):
    def run_map(self, fixture='passing.md', replacements=()):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / 'engine/tests').mkdir(parents=True)
            (root / '.github/workflows').mkdir(parents=True)
            (root / '.github/workflows/ci.yml').write_text('jobs:\n  lint-repo:\n    name: Lint Repo\n')
            (root / 'Makefile').write_text('test.engine:\n\ttrue\n')
            (root / 'testing').mkdir()
            table = (FIXTURES / fixture).read_text()
            for old, new in replacements:
                table = table.replace(old, new)
            (root / 'testing/README.md').write_text(table)
            return subprocess.run([sys.executable, '-B', '-I', str(CHECK), '--root', str(root)],
                                  capture_output=True, text=True)

    def test_passing_fixture(self):
        result = self.run_map()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_path_fixture(self):
        result = self.run_map('missing-path.md')
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('missing path: missing/tests', result.stderr)

    def test_missing_make_target(self):
        result = self.run_map(replacements=(('make test.engine', 'make test.missing'),))
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('unknown make target: test.missing', result.stderr)

    def test_missing_ci_job(self):
        result = self.run_map(replacements=(('ci.yml:lint-repo', 'ci.yml:missing'),))
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('unknown CI job: ci.yml:missing', result.stderr)

    def test_missing_workflow(self):
        result = self.run_map(replacements=(('ci.yml:lint-repo', 'missing.yml:lint-repo'),))
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('missing workflow: missing.yml', result.stderr)

    def test_missing_table_is_rejected(self):
        result = self.run_map(replacements=(('|', ''),))
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('expected one testing map table', result.stderr)

    def test_unmarked_path_is_rejected(self):
        result = self.run_map(replacements=(('`engine/tests`', 'engine/tests'),))
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('path cell must list paths in backticks', result.stderr)

    def test_unmarked_command_is_rejected(self):
        result = self.run_map(replacements=(('`make test.engine`, `ci.yml:lint-repo`', 'make test.engine'),))
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('runner cell must list make targets or CI jobs in backticks', result.stderr)


if __name__ == '__main__':
    unittest.main()
