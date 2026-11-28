import { expect, it, vi } from 'vitest';
import { createRecheckStore } from '../../store/recheck.svelte';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import type { AnalysisKind, FeatureSnapshot } from '../model-features';
import { stampSolve } from '../solve-stamp';

const id = 'dynamics-rotary-inertia-advisory-deep-members';
const notice = RESULT_CHANGES.changes.find(change => change.id === id)!;

function fixedNode(mode: string): FeatureSnapshot {
  return {
    supports: [[1, { nodeId: 1, type: mode === '2d' ? 'fixed' : 'fixed3d' }]],
    loads: [{ type: 'nodal3d', data: { nodeId: 1, fz: -20, caseId: 1 } }],
    loadCases: [{ id: 1, type: 'D' }],
    includeSelfWeight: true,
  };
}

const frame: FeatureSnapshot = {
  elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1 }]],
};

it.skip.each(['2d', '3d', 'pro', 'edu'])('known wrong result: #2223 — %s nonlinear notice requires authored structure', mode => {
  for (const analysis of ['linear', 'nonlinear', 'modal', 'spectral', 'timeHistory', 'harmonic'] as const) {
    for (const offset of [-1, 0, 1]) {
      const stamp = { ...stampSolve(analysis, null), resultsVersion: notice.resultsVersion + offset };
      const affected = (model: FeatureSnapshot) => assessProject(model, stamp, mode).changes.some(change => change.id === id);
      expect.soft(affected(fixedNode(mode))).toBe(false);
      expect.soft(affected({ ...fixedNode(mode), elements: [] })).toBe(false);
      expect.soft(affected(frame)).toBe(offset < 0 && analysis !== 'linear');
      expect.soft(affected({ supports: [[1, { nodeId: 1, type: 'spring', kx: 1 }]] }))
        .toBe(offset < 0 && analysis === 'nonlinear');
    }
  }
});

it.skip.each(['2d', '3d', 'pro', 'edu'])('known wrong result: #2223 — %s opens and recovers notices using concrete saved features', async mode => {
  for (const analysis of ['linear', 'nonlinear'] satisfies AnalysisKind[]) {
    const stamp = { ...stampSolve(analysis, null), resultsVersion: notice.resultsVersion - 1 };
    const store = createRecheckStore();
    const savedCases: Array<[string[] | undefined, boolean]> = [
      [undefined, false],
      [['potentialStructuralElements'], false],
      [['members'], true],
      [['shells'], true],
      [['springs'], true],
    ];
    for (const [features, structural] of savedCases) {
      store.openProject({
        ...fixedNode(mode),
        solvedWith: stamp,
        pendingRecheckNotice: features && { stamp, features: [...features, `analysis:${analysis}`] },
      }, mode);
      await vi.waitFor(() => expect(store.pending).toBe(false));
      expect.soft(store.assessment!.changes.some(change => change.id === id), String(features))
        .toBe(analysis === 'nonlinear' && structural);
    }
  }
});
