/**
 * The 3D step-by-step solver against the 3D analysis solver, load by load.
 *
 * Same reasoning as `solver-detailed-vs-wasm.test.ts`: two implementations of
 * one method drift silently. Every load type the wizard reads is exercised on
 * a space frame, and the nodal displacements must agree to round-off. Thermal
 * loads were the one it did not read at all.
 */
import { describe, it, expect } from 'vitest';
import { solve3D } from '../wasm-solver';
import { solveDetailed3D } from '../solver-detailed-3d';
import type { SolverInput3D, SolverLoad3D, SolverSupport3D } from '../types-3d';

const fixed = (nodeId: number, extra: Partial<SolverSupport3D> = {}): SolverSupport3D =>
  ({ nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true, ...extra });
const el = (id: number, nodeI: number, nodeJ: number) =>
  ({ id, type: 'frame' as const, nodeI, nodeJ, materialId: 1, sectionId: 1 });

function frame(loads: SolverLoad3D[], supports?: SolverSupport3D[]): SolverInput3D {
  return {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }],
      [3, { id: 3, x: 4, y: 0, z: 3 }], [4, { id: 4, x: 4, y: 2, z: 3 }],
      [5, { id: 5, x: 4, y: 2, z: 0 }],
    ]),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 2e-4, j: 1.5e-4 }]]),
    elements: new Map([[1, el(1, 1, 2)], [2, el(2, 2, 3)], [3, el(3, 3, 4)], [4, el(4, 4, 5)]]),
    supports: new Map((supports ?? [fixed(1), fixed(5)]).map((s, i) => [i, s])),
    loads,
  } as unknown as SolverInput3D;
}

const CASES: Record<string, SolverInput3D> = {
  'nodal forces and moments': frame([{ type: 'nodal', data: { nodeId: 3, fx: 5, fy: -3, fz: -10, mx: 1, my: 2, mz: -1 } }]),
  'trapezoidal load': frame([{ type: 'distributed', data: { elementId: 2, qYI: 0, qYJ: 0, qZI: -5, qZJ: -8 } }]),
  'partial load in both planes': frame([{ type: 'distributed', data: { elementId: 2, qYI: 2, qYJ: 2, qZI: -5, qZJ: -5, a: 1, b: 3 } }]),
  'point load on a member': frame([{ type: 'pointOnElement', data: { elementId: 3, a: 0.7, py: 4, pz: -6 } }]),
  'settlement': frame([], [fixed(1, { dz: -0.005 } as never), fixed(5)]),
  'thermal: uniform and both gradients': frame([{ type: 'thermal', data: { elementId: 2, dtUniform: 15, dtGradientY: 5, dtGradientZ: 8 } }]),
};

describe('solveDetailed3D agrees with the 3D analysis solver', () => {
  for (const [name, input] of Object.entries(CASES)) {
    it(name, () => {
      const r = solve3D(input) as never as { displacements: Array<Record<string, number>> };
      const d = solveDetailed3D(input);
      const keys = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
      const scale = (from: number) => Math.max(1e-12,
        ...r.displacements.flatMap((x) => keys.slice(from, from + 3).map((k) => Math.abs(x[k]))));
      for (const x of r.displacements) {
        keys.forEach((k, ld) => {
          const info = d.dofNumbering.dofs.find((q) => q.nodeId === x.nodeId && q.localDof === ld);
          if (!info) return;
          const got = d.uAll[info.globalIndex];
          expect(Math.abs(got - x[k]) / scale(ld < 3 ? 0 : 3), `${k} at ${x.nodeId}: ${got} vs ${x[k]}`)
            .toBeLessThan(1e-9);
        });
      }
    });
  }
});
