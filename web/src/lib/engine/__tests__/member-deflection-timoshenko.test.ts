/**
 * The displaced curve of a shear-flexible (Timoshenko) member, in both local planes: against the
 * closed forms, and against the engine's own exact `compute_deformed_shape` (given G·As), with
 * point, uniform and partial trapezoidal loads and released ends. An Euler–Bernoulli member's
 * curve is untouched.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { memberLocalCurve, eiOf, type ElementEI } from '../member-deflection';
import { computeLocalAxes3D } from '../local-axes-3d';
import { initSolver, computeDeformedShape } from '../wasm-solver';
import type { Displacement3D, ElementForces3D } from '../types-3d';
import type { Section } from '../../store/model.svelte';

beforeAll(async () => { await initSolver(); });

type Dist = { qI: number; qJ: number; a: number; b: number };
type Pt = { a: number; p: number };
type Plane = 'Y' | 'Z';

const L = 2.4;
const I = { x: 1, y: -0.5, z: 0.3 }, J = { x: 1 + 1.2, y: -0.5 + 1.6, z: 0.3 + 1.2 }; // |IJ| = √(1.44+2.56+1.44)
const Lij = Math.hypot(1.2, 1.6, 1.2);
const straight = { x: 0, y: 0, z: 0 }, along = { x: L, y: 0, z: 0 };

/** Forces carrying only what the curve reads: the loads and releases of one plane. */
function forces(plane: Plane, len: number, dist: Dist[], pts: Pt[], hinges: [boolean, boolean]): ElementForces3D {
  const y = plane === 'Y', z = plane === 'Z';
  return {
    elementId: 1, length: len,
    releaseMzStart: y && hinges[0], releaseMzEnd: y && hinges[1],
    releaseMyStart: z && hinges[0], releaseMyEnd: z && hinges[1],
    releaseTStart: false, releaseTEnd: false,
    distributedLoadsY: y ? dist : [], pointLoadsY: y ? pts : [],
    distributedLoadsZ: z ? dist : [], pointLoadsZ: z ? pts : [],
  } as unknown as ElementForces3D;
}

/**
 * Global nodal displacements giving, in `plane`, the transverse displacement v and the section
 * rotation ψ at each end: local Y takes θz = ψ, local Z takes θy = −ψ (θy = −dw/dx).
 */
function ends(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, plane: Plane,
  vI: number, psiI: number, vJ: number, psiJ: number): [Displacement3D, Displacement3D] {
  const { ey, ez } = computeLocalAxes3D({ id: 0, ...a }, { id: 1, ...b });
  const t = plane === 'Y' ? ey : ez;
  const r = plane === 'Y' ? ez : ey;
  const sg = plane === 'Y' ? 1 : -1;
  const d = (id: number, v: number, psi: number): Displacement3D => ({
    nodeId: id, ux: v * t[0]!, uy: v * t[1]!, uz: v * t[2]!,
    rx: sg * psi * r[0]!, ry: sg * psi * r[1]!, rz: sg * psi * r[2]!,
  });
  return [d(0, vI, psiI), d(1, vJ, psiJ)];
}

function curve(plane: Plane, ei: ElementEI, endVals: [number, number, number, number], dist: Dist[], pts: Pt[],
  hinges: [boolean, boolean] = [false, false], a = straight, b = along, segments: number | number[] = 20) {
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const [dI, dJ] = ends(a, b, plane, ...endVals);
  const c = memberLocalCurve(a, b, dI, dJ, forces(plane, len, dist, pts, hinges), ei, undefined, undefined, false, segments)!;
  return { c, along: plane === 'Y' ? c.v : c.w, across: plane === 'Y' ? c.w : c.v };
}

/** EI and G·As of the plane under test (the other plane's are different, to catch a mix-up). */
function eiFor(plane: Plane, EI: number, GA: number | undefined): ElementEI {
  return plane === 'Y'
    ? { EIz: EI, EIy: 7 * EI, ...(GA ? { GAz: GA, GAy: 3 * GA } : {}) }
    : { EIy: EI, EIz: 7 * EI, ...(GA ? { GAy: GA, GAz: 3 * GA } : {}) };
}

