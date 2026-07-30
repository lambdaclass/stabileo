/**
 * PR #78 review fixes — store-layer regression tests.
 *
 *  - stirrup/tie legs and column face bars are clamped to the constructible
 *    range the editors advertise (typed input used to bypass it — a legs=20
 *    typo multiplied shear capacity ~10x and verified green).
 *  - designOne keeps provisionalIds in sync (a member re-designed alone used
 *    to stay flagged provisional after verifying, or never get flagged).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore, resultsStore, verificationStore, historyStore } from '../index';
import { designRunStore } from '../design-run.svelte';
import { setStirrups, setTies, setColumnBars, getReinforcement } from '../rebar-edit';
import qa8 from '../../templates/fixtures/rc-design-qa-8.json';
import { solveCombinations3D, validateAndSolve3D } from '../../engine/solver-service';
import * as wasmSolver from '../../engine/wasm-solver';

beforeAll(async () => {
  await new Promise(r => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

function restoreFixture() {
  modelStore.clear();
  resultsStore.clear();
  verificationStore.clear();
  historyStore.clear();
  designRunStore.resetMarks();
  modelStore.restore({
    nodes: qa8.nodes.map((n: any) => [n.id, n]) as never,
    materials: qa8.materials.map((m: any) => [m.id, m]) as never,
    sections: qa8.sections.map((s: any) => [s.id, s]) as never,
    elements: qa8.elements.map((e: any) => [e.id, e]) as never,
    supports: qa8.supports.map((s: any) => [s.id, s]) as never,
    loads: qa8.loads as never,
    loadCases: qa8.loadCases as never,
    combinations: qa8.combinations as never,
    nextId: { node: 100, material: 10, section: 10, element: 100, support: 10, load: 100 },
  } as never);
}

/** Restore + solve + demands + code check — the app's real design setup path. */
function setupForDesign() {
  restoreFixture();
  const combo = solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, modelStore.model.combinations, true, false);
  if (typeof combo === 'string' || !combo) throw new Error(`solve: ${combo}`);
  const res = validateAndSolve3D(modelStore.model as never, true, false);
  if (typeof res === 'string' || !res) throw new Error(`solve3D: ${res}`);
  resultsStore.setResults3D(res as never);
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  expect(designRunStore.computeDemands().ok).toBe(true);
  expect(designRunStore.runCodeCheck().ok).toBe(true);
}

describe('rebar edit clamps', () => {
  it('setStirrups clamps legs to [2, 6]', () => {
    restoreFixture();
    const id = modelStore.elements.keys().next().value!;
    setStirrups(id, 'stirrupsSpan', { legs: 20 });
    expect(getReinforcement(id)?.regions?.stirrupsSpan?.legs).toBe(6);
    setStirrups(id, 'stirrupsSpan', { legs: 1 });
    expect(getReinforcement(id)?.regions?.stirrupsSpan?.legs).toBe(2);
  });

  it('setTies clamps legs to [2, 6]', () => {
    restoreFixture();
    const id = modelStore.elements.keys().next().value!;
    setTies(id, { legs: 99 });
    expect(getReinforcement(id)?.stirrups?.legs).toBe(6);
    setTies(id, { legs: 0 });
    expect(getReinforcement(id)?.stirrups?.legs).toBe(2);
  });

  it('setColumnBars clamps face bars to the generator/batch limit (6)', () => {
    restoreFixture();
    const id = modelStore.elements.keys().next().value!;
    setColumnBars(id, { nLeft: 9 });
    expect(getReinforcement(id)?.column?.nLeft).toBe(6);
    setColumnBars(id, { nBottom: 99 });
    expect(getReinforcement(id)?.column?.nBottom).toBe(6);
  });
});

describe('designOne provisional sync', () => {
  it('provisionalIds tracks every single-member design outcome', () => {
    setupForDesign();
    const ids = [...verificationStore.contexts.keys()];
    designRunStore.autoDesign(ids);
    for (const id of ids) {
      const o = designRunStore.designOne(id);
      expect(o).not.toBeNull();
      expect(
        designRunStore.provisionalIds.has(id),
        `member ${id}: provisional flag out of sync`,
      ).toBe(o!.outcome !== 'VERIFIED' && !!o!.provisional);
    }
  });
});
