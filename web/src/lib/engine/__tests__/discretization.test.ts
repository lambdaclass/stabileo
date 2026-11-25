/**
 * The discretization-error exports (testing/docs/DISCRETIZATION.md): an estimate that is
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
    expect(hasCertify('adapt_mesh_3d')).toBe(true);
  });

  it('adaptive refinement lowers the estimate and gives back a model that solves to it', () => {
    const coarse = callCertify('estimate_discretization_3d', [plateWire(4)]);
    const out = callCertify('adapt_mesh_3d', [plateWire(4), { target: coarse.relativeError / 3, maxPasses: 12 }]);
    expect(out.certified).toBe(false);
    expect(out.status).toBe('converged');
    expect(out.estimate.relativeError).toBeLessThanOrEqual(coarse.relativeError / 3);
    expect(out.passes[0].shellElements).toBe(16);
    expect(out.passes[0].relativeError).toBeCloseTo(coarse.relativeError, 12);
    const last = out.passes[out.passes.length - 1];
    expect(Object.keys(out.input.quads)).toHaveLength(last.shellElements);
    expect(Object.keys(out.input.nodes)).toHaveLength(last.nodes);
    expect(last.shellElements).toBeGreaterThan(16);

    const moved = out.quantities.find((q: { quantity: string }) => q.quantity === 'maxDisplacement');
    expect(moved.model).toBeGreaterThan(0);
    expect(moved.adapted).toBeGreaterThan(0);
    expect(Math.abs(moved.adapted - moved.model) / moved.adapted).toBeLessThan(0.2);

    const again = callCertify('estimate_discretization_3d', [out.input]);
    expect(again.relativeError).toBe(out.estimate.relativeError);
    expect(again.elements).toHaveLength(last.shellElements);
  });

  it('adaptive refinement with no options uses the defaults, and stops where it is told', () => {
    const defaults = callCertify('adapt_mesh_3d', [plateWire(4), null]);
    expect(['converged', 'passLimit']).toContain(defaults.status);
    expect(defaults.passes.length).toBeLessThanOrEqual(9);
    const one = callCertify('adapt_mesh_3d', [plateWire(4), { target: 1e-6, maxPasses: 1 }]);
    expect(one.status).toBe('passLimit');
    expect(one.passes).toHaveLength(2);
    expect(one.passes[0].marked).toBeGreaterThan(0);
    expect(one.passes[1].marked).toBe(0);
  });

  it('adaptive refinement refuses what it cannot run', () => {
    const tied = plateWire(2, { constraints: [{ type: 'equalDOF', masterNode: 5, slaveNode: 6, dofs: [0] }] });
    expect(() => callCertify('adapt_mesh_3d', [tied, null])).toThrow(/constraints/);
    expect(() => callCertify('adapt_mesh_3d', [plateWire(2), { target: 0 }])).toThrow(/target error must be finite and positive/);
    expect(() => callCertify('adapt_mesh_3d', [plateWire(2), { fraction: 2 }])).toThrow(/marked fraction/);
    expect(() => callCertify('adapt_mesh_3d', [plateWire(2), { maxPasses: 1000 }])).toThrow(/At most 50 passes/);
    expect(() => callCertify('adapt_mesh_3d', [plateWire(2), { maxElements: 1e9 }])).toThrow(/At most 200000 shell elements/);
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
