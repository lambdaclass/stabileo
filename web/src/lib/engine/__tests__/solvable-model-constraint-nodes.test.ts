/**
 * `solvableModel` drops the nodes nothing holds; a constraint holds the nodes it names, and only
 * those. It used to read every number on a constraint as a node id: a linearMPC keeps its nodes
 * inside `terms`, so a node tied only by one was dropped with its support while the constraint
 * still named it, and an equalDOF's `dofs` were read as node ids, so a loose node numbered like a
 * degree of freedom stayed in and left the stiffness matrix singular.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../wasm-solver';
import { validateAndSolve3D, type ModelData } from '../solver-service';
import { solvableModel } from '../member-behaviour';
import type { Constraint3D } from '../types-3d';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const ALL_DOFS = [0, 1, 2, 3, 4, 5];

function base(nodes: Array<[number, number, number, number]>, supportNode: number, constraints: Constraint3D[]): ModelData {
  return {
    nodes: new Map(nodes.map(([id, x, y, z]) => [id, { id, x, y, z }])),
    materials: new Map([[1, { id: 1, name: 's', e: 200000, nu: 0.3, rho: 78.5, fy: 250 }]]),
    sections: new Map([[1, { id: 1, name: 's', a: 0.01, iz: 1e-4, iy: 1e-4, j: 1e-5 }]]),
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
    supports: new Map([[1, { id: 1, nodeId: supportNode, type: 'fixed3d' }]]),
    loads: [{ type: 'nodal3d', data: { id: 1, nodeId: 2, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0, caseId: 1 } }],
    constraints,
  } as unknown as ModelData;
}

/** A 3 m cantilever 1→2 whose root 1 is tied, dof by dof, to a fixed node 3. */
function tiedRoot(tie: 'mpc' | 'equalDOF'): ModelData {
  // The engine makes the term with the largest |coefficient| the dependent one and, on a tie, the
  // last: node 1 goes last so the free root follows the fixed node, not the other way round.
  const constraints: Constraint3D[] = tie === 'mpc'
    ? ALL_DOFS.map((d) => ({ type: 'linearMPC', terms: [{ nodeId: 3, dof: d, coefficient: -1 }, { nodeId: 1, dof: d, coefficient: 1 }] }) as Constraint3D)
    : [{ type: 'equalDOF', masterNode: 3, slaveNode: 1, dofs: ALL_DOFS }];
  return base([[1, 0, 0, 0], [2, 3, 0, 0], [3, 0, -1, 0]], 3, constraints);
}

describe('solvableModel: nodes held by a constraint', () => {
  it('keeps a node held only by a linearMPC, with its support', () => {
    const m = solvableModel(tiedRoot('mpc'));
    expect([...m.nodes.keys()]).toContain(3);
    expect(m.supports.size).toBe(1);
  });

  it('solves a root tied by linearMPC like the same tie written as equalDOF', () => {
    const ref = validateAndSolve3D(tiedRoot('equalDOF'));
    if (!ref || typeof ref === 'string') throw new Error('equalDOF reference failed: ' + String(ref));
    const r = validateAndSolve3D(tiedRoot('mpc'));
    expect(typeof r, String(r)).toBe('object');
    const uz = (x: any) => x.displacements.find((d: any) => d.nodeId === 2).uz;
    expect(uz(r)).toBeCloseTo(uz(ref), 9);
  });

  it('leaves out a loose node whose id is one of an equalDOF\'s dofs', () => {
    // Cantilever fixed at 1; node 4 follows its tip through an equalDOF on dofs 0..5; node 3 is
    // a stray click that nothing holds, numbered like the fourth degree of freedom.
    const model = base(
      [[1, 0, 0, 0], [2, 3, 0, 0], [3, 0, 0, 5], [4, 3, 1, 0]], 1,
      [{ type: 'equalDOF', masterNode: 2, slaveNode: 4, dofs: ALL_DOFS }],
    );
    const m = solvableModel(model);
    expect([...m.nodes.keys()].sort()).toEqual([1, 2, 4]);
    const r = validateAndSolve3D(model);
    expect(typeof r, String(r)).toBe('object');
  });
});
