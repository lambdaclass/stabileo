/**
 * The app stores constraints in 3D semantics (dofs 0..5, 6-bool releases);
 * the Rust 2D solver speaks [0=ux, 1=uz, 2=ry] and hard-errors on dof >= 3.
 * constraintsTo2D is the single translation layer — these tests pin the
 * mapping and prove the 2D wire accepts UI-authored rotational constraints
 * (which previously reached Rust as out-of-range DOF indices).
 */

import { describe, it, expect } from 'vitest';
import { constraintsInXZ, constraintsTo2D } from '../constraint-2d-remap';
import { initSolver } from '../wasm-solver';
import { validateAndSolve2D } from '../solver-service';
import type { ModelData } from '../solver-service';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import type { LinearMpcConstraint } from '../types-3d';

describe('constraintsTo2D mapping', () => {
  it('maps in-plane dof indices 0/2/4 → 0/1/2 and drops out-of-plane 1/3/5', () => {
    const out = constraintsTo2D([
      { type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [0, 1, 2, 3, 4, 5] },
    ]);
    expect(out).toEqual([
      { type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [0, 1, 2] },
    ]);
  });

  it('drops constraints left with no in-plane DOF; a diaphragm goes as its trace on the X–Z plane', () => {
    const out = constraintsTo2D([
      { type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [1, 3, 5] },
      // A floor (the default plane, XY): only ux is in the model plane.
      { type: 'diaphragm', masterNode: 1, slaveNodes: [2, 3] },
      // A wall across the model plane: only uz.
      { type: 'diaphragm', masterNode: 1, slaveNodes: [4], plane: 'YZ' },
      // The model's own plane: the rigid body, rotation tied.
      { type: 'diaphragm', masterNode: 1, slaveNodes: [5], plane: 'XZ' },
    ]);
    expect(out).toEqual([
      { type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [0] },
      { type: 'equalDOF', masterNode: 1, slaveNode: 3, dofs: [0] },
      { type: 'equalDOF', masterNode: 1, slaveNode: 4, dofs: [1] },
      { type: 'rigidLink', masterNode: 1, slaveNode: 5, dofs: [0, 1, 2] },
    ]);
  });

  it('a rigidLink with no DOFs is all translational, as in 3D (listed for the 2D solver); explicit ones map', () => {
    const out = constraintsTo2D([
      { type: 'rigidLink', masterNode: 1, slaveNode: 2 },
      { type: 'rigidLink', masterNode: 1, slaveNode: 2, dofs: [0, 4] },
      { type: 'rigidLink', masterNode: 1, slaveNode: 2, dofs: [1] },
    ]);
    expect(out.length).toBe(2);
    expect((out[0] as any).dofs).toEqual([0, 1]);
    expect((out[1] as any).dofs).toEqual([0, 2]);
  });

  it('maps eccentricConnection: vertical offset Z→Y slot, releases 6→3 [ux,uz,ry]', () => {
    const out = constraintsTo2D([
      {
        type: 'eccentricConnection', masterNode: 1, slaveNode: 2,
        offsetX: 0.1, offsetY: 0, offsetZ: 0.5,
        releases: [true, false, false, false, true, false], // ux + ry released
      },
    ]);
    expect(out).toEqual([
      {
        type: 'eccentricConnection', masterNode: 1, slaveNode: 2,
        offsetX: 0.1, offsetY: 0.5, offsetZ: 0,
        releases: [true, false, true],
      },
    ]);
  });

  it('refuses a mixed linearMPC and drops equations confined to out-of-plane DOFs', () => {
    expect(() => constraintsTo2D([
      { type: 'linearMPC', terms: [{ nodeId: 1, dof: 0, coefficient: 1 }, { nodeId: 2, dof: 1, coefficient: -1 }] },
    ])).toThrow('constraints[0].terms');
    const out = constraintsTo2D([
      { type: 'linearMPC', terms: [{ nodeId: 1, dof: 3, coefficient: 1 }, { nodeId: 2, dof: 1, coefficient: -1 }] },
      { type: 'linearMPC', terms: [{ nodeId: 1, dof: 2, coefficient: 1 }, { nodeId: 2, dof: 4, coefficient: -1 }] },
    ]);
    expect(out.length).toBe(1);
    expect((out[0] as any).terms).toEqual([
      { nodeId: 1, dof: 1, coefficient: 1 },
      { nodeId: 2, dof: 2, coefficient: 1 },
    ]);
  });
});

