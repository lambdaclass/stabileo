import importlib.util
from unittest.mock import patch
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('arch', Path(__file__).with_name('validate.py'))
arch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(arch)


class EvidenceFreshness(unittest.TestCase):
    def test_live_mesh_readme_distinguishes_arch_opening_from_element_spacing(self):
        opening = arch.load(arch.CASE)['openingDegrees']
        meshes = arch.load(arch.REPLAY)['convergence']['meshes']
        expected = []
        for mesh in meshes:
            elements = mesh['elements']
            self.assertIs(type(elements), int)
            self.assertGreater(elements, 0)
            spacing = str(opening / elements).removesuffix('.0')
            expected.append(f"| {elements} | {str(opening).removesuffix('.0')}° | {spacing}° |")

        lines = (arch.HERE / 'README.md').read_text().splitlines()
        header = lines.index('| Elements | Arch opening | Angle per element |')
        rows = []
        for line in lines[header + 2:]:
            if not line.startswith('|'):
                break
            rows.append(line)
        self.assertEqual(rows, expected)

    def test_numbered_equilibria_are_required_despite_matching_exports(self):
        for mutation in ('missing', 'duplicate', 'reordered'):
            run = arch.load(arch.REPLAY)
            steps = run['steps']
            if mutation == 'missing':
                del steps[1]
            elif mutation == 'duplicate':
                steps[1] = steps[0]
            else:
                steps[1], steps[2] = steps[2], steps[1]
            original = arch.load
            with self.subTest(mutation=mutation), patch.object(arch, 'load', side_effect=lambda p: run if p == arch.REPLAY else original(p)):
                with self.assertRaisesRegex(ValueError, 'step'):
                    arch.evidence(run)

    def test_frame_node_order_does_not_change_drift(self):
        run = arch.load(arch.REPLAY)
        run['frames'][0]['displacements'].reverse()
        self.assertEqual(arch.evidence(run)[0]['checks'][-1]['observed'], 0)

    def test_descent_ratio_freshness_is_independent_of_acceptance(self):
        row = next(c for c in arch.evidence(arch.load(arch.REPLAY))[0]['checks'] if c['metric'] == 'final load / largest load')
        self.assertTrue(arch.differences({**row, 'observed': row['observed'] - 0.09}, row))

    def test_crown_rotation_comparison_names_the_interpreted_unit(self):
        self.assertEqual(arch.evidence(arch.load(arch.REPLAY))[1]['checks'][-1]['unit'], 'rad')

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
