/**
 * The discretization-error exports (docs/verification/DISCRETIZATION.md): an estimate that is
 * never presented as certified, and a convergence check that refines and re-solves.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver, callCertify, hasCertify } from '../wasm-solver';

beforeAll(async () => { await initSolver(); });

/** An n × n MITC4 square plate (side 1 m, t = 0.1 m), edges simply supported, uniform pressure. */
function plateWire(n: number, extra: Record<string, unknown> = {}) {
  const nodes: Record<string, unknown> = {};
  const quads: Record<string, unknown> = {};
  const supports: Record<string, unknown> = {};
  const loads: unknown[] = [];
  const id = (i: number, j: number) => i * (n + 1) + j + 1;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      nodes[id(i, j)] = { id: id(i, j), x: i / n, y: j / n, z: 0 };
      if (i === 0 || j === 0 || i === n || j === n) {
        const pin = i === 0 && j === 0;
        supports[id(i, j)] = {
          nodeId: id(i, j), rx: pin, ry: pin || (i === n && j === 0), rz: true, rrx: false, rry: false, rrz: false,
        };
      }
    }
  }
  let q = 1;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      quads[q] = { id: q, nodes: [id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)], materialId: 1, thickness: 0.1 };
      loads.push({ type: 'quadPressure', data: { elementId: q, pressure: -10 } });
      q++;
    }
  }
  return {
    nodes, materials: { 1: { id: 1, e: 30000, nu: 0.2 } }, sections: {}, elements: {}, supports, loads,
    plates: {}, quads, curvedShells: {}, constraints: [], connectors: {}, leftHand: false, ...extra,
  };
}

describe('discretization error', () => {
  it('the WASM build carries the exports', () => {
    expect(hasCertify('estimate_discretization_3d')).toBe(true);
    expect(hasCertify('convergence_study_3d')).toBe(true);
  });

  it('the estimate is never certified, and falls as the mesh is refined', () => {
    const coarse = callCertify('estimate_discretization_3d', [plateWire(2)]);
    const fine = callCertify('estimate_discretization_3d', [plateWire(8)]);
    for (const e of [coarse, fine]) {
      expect(e.certified).toBe(false);
      expect(e.notes).toContain('notCertified');
      expect(e.relativeError).toBeGreaterThan(0);
    }
    expect(fine.elements).toHaveLength(64);
    expect(fine.relativeError).toBeLessThan(coarse.relativeError / 2);
    expect(coarse.exceedsThreshold).toBe(true);
  });

  it('the convergence check reports governing quantities with an extrapolation', () => {
    const s = callCertify('convergence_study_3d', [plateWire(4), null]);
    expect(s.certified).toBe(false);
    expect(s.levels.map((l: { shellElements: number }) => l.shellElements)).toEqual([16, 64, 256]);
    const disp = s.quantities.find((q: { quantity: string }) => q.quantity === 'maxDisplacement');
    expect(disp.values).toHaveLength(3);
    expect(disp.extrapolated).toBeGreaterThan(disp.values[0]);
    // A quantity that converged exactly has no observed order: absent, not null, over the WASM
    // boundary (the panel must treat both as missing).
    const reaction = s.quantities.find((q: { quantity: string }) => q.quantity === 'reaction');
    expect(reaction.status).toBe('converged');
    expect(reaction.observedOrder == null).toBe(true);
  });

  it('a model with constraints is refused, not refined wrongly', () => {
    const wire = plateWire(2, { constraints: [{ type: 'equalDOF', masterNode: 5, slaveNode: 6, dofs: [0] }] });
    expect(() => callCertify('convergence_study_3d', [wire, null])).toThrow(/constraints/);
  });
});
