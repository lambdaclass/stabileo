/**
 * The validation models load, survive the model code both ways, and balance.
 *
 * What is asserted here is what the repository can know about them by itself: that each file
 * parses without an error, that it lands in the store as the structure it describes (its counts,
 * its numbering, its cases), that writing the loaded model back as code and reading it again
 * gives the same model, and that every case solves and its reactions balance its loads in all
 * six components. How their results compare with the source program's is checked outside the
 * repository.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import '../../../store';
import { initSolver, solveBuckling3D } from '../../../engine/wasm-solver';
import * as wasm from '../../../engine/wasm-solver';
import { solveCombinations3D, buildSolverInput3D, caseSolverLoads3D, comboSolverLoads3D } from '../../../engine/solver-service';
import { staticsCheck } from '../../../engine/statics-check';
import { codeToModel, modelToCode } from '../../../model/code/format';
import type { ModelSnapshot } from '../../../store/history.svelte';
import { VALIDATION_MODELS, loadValidationModel, validationModelCode, type ValidationModelId } from '../index';
import { PRO_EXAMPLES } from '../../../data/pro-examples';
import { uiStore } from '../../../store/ui.svelte';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

/** What each model is, as counts: nodes, members, supports, cases, combinations. */
const SHAPE: Record<ValidationModelId, { nodes: number; members: number; supports: number; cases: number; combinations: number }> = {
  'validation-01': { nodes: 1153, members: 552, supports: 25, cases: 2, combinations: 1 },
  'validation-02': { nodes: 56, members: 119, supports: 6, cases: 2, combinations: 1 },
  'validation-03': { nodes: 230, members: 97, supports: 38, cases: 1, combinations: 0 },
  'validation-04': { nodes: 1149, members: 2482, supports: 56, cases: 22, combinations: 14 },
  'validation-05': { nodes: 150, members: 450, supports: 6, cases: 3, combinations: 2 },
  'validation-06': { nodes: 18, members: 25, supports: 3, cases: 3, combinations: 0 },
  'validation-07': { nodes: 40, members: 76, supports: 8, cases: 2, combinations: 1 },
};

const md = () => ({
  nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
  loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
  plates: modelStore.plates, quads: modelStore.quads, constraints: modelStore.model.constraints,
  analysis: modelStore.analysis, groups: modelStore.model.groups,
});

const ids = Object.keys(VALIDATION_MODELS) as ValidationModelId[];

/**
 * Check every linear case using one combination per case. The hangar's own
 * second-order combinations are checked separately below.
 */
async function statics(id: ValidationModelId) {
  await loadValidationModel(id);
  const cases = modelStore.model.loadCases;
  const combinations = cases.map((c, i) => ({ id: 100000 + i, name: c.name, factors: [{ caseId: c.id, factor: 1 }] }));
  const single = vi.spyOn(wasm, 'solve3D');
  let r;
  try {
    r = solveCombinations3D({ ...md(), analysis: { ...modelStore.analysis, perCombination: undefined } } as never, cases, combinations as never, true, false);
    // Duplicate case names used to reject the shared factorization and solve all 22 separately.
    if (id === 'validation-04') expect(single).not.toHaveBeenCalled();
  } finally { single.mockRestore(); }
  if (!r || typeof r === 'string') throw new Error(`${id}: ${String(r)}`);
  const rows = staticsCheck({
    model: md() as never,
    reactionsByCase: new Map(cases.map((c) => [c.id, r.perCase.get(c.id)!.reactions])),
    includeSelfWeight: true,
    caseNames: new Map(cases.map((c) => [c.id, c.name])),
    caseTypes: new Map(cases.map((c) => [c.id, c.type])),
  } as never);
  expect(rows).toHaveLength(cases.length);
  return rows;
}

describe.each(ids)('%s', (id) => {
  it('parses without an error', async () => {
    const r = codeToModel(await validationModelCode(id));
    expect(r.errors).toEqual([]);
    expect(r.snapshot).toBeTruthy();
  });

  it('loads as the structure it describes, numbered from 1', async () => {
    await loadValidationModel(id);
    const s = SHAPE[id];
    expect(modelStore.nodes.size).toBe(s.nodes);
    expect(modelStore.elements.size).toBe(s.members);
    expect(modelStore.supports.size).toBe(s.supports);
    expect(modelStore.model.loadCases.length).toBe(s.cases);
    expect(new Set(modelStore.model.loadCases.map((c) => c.name)).size).toBe(s.cases);
    expect(modelStore.combinations.length).toBe(s.combinations);
    // The source's numbering is kept: the store holds exactly the ids the file states.
    const code = codeToModel(await validationModelCode(id)).snapshot as unknown as { nodes: Array<[number, unknown]>; elements: Array<[number, unknown]> };
    const sorted = (xs: Iterable<number>) => [...xs].sort((a, b) => a - b);
    expect(sorted(modelStore.nodes.keys())).toEqual(sorted(code.nodes.map(([k]) => k)));
    expect(sorted(modelStore.elements.keys())).toEqual(sorted(code.elements.map(([k]) => k)));
    // Z up: nothing lies below the supports.
    const zMin = Math.min(...[...modelStore.nodes.values()].map((n) => n.z ?? 0));
    const zSup = Math.min(...[...modelStore.supports.values()].map((sp) => modelStore.nodes.get(sp.nodeId)!.z ?? 0));
    expect(zMin).toBe(zSup);
  });

  it('writes back as the same model', async () => {
    await loadValidationModel(id);
    const once = modelToCode(modelStore.snapshot());
    const again = codeToModel(once);
    expect(again.errors).toEqual([]);
    expect(modelToCode(again.snapshot! as ModelSnapshot)).toBe(once);
  });

  it('balances every case in six components', async () => {
    for (const row of await statics(id)) {
      expect(row.uncovered, `${row.caseName}: every load kind is accounted for`).toEqual([]);
      expect(row.worstRelative, `${row.caseName} balances`).toBeLessThan(1e-9);
    }
  }, 60_000); // Large WASM fixtures can exceed the default timeout under concurrent CI load.
});

