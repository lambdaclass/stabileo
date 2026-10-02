/**
 * Combinations that add up nothing, or that leave the structure's weight out, are said.
 * A first user's scaffold had "1.4D" empty and "1.2D + 1.6L" with only the live case.
 */
import { describe, it, expect } from 'vitest';
import { checkModel } from '../model-diagnostics';

const base = () => ({
  nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 2, y: 0, z: 0 }]]),
  elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]]),
  materials: new Map(), sections: new Map(), supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed3d' }]]),
  loads: [{ type: 'nodal3d', data: { id: 1, nodeId: 2, fx: 0, fy: 0, fz: -1, mx: 0, my: 0, mz: 0, caseId: 2 } }],
  loadCases: [{ id: 2, type: 'L', name: 'CV' }],
}) as never;
const codes = (m: unknown) => checkModel(m as never).map((d) => d.code);

describe('combination checks', () => {
  it('names an empty combination and the absence of permanent load', () => {
    const m = { ...(base() as object), combinations: [{ id: 1, name: '1.2D + 1.6L', factors: [{ caseId: 2, factor: 1.6 }] }, { id: 2, name: '1.4D', factors: [] }] };
    const out = checkModel(m as never);
    expect(out.filter((d) => d.code === 'MODEL_COMBO_EMPTY').map((d) => d.details?.combination)).toEqual(['1.4D']);
    expect(codes(m)).toContain('MODEL_COMBO_NO_PERMANENT');
  });

  it('is quiet when a combination carries the dead case or the self-weight case', () => {
    const withD = { ...(base() as object), loadCases: [{ id: 1, type: 'D', name: 'D' }, { id: 2, type: 'L', name: 'CV' }],
      combinations: [{ id: 1, name: '1.2D + 1.6L', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }] }] };
    expect(codes(withD)).not.toContain('MODEL_COMBO_NO_PERMANENT');
    expect(codes(withD)).not.toContain('MODEL_COMBO_EMPTY');
    const withSw = { ...(base() as object), selfWeightCaseIds: [2], combinations: [{ id: 1, name: 'U', factors: [{ caseId: 2, factor: 1 }] }] };
    expect(codes(withSw)).not.toContain('MODEL_COMBO_NO_PERMANENT');
  });
});
