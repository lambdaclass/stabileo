import { describe, it, expect } from 'vitest';
import { CRITERION } from '../criteria';
import { peakSection, type BeamComboForces, type BeamDemand, type BeamEnd, type SectionEnv } from '../beam-row';
import { ec2LineCode } from '../ec2/beam-line';
import { EC2_SET, UK_SET, matOf } from '../ec2/basis';
import { beamCapacity } from '../ec2/beam-section';
import { TS500_LINE } from '../ts500/line';
import { CIRSOC_LINE } from '../beam-line';
import { rulesFor } from '../codes';
import { makeFmt } from '../format';
import { barArea, faceBars, faceLayout, groupsArea, proposeBeamFace } from '../bars';
import type { BeamAdopted, SheetCode } from '../types';

const fmt = makeFmt('.');
const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.025, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };
const sec = (x: number, pos: number, neg: number): SectionEnv => ({ x, pos: { value: pos, source: { combo: 'U', x } }, neg: { value: neg, source: { combo: 'U', x } }, nPos: 0, nNeg: 0 });
const combo = (o: Partial<BeamComboForces>): BeamComboForces => ({ combo: 'U', mStart: 0, mSpan: 0, mEnd: 0, mPos: 0, mNeg: 0, nStart: 0, nSpan: 0, nEnd: 0, v: 60, nV: 0, t: 0, ...o });
const demand = (o: Partial<BeamDemand> = {}): BeamDemand => ({
  key: 'beam:1:0', name: 'V1', length: 6, b: 0.25, h: 0.5,
  start: sec(0, 0, 90), span: sec(2.8, 60, 0), end: sec(6, 0, 130),
  negAny: { value: 130 }, nNegAny: 0, vu: { value: 120 }, nAtV: 0, tu: { value: 0 }, combos: [], ...o,
});
const CODES: SheetCode[] = ['cirsoc201-2025', 'aci318-19', 'en1992-1-1', 'bs-en1992-1-1', 'ts500-2000'];

describe('a combination\'s peak moment is carried by the bars where it acts', () => {
  it('maps the peak to the nearest of the three sections', () => {
    const d = demand();
    expect(peakSection(d, 6)).toBe('end');
    expect(peakSection(d, 0.4)).toBe('start');
    expect(peakSection(d, 3.5)).toBe('span');
    expect(peakSection(d, undefined)).toBeNull();
  });

  it('a span whose support bars stop short of mid-span reads its hogging peak at the support, in every code', () => {
    const k = combo({ mStart: -90, mSpan: 60, mEnd: -130, mPos: 60, mNeg: 130, xPos: 2.8, xNeg: 6 });
    const d = demand({ combos: [k] });
    for (const code of CODES) {
      const r = rulesFor(code).beamRow(d, ctx, undefined, fmt);
      const cut: BeamAdopted = {
        ...r.proposed,
        top: [{ count: 2, dia: 10 }],
        at: {
          start: { top: [{ count: 2, dia: 10 }, ...r.proposed.top], bottom: r.proposed.bottom },
          span: { top: [{ count: 2, dia: 10 }], bottom: r.proposed.bottom },
          end: { top: [{ count: 2, dia: 10 }, ...r.proposed.top], bottom: r.proposed.bottom },
        },
      };
      const row = rulesFor(code).beamRow(d, ctx, cut, fmt);
      expect(row.combos.rows[0]!.ratio, code).toBeLessThan(1);
      expect(row.verifications.find((v) => v.label === 'rcSheets.v.everyCombo')?.ok ?? true, code).toBe(true);
      const old = rulesFor(code).beamRow(demand({ combos: [{ ...k, xNeg: undefined }] }), ctx, cut, fmt);
      expect(old.combos.rows[0]!.ratio, code).toBeGreaterThan(1);
    }
  });
});

