/** Deflections of the sheets' beams and slabs: the depth that spares the calculation, and the cracked, long-term deflection against each code's limit. */
import { describe, it, expect } from 'vitest';
import { aciDeflection, cantileverRoot, chordDeflectionEI, ec2Deflection, slabEdges, slabSpanInput, ts500Deflection, type DeflectionInput, type ServiceSpan } from '../deflection';
import { crackedInertia, effectiveInertia } from '../../codes/cirsoc201/effective-inertia';
import { beamRow, type BeamDemand, type SectionEnv } from '../beam-row';
import { slabRow, type SlabDemand } from '../slab-row';
import { rulesFor } from '../codes';
import { groupsArea, meshArea } from '../bars';
import { makeFmt } from '../format';
import { readDeflectionSettings, migrateDesignOptions } from '../design-options';

const f = makeFmt('.');
const MECH = { crackedInertia, effectiveInertia };
const CIRSOC = aciDeflection(MECH, 'cirsoc');
const ACI = aciDeflection(MECH, 'aci');
const zero = { k: 0, m: 0 };
const svc = (dead: { k: number; m: number }, live: { k: number; m: number }, roof = zero): ServiceSpan => ({ dead, live, roof, names: { dead: 'D', live: 'L', roof: '' } });
const beamInput = (o: Partial<DeflectionInput> = {}): DeflectionInput => ({
  member: 'beam', section: { b: 0.3, h: 0.6, d: 0.55, dPrime: 0.05, As: 10e-4, AsPrime: 0, AsReq: 9e-4 }, L: 6, ends: 'both', fc: 25, fy: 420,
  service: svc({ k: 400, m: 80 }, { k: 200, m: 40 }), settings: { supports: 'fragile' }, ...o,
});

describe('the chord deflection from the moment diagram', () => {
  const L = 6, w = 10, xs = Array.from({ length: 65 }, (_, i) => (i / 64) * L);
  it('is 5wL⁴/384 at midspan of a simple span and wL⁴/384 of a fixed one, times EI', () => {
    expect(chordDeflectionEI(xs, xs.map((x) => (w * x * (L - x)) / 2), L)[32]).toBeCloseTo((5 * w * L ** 4) / 384, 0);
    expect(chordDeflectionEI(xs, xs.map((x) => (w * x * (L - x)) / 2 - (w * L * L) / 12), L)[32]).toBeCloseTo((w * L ** 4) / 384, 0);
  });
  it('is wL⁴/8 at the tip of a cantilever, held at either end', () => {
    expect(chordDeflectionEI(xs, xs.map((x) => (-w * (L - x) ** 2) / 2), L, 'start')[64]).toBeCloseTo((w * L ** 4) / 8, -1);
    expect(chordDeflectionEI(xs, xs.map((x) => (-w * x ** 2) / 2), L, 'end')[0]).toBeCloseTo((w * L ** 4) / 8, -1);
  });
});

