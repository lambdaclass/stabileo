/**
 * Differential test: the CIRSOC 201 section engine (Rust, `cirsoc201_section.rs`) against the
 * TypeScript section engine it replaced (`oracle/cirsoc201-section.ts`, kept verbatim).
 *
 * Every section the CIRSOC_FLEX calculator, the interaction diagrams, the circular and
 * rectangular column checks and the station verifier's biaxial check read now comes from the
 * engine. The oracle is the TypeScript that computed them before: polygon clipping, bars,
 * displaced concrete, φ of CIRSOC 201-2005 and the 0,80·φ·Po cap. On thousands of random valid
 * sections (rectangles, hollow rectangles, T sections, circles and rings; 0–16 bars anywhere
 * inside; ties or spiral; deducting the displaced concrete or not; any neutral-axis direction
 * and depth) the two must give the same state.
 *
 * Disagreements found and resolved against the clause (docs/verification/TS_ENGINE_LOGIC.md):
 *   - none in the 2005 state: Pn, Mnx, Mny, εt, φ, φPn agree to 1e-9;
 *   - the oracle has no 2025: the engine's φ follows Tabla 21.2.2 (tension-controlled at
 *     εty + 0,003, a spiral at 0,75), pinned below against the clause text.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  sectionPoint, interactionCurve, prepareSection, type Bar, type Outline, type Materials, type SectionPoint,
} from '../../codes/argentina/cirsoc201-section';
import { momentCapacityAtAxial, surfaceCut } from '../../codes/argentina/cirsoc-flex-surface';
import { characteristicPoints } from '../../codes/argentina/cirsoc-flex-points';
import * as oracle from './oracle/cirsoc201-section';
import * as oracleSurface from './oracle/cirsoc-flex-surface';
import * as oraclePoints from './oracle/cirsoc-flex-points';

const close = (a: number, b: number, rel = 1e-9, abs = 1e-9) =>
  Math.abs(a - b) <= Math.max(abs, rel * Math.max(Math.abs(a), Math.abs(b)));

/**
 * `scale` (kN, kN·m) is set for circles: the oracle drew a circle as an inscribed 360-gon
 * (0,005 % short of πR², and its extreme fibre short of R off the vertices), the engine integrates
 * the circle exactly. Their difference is that discretisation — bounded by a small fraction of
 * the section's squash load — and the engine's exact segment is pinned separately below.
 */
function samePoint(actual: SectionPoint, expected: SectionPoint, where: string, scale = 0) {
  for (const k of ['Pn', 'Mnx', 'Mny', 'phiPn', 'phiMnx', 'phiMny', 'phi', 'epsilonT', 'c'] as const) {
    const tol = scale > 0 ? ({ Pn: 2e-3, Mnx: 2e-3, Mny: 2e-3, phiPn: 2e-3, phiMnx: 2e-3, phiMny: 2e-3 } as Record<string, number>)[k] : 0;
    const ok = tol
      ? Math.abs(actual[k] - expected[k]) <= tol * scale
      : (k === 'phi' || k === 'epsilonT') && scale > 0
        ? close(actual[k], expected[k], 2e-3, 2e-3)
        : close(actual[k], expected[k], 1e-9, 1e-7);
    expect(ok, `${where}: ${k} engine ${actual[k]} vs oracle ${expected[k]}`).toBe(true);
  }
}

/** A random valid section: an outline and bars inside it. */
const sectionArb = fc.record({
  kind: fc.constantFrom('rect', 'hollow', 'tee', 'circle', 'ring'),
  b: fc.double({ min: 0.15, max: 1.0, noNaN: true }),
  h: fc.double({ min: 0.15, max: 1.2, noNaN: true }),
  holeFrac: fc.double({ min: 0.2, max: 0.6, noNaN: true }),
  bfFrac: fc.double({ min: 1.2, max: 5, noNaN: true }),
  hfFrac: fc.double({ min: 0.1, max: 0.4, noNaN: true }),
  nBars: fc.integer({ min: 0, max: 16 }),
  barSeed: fc.array(fc.tuple(fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }),
    fc.double({ min: 0.5e-4, max: 8e-4, noNaN: true })), { minLength: 16, maxLength: 16 }),
  fc: fc.constantFrom(20, 25, 30, 35, 42, 50, 60, 70),
  fy: fc.constantFrom(220, 420, 500),
  spiral: fc.boolean(),
  deduct: fc.boolean(),
});

type SectionSample = typeof sectionArb extends fc.Arbitrary<infer T> ? T : never;

