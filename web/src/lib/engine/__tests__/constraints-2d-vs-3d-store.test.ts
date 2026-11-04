/**
 * One stored model, one answer: a flat model with constraints solved by the plane solver
 * (`constraintsTo2D`) and by the space solver (the plane stood in X–Z) must agree. Two stored
 * constraints meant different things in the two (docs/solver/assembly-constraints.md AC-3, AC-5):
 *   · a rigid link with no DOFs listed: a pinned arm in 3D, a fixed arm in 2D;
 *   · a floor diaphragm (plane XY): in 3D it ties the horizontal motion, in 2D it was the in-plane
 *     rigid body, which made the beam it spans rigid in bending.
 * And a linear MPC on ry kept its coefficient though θ = −ry. Through the store and the engine.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';
import type { Constraint3D } from '../types-3d';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

function agree(what: string): void {
  const r2 = modelStore.solve(false);
  if (!r2 || typeof r2 === 'string') throw new Error(`2D: ${String(r2)}`);
  const input = modelStore.buildSolverInput3D(false, false);
  for (const n of input!.nodes.values()) expect(n.y, 'the model stands in X–Z').toBe(0);
  const r3 = modelStore.solve3D(false, false, true);
  if (!r3 || typeof r3 === 'string') throw new Error(`3D: ${String(r3)}`);
  let moved = 0;
  for (const a of r2.displacements) {
    const b = r3.displacements.find((d) => d.nodeId === a.nodeId)!;
    const tol = 1e-6 * Math.max(1e-3, Math.abs(a.ux) + Math.abs(a.uz));
    expect(Math.abs(b.ux - a.ux), `${what}: ux ${a.nodeId}: 3D ${b.ux} vs 2D ${a.ux}`).toBeLessThan(tol);
    expect(Math.abs(b.uz - a.uz), `${what}: uz ${a.nodeId}: 3D ${b.uz} vs 2D ${a.uz}`).toBeLessThan(tol);
    expect(Math.abs(-b.ry - a.ry), `${what}: θ ${a.nodeId}: −θy ${-b.ry} vs θ ${a.ry}`).toBeLessThan(1e-6 * Math.max(1e-3, Math.abs(a.ry)));
    moved += Math.abs(a.ux) + Math.abs(a.uz);
  }
  expect(moved).toBeGreaterThan(1e-6);
}

/** Portal a–b–c–d, fixed feet, lateral load at b, gravity on the beam. */
function portal(): { b: number; c: number } {
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 4), c = modelStore.addNode(6, 4), d = modelStore.addNode(6, 0);
  modelStore.addElement(a, b, 'frame');
  const beam = modelStore.addElement(b, c, 'frame');
  modelStore.addElement(c, d, 'frame');
  modelStore.addSupport(a, 'fixed');
  modelStore.addSupport(d, 'fixed');
  modelStore.addNodalLoad(b, 10, 0, 0);
  modelStore.addDistributedLoad(beam, -12);
  return { b, c };
}

describe('constraints: the plane solve and the space solve of one model agree', () => {
  for (const plane of ['XY', 'YZ'] as const) {
    it(`a diaphragm in plane ${plane}`, () => {
      const { b, c } = portal();
      modelStore.addConstraint({ type: 'diaphragm', masterNode: b, slaveNodes: [c], plane } as Constraint3D);
      agree(`diaphragm ${plane}`);
    });
  }

  // The space solver's XZ diaphragm has both signs of its rotation terms flipped on main
  // (u_X = u_X,m − Δz·θy where the rigid body is +Δz·θy: XZ is not a cyclic pair), fixed by #330
  // (AC-14). The plane side here is the exact rigid body. When #330 lands this turns red: make it `it`.
  it('a diaphragm in plane XZ (needs #330, AC-14)', () => {
    const { b, c } = portal();
    modelStore.addConstraint({ type: 'diaphragm', masterNode: b, slaveNodes: [c], plane: 'XZ' } as Constraint3D);
    agree('diaphragm XZ');
  });

  it('a floor diaphragm leaves the beam it spans free to bend', () => {
    const { b, c } = portal();
    modelStore.addConstraint({ type: 'diaphragm', masterNode: b, slaveNodes: [c] } as Constraint3D);
    const r2 = modelStore.solve(false);
    if (!r2 || typeof r2 === 'string') throw new Error(String(r2));
    // The slave column head keeps the master's sway…
    const db = r2.displacements.find((d) => d.nodeId === b)!, dc = r2.displacements.find((d) => d.nodeId === c)!;
    expect(dc.ux).toBeCloseTo(db.ux, 12);
    // …and its vertical motion is the column's shortening, not Δx·θ of a rigid beam.
    expect(Math.abs(dc.uz - (db.uz + 6 * db.ry))).toBeGreaterThan(1e-6);
  });

  it('a rigid link with no DOFs listed (as an Excel import makes it)', () => {
    // Column 1–2 fixed at 1, arm 2→3, beam 3–4 on a roller at 4, load on the beam.
    const n1 = modelStore.addNode(0, 0), n2 = modelStore.addNode(0, 3), n3 = modelStore.addNode(1, 3), n4 = modelStore.addNode(5, 3);
    modelStore.addElement(n1, n2, 'frame');
    const beam = modelStore.addElement(n3, n4, 'frame');
    modelStore.addSupport(n1, 'fixed');
    modelStore.addSupport(n4, 'rollerX');
    modelStore.addDistributedLoad(beam, -10);
    modelStore.addConstraint({ type: 'rigidLink', masterNode: n2, slaveNode: n3 } as Constraint3D);
    agree('rigid link, default DOFs');
  });

  it('a rigid link with every DOF listed', () => {
    const n1 = modelStore.addNode(0, 0), n2 = modelStore.addNode(0, 3), n3 = modelStore.addNode(1, 3), n4 = modelStore.addNode(5, 3);
    modelStore.addElement(n1, n2, 'frame');
    const beam = modelStore.addElement(n3, n4, 'frame');
    modelStore.addSupport(n1, 'fixed');
    modelStore.addSupport(n4, 'rollerX');
    modelStore.addDistributedLoad(beam, -10);
    modelStore.addConstraint({ type: 'rigidLink', masterNode: n2, slaveNode: n3, dofs: [0, 1, 2, 3, 4, 5] } as Constraint3D);
    agree('rigid link, all DOFs');
  });

  it('a linear MPC on a rotation', () => {
    const { b, c } = portal();
    // uz(c) = 0.01 · ry(b), in the space axes.
    modelStore.addConstraint({ type: 'linearMPC', terms: [{ nodeId: c, dof: 2, coefficient: 1 }, { nodeId: b, dof: 4, coefficient: -0.01 }] } as Constraint3D);
    agree('linear MPC with ry');
  });
});
