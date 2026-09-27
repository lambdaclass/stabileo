/**
 * A 3D spring's kz is the vertical translational spring. Checked on the smallest case (a node on
 * a spring under a vertical force moves F/kz) and on the mat foundation example, whose raft rests
 * on kz springs and must settle by millimetres, not float.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store';
import * as wasmSolver from '../wasm-solver';
import { buildSolverInput3D, validateAndSolve3D } from '../solver-service';
import { loadFixture } from '../../templates/load-fixture';
import mat from '../../templates/fixtures/mat-foundation.json';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});
beforeEach(() => { modelStore.clear(); });

const md = () => ({
  nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
  loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
  quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints, connectors: modelStore.connectors,
});

describe('a 3D spring', () => {
  it('kz reaches the solver as the vertical spring, and a node on it moves F/kz', () => {
    // A node held by two fixed members in plan and a vertical spring: members carry no vertical
    // load at their far ends' fixity only through bending, so give them truss type (axial only,
    // horizontal) and the vertical goes to the spring alone.
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0), c = modelStore.addNode(0, 3, 0);
    modelStore.addElement(a, b, 'truss'); modelStore.addElement(a, c, 'truss');
    modelStore.addSupport(b, 'fixed3d' as never);
    modelStore.addSupport(c, 'fixed3d' as never);
    modelStore.addSupport(a, 'spring3d' as never, { kz: 2000 });
    modelStore.addNodalLoad3D(a, 0, 0, -10, 0, 0, 0, 1);
    const inp = buildSolverInput3D(md() as never)!;
    expect(inp.supports.get(a)).toMatchObject({ kz: 2000 });
    expect(inp.supports.get(a)?.krz).toBeUndefined();
    const r = validateAndSolve3D(md() as never);
    if (!r || typeof r === 'string') throw new Error(String(r));
    expect(r.displacements.find((d) => d.nodeId === a)!.uz).toBeCloseTo(-10 / 2000, 9);
  });

  it('the mat foundation example settles by millimetres', () => {
    modelStore.bulkMutate(() => loadFixture(mat as never, modelStore.fixtureApi() as never));
    const r = validateAndSolve3D(md() as never, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const uz = r.displacements.map((d) => d.uz);
    expect(Math.min(...uz)).toBeLessThan(0);
    expect(Math.max(...uz.map(Math.abs))).toBeLessThan(0.1);
  });
});
