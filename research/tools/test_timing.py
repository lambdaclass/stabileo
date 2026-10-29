import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('catalog', Path(__file__).with_name('catalog.py'))
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)


class TimingTest(unittest.TestCase):
    def test_schema_and_totals(self):
        good = {'machine': {'runner_label': 'ubuntu-latest', 'cpu_model': 'CPU', 'cores': 4},
                'date': '2026-10-29', 'python_seconds': 2.0, 'rust_native_seconds': 1.0,
                'cases': {'example': {'python_seconds': 2.0, 'rust_native_seconds': 1.0, 'steps': 79, 'elements': 5600}}}
        self.assertTrue(catalog.valid_timing(good))
        for key in good:
            bad = copy.deepcopy(good)
            del bad[key]
            self.assertFalse(catalog.valid_timing(bad), key)
        for key, value in [('date', 'tomorrow'), ('cases', []), ('cases', {}), ('machine', {}), ('python_seconds', 3), ('python_seconds', float('nan'))]:
            self.assertFalse(catalog.valid_timing(dict(good, **{key: value})))
        for key, value in [('steps', True), ('elements', 0), ('rust_native_seconds', -1), ('python_seconds', float('inf'))]:
            bad = copy.deepcopy(good)
            bad['cases']['example'][key] = value
            self.assertFalse(catalog.valid_timing(bad))


if __name__ == '__main__':
    unittest.main()
