/**
 * Differential test: the CIRSOC 201 beam-section checker in the engine against an independent
 * TypeScript statement of the same clauses.
 *
 * The verifier used to compute these numbers in TypeScript (`station-design-forces.ts`). Run
 * against the Rust checker on 4 000 random sections, it disagreed on the unsafe side in four
 * ways (docs/verification/TS_ENGINE_LOGIC.md, "Differential tests"):
 *
 *   1. the tension steel was assumed to yield — up to 18 % too much φMn (641 of 4 000);
 *   2. φ reached 0,90 at εt = 0,005 whatever fy — CIRSOC 201-2025 Tabla 21.2.2 needs
 *      εty + 0,003 (419 of 4 000, up to 2,7 %);
 *   3. stirrups were credited with fy above 420 MPa — 22.5.3.3 (1 335 of 4 000, up to 19 %);
 *   4. a beam was never asked to be ductile — 9.3.3.1 (1 075 of 4 000 random sections fail it).
 *
 * The verifier now asks the engine (`cirsoc201-beam-kernel.ts`). This file keeps the proof that
 * the engine computes what the clause says: `oracle` below is written from the clause text, not
 * from the Rust, and the two must agree on every generated section, for both editions, through
 * both engine entry points (the numeric batch and the JSON checker).
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluateBeamSections, type BeamSectionQuery } from '../../codes/argentina/cirsoc201-beam-kernel';
import { checkCirsoc201Members } from '../../wasm-solver';
import { computeFlexureCapacity, computeShearCapacity } from '../../station-design-forces';

type Edition = '2005' | '2025';
const ES = 200e9;

// ─── The oracle: CIRSOC 201, written from the text ────────────────────────────

function oracleBeta1(fcPa: number): number {
  const f = fcPa / 1e6;
  return f <= 28 ? 0.85 : Math.max(0.65, 0.85 - (0.05 * (f - 28)) / 7);
}

/** Tabla 21.2.2 (2025); §9.3.2 with §10.3.3–10.3.4 (2005). Tied sections. */
function oraclePhi(ed: Edition, et: number, fy: number): number {
  const ety = fy / ES;
  const etc = ed === '2025' ? ety + 0.003 : 0.005;
  if (et >= etc) return 0.9;
  if (et <= ety) return 0.65;
  return 0.65 + (0.25 * (et - ety)) / (etc - ety);
}

/** Strain compatibility, both steels elastic–plastic, block 0,85·f'c over β1·c ≤ h; a compression
 *  bar is net of 0,85·f'c while c > d' and not credited while it is in tension. */
function oracleFlexure(q: BeamSectionQuery) {
  const b1 = oracleBeta1(q.fc);
  const Asc = q.AsComp ?? 0, dp = q.dPrime ?? 0;
  const doubly = Asc > 0 && dp > 0 && dp < q.d;
  const steel = (eps: number) => Math.max(-q.fy, Math.min(q.fy, ES * eps));
  const forces = (c: number) => {
    const a = Math.min(b1 * c, q.h);
    const Cc = 0.85 * q.fc * a * q.b;
    let Cs = 0, fsc = 0;
    if (doubly && c > dp) {
      fsc = steel((0.003 * (c - dp)) / c);
      // Net of the displaced concrete whenever the bar is in compression (c > d'), not only
      // inside the block: the force residual then stays monotone in c (one neutral axis, which
      // the certified check needs), and Mn can only be lower (integration/safety-wave).
      Cs = Asc * Math.max(0, fsc - 0.85 * q.fc);
    }
    const et = (0.003 * (q.d - c)) / c;
    const fst = steel(et);
    return { net: Cc + Cs - q.As * fst, Mn: Cc * (q.d - a / 2) + Cs * (q.d - dp), a, et, fst };
  };
  let lo = 1e-9, hi = q.h / b1 + q.d;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (forces(mid).net < 0) lo = mid; else hi = mid;
  }
  const c = (lo + hi) / 2;
  const s = forces(c);
  const phi = oraclePhi(q.edition as Edition, s.et, q.fy);
  return { phiMn: phi * s.Mn, c, et: s.et, phi, fst: s.fst };
}

