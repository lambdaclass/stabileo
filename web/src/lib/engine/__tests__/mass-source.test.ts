/**
 * The mass source, checked against the engine that consumes it.
 *
 * The strongest assertion here is the cross-check: the mass the report claims and the mass the
 * modal analysis actually integrates must be the same number. The report computes it from the
 * loads; the engine computes it from the densities the transform wrote. If the two agree, the
 * transform put every tonne where it said it did.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { buildSolverInput3D } from '../solver-service';
import * as wasmSolver from '../wasm-solver';
import { solveModal3D } from '../wasm-solver';
import { G } from '../dynamics/requests';
import { resolveMassFactors, CODE_DEFAULT_FACTORS } from '../dynamics/mass-source';
import { withMassSource } from '../dynamics/mass-source-model';

beforeAll(async () => {
  await new Promise(r => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const H = 3, L = 4;
const COL_I = 0.3 * 0.3 ** 3 / 12;
const CASES = [
  { id: 1, type: 'D', name: 'D' }, { id: 2, type: 'L', name: 'L' }, { id: 3, type: 'W', name: 'W' },
];

/** Portal along X with a girder and, optionally, a 4 × 4 m slab behind it on two more columns. */
function frame(opts: { slab?: boolean } = {}) {
  modelStore.clear();
  modelStore.restore({
    nodes: [
      [1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: H }],
      [3, { id: 3, x: L, y: 0, z: H }], [4, { id: 4, x: L, y: 0, z: 0 }],
      ...(opts.slab ? [
        [5, { id: 5, x: 0, y: L, z: 0 }], [6, { id: 6, x: 0, y: L, z: H }],
        [7, { id: 7, x: L, y: L, z: H }], [8, { id: 8, x: L, y: L, z: 0 }],
      ] : []),
    ],
    materials: [
      [1, { id: 1, name: 'H-30', e: 30000, nu: 0.2, rho: 24 }],
    ],
    sections: [
      [1, { id: 1, name: 'c', a: 0.09, iz: COL_I, iy: COL_I, j: 2 * COL_I }],
      [2, { id: 2, name: 'v', a: 0.2 * 0.4, iz: 0.2 * 0.4 ** 3 / 12, iy: 0.4 * 0.2 ** 3 / 12, j: 1e-3 }],
    ],
    elements: [
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
      [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 2 }],
      [3, { id: 3, type: 'frame', nodeI: 4, nodeJ: 3, materialId: 1, sectionId: 1 }],
      ...(opts.slab ? [
        [4, { id: 4, type: 'frame', nodeI: 5, nodeJ: 6, materialId: 1, sectionId: 1 }],
        [5, { id: 5, type: 'frame', nodeI: 8, nodeJ: 7, materialId: 1, sectionId: 1 }],
      ] : []),
    ],
    supports: [
      [1, { id: 1, nodeId: 1, type: 'fixed3d' }], [2, { id: 2, nodeId: 4, type: 'fixed3d' }],
      ...(opts.slab ? [[3, { id: 3, nodeId: 5, type: 'fixed3d' }], [4, { id: 4, nodeId: 8, type: 'fixed3d' }]] : []),
    ],
    loads: [], loadCases: CASES, combinations: [],
    nextId: { node: 20, material: 10, section: 10, element: 20, support: 10, load: 1 },
  } as never);
  if (opts.slab) modelStore.addQuad([2, 3, 7, 6], 1, 0.15);
}

function run(opts: { selfWeightLoads?: boolean } = {}) {
  const md = {
    nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
    loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
    quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints,
    connectors: modelStore.connectors,
  };
  const input = buildSolverInput3D(md as never, opts.selfWeightLoads ?? false, false, { expandMemberOffsets: false })!;
  const ms = withMassSource(md as never, modelStore.model.loadCases, modelStore.model.massSource, input);
  const modal = solveModal3D(ms.input as never, ms.densities, 4);
  return { ...ms, modal };
}

/** Self-weight of the portal, t. */
const PORTAL_SELF_T = 24 * (2 * 0.09 * H + 0.08 * L) / G;

describe('resolveMassFactors', () => {
  it('uses the code defaults when nothing is stated, and says so', () => {
    const r = resolveMassFactors(CASES);
    expect(r.map(f => [f.factor, f.basis])).toEqual([
      [CODE_DEFAULT_FACTORS.D, 'codeDefault'], [CODE_DEFAULT_FACTORS.L, 'codeDefault'], [0, 'notMass'],
    ]);
  });

  it('prefers what the project states', () => {
    const r = resolveMassFactors(CASES, { factors: [{ caseId: 2, factor: 0.5 }, { caseId: 3, factor: 0 }] });
    expect(r.map(f => [f.factor, f.basis])).toEqual([[1, 'codeDefault'], [0.5, 'stated'], [0, 'stated']]);
  });
});

