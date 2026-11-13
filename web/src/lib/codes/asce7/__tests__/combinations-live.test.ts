import { describe, it, expect } from 'vitest';
import { asce7Service, asce7Strength, liveCompanion } from '../combinations';
import { findAsce7Occupancy, reduceAsce7 } from '../live-loads';
import { asce7Vertical } from '../seismic-plan';
import { PSF } from '../refs';
import type { CombinationInputs } from '../../cirsoc101/combinations';
import type { PlanSink } from '../../../engine/loads/load-plan';

const all = { L: true, Lr: true, S: true, R: false, W: true, E: true, F: false, H: false };
const ci = (over: Partial<CombinationInputs> = {}): CombinationInputs => ({ present: all, maxLoKNm2: 50 * PSF, ...over });
const labels = (c: CombinationInputs) => asce7Strength(c).combinations.map((x) => x.label);

describe('ASCE 7-22 §2.3.1 and §2.3.6 strength combinations', () => {
  it('writes the seven basic combinations with the 7-22 snow factors', () => {
    const l = labels(ci());
    for (const want of [
      '1.4 D',
      '1.2 D + 1.6 L + 0.5 Lr', '1.2 D + 1.6 L + 0.3 S',
      '1.2 D + 1.6 Lr + 0.5 L', '1.2 D + 1.0 S + 0.5 L', '1.2 D + 1.6 Lr + 0.5 W', '1.2 D + 1.0 S + 0.5 W',
      '1.2 D + 1.0 W + 0.5 L + 0.5 Lr', '1.2 D + 1.0 W + 0.5 L + 0.3 S',
      '0.9 D + 1.0 W',
      '1.2 D + 1.0 E + 0.5 L + 0.15 S', '0.9 D + 1.0 E',
    ]) expect(l).toContain(want);
  });

  it('investigates the loads not acting, and never combines W with E', () => {
    const l = labels(ci());
    expect(l).toContain('1.2 D + 1.0 W');
    expect(l).toContain('1.2 D + 1.0 E');
    expect(l).toContain('1.2 D + 1.6 L');
    expect(l.some((x) => x.includes('W') && x.includes('E'))).toBe(false);
    expect(new Set(l).size).toBe(l.length);
  });

  it('Exception 1: 0,5 L only for Lo ≤ 100 psf outside garages and public assembly', () => {
    expect(liveCompanion(ci({ maxLoKNm2: 100 * PSF })).factor).toBe(0.5);
    expect(liveCompanion(ci({ maxLoKNm2: 125 * PSF })).factor).toBe(1);
    expect(liveCompanion(ci({ hasGarageOrPublicAssembly: true })).factor).toBe(1);
    expect(labels(ci({ maxLoKNm2: 125 * PSF }))).toContain('1.2 D + 1.0 W + 1.0 L + 0.3 S');
  });

  it('service combinations of Appendix C', () => {
    const s = asce7Service({ present: { ...all, Wa: true } }).map((x) => x.label);
    expect(s).toEqual(['1.0 D', '1.0 D + 1.0 L', '1.0 D + 0.5 L', '1.0 D + 1.0 Lr', '1.0 D + 1.0 S', '1.0 D + 0.5 L + 1.0 Wa']);
  });

  it('§12.4.2.2: Ev = 0,2·S_DS·D added in combination 6 and taken off in 7', () => {
    const sink = { derivation: [], refs: [] } as unknown as PlanSink;
    const out = asce7Vertical(asce7Strength(ci()).combinations, { source: 'manual', c: 0.1, asce7: { sds: 1.0 } } as never, sink);
    expect(out.find((c) => c.id === '6')!.label).toBe('1.4 D + 1.0 E + 0.5 L + 0.15 S');
    expect(out.find((c) => c.id === '7')!.label).toBe('0.7 D + 1.0 E');
    expect(out.find((c) => c.id === '5')!.label).toBe('0.9 D + 1.0 W');
  });
});

describe('ASCE 7-22 Table 4.3-1 and §4.7', () => {
  it('converts the table exactly: offices 50 psf and 2000 lb', () => {
    const o = findAsce7Occupancy('offices')!;
    expect(o.uniformKNm2).toBeCloseTo(2.394, 3);
    expect(o.concentratedKN).toBeCloseTo(8.896, 3);
  });

  // Hand calculation, Eq. 4.7-1: Lo = 50 psf, interior beam (KLL = 2), AT = 625 ft²:
  // L = 50 (0,25 + 15/√1250) = 33,71 psf = 1,614 kN/m².
  it('reduces by Eq. 4.7-1 in SI', () => {
    const r = reduceAsce7({ loKNm2: 50 * PSF, tributaryAreaM2: 625 * 0.3048 ** 2, elementKind: 'interiorBeam', floorsSupported: 1, passengerGarage: false, publicAssembly: false, noReduction: false });
    expect(r.lKNm2 / PSF).toBeCloseTo(33.71, 1);
  });

  it('keeps the 0,5 Lo and 0,4 Lo floors', () => {
    const big = { loKNm2: 50 * PSF, tributaryAreaM2: 2000, elementKind: 'interiorColumn' as const, passengerGarage: false, publicAssembly: false, noReduction: false };
    expect(reduceAsce7({ ...big, floorsSupported: 1 }).lKNm2).toBeCloseTo(0.5 * 50 * PSF, 6);
    expect(reduceAsce7({ ...big, floorsSupported: 3 }).lKNm2).toBeCloseTo(0.4 * 50 * PSF, 6);
  });

  it('applies §4.7.2 only from KLL·AT ≥ 400 ft², and the limits of §4.7.3 to §4.7.5', () => {
    const b = { tributaryAreaM2: 100, elementKind: 'interiorColumn' as const, passengerGarage: false, publicAssembly: false, noReduction: false };
    expect(reduceAsce7({ ...b, loKNm2: 50 * PSF, tributaryAreaM2: 9, floorsSupported: 1 }).lKNm2).toBeCloseTo(50 * PSF, 9);
    expect(reduceAsce7({ ...b, loKNm2: 125 * PSF, floorsSupported: 1 }).lKNm2).toBeCloseTo(125 * PSF, 9);
    expect(reduceAsce7({ ...b, loKNm2: 125 * PSF, floorsSupported: 2 }).lKNm2).toBeCloseTo(100 * PSF, 9);
    expect(reduceAsce7({ ...b, loKNm2: 40 * PSF, passengerGarage: true, floorsSupported: 1 }).lKNm2).toBeCloseTo(40 * PSF, 9);
    expect(reduceAsce7({ ...b, loKNm2: 40 * PSF, passengerGarage: true, floorsSupported: 2 }).lKNm2).toBeCloseTo(32 * PSF, 9);
    expect(reduceAsce7({ ...b, loKNm2: 100 * PSF, publicAssembly: true, floorsSupported: 3 }).lKNm2).toBeCloseTo(100 * PSF, 9);
  });
});
