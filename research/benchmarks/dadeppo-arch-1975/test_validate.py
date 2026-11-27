import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('arch', Path(__file__).with_name('validate.py'))
arch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(arch)


class EvidenceFreshness(unittest.TestCase):
    def test_paper_readings_and_computed_values_have_separate_budgets(self):
        row = arch.load(arch.HERE / 'reference-results/published_comparison.json')['checks'][-1]
        for key, delta in [('reference', 1e-14), ('computed', row['tolerance'] / 100)]:
            with self.subTest(key=key):
                self.assertTrue(arch.differences(row, {**row, key: row[key] + delta}))
        self.assertFalse(arch.differences(row, row))


if __name__ == '__main__':
    unittest.main()
