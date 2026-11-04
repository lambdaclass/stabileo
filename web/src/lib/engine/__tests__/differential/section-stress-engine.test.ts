/**
 * Differential test: the engine's section stresses against the TypeScript oracle.
 *
 * `section-stress.ts` and `section-stress-3d.ts` used to compute every stress in TypeScript
 * whenever the engine was not loaded, without saying so. They now ask the engine only and throw
 * `EngineUnavailableError` otherwise. The old TypeScript is `section-stress-oracle.ts`; here the
 * engine is compared with it on random members, sections and fibres, and the app's entry points
 * are shown to refuse rather than compute when the engine is absent.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fc from 'fast-check';

const flags = vi.hoisted(() => ({ engineDown: false }));
vi.mock('../../wasm-solver', async (orig) => {
  const actual = await orig<typeof import('../../wasm-solver')>();
  return { ...actual, isWasmReady: () => !flags.engineDown && actual.isWasmReady() };
});

import { analyzeSectionStress } from '../../section-stress';
import { analyzeSectionStress3D, analyzeSectionStressFromForces } from '../../section-stress-3d';
import { EngineUnavailableError } from '../../engine-unavailable';
import { analyzeSectionStressOracle, analyzeSectionStress3DOracle, analyzeSectionStressFromForcesOracle } from './section-stress-oracle';
import type { Section } from '../../../store/model.svelte';
import type { ElementForces3D } from '../../types-3d';
import type { ElementForces } from '../../types';

// Relative 1e-9 of the section's stress scale, and never tighter than 1 Pa: the engine zeroes a
// torsion or shear stress of a few nPa that the oracle carries as rounding noise.
const close = (a: number, b: number, scale: number) =>
  expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(Math.max(1e-9 * Math.max(1, Math.abs(scale)), 1e-6));

/** Doubly symmetric sections, each with every dimension the resolver reads, so nothing is guessed. */
const section = fc.oneof(
  fc.record({ b: fc.double({ min: 0.1, max: 0.6, noNaN: true }), h: fc.double({ min: 0.1, max: 1.2, noNaN: true }) }).map(({ b, h }): Section => ({
    id: 1, name: 'R', shape: 'rect', b, h, a: b * h, iy: (b * h ** 3) / 12, iz: (h * b ** 3) / 12, j: 0.2 * b ** 3 * h,
  } as Section)),
  fc.record({
    b: fc.double({ min: 0.08, max: 0.4, noNaN: true }), h: fc.double({ min: 0.12, max: 0.9, noNaN: true }),
    tw: fc.double({ min: 0.005, max: 0.02, noNaN: true }), tf: fc.double({ min: 0.006, max: 0.03, noNaN: true }),
  }).map(({ b, h, tw, tf }): Section => {
    const hw = h - 2 * tf;
    const a = 2 * b * tf + hw * tw;
    const iy = (b * h ** 3 - (b - tw) * hw ** 3) / 12;
    const iz = (2 * tf * b ** 3 + hw * tw ** 3) / 12;
    return { id: 2, name: 'I-test', shape: 'I', b, h, tw, tf, a, iy, iz, j: (2 * b * tf ** 3 + hw * tw ** 3) / 3 } as Section;
  }),
  fc.record({ b: fc.double({ min: 0.08, max: 0.4, noNaN: true }), h: fc.double({ min: 0.08, max: 0.5, noNaN: true }), t: fc.double({ min: 0.003, max: 0.012, noNaN: true }) })
    .map(({ b, h, t }): Section => {
      const bi = b - 2 * t, hi = h - 2 * t;
      return { id: 3, name: 'RHS-test', shape: 'RHS', b, h, t, a: b * h - bi * hi, iy: (b * h ** 3 - bi * hi ** 3) / 12, iz: (h * b ** 3 - hi * bi ** 3) / 12, j: (2 * t * (b - t) ** 2 * (h - t) ** 2) / (b + h - 2 * t) } as Section;
    }),
  fc.record({ d: fc.double({ min: 0.06, max: 0.6, noNaN: true }), t: fc.double({ min: 0.003, max: 0.015, noNaN: true }) })
    .map(({ d, t }): Section => {
      const ri = d / 2 - t;
      const i = (Math.PI / 4) * ((d / 2) ** 4 - ri ** 4);
      return { id: 4, name: 'CHS-test', shape: 'CHS', b: d, h: d, t, a: Math.PI * ((d / 2) ** 2 - ri ** 2), iy: i, iz: i, j: 2 * i } as Section;
    }),
);

const force = fc.double({ min: -500, max: 500, noNaN: true });
const fraction = fc.double({ min: 0, max: 1, noNaN: true });

function ef3D(f: number[], L: number): ElementForces3D {
  const [n1, n2, vy, vz, mx, my1, mz1, qy, qz] = f;
  return {
    elementId: 1, length: L,
    nStart: n1!, nEnd: n2!, vyStart: vy!, vyEnd: vy! + qy! * L, vzStart: vz!, vzEnd: vz! + qz! * L,
    mxStart: mx!, mxEnd: mx!, myStart: my1!, myEnd: my1! + vz! * L + (qz! * L * L) / 2,
    mzStart: mz1!, mzEnd: mz1! - vy! * L - (qy! * L * L) / 2,
    hingeStart: false, hingeEnd: false,
    qYI: qy!, qYJ: qy!, distributedLoadsY: [{ qI: qy!, qJ: qy!, a: 0, b: L }], pointLoadsY: [],
    qZI: qz!, qZJ: qz!, distributedLoadsZ: [{ qI: qz!, qJ: qz!, a: 0, b: L }], pointLoadsZ: [],
  } as unknown as ElementForces3D;
}