function build(s: SectionSample): {
  outline: Outline; bars: Bar[]; mat: Materials; depth: number; scale: number;
} {
  const cover = 0.04;
  let outline: Outline;
  let halfX: number, halfY: number;
  switch (s.kind) {
    case 'rect': outline = { kind: 'rect', b: s.b, h: s.h }; halfX = s.b / 2 - cover; halfY = s.h / 2 - cover; break;
    case 'hollow': outline = { kind: 'rect', b: s.b, h: s.h, hole: { b: s.b * s.holeFrac, h: s.h * s.holeFrac } };
      halfX = s.b / 2 - cover; halfY = s.h / 2 - cover; break;
    case 'tee': outline = { kind: 'tee', bf: s.b * s.bfFrac, hf: s.h * s.hfFrac, bw: s.b, h: s.h };
      halfX = s.b / 2 - cover; halfY = s.h / 2 - cover; break;
    case 'circle': outline = { kind: 'circle', D: s.h }; halfX = halfY = (s.h / 2 - cover) / Math.SQRT2; break;
    default: outline = { kind: 'circle', D: s.h, Dint: s.h * s.holeFrac }; halfX = halfY = (s.h / 2 - cover) / Math.SQRT2;
  }
  // Bars in the web/core rectangle (inside every outline; for the hollow ones, maybe in the void
  // — which is still a valid computation for both implementations, and is what a typo gives).
  const bars: Bar[] = s.barSeed.slice(0, s.nBars).map(([u, v, a]) => ({ x: u * Math.max(halfX, 0.01), y: v * Math.max(halfY, 0.01), area: a }));
  const mat: Materials = { fc: s.fc, fy: s.fy, confinement: s.spiral ? 'spiral' : 'ties', deductDisplacedConcrete: s.deduct, edition: '2005' };
  // The squash load (kN) as the tolerance scale for circles, 0 (exact agreement) otherwise.
  const circle = s.kind === 'circle' || s.kind === 'ring';
  const scale = circle ? 0.85 * s.fc * 1000 * Math.PI * (s.h / 2) ** 2 + s.fy * 1000 * bars.reduce((t, b) => t + b.area, 0) : 0;
  return { outline, bars, mat, depth: Math.max(s.h, s.b), scale };
}

describe('section engine vs the TypeScript section engine it replaced', () => {
  it('agrees on the state at any neutral axis (4 000 sections × 4 axes)', () => {
    let evaluated = 0;
    fc.assert(fc.property(sectionArb, fc.array(fc.tuple(fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
      fc.double({ min: 0, max: 3, noNaN: true })), { minLength: 4, maxLength: 4 }), (s, axes) => {
      const { outline, bars, mat, depth, scale } = build(s);
      const section = prepareSection(outline, bars, mat);
      try {
        for (const [theta, k] of axes) {
          const c = k < 0.02 ? k * 1e-6 : k * depth;
          samePoint(section.point(theta, c), oracle.sectionPoint(outline, bars, mat, theta, c), `${s.kind} θ=${theta} c=${c}`, scale);
          evaluated++;
        }
      } finally { section.free(); }
    }), { numRuns: 4000, seed: 20261018 });
    expect(evaluated).toBe(16000);
  });

  it('agrees on the sampled interaction curve (500 sections)', () => {
    fc.assert(fc.property(sectionArb, fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), (s, theta) => {
      const { outline, bars, mat, scale } = build(s);
      const a = interactionCurve(outline, bars, mat, theta, 30);
      const e = oracle.interactionCurve(outline, bars, mat, theta, 30);
      if (scale === 0) {
        // The circle's extreme fibre differs (see `samePoint`), so its sampled depths do too.
        expect(a.length).toBe(e.length);
        a.forEach((p, i) => samePoint(p, e[i], `${s.kind} curve point ${i}`));
      }
    }), { numRuns: 500, seed: 7 });
  });

  it('agrees on the biaxial load contour and the moment capacity at an axial force (150 columns)', () => {
    const columnArb = fc.record({
      b: fc.double({ min: 0.25, max: 0.6, noNaN: true }), h: fc.double({ min: 0.25, max: 0.8, noNaN: true }),
      n: fc.integer({ min: 2, max: 5 }), area: fc.double({ min: 1e-4, max: 5e-4, noNaN: true }),
      fc: fc.constantFrom(20, 25, 30, 40), fy: fc.constantFrom(420, 500),
      puFrac: fc.double({ min: -0.3, max: 0.7, noNaN: true }),
      mx: fc.double({ min: -1, max: 1, noNaN: true }), my: fc.double({ min: -1, max: 1, noNaN: true }),
    });
    fc.assert(fc.property(columnArb, (k) => {
      const outline: Outline = { kind: 'rect', b: k.b, h: k.h };
      const bars: Bar[] = [];
      const hx = k.b / 2 - 0.05, hy = k.h / 2 - 0.05;
      for (let i = 0; i < k.n; i++) {
        const t = k.n === 1 ? 0 : -1 + (2 * i) / (k.n - 1);
        bars.push({ x: t * hx, y: hy, area: k.area }, { x: t * hx, y: -hy, area: k.area });
        if (i > 0 && i < k.n - 1) bars.push({ x: hx, y: t * hy, area: k.area }, { x: -hx, y: t * hy, area: k.area });
      }
      const mat: Materials = { fc: k.fc, fy: k.fy, edition: '2005' };
      const po = 0.85 * k.fc * 1000 * (k.b * k.h) + k.fy * 1000 * bars.reduce((s, b) => s + b.area, 0);
      const Pu = k.puFrac * 0.65 * 0.8 * po;
      const Mx = k.mx * 100, My = k.my * 100;
      const a = momentCapacityAtAxial(outline, bars, mat, Pu, Mx, My);
      const e = oracleSurface.momentCapacityAtAxial(outline, bars, mat, Pu, Mx, My);
      expect(a === null, `reachability at Pu=${Pu}`).toBe(e === null);
      if (a && e) {
        expect(close(a.phiMn, e.phiMn, 1e-7, 1e-6), `φMn ${a.phiMn} vs ${e.phiMn}`).toBe(true);
        expect(close(a.fi, e.fi, 1e-7, 1e-9)).toBe(true);
      }
      const ca = surfaceCut(outline, bars, mat, Pu, { steps: 6 });
      const ce = oracleSurface.surfaceCut(outline, bars, mat, Pu, { steps: 6 });
      expect(ca.length).toBe(ce.length);
      ca.forEach((p, i) => samePoint(p.state, ce[i].state, `cut ${i}`));
    }), { numRuns: 150, seed: 99 });
  });

  it('agrees on the six characteristic points (300 sections)', () => {
    fc.assert(fc.property(sectionArb, (s) => {
      const { outline, bars, mat, scale } = build(s);
      if (bars.length === 0 || scale > 0) return;
      for (const theta of [-Math.PI / 2, Math.PI / 2]) {
        const a = characteristicPoints(outline, bars, mat, theta);
        const e = oraclePoints.characteristicPoints(outline, bars, mat, theta);
        a.forEach((p, i) => {
          expect(p.key).toBe(e[i].key);
          for (const k of ['phiMn', 'phiPn', 'phi', 'epsilonT'] as const) {
            expect(close(p[k], e[i][k], 1e-8, 1e-6), `${p.key}.${k}: ${p[k]} vs ${e[i][k]}`).toBe(true);
          }
        });
      }
    }), { numRuns: 300, seed: 3 });
  });
});

