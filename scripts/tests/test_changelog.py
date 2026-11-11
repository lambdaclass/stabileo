import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
HISTORY = '## 0.5.0 (2026-11-07)\n\nPrevious release.\n'


class Changelog(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir=ROOT)
        self.addCleanup(self.directory.cleanup)
        self.root = pathlib.Path(self.directory.name)
        (self.root / 'scripts').mkdir()
        shutil.copy(ROOT / 'scripts/changelog.py', self.root / 'scripts/changelog.py')
        self.fragments = self.root / 'changelog.d'
        self.fragments.mkdir()
        (self.fragments / 'README.md').write_text('Instructions')
        self.log = self.root / 'CHANGELOG.md'
        self.log.write_text('# Changelog\n\n## Unreleased\n\nStale summary.\n\n' + HISTORY)
        self.fix = '### Fixed\n\n#### Correct support reactions\n\nThe reactions balance.\n'
        (self.fragments / 'a-fix.md').write_text(self.fix)
        (self.fragments / 'z-add.md').write_text('### Added\n\n#### A new view\n\nView the model.\n')

    def run_cli(self, *args):
        return subprocess.run([sys.executable, '-I', str(self.root / 'scripts/changelog.py'), *args], capture_output=True, text=True)

    def test_unreleased_groups_current_fragments_and_preserves_them_and_history(self):
        result = self.run_cli('--unreleased')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        text = self.log.read_text()
        self.assertNotIn('Stale summary.', text)
        self.assertIn('### Fixed\n\n#### Correct support reactions', text)
        self.assertLess(text.index('### Added'), text.index('### Fixed'))
        self.assertTrue(text.endswith(HISTORY))
        self.assertEqual((self.fragments / 'a-fix.md').read_text(), self.fix)
        self.assertEqual(len(list(self.fragments.glob('*.md'))), 3)
        self.assertEqual(self.run_cli('--unreleased').returncode, 0)
        self.assertEqual(self.log.read_text(), text)
        result = self.run_cli('--release', '0.6.0', '2026-11-11')
        self.assertEqual(result.returncode, 0, result.stderr)
        released = self.log.read_text()
        self.assertEqual(released.count('#### Correct support reactions'), 1)
        self.assertIn('## 0.6.0 (2026-11-11)', released)
        self.assertTrue(released.endswith(HISTORY))
        self.assertEqual([p.name for p in self.fragments.glob('*.md')], ['README.md'])

    def test_invalid_fragments_leave_the_log_and_fragments_untouched(self):
        (self.fragments / 'invalid.md').write_text('Invalid fragment')
        before = self.log.read_text()
        for args in [('--unreleased',), ('--release', '0.6.0', '2026-11-11')]:
            self.assertNotEqual(self.run_cli(*args).returncode, 0)
            self.assertEqual(self.log.read_text(), before)
            self.assertTrue((self.fragments / 'invalid.md').exists())

    def test_empty_fragments_remove_the_stale_summary_and_keep_history(self):
        for path in self.fragments.glob('*.md'):
            if path.name != 'README.md':
                path.unlink()
        result = self.run_cli('--unreleased')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn('Stale summary.', self.log.read_text())
        self.assertTrue(self.log.read_text().endswith(HISTORY))


if __name__ == '__main__':
    unittest.main()
