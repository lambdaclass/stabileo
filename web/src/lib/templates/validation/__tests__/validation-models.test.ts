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
  'validation-01': { nodes: 1153, members: 552, supports: 25, cases: 2, combinations: 1 },
  'validation-02': { nodes: 56, members: 119, supports: 6, cases: 2, combinations: 1 },
  'validation-03': { nodes: 230, members: 97, supports: 38, cases: 1, combinations: 0 },
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

/** Models with shells, and the moment components the engine's drilling penalty leaves exact. */
const SHELL_DRILLING = new Map<ValidationModelId, { balanced: Array<'mx' | 'my' | 'mz'> }>([
  // Slabs normal to Z and core walls normal to X and to Y: every moment is touched.
  ['validation-01', { balanced: [] }],
  // Walls in planes x = constant: the normal is X.
  ['validation-03', { balanced: ['my', 'mz'] }],
]);

/** Every case solved (through one combination per case when the model has none) and checked. */
async function statics(id: ValidationModelId) {
  await loadValidationModel(id);
  const cases = modelStore.model.loadCases;
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
  return rows;
}

/** The force and moment scales of a row, the way the check itself scales its differences. */
function scales(row: { applied: Record<string, number>; reactions: Record<string, number> }) {
  const f = Math.max(1e-9, ...(['fx', 'fy', 'fz'] as const).map((k) => Math.abs(row.applied[k]!)));
  const m = Math.max(1e-9, ...(['mx', 'my', 'mz'] as const).map((k) => Math.abs(row.applied[k]!)));
  return { f, m };
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
    for (const row of await statics(id)) {
      expect(row.uncovered, `${row.caseName}: every load kind is accounted for`).toEqual([]);
      if (SHELL_DRILLING.has(id)) {
        // Forces, and the moments about the in-plane axes of the shells, balance exactly; the
        // moment about the shells' normal is short by the engine's drilling penalty (M14, pinned
        // below). What is asserted is everything that defect does not touch.
        const d = row.difference, sc = scales(row);
        for (const k of ['fx', 'fy', 'fz'] as const) expect(Math.abs(d[k]) / sc.f, `${row.caseName} ${k}`).toBeLessThan(1e-9);
        for (const k of SHELL_DRILLING.get(id)!.balanced) expect(Math.abs(d[k]) / sc.m, `${row.caseName} ${k}`).toBeLessThan(1e-9);
      } else {
        expect(row.worstRelative, `${row.caseName} balances`).toBeLessThan(1e-9);
      }
    }
  });
});

/**
 * M14 in the engine's pending list: the quad's drilling stabilisation stiffens the rotation about
 * the shell normal with α·Nᵢ·Nⱼ alone, uncoupled from the in-plane translations, so a rigid
 * rotation about the normal meets a restoring moment. The element acts as a weak spring to ground
 * about its normal, and the reactions come short of the loads by that moment: 7·10⁻⁷ of it on the
 * walls of model 03. Fixing the engine makes these pass, and then they and SHELL_DRILLING go.
 */
describe.each([...SHELL_DRILLING.keys()])('%s, about the shells\' normals (engine defect M14)', (id) => {
  it.fails('balances every moment too', async () => {
    for (const row of await statics(id)) expect(row.worstRelative).toBeLessThan(1e-9);
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