/** Tabla 22.5.5.1 with 22.5.5.1.1–3, 22.5.3.1, 22.5.3.3, 22.5.1.2, 9.6.3.4 (2025); §11.3, §11.5 (2005). */
function oracleShear(q: BeamSectionQuery) {
  const ed = q.edition as Edition;
  const fcM = q.fc / 1e6;
  const sq = Math.min(Math.sqrt(fcM), 8.3);
  const bw = q.b * 1000, d = q.d * 1000; // mm
  const fytGiven = (q.fyt || q.fy) / 1e6;
  const fytVs = Math.min(fytGiven, 420);
  const Av = (q.Av ?? 0) * 1e6, s = (q.s ?? 0) * 1000; // mm², mm
  const AvMin = s > 0 ? (ed === '2025' ? Math.max(0.062 * sq, 0.35) : Math.max(sq / 16, 0.33)) * bw * s / fytGiven : 0;
  const below = s === 0 || Av < AvMin;
  const NuAg = (q.NuCompression ?? 0) / ((q.Ag || q.b * q.h) * 1e6); // MPa
  let vc: number;
  if (ed === '2025') {
    const axial = Math.min(NuAg / 6, 0.05 * fcM);
    const rho = q.As / (q.b * q.d);
    const base = below ? 0.66 * Math.min(1, Math.sqrt(2 / (1 + 0.004 * d))) * Math.cbrt(rho) * sq : 0.17 * sq;
    vc = Math.min(Math.max(base + axial, 0), 0.42 * sq);
  } else {
    const k = NuAg >= 0 ? 1 + NuAg / 14 : 1 + 0.3 * NuAg;
    vc = Math.max(0, (k * sq) / 6);
  }
  const Vc = vc * bw * d;
  const Vs = Math.min(s > 0 ? (Av * fytVs * d) / s : 0, (ed === '2025' ? 0.66 : 2 / 3) * sq * bw * d);
  return { Vc, Vs, phiVn: 0.75 * (Vc + Vs), below };
}

// ─── Physically valid random sections ─────────────────────────────────────────

const sectionArb = fc.record({
  edition: fc.constantFrom<Edition>('2005', '2025'),
  fc: fc.double({ min: 20, max: 60, noNaN: true }),
  fy: fc.constantFrom(420, 500),
  b: fc.double({ min: 0.15, max: 0.8, noNaN: true }),
  h: fc.double({ min: 0.2, max: 1.5, noNaN: true }),
  cover: fc.double({ min: 0.025, max: 0.08, noNaN: true }),
  rho: fc.double({ min: 0.0015, max: 0.05, noNaN: true }),
  compFrac: fc.oneof(fc.constant(0), fc.double({ min: 0.05, max: 1.2, noNaN: true })),
  dPrime: fc.double({ min: 0.03, max: 0.09, noNaN: true }),
  stirrup: fc.oneof(fc.constant(null), fc.record({
    dia: fc.constantFrom(6, 8, 10, 12), legs: fc.constantFrom(2, 3, 4, 6),
    s: fc.double({ min: 0.04, max: 0.35, noNaN: true }),
  })),
  fyt: fc.constantFrom(0, 420, 500),
  nuFrac: fc.double({ min: -0.15, max: 0.35, noNaN: true }),
}).map((r) => {
  const d = r.h - r.cover;
  const As = r.rho * r.b * d;
  const Ag = r.b * r.h;
  const leg: Record<number, number> = { 6: 28.3e-6, 8: 50.3e-6, 10: 78.5e-6, 12: 113.1e-6 };
  const q: BeamSectionQuery = {
    edition: r.edition, fc: r.fc * 1e6, fy: r.fy * 1e6, b: r.b, h: r.h, d, As,
    AsComp: r.compFrac > 0 ? As * r.compFrac : 0, dPrime: r.compFrac > 0 ? r.dPrime : 0,
    Av: r.stirrup ? r.stirrup.legs * leg[r.stirrup.dia] : 0, s: r.stirrup ? r.stirrup.s : 0,
    fyt: r.fyt * 1e6, Ag, NuCompression: r.nuFrac * r.fc * 1e6 * Ag,
  };
  return q;
});

const RUNS = 5000;
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-9);

