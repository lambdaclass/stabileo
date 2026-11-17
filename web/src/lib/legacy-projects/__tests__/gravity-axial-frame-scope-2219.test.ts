import { expect, it } from 'vitest';
import declaredQuantities from 'virtual:result-change-quantities';
import { assessProject } from '../../provenance/applicability';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import { modelFeatures, type FeatureSnapshot } from '../../provenance/model-features';
import { freshStamp } from '../../provenance/solve-stamp';
import { fieldCovered } from '../../../../scripts/results-snapshot/applicability.mjs';
import { judge } from '../legacy';

const id = 'gravity-axial-density-frames';
const source = RESULT_CHANGES.changes.find(c => c.id === id)!;
const entry = { ...source, quantities: declaredQuantities[id]!.filter((q): q is string => typeof q === 'string') };
const fields = ['displacements[n10].rz', 'displacements[n10].uz', 'elementForces[e100].nStart'];

for (const mode of ['2d', '3d', 'pro']) {
  it(`known wrong result: #2219 axial density notice cannot explain ordinary ${mode} results`, () => {
    for (const frame of [undefined, 'local', 'global', 'projected']) {
      for (const moments of [undefined, { x: [0, 0, 0], y: [0, 0, 0], z: [0, 0, 0] }]) {
        const snapshot: FeatureSnapshot = {
          elements: [[1, { id: 1, type: 'frame', materialId: 1, nodeI: 1, nodeJ: 2 }]],
          loads: [{ type: 'distributed3d', data: { elementId: 1, qXI: 1, qXJ: 1, qYI: 0, qYJ: 0, qZI: -1, qZJ: -1, frame, moments } }],
        };
        const applicable = assessProject(snapshot, { ...freshStamp(), resultsVersion: source.resultsVersion - 1 }, mode).changes.filter(c => c.id === id);
        expect.soft(applicable, `${frame} ${JSON.stringify(moments)}`).toEqual([]);
        const features = [...modelFeatures(snapshot, { analysisMode: mode })];
        for (const prefix of ['base', 'case[2]', 'combo[1]', 'pdelta.results', 'nonlinear.results']) for (const field of fields) {
          const path = `${prefix}.${field}`;
          const before = { 'solve.ok': true, [path]: 10 };
          const after = { ...before, [path]: 11 };
          expect.soft(fieldCovered(entry, path, features), path).toBe(false);
          expect.soft(judge(id, before, after, applicable).kind, path).toBe('unexplained');
          expect.soft(judge(id, after, before, applicable).kind, `reversed ${path}`).toBe('unexplained');
          expect(judge(id, before, before, applicable).kind).toBe('same');
        }
      }
    }
  });
  it(`known wrong result: #2219 axial density scope follows the same load and non-default frame in ${mode}`, () => {
    for (const frame of [undefined, 'local', 'global', 'projected']) for (const axis of ['x', 'y', 'z']) for (const sample of [0, 1, 2]) for (const value of [-Number.MIN_VALUE, Number.MIN_VALUE, -1, 1]) {
      const moments = { x: [0, 0, 0], y: [0, 0, 0], z: [0, 0, 0] };
      moments[axis as keyof typeof moments][sample] = value;
      const snapshot: FeatureSnapshot = {
        elements: [[1, { id: 1, type: 'frame', materialId: 1, nodeI: 1, nodeJ: 2 }]],
        loads: [{ type: 'distributed3d', data: { elementId: 1, frame, moments } }],
      };
      const features = [...modelFeatures(snapshot, { analysisMode: mode })];
      const affected = mode !== '2d' && (frame === 'global' || frame === 'projected');
      const changes = assessProject(snapshot, { ...freshStamp(), resultsVersion: source.resultsVersion - 1 }, mode).changes.filter(c => c.id === id);
      expect.soft(changes.length, `${frame}/${axis}/${sample}/${value}`).toBe(affected ? 1 : 0);
      for (const prefix of ['base', 'case[2]', 'combo[1]', 'pdelta.results', 'nonlinear.results']) for (const field of fields) {
        expect.soft(fieldCovered(entry, `${prefix}.${field}`, features)).toBe(affected);
      }
    }
    for (const type of ['distributed', 'axialDistributed', 'pointOnElement3d', 'nodal3d']) {
      const snapshot: FeatureSnapshot = {
        elements: [[1, { id: 1, type: 'frame', materialId: 1, nodeI: 1, nodeJ: 2 }]],
        loads: [
          { type, data: { elementId: 1, frame: 'global', moments: { x: [1, 1, 1], y: [0, 0, 0], z: [0, 0, 0] } } },
          { type: 'distributed3d', data: { elementId: 1, frame: 'global', qXI: 1, qXJ: 1 } },
        ],
      };
      expect(assessProject(snapshot, { ...freshStamp(), resultsVersion: 0 }, mode).changes.map(c => c.id)).not.toContain(id);
    }
  });
}