describe('the mass reaches the engine', () => {
  it('counts self-weight alone when no case carries load', () => {
    frame();
    const { report, modal } = run();
    expect(report.totalT).toBeCloseTo(PORTAL_SELF_T, 6);
    expect(modal.totalMass).toBeCloseTo(report.totalT, 6);
  });

  it('adds each case × its factor, and the engine integrates exactly that', () => {
    frame();
    modelStore.addDistributedLoad3D(2, 0, 0, -10, -10, undefined, undefined, 1);   // D: 40 kN
    modelStore.addDistributedLoad3D(2, 0, 0, -5, -5, undefined, undefined, 2);     // L: 20 kN × 0.25
    modelStore.addDistributedLoad3D(2, 0, 0, -100, -100, undefined, undefined, 3); // W: not mass
    const { report, modal } = run();
    expect(report.addedT.get(1)).toBeCloseTo(40 / G, 6);
    expect(report.addedT.get(2)).toBeCloseTo(0.25 * 20 / G, 6);
    expect(report.addedT.has(3)).toBe(false);
    expect(report.totalT).toBeCloseTo(PORTAL_SELF_T + 45 / G, 6);
    expect(modal.totalMass).toBeCloseTo(report.totalT, 6);
  });

  it('does not count self-weight twice when the self-weight switch puts it in the loads', () => {
    frame();
    modelStore.addDistributedLoad3D(2, 0, 0, -10, -10, undefined, undefined, 1);
    const off = run({ selfWeightLoads: false });
    const on = run({ selfWeightLoads: true });
    expect(on.report.totalT).toBeCloseTo(off.report.totalT, 9);
    expect(on.modal.totalMass).toBeCloseTo(off.modal.totalMass, 9);
  });

  it('turns a slab load into slab mass', () => {
    frame({ slab: true });
    const q = modelStore.quads.keys().next().value!;
    modelStore.addSurfaceLoad3D(q, 2, 1); // D: 2 kN/m² × 16 m²
    const { report, modal } = run();
    expect(report.addedT.get(1)).toBeCloseTo(32 / G, 6);
    expect(modal.totalMass).toBeCloseTo(report.totalT, 6);
  });

  it('reports the nodal loads it cannot carry instead of dropping them silently', () => {
    frame();
    modelStore.addNodalLoad3D(2, 0, 0, -20, 0, 0, 0, 1);
    const { report, modal } = run();
    expect(report.excludedNodalKN).toBeCloseTo(20, 9);
    expect(report.totalT).toBeCloseTo(PORTAL_SELF_T, 6);
    expect(modal.totalMass).toBeCloseTo(report.totalT, 6);
  });

  it('follows a stated factor, and a stated zero means none', () => {
    frame();
    modelStore.addDistributedLoad3D(2, 0, 0, -5, -5, undefined, undefined, 2);
    modelStore.setMassSource({ factors: [{ caseId: 1, factor: 1 }, { caseId: 2, factor: 0 }, { caseId: 3, factor: 0 }] });
    expect(run().report.totalT).toBeCloseTo(PORTAL_SELF_T, 6);
    modelStore.setMassSource({ factors: [{ caseId: 1, factor: 1 }, { caseId: 2, factor: 1 }, { caseId: 3, factor: 0 }] });
    expect(run().report.addedT.get(2)).toBeCloseTo(20 / G, 6);
  });

  it('lengthens the period as √ of the mass, which is what the added mass is for', () => {
    frame();
    const bare = run();
    modelStore.addDistributedLoad3D(2, 0, 0, -30, -30, undefined, undefined, 1);
    const loaded = run();
    const sway = (m: any) => m.modes.reduce((a: any, b: any) => (b.effectiveMassX > a.effectiveMassX ? b : a));
    // The added mass all sits on the girder, while only part of the columns' own mass moves with
    // the sway. So the period grows by more than √ of the total-mass ratio and by less than √ of
    // the girder-mass ratio — the two bounds the physics allows.
    const ratio = sway(loaded.modal).period / sway(bare.modal).period;
    const girderT = 24 * 0.08 * L / G;
    expect(ratio).toBeGreaterThan(Math.sqrt(loaded.report.totalT / bare.report.totalT));
    expect(ratio).toBeLessThan(Math.sqrt((girderT + 120 / G) / girderT));
  });
});

describe('the mass source is part of the project', () => {
  it('survives the snapshot, is dropped with its case, and does not outlive the model', () => {
    frame();
    modelStore.setMassSource({ factors: [{ caseId: 1, factor: 1 }, { caseId: 2, factor: 0.5 }] });
    // Through JSON, as a saved file goes.
    const snap = JSON.parse(JSON.stringify(modelStore.snapshot()));
    modelStore.clear();
    expect(modelStore.model.massSource).toBeUndefined();
    modelStore.restore(snap);
    expect(modelStore.model.massSource).toEqual({ factors: [{ caseId: 1, factor: 1 }, { caseId: 2, factor: 0.5 }] });
    modelStore.removeLoadCase(2);
    expect(modelStore.model.massSource).toEqual({ factors: [{ caseId: 1, factor: 1 }] });
  });

  it('leaves a project that never stated one without one', () => {
    frame();
    expect('massSource' in modelStore.snapshot()).toBe(false);
  });
});
