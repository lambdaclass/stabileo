import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { historyStore, modelStore, resultsStore, uiStore } from '../index';
import { publishCombinations3D } from '../active-results';
import { profileByName, profileToSectionFull } from '../../data/steel-profiles';
import { initSolver } from '../../engine/wasm-solver';
import { runSteelCheck } from '../steel-check';
import { memoriaInput } from '../memoria-inputs';
import { verificationStore } from '../verification.svelte';
import * as kernel from '../../engine/codes/argentina/cirsoc301-kernel';

beforeAll(async () => {
  await initSolver();
  modelStore.clear();
  historyStore.clear();
  resultsStore.clear();
  verificationStore.clear();
  uiStore.analysisMode = 'pro';
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  const profile = profileByName('IPE 300')!;
  const section = modelStore.addSection({ name: profile.name, profileFamily: profile.family, ...profileToSectionFull(profile) } as never);
  const material = modelStore.addMaterial({ name: 'S235', e: 200000, nu: 0.3, rho: 78.5, fy: 250, fu: 400 } as never);
  const nodes = [modelStore.addNode(0, 0, 0), modelStore.addNode(0, 0, 4), modelStore.addNode(6, 0, 4), modelStore.addNode(6, 0, 0)];
  const members = [modelStore.addElement(nodes[0]!, nodes[1]!, 'frame'), modelStore.addElement(nodes[3]!, nodes[2]!, 'frame'), modelStore.addElement(nodes[1]!, nodes[2]!, 'frame')];
  for (const id of members) {
    modelStore.updateElementSection(id, section);
    modelStore.updateElementMaterial(id, material);
  }
  modelStore.addSupport(nodes[0]!, 'fixed3d');
  modelStore.addSupport(nodes[3]!, 'fixed3d');
  const gravity = modelStore.addLoadCase('Gravity', 'D');
  const wind = modelStore.addLoadCase('Wind', 'W');
  modelStore.addDistributedLoad3D(members[2]!, 0, 0, -15, -15, undefined, undefined, gravity);
  modelStore.addNodalLoad3D(nodes[1]!, 5, 0, 0, 0, 0, 0, wind);
  modelStore.addCombination('Gravity', [{ caseId: gravity, factor: 1 }]);
  modelStore.addCombination('Gravity + wind', [{ caseId: gravity, factor: 1 }, { caseId: wind, factor: 1 }]);
  modelStore.addCombination('Gravity - wind', [{ caseId: gravity, factor: 1 }, { caseId: wind, factor: -1 }]);
  const solved = modelStore.solveCombinations3D(false, false, true);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  expect(solved.perCombo.size).toBe(3);
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
it('known wrong result: #2080 the three-member memoria keeps its exact answer while tracing only report governors', () => {
  const checked = vi.spyOn(kernel, 'engineCheckMembers');
  const certified = vi.spyOn(kernel, 'engineCertifyMembers');
  expect(runSteelCheck()).toEqual({ checked: 3 });
  const hash = createHash('sha256').update(JSON.stringify(canonical(verificationStore.steel))).digest('hex');
  expect(hash).toBe('663d1aa94cb5d272598d415d17c7abe7b148ece0ea4d4cba31ab6a79b0aca325');
  expect(certified).toHaveBeenCalledTimes(3);
  const before = checked.mock.calls.length;
  expect(memoriaInput(k => k, 'en').elements).toHaveLength(3);
  expect(checked).toHaveBeenCalledTimes(before);
  const traced = checked.mock.calls.filter(([, , opts]) => opts?.steps !== false);
  expect(traced).toHaveLength(6);
  expect(traced.every(([members]) => members.length <= 8)).toBe(true);
});
