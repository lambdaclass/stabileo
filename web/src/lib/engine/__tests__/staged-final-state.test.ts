/**
 * What the engine's staged construction returns for the finished structure, against the linear
 * solve of the same loads on the same model built in one stage.
 *
 * Its displacements and reactions are the linear solve's, and they are all the Advanced panel
 * shows. Its member forces are not: `build_results_from_u_3d` reads axial force with the other
 * sign and leaves out the member loads' fixed-end forces, and the result never passes
 * `finishSolve3D`. That is why the panel does not publish the final state to the results store
 * (`ProAdvancedTab.svelte`, `handleStaged`). If the force cases start failing, the engine has
 * been fixed and publishing can be reconsidered.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { buildSolverInput3D, caseSolverLoads3D } from '../solver-service';
import * as wasm from '../wasm-solver';
import { stagedLoadsByCase, stagedStagesPayload } from '../advanced-analyses';

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

const A = 0.01;
const restore = (nodes: Array<[number, number, number, number]>, members: Array<[number, number, number]>, fixed: number[], rho: number) =>
  modelStore.restore({
    nodes: nodes.map(([id, x, y, z]) => [id, { id, x, y, z }]),
    materials: [[1, { id: 1, name: 'S', e: 200_000, nu: 0.3, rho }]],
    sections: [[1, { id: 1, name: 'S', a: A, iz: 1e-5, iy: 8e-5, j: 1e-6 }]],
    elements: members.map(([id, nodeI, nodeJ]) => [id, { id, type: 'frame', nodeI, nodeJ, materialId: 1, sectionId: 1 }]),
    supports: fixed.map((nodeId, i) => [i + 1, { id: i + 1, nodeId, type: 'fixed3d' }]),
    loads: [], loadCases: [{ id: 1, type: 'D', name: 'D' }], combinations: [],
    nextId: { node: 10, material: 10, section: 10, element: 10, support: 10, load: 1 },
  } as never);

/** The model as it stands, built in one stage that applies case 1, and its linear solve. */
function solveBoth(selfWeight: boolean, members: number[], supportNodes: number[]) {
  const input = buildSolverInput3D(md() as never, selfWeight, false, { expandMemberOffsets: false })!;
  const cases = caseSolverLoads3D(md() as never, modelStore.model.loadCases, selfWeight, false);
  const { loads, indicesOf } = stagedLoadsByCase(cases);
  const stages = stagedStagesPayload([{ name: 'one', elementsAdded: members, elementsRemoved: [], platesAdded: [], platesRemoved: [], quadsAdded: [], quadsRemoved: [], caseIds: [1] }], indicesOf, supportNodes);
  const staged = wasm.solveStaged3D({ solver: { ...input, loads }, stages }).finalResults;
  const linear = wasm.solve3D({ ...input, loads: cases.get(1)! });
  return { staged, linear };
}

/** A 6 m by 4 m portal: 10 kN sideways and 100 kN down at the left knee, 10 kN/m on the girder. */
function portal() {
  restore([[1, 0, 0, 0], [2, 0, 0, 4], [3, 6, 0, 4], [4, 6, 0, 0]], [[1, 1, 2], [2, 2, 3], [3, 4, 3]], [1, 4], 0);
  modelStore.addNodalLoad3D(2, 10, 0, -100, 0, 0, 0, 1);
  modelStore.addDistributedLoad3D(2, 0, 0, -10, -10, undefined, undefined, 1);
  return solveBoth(false, [1, 2, 3], [1, 4]);
}

const force = (r: any, id: number) => r.elementForces.find((f: any) => f.elementId === id);

describe('staged construction, the finished structure', () => {
  it('reaches the linear solve\'s displacements and reactions', () => {
    const { staged, linear } = portal();
    const d = (r: any) => r.displacements.map((x: any) => [x.nodeId, ...['ux', 'uy', 'uz', 'rx', 'ry', 'rz'].map((k) => +x[k].toFixed(9))]);
    const rz = (r: any) => r.reactions.map((x: any) => [x.nodeId, ...['fx', 'fy', 'fz', 'mx', 'my', 'mz'].map((k) => +x[k].toFixed(6))]);
    expect(d(staged)).toEqual(d(linear));
    expect(rz(staged)).toEqual(rz(linear));
  });

  it('reads a column\'s axial force under its own weight unlike the linear solve', () => {
    restore([[1, 0, 0, 0], [2, 0, 0, 4]], [[1, 1, 2]], [1], 78.5);
    const { staged, linear } = solveBoth(true, [1], [1]);
    const W = 78.5 * A * 4;
    // Linear: W of compression at the base, none at the top.
    expect([force(linear, 1).nStart, force(linear, 1).nEnd].map((n) => +n.toFixed(9))).toEqual([-W, 0].map((n) => +n.toFixed(9)));
    // Staged: the weight lumped half to each end, read with the other sign and never given back.
    expect([force(staged, 1).nStart, force(staged, 1).nEnd].map((n) => +n.toFixed(9))).toEqual([W / 2, -W / 2].map((n) => +n.toFixed(9)));
  });

  it('leaves the girder\'s fixed-end forces out of its end moment and shear', () => {
    const { staged, linear } = portal();
    const wL = 10 * 6;
    expect(force(staged, 1).nStart).toBeCloseTo(-force(linear, 1).nStart, 6);
    expect(force(linear, 2).myStart - force(staged, 2).myStart).toBeCloseTo(-wL * 6 / 12, 6);
    expect(force(linear, 2).vzStart - force(staged, 2).vzStart).toBeCloseTo(wL / 2, 6);
  });
});
