import { describe, it, expect } from 'vitest';
import { pressureField } from '../../engine/foundation/pressure-field';
import { cageLegs, designCage, designDrop, designPunchingFix, punchingReading, sectionStress, sidesIn, type PunchingCase, type PunchingSite } from '../footing-punching';

const fc = 30, root = Math.sqrt(30), PHI = 0.75;
const site = (o: Partial<PunchingSite> = {}): PunchingSite => ({ plan: { B: 6, L: 6, xc: 0, yc: 0, b: 0.4, h: 0.4 }, d: 0.5, stub: 0, fc, fy: 420, h: 0.6, cover: 0.05, reach: 2, ...o });
const centred = (N: number, B = 6, L = 6): PunchingCase[] => [{ f: pressureField(B, L, N, 0, 0), a: { combo: 'U', N, Mx: 0, My: 0, Vx: 0, Vy: 0 }, combo: 'U' }];

describe('punching in a footing, by hand', () => {
  it('a section of four sides carries Vu/(bo·d) with no moment', () => {
    const sides = sidesIn({ x0: -0.45, x1: 0.45, y0: -0.45, y1: 0.45 }, 6, 6);
    expect(sides).toHaveLength(4);
    const s = sectionStress(sides, 0.5, 1000, 0, 0, 0, 0);
    expect(s.bo).toBeCloseTo(3.6, 9);
    expect(s.vu).toBeCloseTo(1000 / (3.6 * 0.5) / 1000, 9);
  });

  it('a section at the plan\'s corner keeps only the two sides inside it', () => {
    const sides = sidesIn({ x0: 2.35, x1: 3.25, y0: 2.35, y1: 3.25 }, 6, 6);
    expect(sides).toHaveLength(2);
    expect(sides.reduce((t, s) => t + Math.hypot(s.x1 - s.x0, s.y1 - s.y0), 0)).toBeCloseTo(2 * 0.65, 9);
  });

  it('stirrups: vs from Av·fyt/(bo·s), φ·(0,17√f\'c + vs) at d/2, and as many lines as the section d/2 past the last needs at 0,17√f\'c', () => {
    const N = 3000, q = N / 36, s = site(), cases = centred(N);
    const Vu = N - q * 0.9 * 0.9, vu = Vu / (3.6 * 0.5) / 1000;
    const plain = punchingReading(cases, s)!;
    expect(plain.vu).toBeCloseTo(vu, 6);
    expect(plain.phiVc).toBeCloseTo(PHI * 0.33 * root, 6);
    expect(plain.utilization).toBeGreaterThan(1);
    const cage = designCage(cases, s)!;
    const av = (vu / PHI - 0.17 * root) * 3600 * 250 / 420;
    expect(av).toBeCloseTo(2659, -1);
    expect(cage).toMatchObject({ dia: 12, spacing: 0.25, first: 0.125, legs: Math.ceil(av / (113.1)) });
    const need = (Math.sqrt((PHI * 0.17 * root * 2000) ** 2 + 4 * q * N) - PHI * 0.17 * root * 2000) / (2 * q);
    expect((need - 0.4) / 2).toBeCloseTo(0.764, 2);
    expect(cage.lines).toBe(3);
    const legs = cageLegs(s.plan, s.d, s.cover, cage);
    expect(legs[0]).toHaveLength(24);
    const r = punchingReading(cases, s, { cage })!;
    const vs = (24 * 113.1 * 420) / (3600 * 250);
    expect(r.vs).toBeCloseTo(vs, 6);
    expect(r.phiVc).toBeCloseTo(PHI * (0.17 * root + vs), 6);
    expect(r.ceiling).toBeCloseTo(PHI * 0.5 * root, 9);
    const outer = r.sections.find((k) => k.at === 'outer')!;
    const xo = 0.4 + 2 * 0.875;
    expect(outer.vu).toBeCloseTo((N - q * xo * xo) / (4 * xo * 0.5) / 1000, 6);
    expect(outer.phiV).toBeCloseTo(PHI * 0.17 * root, 9);
    expect(r.utilization).toBeLessThanOrEqual(1);
    expect(punchingReading(cases, s, { cage: { ...cage, lines: 2 } })!.utilization).toBeGreaterThan(1);
  });

  it('past φ·0,5·√f\'c stirrups do not carry it: a drop does, the shallowest and then the narrowest', () => {
    const N = 4000, q = N / 36, s = site(), cases = centred(N);
    const vu = (N - q * 0.81) / 1.8 / 1000;
    expect(vu).toBeGreaterThan(PHI * 0.5 * root);
    expect(designCage(cases, s)).toBeNull();
    const drop = designDrop(cases, s)!;
    const vc = (d: number, bo: number) => Math.min(0.33, 0.083 * (2 + (40 * d) / bo)) * root;
    const inner = (hd: number) => { const d = 0.5 + hd, x = 0.4 + d; return (N - q * x * x) / (4 * x * d) / 1000 / (PHI * vc(d, 4 * x)); };
    const edge = (w: number) => { const x = 0.4 + 2 * w + 0.5; return (N - q * x * x) / (4 * x * 0.5) / 1000 / (PHI * vc(0.5, 4 * x)); };
    expect(inner(drop.hd)).toBeLessThanOrEqual(1);
    expect(inner(drop.hd - 0.05)).toBeGreaterThan(1);
    expect(drop.w).toBeGreaterThanOrEqual((0.5 + drop.hd) / 2 - 1e-9);
    expect(edge(drop.w)).toBeLessThanOrEqual(1);
    if (drop.w - 0.05 >= (0.5 + drop.hd) / 2 - 1e-9) expect(edge(drop.w - 0.05)).toBeGreaterThan(1);
    expect(designPunchingFix(cases, s, true)).toEqual({ drop });
    expect(designPunchingFix(cases, s, false)).toEqual({ drop });
    expect(designPunchingFix(centred(1000), s, true)).toBeUndefined();
  });

  it('a corner column at two edges: two sides at d/2, stirrup lines only inside the plan', () => {
    const plan = { B: 6, L: 6, xc: 2.8, yc: 2.8, b: 0.4, h: 0.4 };
    const lines = cageLegs(plan, 0.5, 0.05, { dia: 12, spacing: 0.25, first: 0.125, lines: 2, legs: 8 });
    for (const l of lines) for (const p of l) { expect(Math.abs(p.x)).toBeLessThanOrEqual(3 - 0.1 + 1e-9); expect(Math.abs(p.y)).toBeLessThanOrEqual(3 - 0.1 + 1e-9); }
    for (const p of lines[0]!) expect(p.x < 2.6 - 0.1 || p.y < 2.6 - 0.1).toBe(true);
  });
});
