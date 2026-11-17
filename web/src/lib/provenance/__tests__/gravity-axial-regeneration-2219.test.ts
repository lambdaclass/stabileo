import { expect, it, vi } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import type { FeatureSnapshot } from '../model-features';
import { concernsLoadBasis } from '../registry';
import { stampSolve } from '../solve-stamp';
import { createRecheckStore } from '../../store/recheck.svelte';

const regression = process.env.RUN_KNOWN_WRONG === '2219' ? it : it.skip;
const change = RESULT_CHANGES.changes.find(c => c.id === 'gravity-axial-density-frames')!;
const current = RESULT_CHANGES.currentResultsVersion;
const model = (origin: string, version?: number): FeatureSnapshot => ({
  elements: [[1, { id: 1, type: 'frame', materialId: 1, nodeI: 1, nodeJ: 2 }]],
  loads: [{ type: 'distributed3d', data: {
    elementId: 1, frame: 'global', moments: { x: [1, 1, 1], y: [0, 0, 0], z: [0, 0, 0] },
    ...(origin === 'manual' ? { memberLoadsVersion: version }
      : origin === 'generated' ? { generatedBy: 'load-plan' }
        : origin === 'linked-floor' ? { fromDef: 7, floorLoadsVersion: version } : { floorLoadsVersion: version }),
  } }],
  ...(origin === 'generated' ? { designData: { loadBasis: { resultsVersion: version } } } : {}),
});

for (const mode of ['2d', '3d', 'pro']) for (const analysis of ['linear', 'pdelta', 'nonlinear'] as const) for (const origin of ['generated', 'linked-floor', 'unlinked-floor', 'manual']) {
  regression(`known wrong result: #2219 axial density notice survives ${mode}/${analysis}/${origin} until regeneration`, async () => {
    const affected = mode !== '2d';
    const stamp = stampSolve(analysis, null);
    for (const version of [undefined, 0, change.resultsVersion - 1, change.resultsVersion, change.resultsVersion + 1]) {
      const snapshot = model(origin, version);
      const expected = affected && (version === undefined || version < change.resultsVersion);
      const ids = assessProject(snapshot, stamp, mode).changes.map(c => c.id);
      expect.soft(ids.includes(change.id), `assessment version=${version}`).toBe(expected);
      const store = createRecheckStore();
      store.openProject({ ...snapshot, solvedWith: stamp }, mode);
      await vi.waitFor(() => expect(store.pending).toBe(false));
      expect.soft(store.assessment?.changes.some(c => c.id === change.id), `open version=${version}`).toBe(expected);
      if (expected) {
        expect(store.noticeOpen).toBe(true);
        store.acknowledge();
        store.noteSolved(analysis);
        store.noteSolved('linear');
        const reopened = createRecheckStore();
        reopened.openProject({ ...snapshot, solvedWith: store.capture(), pendingRecheckNotice: store.captureNotice() }, mode);
        await vi.waitFor(() => expect(reopened.pending).toBe(false));
        expect.soft(reopened.assessment?.changes.map(c => c.id), `reopen version=${version}`).toContain(change.id);
        expect(reopened.noticeOpen).toBe(true);
      }
    }
  });
}

regression('known wrong result: #2219 axial density regeneration checks every load origin independently', () => {
  expect(concernsLoadBasis(change)).toBe(true);
  const ids = (s: FeatureSnapshot) => assessProject(s, stampSolve('linear', null), 'pro').changes.map(c => c.id);
  for (const stale of ['generated', 'linked-floor', 'unlinked-floor', 'manual']) {
    const fresh = model('generated', current);
    fresh.loads = ['generated', 'linked-floor', 'unlinked-floor', 'manual'].flatMap(origin => model(origin, current).loads!);
    expect(ids(fresh)).not.toContain(change.id);
    const old = model(stale, change.resultsVersion - 1);
    fresh.loads.push(...old.loads!);
    if (stale === 'generated') fresh.designData = old.designData;
    expect(ids(fresh)).toContain(change.id);
    fresh.loads.pop();
    fresh.designData = model('generated', current).designData;
    expect(ids(fresh)).not.toContain(change.id);
  }
});
