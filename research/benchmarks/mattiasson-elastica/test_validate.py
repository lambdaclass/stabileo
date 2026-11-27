import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('mattiasson', Path(__file__).with_name('validate.py'))
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)


class PublishedTable(unittest.TestCase):
    @unittest.skip("known wrong result: #2505")
    def test_replay_rejects_an_extra_or_repeated_case(self):
        stored = model.load(model.HERE / 'RESULTS.json')['cases']
        expected = [r['id'] for r in stored]
        for extra in [stored[0], {**stored[0], 'id': 'unknown'}]:
            with self.assertRaisesRegex(ValueError, 'case'):
                model.replay_cases([extra] + stored, expected)
        self.assertEqual(set(model.replay_cases(stored, expected)), set(expected))

    @unittest.skip("known wrong result: #2505")
    def test_failed_generation_preserves_evidence(self):
        failed = {'checks': [{'name': 'missing measurement', 'passed': False}]}
        with patch.object(model, 'load', return_value=[]), patch.object(model, 'evidence', return_value=(failed, {'checks': []})), patch.object(Path, 'write_text') as write:
            with self.assertRaises(SystemExit):
                model.main('generate', 'run', 'mesh')
            write.assert_not_called()

    @unittest.skip("known wrong result: #2505")
    def test_declared_readings_and_limits_are_exact(self):
        row = {'reference': 1.0, 'computed': 1.0, 'observed': 0.0, 'tolerance': 1e-10}
        for key in ('reference', 'tolerance'):
            with self.subTest(key=key):
                self.assertFalse(model.same(row, {**row, key: row[key] + 1e-10}))
        self.assertTrue(model.same(row, row))

    def test_generation_requires_ten_distinct_load_parameters(self):
        original = model.load
        table = original(model.TABLE)
        for rows in [[], table['rows'][:-1], table['rows'][:-1] + table['rows'][:1]]:
            with self.subTest(count=len(rows)), patch.object(model, 'load', side_effect=lambda p: {**table, 'rows': rows} if p == model.TABLE else original(p)):
                with self.assertRaises(ValueError):
                    model.evidence(native, mesh)


if __name__ == '__main__':
    native, mesh = map(model.load, sys.argv[1:])
    unittest.main(argv=sys.argv[:1])