describe('ACI 318-19 and CIRSOC 201-2025 §24.2', () => {
  it('spares the calculation at the depth of Table 9.3.1.1, scaled by 0.4 + fy/700', () => {
    const o = CIRSOC.check(beamInput({ settings: {} }), f);
    expect(o.computed).toBe(false);
    expect(o.ok).toBe(true);
    expect(o.line.label).toBe('rcSheets.v.deflectionDepth');
    expect(o.line.ratio).toBeCloseTo(6 / 21 / 0.6, 6);
    const o500 = CIRSOC.check(beamInput({ settings: {}, fy: 500, section: { b: 0.3, h: 0.35, d: 0.3, dPrime: 0.04, As: 6e-4, AsPrime: 0, AsReq: 5e-4 } }), f);
    expect(o500.line.ratio).toBeCloseTo(((6 / 21) * (0.4 + 500 / 700)) / 0.35, 6);
  });

  it('calculates under fragile partitions: Bischoff Ie at each load level, λΔ = ξ/(1 + 50ρ′), against ℓ/480', () => {
    const Ec = 4700 * 5 * 1000, n = 200000 / (Ec / 1000), Ig = (0.3 * 0.6 ** 3) / 12, Mcr = (0.62 * 5 * 1000 * Ig) / 0.3;
    const As = 10e-4, d = 0.55;
    const x = (-n * As + Math.sqrt((n * As) ** 2 + 2 * 0.3 * n * As * d)) / 0.3;
    const Icr = (0.3 * x ** 3) / 3 + n * As * (d - x) ** 2;
    const Ie = (M: number) => Math.min(Ig, Icr / (1 - ((2 / 3) * Mcr / M) ** 2 * (1 - Icr / Ig)));
    const dT = 600 / (Ec * Ie(120)), dD = 400 / (Ec * Ie(80)), dS = 460 / (Ec * Ie(120));
    const after = 2 * dS + (dT - dS);
    const o = CIRSOC.check(beamInput(), f);
    expect(o.computed).toBe(true);
    expect(o.ok).toBe(false);
    expect(o.line.label).toBe('rcSheets.v.deflection');
    expect(o.line.ratio).toBeCloseTo(after / (6 / 480), 4);
    expect(o.line.clause).toBe('§24.2, Tabla 24.2.2');
    expect(ACI.check(beamInput(), f).line.clause).toBe('§24.2, Table 24.2.2');
    expect(o.group.steps.find((x) => x.label === 'rcSheets.s.defl.camber')!.value).toBe(`${f(dD * 1000, 1)} mm`);
    expect(o.group.steps.find((x) => x.label === 'rcSheets.s.defl.frequency')!.value).toBe(`${f(5.6 / Math.sqrt(dS * 100), 1)} Hz`);
    const none = CIRSOC.check(beamInput({ settings: { supports: 'none', always: true } }), f);
    expect(none.line.ratio).toBeCloseTo((dT - dD) / (6 / 360), 4);
    expect(none.ok).toBe(true);
  });

  it('takes ξ by the load duration of Table 24.2.4.1.3 and the compression steel at midspan', () => {
    const at = (months: 3 | 60, AsPrime: number) => CIRSOC.check(beamInput({ settings: { supports: 'fragile', months }, section: { ...beamInput().section, AsPrime } }), f);
    const step = (o: ReturnType<typeof at>) => o.group.steps.find((s) => s.label === 'rcSheets.s.defl.longTerm')!.value;
    expect(step(at(60, 0))).toBe('λΔ = 2.00');
    expect(step(at(3, 0))).toBe('λΔ = 1.00');
    expect(step(at(60, 0.3 * 0.55 * 0.01))).toBe('λΔ = 1.33');
    expect(at(60, 0.3 * 0.55 * 0.01).line.ratio!).toBeLessThan(at(60, 0).line.ratio!);
  });

  it('fails a member short of the table whose service response is unknown, saying so', () => {
    const o = CIRSOC.check(beamInput({ settings: {}, L: 14, service: undefined }), f);
    expect(o.ok).toBe(false);
    expect(o.line.label).toBe('rcSheets.v.deflectionNoService');
    expect(o.group.steps.at(-1)!.label).toBe('rcSheets.s.defl.noService');
  });

  it('two-way slabs with beams: Table 8.3.1.2 with 120 mm in CIRSOC and 125 mm in ACI, 10 % more at a bare discontinuous edge', () => {
    const tw = { lnLong: 5.7, lnShort: 4.7, alphaFm: 1.0, exterior: false, edgeBeams: false, bareEdges: 0, flat: false, continuousShare: 1 };
    const slab = (twoWay: typeof tw, h: number): DeflectionInput => ({ member: 'slab', section: { b: 1, h, d: h - 0.03, dPrime: 0.03, As: 3e-4, AsPrime: 0, AsReq: 2e-4 }, L: 6, ends: 'both', twoWay, fc: 25, fy: 420, settings: {} });
    const beta = 5.7 / 4.7;
    const hb = (5.7 * (0.8 + 420 / 1400)) / (36 + 5 * beta * 0.8);
    expect(CIRSOC.check(slab(tw, 0.2), f).line.demand).toBe(`${f(hb * 100, 1)} cm`);
    const small = { ...tw, lnLong: 3, lnShort: 2.8 };
    expect(CIRSOC.check(slab(small, 0.2), f).line.demand).toBe('12.0 cm');
    expect(ACI.check(slab(small, 0.2), f).line.demand).toBe('12.5 cm');
    expect(CIRSOC.check(slab({ ...tw, bareEdges: 1, exterior: true }, 0.2), f).line.demand).toBe(`${f(hb * 1.1 * 100, 1)} cm`);
    const stiff = { ...tw, alphaFm: 3 };
    expect(CIRSOC.check(slab(stiff, 0.2), f).line.demand).toBe(`${f(((5.7 * 1.1) / (36 + 9 * beta)) * 100, 1)} cm`);
  });

  it('two-way slabs without beams: Table 8.3.1.1 interpolated in fy', () => {
    const flat = { lnLong: 6, lnShort: 5, alphaFm: null, exterior: false, edgeBeams: false, bareEdges: 0, flat: true, continuousShare: 1 };
    const slab = (fy: number): DeflectionInput => ({ member: 'slab', section: { b: 1, h: 0.25, d: 0.22, dPrime: 0.03, As: 5e-4, AsPrime: 0, AsReq: 4e-4 }, L: 6, ends: 'both', twoWay: flat, fc: 25, fy, settings: {} });
    expect(CIRSOC.check(slab(420), f).line.demand).toBe(`${f((6 / 33) * 100, 1)} cm`);
    expect(CIRSOC.check(slab(500), f).line.demand).toBe(`${f((6 / (33 - (3 * 80) / 130)) * 100, 1)} cm`);
    expect(CIRSOC.check({ ...slab(420), twoWay: { ...flat, exterior: true } }, f).line.demand).toBe(`${f((6 / 30) * 100, 1)} cm`);
  });
});

