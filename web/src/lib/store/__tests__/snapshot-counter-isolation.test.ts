import { expect, it } from 'vitest';
import { modelStore } from '../model.svelte';

it.skip('known wrong result: #1928 a saved snapshot retains its allocation counters when a different project opens', () => {
  modelStore.clear();
  const first = modelStore.addNode(0, 0, 0);
  const footing = modelStore.addFooting(first);
  const saved = modelStore.snapshot();
  const counters = { ...saved.nextId };
  expect(counters.footing).toBeGreaterThan(footing);
  modelStore.clear();
  expect(saved.nextId).toEqual(counters);
  modelStore.restore(saved);
  const second = modelStore.addFooting(modelStore.addNode(1, 0, 0));
  expect(second).not.toBe(footing);
  expect(modelStore.footings.get(footing)?.nodeId).toBe(first);
});
