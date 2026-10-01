import { it, expect } from 'vitest';
import { solvePDelta, solvePDelta3D, input2DToWireObject, serializeInput3D } from '../wasm-solver';
import { solve_pdelta_2d, solve_pdelta_3d } from '../../wasm/dedaliano_engine.js';
import type { SolverInput } from '../types';
import type { SolverInput3D } from '../types-3d';
import { formatPDeltaFactor } from '../pdelta-result';

function column(frac: number): SolverInput {
  const n = 8, length = 5, e = 200_000, iz = 1e-4;
  const pcr = Math.PI ** 2 * e * 1000 * iz / (4 * length ** 2);
  return {
    nodes: new Map(Array.from({ length: n + 1 }, (_, i) => [i + 1, { id: i + 1, x: 0, z: length * i / n }])),
    materials: new Map([[1, { id: 1, e, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz }]]),
    elements: new Map(Array.from({ length: n }, (_, i) => [i + 1, { id: i + 1, type: 'frame', nodeI: i + 1, nodeJ: i + 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }])),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
    loads: [{ type: 'nodal', data: { nodeId: n + 1, fx: 1, fz: -frac * pcr, my: 0 } }],
  };
}

it.each([0.5, 1.5])('preserves the 2D engine stability verdict at P/Pcr=%s', (fraction) => {
  const input = column(fraction);
  const raw = JSON.parse(solve_pdelta_2d(JSON.stringify(input2DToWireObject(input)), 50, 1e-8));
  expect(raw.converged).toBe(true);
  expect(raw.isStable).toBe(fraction < 1);
  const r = solvePDelta(input, 50, 1e-8);
  expect(r.isStable).toBe(raw.isStable);
  expect(r.b2Factor).toBe(raw.b2Factor ?? Infinity);
  expect(formatPDeltaFactor(r.b2Factor)).toBe(fraction > 1 ? '∞' : raw.b2Factor.toFixed(3));
  // Persisting an infinite factor through JSON must still be displayable.
  expect(formatPDeltaFactor(JSON.parse(JSON.stringify(r)).b2Factor)).toBe(formatPDeltaFactor(r.b2Factor));
});

it.each([0.5, 1.5])('preserves the 3D engine stability verdict at P/Pcr=%s', (fraction) => {
  const m = column(fraction);
  const input: SolverInput3D = {
    ...m,
    nodes: new Map([...m.nodes].map(([id, n]) => [id, { ...n, y: 0 }])),
    sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]]),
    elements: new Map([...m.elements].map(([id, { hingeStart, hingeEnd, ...e }]) => [id, { ...e, localYx: 0, localYy: 1, localYz: 0, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
    supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
    loads: m.loads.flatMap(l => l.type === 'nodal' ? [{ type: 'nodal' as const, data: { ...l.data, fy: 0, mx: 0, mz: 0 } }] : []),
  };
  const raw = JSON.parse(solve_pdelta_3d(serializeInput3D(input), 50, 1e-8));
  expect(raw.converged).toBe(true);
  expect(raw.isStable).toBe(fraction < 1);
  const r = solvePDelta3D(input, 50, 1e-8);
  expect(r.isStable).toBe(raw.isStable);
  expect(r.b2Factor).toBe(raw.b2Factor ?? Infinity);
  expect(formatPDeltaFactor(r.b2Factor)).toBe(fraction > 1 ? '∞' : raw.b2Factor.toFixed(3));
});