/** The engine's 2D exact curve on a member along x, for the same plane. */
function engine(EI: number, GA: number | undefined, endVals: [number, number, number, number], dist: Dist[], pts: Pt[],
  hinges: [boolean, boolean], len = L): number[] {
  const [vI, rI, vJ, rJ] = endVals;
  const out = computeDeformedShape({
    nodeIx: 0, nodeIy: 0, nodeJx: len, nodeJy: 0,
    uIx: 0, uIy: vI, rIz: rI, uJx: 0, uJy: vJ, rJz: rJ,
    scale: 1, length: len, hingeStart: hinges[0], hingeEnd: hinges[1],
    ei: EI, ...(GA ? { gas: GA } : {}),
    loadPoints: pts.map((p) => [p.a, p.p]), distLoads: dist.map((d) => [d.qI, d.qJ, d.a, d.b]),
  }) as Array<{ x: number; y: number }>;
  return out.map((p) => p.y);
}

const close = (a: number, b: number, rel = 1e-10) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(Math.abs(b), 1e-12));

describe('Timoshenko member curve, closed forms', () => {
  const EI = 8.0e3, GA = 2.0e4;

  for (const plane of ['Y', 'Z'] as const) {
    it(`cantilever, point load at a: P x²(3a − x)/6EI + P x/GAs, local ${plane} plane`, () => {
      const a = 1.5, P = -10;
      const v = (x: number) => x <= a
        ? P * x * x * (3 * a - x) / (6 * EI) + P * x / GA
        : P * a * a * (3 * x - a) / (6 * EI) + P * a / GA;
      const psiTip = P * a * a / (2 * EI);
      for (const hingeEnd of [false, true]) {
        // A released end's rotation is the node's, not the member's: ignored.
        const { c, along, across } = curve(plane, eiFor(plane, EI, GA), [0, 0, v(L), hingeEnd ? 0.123 : psiTip], [], [{ a, p: P }], [false, hingeEnd]);
        c.xi.forEach((xi, k) => close(along[k]!, v(xi * L), 1e-11));
        across.forEach((w) => expect(Math.abs(w)).toBeLessThan(1e-15));
      }
    });

    it(`cantilever, tip load: PL³/3EI + PL/GAs at the tip, local ${plane} plane`, () => {
      const P = 7;
      const tip = P * L ** 3 / (3 * EI) + P * L / GA;
      const { along } = curve(plane, eiFor(plane, EI, GA), [0, 0, tip, P * L * L / (2 * EI)], [], [{ a: L, p: P }]);
      close(along[20]!, tip);
      // And with the load as a nodal one (no member load), the same curve.
      const nodal = curve(plane, eiFor(plane, EI, GA), [0, 0, tip, P * L * L / (2 * EI)], [], []).along;
      nodal.forEach((v, k) => close(v, along[k]!, 1e-10));
      // Euler–Bernoulli would read the tip and miss the shear in between.
      const eb = curve(plane, eiFor(plane, EI, undefined), [0, 0, tip, P * L * L / (2 * EI)], [], []).along;
      expect(Math.abs(eb[5]! - along[5]!)).toBeGreaterThan(1e-5);
    });

    it(`uniform load, fixed and pinned: qL⁴/384EI and 5qL⁴/384EI, + qL²/8GAs, local ${plane} plane`, () => {
      const q = -3;
      const dist = [{ qI: q, qJ: q, a: 0, b: L }];
      const fixed = curve(plane, eiFor(plane, EI, GA), [0, 0, 0, 0], dist, []).along;
      close(fixed[10]!, q * L ** 4 / (384 * EI) + q * L * L / (8 * GA));
      const pinned = curve(plane, eiFor(plane, EI, GA), [0, 0.7, 0, -0.7], dist, [], [true, true]).along;
      close(pinned[10]!, 5 * q * L ** 4 / (384 * EI) + q * L * L / (8 * GA));
      // A partial pair making up the full load reads the same.
      const split = curve(plane, eiFor(plane, EI, GA), [0, 0.7, 0, -0.7], [{ qI: q, qJ: q, a: 0, b: 0.9 }, { qI: q, qJ: q, a: 0.9, b: L }], [], [true, true]).along;
      close(split[10]!, pinned[10]!);
    });
  }
});

