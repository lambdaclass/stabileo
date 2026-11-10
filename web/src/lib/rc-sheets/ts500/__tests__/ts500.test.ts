import { describe, it, expect } from 'vitest';
import es from '../../../i18n/locales/es';
import en from '../../../i18n/locales/en';
import pt from '../../../i18n/locales/pt';
import de from '../../../i18n/locales/de';
import fr from '../../../i18n/locales/fr';
import tr from '../../../i18n/locales/tr';
import type { BeamDemand, SectionEnv } from '../../beam-row';
import type { ColumnDemand } from '../../column-row';
import type { WallDemand } from '../../wall-row';
import type { SlabDemand } from '../../slab-row';
import type { PunchingDemand } from '../../punching-row';
import { makeFmt } from '../../format';
import { rulesFor } from '../../codes';
import { alpha1, k1Of, lapOf, lbOf, rhoMinBeam, ts500Mat, vcrOf } from '../basis';
import { designFlexure } from '../section';
import { capacityAt, utilisation } from '../biaxial';
import { shearState } from '../beam-shear';
import { axis, heldFaceBars, tieDiaFor, tieMaxOf } from '../column-design';
import { punchingGamma } from '../punching';
import { ts500Rules } from '..';

const f = makeFmt('.');
const C25 = ts500Mat({ fc: 25, fy: 420 });
const env = (x: number, pos: number, neg: number, n = 0): SectionEnv => ({ x, pos: { value: pos, source: { combo: 'U', x } }, neg: { value: neg, source: { combo: 'U', x } }, nPos: n, nNeg: n });
const beamCtx = { mat: { fc: 25, fy: 420 }, cover: 0.025, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };

describe('TS 500 material basis (6.2.5, 7.1)', () => {
  it('C25/S420: fcd = 25/1.5, fctd = 0.35·√25/1.5, fyd = 420/1.15', () => {
    expect(C25.fcd).toBeCloseTo(16.667, 3);
    expect(C25.fctd).toBeCloseTo(1.1667, 4);
    expect(C25.fyd).toBeCloseTo(365.217, 3);
    expect(C25.ec).toBeCloseTo(3250 * 5 + 14000, 6);
  });

  it('k1 = 0.85 − 0.006·(fck − 25) between 0.70 and 0.85 (Table 7.1)', () => {
    expect(k1Of(20)).toBe(0.85);
    expect(k1Of(30)).toBeCloseTo(0.82, 9);
    expect(k1Of(40)).toBeCloseTo(0.76, 9);
    expect(k1Of(60)).toBe(0.7);
  });

  it('ρmin = 0.8·fctd/fyd (7.3) = 0.8·1.1667/365.22 = 0.002556', () => {
    expect(rhoMinBeam(C25)).toBeCloseTo(0.8 * (0.35 * 5 / 1.5) / (420 / 1.15), 9);
    expect(rhoMinBeam(C25)).toBeCloseTo(0.002556, 6);
  });
});

describe('beam flexure (7.1)', () => {
  it('As for Md = 150 kN·m on 30 × 50, d = 45 cm: T·(d − T/(2·0.85·fcd·b)) = Md', () => {
    const k = 0.85 * C25.fcd * 0.3 * 1000;
    const T = (0.45 * 2 * k - Math.sqrt((0.45 * 2 * k) ** 2 - 4 * 2 * k * 150)) / 2;
    expect(T).toBeCloseTo(368.9, 1);
    const r = designFlexure({ b: 0.3, h: 0.5 }, C25, 150, 0, 0.45, 0.05);
    expect(r.as).toBeCloseTo(T / C25.fyd * 10, 2);
    expect(r.as).toBeCloseTo(10.10, 2);
    expect(r.asComp).toBe(0);
    const cb = 0.45 * 0.003 / (0.003 + C25.fyd / 2e5);
    expect(r.asb).toBeCloseTo(0.85 * C25.fcd * 0.3 * 0.85 * cb / C25.fyd * 1e4, 3);
  });

  it('past 0.85·ρb it adds compression steel', () => {
    const r = designFlexure({ b: 0.3, h: 0.5 }, C25, 420, 0, 0.45, 0.05);
    expect(r.asComp).toBeGreaterThan(0);
    expect(r.as).toBeGreaterThan(r.asLim);
  });
});