describe('EN 1992-1-1 §7.4', () => {
  const EC2 = ec2Deflection(MECH);
  it('spares the calculation within the span-to-depth ratio of (7.16a) and (7.17)', () => {
    const x = beamInput({ ends: 'simple', fc: 30, fy: 500, settings: {}, section: { b: 0.3, h: 0.6, d: 0.55, dPrime: 0.05, As: 0.005 * 0.3 * 0.55, AsPrime: 0, AsReq: 0.005 * 0.3 * 0.55 } });
    const r0 = 1e-3 * Math.sqrt(30), rho = 0.005;
    const ld = 11 + (1.5 * Math.sqrt(30) * r0) / rho + 3.2 * Math.sqrt(30) * (r0 / rho - 1) ** 1.5;
    const o = EC2.check(x, f);
    expect(o.computed).toBe(false);
    expect(o.line.ratio).toBeCloseTo((6 / 0.55) / ld, 4);
    const fragile = EC2.check({ ...x, L: 8, settings: { supports: 'fragile' } }, f);
    expect(fragile.line.ratio).toBeCloseTo((8 / 0.55) / (ld * 7 / 8), 4);
  });

  it('calculates with ζ interpolation and Ec,eff = Ecm/(1 + φ) under the quasi-permanent loads, against l/250', () => {
    const x = beamInput({ fc: 30, fy: 500, settings: { always: true, creep: 2 } });
    const o = EC2.check(x, f);
    const Ecm = 22000 * (38 / 10) ** 0.3 * 1000, Eeff = Ecm / 3, fctm = 0.3 * 30 ** (2 / 3) * 1000;
    const Ig = 0.0054, Mcr = (fctm * Ig) / 0.3;
    const n = 200000 / (Eeff / 1000), As = 10e-4, d = 0.55;
    const kd = (-n * As + Math.sqrt((n * As) ** 2 + 2 * 0.3 * n * As * d)) / 0.3;
    const III = (0.3 * kd ** 3) / 3 + n * As * (d - kd) ** 2;
    const z = 1 - 0.5 * (Mcr / 92) ** 2;
    const dq = (460 / Eeff) * (z / III + (1 - z) / Ig);
    expect(o.computed).toBe(true);
    expect(o.line.ratio).toBeCloseTo(dq / (6 / 250), 4);
    expect(o.group.steps.some((s) => s.label === 'rcSheets.s.defl.shrinkage')).toBe(true);
  });
});

