/**
 * The MITC4 quads' transverse shear through the WASM boundary.
 *
 * A cantilever strip fixed at x = 0 with an upward line load F across its tip: every section
 * carries the whole load in shear, so Qx = F/b in every quad. The DKT triangles, which have no
 * shear field to read, report none.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver, solve3D } from '../wasm-solver';
import type { SolverInput3D, SolverSupport3D } from '../types-3d';

beforeAll(async () => { await initSolver(); });

const L = 4, B = 1, F = 10;

function strip(triangles: boolean): SolverInput3D {
  const nx = 8, ny = 2;
  const id = (i: number, j: number) => 1 + i * (ny + 1) + j;
  const nodes = new Map<number, { id: number; x: number; y: number; z: number }>();
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) nodes.set(id(i, j), { id: id(i, j), x: (L * i) / nx, y: (B * j) / ny, z: 0 });
  const quads = new Map<number, { id: number; nodes: [number, number, number, number]; materialId: number; thickness: number }>();
  const plates = new Map<number, { id: number; nodes: [number, number, number]; materialId: number; thickness: number }>();
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const [a, b, c, d] = [id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)];
    if (triangles) {
      plates.set(plates.size + 1, { id: plates.size + 1, nodes: [a, b, c], materialId: 1, thickness: 0.2 });
      plates.set(plates.size + 1, { id: plates.size + 1, nodes: [a, c, d], materialId: 1, thickness: 0.2 });
    } else {
      quads.set(quads.size + 1, { id: quads.size + 1, nodes: [a, b, c, d], materialId: 1, thickness: 0.2 });
    }
  }
  const fixed = (nodeId: number): SolverSupport3D => ({ nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true });
  const loads = Array.from({ length: ny + 1 }, (_, j) => ({
    type: 'nodal' as const,
    data: { nodeId: id(nx, j), fx: 0, fy: 0, fz: ((j === 0 || j === ny ? 0.5 : 1) * F) / ny, mx: 0, my: 0, mz: 0 },
  }));
  return {
    nodes,
    materials: new Map([[1, { id: 1, e: 30_000, nu: 0.2 }]]),
    sections: new Map(),
    elements: new Map(),
    supports: new Map(Array.from({ length: ny + 1 }, (_, j) => [id(0, j), fixed(id(0, j))])),
    loads,
    quads,
    plates,
  } as SolverInput3D;
}

describe('transverse shear of the shells', () => {
  it('a MITC4 quad reports Qx = F/b and Qy that cancels across the strip', () => {
    const r = solve3D(strip(false));
    expect(r.quadStresses).toHaveLength(16);
    for (const q of r.quadStresses!) expect(q.qx!).toBeCloseTo(F / B, 6);
    const qy = r.quadStresses!.reduce((s, q) => s + q.qy!, 0);
    expect(Math.abs(qy)).toBeLessThan(1e-9 * F);
  });

  it('a DKT triangle reports none', () => {
    const r = solve3D(strip(true));
    expect(r.plateStresses!.length).toBe(32);
    for (const p of r.plateStresses!) {
      expect('qx' in p).toBe(false);
      expect('qy' in p).toBe(false);
    }
  });
});
