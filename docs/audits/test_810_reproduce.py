import gzip
import hashlib
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'docs/audits/810-reproduce.py'


class ReproductionTests(unittest.TestCase):
    def replay(self, target):
        calls = []
        environment = {'PATH': os.environ['PATH'], 'CARGO_BUILD_JOBS': '2'}
        if target is not None:
            environment['CARGO_TARGET_DIR'] = target

        real_run = subprocess.run

        def run(command, **kwargs):
            if command[0] != "make":
                return real_run(command, **kwargs)
            env, check = kwargs["env"], kwargs["check"]
            self.assertEqual(command, ['make', 'audit.810.run', 'MODE=models'])
            self.assertTrue(check)
            self.assertEqual(env['CARGO_BUILD_JOBS'], '2')
            example = ROOT / 'engine/examples/triage810.rs'
            generated = example.read_text()
            self.assertNotIn('/private/tmp/810-cases.json', generated)
            self.assertNotIn('/private/tmp/claude-501', generated)
            self.assertEqual(Path(env['TRIAGE810_CASES']).read_bytes(), gzip.decompress((SCRIPT.parent / '810-obstacle-course.json.gz').read_bytes()))
            calls.append(env['CARGO_TARGET_DIR'])

        previous = Path.cwd()
        try:
            with patch.dict(os.environ, environment, clear=True), patch.object(sys, 'argv', [str(SCRIPT), 'models']), patch('subprocess.run', side_effect=run):
                runpy.run_path(str(SCRIPT), run_name='__main__')
        finally:
            os.chdir(previous)
        self.assertFalse((ROOT / 'engine/examples/triage810.rs').exists())
        self.assertEqual(calls, [target or str(Path(tempfile.gettempdir()) / 'stabileo-810-target')])

    def test_preserves_target(self):
        self.replay('/tmp/custom-810-target')

    def test_platform_default_target(self):
        self.replay(None)

    def test_bundled_fixture(self):
        import json
        raw = gzip.decompress((SCRIPT.parent / '810-obstacle-course.json.gz').read_bytes())
        self.assertEqual(hashlib.sha256(raw).hexdigest(), '7595e6785537cd104c014d855778da905f7d5a6614627d75878117ef0d4e586b')
        data = json.loads(raw)
        self.assertGreaterEqual(len(data['cases']), 8)


if __name__ == '__main__':
    unittest.main()