describe('the 2025 edition, which the oracle does not have, follows Tabla 21.2.2', () => {
  /*
   * CIRSOC 201-2025 Tabla 21.2.2: compression-controlled at εt ≤ εty (0,65 ties, 0,75 spiral),
   * tension-controlled at εt ≥ εty + 0,003 (0,90), linear between; εty = fy/Es (21.2.2.1).
   * Tabla 22.4.2.1: Pn,max = 0,80·Po (ties), 0,85·Po (spiral).
   */
  const phi2025 = (et: number, fy: number, spiral: boolean) => {
    const ety = fy / 200000, pc = spiral ? 0.75 : 0.65;
    if (et >= ety + 0.003) return 0.9;
    if (et <= ety) return pc;
    return pc + (0.9 - pc) * (et - ety) / 0.003;
  };
  it('φ and the axial cap on 2 000 random states', () => {
    fc.assert(fc.property(sectionArb, fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), fc.double({ min: 0.001, max: 3, noNaN: true }), (s, theta, k) => {
      const { outline, bars, mat, depth, scale } = build(s);
      if (scale > 0) return;
      const m25: Materials = { ...mat, edition: '2025' };
      const p25 = sectionPoint(outline, bars, m25, theta, k * depth);
      const p05 = oracle.sectionPoint(outline, bars, mat, theta, k * depth);
      // The state is the edition's only through φ and the cap.
      expect(close(p25.Pn, p05.Pn, 1e-9, 1e-7)).toBe(true);
      expect(close(p25.Mnx, p05.Mnx, 1e-9, 1e-7)).toBe(true);
      expect(close(p25.phi, phi2025(p25.epsilonT, s.fy, s.spiral), 1e-12, 1e-12), `φ at εt=${p25.epsilonT}`).toBe(true);
      const info = (() => { const sec = prepareSection(outline, bars, m25); try { return sec.info(); } finally { sec.free(); } })();
      const cap = (s.spiral ? 0.75 * 0.85 : 0.65 * 0.80) * info.Po;
      expect(close(info.phiPnMax, cap, 1e-12, 1e-9)).toBe(true);
      expect(p25.phiPn).toBeLessThanOrEqual(cap * (1 + 1e-12) + 1e-9);
    }), { numRuns: 2000, seed: 11 });
  });
});

describe('without the engine nothing is computed', () => {
  it('prepareSection throws an engine-unavailable error, never integrates in TypeScript', async () => {
    const { registerCirsoc201Engine } = await import('../../codes/argentina/cirsoc201-engine');
    const wasm = await import('../../../wasm/dedaliano_engine.js');
    registerCirsoc201Engine(null);
    try {
      expect(() => prepareSection({ kind: 'rect', b: 0.3, h: 0.3 }, [], { fc: 25, fy: 420 }))
        .toThrow(expect.objectContaining({ code: 'ENGINE_UNAVAILABLE' }));
    } finally {
      registerCirsoc201Engine({
        Section: wasm.Cirsoc201SectionKernel, basis: wasm.cirsoc201_basis, phi: wasm.cirsoc201_phi,
        designBeam: wasm.cirsoc201_design_beam, slabProvisions: wasm.cirsoc201_slab_provisions,
      });
    }
  });
});
