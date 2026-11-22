/**
 * Strips and mats against hand statics: a strip of three equal columns on a uniform pressure, a
 * mat of four on a square, punching at an inner column, the steel each strip asks, the
 * characteristic length and a long strip on Winkler springs against the infinite beam.
 */
import { describe, it, expect } from 'vitest';
import { CIRSOC_FOOTING_ANCHORAGE, rulesFor } from '../codes';
import { analyseGroup, bandsAlong, characteristicLength, groupModulus, placeMembers } from '../footing-group';
import { endFactor, winklerStrip } from '../footing-winkler';
import { groupDemand } from '../footing-choice';
import { CIRSOC_ONE_WAY } from '../footing-design';

import { slabProvisions } from '../../engine/codes/argentina/losas';
import type { FootingAdopted, FootingContext, FootingDemand, FootingGroup } from '../footing-types';

const fmt = (v: number, d = 2) => v.toFixed(d);
const code = { ...CIRSOC_ONE_WAY, anchorage: CIRSOC_FOOTING_ANCHORAGE };
const ctx: FootingContext = { fc: 25, fy: 420, cover: 0.05, sizing: 'minimum', diameters: [10, 12, 16, 20, 25] };

const column = (n: number, x: number, y: number, N: number, Nu: number): FootingDemand => ({
  key: `footing:n${n}`, name: `C${n}`, nodeId: n, at: { x, y, z: 0 }, column: { b: 0.4, h: 0.4 },
  service: { combo: 'D + L', N, Mx: 0, My: 0, Vx: 0, Vy: 0 }, lateralLeftOut: 0,
  combos: [{ combo: 'U', N: Nu, Mx: 0, My: 0, Vx: 0, Vy: 0 }], soil: { name: 'S', allowable: 200 },
});
const mesh = { dia: 12, spacing: 0.15 };

describe('a strip of three equal columns 4 m apart, 1 m past the outer ones', () => {
  const members = [column(1, 0, 0, 600, 840), column(2, 4, 0, 600, 840), column(3, 8, 0, 600, 840)];
  const g: FootingGroup = { kind: 'strip', members, axis: 'x', reason: 'overlap' };
  const a: FootingAdopted = { B: 10, L: 1.2, h: 0.6, ex: 4, ey: 0, x: mesh, y: mesh, tops: { x: mesh }, columns: {} };
  const r = analyseGroup(g, ctx, a, code);

  it('bears its service load and own weight evenly: q = (3·600 + 25·0,6·12)/12', () => {
    expect(r.bearing!.qMean).toBeCloseTo((1800 + 25 * 0.6 * 12) / 12, 6);
    expect(r.bearing!.qMax).toBeCloseTo(r.bearing!.qMean, 6);
  });

  it('reads the line as a beam on q = 2520/10 kN/m: Mu− = 560 between the columns, Mu+ = 91,6 within the outer ones, where V = 0', () => {
    const s = r.strips[0]!;
    expect(r.strips).toHaveLength(1);
    expect(s.mTop).toBeCloseTo(840 * (7 / 3) - 252 * (10 / 3) ** 2 / 2, -1);
    const at = -7560 / 1848;
    expect(Math.abs(s.mBottom - (126 * (at + 5) ** 2 - 1050 * (at + 4.2) ** 2))).toBeLessThan(1.5);
  });

  it('punches the middle column with what the soil leaves inside d/2', () => {
    const k = r.columns.find((c) => c.name === 'C2')!.punching!;
    const d = r.layers.d, side = 0.4 + d;
    const Vu = 840 - (2520 / 12) * side * side;
    expect(k.position).toBe('interior');
    expect(k.vu).toBeCloseTo(Vu / (4 * side * d) / 1000, 3);
  });

  it('asks the steel of its moments over the strip, never under the minimum', () => {
    const s = r.strips[0]!;
    expect(s.asBottom).toBeGreaterThan(0);
    expect(s.asTop).toBeGreaterThan(s.asBottom);
    expect(r.minSteel.x).toBeCloseTo(slabProvisions('2025', 420, 0.6).AsMin * 1.2, 9);
  });

  it('is proposed and verifies, its edges centred on its columns', () => {
    const d = groupDemand(g);
    const row = rulesFor('cirsoc201-2025').footingRow(d, ctx, undefined, fmt);
    expect(row.group?.kind).toBe('strip');
    expect(row.status, JSON.stringify(row.verifications.filter((v) => !v.ok))).toBe('ok');
    expect(row.ex).toBeCloseTo(4, 6);
    expect(row.L).toBeGreaterThanOrEqual(1800 / 200 / row.B);
    expect(row.founding).toBeCloseTo(-row.h, 9);
  });
});

