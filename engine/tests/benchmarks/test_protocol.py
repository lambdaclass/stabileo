import copy
import json
import math
import unittest
from pathlib import Path
from protocol import lint, generate, precheck, convergence, check_result, ROOT


def spec(name='scordelis-lo'):
    return json.loads((ROOT/'spec'/f'{name}.json').read_text())


class ProtocolTests(unittest.TestCase):
    def test_all_specs_and_meshes(self):
        for p in (ROOT/'spec').glob('*.json'):
            if p.name == 'schema.json': continue
            s = lint(json.loads(p.read_text()))
            for n in s['mesh_sequence']:
                precheck(generate(s,n))

    def test_missing_references(self):
        s=spec();s['references'].pop()
        with self.assertRaisesRegex(ValueError,'two references'):lint(s)

    def test_empty_justification(self):
        s=spec();s['tolerance']['justification']=' '
        with self.assertRaisesRegex(ValueError,'justification'):lint(s)

    def test_provisional_gate(self):
        s=spec();s['references'][1]['provisional']=True
        with self.assertRaisesRegex(ValueError,'provisional'):lint(s)

    def test_original_mattiasson_table(self):
        s=spec('mattiasson-5');s['references'][1]['value']=.6647
        with self.assertRaisesRegex(ValueError,'two-reference agreement'):lint(s)

    def test_frame_is_not_a_truss(self):
        s=spec('shallow-toggle-truss');s['geometry']['element']='frame'
        with self.assertRaisesRegex(ValueError,'element/reference'):lint(s)

    def test_missing_supported_load(self):
        e=generate(spec(),4);e['model']['loads'].pop()
        with self.assertRaisesRegex(ValueError,'analytic total'):precheck(e)

    def test_unrestrained_model(self):
        e=generate(spec(),4);e['model']['supports']={}
        with self.assertRaisesRegex(ValueError,'rigid-body modes'):precheck(e)

    def test_crown_pin(self):
        with self.assertRaisesRegex(ValueError,'support/reaction contract'):
            precheck(generate(spec(),4,mutant='crown_pin'))

    def test_corners_union(self):
        s=spec('pinched-cylinder');e=generate(s,4)
        c=e['model']['supports']['1']
        self.assertTrue(all(c[k] for k in ['rx','rz','rrx','rry','rrz']))
        with self.assertRaisesRegex(ValueError,'support/reaction contract'):
            precheck(generate(s,4,mutant='missing_corner_symmetry'))

    def test_richardson_and_suspect_classification(self):
        s=spec();v=s['references'][0]['value']
        self.assertAlmostEqual(convergence(s,[v+.004,v+.001,v+.00025])['extrapolated'],v)
        for values in ([v+.01]*3,[v+.001,v+.002,v+.004],[v-.01,v+.005,v-.0025],[float('nan')]*3):
            with self.assertRaises(ValueError):convergence(s,values)
        with self.assertRaisesRegex(ValueError,'suspect'):convergence(s,[-v+.004,-v+.001,-v+.00025])

    def test_reaction_failure(self):
        e=generate(spec(),4)
        with self.assertRaisesRegex(ValueError,'reactions'):
            check_result(e,dict(reactions=[],displacements=[]))

    def test_independent_toggle_energy(self):
        # Differentiate scalar strain energy, then independently bisect its force.
        for element in ['truss','frame']:
            s=spec('shallow-toggle-'+element)
            def energy(v):
                a,h=2.,.1;l0=math.hypot(a,h);l=math.hypot(a,h-v)
                axial=2e6*(l-l0)**2/l0
                beta=math.atan((h-v)/a)-math.atan(h/a)
                return axial+(3*2e4*beta**2/l0 if element=='frame' else 0.)
            def derivative(v):
                d=1e-5
                return (energy(v-2*d)-8*energy(v-d)+8*energy(v+d)-energy(v+2*d))/(12*d)
            lo,hi=0.,.04
            for _ in range(60):
                mid=(lo+hi)/2
                if derivative(mid)<50:lo=mid
                else:hi=mid
            self.assertLess(abs((lo+hi)/2-s['references'][1]['value']),s['references'][1]['precision'])


if __name__ == '__main__':unittest.main()
