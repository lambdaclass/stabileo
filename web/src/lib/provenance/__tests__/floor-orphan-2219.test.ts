import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { stampSolve } from '../solve-stamp';
import { ANALYSIS_KINDS } from '../model-features';

for (const mode of ['2d', '3d', 'pro']) for (const analysis of ANALYSIS_KINDS) {
  it(`known wrong result: #2219 orphaned floor notice survives a current ${analysis} solve in ${mode}`, () => {
    expect(assessProject({ loadCases: [{ id: 1, type: 'L' }], loads: [{ type: 'nodal3d', data: { caseId: 1, fromDef: 7, fz: -1 } }] }, stampSolve(analysis, null), mode).changes.map(c => c.id)).toContain('floor-load-region-moments');
  });
}