describe('a mat under four columns on a 6 m square', () => {
  const members = [column(1, 0, 0, 1000, 1400), column(2, 6, 0, 1000, 1400), column(3, 0, 6, 1000, 1400), column(4, 6, 6, 1000, 1400)];
  const g: FootingGroup = { kind: 'mat', members, reason: 'cover' };
  const a: FootingAdopted = { B: 8, L: 8, h: 0.6, ex: 3, ey: 3, x: mesh, y: mesh, tops: { x: mesh, y: mesh }, columns: {} };
  const r = analyseGroup(g, ctx, a, code);

  it('splits into a strip per column line each way, halfway between them', () => {
    expect(bandsAlong(placeMembers(g, a), 'x', 8).map((b) => [b.lo, b.hi, b.cols.length])).toEqual([[-4, 0, 2], [0, 4, 2]]);
    expect(r.strips).toHaveLength(4);
  });

  it('reads each strip on its own columns: Mu− = q·4²/2 − 1400·3 at mid-span with q = 2800/8', () => {
    for (const s of r.strips) expect(s.mTop).toBeCloseTo(1400, -1);
  });

  it('bears q = (4000 + 25·0,6·64)/64', () => {
    expect(r.bearing!.qMean).toBeCloseTo((4000 + 25 * 0.6 * 64) / 64, 6);
  });

  it('finds every column at a corner of the mat one metre in from its edges as interior', () => {
    for (const c of r.columns) expect(c.punching!.position).toBe('interior');
  });
});

describe('the characteristic length and a strip on springs', () => {
  it('Lo = (4·E·I/(b·ks))^¼ with I = b·h³/12', () => {
    const E = groupModulus(25), h = 0.6, ks = 20000;
    expect(characteristicLength(E, h, ks)).toBeCloseTo(Math.pow((4 * E * (1 * h ** 3 / 12)) / (1 * ks), 0.25), 9);
  });

  it('a long strip pressed by its weight under one load settles and bends as the infinite beam: y = P·β/(2·k·b), M = P/(4·β)', () => {
    const EI = 2e5, ks = 20000, b = 1, P = 500;
    const beta = Math.pow((ks * b) / (4 * EI), 0.25);
    const w = winklerStrip({ S: 40, b, EI, ks, ends: 1, loads: [{ s: 20, P, M: 0 }], dx: 0.05, preload: 100 });
    const mid = Math.round(20 / (40 / (w.s.length - 1)));
    expect(w.y[mid]!).toBeCloseTo((P * beta) / (2 * ks * b), 4);
    expect(w.M[mid]! / (P / (4 * beta))).toBeCloseTo(1, 1);
    expect(w.q[mid]!).toBeCloseTo(ks * w.y[mid]!, 9);
  });

  it('reads the soil pressure from the spring that gives it, the ends\' stiffened ones too', () => {
    const w = winklerStrip({ S: 4, b: 1, EI: 5e5, ks: 25000, ends: 2, loads: [{ s: 2, P: 400, M: 0 }], dx: 0.1 });
    expect(w.q[0]!).toBeCloseTo(2 * 25000 * w.y[0]!, 6);
    const mid = Math.round(w.s.length / 2) - 1;
    expect(w.q[mid]!).toBeCloseTo(25000 * w.y[mid]!, 6);
  });

  it('lets go of the soil where the columns lift the strip past what its weight presses: no pull, and the rest takes the load', () => {
    const w = winklerStrip({ S: 6, b: 1, EI: 2e5, ks: 20000, ends: 1, loads: [{ s: 0.3, P: 600, M: 0 }], dx: 0.1, preload: 5 });
    const lifted = w.y.map((v, i) => [v, w.q[i]!] as const).filter(([v]) => 20000 * v + 5 < 0);
    expect(lifted.length).toBeGreaterThan(0);
    for (const [, q] of lifted) expect(q).toBe(-5);
    const h = 6 / (w.s.length - 1);
    const reaction = w.q.reduce((t, q, i) => t + (q > -5 ? q : 0) * (i === 0 || i === w.q.length - 1 ? h / 2 : h), 0);
    expect(reaction).toBeCloseTo(600, 0);
  });

  it('stiffens the ends to the factor given, back to k a fifth of the way in', () => {
    expect(endFactor(0, 10, 2)).toBe(2);
    expect(endFactor(1, 10, 2)).toBeCloseTo(1.5, 9);
    expect(endFactor(2, 10, 2)).toBe(1);
    expect(endFactor(5, 10, 2)).toBe(1);
  });
});
