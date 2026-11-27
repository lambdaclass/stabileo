import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

checker = Path(__file__).with_name('check.mjs')
native = os.environ.get('SHELL_OBSTACLE_RESULTS')


class NativeEvidence(unittest.TestCase):
    def test_corrupted_measurements_are_rejected_on_the_real_parity_path(self):
        if native:
            results = Path(native)
        else:
            results = Path(self.enterContext(tempfile.TemporaryDirectory()))
            root = checker.resolve().parents[4]
            for benchmark in ('benchmark_scordelis_lo', 'benchmark_pinched_cylinder', 'benchmark_hemisphere_hole_convergence'):
                subprocess.run(['cargo', 'test', '--locked', '--release', '--manifest-path', root / 'engine/Cargo.toml',
                                '--test', 'validation', benchmark], cwd=root, check=True,
                               env={**os.environ, 'SHELL_OBSTACLE_RESULTS': str(results)})
        control = subprocess.run(['node', checker, results], capture_output=True, text=True)
        self.assertEqual(control.returncode, 0, control.stderr)
        changes = [('cylinder-32', {'value': None}, 'cylinder-32: expected native solution'), ('cylinder-32', {'id': 'cylinder-16'}, 'cylinder-32: identity'),
                   ('cylinder-32', {'value': 0.000018248}, 'cylinder-32: signed displacement'), ('cylinder-32', {'failure': 'failed'}, 'cylinder-32: expected native solution'),
                   ('hemisphere-4', {'displacement': [{'nodeId': 1, 'uz': 1}]}, 'hemisphere-refusals')]
        changes.append(('roof-16', {'failure': 'failed'}, 'roof-16: expected successful solve'))
        roof = json.loads((results / 'roof-16.json').read_text())
        changes.append(('roof-16', {'value': roof['value'] * (1 + 5e-9)}, 'roof-16: reported error'))
        for case, patch, diagnostic in changes:
            with self.subTest(case=case, patch=patch), tempfile.TemporaryDirectory() as tmp:
                copy = Path(tmp, 'native')
                shutil.copytree(results, copy)
                path = copy / (case + '.json')
                path.write_text(json.dumps({**json.loads(path.read_text()), **patch}))
                result = subprocess.run(['node', checker, copy], capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0, result.stdout[-400:])
                self.assertIn(diagnostic, result.stderr)


if __name__ == '__main__':
    if len(sys.argv) > 1 and Path(sys.argv[-1]).is_dir():
        native = Path(sys.argv.pop())
    unittest.main()
