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
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import '../../../store';
import { initSolver } from '../../../engine/wasm-solver';
import { solveCombinations3D } from '../../../engine/solver-service';
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
  'validation-02': { nodes: 56, members: 119, supports: 6, cases: 2, combinations: 1 },
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
    expect(modelStore.combinations.length).toBe(s.combinations);
    // The source's numbering is kept: ids run from 1 with no gaps.
    expect([...modelStore.nodes.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: s.nodes }, (_, i) => i + 1));
    expect([...modelStore.elements.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: s.members }, (_, i) => i + 1));
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
    await loadValidationModel(id);
    const cases = modelStore.model.loadCases;
    // A model with no combinations of its own is solved case by case through one combination per
    // case; the combinations are not what is checked here, the cases are.
    const combinations = modelStore.combinations.length
      ? modelStore.combinations
      : cases.map((c, i) => ({ id: 1000 + i, name: c.name, factors: [{ caseId: c.id, factor: 1 }] }));
    const r = solveCombinations3D(md() as never, cases, combinations as never, true, false);
    if (!r || typeof r === 'string') throw new Error(`${id}: ${String(r)}`);
    const rows = staticsCheck({
      model: md() as never,
      reactionsByCase: new Map(cases.map((c) => [c.id, r.perCase.get(c.id)!.reactions])),
      includeSelfWeight: true,
      caseNames: new Map(cases.map((c) => [c.id, c.name])),
      caseTypes: new Map(cases.map((c) => [c.id, c.type])),
    } as never);
    expect(rows).toHaveLength(cases.length);
    for (const row of rows) {
      expect(row.uncovered, `${row.caseName}: every load kind is accounted for`).toEqual([]);
      expect(row.worstRelative, `${row.caseName} balances`).toBeLessThan(1e-9);
    }
  });
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

