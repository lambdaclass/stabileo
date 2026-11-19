import { expect, it } from 'vitest';
import { createRecheckStore } from '../recheck.svelte';
import type { FeatureSnapshot } from '../../provenance/model-features';

const refusesModal = process.env.RUN_KNOWN_WRONG === '2319' ? it : it.skip;
const id = 'seismic-modal-generation-unavailable';

for (const mode of ['2d', '3d', 'pro']) {
  refusesModal(`known wrong result: #2319 opening ${mode} flags saved modal seismic loads after a new solve`, async () => {
    const store = createRecheckStore();
    const snapshot: FeatureSnapshot = {
      analysisMode: mode,
      loadCases: [{ id: 1, type: 'E' }],
      loads: [{ type: mode === '2d' ? 'nodal' : 'nodal3d', data: { caseId: 1, generatedBy: 'load-plan' } }],
      designData: { loadBasis: { resultsVersion: 0, derivation: [{ key: 'loadPlan.derivation.modal' }] } },
    };
    for (const analysis of ['linear', 'pdelta', 'plastic'] as const) {
      store.noteSolved(analysis);
      const saved = JSON.parse(JSON.stringify({ ...snapshot, solvedWith: store.capture() }));
      store.reset();
      store.openProject(saved, mode);
      await store.retry();
      expect(store.assessment?.changes.find(change => change.id === id)?.requiresLoadRegeneration).toBe(true);
      expect(store.noticeOpen).toBe(true);
    }
  });
}
