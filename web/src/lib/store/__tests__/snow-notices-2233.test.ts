import { expect, it } from 'vitest';
import { createRecheckStore } from '../recheck.svelte';
import { assessProject } from '../../provenance/applicability';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import { modelFeatures, type FeatureSnapshot } from '../../provenance/model-features';
import type { SolveStamp } from '../../provenance/solve-stamp';

const ids = ['snow-combination-validation', 'snow-companion-basis', 'snow-pair-coverage'];
const notices = (changes: Array<{ id: string }>) => changes.map(c => c.id).filter(id => ids.includes(id)).sort();
const current = RESULT_CHANGES.currentResultsVersion;

for (const mode of ['2d', '3d', 'pro']) for (const generated of [false, true]) {
  const snapshot: FeatureSnapshot = {
    analysisMode: mode,
    loadCases: [{ id: 1, type: 'S' }],
    loads: [{ type: mode === '2d' ? 'distributed' : 'distributed3d', data: { caseId: 1, elementId: 1, memberLoadsVersion: current, ...(generated ? { generatedBy: 'load-plan' } : {}) } }],
    combinations: [{ id: 1, name: 'Saved CIRSOC companion', factors: [{ caseId: 1, factor: 0.5 }] }],
  };

  it(`known wrong result: #2233 snow notices survive re-solving and reopening ${mode} generated=${generated}`, async () => {
    expect(modelFeatures(snapshot).has('generatedLoads')).toBe(generated);
    const store = createRecheckStore();
    let saved = { ...snapshot, solvedWith: { ...store.capture()!, resultsVersion: 0 } };
    for (const analysis of ['linear', 'pdelta', 'plastic'] as const) {
      store.openProject(saved, mode);
      await store.retry();
      expect(notices(store.assessment!.changes)).toEqual(ids);
      expect(store.noticeOpen).toBe(true);
      store.acknowledge();
      store.noteSolved(analysis);
      saved = { ...snapshot, solvedWith: store.capture()! };
      store.reset();
      store.openProject(JSON.parse(JSON.stringify(saved)), mode);
      await store.retry();
      expect(notices(store.assessment!.changes)).toEqual(ids);
      expect(store.noticeOpen).toBe(true);
      store.reset();
    }
    store.openProject({ ...saved, designData: { loadBasis: { resultsVersion: current } } }, mode);
    await store.retry();
    expect(notices(store.assessment!.changes)).toEqual([]);
    expect(store.noticeOpen).toBe(false);
  });

  it(`known wrong result: #2233 snow notice load-basis boundaries ${mode} generated=${generated}`, () => {
    const stamp = { resultsVersion: current, analyses: ['linear'] } as SolveStamp;
    for (const id of ids) {
      const version = RESULT_CHANGES.changes.find(c => c.id === id)!.resultsVersion;
      for (const basis of [undefined, version - 1, version, version + 1]) {
        const input = { ...snapshot, ...(basis === undefined ? {} : { designData: { loadBasis: { resultsVersion: basis } } }) };
        expect(notices(assessProject(input, stamp, mode).changes).includes(id)).toBe(basis === undefined || basis < version);
      }
    }
    const noSnow = { ...snapshot, loadCases: [{ id: 1, type: 'D' }] };
    expect(notices(assessProject(noSnow, stamp, mode).changes)).toEqual([]);
    expect(notices(assessProject(noSnow, null, mode).changes)).toEqual([]);
    expect(notices(assessProject(snapshot, null, mode).changes)).toEqual(ids);
  });
}