describe('beam shear (8.1)', () => {
  it('Vcr = 0.65·fctd·bw·d, Vc = 0.8·Vcr and Asw/s for Vd = 200 kN on 30 × 50, d = 45 cm', () => {
    const s = shearState(C25, 0.3, 0.5, 0.45, 200, 0);
    const vcr = 0.65 * (0.35 * 5 / 1.5) * 0.3 * 0.45 * 1000;
    expect(vcr).toBeCloseTo(102.375, 3);
    expect(s.vcr).toBeCloseTo(vcr, 6);
    expect(s.vc).toBeCloseTo(0.8 * vcr, 6);
    expect(s.swReq).toBeCloseTo((200 - 0.8 * vcr) / (C25.fyd * 1000 * 0.45) * 1e4, 6);
    expect(s.swReq).toBeCloseTo(7.186, 3);
    expect(s.swMin).toBeCloseTo(0.3 * C25.fctd / C25.fyd * 0.3 * 1e4, 6);
    expect(s.vmax).toBeCloseTo(0.22 * C25.fcd * 0.3 * 0.45 * 1000, 6);
    expect(s.sMax).toBeCloseTo(0.225, 9);
  });

  it('axial compression raises Vcr by 1 + 0.07·Nd/Ac', () => {
    expect(vcrOf(C25, 0.3, 0.45, 100, 0.15)).toBeCloseTo(102.375 * (1 + 0.07 * 100 / 150), 6);
  });
});

describe('anchorage and laps (9.1, 9.3)', () => {
  it('lb = 0.12·(fyd/fctd)·Ø ≥ 20·Ø: Ø16 in C25/S420 is 60.1 cm', () => {
    expect(lbOf(C25, 16)).toBeCloseTo(0.12 * (C25.fyd / C25.fctd) * 0.016, 9);
    expect(lbOf(C25, 16)).toBeCloseTo(0.601, 3);
    expect(lbOf(C25, 16, true)).toBeCloseTo(1.4 * 0.601, 3);
    expect(lbOf(ts500Mat({ fc: 50, fy: 220 }), 16)).toBeCloseTo(20 * 0.016, 9);
  });

  it('a lap is α1·lb: 1.8 where every bar is spliced at one section', () => {
    expect(alpha1(1)).toBe(1.8);
    expect(lapOf(C25, 16, false, 1)).toBeCloseTo(1.8 * 0.601, 3);
  });
});

