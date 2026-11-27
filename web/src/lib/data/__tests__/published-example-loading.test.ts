import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { initSolver } from '../../engine/wasm-solver';
import { modelStore } from '../../store';
import { exampleProgress } from '../../store/example-progress.svelte';
import { PRO_EXAMPLES } from '../pro-examples';

beforeAll(async () => { await initSolver(); });
afterEach(() => { vi.restoreAllMocks(); modelStore.clear(); });

it.skip.each(['rc-qa-diagnostic', 'pro-rc-frame-area-loads'])('known wrong result: #1928 the published %s opens its model without starting generated-gallery progress', async id => {
  const example = PRO_EXAMPLES.find(ex => ex.id === id)!;
  const begin = vi.spyOn(exampleProgress, 'begin');
  const step = vi.spyOn(exampleProgress, 'step');
  await example.load();
  expect(modelStore.nodes.size).toBeGreaterThan(0);
  expect(modelStore.model.loadCases.length).toBeGreaterThan(0);
  expect(begin).not.toHaveBeenCalled();
  expect(step).not.toHaveBeenCalled();
});