/** One span fixed into two columns under w kN/m, laid out by `code`'s rules. */
function frameSpan(code: SheetCode, o: { w?: number; half?: number; L?: number; h?: number; end?: BeamEnd; seismic?: boolean } = {}) {
  const { w = 60, half = 0.175, L = 5.5, h = 0.55, end = { kind: 'column', half } } = o;
  const env = Array.from({ length: 23 }, (_, i) => {
    const x = (i * L) / 22, m = (w * x * (L - x)) / 2 - (w * L * L) / 12;
    return { x, pos: Math.max(0, m), neg: Math.max(0, -m), v: Math.abs(w * (L / 2 - x)), nPos: 0, nNeg: 0, nV: 0 };
  });
  const d: BeamDemand = {
    key: 'beam:1:0', name: 'V1', length: L, b: 0.25, h,
    start: sec(0, 0, (w * L * L) / 12), span: sec(L / 2, (w * L * L) / 24, 0), end: sec(L, 0, (w * L * L) / 12),
    negAny: { value: (w * L * L) / 12 }, nNegAny: 0, vu: { value: (w * L) / 2 }, nAtV: 0, tu: { value: 0 }, combos: [], env,
    supportHalf: { start: end.half, end: end.half }, ends: { start: end, end },
    line: { group: 1, index: 0, spans: 1, startNode: 1, endNode: 2, lineName: 'V1' },
  };
  const c = { ...ctx, ...(o.seismic ? { seismic: { overstrength: 1.25 } } : {}) };
  const rules = rulesFor(code);
  return rules.beamLine([rules.beamRow(d, c, undefined, fmt)], c, undefined, fmt);
}

describe('a beam\'s bars anchored in an end column', () => {
  const anchor = (l: ReturnType<typeof frameSpan>) => l.verifications.find((v) => v.label === 'rcSheets.v.lineEndAnchor')!;

  it('EN 1992 and TS 500 count the anchorage along the bar, bend and tail, and lengthen the tail down the joint', () => {
    for (const code of ['en1992-1-1', 'bs-en1992-1-1', 'ts500-2000'] as const) {
      const l = frameSpan(code, { half: 0.125 });
      expect(anchor(l).ok, code).toBe(true);
      expect(parseFloat(anchor(l).demand!.split('=')[1]!), code).toBeGreaterThan((0.25 - 0.025 - 0.008 - 0.016) * 100);
      const top = l.bars.find((b) => b.face === 'top' && b.kind === 'continuous')!;
      const tail = top.anchor![0]!.tail;
      expect(tail, code).toBeGreaterThan(5 * top.bars.dia / 1000);
      const leg = Math.abs(top.shape.pts[0]![1] - top.shape.pts[1]![1]);
      expect(leg, code).toBeCloseTo(tail + (code === 'ts500-2000' ? 6 : top.bars.dia <= 16 ? 4 : 7) * top.bars.dia / 2000 + top.bars.dia / 2000, 6);
      expect(leg, code).toBeLessThanOrEqual(0.55 - 2 * (0.025 + 0.008) + 1e-9);
    }
  });

  it('reads the along-the-bar reach from the room, the bend\'s quarter arc and the tail', () => {
    const code = ec2LineCode(EC2_SET);
    expect(code.alongBar).toBe(true);
    expect(TS500_LINE.alongBar).toBe(true);
    expect(CIRSOC_LINE.alongBar).toBeUndefined();
  });

  it('under chapter 18 a hook in the joint takes ldh = fy·db/(5.4·√f\'c) (§18.8.5.1), not §25.4.3\'s', () => {
    expect(CIRSOC_LINE.jointHooked!(ctx, 16)).toBeCloseTo((420 * 16) / (5.4 * 5) / 1000, 9);
    expect(CIRSOC_LINE.jointHooked!({ ...ctx, mat: { fc: 64, fy: 420 } }, 10)).toBeCloseTo(0.15, 9);
    const l = frameSpan('cirsoc201-2025', { seismic: true });
    const v = anchor(l);
    expect(v.ok).toBe(true);
    expect(v.clause).toBe('§18.8.5.1');
    expect(frameSpan('cirsoc201-2025').verifications.find((x) => x.label === 'rcSheets.v.lineEndAnchor')!.clause).toBe('§25.4.3');
  });

  it('under CIRSOC a 20 cm column too narrow for ldh takes the FIUBA course\'s ld along the bar with a longer leg; ACI 318 leaves it short', () => {
    const narrow = { w: 25, half: 0.1, L: 4, h: 0.45 };
    const ci = frameSpan('cirsoc201-2025', narrow), aci = frameSpan('aci318-19', narrow);
    const v = anchor(ci);
    expect(v.ok).toBe(true);
    expect(v.clause).toBe(`§25.4.2; ${CRITERION}`);
    expect(v.demand).toMatch(/^ld Ø/);
    const top = ci.bars.find((b) => b.face === 'top' && b.kind === 'continuous')!;
    expect(top.anchor![0]!.need).toBeCloseTo(CIRSOC_LINE.development({ ...ctx }, top.bars.dia, true, 0.45, { count: top.bars.count, width: 0.25 }), 9);
    expect(anchor(aci).ok).toBe(false);
    expect(anchor(aci).demand).toMatch(/^ldh Ø/);
  });
});