describe('column capacity (7.1, 7.6)', () => {
  const bars = [-0.15, 0.15].flatMap((x) => [-0.15, 0.15].map((y) => ({ x, y, area: Math.PI * 0.01 ** 2 })));
  const sec = { b: 0.4, h: 0.4, bars };

  it('at c = 20 cm about x the 40 × 40 with 4Ø20 carries N = 954 kN with Mx = 178 kN·m', () => {
    const as2 = 2 * Math.PI * 0.01 ** 2;
    const cc = 0.85 * C25.fcd * 0.4 * 0.85 * 0.2 * 1000;
    const top = (C25.fyd - 0.85 * C25.fcd) * as2 * 1000, bottom = C25.fyd * as2 * 1000;
    const n = cc + top - bottom, m = cc * (0.2 - 0.85 * 0.2 / 2) + (top + bottom) * 0.15;
    expect(n).toBeCloseTo(954.4, 1);
    expect(m).toBeCloseTo(178.3, 1);
    const p = capacityAt(sec, C25, Math.PI / 2, n)!;
    expect(p.mx).toBeCloseTo(m, 1);
    expect(Math.abs(p.my)).toBeLessThan(1e-6);
    expect(utilisation(sec, C25, n, m, 0)).toBeCloseTo(1, 3);
  });

  it('pure compression N0 = 0.85·fcd·(Ac − As) + fyd·As', () => {
    const as = 4 * Math.PI * 0.01 ** 2;
    const n0 = (0.85 * C25.fcd * (0.16 - as) + C25.fyd * as) * 1000;
    expect(utilisation(sec, C25, n0 / 2, 0, 0)).toBeCloseTo(0.5, 6);
  });

  it('moment magnification β = Cm/(1 − 1.3·Nd/Nk), Nk = π²·0.4·Ec·Ic/((1 + Rm)·ℓk²)', () => {
    const d: ColumnDemand = { key: 'c', name: 'C', b: 0.4, h: 0.4, length: 6, lu: 6, psiTop: 20, psiBot: 20, cases: [] };
    const r = axis(d, C25, { combo: 'U', pu: 1000, mxTop: 50, mxBot: 50, myTop: 0, myBot: 0 }, 'x');
    expect(r.k).toBe(1);
    expect(r.lambda).toBeCloseTo(6 / 0.12, 9);
    expect(r.lim).toBeCloseTo(22, 9);
    const nk = Math.PI ** 2 * 0.4 * 30250e3 * (0.4 ** 4 / 12) / 2 / 36;
    expect(r.nk).toBeCloseTo(nk, 3);
    expect(r.beta).toBeCloseTo(1 / (1 - 1.3 * 1000 / nk), 6);
  });

  it('ties (7.4.1): s ≤ min(12·Øl,min; 200 mm), Øt ≥ Øl,max/3, held bars at most 300 mm apart', () => {
    expect(tieMaxOf(16)).toBeCloseTo(0.192, 9);
    expect(tieMaxOf(20)).toBeCloseTo(0.2, 9);
    expect(tieDiaFor(16)).toBe(6);
    expect(tieDiaFor(20)).toBe(8);
    const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.025, tieDia: 8, diameters: [20] };
    const span = 0.6 - 2 * (0.025 + 0.008 + 0.01);
    expect(span / 4).toBeCloseTo(0.1285, 4);
    expect(heldFaceBars(0.6, 3, 20, ctx, 8)).toEqual([2]);
    expect(heldFaceBars(0.6, 1, 20, ctx, 8)).toEqual([1]);
    expect(heldFaceBars(0.3, 0, 20, ctx, 8)).toEqual([]);
    expect(heldFaceBars(0.8, 1, 20, ctx, 8)).toBeNull();
  });

  it('proposes a column that verifies, with ρ between 1 % and 4 %', () => {
    const d: ColumnDemand = { key: 'column:1:0', name: 'C1', b: 0.4, h: 0.4, length: 3, lu: 2.6, psiTop: 1, psiBot: 1, cases: [
      { combo: 'U', pu: 1800, puMin: 1750, mxTop: 90, mxBot: -60, myTop: 30, myBot: -20, vx: 60, vy: 20 },
    ] };
    const r = ts500Rules.columnRow(d, { mat: { fc: 25, fy: 420 }, cover: 0.025, tieDia: 8, diameters: [12, 14, 16, 20, 25] }, undefined, f);
    expect(r.verifications.every((v) => v.ok)).toBe(true);
    expect(r.checks.area).toBeGreaterThanOrEqual(0.01 * 0.16 * 1e4 - 1e-6);
    expect(r.adopted.corner).toBeGreaterThanOrEqual(14);
    expect(r.adopted.tieSpacing).toBeLessThanOrEqual(0.2 + 1e-9);
  });
});