describe('CIRSOC 201 beam sections: engine against the clause', () => {
  it(`flexure and shear agree with the oracle on ${RUNS} sections`, () => {
    fc.assert(fc.property(fc.array(sectionArb, { minLength: 20, maxLength: 20 }), (qs) => {
      const out = evaluateBeamSections(qs);
      expect(out).not.toBeNull();
      qs.forEach((q, i) => {
        const r = out![i];
        const o = oracleFlexure(q);
        expect(r.flexureValid).toBe(true);
        // Both bisect the same monotone residual to ~1e-12·h; 1e-7 is far below any rounding
        // that reaches a verdict (φMn is shown to 0,01 kN·m).
        expect(rel(r.phiMn, o.phiMn)).toBeLessThan(1e-7);
        expect(Math.abs(r.phi - o.phi)).toBeLessThan(1e-6);
        const v = oracleShear(q);
        expect(r.shearValid).toBe(true);
        expect(r.avBelowMin).toBe(v.below);
        expect(rel(r.phiVn, v.phiVn)).toBeLessThan(1e-12);
      });
    }), { numRuns: RUNS / 20, seed: 20261017 });
  });

  it('the JSON checker and the numeric batch are the same function', () => {
    const qs = fc.sample(sectionArb, { numRuns: 1000, seed: 7 });
    const batch = evaluateBeamSections(qs)!;
    const json = checkCirsoc201Members({
      members: qs.map((q, i) => ({
        elementId: i, fc: q.fc, fy: q.fy, b: q.b, h: q.h, d: q.d, asTension: q.As,
        asCompression: q.AsComp || undefined, dPrime: q.dPrime || undefined,
        av: q.Av || undefined, sStirrup: q.s || undefined, fyt: q.fyt || undefined, ag: q.Ag, edition: q.edition,
      })),
      forces: qs.map((q, i) => ({ elementId: i, mu: 1, vu: 1, axialCompression: q.NuCompression })),
    }) as Array<{ elementId: number; phiMn: number; phiVn: number }>;
    expect(json).toHaveLength(qs.length);
    for (const r of json) {
      // Equal up to the last bits JSON's decimal round trip of the inputs can move.
      expect(rel(r.phiMn, batch[r.elementId].phiMn)).toBeLessThan(1e-12);
      expect(rel(r.phiVn, batch[r.elementId].phiVn)).toBeLessThan(1e-12);
    }
  });

  it('the verifier reads the engine: computeFlexureCapacity / computeShearCapacity are adapters', () => {
    const qs = fc.sample(sectionArb, { numRuns: 500, seed: 11 }).filter((q) => q.edition === '2025');
    for (const q of qs) {
      const flex = computeFlexureCapacity(q.As * 1e4, q.b, q.d, q.fc / 1e6, q.fy / 1e6,
        (q.AsComp ?? 0) * 1e4, q.dPrime ?? 0, 0, 0, { h: q.h, edition: '2025' })!;
      // The adapter rounds φMn to 0,01 kN·m for display, nothing else.
      expect(Math.abs(flex.phiMn - oracleFlexure(q).phiMn / 1e3)).toBeLessThanOrEqual(0.005 + 1e-9);
    }
    // Shear through the adapter: stirrups described by diameter and legs.
    const v = computeShearCapacity(10, 2, 0.15, 0.3, 0.54, 25, 500, 0, { Ag: 0.18, rhoW: 0.01, h: 0.6 });
    const o = oracleShear({ edition: '2025', fc: 25e6, fy: 500e6, b: 0.3, h: 0.6, d: 0.54, As: 0.01 * 0.3 * 0.54,
      Av: 2 * 0.785e-4, s: 0.15, Ag: 0.18 });
    expect(v.phiVn).toBeCloseTo(o.phiVn / 1e3, 2);
  });
});

describe('the four disagreements, pinned', () => {
  it('1. tension steel that does not yield is not credited with fy', () => {
    // 25×40, d = 35, 25 cm² — εt ≈ 0,0013, fs ≈ 260 MPa.
    const r = computeFlexureCapacity(25.13, 0.25, 0.35, 25, 420, 0, 0, 0, 0, { h: 0.4 })!;
    expect(r.tensionYields).toBe(false);
    const a = (25.13e-4 * 420e6) / (0.85 * 25e6 * 0.25); // the yielding assumption
    const assumed = 0.65 * 25.13e-4 * 420e6 * (0.35 - a / 2) / 1e3;
    expect(r.phiMn).toBeLessThan(assumed * 0.95);
  });

  it('2. φ follows εty + 0,003 in 2025 and 0,005 in 2005', () => {
    expect(oraclePhi('2025', 0.0052, 500e6)).toBeCloseTo(0.65 + (0.25 * 0.0027) / 0.003, 12);
    expect(oraclePhi('2005', 0.0052, 500e6)).toBe(0.9);
    const [e25, e05] = evaluateBeamSections([2025, 2005].map((y) => ({
      edition: String(y) as Edition, fc: 25e6, fy: 500e6, b: 0.3, h: 0.5, d: 0.45,
      As: (0.85 * 25e6 * 0.85 * ((0.003 * 0.45) / 0.0082) * 0.3) / 500e6,
    })))!;
    expect(e25.phi).toBeLessThan(0.9);
    expect(e05.phi).toBe(0.9);
  });

  it('3. stirrups are not credited above 420 MPa', () => {
    const at420 = computeShearCapacity(10, 2, 0.15, 0.3, 0.54, 25, 420, 0, { Ag: 0.18, rhoW: 0.01, h: 0.6 });
    const at500 = computeShearCapacity(10, 2, 0.15, 0.3, 0.54, 25, 500, 0, { Ag: 0.18, rhoW: 0.01, h: 0.6 });
    expect(at500.VsProv).toBe(at420.VsProv);
  });

  it('4. an over-reinforced beam reports the εt the ductility clause needs', () => {
    const r = computeFlexureCapacity(25.13, 0.25, 0.35, 25, 420, 0, 0, 0, 0, { h: 0.4 })!;
    expect(r.epsilonT).toBeLessThan(r.epsilonTMin);
    expect(r.epsilonTMin).toBeCloseTo(420 / 200000 + 0.003, 12);
  });
});
