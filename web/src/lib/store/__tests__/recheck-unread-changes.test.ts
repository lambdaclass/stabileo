import { expect, it } from 'vitest';
import { createRecheckStore } from '../recheck.svelte';
import { stampSolve } from '../../provenance/solve-stamp';
import type { FeatureSnapshot } from '../../provenance/model-features';
import { steelTruss } from './recheck-fixtures';

it.each(['2d', '3d', 'pro'])('known wrong result: #1928 an acknowledgement on the same solve stamp cannot hide a newly applicable seismic load warning in %s', async mode => {
  const store = createRecheckStore();
  const solvedWith = { ...stampSolve('linear', null), resultsVersion: 0 };
  const original = { ...(steelTruss() as FeatureSnapshot), solvedWith };
  store.openProject(original, mode);
  await store.retry();
  expect(store.noticeOpen).toBe(true);
  const id = 'seismic-modal-generation-unavailable';
  expect(store.assessment?.changes.some(c => c.id === id)).toBe(false);
  store.acknowledge();
  const changed = {
    ...original, loadCases: [{ id: 1, type: 'E' }],
    loads: [{ type: mode === '2d' ? 'nodal' : 'nodal3d', data: { caseId: 1, generatedBy: 'load-plan' } }],
  };
  store.openProject(changed, mode);
  await store.retry();
  expect(store.assessment?.changes.some(c => c.id === id)).toBe(true);
  expect(store.noticeOpen).toBe(true);
  store.acknowledge();
  store.openProject(changed, mode);
  await store.retry();
  expect(store.noticeOpen).toBe(false);
});