describe('the neutral axis limit without redistribution (5.5(4), δ = 1)', () => {
  it('is (1 − k1)/k2 = 0.45 by the recommended values and 0.6 by the UK annex\'s k1 = 0.4, k2 = 0.6 + 0.0014/εcu2', () => {
    expect(EC2_SET.p.xuLimitLow).toBe(0.45);
    expect(UK_SET.p.xuLimitLow).toBe(0.6);
    expect((1 - 0.4) / (0.6 + 0.0014 / 0.0035)).toBeCloseTo(0.6, 9);
    expect(UK_SET.p.xuLimitHigh).toBeLessThanOrEqual((1 - 0.4) / (0.6 + 0.0014 / 0.0026) + 1e-9);
    expect(EC2_SET.p.xuLimitHigh).toBeLessThanOrEqual((1 - 0.54) / (1.25 * (0.6 + 0.0014 / 0.0026)) + 1e-9);
  });

  it('a section at x/d ≈ 0.5 is ductile under the UK annex and not under the recommended values', () => {
    const tension = [{ count: 4, dia: 25 }], compression = [{ count: 2, dia: 12 }];
    const g = { b: 0.25, h: 0.5 };
    const en = beamCapacity(g, 0.025, 8, tension, compression, false, 0, matOf(25, 500, EC2_SET.p), EC2_SET.p);
    const uk = beamCapacity(g, 0.025, 8, tension, compression, false, 0, matOf(25, 500, UK_SET.p), UK_SET.p);
    expect(en.xd).toBeGreaterThan(0.45);
    expect(uk.xd).toBeLessThan(0.6);
    expect(en.ductile).toBe(false);
    expect(uk.ductile).toBe(true);
  });
});

/** The deflection lines a demand with no service loads fails on: these demands carry none, and `deflection.test.ts` covers them. */
const NO_SERVICE = new Set(['rcSheets.v.deflectionNoService', 'rcSheets.ts500.u.deflectionNoService']);

describe('a TS 500 slab proposal', () => {
  const slab = (m: number, h = 0.15) => ({
    key: 'slab:1', name: 'L1', level: 'N1', lx: 4, ly: 5, h,
    m: { bottomX: { value: 8 }, bottomY: { value: 6 }, topX: { value: m * 0.8 }, topY: { value: m } },
  });

  it('reads each face\'s depth with the bars it proposes, so a thick inner layer still carries its moment', () => {
    const rules = rulesFor('ts500-2000');
    const sctx = { mat: { fc: 25, fy: 420 }, cover: 0.025, diameters: [8, 10, 12, 16] };
    const failing = [];
    for (let m = 4; m <= 58; m += 0.5) {
      const r = rules.slabRow(slab(m) as never, sctx, undefined, fmt);
      if (r.verifications.some((v) => !v.ok && !NO_SERVICE.has(v.label))) failing.push(m);
    }
    expect(failing).toEqual([]);
  });
});

const simple = (o: { b: number; h: number; mu: number; vu?: number; L?: number }): BeamDemand => ({
  key: 'beam:9:0', name: 'V9', length: o.L ?? 5, b: o.b, h: o.h,
  start: sec(0, 0, 0), span: sec((o.L ?? 5) / 2, o.mu, 0), end: sec(o.L ?? 5, 0, 0),
  negAny: { value: 0 }, nNegAny: 0, vu: { value: o.vu ?? 60 }, nAtV: 0, tu: { value: 0 }, combos: [],
});