describe('TS 500', () => {
  const TS = ts500Deflection(MECH);
  it('always calculates a beam, labelled to be confirmed, with λ = 2 − 1.2·A′s/As', () => {
    const o = TS.check(beamInput({ settings: {} }), f);
    expect(o.computed).toBe(true);
    expect(o.line.label).toBe('rcSheets.ts500.u.deflection');
    expect(TS.check(beamInput({ settings: {}, section: { ...beamInput().section, AsPrime: 5e-4 } }), f).group.steps.find((s) => s.label === 'rcSheets.s.defl.longTerm')!.value).toBe('λ = 1.40');
  });
  it('spares a two-way slab at h ≥ ℓsn/(15 + 20/m)·(1 − αs/4) and 80 mm', () => {
    const tw = { lnLong: 6, lnShort: 4, alphaFm: 2.5, exterior: true, edgeBeams: true, bareEdges: 0, flat: false, continuousShare: 0.5 };
    const o = TS.check({ member: 'slab', section: { b: 1, h: 0.14, d: 0.11, dPrime: 0.03, As: 3e-4, AsPrime: 0, AsReq: 2e-4 }, L: 4, ends: 'both', twoWay: tw, fc: 25, fy: 420, settings: {} }, f);
    expect(o.line.label).toBe('rcSheets.ts500.u.deflectionDepth');
    expect(o.line.demand).toBe(`${f((4 / (15 + 20 / 1.5)) * (1 - 0.5 / 4) * 100, 1)} cm`);
  });
});

