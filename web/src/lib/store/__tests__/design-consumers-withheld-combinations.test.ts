/**
 * Slabs, walls, the steel optimiser, RC design and the active list never design over the
 * unfactored solve while the model defines combinations to design for.
 *
 * After an edit live calc re-solves "All loads" only (`engine/live-calc.ts`), and an empty active
 * list is refused by the combination solve: either way the results on hand are the loads at
 * factor 1 while 1.2D + 1.6W is defined. Footings and joints refused (`design-inputs-unsolved-
 * combinations.test.ts`); slabs designed face by face for the unfactored mx and my, the optimiser
 * sized for the solve on screen as its one combination, RC design said "define at least one
 * combination", and an empty active list (or one naming only an SRSS combination) read the
 * unfactored solve as the design load.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { uiStore } from '../ui.svelte';
import { resultsStore } from '../results.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { profileToSectionFull, PROFILE_FAMILIES } from '../../data/steel-profiles';
import { publishCombinations3D, combinationsUnsolved, activeResultSet3D, designCombinationsWithheld } from '../active-results';
import { collectStresses } from '../detailing-floor-inputs';
import { collectFootingReactions } from '../detailing-footing-inputs';
import { detailingStore } from '../detailing.svelte';
import { designRunStore } from '../design-run.svelte';
import { jointDesignStore } from '../joint-design.svelte';
import { steelOptimise } from '../steel-optimise.svelte';
import { runSteelCheck } from '../steel-check';
import { runMaterialChecks } from '../material-check.svelte';
import { typologyContext } from '../joint-typology';
import { envelopeAt } from '../special-elements';
import { runLiveCalc, runGlobalSolve } from '../../engine/live-calc';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); modelStore.setResultScopes(null); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro';
  uiStore.includeSelfWeight = false;
});
afterEach(() => { uiStore.analysisMode = '3d'; steelOptimise.clearApplied(); });

/**
 * A 6 m × 4 m steel portal in XZ, fixed feet, a footing under one and a slab quad on the beam
 * line: 20 kN/m on the beam in D, 15 kN sideways in W; 1.2D + 1.6W.
 */
function portal() {
  const heavy = PROFILE_FAMILIES.IPE[PROFILE_FAMILIES.IPE.length - 1]!;
  const sid = modelStore.addSection({ name: heavy.name, profileFamily: heavy.family, ...profileToSectionFull(heavy) } as never);
  const mid = modelStore.addMaterial({ name: 'S235', e: 200000, nu: 0.3, rho: 78.5, fy: 250, fu: 400 } as never);
  const n1 = modelStore.addNode(0, 0, 0), n2 = modelStore.addNode(6, 0, 0);
  const n3 = modelStore.addNode(0, 0, 4), n4 = modelStore.addNode(6, 0, 4);
  const c1 = modelStore.addElement(n1, n3, 'frame'), beam = modelStore.addElement(n3, n4, 'frame'), c2 = modelStore.addElement(n2, n4, 'frame');
  for (const id of [c1, beam, c2]) { modelStore.updateElementSection(id, sid); modelStore.updateElementMaterial(id, mid); }
  for (const n of [n1, n2]) modelStore.addSupport(n, 'fixed3d');
  const a = modelStore.addNode(0, 2, 4), b = modelStore.addNode(6, 2, 4);
  modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d');
  const quad = modelStore.addQuad([n3, n4, b, a], mid, 0.2);
  const D = modelStore.model.loadCases[0]!.id;
  const W = modelStore.addLoadCase('W', 'W');
  modelStore.addDistributedLoad3D(beam, 0, 0, -20, -20, undefined, undefined, D);
  modelStore.addNodalLoad3D(n3, 15, 0, 0, 0, 0, 0, W);
  const combo = modelStore.addCombination('1.2D + 1.6W', [{ caseId: D, factor: 1.2 }, { caseId: W, factor: 1.6 }]);
  modelStore.addFooting(n1, 'Z1');
  return { n1, n3, c1, beam, D, combo, quad };
}

/** The full solve Calcular runs: All loads, then the combinations; the single view on screen. */
function solveAll() {
  const all = modelStore.solve3D(false, false, true);
  if (!all || typeof all === 'string') throw new Error(String(all));
  resultsStore.setResults3D(all);
  const b = modelStore.solveCombinations3D(false, false, true);
  if (!b || typeof b === 'string') throw new Error(String(b));
  publishCombinations3D(b);
  resultsStore.activeView = 'single';
}

/** An edit, and live calc re-solves "All loads" only. */
async function editAndLiveCalc(n3: number, D: number) {
  modelStore.addNodalLoad3D(n3, 0, 0, -1, 0, 0, 0, D);
  await runLiveCalc('pro', 'rightHand');
  expect(resultsStore.results3D).not.toBeNull();
  expect(resultsStore.perCombo3D.size).toBe(0);
}

