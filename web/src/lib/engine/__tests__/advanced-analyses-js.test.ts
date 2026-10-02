/**
 * The Advanced panel's inputs, against closed forms and against the engine.
 *
 * Each block pins one gap between what an analysis claimed and what it ran: notional loads from
 * member loads, creep in the displacements, staged construction with its supports and its load
 * cases, plastic moments on the sections the solve uses, and the section analyser's J.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { buildSolverInput3D, caseSolverLoads3D } from '../solver-service';
import * as wasm from '../wasm-solver';
import {
  lumpedNodalForces, notionalLoads3D, withNotionalLoads, ec2CreepCoefficient, ec2ShrinkageStrain,
  creepSteps, stagedLoadsByCase, stagedStagesPayload, stagedRefusal, plasticForSolve, rectangleJ,
} from '../advanced-analyses';
import { plasticInput3D } from '../plastic-moments';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasm.isSolverReady(), 'real WASM solver required').toBe(true);
});
beforeEach(() => modelStore.clear());

const md = () => ({
  nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
  loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
  quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints,
  connectors: modelStore.connectors, analysis: modelStore.model.analysis, groups: modelStore.model.groups,
});
const inputOf = () => buildSolverInput3D(md() as never, false, false, { expandMemberOffsets: false })!;

const E_STEEL = 200_000, A = 0.00539, I = 8.36e-5;
const E_CONC = 30_000;

/** A portal along X, 6 m by 4 m, fixed bases, a uniform load on the girder. */
function portal(opts: { w?: number; e?: number; fy?: number } = {}) {
  modelStore.restore({
    nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 4 }], [3, { id: 3, x: 6, y: 0, z: 4 }], [4, { id: 4, x: 6, y: 0, z: 0 }]],
    materials: [[1, { id: 1, name: 'M', e: opts.e ?? E_STEEL, nu: 0.3, rho: 78.5, ...(opts.fy ? { fy: opts.fy } : {}) }]],
    sections: [[1, { id: 1, name: 'S', a: A, iz: I / 10, iy: I, j: 1e-6 }]],
    elements: [
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
      [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1 }],
      [3, { id: 3, type: 'frame', nodeI: 4, nodeJ: 3, materialId: 1, sectionId: 1 }],
    ],
    supports: [[1, { id: 1, nodeId: 1, type: 'fixed3d' }], [2, { id: 2, nodeId: 4, type: 'fixed3d' }]],
    loads: [], loadCases: [{ id: 1, type: 'D', name: 'D' }, { id: 2, type: 'L', name: 'L' }], combinations: [],
    nextId: { node: 10, material: 10, section: 10, element: 10, support: 10, load: 1 },
  } as never);
  if (opts.w) modelStore.addDistributedLoad3D(2, 0, 0, -opts.w, -opts.w, undefined, undefined, 1);
}

describe('loads lumped at the nodes', () => {
  it('split a uniform load in halves and a triangular one in thirds', () => {
    portal();
    modelStore.addDistributedLoad3D(2, 0, 0, 0, -12, undefined, undefined, 1);
    const f = lumpedNodalForces(inputOf());
    // A triangle 0 → 12 kN/m over 6 m: 36 kN, a third at I and two thirds at J.
    expect(f.get(2)![2]).toBeCloseTo(-12, 9);
    expect(f.get(3)![2]).toBeCloseTo(-24, 9);
  });

  it('split a point load by the lever rule', () => {
    portal();
    // Local z of a girder along X is up.
    modelStore.addPointLoadOnElement3D(2, 1.5, 0, -20, 1);
    const f = lumpedNodalForces(inputOf());
    expect(f.get(2)![2]).toBeCloseTo(-15, 9);
    expect(f.get(3)![2]).toBeCloseTo(-5, 9);
  });
});

describe('imperfections', () => {
  it('take the sway force from every load, member loads included', () => {
    portal({ w: 10 });
    const input = inputOf();
    const ratio = 1 / 200;
    // The engine reads nodal loads only: a portal loaded on its girder got no notional load.
    const engine = wasm.solveWithImperfections3D({ solver: input, imperfections: { notionalLoads: [{ ratio, direction: 0, gravityAxis: 2 }] } });
    const linear = wasm.solve3D(input);
    expect(Math.abs(engine.displacements.find((d: any) => d.nodeId === 2).ux - linear.displacements.find((d) => d.nodeId === 2)!.ux)).toBeLessThan(1e-12);
    // Here: H = ratio · 60 kN, at the girder's ends.
    const { input: withH, totalH } = withNotionalLoads(input, ratio, 'X');
    expect(totalH).toBeCloseTo(ratio * 60, 9);
    const r = wasm.solve3D(withH);
    const rx = r.reactions.reduce((s, x) => s + x.fx, 0);
    expect(rx).toBeCloseTo(-ratio * 60, 6);
  });

  it('put no sway force where the loads point up', () => {
    portal();
    modelStore.addNodalLoad3D(2, 0, 0, 5, 0, 0, 0, 1);
    expect(notionalLoads3D(inputOf(), 0.005, 'X')).toEqual([]);
  });
});

