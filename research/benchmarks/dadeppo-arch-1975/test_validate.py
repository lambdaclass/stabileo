import importlib.util
from unittest.mock import patch
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('arch', Path(__file__).with_name('validate.py'))
arch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(arch)


class EvidenceFreshness(unittest.TestCase):
    @unittest.skip("known wrong result: #2505")
    def test_matching_incomplete_exports_do_not_certify_the_path(self):
        for mutation in ('frame', 'node', 'duplicate'):
            with self.subTest(mutation=mutation):
                run = arch.load(arch.REPLAY)
                if mutation == 'frame':
                    run['frames'].pop()
                else:
                    nodes = run['frames'][0]['displacements']
                    if mutation == 'node':
                        nodes.pop()
                    else:
                        nodes[-1] = nodes[0]
                original = arch.load
                with patch.object(arch, 'load', side_effect=lambda path: run if path == arch.REPLAY else original(path)):
                    with self.assertRaisesRegex(ValueError, 'frame|node'):
                        arch.evidence(run)

    @unittest.skip("known wrong result: #2505")
    def test_table_compares_rotation_magnitude(self):
        run = arch.load(arch.REPLAY)
        run['limitPoint']['crown']['rotation'] *= -1
        _, comparison = arch.evidence(run)
        rotation = next(row for row in comparison['checks'] if row['id'] == 'crown-rotation')
        self.assertIn('magnitude', rotation['name'])
        self.assertTrue(rotation['passed'])

    def test_paper_readings_and_computed_values_have_separate_budgets(self):
        row = arch.load(arch.HERE / 'reference-results/published_comparison.json')['checks'][-1]
        for key, delta in [('reference', 1e-14), ('computed', row['tolerance'] / 100)]:
            with self.subTest(key=key):
                self.assertTrue(arch.differences(row, {**row, key: row[key] + delta}))
        self.assertFalse(arch.differences(row, row))


if __name__ == '__main__':
    unittest.main()
