/**
 * The isolated-footing check against published worked examples.
 * Recorded in docs/verification/DESIGN_EXAMPLES.md (spread footings).
 *
 * [INTI-B]   INTI-CIRSOC, Ejemplos de Aplicación del Reglamento CIRSOC 201-2005, "Bases de
 *            Hormigón Armado", Ejemplo 7.I (pp. 122–124).
 * [SP-WIGHT] StructurePoint, "Reinforced Concrete Spread Footing (Isolated Footing) Analysis and
 *            Design", ACI 318-14 (Sep. 2018), after Wight 7th ed., Ex. 15-2 (pp. 4–8).
 * [ACI-F1]   ACI, "Footings Example 1 — square spread footing of a seven-story building",
 *            ACI 318-14 (concrete.org, 318-example-1), pp. 3–7.
 * [RFEM]     Dlubal Knowledge Base 002041, allowable soil pressure of a single footing (ASD),
 *            software verification article.
 *
 * Tolerance is the printed rounding: three significant figures → 0.5 %.
 */
import { describe, it, expect } from 'vitest';
import { checkBearing, checkFooting, type FootingInput } from '../foundation-check';

const FT = 0.3048; // m
const IN = 0.0254; // m
const KIP = 4.448_221_615; // kN
const KSF = KIP / (FT * FT); // kPa

function published(actual: number, printed: number, rel: number, what: string) {
  const err = Math.abs(actual - printed) / Math.abs(printed);
  expect(err, `${what}: stabileo ${actual}, published ${printed}`).toBeLessThanOrEqual(rel);
}
const THREE_SF = 0.005;

const base = (over: Partial<FootingInput>): FootingInput => ({
  kind: 'isolated',
  B: 1, L: 1, thickness: 1, d: 0.5, columnB: 0.3, columnH: 0.3, fc: 25,
  allowableBearing: 1e6, serviceAxial: 1, factoredAxial: 1, position: 'interior',
  ...over,
});

describe('published spread-footing examples', () => {
  it('[INTI-B] Ej. 7.I: qu, column-face moments, punching demand', () => {
    // Pu = 1400 kN, column cx = 0,30 × cy = 0,25 m, Lx = Ly = 2,25 m, d = 0,52 m (punching).
    // Printed: qu = 276,54 kN/m²; Muy = qu·Lx·ky²/2 = 311,11 kNm (ky = 1,00 m);
    // Mux = 295,75 kNm (kx = 0,975 m); Vu = Pu − qu·A0 = 1225 kN, A0 = 0,631 m².
    // `Mu` is the moment along B, so B is taken along y (column side 0,25 m) and turned.
    const f = base({ B: 2.25, L: 2.25, d: 0.52, columnB: 0.25, columnH: 0.30, factoredAxial: 1400, serviceAxial: 1000 });
    const r = checkFooting(f);
    published(1400 / (2.25 * 2.25), 276.54, 1e-4, 'qu');
    published(r.Mu, 311.11, THREE_SF, 'Muy at the column face');
    published(checkFooting({ ...f, columnB: 0.30, columnH: 0.25 }).Mu, 295.75, THREE_SF, 'Mux');
    expect(r.punching).not.toBeNull();
    published(r.punching!.demand.Vu, 1225, THREE_SF, 'punching Vu = Pu − qu·A0');
  });

  it('[SP-WIGHT] Ex. 15-2: moment and punching demand', () => {
    // 18 in square column, 11.17 ft square footing, Pu = 912 kips, davg = 28 in.
    // Printed: qnu = 7310 psf; two-way Vu = 805 kips; Mu = 7310/1000·11.17·(58/12)²/2 = 954 kip-ft.
    const f = base({
      B: 11.17 * FT, L: 11.17 * FT, d: 28 * IN, columnB: 18 * IN, columnH: 18 * IN,
      fc: 20.7, factoredAxial: 912 * KIP, serviceAxial: 670 * KIP,
    });
    const r = checkFooting(f);
    published(r.Mu / (KIP * FT), 954, THREE_SF, 'Mu at the column face, kip-ft');
    published(r.punching!.demand.Vu / KIP, 805, THREE_SF, 'two-way Vu, kips');
  });

  it('[ACI-F1]: moment and shear demands', () => {
    // 24 in square column, 12 × 12 ft, Pu = 960 kips, d = 25.5 in. Printed (qu = 6.7 ksf, rounded
    // from 6.667 and carried rounded, so 0.5 % above the check's): Mu = 1005 ft-kip; one-way
    // Vu = 231 kips; two-way Vu = 851 kips. Compared at 1 %.
    const f = base({
      B: 12 * FT, L: 12 * FT, d: 25.5 * IN, columnB: 24 * IN, columnH: 24 * IN,
      fc: 27.6, factoredAxial: 960 * KIP, serviceAxial: 735 * KIP,
    });
    const r = checkFooting(f);
    published(r.Mu / (KIP * FT), 1005, 0.01, 'Mu, kip-ft');
    published(r.oneWayShear!.Vu / KIP, 231, 0.01, 'one-way Vu, kips');
    published(r.punching!.demand.Vu / KIP, 851, 0.01, 'two-way Vu, kips');
  });

  it('[RFEM] 002041: linear bearing pressure P/A ± M/S', () => {
    // 6 × 6 ft footing, P = 92.35 kip, M = 14.175 kip-ft (ASD). Printed:
    // q = 92.35/36.0 ± 14.175/36.0 = 2.565 ± 0.394 ksf, qmax = 2.959, qmin = 2.172 ksf.
    const r = checkBearing(base({
      B: 6 * FT, L: 6 * FT, serviceAxial: 92.35 * KIP, serviceMomentB: 14.175 * KIP * FT,
      allowableBearing: 2.979 * KSF,
    }));
    published(r.qMax / KSF, 2.959, THREE_SF, 'qmax');
    published(r.qMin / KSF, 2.172, THREE_SF, 'qmin');
    published(r.utilization, 0.993, THREE_SF, 'qmax / qa');
  });
});
