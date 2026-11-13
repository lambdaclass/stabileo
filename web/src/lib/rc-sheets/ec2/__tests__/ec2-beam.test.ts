import { describe, it, expect } from 'vitest';
import type { BeamDemand, SectionEnv } from '../../beam-row';
import { makeFmt } from '../../format';
import { EC2_RECOMMENDED, EC2_UK } from '../../../engine/design/eurocode/ec2-params';
import { basicAnchorage, designAnchorage, lapLength, matOf, momentCapacity, resultant, shearCapacity, EC2_SET, UK_SET } from '../basis';
import { makeBeamRow } from '../beam-row';
import { makeBeamLine, shiftedRow } from '../beam-line';
import { ec2Rules, ukRules } from '..';

const f = makeFmt('.');
const env = (x: number, pos: number, neg: number): SectionEnv => ({ x, pos: { value: pos, source: { combo: 'U', x } }, neg: { value: neg, source: { combo: 'U', x } }, nPos: 0, nNeg: 0 });
const ctx = { mat: { fc: 25, fy: 500 }, cover: 0.025, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };
const beam = (o: Partial<BeamDemand> = {}): BeamDemand => ({
  key: 'beam:1:0', name: 'V1', length: 6, b: 0.3, h: 0.6,
  start: env(0, 0, 0), span: env(3, 200, 0), end: env(6, 0, 0),
  negAny: { value: 0 }, nNegAny: 0, vu: { value: 100 }, nAtV: 0, tu: { value: 0 }, combos: [], ...o,
});
const line = (r: { verifications: Array<{ label: string; ok: boolean }> }, label: string) => r.verifications.find((v) => v.label === label);

// 30 × 60, C25/30, B500, c = 25 mm, links Ø8, Ø16 assumed: d = 600 − 25 − 8 − 8 = 559 mm.
const D = 0.559;

describe('EC2 beam row', () => {
  it('designs the sagging steel by the rectangular block of 3.1.7(3)', () => {
    // η·fcd·b·λx·(d − λx/2) = M: 16 667·0.3·0.8·x·(0.559 − 0.4x) = 200 → x = 0.09605 m, z = d − 0.4x = 0.52058 m.
    // As = 200/(434.78·10³·0.52058) = 8.836 cm².
    const x = (2236 - Math.sqrt(2236 ** 2 - 4 * 1600 * 200)) / 3200;
    const as = 200 / ((500 / 1.15) * 1000 * (D - 0.4 * x)) * 1e4;
    expect(as).toBeCloseTo(8.836, 2);
    const r = makeBeamRow(EC2_SET)(beam(), ctx, undefined, f);
    expect(r.req.bottom).toBeCloseTo(as, 2);
    expect(r.status).not.toBe('fail');
  });

  it('reads αcc = 0.85 under the UK National Annex, so the same moment needs more steel', () => {
    // fcd = 0.85·25/1.5 = 14.17 MPa: 1360x² − 1900.6x + 200 = 0 → x = 0.11463, z = 0.51315 m → As = 8.964 cm².
    const x = (1900.6 - Math.sqrt(1900.6 ** 2 - 4 * 1360 * 200)) / 2720;
    const as = 200 / ((500 / 1.15) * 1000 * (D - 0.4 * x)) * 1e4;
    const uk = makeBeamRow(UK_SET)(beam(), ctx, undefined, f);
    expect(uk.req.bottom).toBeCloseTo(as, 1);
    expect(uk.req.bottom).toBeGreaterThan(makeBeamRow(EC2_SET)(beam(), ctx, undefined, f).req.bottom);
  });

  it('floors a light moment at As,min of 9.2.1.1(1)', () => {
    // fctm = 0.3·25^(2/3) = 2.565; max(0.26·2.565/500; 0.0013) = 0.001334 → 0.001334·0.3·0.559 = 2.237 cm².
    const r = makeBeamRow(EC2_SET)(beam({ span: env(3, 20, 0) }), ctx, undefined, f);
    expect(r.req.bottom).toBeCloseTo(0.26 * 0.3 * 25 ** (2 / 3) / 500 * 0.3 * D * 1e4, 2);
  });

  it('computes VRd,c of 6.2.2(1) and the links of 6.2.3(3)', () => {
    // 3Ø20 = 9.425 cm²: k = 1 + √(200/559) = 1.598, ρl = 0.005620, vRd,c = 0.12·1.598·(100·0.00562·25)^⅓ = 0.4628 MPa → 77.6 kN.
    const m = matOf(25, 500, EC2_RECOMMENDED);
    const k = 1 + Math.sqrt(200 / 559), rho = 9.425e-4 / (0.3 * D);
    const vrdc = 0.12 * k * (100 * rho * 25) ** (1 / 3) * 0.3 * D * 1000;
    expect(vrdc).toBeCloseTo(77.6, 0);
    expect(shearCapacity(0.3, D, 9.425e-4, 0, m, EC2_RECOMMENDED).vrdc).toBeCloseTo(vrdc, 1);
    // VEd = 250 kN: VRd,max(cotθ = 2.5) = 0.3·0.503·0.54·16 667/(2.5 + 0.4) = 468 kN ≥ VEd, so cotθ = 2.5;
    // Asw/s = 250/(0.9·0.559·434 783·2.5) = 4.572 cm²/m, two legs: 2.286 cm²/m each.
    const r = makeBeamRow(EC2_SET)(beam({ vu: { value: 250 } }), ctx, undefined, f);
    expect(r.req.stirrupPerLeg).toBeCloseTo(250 / (0.9 * D * (500 / 1.15) * 1000 * 2.5) * 1e4 / 2, 2);
    expect(line(r, 'rcSheets.v.shear')!.ok).toBe(true);
  });

  it('leaves compatibility torsion out at the ultimate limit state (6.3.1(2)) and designs equilibrium torsion (6.3.2)', () => {
    const d = beam({ vu: { value: 250 }, tu: { value: 20 } });
    const comp = makeBeamRow(EC2_SET)(d, { ...ctx, torsion: 'compatibility' }, undefined, f);
    expect(comp.req.torsionNeglected).toBe(true);
    expect(line(comp, 'rcSheets.ec2.v.torsionCompat')?.ok).toBe(true);
    // tef = A/u = 0.18/1.8 = 0.10 m, Ak = 0.2·0.5 = 0.10 m², uk = 1.4 m; at cotθ = 2.5 ΣAsl = 20·1.4·2.5/(2·0.1·434 783) = 8.05 cm².
    const eq = makeBeamRow(EC2_SET)(d, ctx, undefined, f);
    expect(eq.req.torsionNeglected).toBe(false);
    expect(eq.req.al).toBeCloseTo(20 * 1.4 * 2.5 / (2 * 0.1 * (500 / 1.15) * 1000) * 1e4, 2);
    expect(eq.verifications.every((v) => v.ok)).toBe(true);
  });

  it('fails bars a person adopts short, and over-reinforced bars past the x/d limit of 5.5(4)', () => {
    const good = makeBeamRow(EC2_SET)(beam(), ctx, undefined, f);
    const short = makeBeamRow(EC2_SET)(beam(), ctx, { ...good.proposed, bottom: [{ count: 2, dia: 16 }] }, f);
    expect(line(short, 'rcSheets.v.flexPos.span')!.ok).toBe(false);
    const heavy = makeBeamRow(EC2_SET)(beam({ span: env(3, 600, 0) }), ctx, { ...good.proposed, bottom: [{ count: 5, dia: 25 }, { count: 5, dia: 25 }], top: [{ count: 2, dia: 10 }] }, f);
    expect(line(heavy, 'rcSheets.ec2.v.xd')?.ok).toBe(false);
    expect(heavy.status).toBe('fail');
  });
});

