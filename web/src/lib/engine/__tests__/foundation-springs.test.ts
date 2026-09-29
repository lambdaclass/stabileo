/**
 * Foundation springs: each node takes its share of the shells around it, and a raft under a
 * uniform pressure on ks·A springs settles q/ks everywhere, since the loads and the springs are
 * lumped on the same areas and nothing bends.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store';
import * as wasmSolver from '../wasm-solver';
import { validateAndSolve3D } from '../solver-service';
import { foundationSprings, tributaryAreas } from '../foundation-springs';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});
beforeEach(() => { modelStore.clear(); });

describe('tributary areas', () => {
  it('a quadrilateral gives a quarter of its area to each corner, a triangle a third', () => {
    const nodes = new Map([[1, { x: 0, y: 0 }], [2, { x: 2, y: 0 }], [3, { x: 2, y: 3 }], [4, { x: 0, y: 3 }]]);
    expect([...tributaryAreas(nodes, [{ nodes: [1, 2, 3, 4] }]).values()]).toEqual([1.5, 1.5, 1.5, 1.5]);
    const tri = tributaryAreas(nodes, [{ nodes: [1, 2, 3] }]);
    expect(tri.get(1)).toBeCloseTo(1, 12);
    expect(foundationSprings(tri, 1000).map((s) => s.kz)).toEqual([1000, 1000, 1000].map((v) => expect.closeTo(v, 9)) as never);
  });
});

describe('a raft on springs', () => {
  it('settles q/ks under a uniform pressure', () => {
    const n = 3, h = 1, ks = 20000, q = 10;
    const id = (i: number, j: number) => i * (n + 1) + j + 1;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) modelStore.addNode(i * h, j * h, 0);
    const mat = modelStore.addMaterial({ name: 'H', e: 25000, nu: 0.2, rho: 0 });
    const quads: number[] = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      quads.push(modelStore.addQuad([id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)], mat, 0.4));
    }
    const shells = quads.map((qid) => ({ nodes: [...modelStore.quads.get(qid)!.nodes] }));
    const springs = foundationSprings(tributaryAreas(modelStore.nodes, shells), ks);
    expect(springs.reduce((s, x) => s + x.area, 0)).toBeCloseTo(n * n * h * h, 9);
    for (const sp of springs) {
      modelStore.addSupportEntry({ nodeId: sp.nodeId, type: 'custom3d', dofRestraints: { tx: true, ty: true, tz: false, rx: false, ry: false, rz: false }, dofFrame: 'global', kz: sp.kz } as never);
    }
    for (const qid of quads) modelStore.addSurfaceLoad3D(qid, q, 1);
    const md = {
      nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
      loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
      quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints, connectors: modelStore.connectors,
    };
    const r = validateAndSolve3D(md as never);
    if (!r || typeof r === 'string') throw new Error(String(r));
    for (const d of r.displacements) expect(d.uz).toBeCloseTo(-q / ks, 7);
  });
});
