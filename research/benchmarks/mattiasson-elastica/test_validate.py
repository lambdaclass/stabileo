import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('mattiasson', Path(__file__).with_name('validate.py'))
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)


class PublishedTable(unittest.TestCase):
    def test_each_tip_is_measured_once(self):
        d = {'nodeId': 8, 'ux': 1, 'uz': -2}
        data = {'converged': True, 'loadFactor': 1, 'results': {'displacements': [d]}}
        case = {'tipNode': 8, 'length': 1}
        self.assertEqual(model.tip(case, {'result': data}), (-1, 2))
        data['results']['displacements'].append({**d, 'uz': 0})
        with self.assertRaisesRegex(ValueError, 'tip'):
            model.tip(case, {'result': data})

    def test_complete_refinement_study_is_independent_of_the_generator(self):
        data = model.load(model.CASE)
        native, mesh = [], []
        for c in data['cases']:
            u, v = c['reference'] or (0, 0)
            tip = {'nodeId': c['tipNode'], 'ux': -u*c['length'], 'uz': -v*c['length']}
            result = {'loadFactor': 1, 'converged': True, 'results': {'displacements': [tip]}}
            native.append({'id': c['id'], 'result': result})
            if c['kind'] == 'force' and c['reference']:
                mesh.extend({'id': c['id'], 'elements': n, 'tipNode': c['tipNode'], 'result': result} for n in (16, 32, 64))
        original = model.load
        with patch.object(model, 'load', side_effect=lambda p: data if p == model.CASE else original(p)):
            expected = model.evidence(native, mesh)
            data['meshErrorCeilings'].reverse()
            self.assertEqual(model.evidence(native, mesh[::-1]), expected)
            for bad in (mesh[:-1], mesh + mesh[:1]):
                with self.assertRaisesRegex(ValueError, 'mesh'):
                    model.evidence(native, bad)
            data['meshErrorCeilings'] = [c for c in data['meshErrorCeilings'] if c['elements'] != 64]
            with self.assertRaisesRegex(ValueError, 'mesh'):
                model.evidence(native, [r for r in mesh if r['elements'] != 64])

    def test_replay_rejects_an_extra_or_repeated_case(self):
        stored = model.load(model.HERE / 'RESULTS.json')['cases']
        expected = [r['id'] for r in stored]
        for extra in [stored[0], {**stored[0], 'id': 'unknown'}]:
            with self.assertRaisesRegex(ValueError, 'case'):
                model.replay_cases([extra] + stored, expected)
        self.assertEqual(set(model.replay_cases(stored, expected)), set(expected))

    def test_failed_generation_preserves_evidence(self):
        failed = {'checks': [{'name': 'missing measurement', 'passed': False}]}
        with patch.object(model, 'load', return_value=[]), patch.object(model, 'evidence', return_value=(failed, {'checks': []})), patch.object(Path, 'write_text') as write:
            with self.assertRaises(SystemExit):
                model.main('generate', 'run', 'mesh')
            write.assert_not_called()

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
                    model.published_table()


if __name__ == '__main__':
    unittest.main(argv=sys.argv[:1])