describe('EC2 section engine', () => {
  it('carries the squash load at the pivot strain εc2 = 2 ‰ (6.1(5))', () => {
    // 30 × 30, C30/37, 4Ø16 = 8.04 cm²: η·fcd·Ac = 20·0.09 = 1800 kN; steel at 2 ‰ → 400 MPa (< fyd), less the concrete it displaces: 8.04·(400 − 20)/10 = 305.6 kN.
    const m = matOf(30, 500, EC2_RECOMMENDED);
    const as = 4 * Math.PI * 0.016 ** 2 / 4;
    const layers = [{ y: 0.05, area: as / 2 }, { y: 0.25, area: as / 2 }];
    expect(resultant(300, { b: 0.3, h: 0.3 }, layers, m).n).toBeCloseTo(1800 + as * (400 - 20) * 1000, 0);
    expect(momentCapacity(2200, { b: 0.3, h: 0.3 }, layers, m)).toBeNull();
  });
});

describe('EC2 continuous beam', () => {
  it('anchors and laps by 8.4 and 8.7.3', () => {
    // C25: fctd = 0.7·2.565/1.5 = 1.197 MPa; fbd = 2.25·1.197 = 2.693 MPa (good bond);
    // lb,rqd(Ø16) = 16/4·434.78/2.693 = 645.8 mm; top bars of a 60 cm beam in poor bond: /0.7 = 922.5 mm; l0 = 1.5·lb,rqd.
    const m = matOf(25, 500, EC2_RECOMMENDED);
    expect(basicAnchorage(m, 16, true) * 1000).toBeCloseTo(645.8, 0);
    expect(designAnchorage(m, 16, false) * 1000).toBeCloseTo(922.5, 0);
    expect(lapLength(m, 16, true) * 1000).toBeCloseTo(968.7, 0);
  });

  it('shifts the envelope by al and lays the bars out over two spans', () => {
    const e = (L: number, k: number) => Array.from({ length: 13 }, (_, i) => {
      const x = (i * L) / 12, t = x / L;
      const mo = k === 0 ? 4 * 150 * t * (1 - t) - 120 * t : 4 * 150 * t * (1 - t) - 120 * (1 - t);
      return { x, pos: Math.max(0, mo), neg: Math.max(0, -mo), v: 120 };
    });
    const rows = [0, 1].map((k) => makeBeamRow(EC2_SET)(beam({
      key: `beam:1:${k}`, start: env(0, 0, k === 1 ? 120 : 0), span: env(3, 100, 0), end: env(6, 0, k === 0 ? 120 : 0), vu: { value: 120 },
      line: { group: 1, index: k, spans: 2, startNode: k, endNode: k + 1, lineName: 'V1' }, env: e(6, k),
    }), ctx, undefined, f));
    const shifted = shiftedRow(rows[0]!, 0.3);
    expect(shifted.demand.env![1]!.neg).toBeGreaterThanOrEqual(rows[0]!.demand.env![0]!.neg - 1e-9);
    const lay = makeBeamLine(EC2_SET)(rows, ctx, undefined, f);
    expect(lay.verifications.find((v) => v.label === 'rcSheets.v.lineEnvelope')!.ok).toBe(true);
    expect(lay.anchorage.length).toBeGreaterThan(0);
    expect(lay.steps[0]!.steps[0]!.label).toBe('rcSheets.ec2.s.lineShift');
    expect(lay.cutoffs.every((c) => c.legality !== 'illegal')).toBe(true);
  });

  it('exposes both rule sets without seismic provisions', () => {
    expect(ec2Rules.seismic).toBe(false);
    expect(ukRules.seismic).toBe(false);
    expect(EC2_UK.alphaCC).toBe(0.85);
  });
});
