/**
 * Model findings on constrained models and across result views.
 *
 * A valid model with constraints (a member offset, a sliding joint) carries no
 * warning: the constrained residual used to be measured on the unreduced
 * system, where the constraint forces made it O(1) on every correct solve. And
 * the findings describe the model, so they stay on screen when the view
 * switches to a combination or the envelope.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { initSolver } from '../../engine/wasm-solver';

beforeAll(async () => { await initSolver(); });

const brief = (ds: any[]) => ds.map((d) => `${d.severity}:${d.code}:${d.message}:${JSON.stringify(d.nodeIds ?? null)}`);

/** 3D cantilever along X, fixed at n1, tip load -Z at n2. */
function cantilever3D(offset: 'none' | 'iEnd' | 'parallel') {
  modelStore.clear();
  const n1 = modelStore.addNode(0, 0, 0);
  const n2 = modelStore.addNode(4, 0, 0);
  const e = modelStore.addElement(n1, n2, 'frame');
  modelStore.addSupport(n1, 'fixed3d');
  modelStore.addNodalLoad3D(n2, 0, 0, -10, 0, 0, 0);
  if (offset === 'iEnd') modelStore.setElementOffset(e, { frame: 'global', i: { x: 0, y: 0, z: 0.3 } });
  if (offset === 'parallel') modelStore.setElementOffset(e, { frame: 'global', i: { x: 0, y: 0, z: 0.3 }, j: { x: 0, y: 0, z: 0.3 } });
  return { n1, n2, e };
}

describe('isolated-node gate vs member-offset helper topology', () => {
  it('a 3D cantilever with an offset at its supported end is NOT reported as having an isolated node', () => {
    const { n1, n2 } = cantilever3D('iEnd');
    const r = modelStore.solve3D(false, false, true);
    expect(typeof r).not.toBe('string');
    resultsStore.setResults3D(r as any);
    const ds = resultsStore.structuredDiagnostics3D;
    expect(ds.filter((d) => d.code === 'disconnected_node')).toEqual([]);
    // No diagnostic names a helper node id (all ids must be real model nodes).
    const model = new Set([n1, n2]);
    for (const d of ds) for (const id of d.nodeIds ?? []) expect(model.has(id)).toBe(true);
  });

  it('a valid offset cantilever (parallel offset, same answer as no offset) carries no warning', () => {
    cantilever3D('none');
    const plain = modelStore.solve3D(false, false, true) as any;
    cantilever3D('parallel');
    const off = modelStore.solve3D(false, false, true) as any;
    expect(typeof off).not.toBe('string');
    const tip = (res: any) => res.displacements.find((d: any) => d.nodeId === 2).uz;
    // The offset solve is correct: identical tip deflection to the plain cantilever.
    expect(tip(off)).toBeCloseTo(tip(plain), 8);
    resultsStore.setResults3D(off);
    const warnings = resultsStore.structuredDiagnostics3D.filter((d) => d.severity !== 'info');
    expect(warnings).toEqual([]);
  });

  it('a valid 2D frame with a sliding joint carries no warning', () => {
    modelStore.clear();
    const n1 = modelStore.addNode(0, 0);
    const n2 = modelStore.addNode(2, 0);
    const n3 = modelStore.addNode(4, 0);
    modelStore.addElement(n1, n2, 'frame');
    const e2 = modelStore.addElement(n2, n3, 'frame');
    modelStore.addSupport(n1, 'fixed');
    modelStore.addSupport(n3, 'pinned');
    modelStore.addNodalLoad(n2, 0, -10);
    modelStore.setSlide(e2, 'i', 'x', 'global');
    const r = modelStore.solve(false);
    expect(typeof r).not.toBe('string');
    resultsStore.setResults(r as any);
    const warnings = resultsStore.structuredDiagnostics.filter((d) => d.severity !== 'info');
    expect(warnings).toEqual([]);
  });
});