describe('slab strip (7.1, 8.1.3)', () => {
  it('Md = 20 kN·m/m on a 15 cm two-way slab', () => {
    const d: SlabDemand = { key: 'slab:1', name: 'L1', lx: 4, ly: 5, h: 0.15, m: { bottomX: { value: 20 }, bottomY: { value: 8 }, topX: { value: 0 }, topY: { value: 0 } }, q: { x: { value: 40 }, y: { value: 30 } } };
    const r = ts500Rules.slabRow(d, { mat: { fc: 25, fy: 420 }, cover: 0.025, diameters: [8, 10, 12] }, undefined, f);
    const face = r.faces.bottomX;
    const k = 0.85 * C25.fcd * 1000;
    const T = (face.d * 2 * k - Math.sqrt((face.d * 2 * k) ** 2 - 8 * k * 20)) / 2;
    expect(face.asStrength).toBeCloseTo(T / C25.fyd * 10, 2);
    expect(r.faces.bottomY.asMin).toBeCloseTo(0.0015 * 0.15 * 1e4, 6);
    const sum = r.verifications.find((v) => v.label === 'rcSheets.ts500.v.slabSum')!;
    expect(sum.demand).toBe(`${f(0.0035 * 0.15 * 1e4)} cm²/m`);
    expect(sum.ok).toBe(true);
    expect(r.faces.bottomY.sMax).toBeCloseTo(0.25, 9);
    expect(r.faces.bottomX.sMax).toBeCloseTo(0.2, 9);
    expect(r.shear.x.phiVc).toBeCloseTo(0.65 * C25.fctd * Math.min(r.faces.bottomX.d, r.faces.bottomX.d) * 1000, 6);
    expect(r.verifications.every((v) => v.ok)).toBe(true);
  });
});

describe('two-way minimum steel', () => {
  it('S220: the proposal meets ρx + ρy ≥ 0.004 and ρ ≥ 0.0015 each way even where the moments ask for less', () => {
    const d: SlabDemand = { key: 'slab:2', name: 'L2', lx: 4, ly: 4.5, h: 0.14, m: { bottomX: { value: 1 }, bottomY: { value: 1 }, topX: { value: 0 }, topY: { value: 0 } } };
    const r = ts500Rules.slabRow(d, { mat: { fc: 25, fy: 220 }, cover: 0.02, diameters: [8, 10, 12] }, undefined, f);
    const area = (m: { dia: number; spacing: number }) => Math.PI * (m.dia / 20) ** 2 / m.spacing;
    expect(area(r.adopted.bottomX) + area(r.adopted.bottomY)).toBeGreaterThanOrEqual(0.004 * 0.14 * 1e4 - 1e-6);
    expect(area(r.adopted.bottomY)).toBeGreaterThanOrEqual(0.0015 * 0.14 * 1e4 - 1e-6);
    expect(r.verifications.every((v) => v.ok)).toBe(true);
    const short = ts500Rules.slabRow(d, { mat: { fc: 25, fy: 220 }, cover: 0.02, diameters: [8, 10, 12] }, { ...r.adopted, bottomX: { dia: 8, spacing: 0.2 }, bottomY: { dia: 8, spacing: 0.2 } }, f);
    expect(short.verifications.find((v) => v.label === 'rcSheets.ts500.v.slabSum')!.ok).toBe(false);
  });
});

