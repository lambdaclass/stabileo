import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { incrementalOutcome, convergedPercent } from '../incremental-outcome';
import { solveCorotational3D, isSolverReady } from '../wasm-solver';
import type { SolverInput3D } from '../types-3d';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(isSolverReady()).toBe(true);
});

/** A shallow two-bar truss loaded at its apex by `p` kN (its limit load is about 150 kN). */
function vonMises(p: number): SolverInput3D {
  const node = (id: number, x: number, z: number) => [id, { id, x, y: 0, z }] as const;
  return {
    nodes: new Map([node(1, 0, 0), node(2, 1, 0.1), node(3, 2, 0)]),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.001, iy: 1e-8, iz: 1e-8, j: 1e-8 }]]),
    elements: new Map([
      [1, { id: 1, type: 'truss', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
      [2, { id: 2, type: 'truss', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1 }],
    ]),
    supports: new Map([
      [1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false }],
      [2, { nodeId: 3, rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false }],
      [3, { nodeId: 2, rx: false, ry: true, rz: false, rrx: false, rry: false, rrz: false }],
    ]),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -p, mx: 0, my: 0, mz: 0 } }],
  } as unknown as SolverInput3D;
}

describe('the engine reports how far an unconverged co-rotational solve got', () => {
  it('beyond the limit load: not converged, the last converged share of the load', () => {
    const r = solveCorotational3D(vonMises(400), 30, 1e-10, 10);
    expect(r.converged).toBe(false);
    expect(r.loadFactor).toBeGreaterThan(0);
    expect(r.loadFactor).toBeLessThan(1);
    expect(incrementalOutcome(r)).toEqual({ kind: 'notConverged', loadFactor: r.loadFactor });
  });
  it('below it: converged at the whole load', () => {
    const r = solveCorotational3D(vonMises(40), 30, 1e-10, 10);
    expect(r.converged).toBe(true);
    expect(r.loadFactor).toBe(1);
    expect(incrementalOutcome(r).kind).toBe('converged');
  });
});

describe('incremental nonlinear outcome', () => {
  it('a converged solve shows its displacements', () => {
    const o = incrementalOutcome({ converged: true, loadFactor: 1, results: { displacements: [{ ux: 1 }] } });
    expect(o).toEqual({ kind: 'converged', displacements: [{ ux: 1 }] });
  });

  it('an unconverged solve shows how far it got and no displacements', () => {
    const o = incrementalOutcome({ converged: false, loadFactor: 0.35, results: { displacements: [{ ux: 9 }] } });
    expect(o).toEqual({ kind: 'notConverged', loadFactor: 0.35 });
    expect('displacements' in o).toBe(false);
  });

  it('a missing or odd load factor is read as nothing converged', () => {
    expect(incrementalOutcome({ converged: false })).toEqual({ kind: 'notConverged', loadFactor: 0 });
    expect(incrementalOutcome({ converged: false, loadFactor: Number.NaN })).toEqual({ kind: 'notConverged', loadFactor: 0 });
    expect(incrementalOutcome({})).toEqual({ kind: 'notConverged', loadFactor: 0 });
  });

  it('the percentage never rounds up', () => {
    expect(convergedPercent(0.999)).toBe('99.9');
    expect(convergedPercent(0.9999)).toBe('99.9');
    expect(convergedPercent(0.35)).toBe('35');
  });

  it('the panel draws nothing from an unconverged co-rotational result', () => {
    const src = readFileSync(fileURLToPath(new URL('../../../components/pro/ProAdvancedTab.svelte', import.meta.url)), 'utf8');
    expect(src).toMatch(/incrementalOutcome\(/);
    expect(src).toMatch(/data-testid="nl-not-converged"/);
  });
});
