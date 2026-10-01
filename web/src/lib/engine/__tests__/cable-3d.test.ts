/**
 * The 3D cable solver through its WASM export.
 *
 * A tripod of three cables hangs a node below three supports: statically determinate, so each
 * cable's tension is the load over three times the sine of its slope, whatever its stiffness.
 * A fourth cable ties the node down to the ground, and under a downward load it would be
 * compressed: a cable goes slack instead and takes nothing.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver, solveCable3D, type SolverInputCable3D } from '../wasm-solver';
import type { SolverSupport3D } from '../types-3d';

beforeAll(async () => { await initSolver(); });

/** The tension comes from the deformed chord, the statics from the undeformed one: they differ by
 *  the chord's rotation squared over its strain, about 1e-4 here. */
const near = (x: number, statics: number) => expect(Math.abs(x - statics)).toBeLessThan(5e-4 * statics);

const P = 120; // kN, down
const A = 1e-3; // m²
const RHO = 7850; // kg/m³

function tripod(tieDown: boolean): SolverInputCable3D {
  const nodes = new Map<number, { id: number; x: number; y: number; z: number }>();
  for (let k = 0; k < 3; k++) {
    const a = (2 * Math.PI * k) / 3;
    nodes.set(k + 1, { id: k + 1, x: 6 * Math.cos(a), y: 6 * Math.sin(a), z: 10 });
  }
  nodes.set(4, { id: 4, x: 0, y: 0, z: 2 });
  nodes.set(5, { id: 5, x: 0, y: 0, z: 0 });
  const cable = (id: number, nodeI: number, nodeJ: number): SolverInputCable3D['elements'] extends Map<number, infer E> ? E : never => ({
    id, type: 'cable', nodeI, nodeJ, materialId: 1, sectionId: 1,
    releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false,
    releaseTStart: false, releaseTEnd: false,
  });
  const elements = new Map([[1, cable(1, 1, 4)], [2, cable(2, 2, 4)], [3, cable(3, 3, 4)]]);
  if (tieDown) elements.set(4, cable(4, 5, 4));
  const pin = (nodeId: number): SolverSupport3D => ({ nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true });
  const supports = new Map([1, 2, 3, 5].map((n) => [n, pin(n)]));
  return {
    nodes,
    materials: new Map([[1, { id: 1, e: 160_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: A, iy: 1e-10, iz: 1e-10, j: 1e-10 }]]),
    elements,
    supports,
    loads: [{ type: 'nodal', data: { nodeId: 4, fx: 0, fy: 0, fz: -P, mx: 0, my: 0, mz: 0 } }],
  } as SolverInputCable3D;
}

describe('solveCable3D', () => {
  // Each cable: 10 m long, 6 m across and 8 m down.
  const tension = P / (3 * 0.8);
  const thrust = tension * 0.6;
  const w = (RHO / 1000) * A * 9.80665;

  it('hangs the tripod with the statics tension, thrust and sag', () => {
    const r = solveCable3D(tripod(false), 50, 1e-8, { '1': RHO });
    expect(r.converged).toBe(true);
    expect(r.cableForces).toHaveLength(3);
    for (const c of r.cableForces) {
      near(c.tension, tension);
      near(c.horizontalThrust, thrust);
      expect(c.sag).toBeCloseTo((w * 36) / (8 * c.horizontalThrust), 12);
      expect(c.unstretchedLength).toBeCloseTo(10, 9);
      // Its own weight softens it, and the modulus is reported in the units of E, kN/m².
      expect(c.ernstModulus).toBeLessThan(160e6);
      expect(c.ernstModulus).toBeGreaterThan(140e6);
    }
    const fz = r.results.reactions.reduce((s, x) => s + x.fz, 0);
    expect(fz).toBeCloseTo(P, 6);
  });

  it('lets a cable that would be compressed go slack', () => {
    const r = solveCable3D(tripod(true), 50, 1e-8, { '1': RHO });
    expect(r.converged).toBe(true);
    const byId = new Map(r.cableForces.map((c) => [c.elementId, c]));
    expect(Math.abs(byId.get(4)!.tension)).toBeLessThan(1e-9 * tension);
    for (const id of [1, 2, 3]) near(byId.get(id)!.tension, tension);
    const ground = r.results.reactions.find((x) => x.nodeId === 5)!;
    expect(Math.abs(ground.fx) + Math.abs(ground.fy) + Math.abs(ground.fz)).toBeLessThan(1e-9);
  });

  it('with no density, reports no sag rather than an infinite one', () => {
    const r = solveCable3D(tripod(false));
    for (const c of r.cableForces) {
      expect(c.sag).toBe(0);
      expect(c.ernstModulus).toBe(160e6);
    }
  });
});