describe('section stresses: engine against the TypeScript oracle', () => {
  it('biaxial, from forces, at random fibres', () => {
    let compared = 0;
    fc.assert(fc.property(section, fc.array(force, { minLength: 6, maxLength: 6 }), fraction, fraction, (sec, [N, Vy, Vz, Mx, My, Mz], fy, fz) => {
      const yF = (fy - 0.5) * sec.h!, zF = (fz - 0.5) * sec.b!;
      const e = analyzeSectionStressFromForces(N!, Vy!, Vz!, Mx!, My!, Mz!, sec, 355, yF, zF);
      const o = analyzeSectionStressFromForcesOracle(N!, Vy!, Vz!, Mx!, My!, Mz!, sec, 355, yF, zF);
      const scale = Math.max(Math.abs(o.sigmaAtFiber), o.tauTotal, 1);
      close(e.sigmaAtFiber, o.sigmaAtFiber, scale);
      close(Math.abs(e.tauVzAtFiber), Math.abs(o.tauVzAtFiber), scale);
      close(Math.abs(e.tauVyAtFiber), Math.abs(o.tauVyAtFiber), scale);
      close(Math.abs(e.tauTorsion), Math.abs(o.tauTorsion), scale);
      close(e.failure.vonMises, o.failure.vonMises, scale);
      compared++;
    }), { numRuns: 2000, seed: 321 });
    expect(compared).toBe(2000);
  }, 120_000);

  it('3D members with distributed loads, at random stations', () => {
    fc.assert(fc.property(section, fc.array(force, { minLength: 9, maxLength: 9 }), fc.double({ min: 0.5, max: 12, noNaN: true }), fraction, (sec, f, L, t) => {
      const ef = ef3D(f, L);
      const e = analyzeSectionStress3D(ef, sec, 355, t);
      const o = analyzeSectionStress3DOracle(ef, sec, 355, t);
      const scale = Math.max(Math.abs(o.N), Math.abs(o.My), Math.abs(o.Mz), Math.abs(o.sigmaAtFiber), 1);
      for (const k of ['N', 'Vy', 'Vz', 'Mx', 'My', 'Mz'] as const) close(e[k], o[k], scale);
      close(e.sigmaAtFiber, o.sigmaAtFiber, scale);
      close(e.failure.vonMises, o.failure.vonMises, scale);
    }), { numRuns: 1000, seed: 322 });
  }, 120_000);

  it('2D members, at random stations and fibres', () => {
    fc.assert(fc.property(section, fc.array(force, { minLength: 4, maxLength: 4 }), fc.double({ min: 0.5, max: 12, noNaN: true }), fraction, fraction, (sec, [n, v, m, q], L, t, fy) => {
      const ef = {
        elementId: 1, length: L, nStart: n!, nEnd: n!, vStart: v!, vEnd: v! - q! * L, mStart: m!, mEnd: m! + v! * L - (q! * L * L) / 2,
        qI: q!, qJ: q!, pointLoads: [], distributedLoads: [{ qI: q!, qJ: q!, a: 0, b: L }], hingeStart: false, hingeEnd: false,
      } as unknown as ElementForces;
      const y = (fy - 0.5) * sec.h!;
      const e = analyzeSectionStress(ef, sec, 355, t, y);
      const o = analyzeSectionStressOracle(ef, sec, 355, t, y);
      const scale = Math.max(Math.abs(o.M), Math.abs(o.N), Math.abs(o.sigmaAtY), 1);
      for (const k of ['N', 'V', 'M'] as const) close(e[k], o[k], scale);
      close(e.sigmaAtY, o.sigmaAtY, scale);
      close(Math.abs(e.tauAtY), Math.abs(o.tauAtY), scale);
      close(e.failure.vonMises, o.failure.vonMises, scale);
    }), { numRuns: 1000, seed: 323 });
  }, 120_000);
});

describe('without the engine the app refuses, it does not compute', () => {
  afterEach(() => { flags.engineDown = false; });

  it('every section-stress entry point throws EngineUnavailableError', () => {
    flags.engineDown = true;
    const sec = { id: 1, name: 'R', shape: 'rect', b: 0.2, h: 0.4, a: 0.08, iy: 1.0667e-3, iz: 2.667e-4, j: 1e-4 } as Section;
    const ef = ef3D([10, 10, 5, 5, 0, 1, 1, 0, 0], 4);
    expect(() => analyzeSectionStress3D(ef, sec, 355, 0.5)).toThrow(EngineUnavailableError);
    expect(() => analyzeSectionStressFromForces(1, 2, 3, 4, 5, 6, sec, 355)).toThrow(EngineUnavailableError);
    const ef2 = { elementId: 1, length: 4, nStart: 1, nEnd: 1, vStart: 1, vEnd: 1, mStart: 0, mEnd: 4, qI: 0, qJ: 0, pointLoads: [], distributedLoads: [], hingeStart: false, hingeEnd: false } as unknown as ElementForces;
    expect(() => analyzeSectionStress(ef2, sec, 355, 0.5)).toThrow(EngineUnavailableError);
  });
});