describe('slabs and walls with the combinations unsolved', () => {
  it('read every combination after a full solve', () => {
    const { quad } = portal();
    solveAll();
    expect(collectStresses().find((s) => s.elementId === quad)!.sets).toHaveLength(1);
    expect(detailingStore.floorReadiness.ready).toBe(true);
  });

  it('refuse, with the reason, rather than design over the unfactored mx and my', async () => {
    const { n3, D } = portal();
    solveAll();
    await editAndLiveCalc(n3, D);
    expect(collectStresses()).toEqual([]);
    const ready = detailingStore.floorReadiness;
    expect(ready.ready).toBe(false);
    expect(ready.reasons.map((r) => r.key)).toEqual(['design.error.combinationsUnsolved']);
    // Every caller, not only the panel's disabled command: the slab and wall editors run it too.
    expect(detailingStore.generateFloors({ families: ['slab'] })).toBeNull();
    expect(detailingStore.lastError).toBeTruthy();
    // "Design all" reports the slab family failed with the reason, not the last floor run on hand.
    const slab = designRunStore.designFamilies(['slab']).families.find((f) => f.family === 'slab')!;
    expect(slab).toMatchObject({ state: 'failed', errorKey: 'design.error.combinationsUnsolved' });
  });

  it('a model with no combinations still designs over its one solve', async () => {
    const { combo, quad } = portal();
    modelStore.removeCombination(combo);
    await runLiveCalc('pro', 'rightHand');
    expect(collectStresses().some((s) => s.elementId === quad)).toBe(true);
    expect(detailingStore.floorReadiness.ready).toBe(true);
  });
});

describe('the steel optimiser with the combinations unsolved', () => {
  it('sizes for the combinations after a full solve', () => {
    portal();
    solveAll();
    steelOptimise.run('section');
    expect(steelOptimise.error).toBeNull();
    expect(steelOptimise.rows.length).toBeGreaterThan(0);
  });

  it('refuses, with the reason, rather than size for the solve on screen', async () => {
    const { n3, D } = portal();
    solveAll();
    await editAndLiveCalc(n3, D);
    steelOptimise.run('section');
    expect(steelOptimise.error).toBe('design.error.combinationsUnsolved');
    expect(steelOptimise.rows).toEqual([]);
  });
});

describe('member and connection checks with the combinations unsolved', () => {
  it('refuse the single solve that live calc leaves, after reading the full solve', async () => {
    const { n3, c1, beam, D } = portal();
    solveAll();
    expect(runSteelCheck()).toEqual({ checked: 3 });
    expect(runMaterialChecks()).toEqual({ checked: 0 });
    expect(typologyContext(n3, [c1, beam])).not.toBeNull();
    expect(envelopeAt(c1, 0)).not.toBeNull();

    await editAndLiveCalc(n3, D);
    expect(runSteelCheck()).toEqual({ refused: 'noResults' });
    expect(runMaterialChecks()).toEqual({ refused: 'noResults' });
    expect(typologyContext(n3, [c1, beam])).toBeNull();
    expect(envelopeAt(c1, 0)).toBeNull();
  });
});

describe('RC design with the combinations unsolved', () => {
  it('says they are not solved, not that none is defined', async () => {
    const { n3, D } = portal();
    solveAll();
    await editAndLiveCalc(n3, D);
    expect(designRunStore.computeDemands()).toMatchObject({ ok: false, reasonKey: 'design.error.combinationsUnsolved' });
  });

  it('with no combination defined, still asks for one', async () => {
    const { combo } = portal();
    modelStore.removeCombination(combo);
    await runLiveCalc('pro', 'rightHand');
    expect(designRunStore.computeDemands()).toMatchObject({ ok: false, reasonKey: 'design.error.noCombinations' });
  });
});

describe('an active list with no linear combination, while linear ones are defined', () => {
  it('empty: the combination solve refuses it, and design reads nothing', async () => {
    const { n1, n3, c1, beam } = portal();
    modelStore.setResultScopes({ active: [] });
    await runGlobalSolve();
    expect(resultsStore.results3D).not.toBeNull();
    expect(resultsStore.perCombo3D.size).toBe(0);
    expect(combinationsUnsolved()).toBe(true);
    expect(activeResultSet3D()).toBeNull();
    expect(collectFootingReactions().get(n1)).toBeUndefined();
    expect(jointDesignStore.designFor(n3, [c1, beam]).demands.combinationsConsidered).toBe(0);
    expect(collectStresses()).toEqual([]);
  });

  it('naming only an SRSS one, "All loads" is not the design load while a linear one is defined', () => {
    const { n1, n3, c1, beam, D } = portal();
    const W = modelStore.model.loadCases.find((c) => c.id !== D)!.id;
    const s = modelStore.addCombination('D, W srss', [{ caseId: D, factor: 1 }, { caseId: W, factor: 1 }]);
    modelStore.updateCombination(s, { method: 'srss' });
    modelStore.setResultScopes({ active: [s] });
    solveAll();
    expect(resultsStore.perCombo3D.size).toBeGreaterThan(0);
    expect(activeResultSet3D()).toBeNull();
    expect(collectFootingReactions().get(n1)).toBeUndefined();
    expect(jointDesignStore.designFor(n3, [c1, beam]).demands.combinationsConsidered).toBe(0);
    expect(collectStresses()).toEqual([]);
    // The reason the floor and joint panels give.
    expect(designCombinationsWithheld()).toBe('design.error.noLinearCombination');
  });
});
