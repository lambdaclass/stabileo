/**
 * The app stores constraints in 3D semantics (dofs 0..5, 6-bool releases);
 * the Rust 2D solver speaks [0=ux, 1=uz, 2=ry] and hard-errors on dof >= 3.
 * constraintsTo2D is the single translation layer — these tests pin the
 * mapping and prove the 2D wire accepts UI-authored rotational constraints
 * (which previously reached Rust as out-of-range DOF indices).
 */

import { describe, it, expect } from 'vitest';
import { constraintsTo2D } from '../constraint-2d-remap';
import { initSolver } from '../wasm-solver';
import { validateAndSolve2D } from '../solver-service';
import type { ModelData } from '../solver-service';

describe('constraintsTo2D mapping', () => {
  it('maps in-plane dof indices 0/2/4 → 0/1/2 and drops out-of-plane 1/3/5', () => {
    const out = constraintsTo2D([
      { type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [0, 1, 2, 3, 4, 5] },
    ]);
    expect(out).toEqual([
      { type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [0, 1, 2] },
    ]);
  });

  it('drops constraints left with no in-plane DOF; diaphragms pass through (Rust is dimension-aware)', () => {
    const out = constraintsTo2D([
      { type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [1, 3, 5] },
      { type: 'diaphragm', masterNode: 1, slaveNodes: [2, 3] },
    ]);
    expect(out).toEqual([
      { type: 'diaphragm', masterNode: 1, slaveNodes: [2, 3] },
    ]);
  });

  it('keeps rigidLink default (empty dofs) and maps explicit ones', () => {
    const out = constraintsTo2D([
      { type: 'rigidLink', masterNode: 1, slaveNode: 2 },
      { type: 'rigidLink', masterNode: 1, slaveNode: 2, dofs: [0, 4] },
      { type: 'rigidLink', masterNode: 1, slaveNode: 2, dofs: [1] },
    ]);
    expect(out.length).toBe(2);
    expect((out[0] as any).dofs).toBeUndefined();
    expect((out[1] as any).dofs).toEqual([0, 2]);
  });

  it('maps eccentricConnection: vertical offset Z→Y slot, releases 6→3 [ux,uz,ry]', () => {
    const out = constraintsTo2D([
      {
        type: 'eccentricConnection', masterNode: 1, slaveNode: 2,
        offsetX: 0.1, offsetY: 9, offsetZ: 0.5,
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

  it('drops linearMPC equations touching out-of-plane DOFs, maps the rest', () => {
    const out = constraintsTo2D([
      { type: 'linearMPC', terms: [{ nodeId: 1, dof: 0, coefficient: 1 }, { nodeId: 2, dof: 1, coefficient: -1 }] },
      { type: 'linearMPC', terms: [{ nodeId: 1, dof: 2, coefficient: 1 }, { nodeId: 2, dof: 4, coefficient: -1 }] },
    ]);
    expect(out.length).toBe(1);
    expect((out[0] as any).terms).toEqual([
      { nodeId: 1, dof: 1, coefficient: 1 },
      { nodeId: 2, dof: 2, coefficient: -1 },
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
      materials: new Map([[1, { id: 1, e: 200_000_000, nu: 0.3 } as any]]),
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
