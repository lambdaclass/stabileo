import { expect, it } from 'vitest';
import declaredQuantities from 'virtual:result-change-quantities';
import { assessProject } from '../../provenance/applicability';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import { modelFeatures, type FeatureSnapshot } from '../../provenance/model-features';
import { freshStamp } from '../../provenance/solve-stamp';
import { fieldCovered } from '../../../../scripts/results-snapshot/applicability.mjs';

const id = 'gravity-member-frames-and-extrema';
const source = RESULT_CHANGES.changes.find(c => c.id === id)!;
const entry = { ...source, quantities: declaredQuantities[id]!.filter((q): q is string => typeof q === 'string') };

it.skip('known wrong result: #2219 frame corrections require a floor couple on the same oriented carrier', () => {
  for (const mode of ['2d', '3d', 'pro']) for (const oriented of [false, true]) for (const floor of [false, true]) for (const couple of [0, Number.MIN_VALUE, -1, 1]) for (const same of [false, true]) {
    const snapshot: FeatureSnapshot = {
      elements: [[1, { id: 1, type: 'frame', materialId: 1, nodeI: 1, nodeJ: 2, ...(oriented ? { rollAngle: 30 } : {}) }], [2, { id: 2, type: 'frame', materialId: 1, nodeI: 2, nodeJ: 3 }]],
      loads: [{ type: 'distributed3d', data: { elementId: same ? 1 : 2, ...(floor ? { fromDef: 'floor-1' } : {}), moments: { x: [couple, 0, 0], y: [0, 0, 0], z: [0, 0, 0] } } }],
    };
    const applicable = assessProject(snapshot, { ...freshStamp(), resultsVersion: source.resultsVersion - 1 }, mode).changes.filter(c => c.id === id);
    const affected = mode !== '2d' && oriented && floor && couple !== 0 && same;
    expect.soft(applicable.length).toBe(affected ? 1 : 0);
    const features = [...modelFeatures(snapshot, { analysisMode: mode })];
    for (const prefix of ['base', 'case[2]', 'combo[1]', 'pdelta.results', 'nonlinear.results']) {
      expect.soft(fieldCovered(entry, `${prefix}.displacements[n10].rz`, features)).toBe(affected);
    }
  }
});
