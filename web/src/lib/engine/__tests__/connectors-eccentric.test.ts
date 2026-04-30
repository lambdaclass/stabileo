/**
 * Phase B verification for pr/5-basic-mode-overhaul:
 * confirm the WASM solver accepts the new payload shapes end-to-end.
 *
 * Covers:
 *   - ConnectorElement (top-level `connectors`, parallel to elements)
 *   - EccentricConnectionConstraint (5th variant of Constraint3D, with releases[])
 *
 * These are the existing solver primitives that translational-release/sliding-bearing
 * behavior maps to. This test does NOT validate physical correctness — it validates
 * the wire format. Phase D will add behavioral assertions.
 */

import { describe, it, expect } from 'vitest';
import { initSolver, solve3D } from '../wasm-solver';
import type { SolverInput3D, ConnectorElement, EccentricConnectionConstraint } from '../types-3d';

function basicTwoNodeFrame3D(): SolverInput3D {
  return {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 5, y: 0, z: 0 }],
    ]),
    materials: new Map([
      [1, { id: 1, e: 200_000, nu: 0.3, rho: 78.5 }],
    ]),
    sections: new Map([
      [1, { id: 1, a: 0.005, iy: 1e-5, iz: 1e-5, j: 1e-6 }],
    ]),
    elements: new Map([
      [1, {
        id: 1, type: 'frame', nodeI: 1, nodeJ: 2,
        materialId: 1, sectionId: 1,
        releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false,
        releaseTStart: false, releaseTEnd: false,
      }],
    ]),
    supports: new Map([
      [1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }],
      [2, { nodeId: 2, rx: false, ry: true, rz: true, rrx: true, rry: true, rrz: true }],
    ]),
    loads: [
      { type: 'nodal', data: { id: 1, nodeId: 2, fx: 10, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } },
    ],
  };
}

describe('Phase B: ConnectorElement + EccentricConnection wire format', () => {
  it('solver accepts a connector with kAxial, kShear, kMoment between two nodes', async () => {
    await initSolver();
    const input = basicTwoNodeFrame3D();
    // Add a third node coincident with node 2, link it via a connector with finite stiffness
    input.nodes.set(3, { id: 3, x: 5, y: 0, z: 0 });
    const connector: ConnectorElement = {
      id: 1, nodeI: 2, nodeJ: 3,
      kAxial: 1e6, kShear: 1e6, kMoment: 1e3,
      kShearZ: 1e6, kBendY: 1e3, kBendZ: 1e3,
    };
    input.connectors = new Map([[1, connector]]);
    // Restrain the new node so the connector has somewhere to react
    input.supports.set(3, { nodeId: 3, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true });
    const result = solve3D(input);
    expect(result).toBeTruthy();
    expect(result.displacements?.length).toBeGreaterThan(0);
    // No structuredDiagnostic at error severity from the solver
    const errs = (result.structuredDiagnostics ?? []).filter(d => d.severity === 'error');
    expect(errs).toEqual([]);
  });

  it('solver accepts an eccentricConnection constraint with translational releases', async () => {
    await initSolver();
    const input = basicTwoNodeFrame3D();
    // Add a third node, eccentric to node 2 by (0, 0.5, 0), and release ux at the connection
    input.nodes.set(3, { id: 3, x: 5, y: 0.5, z: 0 });
    const ecc: EccentricConnectionConstraint = {
      type: 'eccentricConnection',
      masterNode: 2,
      slaveNode: 3,
      offsetX: 0, offsetY: 0.5, offsetZ: 0,
      // 3D releases: [ux, uy, uz, rx, ry, rz]; release ux only (sliding bearing along X)
      releases: [true, false, false, false, false, false],
    };
    input.constraints = [ecc];
    input.supports.set(3, { nodeId: 3, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true });
    const result = solve3D(input);
    expect(result).toBeTruthy();
    const errs = (result.structuredDiagnostics ?? []).filter(d => d.severity === 'error');
    expect(errs).toEqual([]);
  });
});