describe('slab edges and spans', () => {
  const geom = { beams: [{ x1: 0, y1: 0, x2: 5, y2: 0, b: 0.2, h: 0.5, kind: 'beam' as const }, { x1: 0, y1: 4, x2: 5, y2: 4, b: 0.2, h: 0.5, kind: 'beam' as const }, { x1: 0, y1: 0, x2: 0, y2: 4, b: 0.2, kind: 'wall' as const }], columns: [{ x: 5, y: 0, b: 0.3, h: 0.3 }, { x: 5, y: 4, b: 0.3, h: 0.3 }] };
  it('reads continuity from the neighbouring panels and αf of a beam as a T against the slab strip', () => {
    const e = slabEdges({ x0: 0, x1: 5, y0: 0, y1: 4 }, 0.12, [{ x0: 0, x1: 5, y0: 4, y1: 8 }], geom);
    expect(e.y1.continuous).toBe(true);
    expect(e.y0.continuous).toBe(false);
    expect(e.x0.kind).toBe('wall');
    expect(e.x1.kind).toBe('free');
    const T = (sides: number) => {
      const p = Math.min(0.38, 0.48) * sides, A = 0.2 * 0.5 + p * 0.12, yc = (0.2 * 0.5 * 0.25 + p * 0.12 * 0.44) / A;
      return (0.2 * 0.5 ** 3) / 12 + 0.2 * 0.5 * (0.25 - yc) ** 2 + (p * 0.12 ** 3) / 12 + p * 0.12 * (0.44 - yc) ** 2;
    };
    expect(e.y1.alpha).toBeCloseTo(T(2) / ((4 * 0.12 ** 3) / 12), 6);
    expect(e.y0.alpha).toBeCloseTo(T(1) / ((2 * 0.12 ** 3) / 12), 6);
    const span = slabSpanInput({ lx: 5, ly: 4, oneWay: false }, e);
    expect(span.twoWay!.alphaFm).toBeNull();
    expect(span.twoWay!.lnLong).toBeCloseTo(5 - 0.1, 9);
  });
  it('counts the columns at a flat panel\'s corners as its edges\' supports, and not where a beam at that corner already rests on them', () => {
    const cols = [0, 5].flatMap((x) => [0, 4].map((y) => ({ x, y, b: 0.3, h: 0.4 })));
    const flat = slabEdges({ x0: 0, x1: 5, y0: 0, y1: 4 }, 0.2, [], { beams: [], columns: cols });
    expect(Object.values(flat).map((e) => e.kind)).toEqual(['columns', 'columns', 'columns', 'columns']);
    expect(flat.x0.half).toBeCloseTo(0.15, 9);
    expect(flat.y0.half).toBeCloseTo(0.2, 9);
    expect(slabSpanInput({ lx: 5, ly: 4, oneWay: false }, flat).twoWay).toMatchObject({ flat: true, alphaFm: null, exterior: true, edgeBeams: false });
    const balcony = slabEdges({ x0: 0, x1: 2, y0: 0, y1: 4 }, 0.15, [], { beams: [{ x1: 0, y1: 0, x2: 0, y2: 4, b: 0.3, h: 0.6, kind: 'beam' }], columns: [{ x: 0, y: 0, b: 0.3, h: 0.3 }, { x: 0, y: 4, b: 0.3, h: 0.3 }] });
    expect(balcony.y0.kind).toBe('free');
    expect(cantileverRoot(balcony)).toBe('x0');
  });
  it('finds a cantilever off its one held edge, with neighbouring panels allowed at its sides', () => {
    const free = { continuous: false, kind: 'free' as const, alpha: 0, half: 0 };
    expect(cantileverRoot({ x0: { ...free, kind: 'beam', alpha: 5, half: 0.1 }, x1: free, y0: { ...free, continuous: true }, y1: free })).toBe('x0');
    expect(cantileverRoot({ x0: { ...free, kind: 'beam', alpha: 5, half: 0.1 }, x1: free, y0: { ...free, kind: 'beam', alpha: 5, half: 0.1 }, y1: free })).toBeNull();
  });
});

const env = (x: number, pos: number, neg: number): SectionEnv => ({ x, pos: { value: pos, source: { combo: 'U', x } }, neg: { value: neg, source: { combo: 'U', x } }, nPos: 0, nNeg: 0 });
const beamCtx = { mat: { fc: 25, fy: 420 }, cover: 0.025, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };

