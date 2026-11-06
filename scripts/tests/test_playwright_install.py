import os
import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'web/scripts/playwright-install.sh'


def run(env_extra):
    with tempfile.TemporaryDirectory() as tmp:
        bin_dir = pathlib.Path(tmp)
        log = bin_dir / 'calls'
        npx = bin_dir / 'npx'
        npx.write_text(f'#!/bin/sh\nprintf "%s\\n" "$*" >> {log}\n')
        npx.chmod(0o755)
        env = {k: v for k, v in os.environ.items() if k not in ('PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD', 'PLAYWRIGHT_BROWSERS_PATH')}
        env['PATH'] = f'{bin_dir}{os.pathsep}{env["PATH"]}'
        env.update(env_extra)
        result = subprocess.run(['bash', str(SCRIPT), 'chromium'], env=env, capture_output=True, text=True)
        calls = log.read_text().splitlines() if log.exists() else []
        return result.returncode, calls


class PlaywrightInstall(unittest.TestCase):
    def test_a_nix_store_browsers_path_is_never_written(self):
        code, calls = run({'PLAYWRIGHT_BROWSERS_PATH': '/nix/store/abc-playwright-browsers'})
        self.assertEqual(code, 0)
        self.assertEqual(calls, [])

    def test_skip_download_installs_nothing(self):
        code, calls = run({'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD': '1'})
        self.assertEqual(code, 0)
        self.assertEqual(calls, [])

    def test_otherwise_it_installs_the_named_browsers(self):
        code, calls = run({'PLAYWRIGHT_BROWSERS_PATH': '/home/ci/.cache/ms-playwright'})
        self.assertEqual(code, 0)
        self.assertEqual(calls, ['playwright install chromium'])

    def test_every_makefile_install_goes_through_the_guard(self):
        makefile = (ROOT / 'Makefile').read_text()
        self.assertNotIn('npx playwright install chromium', makefile)
        self.assertIn('PLAYWRIGHT_INSTALL = bash scripts/playwright-install.sh', makefile)


if __name__ == '__main__':
    unittest.main()
