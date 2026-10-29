import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('timing', Path(__file__).with_name('time_reference.py'))
timing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(timing)


class TimingCountsTest(unittest.TestCase):
    def test_requires_python_native_and_reference_counts_to_match(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            reference = root / 'reference-results'
            reference.mkdir()
            (reference / 'MANIFEST.json').write_text(json.dumps({'runs': {'ex1': {'steps': 1}}}))
            (reference / 'ex1_mesh.json').write_text(json.dumps({'nodes': 4, 'elements': 1}))
            (root / 'outputs').mkdir()
            vtk = root / 'outputs/step.vtk'
            vtk.write_text('POINTS 4 float\nCELLS 1 5\n')
            native = {'steps': 1, 'nodes': 4, 'elements': 1}
            with patch.object(timing, 'ROOT', root):
                timing.verify_counts('ex1', native, root)
                for key in native:
                    with self.assertRaises(ValueError):
                        timing.verify_counts('ex1', dict(native, **{key: 2}), root)
                vtk.write_text('POINTS 5 float\nCELLS 1 5\n')
                with self.assertRaises(ValueError):
                    timing.verify_counts('ex1', native, root)
                vtk.unlink()
                with self.assertRaises(ValueError):
                    timing.verify_counts('ex1', native, root)


if __name__ == '__main__':
    unittest.main()
