/**
 * HSS truss connections and timber dowels against values worked out by hand: a cross joint of
 * round HSS with its chord in compression (K2-2, K2-3, K2-6), a T at 60°, a gapped K of square
 * HSS (chord wall plastification and shear in the gap), a rectangular T, a joint outside the
 * limits of applicability; a 16 mm bolt in single shear through every yield mode, the same in
 * double shear, and the KD of a nail.
 */
import { describe, expect, it } from 'vitest';
import { chordUtilization, hssTrussRows } from '../hss-truss';
import { dowelYield, reductionTerm, timberConnectionRows } from '../timber-dowel';

const steel = { Fy: 250, Fu: 400 };

describe('HSS truss connections', () => {
  it('a cross joint of round HSS with the chord in compression', () => {
    const i = { joint: 'X' as const, shape: 'round' as const, chord: { D: 219.1, t: 8, ...steel }, branches: [{ D: 114.3, t: 6, ...steel, theta: 90, P: -150 }], chordForce: { P: -300 } };
    expect(chordUtilization(i).U).toBeCloseTo(0.22618, 4);
    const rows = hssTrussRows(i);
    expect(rows.map((r) => r.titleKey)).toEqual(['check.hss.limits', 'check.hss.plastification', 'check.hss.punching']);
    expect(rows[0]!.status).toBe('ok');
    expect(rows[1]!.capacity).toBeCloseTo(130.318, 2);
    expect(rows[1]!.inputs.find((x) => x.symbol === 'Qf')!.value).toBeCloseTo(0.917, 3);
    expect(rows[1]!.status).toBe('fail');
    expect(rows[2]!.capacity).toBeCloseTo(409.356, 2);
  });

  it('a round T at 60° with an unloaded chord (K2-1 with γ^0,2)', () => {
    const rows = hssTrussRows({ joint: 'T', shape: 'round', chord: { D: 219.1, t: 8, ...steel }, branches: [{ D: 114.3, t: 6, ...steel, theta: 60, P: 100 }] });
    expect(rows[1]!.capacity).toBeCloseTo(206.139, 2);
  });

  it('a gapped K of square HSS: plastification and chord shear in the gap, no punching for square branches', () => {
    const rows = hssTrussRows({
      joint: 'K', shape: 'rect', chord: { B: 150, H: 150, t: 8, ...steel }, gap: 30, chordForce: { P: -400 },
      branches: [{ B: 100, H: 100, t: 5, ...steel, theta: 45, P: -120 }, { B: 100, H: 100, t: 5, ...steel, theta: 45, P: 120 }],
    });
    expect(rows.map((r) => r.titleKey)).toEqual(['check.hss.limits', 'check.hss.plastification', 'check.hss.plastification', 'check.hss.gapShear']);
    expect(rows[1]!.capacity).toBeCloseTo(407.378, 2);
    expect(rows[1]!.inputs.find((x) => x.symbol === 'Qf')!.value).toBe(1);
    expect(rows[3]!.demand).toBeCloseTo(84.853, 3);
    expect(rows[3]!.capacity).toBeCloseTo(272.16, 2);
  });

  it('a rectangular T with β = 0,6: chord wall plastification only', () => {
    const rows = hssTrussRows({ joint: 'T', shape: 'rect', chord: { B: 200, H: 200, t: 10, ...steel }, branches: [{ B: 120, H: 120, t: 6, ...steel, theta: 90, P: -100 }] });
    expect(rows.map((r) => r.titleKey)).toEqual(['check.hss.limits', 'check.hss.plastification']);
    expect(rows[1]!.capacity).toBeCloseTo(233.114, 2);
  });

  it('outside the limits: a branch at 25° gets no strength, only the limit it fails', () => {
    const rows = hssTrussRows({ joint: 'T', shape: 'round', chord: { D: 219.1, t: 8, ...steel }, branches: [{ D: 114.3, t: 6, ...steel, theta: 25, P: 100 }] });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('unsupported');
    expect(rows[0]!.derivation!.join(' ')).toContain('θ = 25° ≥ 30°');
  });
});

describe('timber dowel connections', () => {
  const bolt = { D: 16, Fyb: 310, lm: 90, ls: 45, Fem: 30, Fes: 30 };

  it('a 16 mm bolt in single shear, every mode by hand', () => {
    const y = dowelYield({ ...bolt, shear: 'single' });
    expect(y.modes.Im).toBeCloseTo(10.8, 6);
    expect(y.modes.Is).toBeCloseTo(5.4, 6);
    expect(y.modes.II).toBeCloseTo(4.0767, 4);
    expect(y.modes.IIIm).toBeCloseTo(5.2070, 4);
    expect(y.modes.IIIs).toBeCloseTo(3.5359, 4);
    expect(y.modes.IV).toBeCloseTo(4.4542, 4);
    expect(y.governing).toBe('IIIs');
  });

  it('double shear, and the KD of a small nail', () => {
    const y = dowelYield({ ...bolt, shear: 'double' });
    expect(Object.keys(y.modes)).toEqual(['Im', 'Is', 'IIIs', 'IV']);
    expect(y.modes.IIIs).toBeCloseTo(7.0718, 4);
    expect(y.Z).toBeCloseTo(7.0718, 4);
    expect(reductionTerm(3.76, 0, 'IV')).toBe(2.2);
    expect(reductionTerm(16, 90, 'Im')).toBeCloseTo(5, 12);
  });

  it("Z' with KF, φz and λ; the group factor stated or not", () => {
    const rows = timberConnectionRows({ ...bolt, shear: 'single', n: 4, demand: 20, lambda: 0.8 });
    expect(rows[0]!.capacity).toBeCloseTo(6.104, 3);
    expect(rows[0]!.demand).toBe(5);
    expect(rows[0]!.status).toBe('ok');
    expect(rows[1]!.status).toBe('notVerified');
    expect(timberConnectionRows({ ...bolt, shear: 'single', n: 4, demand: 20, caseTypes: ['D'], cg: 0.95 })[1]!.status).toBe('ok');
    // Permanent load alone: λ = 0,6.
    expect(timberConnectionRows({ ...bolt, shear: 'single', n: 1, demand: 1, caseTypes: ['D'] })[0]!.capacity).toBeCloseTo(3.5359 * 3.32 * 0.65 * 0.6, 3);
  });
});
