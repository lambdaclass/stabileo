import { expect, it } from 'vitest';
import declaredQuantities from 'virtual:result-change-quantities';
import { fieldCovered } from '../../../../scripts/results-snapshot/applicability.mjs';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import { modelFeatures } from '../../provenance/model-features';
import { declaresMove, judge } from '../legacy';

const scopes = [
  ['gravity-density-extrema', true],
  ['gravity-diagram-coordinates', true],
  ['gravity-moment-support', false],
  ['gravity-stations-and-edits', true],
  ['gravity-torque-projection-and-carriers', true],
  ['gravity-zero-member-moments', false],
] as const;
const fields = ['displacements[n10].rz', 'displacements[n10].uz', 'reactions[n11].mz', 'elementForces[e100].nStart'];

for (const [id, envelope] of scopes) {
  it.skipIf(process.env.RUN_KNOWN_WRONG !== '2219')(`known wrong result: #2219 ${id} cannot excuse unrelated solved values`, () => {
    const source = RESULT_CHANGES.changes.find(c => c.id === id)!;
    const quantities = declaredQuantities[id]!;
    const entry = { ...source, quantities };
    for (const mode of ['2d', '3d', 'pro']) {
      const features = [...modelFeatures({
        elements: [[1, { id: 1, type: 'frame', materialId: 1, nodeI: 1, nodeJ: 2 }]],
        loads: [{ type: mode === '2d' ? 'distributed' : 'distributed3d', data: { elementId: 1, qI: -1, qJ: -1, qZI: -1, qZJ: -1 } }],
      }, { analysisMode: mode })];
      for (const field of fields) {
        for (const prefix of ['base', 'case[2]', 'combo[1]']) {
          const path = `${prefix}.${field}`;
          const before = { 'solve.ok': true, [path]: 10 };
          const after = { ...before, [path]: 11 };
          expect.soft(declaresMove(entry, path), `${mode} ${path}`).toBe(false);
          expect.soft(judge(id, before, after, [entry]).kind, `${mode} ${path}`).toBe('unexplained');
          expect.soft(judge(id, after, before, [entry]).kind, `${mode} reversed ${path}`).toBe('unexplained');
          expect.soft(fieldCovered({ ...entry, quantities: quantities.filter((q): q is string => typeof q === 'string') }, path, features), `${mode} gate ${path}`).toBe(false);
          expect(judge(id, before, before, [entry]).kind).toBe('same');
        }
        for (const prefix of ['pdelta.results', 'nonlinear.results', 'ssi.results']) {
          expect.soft(fieldCovered({ ...entry, quantities: quantities.filter((q): q is string => typeof q === 'string') }, `${prefix}.${field}`, features), `${mode} ${prefix}.${field}`).toBe(false);
        }
      }
      expect.soft(fieldCovered({ ...entry, quantities: quantities.filter((q): q is string => typeof q === 'string') }, 'envelope.governing[e1].momentY.value', features), `${mode} envelope`).toBe(envelope);
    }
    const before = { 'model.nodes': 2, 'solve.ok': true, 'base.elementForces[e1].nStart': 10 };
    const refused = { 'model.nodes': 2, 'solve.ok': false };
    expect.soft(judge(id, before, refused, [entry]).kind, 'declared refusal').toBe(id === 'gravity-torque-projection-and-carriers' ? 'unexplained' : 'explained');
    expect.soft(judge(id, refused, before, [entry]).kind, 'declared recovered solve').toBe(id === 'gravity-torque-projection-and-carriers' ? 'unexplained' : 'explained');
    expect(judge(id, before, { ...refused, 'model.nodes': 3 }, [entry]).kind).toBe('unexplained');
  });
}
