/**
 * Temperature in second-order and plastic analysis, through the WASM boundary
 * the app uses.
 *
 * The Rust tests pin both fixes at the source (engine/tests/core/pdelta.rs,
 * engine/tests/core/plastic.rs); this pins them where the app meets them,
 * against closed forms:
 *
 *   · a strut fixed at both ends and heated carries −EAαΔT; second order
 *     amplifies a small transverse load on it by ≈ 1/(1 − N/Pcr);
 *   · a temperature puts no load on a structure, so a fixed-fixed beam under
 *     a central load collapses at 8Mp/(PL) whatever the temperature.
 */
import { describe, it, expect } from 'vitest';
import { solve, solve3D, solvePDelta, solvePDelta3D, solvePlastic } from '../wasm-solver';
import type { SolverInput, SolverLoad } from '../types';
import type { SolverInput3D, SolverLoad3D } from '../types-3d';

const E = 200_000, A = 0.01, I = 1e-4, SEG = 8, L = 5, DT = 400, MID = SEG / 2 + 1;
const N = E * 1000 * A * 12e-6 * DT;
const PCR = (4 * Math.PI ** 2 * E * 1000 * I) / L ** 2;
const AMP = 1 / (1 - N / PCR);

function strut2D(): SolverInput {
  return {
    nodes: new Map(Array.from({ length: SEG + 1 }, (_, k) => [k + 1, { id: k + 1, x: (L * k) / SEG, z: 0 }])),
    materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: A, iz: I }]]),
    elements: new Map(Array.from({ length: SEG }, (_, k) => [k + 1, {
      id: k + 1, type: 'frame', nodeI: k + 1, nodeJ: k + 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false,
    }])),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: SEG + 1, type: 'fixed' }]]),
    loads: [
      ...Array.from({ length: SEG }, (_, k): SolverLoad => ({ type: 'thermal', data: { elementId: k + 1, dtUniform: DT, dtGradient: 0 } })),
      { type: 'nodal', data: { nodeId: MID, fx: 0, fz: -1, my: 0 } },
    ],
  } as unknown as SolverInput;
}

function strut3D(): SolverInput3D {
  const fixed = (nodeId: number) => ({ nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true });
  return {
    nodes: new Map(Array.from({ length: SEG + 1 }, (_, k) => [k + 1, { id: k + 1, x: (L * k) / SEG, y: 0, z: 0 }])),
    materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: A, iy: I, iz: 2 * I, j: 1.5e-4 }]]),
    elements: new Map(Array.from({ length: SEG }, (_, k) => [k + 1, { id: k + 1, type: 'frame', nodeI: k + 1, nodeJ: k + 2, materialId: 1, sectionId: 1 }])),
    supports: new Map([[1, fixed(1)], [2, fixed(SEG + 1)]]),
    loads: [
      ...Array.from({ length: SEG }, (_, k): SolverLoad3D => ({ type: 'thermal', data: { elementId: k + 1, dtUniform: DT, dtGradientY: 0, dtGradientZ: 0 } })),
      { type: 'nodal', data: { nodeId: MID, fx: 0, fy: 0, fz: -1, mx: 0, my: 0, mz: 0 } } as SolverLoad3D,
    ],
  } as unknown as SolverInput3D;
}

const midUz = (r: { displacements: Array<{ nodeId: number; uz: number }> }) => r.displacements.find((d) => d.nodeId === MID)!.uz;

describe('P-Delta reads the compression a temperature causes', () => {
  it('plane: a heated fixed-fixed strut amplifies a transverse load by 1/(1 − N/Pcr)', () => {
    const input = strut2D();
    const amp = midUz(solvePDelta(input, 50, 1e-8).results) / midUz(solve(input));
    expect(Math.abs(amp - AMP) / AMP).toBeLessThan(0.03);
  });

  it('space: the same strut', () => {
    const input = strut3D();
    const amp = midUz(solvePDelta3D(input, 50, 1e-8).results) / midUz(solve3D(input) as never);
    expect(Math.abs(amp - AMP) / AMP).toBeLessThan(0.03);
  });
});

describe('plastic collapse is not moved by a temperature', () => {
  const MP = 250e3 * 0.1 * 0.3464 ** 2 / 4;
  const beam = (extra: SolverLoad[]) => solvePlastic({
    solver: {
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 3, z: 0 }], [3, { id: 3, x: 6, z: 0 }]]),
      materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: A, iz: I }]]),
      elements: new Map([1, 2].map((id) => [id, { id, type: 'frame', nodeI: id, nodeJ: id + 1, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }])),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: 3, type: 'fixed' }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -50, my: 0 } }, ...extra],
    } as unknown as SolverInput,
    sections: new Map([[1, { a: A, iz: I, materialId: 1, b: 0.1, h: 0.3464 }]]),
    materials: new Map([[1, { fy: 250 }]]),
  });
  const grad = (elementId: number, dt: number): SolverLoad => ({ type: 'thermal', data: { elementId, dtUniform: 0, dtGradient: dt } });

  for (const [label, extra] of [
    ['no temperature', []],
    ['a uniform ΔT', [{ type: 'thermal', data: { elementId: 1, dtUniform: 30, dtGradient: 0 } }]],
    ['a gradient on both halves', [grad(1, 10), grad(2, 10)]],
    ['a gradient on one half', [grad(1, 30)]],
    ['a reversed gradient on the other half', [grad(2, -25)]],
  ] as Array<[string, SolverLoad[]]>) {
    it(`fixed-fixed beam, central load, ${label}: λ = 8Mp/(PL)`, () => {
      const r = beam(extra);
      expect(r.isMechanism).toBe(true);
      expect(r.collapseFactor).toBeCloseTo(8 * MP / (50 * 6), 2);
    });
  }
});