describe('model diagnostics survive switching to a combination / the envelope', () => {
  /** 2D pin-jointed truss triangle; the engine flags each node (instability_risk). */
  function truss2D() {
    modelStore.clear();
    const n1 = modelStore.addNode(0, 0);
    const n2 = modelStore.addNode(4, 0);
    const n3 = modelStore.addNode(2, 2);
    modelStore.addElement(n1, n2, 'truss');
    modelStore.addElement(n2, n3, 'truss');
    modelStore.addElement(n1, n3, 'truss');
    modelStore.addSupport(n1, 'pinned');
    modelStore.addSupport(n2, 'rollerX');
    modelStore.addNodalLoad(n3, 0, -10, 0, 1); // D
    modelStore.addNodalLoad(n3, 5, 0, 0, 2);   // L
    modelStore.addCombination('1.2D+1.6L', [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }]);
  }

  it('2D: what the gates found on the model is still shown in combo and envelope views', () => {
    truss2D();
    const r = modelStore.solve(false);
    expect(typeof r).not.toBe('string');
    resultsStore.setResults(r as any);
    const combos = modelStore.solveCombinations(false);
    expect(combos && typeof combos !== 'string').toBe(true);
    resultsStore.setCombinationResults((combos as any).perCase, (combos as any).perCombo, (combos as any).envelope);

    const single = resultsStore.structuredDiagnostics;
    expect(single.length).toBeGreaterThan(0);

    resultsStore.activeView = 'combo';
    const inCombo = resultsStore.structuredDiagnostics;
    resultsStore.activeView = 'envelope';
    const inEnv = resultsStore.structuredDiagnostics;
    resultsStore.activeView = 'single';

    expect(brief(inCombo)).toEqual(brief(single));
    expect(brief(inEnv)).toEqual(brief(single));
  });

  it('2D: combinations solved without a single solve keep the findings too', () => {
    // ToolbarAdvanced's "solve combinations" publishes only the combination
    // results: no base solve, so there is no single result to read from.
    truss2D();
    resultsStore.clear();
    const combos = modelStore.solveCombinations(false);
    expect(combos && typeof combos !== 'string').toBe(true);
    resultsStore.setCombinationResults((combos as any).perCase, (combos as any).perCombo, (combos as any).envelope);
    expect(resultsStore.singleResults).toBeNull();

    const first = resultsStore.structuredDiagnostics;
    expect(first.length).toBeGreaterThan(0);
    resultsStore.activeView = 'combo';
    expect(brief(resultsStore.structuredDiagnostics)).toEqual(brief(first));
    resultsStore.activeView = 'envelope';
    expect(brief(resultsStore.structuredDiagnostics)).toEqual(brief(first));
    resultsStore.activeView = 'single';
  });

  it('3D: diagnostics on the single solve are still shown in combo and envelope views', () => {
    // Two cantilevers from one fixed support whose tips end 1 µm apart without
    // being joined: the gates flag the tips as near-duplicate nodes.
    modelStore.clear();
    const n1 = modelStore.addNode(0, 0, 0);
    const n2 = modelStore.addNode(4, 0, 0);
    const n3 = modelStore.addNode(4, 0, 1e-6);
    modelStore.addElement(n1, n2, 'frame');
    modelStore.addElement(n1, n3, 'frame');
    modelStore.addSupport(n1, 'fixed3d');
    modelStore.addNodalLoad3D(n2, 0, 0, -10, 0, 0, 0, 1);
    modelStore.addNodalLoad3D(n2, 0, 5, 0, 0, 0, 0, 2);
    modelStore.addCombination('1.2D+1.6L', [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }]);
    const r = modelStore.solve3D(false, false, true);
    expect(r, typeof r === "string" ? r : "").not.toBeTypeOf("string");
    resultsStore.setResults3D(r as any);
    const combos = modelStore.solveCombinations3D(false, false, true);
    expect(combos && typeof combos !== 'string').toBe(true);
    resultsStore.setCombinationResults3D((combos as any).perCase, (combos as any).perCombo, (combos as any).envelope);

    const single = resultsStore.structuredDiagnostics3D;
    expect(single.length).toBeGreaterThan(0);
    resultsStore.activeView = 'combo';
    const inCombo = resultsStore.structuredDiagnostics3D;
    resultsStore.activeView = 'envelope';
    const inEnv = resultsStore.structuredDiagnostics3D;
    resultsStore.activeView = 'single';
    expect(inCombo.length).toBe(single.length);
    expect(inEnv.length).toBe(single.length);
  });
});