describe('a beam that needs compression steel', () => {
  const c30 = { ...ctx, cover: 0.03 };
  it('is proposed doubly reinforced and verifies in every code but TS 500, whose 2 % caps its tension steel: 20 × 30 of 4,5 m under 90 kN·m', () => {
    const ts = rulesFor('ts500-2000').beamRow(simple({ b: 0.2, h: 0.3, mu: 90, L: 4.5 }), c30, undefined, fmt);
    expect(ts.status).toBe('fail');
    expect(ts.verifications.find((v) => v.label === 'rcSheets.ts500.v.rhoMax')!.ok).toBe(false);
    for (const f of ['top', 'bottom'] as const) expect(new Set(faceBars(ts.proposed[f], 0.2, 0.03, ts.proposed.stirrups.dia).map((x) => x.row)).size).toBeLessThanOrEqual(2);
    for (const code of CODES.filter((x) => x !== 'ts500-2000')) {
      const r = rulesFor(code).beamRow(simple({ b: 0.2, h: 0.3, mu: 90, L: 4.5 }), c30, undefined, fmt);
      expect(r.verifications.filter((v) => !v.ok && !NO_SERVICE.has(v.label)).map((v) => v.label), code).toEqual([]);
      expect(r.flexure.every((f) => f.ductile), code).toBe(true);
      expect(groupsArea(r.proposed.top), code).toBeGreaterThan(2 * barArea(10));
      for (const f of ['top', 'bottom'] as const) expect(new Set(faceBars(r.proposed[f], 0.2, 0.03, r.proposed.stirrups.dia).map((x) => x.row)).size, `${code} ${f}`).toBeLessThanOrEqual(2);
    }
  });

  it('CIRSOC asks the compression steel the design needs, raised 30 % (FIUBA §8.9), not the bars a check would pick', () => {
    const r = rulesFor('cirsoc201-2025').beamRow(simple({ b: 0.2, h: 0.3, mu: 90 }), c30, undefined, fmt);
    expect(r.req.compression!.top).toBeGreaterThan(4);
    expect(r.req.compression!.top).toBeLessThan(8);
  });
});

describe('a face too narrow for the bars chosen', () => {
  it('takes thinner bars, or two consecutive diameters, that lay out in at most two layers', () => {
    const g = proposeBeamFace(8, 0.15, 0.4, 0.03, 8, [10, 12, 16, 20, 25]);
    expect(groupsArea(g)).toBeGreaterThanOrEqual(8 - 1e-9);
    expect(faceLayout(g, 0.15, 0.03, 8).fits).toBe(true);
    expect(new Set(faceBars(g, 0.15, 0.03, 8).map((x) => x.row)).size).toBeLessThanOrEqual(2);
    const dias = [...new Set(g.map((x) => x.dia))].sort((p, q) => p - q);
    expect(dias.length).toBeLessThanOrEqual(2);
    if (dias.length === 2) expect([10, 12, 16, 20, 25].indexOf(dias[1]!) - [10, 12, 16, 20, 25].indexOf(dias[0]!)).toBe(1);
  });
});

describe('the FIUBA course\'s criteria in CIRSOC beams', () => {
  const cirsoc = rulesFor('cirsoc201-2025'), aci = rulesFor('aci318-19');
  it('stirrups at most 30 cm apart where shear needs them (§9.5), cited; ACI keeps d/2', () => {
    const d = simple({ b: 0.3, h: 0.9, mu: 150, vu: 260, L: 7 });
    const r = cirsoc.beamRow(d, ctx, undefined, fmt), a = aci.beamRow(d, ctx, undefined, fmt);
    expect(r.adopted.stirrups.spacing).toBeLessThanOrEqual(0.3 + 1e-9);
    expect(r.verifications.find((v) => v.label === 'rcSheets.v.stirrupSpacing')!.clause).toContain(CRITERION);
    expect(a.verifications.find((v) => v.label === 'rcSheets.v.stirrupSpacing')!.clause).not.toContain(CRITERION);
  });

  it('four legs in a web over 40 cm (§9.6)', () => {
    const r = cirsoc.beamRow(simple({ b: 0.5, h: 0.5, mu: 120, vu: 150 }), ctx, undefined, fmt);
    expect(r.adopted.stirrups.legs).toBeGreaterThanOrEqual(4);
    const v = r.verifications.find((x) => x.label === 'rcSheets.v.wideLegs')!;
    expect(v.ok).toBe(true);
    expect(v.clause).toBe(CRITERION);
    expect(aci.beamRow(simple({ b: 0.5, h: 0.5, mu: 120, vu: 150 }), ctx, undefined, fmt).verifications.some((x) => x.label === 'rcSheets.v.wideLegs')).toBe(false);
  });

  it('hangers of at least half the bottom bars\' diameter and the stirrup\'s (§8.1)', () => {
    const r = cirsoc.beamRow(simple({ b: 0.25, h: 0.5, mu: 190 }), ctx, undefined, fmt);
    const bottom = Math.max(...r.proposed.bottom.map((g) => g.dia));
    expect(bottom).toBeGreaterThanOrEqual(20);
    expect(Math.min(...r.proposed.top.map((g) => g.dia))).toBeGreaterThanOrEqual(Math.max(r.proposed.stirrups.dia, bottom / 2));
  });
});