describe('UI-authored 3D constraints survive the real 2D wire', () => {
  it('a rotational (ry, 3D dof 4) equalDOF no longer hard-fails the 2D solve', async () => {
    await initSolver();
    const model: ModelData = {
      nodes: new Map([
        [1, { id: 1, x: 0, y: 0 } as any],
        [2, { id: 2, x: 5, y: 0 } as any],
        [3, { id: 3, x: 10, y: 0 } as any],
      ]),
      elements: new Map([
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 } as any],
        [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1 } as any],
      ]),
      materials: new Map([[1, { id: 1, e: 200_000_000, nu: 0.3, rho: 0 } as any]]),
      sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 } as any]]),
      supports: new Map([
        [1, { id: 1, nodeId: 1, type: 'fixed' } as any],
        [2, { id: 2, nodeId: 3, type: 'pinned' } as any],
      ]),
      loads: [{ type: 'nodal', data: { id: 1, nodeId: 2, fx: 0, fz: -10, my: 0 } } as any],
      // 3D-shaped, as ProConstraintsTab emits: dof 4 = ry
      constraints: [{ type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [4] }],
    };
    const result = validateAndSolve2D(model, false);
    // Pre-fix this was a Rust validation error string
    // ('references DOF 4 but max is 2').
    expect(typeof result).not.toBe('string');
    expect(result).toBeTruthy();
  });
});

it.each([
  { plane: 'xy', horizontal: 0, normal: 5, orthogonal: 3, mappedOrthogonal: 3 },
  { plane: 'yz', horizontal: 1, normal: 3, orthogonal: 4, mappedOrthogonal: 3 },
] as const)('known wrong result: #2588 — $plane reflects axial MPC coefficients and preserves signed displacement', async ({
  plane, horizontal, normal, orthogonal, mappedOrthogonal,
}) => {
  await initSolver();
  uiStore.analysisMode = '2d';
  uiStore.drawPlane2D = plane;
  modelStore.clear();
  try {
    const span = 5;
    const root = modelStore.addNode(0, 0);
    const tip = modelStore.addNode(plane === 'xy' ? span : 0, plane === 'yz' ? span : 0);
    modelStore.addElement(root, tip, 'frame');
    modelStore.addSupport(root, 'fixed');
    if (plane === 'xy') modelStore.addNodalLoad(tip, 0, 0, 10);
    else modelStore.addNodalLoad3D(tip, 0, 0, 0, 10, 0, 0);
    const mpc: LinearMpcConstraint = {
      type: 'linearMPC', terms: [
        { nodeId: tip, dof: horizontal, coefficient: 1 },
        { nodeId: tip, dof: normal, coefficient: -span },
      ],
    };
    const spatial: LinearMpcConstraint = {
      ...mpc, terms: [...mpc.terms, { nodeId: tip, dof: orthogonal, coefficient: 2 }],
    };
    expect.soft(constraintsInXZ(plane, [spatial])).toEqual([{
      type: 'linearMPC', terms: [
        { nodeId: tip, dof: 0, coefficient: 1 },
        { nodeId: tip, dof: 4, coefficient: span },
        { nodeId: tip, dof: mappedOrthogonal, coefficient: -2 },
      ],
    }]);
    modelStore.addConstraint(mpc);
    for (const result of [modelStore.solve(false, plane), await modelStore.solveAsync(false, plane)]) {
      if (!result || typeof result === 'string') throw new Error(String(result));
      const displacement = result.displacements.find(d => d.nodeId === tip)!;
      expect.soft(displacement.ux).toBeGreaterThan(0);
      expect.soft(displacement.ry).toBeGreaterThan(0);
      expect.soft(displacement.ux / displacement.ry).toBeCloseTo(span, 12);
    }
  } finally {
    uiStore.drawPlane2D = 'xy';
    modelStore.clear();
  }
});
