import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { modelStore, resultsStore, uiStore } from '../index';
import { publishCombinations3D } from '../active-results';
import { PRO_EXAMPLES } from '../../data/pro-examples';
import { runSteelCheck } from '../steel-check';
import { memoriaInput } from '../memoria-inputs';
import { verificationStore } from '../verification.svelte';
import * as kernel from '../../engine/codes/argentina/cirsoc301-kernel';

beforeAll(async () => {
  uiStore.analysisMode = 'pro';
  await PRO_EXAMPLES.find(e => e.id === '3d-nave-industrial')!.load();
  const solved = modelStore.solveCombinations3D(uiStore.includeSelfWeight, false, true);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  resultsStore.setResults3D([...solved.perCase.values()][0]!);
  publishCombinations3D(solved);
});
afterEach(() => vi.restoreAllMocks());
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => [key, canonical(v)]));
  return value;
}
it('known wrong result: #2080 the memoria shed keeps its exact answer while tracing only report governors', () => {
  const checked = vi.spyOn(kernel, 'engineCheckMembers');
  const certified = vi.spyOn(kernel, 'engineCertifyMembers');
  expect(runSteelCheck()).toEqual({ checked: 571 });
  const hash = createHash('sha256').update(JSON.stringify(canonical(verificationStore.steel))).digest('hex');
  expect(hash).toBe('30be47d0bb7a10682b6a978c07794e236171bdea262bbb748dc130c6be9b3722');
  expect(certified).toHaveBeenCalledTimes(571);
  const before = checked.mock.calls.length;
  expect(memoriaInput(k => k, 'en').elements.length).toBeGreaterThan(0);
  expect(checked).toHaveBeenCalledTimes(before);
  expect(checked.mock.calls.filter(([, , opts]) => opts?.steps !== false).every(([members]) => members.length <= 8)).toBe(true);
});