describe('creep and shrinkage, EN 1992-1-1', () => {
  const base = { fck: 30, rh: 50, h0: 150, t0: 28, cement: 'N' as const };

  it('φ(∞, 28) for C30/37 at 50 % and h0 = 150 mm reads as Figure 3.1 does', () => {
    // fcm = 38 MPa: φ_RH = 1.858, β(fcm) = 2.725, β(t0) = 0.488, φ0 = 2.47.
    expect(ec2CreepCoefficient(base, 1e7)).toBeCloseTo(2.47, 2);
  });

  it('carries no α factors below fcm = 35 MPa', () => {
    // fck 25 → fcm 33: φ_RH = 1 + 0.5 / (0.1·∛150).
    const s = { ...base, fck: 25 };
    const phiRH = 1 + 0.5 / (0.1 * Math.cbrt(150));
    const phi0 = phiRH * (16.8 / Math.sqrt(33)) * (1 / (0.1 + 28 ** 0.2));
    expect(ec2CreepCoefficient(s, 1e9)).toBeCloseTo(phi0, 3);
  });

  it('moves the age at loading with the cement class', () => {
    const slow = ec2CreepCoefficient({ ...base, t0: 7, cement: 'S' }, 1e7);
    const rapid = ec2CreepCoefficient({ ...base, t0: 7, cement: 'R' }, 1e7);
    expect(slow).toBeGreaterThan(rapid);
  });

  it('shrinks C30/37 at 50 % by Table 3.2 and kh', () => {
    // εcd,0 = 0.482 ‰ (between 0.535 and 0.42 of Table 3.2), kh(150) = 0.925, εca,∞ = 50·10⁻⁶.
    expect(ec2ShrinkageStrain(base, 1e9)).toBeCloseTo(0.925 * 482.2e-6 + 50e-6, 7);
  });

  it('reaches the displacements: a cantilever deflects (1 + φ) times its elastic deflection', () => {
    modelStore.restore({
      nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 4, y: 0, z: 0 }]],
      materials: [[1, { id: 1, name: 'H-30', e: E_CONC, nu: 0.2, rho: 24, fy: 30 }]],
      sections: [[1, { id: 1, name: 'R', a: 0.12, iz: 0.4 * 0.3 ** 3 / 12, iy: 0.3 * 0.4 ** 3 / 12, j: 1e-3 }]],
      elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]],
      supports: [[1, { id: 1, nodeId: 1, type: 'fixed3d' }]],
      loads: [], loadCases: [{ id: 1, type: 'D', name: 'D' }], combinations: [],
      nextId: { node: 10, material: 10, section: 10, element: 10, support: 10, load: 1 },
    } as never);
    modelStore.addNodalLoad3D(2, 0, 0, -10, 0, 0, 0, 1);
    const input = inputOf();
    const elastic = wasm.solve3D(input).displacements.find((d) => d.nodeId === 2)!.uz;
    const [step] = creepSteps(input, new Map([[1, base]]), [10_000], (i) => wasm.solve3D(i));
    const phi = step!.creepCoefficient;
    expect(phi).toBeGreaterThan(1.5);
    // A cantilever is statically determinate: shrinkage shortens it and bends nothing.
    expect(step!.results.displacements.find((d) => d.nodeId === 2)!.uz).toBeCloseTo(elastic * (1 + phi), 9);
    const ux = step!.results.displacements.find((d) => d.nodeId === 2)!.ux;
    expect(ux).toBeCloseTo(-step!.shrinkageStrain * 4, 9);
    // The engine's own creep solve leaves the deflection elastic.
    const engine = wasm.solveCreepShrinkage3D({ solver: input, creepParams: { 1: { fc: 30, rh: 50, h0: 150, t0: 28, cementClass: 'N' } }, timeSteps: [{ tDays: 10_000 }] });
    expect(engine.steps[0].displacements.find((d: any) => d.nodeId === 2).uz).toBeCloseTo(elastic, 9);
  });
});