describe('the rows', () => {
  const beam = (service: ServiceSpan | undefined): BeamDemand => ({
    key: 'beam:1:0', name: 'V1', length: 7, b: 0.25, h: 0.5,
    start: env(0, 0, 0), span: env(3.5, 160, 0), end: env(7, 0, 0),
    negAny: { value: 0 }, nNegAny: 0, vu: { value: 90 }, nAtV: 0, tu: { value: 0 }, combos: [],
    ...(service ? { service } : {}),
  } as BeamDemand);
  const heavy = svc({ k: 400, m: 95 }, { k: 200, m: 40 });

  it('a proposal short of the deflection takes the steel that meets it, and its requirement says so for the run', () => {
    const plain = beamRow(beam(heavy), beamCtx, undefined, f);
    const wrapped = rulesFor('cirsoc201-2025').beamRow(beam(heavy), { ...beamCtx, deflection: { supports: 'nonFragile', always: true } } as never, undefined, f);
    const direct = CIRSOC.check({ ...beamInput(), member: 'beam', L: 7, ends: 'simple', service: heavy, settings: { supports: 'nonFragile', always: true }, section: { b: 0.25, h: 0.5, d: 0.5 - 0.025 - 0.008 - 0.008, dPrime: 0.045, As: groupsArea(plain.proposed.bottom) * 1e-4, AsPrime: groupsArea(plain.proposed.top) * 1e-4, AsReq: plain.req.bottom * 1e-4 } }, f);
    expect(direct.ok).toBe(false);
    const line = wrapped.verifications.find((v) => v.label === 'rcSheets.v.deflection')!;
    expect(line.ok).toBe(true);
    expect(wrapped.status).not.toBe('fail');
    expect(wrapped.isAdopted).toBe(false);
    expect(groupsArea(wrapped.proposed.bottom) + groupsArea(wrapped.proposed.top)).toBeGreaterThan(groupsArea(plain.proposed.bottom) + groupsArea(plain.proposed.top));
    expect(wrapped.req.bottom).toBeGreaterThan(plain.req.bottom);
    expect(wrapped.steps.find((g) => g.title === 'rcSheets.g.proposal')!.steps.some((s) => s.label === 'rcSheets.s.defl.proposal')).toBe(true);
    expect(wrapped.steps.some((g) => g.title === 'rcSheets.g.deflection')).toBe(true);
  });

  it('adopted bars short of the deflection fail; a member on the ground is not checked', () => {
    const plain = beamRow(beam(heavy), beamCtx, undefined, f);
    const r = rulesFor('aci318-19').beamRow(beam(heavy), { ...beamCtx, deflection: { supports: 'nonFragile', always: true } } as never, plain.proposed, f);
    expect(r.verifications.find((v) => v.label === 'rcSheets.v.deflection')!.ok).toBe(false);
    expect(r.status).toBe('fail');
    const off = rulesFor('aci318-19').beamRow({ ...beam(heavy), serviceOff: true } as BeamDemand, beamCtx as never, undefined, f);
    expect(off.verifications.some((v) => v.label.includes('deflection'))).toBe(false);
  });

  it('a slab proposal short of the deflection takes more steel in the strip it is read in', () => {
    const d = {
      key: 'slab:1', name: 'L1', lx: 5.5, ly: 5.5, h: 0.13,
      m: { bottomX: { value: 14 }, bottomY: { value: 14 }, topX: { value: 0 }, topY: { value: 0 } },
      service: { ...svc({ k: 20, m: 6 }, { k: 10, m: 3 }), strip: { face: 'bottomX' as const, reference: 'corners' as const } },
      edges: { x0: { continuous: false, kind: 'columns' as const, alpha: 0, half: 0.15 }, x1: { continuous: false, kind: 'columns' as const, alpha: 0, half: 0.15 }, y0: { continuous: false, kind: 'columns' as const, alpha: 0, half: 0.15 }, y1: { continuous: false, kind: 'columns' as const, alpha: 0, half: 0.15 } },
    } as SlabDemand;
    const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.02, diameters: [8, 10, 12, 16] };
    const plain = slabRow(d, ctx, undefined, f);
    const r = rulesFor('cirsoc201-2025').slabRow(d, ctx, undefined, f);
    const v = r.verifications.find((x) => x.label === 'rcSheets.v.deflection')!;
    expect(v.ok).toBe(true);
    expect(meshArea(r.proposed.bottomX)).toBeGreaterThan(meshArea(plain.proposed.bottomX));
    expect(r.status).not.toBe('fail');
  });
});

describe('the design data', () => {
  it('keeps only valid deflection settings, and keeps them through the options migration', () => {
    expect(readDeflectionSettings({ supports: 'fragile', months: 12, sustained: 0.5, creep: 2.2, always: true })).toEqual({ supports: 'fragile', months: 12, sustained: 0.5, creep: 2.2, always: true });
    expect(readDeflectionSettings({ supports: 'brick', months: 7, sustained: 2 })).toBeUndefined();
    expect(migrateDesignOptions({ torsion: 'compatibility', deflection: { supports: 'none' } }, undefined)).toEqual({ torsion: 'compatibility', deflection: { supports: 'none' } });
  });
});