describe('punching (8.3.1)', () => {
  const grid = { 1: [0, 0], 2: [3, 0], 3: [6, 0], 4: [0, 3], 5: [3, 3], 6: [6, 3], 7: [0, 6], 8: [3, 6], 9: [6, 6] } as const;
  const pt = (n: keyof typeof grid) => ({ x: grid[n][0], y: grid[n][1], z: 3 });
  const shell = (id: number, nodes: Array<keyof typeof grid>) => ({ elementId: id, nodeIds: nodes, points: nodes.map(pt) });
  const demand = (mx: number): PunchingDemand => ({
    key: 'punch:5', name: 'N5', thickness: 0.22,
    adjoining: [shell(1, [1, 2, 5, 4]), shell(2, [2, 3, 6, 5]), shell(3, [5, 6, 9, 8]), shell(4, [4, 5, 8, 7])],
    joint: { nodeId: 5, at: { x: 3, y: 3 }, columnElementId: 101, b: 0.4, h: 0.4, elementBelow: 101, elementAbove: 102,
      forces: [{ combinationId: 1, combinationName: 'U', axialBelow: 900, axialAbove: 600, directlyDelivered: 0, unbalancedMomentX: mx, unbalancedMomentY: 0 }] },
  });
  const ctx = { fc: 25, fy: 420, cover: 0.025, topBarDia: 12 };
  const d = 0.22 - 0.025 - 0.012;

  it('Vpr = γ·fctd·up·d with up at d/2: interior 40 × 40, d = 18.3 cm, no moment', () => {
    const r = ts500Rules.punchingRow(demand(0), ctx, f);
    const vpr = C25.fctd * 4 * (0.4 + d) * d * 1000;
    expect(vpr).toBeCloseTo(497.9, 1);
    expect(r.vu).toBeCloseTo(300, 6);
    expect(r.phiVc).toBeCloseTo(vpr, 3);
    expect(r.status).toBe('ok');
  });

  it('a transferred moment lowers γ through e = 0.4·M/Vpd', () => {
    const r = ts500Rules.punchingRow(demand(50), ctx, f);
    const g = punchingGamma(0, 0.4 * 50 / 300, 0.4 + d, 0.4 + d);
    expect(g).toBeCloseTo(1 / (1 + 1.5 * (0.4 * 50 / 300) / (0.4 + d)), 9);
    expect(r.phiVc).toBeCloseTo(g * C25.fctd * 4 * (0.4 + d) * d * 1000, 3);
  });
});

describe('beam row and line', () => {
  const L = 6;
  const stations = Array.from({ length: 33 }, (_, i) => { const x = (i / 32) * L; return { x, pos: 150 * (1 - (2 * x / L - 1) ** 2), neg: 0, v: 100 * Math.abs(1 - 2 * x / L) }; });
  const d: BeamDemand = {
    key: 'beam:1:0', name: 'K1', length: L, b: 0.3, h: 0.5,
    start: env(0, 0, 0), span: env(3, 150, 0), end: env(L, 0, 0),
    negAny: { value: 0 }, nNegAny: 0, vu: { value: 100 }, nAtV: 0, tu: { value: 0 },
    combos: [{ combo: 'U', mStart: 0, mSpan: 150, mEnd: 0, mPos: 150, mNeg: 0, nStart: 0, nSpan: 0, nEnd: 0, v: 100, nV: 0, t: 0 }],
    env: stations, line: { group: 1, index: 0, spans: 1, startNode: 1, endNode: 2, lineName: 'K' },
  };

  it('proposes bars that carry Md with ρ − ρ′ ≤ 0.85·ρb and stirrups at s ≤ d/2', () => {
    const r = ts500Rules.beamRow(d, beamCtx, undefined, f);
    expect(r.verifications.every((v) => v.ok)).toBe(true);
    expect(r.flexure.find((x) => x.section === 'span' && x.sign === 'pos')!.phiMn).toBeGreaterThanOrEqual(150);
    expect(r.req.sMax).toBeLessThanOrEqual(0.6);
    expect(r.req.torsionNeglected).toBe(true);
    const span = r.flexure.find((x) => x.section === 'span' && x.sign === 'pos')!;
    expect(span.epsT).toBeGreaterThan(span.epsTMin);
  });

  it('torsion past the cracking interaction gets Ao/s = Td/(2·Ak·fywd) and Asl', () => {
    const r = ts500Rules.beamRow({ ...d, tu: { value: 25 } }, beamCtx, undefined, f);
    const ak = (0.3 - 0.05 - 0.008) * (0.5 - 0.05 - 0.008);
    expect(r.req.torsionNeglected).toBe(false);
    expect(r.req.al).toBeCloseTo(25 * 2 * (0.242 + 0.442) / (2 * ak * C25.fyd * 1000) * 1e4, 3);
    expect(r.verifications.every((v) => v.ok)).toBe(true);
  });

  it('lays out the line with TS 500 anchorage and covers the envelope', () => {
    const row = ts500Rules.beamRow(d, beamCtx, undefined, f);
    const line = ts500Rules.beamLine([row], beamCtx, undefined, f);
    expect(line.utilization).toBeLessThanOrEqual(1 + 1e-6);
    const a16 = line.anchorage.find((x) => x.dia === 16);
    if (a16) expect(a16.ld).toBeCloseTo(lbOf(C25, 16), 6);
  });
});

