/**
 * Fire resistance against hand values: the standard fire, the steel reduction factors of
 * EN 1993-1-2 Table 3.1 and the critical temperature (the in-repo reference values), section
 * factors of an HEB 200, unprotected and protected heating, a concrete member against the
 * project's table, and a timber section after 30 minutes of charring on three faces.
 */
import { describe, expect, it } from 'vitest';
import {
  axisDistance, concreteFireRows, criticalTemperature, iso834, kE, ky, protectedTemperature, residualSection, sectionFactor,
  steelFireRows, steelSpecificHeat, timberFireRows, unprotectedTemperature,
} from '../fire';

describe('standard fire and steel properties', () => {
  it('ISO 834 at 30, 60 and 120 minutes', () => {
    expect(iso834(0)).toBe(20);
    expect(iso834(30)).toBeCloseTo(841.8, 1);
    expect(iso834(60)).toBeCloseTo(945.3, 1);
    expect(iso834(120)).toBeCloseTo(1049.0, 1);
  });

  it('ky and kE interpolated in Table 3.1; θcr where ky = μ0', () => {
    expect(ky(400)).toBe(1);
    expect(ky(450)).toBeCloseTo(0.89, 12);
    expect(ky(550)).toBeCloseTo(0.625, 12);
    expect(kE(550)).toBeCloseTo(0.455, 12);
    expect(kE(950)).toBeCloseTo(0.05625, 12);
    expect(criticalTemperature(0.6)).toBeCloseTo(558.06, 2);
    expect(criticalTemperature(1.2)).toBe(400);
    expect(criticalTemperature(0.01)).toBe(1100);
    expect(ky(criticalTemperature(0.3))).toBeCloseTo(0.3, 12);
  });

  it('specific heat of steel at the edges of its branches', () => {
    expect(steelSpecificHeat(20)).toBeCloseTo(439.8, 1);
    expect(steelSpecificHeat(735)).toBeCloseTo(5000, 0);
    expect(steelSpecificHeat(1000)).toBe(650);
  });
});

describe('section factor', () => {
  const heb200 = { kind: 'I' as const, h: 0.2, b: 0.2, tw: 0.009, tf: 0.015, A: 7.808e-3 };
  it('an HEB 200: box and contour, three and four sides', () => {
    // Box on three sides (2h + b) is the 591 mm of the reference's shadow perimeter rounded up by the web.
    expect(sectionFactor(heb200, 3, 'box')).toBeCloseTo(76.84, 2);
    expect(sectionFactor(heb200, 4, 'box')).toBeCloseTo(102.46, 2);
    expect(sectionFactor(heb200, 4, 'contour')).toBeCloseTo(151.38, 2);
    expect(sectionFactor(heb200, 3, 'contour')).toBeCloseTo(125.77, 2);
  });
  it('hollow and solid sections', () => {
    expect(sectionFactor({ kind: 'rhs', h: 0.2, b: 0.1, A: 2e-3 }, 4)).toBeCloseTo(300, 9);
    expect(sectionFactor({ kind: 'chs', D: 0.2, A: 3e-3 }, 4)).toBeCloseTo((Math.PI * 0.2) / 3e-3, 9);
    expect(sectionFactor({ kind: 'rect', h: 0.4, b: 0.2 }, 3)).toBeCloseTo(1 / 0.08, 9);
  });
});

describe('steel temperature', () => {
  it('unprotected: rises with time and stays below the gas', () => {
    const t = [5, 10, 15, 30].map((m) => unprotectedTemperature(200, m));
    for (let i = 1; i < t.length; i++) expect(t[i]!).toBeGreaterThan(t[i - 1]!);
    expect(t[3]!).toBeLessThan(iso834(30));
    expect(iso834(30) - t[3]!).toBeLessThan(30); // a slender section all but follows the fire
    expect(unprotectedTemperature(200, 30, 0.7)).toBeLessThan(t[3]!);
  });

  it('protected: far slower than unprotected', () => {
    const p = { lambdaP: 0.12, dp: 0.02, cp: 1200, rhoP: 300 };
    const prot = protectedTemperature(200, 60, p), bare = unprotectedTemperature(200, 60);
    expect(prot).toBeLessThan(bare - 200);
    expect(protectedTemperature(200, 90, p)).toBeGreaterThan(prot);
  });

  it('rows: θa(R) against θcr', () => {
    const rows = steelFireRows({ amv: 200, mu0: 0.6, rMinutes: 30 });
    expect(rows[0]!.titleKey).toBe('check.fire.utilization');
    expect(rows[1]!.capacity).toBeCloseTo(558.065, 3);
    expect(rows[1]!.status).toBe('fail');
    const ok = steelFireRows({ amv: 200, mu0: 0.6, rMinutes: 30, protection: { lambdaP: 0.12, dp: 0.025, cp: 1200, rhoP: 300 } });
    expect(ok[1]!.clause).toBe('4.2.5.2');
    expect(ok[1]!.ratio!).toBeLessThan(1);
  });
});

describe('concrete and timber', () => {
  const table = [{ kind: 'beam' as const, r: 60, bMin: 0.2, aMin: 0.04 }, { kind: 'beam' as const, r: 90, bMin: 0.25, aMin: 0.05 }];
  it('a beam against the project table; the next R up governs; no row for a column', () => {
    const a = axisDistance(0.025, 8, 20);
    expect(a).toBeCloseTo(0.043, 12);
    const rows = concreteFireRows({ kind: 'beam', b: 0.3, a }, table, 60);
    expect(rows.map((r) => r.ratio)).toEqual([0.667, 0.93]);
    expect(concreteFireRows({ kind: 'beam', b: 0.3, a }, table, 75)[1]!.status).toBe('fail');
    expect(concreteFireRows({ kind: 'column', b: 0.3, a }, table, 60)[0]!.status).toBe('notVerified');
  });

  it('timber: 30 minutes on three faces at 0,8 mm/min with d0 = 7 mm', () => {
    const s = residualSection(0.14, 0.4, { top: false, bottom: true, left: true, right: true }, 0.8, 7, 30);
    expect(s.dEf).toBeCloseTo(0.031, 12);
    expect(s.b).toBeCloseTo(0.078, 12);
    expect(s.h).toBeCloseTo(0.369, 12);
    // k0 ramps below 20 min.
    expect(residualSection(0.14, 0.4, { top: false, bottom: true, left: true, right: true }, 0.8, 7, 10).dEf).toBeCloseTo(0.0115, 12);
    const rows = timberFireRows({ b: 0.14, h: 0.4, sides: { top: false, bottom: true, left: true, right: true }, betaN: 0.8, d0: 7, rMinutes: 30, demand: { m: 10, n: 0, v: 20 }, strengths: { fm: 24, fc: 21, fv: 2.5 }, kfi: 1.25 });
    const W = (0.078 * 0.369 ** 2) / 6;
    expect(rows[0]!.demand).toBeCloseTo(10 / W / 1000, 3);
    expect(rows[0]!.capacity).toBeCloseTo(30, 9);
    expect(rows[1]!.demand).toBeCloseTo((1.5 * 20) / (0.078 * 0.369) / 1000, 3);
    expect(rows).toHaveLength(2);
    expect(timberFireRows({ b: 0.05, h: 0.1, sides: { top: true, bottom: true, left: true, right: true }, betaN: 0.8, d0: 7, rMinutes: 60, demand: { m: 1, n: 0, v: 1 }, strengths: { fm: 24, fc: 21, fv: 2.5 }, kfi: 1.25 })[0]!.status).toBe('fail');
  });
});