describe('staged construction', () => {
  it('keeps a spring support and applies loads by case', () => {
    // A cantilever held at the tip by a spring: without the support in any stage the tip hangs free.
    modelStore.restore({
      nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 4, y: 0, z: 0 }]],
      materials: [[1, { id: 1, name: 'S', e: E_STEEL, nu: 0.3, rho: 78.5 }]],
      sections: [[1, { id: 1, name: 'S', a: A, iz: I / 10, iy: I, j: 1e-6 }]],
      elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]],
      supports: [
        [1, { id: 1, nodeId: 1, type: 'fixed3d' }],
        [2, { id: 2, nodeId: 2, type: 'spring3d', kz: 500 }],
      ],
      loads: [], loadCases: [{ id: 1, type: 'D', name: 'D' }, { id: 2, type: 'L', name: 'L' }], combinations: [],
      nextId: { node: 10, material: 10, section: 10, element: 10, support: 10, load: 1 },
    } as never);
    modelStore.addNodalLoad3D(2, 0, 0, -10, 0, 0, 0, 1);
    modelStore.addNodalLoad3D(2, 0, 0, -1000, 0, 0, 0, 2);
    const input = inputOf();
    const cases = caseSolverLoads3D(md() as never, modelStore.model.loadCases, false, false);
    const { loads, indicesOf } = stagedLoadsByCase(cases);
    const supports = [...input.supports.values()].map((s) => s.nodeId);
    const stages = stagedStagesPayload([{ name: 'one', elementsAdded: [1], elementsRemoved: [], platesAdded: [], platesRemoved: [], quadsAdded: [], quadsRemoved: [], caseIds: [1] }], indicesOf, supports);
    const res = wasm.solveStaged3D({ solver: { ...input, loads }, stages });
    // The same model solved linearly under case D alone.
    const linear = wasm.solve3D({ ...input, loads: cases.get(1)! });
    const uz = (r: any) => r.displacements.find((d: any) => d.nodeId === 2).uz;
    expect(uz(res.finalResults)).toBeCloseTo(uz(linear), 9);
  });

  it('refuses what a stage cannot activate', () => {
    portal();
    const input = inputOf();
    expect(stagedRefusal(input)).toBeNull();
    expect(stagedRefusal({ ...input, connectors: new Map([[1, {} as never]]) })).toBe('adv.stagedNoConnectors');
  });
});

describe('pushover', () => {
  it('gives a member with stiffness modifiers its section Mp, not an infinite one', () => {
    portal({ w: 10, fy: 250 });
    const snap = JSON.parse(JSON.stringify(modelStore.snapshot()));
    snap.elements = snap.elements.map(([id, e]: [number, Record<string, unknown>]) => [id, id === 2 ? { ...e, stiffness: { iy: 0.5, iz: 0.5 } } : e]);
    modelStore.restore(snap);
    const input = inputOf();
    const solvedSid = input.elements.get(2)!.sectionId;
    expect(solvedSid).not.toBe(1);
    const p = plasticInput3D(modelStore.sections, modelStore.materials, modelStore.elements);
    expect(p.mpOverrides[String(solvedSid)]).toBeUndefined();
    const fixed = plasticForSolve(p, input, (id) => modelStore.elements.get(id)?.sectionId);
    expect(fixed.mpOverrides[String(solvedSid)]).toEqual(p.mpOverrides['1']);
  });
});

describe('section analyser', () => {
  it("rectangle J follows Roark's series", () => {
    // 0.3 × 0.5: J = 0.5·0.3³·(1/3 − 0.21·0.6·(1 − 0.3⁴/(12·0.5⁴))).
    expect(rectangleJ(0.3, 0.5)).toBeCloseTo(0.5 * 0.027 * (1 / 3 - 0.21 * 0.6 * (1 - 0.0081 / 0.75)), 12);
    // The Saint-Venant solve the analyser uses agrees within its mesh.
    const g = wasm.buildSectionGeometry({ kind: 'custom', outer: [[-0.15, -0.25], [0.15, -0.25], [0.15, 0.25], [-0.15, 0.25]], holes: [] } as never).geometry;
    const j = wasm.analyzeSectionTorsion({ geometry: g }).j;
    expect(Math.abs(j - rectangleJ(0.3, 0.5)) / rectangleJ(0.3, 0.5)).toBeLessThan(0.02);
  });
});

describe('material scope', () => {
  it('pushover names the members that are not steel', async () => {
    const { pushoverNonSteel, concreteMaterials } = await import('../advanced-analyses');
    const materials = new Map([[1, { name: 'F-24', fy: 235 }], [2, { name: 'H-30', fy: 30 }]]);
    expect(pushoverNonSteel([{ materialId: 1 }, { materialId: 2 }], materials)).toEqual(['H-30']);
    expect([...concreteMaterials(materials).keys()]).toEqual([2]);
  });
});