describe('wall', () => {
  it('meets the minimum ratios and carries the base N–M', () => {
    const d: WallDemand = { key: 'wall:1', name: 'P1', length: 3, height: 3, thickness: 0.2, combos: [{ combo: 'U', pu: 1200, mu: 900, vu: 250, muV: 5, muH: 3 }] };
    const r = ts500Rules.wallRow(d, { mat: { fc: 25, fy: 420 }, cover: 0.025, barDia: 10, diameters: [10, 12, 16] }, undefined, f);
    expect(r.verifications.every((v) => v.ok)).toBe(true);
    expect(r.req.rhoL).toBeCloseTo(0.0025, 9);
  });
});

describe('strings', () => {
  it('every TS 500 key the rows use has its text in the six languages', () => {
    const dicts = { es, en, pt, de, fr, tr } as Record<string, Record<string, string>>;
    const used = new Set<string>();
    const L = 6;
    const stations = Array.from({ length: 21 }, (_, i) => { const x = (i / 20) * L; return { x, pos: 150 * (1 - (2 * x / L - 1) ** 2), neg: 0, v: 100 }; });
    const d: BeamDemand = { key: 'beam:1:0', name: 'K', length: L, b: 0.3, h: 0.7, start: env(0, 0, 0), span: env(3, 150, 0), end: env(L, 0, 0), negAny: { value: 0 }, nNegAny: 0, vu: { value: 100 }, nAtV: 0, tu: { value: 30 }, combos: [], env: stations, flange: { bf: 1, hf: 0.12 } };
    const rows = [ts500Rules.beamRow(d, { ...beamCtx, torsion: 'compatibility' }, undefined, f), ts500Rules.beamRow({ ...d, tu: { value: 2 } }, beamCtx, undefined, f)];
    const col = ts500Rules.columnRow({ key: 'c', name: 'C', b: 0.3, h: 0.3, length: 4, lu: 4, psiTop: 5, psiBot: 5, cases: [{ combo: 'U', pu: 900, mxTop: 40, mxBot: 40, myTop: 10, myBot: 10 }] }, { mat: { fc: 25, fy: 420 }, cover: 0.025, tieDia: 8, diameters: [14, 16, 20] }, undefined, f, { fromBelow: true });
    const wall = ts500Rules.wallRow({ key: 'w', name: 'W', length: 2, height: 3, thickness: 0.2, combos: [{ combo: 'U', pu: 500, mu: 200, vu: 100, muV: 1, muH: 1 }] }, { mat: { fc: 25, fy: 420 }, cover: 0.025, barDia: 10, diameters: [10, 12] }, undefined, f);
    const oneWay = ts500Rules.slabRow({ key: 's', name: 'S', lx: 2, ly: 6, h: 0.12, m: { bottomX: { value: 9 }, bottomY: { value: 0 }, topX: { value: 12 }, topY: { value: 0 } } }, { mat: { fc: 25, fy: 420 }, cover: 0.02, diameters: [8, 10] }, undefined, f);
    for (const r of [...rows, col, wall, oneWay]) {
      for (const v of r.verifications) used.add(v.label);
      for (const g of r.steps) for (const s of g.steps) used.add(s.label);
    }
    const own = [...used].filter((k) => k.startsWith('rcSheets.ts500.'));
    expect(own.length).toBeGreaterThan(10);
    for (const k of own) expect(Object.entries(dicts).filter(([, d]) => !d[k]).map(([l]) => l), k).toEqual([]);
  });
});

describe('registry', () => {
  it('TS 500:2000 resolves to its own rules, without the special moment frame provisions', () => {
    expect(rulesFor('ts500-2000')).toBe(ts500Rules);
    expect(rulesFor('ts500-2000').seismic).toBe(false);
  });
});
