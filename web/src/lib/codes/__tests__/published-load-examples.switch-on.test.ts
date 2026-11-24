/**
 * The load codes against worked examples published by others, with their numbers as printed.
 *
 * - INTI-CIRSOC, "Guía para el uso del Reglamento CIRSOC 102", Ejemplo 1 (Telsen), p. 3-23:
 *   V = 58 m/s, exposure C, h = 5 m, Kz = 0.87, Kzt = 1, Kd = 0.85, I = 1 → qh = 1525 N/m².
 *   The guide is to the 2005 edition; its Kz table and the 2025 power law agree to the digit there.
 * - JRC, "Eurocodes: background and applications. Actions on a six storey building" (2008), p. 8:
 *   EN 1991-1-4 peak velocity pressure at z = 22 m, vb,0 = 24 m/s.
 * - JRC EUR 25204, "Eurocode 8: seismic design of buildings, worked examples", pp. 29 and 49: the
 *   lateral force method of a six-storey building, Type 1 spectrum on ground B.
 * - FEMA P-2192-V1 (2021), NEHRP recommended provisions design examples, chapter 7, pp. 267–268:
 *   ASCE 7 equivalent lateral force of a one-storey building.
 * - NFBA, Frame Builder vol. 6 no. 4, p. 26: ASCE 7-22 flat roof snow, Ce = 1.0, Ct = 1.2, no Is.
 * - Toros University, lecture notes "Eşdeğer deprem yükü yöntemi", pp. 25–45: TBDY 2018 spectrum
 *   and equivalent lateral load of a three-storey building.
 * Reproduction of the JRC reports is authorised provided the source is acknowledged; the others
 * are used for their published numbers only.
 */
import { describe, it, expect } from 'vitest';
import { velocityPressure } from '../cirsoc102/wind';
import { peakPressure } from '../eurocode/wind';
import { designSpectrum as ecSpectrum, SPECTRUM, storeyForces as ecStoreyForces } from '../eurocode/seismic';
import { responseCoefficient } from '../asce7/seismic';
import { roofSnow7 } from '../asce7/snow';
import { PSF } from '../asce7/refs';
import { baseShear, ra, sae } from '../turkey/tbdy-spectrum';

describe('CIRSOC 102, the INTI-CIRSOC guide', () => {
  it('Ejemplo 1: qh = 0.613·Kz·Kzt·Kd·V² = 1525 N/m² at h = 5 m in exposure C', () => {
    const q = velocityPressure(5, {
      basicSpeed: 58, exposure: 'C', siteAltitudeM: 0, kzt: 1, kztSurveyed: false, structureKind: 'building',
      enclosure: 'enclosed', meanRoofHeight: 5, L: 10, B: 10, roofSlopeDeg: 0,
    } as never);
    expect(q / 1525).toBeCloseTo(1, 2);
  });
});

describe('EN 1991-1-4, the JRC six-storey building', () => {
  it('west wind, terrain III, cdir² = 1: qp(22 m) = 0.810 kN/m²', () => {
    expect(peakPressure(22, { vb: 24, terrain: 'III', c0: 1, rho: 1.25 })).toBeCloseTo(0.81, 2);
  });
  it('east wind, terrain I, cdir² = 0.8: qp(22 m) = 0.939 kN/m²', () => {
    expect(peakPressure(22, { vb: 24 * Math.sqrt(0.8), terrain: 'I', c0: 1, rho: 1.25 })).toBeCloseTo(0.939, 2);
  });
});

describe('EN 1998-1, JRC EUR 25204', () => {
  const g = 9.81, ag = 0.25 * g, m = 2362, lambda = 0.85;
  const levels = [{ z: 4, w: 408 }, { z: 7, w: 396 }, { z: 10, w: 396 }, { z: 13, w: 396 }, { z: 16, w: 396 }, { z: 19, w: 372 }];
  for (const [dir, T, Fb, forces] of [
    ['X', 0.92, 2676, [162, 276, 394, 512, 630, 703]],
    ['Y', 0.68, 3621, [220, 373, 533, 692, 852, 951]],
  ] as const) {
    it(`${dir}: T = ${T} s, Fb = ${Fb} kN and its storey forces`, () => {
      const sd = ecSpectrum(T, ag, SPECTRUM[1].B, 3);
      expect(sd * m * lambda / Fb).toBeCloseTo(1, 2);
      ecStoreyForces(Fb, levels).forEach((f, k) => expect(f / forces[k]!).toBeCloseTo(1, 1));
    });
  }
});

describe('ASCE 7, FEMA P-2192-V1 chapter 7', () => {
  it('SDS = 1.0, SD1 = 0.60, Ie = 1.25, R = 6.5, Ta = 0.22 s: Cs = 0.192 and V = 16,567 lb for W = 86,288 lb', () => {
    const r = responseCoefficient({ sds: 1, sd1: 0.6, r: 6.5, ie: 1.25, t: 0.22, tl: 8 });
    expect(r.cs).toBeCloseTo(0.192, 3);
    expect(Math.round(r.cs * 1000) / 1000 * 86288).toBeCloseTo(16567, -1);
  });
});

describe('ASCE 7-22 flat roof snow, NFBA Frame Builder', () => {
  for (const [city, pg, pf] of [['Baltimore', 59, 49.6], ['Boston', 65, 54.6], ['Detroit', 37, 31.1], ['Minneapolis', 58, 48.7]] as const) {
    it(`${city}: pg = ${pg} psf → pf = ${pf} psf`, () => {
      const r = roofSnow7({ pg: pg * PSF, ce: 1, ct: 1.2, riskCategory: 'II', slopeDeg: 0, slippery: false });
      expect(r.pf / PSF).toBeCloseTo(pf, 1);
    });
  }
});

describe('TBDY 2018, the Toros University example', () => {
  const s = { ss: 0, s1: 0, fs: 1, f1: 1, sds: 0.683, sd1: 0.197, ta: 0.2 * 0.197 / 0.683, tb: 0.197 / 0.683, tl: 6 };
  it('TA = 0.058 s, TB = 0.288 s; at T = 0.47979 s Sae = 0.411 g, Ra = 8 and SaR = 0.051 g', () => {
    expect(s.ta).toBeCloseTo(0.058, 3);
    expect(s.tb).toBeCloseTo(0.288, 3);
    expect(sae(0.47979, s)).toBeCloseTo(0.411, 3);
    expect(ra(0.47979, 8, 3, 1, s.tb)).toBe(8);
    expect(sae(0.47979, s) / 8).toBeCloseTo(0.051, 3);
  });
  it('mt = 88.58 t: VtE = 44.60 kN with the minimum 23.74 kN below it', () => {
    const w = 88.58 * 9.81;
    const r = baseShear(w, sae(0.47979, s) / 8, 1, 0.683);
    expect(r.vt).toBeCloseTo(44.6, 1);
    expect(r.minimumGoverns).toBe(false);
    expect(0.04 * w * 0.683).toBeCloseTo(23.74, 1);
  });
});