describe('the "Validation models" group of the PRO examples', () => {
  it('has one card per model, in id order, and each loads its own model as it is', async () => {
    const cards = PRO_EXAMPLES.filter((e) => e.group === 'validation');
    expect(cards.map((e) => e.nameKey)).toEqual(ids.map((id) => `ex.${id}`));
    uiStore.analysisMode = 'pro';
    try {
      for (const [k, card] of cards.entries()) {
        await card.load();
        expect(modelStore.elements.size, card.nameKey).toBe(SHAPE[ids[k]!].members);
        // No regulation combinations are generated over the model's own.
        expect(modelStore.combinations.length, card.nameKey).toBe(SHAPE[ids[k]!].combinations);
        // The stated self-weight rule is the model's, not one a migration invented.
        const code = codeToModel(await validationModelCode(ids[k]!)).snapshot!;
        expect(modelStore.analysis?.selfWeight).toEqual((code as { analysis?: { selfWeight?: unknown } }).analysis?.selfWeight);
      }
    } finally {
      uiStore.analysisMode = '3d';
    }
  });
});

it('loading a validation card restores the previous model with one undo, and supports redo', async () => {
  modelStore.addNode(123, 4, 5);
  const before = modelStore.snapshot();
  historyStore.clear();
  await loadValidationModel('validation-06');
  const loaded = modelStore.snapshot();
  expect(historyStore.undoCount).toBe(1);
  historyStore.undo();
  expect(modelStore.snapshot().nodes).toEqual(before.nodes);
  expect(modelStore.snapshot().elements).toEqual(before.elements);
  expect(modelStore.analysis).toEqual(before.analysis);
  historyStore.redo();
  expect(modelStore.snapshot().nodes).toEqual(loaded.nodes);
  expect(modelStore.snapshot().elements).toEqual(loaded.elements);
  expect(modelStore.analysis).toEqual(loaded.analysis);
});

/**
 * 04's own combinations go to second order (`analysis.perCombination: 'pdelta'`). The engine's 3D
 * P-Delta used to build dense matrices, about 360 MB each for this model, and ran the WASM heap
 * out after minutes; it assembles them sparse now, and the fourteen take seconds.
 *
 * Ten of them do not reach a second-order equilibrium: the model, as it stands, buckles below
 * their load, sideways in a top chord. They publish no forces and are listed. What is asserted is
 * that the P-Delta and the buckling analysis say the same thing, combination by combination:
 * stable exactly where the first buckling factor is above one. Whether the chord should be that free is a question for the
 * comparison of displacements, not for statics.
 */
describe('validation-04 with its own combinations', () => {
  it('is stable to second order exactly where it does not buckle', async () => {
    await loadValidationModel('validation-04');
    expect(modelStore.analysis?.perCombination).toBe('pdelta');
    const cases = modelStore.model.loadCases;
    const r = solveCombinations3D(md() as never, cases, modelStore.combinations, true, false);
    if (!r || typeof r === 'string') throw new Error(String(r));
    // The unstable ones publish no forces and are listed instead.
    expect(r.perCombo.size + (r.unstable?.length ?? 0)).toBe(SHAPE['validation-04'].combinations);
    const base = buildSolverInput3D({ ...md(), loads: [] } as never, false, false)!;
    const caseLoads = caseSolverLoads3D(md() as never, cases, true, false);
    let stable = 0;
    for (const combo of modelStore.combinations) {
      const lambda = (solveBuckling3D({ ...base, loads: comboSolverLoads3D(combo, caseLoads) }, 1) as { modes: Array<{ loadFactor: number }> }).modes[0]!.loadFactor;
      const res = r.perCombo.get(combo.id);
      expect(!!res, `${combo.name}: λ = ${lambda.toFixed(3)}`).toBe(lambda > 1);
      if (!res) { expect(r.unstable).toContain(combo.id); continue; }
      stable++;
      const so = res.secondOrder!;
      expect(so.converged && so.stable).toBe(true);
      expect(so.b2).toBeGreaterThan(1);
      expect(so.b2).toBeLessThan(1 / (1 - 1 / lambda));
    }
    expect(stable).toBe(4);
  }, 300_000);
});
