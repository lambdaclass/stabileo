import importlib.util
import unittest
from decimal import Decimal as D, localcontext
from pathlib import Path

spec = importlib.util.spec_from_file_location('reference', Path(__file__).with_name('1753-c08-reference.py'))
ref = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ref)


def model(support):
    return {
        'nodes': {'1': {'id': 1, 'x': 0, 'z': 0}, '2': {'id': 2, 'x': 6, 'z': 0}},
        'elements': {'1': {'id': 1, 'type': 'frame', 'nodeI': 1, 'nodeJ': 2, 'materialId': 1, 'sectionId': 1}},
        'materials': {'1': {'id': 1, 'e': 200000, 'nu': D('0.3')}},
        'sections': {'1': {'id': 1, 'a': D('0.01'), 'iz': D('0.0001')}},
        'supports': {'1': dict(id=1, nodeId=1, **support), '2': {'id': 2, 'nodeId': 2, 'type': 'fixed'}},
        'loads': [{'type': 'nodal', 'data': {'nodeId': 1, 'fx': 1, 'fz': 2, 'my': 3}}],
    }


class ReferenceTests(unittest.TestCase):
    def test_2d_spring_stiffness_matches_its_prescribed_direction(self):
        with localcontext() as context:
            context.prec = 90
            r = ref.reference(model({'type': 'spring', 'kx': 2, 'kz': 3, 'kry': 4}), 2)
            for local, stiffness in enumerate([2, 3, 4]):
                i = r['index'][1, local]
                self.assertEqual(r['springs'][i][i], D(stiffness))

    def test_inclined_spring_uses_degrees(self):
        with localcontext() as context:
            context.prec = 90
            r = ref.reference(model({'type': 'spring', 'kx': 2, 'kz': 3, 'kry': 4, 'angle': 90}), 2)
            i, j = r['index'][1, 0], r['index'][1, 1]
            self.assertLess(abs(r['springs'][i][i] - 3), D('1e-80'))
            self.assertLess(abs(r['springs'][j][j] - 2), D('1e-80'))
            self.assertLess(abs(r['springs'][i][j]), D('1e-80'))

    def test_inclined_roller_uses_degrees(self):
        with localcontext() as context:
            context.prec = 90
            r = ref.reference(model({'type': 'inclinedRoller', 'angle': 90}), 2)
            self.assertLess(abs(r['u'][r['index'][1, 0]]), D('1e-80'))
            self.assertGreater(abs(r['u'][r['index'][1, 1]]), 0)

    def test_native_support_adapter_preserves_spring_axes_and_radians(self):
        with localcontext() as context:
            context.prec = 90
            pi = 16*ref.atan(D(1)/5)-4*ref.atan(D(1)/239)
            native = model({'type': 'spring', 'kx': 2, 'ky': 3, 'kz': 4, 'angle': pi/2})
            physical = ref.physical_input(native, 2)
            self.assertEqual(physical['supports']['1']['kz'], 3)
            self.assertEqual(physical['supports']['1']['kry'], 4)
            self.assertLess(abs(physical['supports']['1']['angle']-90), D('1e-80'))
            r = ref.reference(physical, 2)
            i, j, t = (r['index'][1, d] for d in range(3))
            self.assertLess(abs(r['springs'][i][i]-3), D('1e-80'))
            self.assertLess(abs(r['springs'][j][j]-2), D('1e-80'))
            self.assertEqual(r['springs'][t][t], 4)


if __name__ == '__main__':
    unittest.main()
