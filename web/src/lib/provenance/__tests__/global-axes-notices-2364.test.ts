import { afterEach, expect, it, vi } from 'vitest';
import { featuresForMode } from '../../../../config/public-features.mjs';
import { createRecheckStore } from '../../store/recheck.svelte';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { modelFeatures, type FeatureSnapshot } from '../model-features';
import { stampSolve } from '../solve-stamp';

const branchIds = ['exact-plane-self-weight', 'fixture-replay-and-framed-import', 'global-axes-inputs', 'workbook-support-rotations'];
const branchNotices = RESULT_CHANGES.changes.filter(change => branchIds.includes(change.id));
const versionBefore = Math.min(...branchNotices.map(change => change.resultsVersion)) - 1;
const modes = ['2d', '3d', 'pro'] as const;
const histories = ['linear', 'nonlinear'] as const;

afterEach(() => vi.unstubAllGlobals());

it('known wrong result: #2364 the older #2223 nodal project stays quiet before the planar weight change', () => {
  const weightNotice = branchNotices.find(change => change.id === 'exact-plane-self-weight')!;
  for (const analysisMode of modes) {
    for (const analysis of histories) {
      const stamp = { ...stampSolve(analysis, null), resultsVersion: weightNotice.resultsVersion - 1 };
      const snapshot: FeatureSnapshot = {
        analysisMode,
        supports: [[1, { nodeId: 1, type: analysisMode === '2d' ? 'fixed' : 'fixed3d' }]],
        loads: [{ type: 'nodal3d', data: { nodeId: 1, fz: -20, caseId: 1 } }],
        loadCases: [{ id: 1, type: 'D' }],
        includeSelfWeight: true,
      };
      expect(assessProject(snapshot, stamp, analysisMode).changes).toEqual([]);
    }
  }
});

it.each(modes)('known wrong result: #2364 %s global-axes notices require saved global axes use', (analysisMode) => {
  const snapshot: FeatureSnapshot = {
    analysisMode,
    elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]],
    supports: [[1, { nodeId: 1, type: analysisMode === '2d' ? 'fixed' : 'fixed3d', dry: 1 }]],
    loads: [{ type: 'thermal', data: { elementId: 1, dtUniform: 1, dtGradient: 0, caseId: 1 } }],
    loadCases: [{ id: 1, type: 'D' }],
    includeSelfWeight: true,
  };
  const marked = { ...snapshot, loadCases: [{ id: 1, type: 'D', axisNamed: true }] };
  vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('test'));
  const markedFeatures = modelFeatures(marked);
  const expected = branchIds.filter(id => id !== 'exact-plane-self-weight');
  for (const analysis of histories) {
    const stamp = { ...stampSolve(analysis, null), resultsVersion: versionBefore };
    const relevant = (project: FeatureSnapshot, evidence?: ReadonlySet<string>) =>
      assessProject(project, stamp, analysisMode, RESULT_CHANGES, evidence).changes.map(c => c.id).filter(id => branchIds.includes(id)).sort();

    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('test'));
    expect(relevant(snapshot)).toEqual([]);
    expect(relevant(marked)).toEqual(expected);
    for (const notice of branchNotices) {
      expect(assessProject(marked, { ...stamp, resultsVersion: notice.resultsVersion }, analysisMode).changes).not.toContainEqual(notice);
    }

    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
    expect(relevant(marked)).toEqual([]);
    expect(relevant({}, markedFeatures)).toEqual([]);
  }
});

it('known wrong result: #2364 a recovered global axes notice stays quiet in production', async () => {
  vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
  const stamp = { ...stampSolve('linear', null), resultsVersion: versionBefore };
  const store = createRecheckStore();
  store.openProject({
    analysisMode: '2d',
    solvedWith: stamp,
    pendingRecheckNotice: { stamp, features: ['plane2D', 'selfWeight', 'axisNamedLoads', 'analysis:linear'] },
  });
  await vi.waitFor(() => expect(store.pending).toBe(false));
  expect(store.assessment?.changes).toEqual([]);
  expect(store.noticeOpen).toBe(false);
  expect(store.stale).toBe(false);
});
