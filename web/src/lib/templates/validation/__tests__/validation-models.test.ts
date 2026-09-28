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
import { initSolver, solveBuckling3D } from '../../../engine/wasm-solver';
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

/** Models with shells, and the moment components the engine's drilling penalty leaves exact. */
const SHELL_DRILLING = new Map<ValidationModelId, { balanced: Array<'mx' | 'my' | 'mz'> }>([
  // Slabs normal to Z and core walls normal to X and to Y: every moment is touched.
  ['validation-01', { balanced: [] }],
  // Walls in planes x = constant: the normal is X.
  ['validation-03', { balanced: ['my', 'mz'] }],
]);

/**
 * Every case solved and checked. The cases are what is checked, so the solve goes through one
 * combination per case rather than the model's own: a model whose combinations are solved with
 * P-Delta (04) would otherwise spend its time on them. They have a test of their own below.
 */
async function statics(id: ValidationModelId) {
  await loadValidationModel(id);
  const cases = modelStore.model.loadCases;
  const combinations = cases.map((c, i) => ({ id: 100000 + i, name: c.name, factors: [{ caseId: c.id, factor: 1 }] }));
  const r = solveCombinations3D({ ...md(), analysis: { ...modelStore.analysis, perCombination: undefined } } as never, cases, combinations as never, true, false);
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
function scales(row: { applied: Record<'fx' | 'fy' | 'fz' | 'mx' | 'my' | 'mz', number> }) {
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


/**
 * 04's own combinations go to second order (`analysis.perCombination: 'pdelta'`). The engine's 3D
 * P-Delta used to build dense matrices, about 360 MB each for this model, and ran the WASM heap
 * out after minutes; it assembles them sparse now, and the fourteen take seconds.
 *
 * Ten of them do not reach a second-order equilibrium: the model, as it stands, buckles below
 * their load, sideways in a top chord. What is asserted is that the P-Delta and the buckling
 * analysis say the same thing, combination by combination: stable exactly where the first
 * buckling factor is above one. Whether the chord should be that free is a question for the
 * comparison of displacements, not for statics.
 */
describe('validation-04 with its own combinations', () => {
  it('is stable to second order exactly where it does not buckle', async () => {
    await loadValidationModel('validation-04');
    expect(modelStore.analysis?.perCombination).toBe('pdelta');
    const cases = modelStore.model.loadCases;
    const r = solveCombinations3D(md() as never, cases, modelStore.combinations, true, false);
    if (!r || typeof r === 'string') throw new Error(String(r));
    expect(r.perCombo.size).toBe(SHAPE['validation-04'].combinations);
    const base = buildSolverInput3D({ ...md(), loads: [] } as never, false, false)!;
    const caseLoads = caseSolverLoads3D(md() as never, cases, true, false);
    let stable = 0;
    for (const combo of modelStore.combinations) {
      const so = r.perCombo.get(combo.id)!.secondOrder!;
      const lambda = (solveBuckling3D({ ...base, loads: comboSolverLoads3D(combo, caseLoads) }, 1) as { modes: Array<{ loadFactor: number }> }).modes[0]!.loadFactor;
      expect(so.stable, `${combo.name}: λ = ${lambda.toFixed(3)}`).toBe(lambda > 1);
      if (so.stable) {
        stable++;
        expect(so.converged).toBe(true);
        expect(so.b2).toBeGreaterThan(1);
        expect(so.b2).toBeLessThan(1 / (1 - 1 / lambda));
      }
    }
    expect(stable).toBe(4);
  }, 300_000);
});