describe('Timoshenko member curve, against the engine', () => {
  const EI = 5.0e3, GA = 1.2e4;
  const cases: Array<{ name: string; dist: Dist[]; pts: Pt[]; hinges: [boolean, boolean] }> = [
    { name: 'point loads', dist: [], pts: [{ a: 0.4, p: -6 }, { a: 1.9, p: 3 }], hinges: [false, false] },
    { name: 'uniform', dist: [{ qI: -4, qJ: -4, a: 0, b: L }], pts: [], hinges: [false, false] },
    { name: 'partial trapezoid', dist: [{ qI: -2, qJ: -7, a: 0.5, b: 1.7 }], pts: [], hinges: [false, false] },
    { name: 'all, released at I', dist: [{ qI: 1, qJ: -5, a: 0.3, b: 2.1 }, { qI: -2, qJ: -2, a: 0, b: L }], pts: [{ a: 1.1, p: -4 }], hinges: [true, false] },
    { name: 'all, released at J', dist: [{ qI: -6, qJ: 0, a: 0, b: 1.4 }], pts: [{ a: 2.0, p: 5 }], hinges: [false, true] },
    { name: 'all, released at both', dist: [{ qI: -3, qJ: -1, a: 0.2, b: 2.2 }], pts: [{ a: 0.8, p: -2 }], hinges: [true, true] },
  ];
  const endVals: [number, number, number, number] = [1.3e-3, -2.1e-3, -0.8e-3, 1.7e-3];

  for (const plane of ['Y', 'Z'] as const) {
    for (const k of cases) {
      it(`${k.name}, local ${plane} plane`, () => {
        const want = engine(EI, GA, endVals, k.dist, k.pts, k.hinges);
        const { along } = curve(plane, eiFor(plane, EI, GA), endVals, k.dist, k.pts, k.hinges);
        expect(along).toHaveLength(want.length);
        along.forEach((v, i) => close(v, want[i]!, 1e-9));
        // A skewed member in space: the same curve in its own axes.
        const skew = curve(plane, eiFor(plane, EI, GA), endVals, k.dist.map((d) => ({ ...d, a: d.a * Lij / L, b: d.b * Lij / L })),
          k.pts.map((p) => ({ ...p, a: p.a * Lij / L })), k.hinges, I, J).along;
        const wantSkew = engine(EI, GA, endVals, k.dist.map((d) => ({ ...d, a: d.a * Lij / L, b: d.b * Lij / L })),
          k.pts.map((p) => ({ ...p, a: p.a * Lij / L })), k.hinges, Lij);
        skew.forEach((v, i) => close(v, wantSkew[i]!, 1e-9));
      });
    }
  }

  it('Euler–Bernoulli (no G·As): the curve is unchanged, and matches the engine without gas', () => {
    for (const plane of ['Y', 'Z'] as const) {
      for (const k of cases) {
        const want = engine(EI, undefined, endVals, k.dist, k.pts, k.hinges);
        const { along } = curve(plane, eiFor(plane, EI, undefined), endVals, k.dist, k.pts, k.hinges);
        // The web's Euler–Bernoulli curve integrates a partial load with Simpson's rule.
        along.forEach((v, i) => expect(Math.abs(v - want[i]!)).toBeLessThan(1e-6 * Math.max(...want.map(Math.abs))));
        // A shear stiffness so large it does nothing converges on it.
        const stiff = curve(plane, eiFor(plane, EI, 1e15), endVals, k.dist, k.pts, k.hinges).along;
        stiff.forEach((v, i) => expect(Math.abs(v - want[i]!)).toBeLessThan(1e-9));
      }
    }
  });
});

describe('eiOf: the shear stiffness as the solve takes it', () => {
  const material = { e: 210000, nu: 0.3 };
  const section = { id: 1, name: 'R', a: 0.02, iy: 1e-4, iz: 4e-5, j: 1e-5, shearAreas: { basis: 'declared', asY: 0.015, asZ: 0.012 } } as unknown as Section;

  it('G = E/2(1 + ν), As,y with Iy and As,z with Iz', () => {
    const ei = eiOf(material, section)!;
    const G = 210000e3 / 2.6;
    close(ei.GAy!, G * 0.015, 1e-14);
    close(ei.GAz!, G * 0.012, 1e-14);
  });

  it('none without shear areas, or with shear deformation turned off', () => {
    const plain = eiOf(material, { ...section, shearAreas: undefined } as Section)!;
    expect(plain.GAy).toBeUndefined();
    expect(plain.GAz).toBeUndefined();
    const off = eiOf(material, section, { shearDeformation: 'none' })!;
    expect(off.GAy).toBeUndefined();
    expect(off.EIy).toBe(plain.EIy);
  });
});
