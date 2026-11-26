/**
 * The Stabileo criteria: read and bounded as stored, at their defaults the very numbers the sheets
 * took before, and each family's rows following them when one changes; their citation translated,
 * and no locale naming the course they come from.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CRITERIA, CRITERION, CRITERION_IDS, DEFAULT_CRITERIA, criteriaOf, localizeCriterion, readCriteria, type CriterionId } from '../criteria';
import { rulesFor } from '../codes';
import { makeFmt } from '../format';
import { compressionMargin, type BeamDemand, type SectionEnv } from '../beam-row';
import { columnRow, type ColumnCase, type ColumnDemand } from '../column-row';
import { slabPlan, type LevelGeometry, type PlanBeam } from '../slab-plan';
import { tieLimits } from '../footing-row';
import { meshArea } from '../bars';
import { migrateDesignOptions } from '../design-options';
import type { SlabDemand } from '../slab-row';
import type { FootingContext, FootingDemand } from '../footing-types';
import type { CheckLine, ColumnAdopted } from '../types';

const fmt = makeFmt('.');
const cirsoc = rulesFor('cirsoc201-2025'), aci = rulesFor('aci318-19');
const withCrit = (stated: Partial<Record<CriterionId, number>>) => criteriaOf(stated);
const label = (r: { verifications: CheckLine[] }, l: string) => r.verifications.find((v) => v.label === l);

describe('the criteria as stored', () => {
  it('reproduce at their defaults the numbers the sheets took before', () => {
    const c = DEFAULT_CRITERIA;
    expect([c.beamStirrupSpacing, c.beamFourLegsWidth, c.beamStirrupDiameters, c.beamHangerShare, compressionMargin({}), c.beamMinDepth, c.beamWidthFrom, c.beamWidthTo, c.beamSectionStep])
      .toEqual([0.3, 0.4, 2, 0.5, 1.3, 0.12, 5, 3, 0.05]);
    expect(c.beamKneeHaunch).toBeCloseTo(0.007, 15);
    expect([c.columnSwayKMin, c.columnBarPitch, c.columnCornerOnlyFace, c.columnRowClear]).toEqual([1.2, 0.3, 0.4, 4 / 3]);
    expect([c.slabOneWaySpacing, c.slabDistributionShare, c.slabJoinThickness, 1 / c.slabBendOneWay, 1 / c.slabBendTwoWay, c.slabMinThickness]).toEqual([0.25, 0.2, 0.02, 1 / 7, 1 / 8, 0.08]);
    const t = tieLimits(c);
    expect([t.maxNs, t.minH, t.maxE, t.slide, t.stretch, t.mu]).toEqual([1200, 1.5, 0.25, 1.5, 1 / 1000, Math.tan((2 / 3) * (30 * Math.PI) / 180)]);
    expect([c.footingTieMinBars, c.footingTieMinWidth, c.footingTieMinDepth, c.footingTieDepthRatio]).toEqual([2, 0.15, 0.3, 10]);
  });

  it('keep only numbers within their range, integers where they count, and drop those at their default', () => {
    expect(readCriteria({ beamStirrupSpacing: 25, slabOneWaySpacing: 99, columnSwayKMin: '1.5', beamStirrupDiameters: 2.5, footingTieMinBars: 4, bogus: 3 })).toEqual({ beamStirrupSpacing: 25, footingTieMinBars: 4 });
    expect(readCriteria({ beamStirrupSpacing: 30, columnSwayKMin: 1.2 })).toBeUndefined();
    expect(readCriteria(null)).toBeUndefined();
    expect(criteriaOf({ beamStirrupSpacing: 25 }).beamStirrupSpacing).toBe(0.25);
    expect(criteriaOf({ beamStirrupSpacing: 500 }).beamStirrupSpacing).toBe(0.3);
    for (const id of CRITERION_IDS) {
      const s = CRITERIA[id];
      expect(s.value >= s.min && s.value <= s.max, id).toBe(true);
    }
  });

  it('travel with the design options and survive a JSON round trip', () => {
    const o = migrateDesignOptions(JSON.parse(JSON.stringify({ torsion: 'compatibility', criteria: { columnBarPitch: 25, footingTieMaxLoad: 900, slabJoinThickness: 2 } })), undefined);
    expect(o).toEqual({ torsion: 'compatibility', criteria: { columnBarPitch: 25, footingTieMaxLoad: 900 } });
  });

  it('are cited by a token the views translate', () => {
    const tr = (k: string) => (k === 'rcSheets.criterion' ? 'Criterio Stabileo' : k);
    expect(localizeCriterion(`§25.4.2; ${CRITERION}`, tr)).toBe('§25.4.2; Criterio Stabileo');
    expect(localizeCriterion(undefined, tr)).toBe('');
  });
});

describe('the locales', () => {
  const LANGS = ['es', 'en', 'pt', 'de', 'fr', 'tr', 'hu'];
  const keys = (lang: string) => new Map([...readFileSync(new URL(`../../i18n/locales/${lang}.ts`, import.meta.url), 'utf8').matchAll(/^\s*["']([^"']+)["']:\s*(["'])((?:\\.|(?!\2).)*)\2,?$/gm)].map((m) => [m[1]!, m[3]!]));

  it('name no course in what the sheets and the design data show, and name every criterion with a hint', () => {
    for (const lang of LANGS) {
      const k = keys(lang);
      const shown = [...k].filter(([key]) => key.startsWith('rcSheets.') || key.startsWith('designData.'));
      expect(shown.length, lang).toBeGreaterThan(1000);
      expect(shown.filter(([, v]) => /FIUBA|cátedra|course rule|course criterion|Lehrstuhl|ders ölçütü|tanszéki/i.test(v)).map(([key]) => key), lang).toEqual([]);
      expect(k.get('rcSheets.criterion'), lang).toBeTruthy();
      for (const id of CRITERION_IDS) {
        expect(k.get(`designData.crit.${id}`), `${lang} ${id}`).toBeTruthy();
        expect(k.get(`designData.crit.${id}.hint`), `${lang} ${id}`).toBeTruthy();
      }
    }
  });
});

const sec = (x: number, pos: number, neg: number): SectionEnv => ({ x, pos: { value: pos, source: { combo: 'U', x } }, neg: { value: neg, source: { combo: 'U', x } }, nPos: 0, nNeg: 0 });
const beam = (o: { b: number; h: number; mu: number; vu: number; L?: number }): BeamDemand => ({
  key: 'beam:9:0', name: 'V9', length: o.L ?? 5, b: o.b, h: o.h,
  start: sec(0, 0, 0), span: sec((o.L ?? 5) / 2, o.mu, 0), end: sec(o.L ?? 5, 0, 0),
  negAny: { value: 0 }, nNegAny: 0, vu: { value: o.vu }, nAtV: 0, tu: { value: 0 }, combos: [],
});
const bctx = { mat: { fc: 25, fy: 420 }, cover: 0.025, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };

describe('beams follow their criteria', () => {
  it('stated at their defaults, propose what no criteria do', () => {
    const d = beam({ b: 0.3, h: 0.9, mu: 150, vu: 260, L: 7 });
    expect(cirsoc.beamRow(d, { ...bctx, criteria: withCrit({ beamStirrupSpacing: 30 }) }, undefined, fmt)).toEqual(cirsoc.beamRow(d, bctx, undefined, fmt));
  });

  it('the stirrup spacing where shear needs them, CIRSOC only', () => {
    const d = beam({ b: 0.3, h: 0.9, mu: 150, vu: 260, L: 7 });
    const plain = cirsoc.beamRow(d, bctx, undefined, fmt);
    const tight = cirsoc.beamRow(d, { ...bctx, criteria: withCrit({ beamStirrupSpacing: 20 }) }, undefined, fmt);
    expect(plain.adopted.stirrups.spacing).toBeGreaterThan(0.2 + 1e-9);
    expect(tight.adopted.stirrups.spacing).toBeLessThanOrEqual(0.2 + 1e-9);
    expect(label(tight, 'rcSheets.v.stirrupSpacing')!.capacity).toBe('≤ 20.0 cm');
    expect(label(tight, 'rcSheets.v.stirrupSpacing')!.ok).toBe(true);
    expect(aci.beamRow(d, { ...bctx, criteria: withCrit({ beamStirrupSpacing: 20 }) }, undefined, fmt)).toEqual(aci.beamRow(d, bctx, undefined, fmt));
  });

  it('the web that takes four legs, and the margin on compression steel', () => {
    const wide = beam({ b: 0.5, h: 0.5, mu: 120, vu: 150 });
    expect(label(cirsoc.beamRow(wide, bctx, undefined, fmt), 'rcSheets.v.wideLegs')).toBeDefined();
    expect(label(cirsoc.beamRow(wide, { ...bctx, criteria: withCrit({ beamFourLegsWidth: 60 }) }, undefined, fmt), 'rcSheets.v.wideLegs')).toBeUndefined();
    const doubly = beam({ b: 0.2, h: 0.3, mu: 90, vu: 60, L: 4.5 });
    const c30 = { ...bctx, cover: 0.03 };
    const base = cirsoc.beamRow(doubly, c30, undefined, fmt).req.compression!.top;
    const none = cirsoc.beamRow(doubly, { ...c30, criteria: withCrit({ beamCompressionMargin: 0 }) }, undefined, fmt).req.compression!.top;
    expect(base).toBeCloseTo(1.3 * none, 9);
  });
});

const wind: ColumnCase = { combo: 'W', pu: 900, puD: 500, mxTop: 60, mxBot: -70, myTop: 5, myBot: -5, vx: 40, vy: 4, sway: { mxTop: 50, mxBot: -60, myTop: 0, myBot: 0 } };
const column = (o: Partial<ColumnDemand> = {}): ColumnDemand => ({ key: 'column:1:0', name: 'C1', b: 0.35, h: 0.35, length: 4.2, lu: 3.8, psiTop: 2, psiBot: 2, cases: [wind], ...o });
const cctx = { mat: { fc: 25, fy: 420 }, cover: 0.03, tieDia: 8, diameters: [16, 20, 25] };

describe('columns follow their criteria', () => {
  it('the widest spacing along a face, checked and proposed', () => {
    const d = column({ b: 0.4, h: 0.7 });
    const bars: ColumnAdopted = { corner: 20, nx: 0, dx: 20, ny: 2, dy: 20, tieDia: 8, tieSpacing: 0.15 };
    expect(label(columnRow(d, cctx, bars, fmt), 'rcSheets.v.colMaxPitch')!.ok).toBe(true);
    const tight = { ...cctx, criteria: withCrit({ columnBarPitch: 18 }) };
    const r = columnRow(d, tight, bars, fmt);
    expect(label(r, 'rcSheets.v.colMaxPitch')!.ok).toBe(false);
    expect(label(r, 'rcSheets.v.colMaxPitch')!.capacity).toBe('≤ 18 cm');
    const p = columnRow(d, tight, undefined, fmt);
    expect(label(p, 'rcSheets.v.colMaxPitch')!.ok).toBe(true);
    expect(p.proposed.ny).toBeGreaterThan(columnRow(d, cctx, undefined, fmt).proposed.ny);
  });

  it('the face that keeps its corner bars alone', () => {
    const d = column({ b: 0.45, h: 0.45 });
    const corners: ColumnAdopted = { corner: 25, nx: 0, dx: 25, ny: 0, dy: 25, tieDia: 8, tieSpacing: 0.15 };
    expect(label(columnRow(d, cctx, corners, fmt), 'rcSheets.v.colMaxPitch')!.ok).toBe(false);
    expect(label(columnRow(d, { ...cctx, criteria: withCrit({ columnCornerOnlyFace: 50 }) }, corners, fmt), 'rcSheets.v.colMaxPitch')!.ok).toBe(true);
  });

  it('the least sway k, in CIRSOC', () => {
    const stiff = column({ psiTop: 0.2, psiBot: 0.2, sway: { Q: 0.2, combo: 'W', byCombo: { W: { Q: 0.2, sumPu: 3000, sumPc: 30000 } } } });
    const bars: ColumnAdopted = { corner: 20, nx: 1, dx: 20, ny: 1, dy: 20, tieDia: 8, tieSpacing: 0.15 };
    const r = columnRow(stiff, { ...cctx, criteria: withCrit({ columnSwayKMin: 1.5 }) }, bars, fmt);
    expect(label(r, 'rcSheets.v.slenderMax')!.demand).toContain(fmt((1.5 * 3.8) / (0.3 * 0.35), 1));
    expect(r.steps.flatMap((g) => g.steps).find((s) => s.label === 'rcSheets.s.storeySway')!.formula).toContain(`≥ 1.50 (${CRITERION})`);
  });
});

const slab = (key: string, x0: number, x1: number, m: [number, number, number, number], h = 0.15): SlabDemand => ({
  key, name: key, level: 'N1', lx: x1 - x0, ly: 4, h, bounds: { x0, x1, y0: 0, y1: 4, z: 3 },
  m: { bottomX: { value: m[0] }, bottomY: { value: m[1] }, topX: { value: m[2] }, topY: { value: m[3] } },
});
const sctx = { mat: { fc: 25, fy: 420 }, cover: 0.02, diameters: [6, 8, 10, 12, 16] };
const pbeam = (x1: number, y1: number, x2: number, y2: number): PlanBeam => ({ x1, y1, x2, y2, b: 0.2, kind: 'beam' });
const geom = (xs: number[]): LevelGeometry => ({ level: 'N1', beams: [...xs.map((x) => pbeam(x, 0, x, 4)), pbeam(xs[0]!, 0, xs[xs.length - 1]!, 0), pbeam(xs[0]!, 4, xs[xs.length - 1]!, 4)], columns: [] });

describe('slabs follow their criteria', () => {
  it('a one-way panel\'s spacing and its distribution share, CIRSOC only', () => {
    const d: SlabDemand = { key: 'slab:1', name: 'L1', lx: 2, ly: 6, h: 0.14, m: { bottomX: { value: 4 }, bottomY: { value: 1 }, topX: { value: 0 }, topY: { value: 0 } } };
    const c = { mat: { fc: 25, fy: 420 }, cover: 0.02, diameters: [8, 10, 12] };
    expect(cirsoc.slabRow(d, c, undefined, fmt).faces.bottomX.sMax).toBeCloseTo(0.25, 9);
    const r = cirsoc.slabRow(d, { ...c, criteria: withCrit({ slabOneWaySpacing: 18, slabDistributionShare: 40 }) }, undefined, fmt);
    expect(r.faces.bottomX.sMax).toBeCloseTo(0.18, 9);
    expect(r.proposed.bottomX.spacing).toBeLessThanOrEqual(0.18 + 1e-9);
    expect(r.faces.bottomY.asDistribution).toBeCloseTo(0.4 * meshArea(r.adopted.bottomX), 9);
    expect(aci.slabRow(d, { ...c, criteria: withCrit({ slabOneWaySpacing: 18 }) }, undefined, fmt).faces.bottomX.sMax).toBeCloseTo(0.3, 9);
  });

  it('the thickness difference over which bottom bars run on, and the bend points', () => {
    const m = { dia: 8, spacing: 0.125 }, same = { bottomX: m, bottomY: m, topX: m, topY: m };
    const rows = [cirsoc.slabRow(slab('A', 0, 4, [3, 3, 6, 6]), sctx, same, fmt), cirsoc.slabRow(slab('B', 4, 8, [3, 3, 6, 6], 0.18), sctx, same, fmt)];
    const bottomX = (p: ReturnType<typeof slabPlan>) => p.packages.filter((pk) => pk.layer === 'bottom' && pk.dir === 'x');
    expect(bottomX(slabPlan('N1', rows, geom([0, 4, 8]), { ...sctx, bent: false }, cirsoc.slabPlan))).toHaveLength(2);
    expect(bottomX(slabPlan('N1', rows, geom([0, 4, 8]), { ...sctx, bent: false, criteria: withCrit({ slabJoinThickness: 3 }) }, cirsoc.slabPlan))).toHaveLength(1);
    const one = [cirsoc.slabRow(slab('A', 0, 5, [12, 9, 0, 0]), sctx, undefined, fmt)];
    const p = slabPlan('N1', one, geom([0, 5]), { ...sctx, bent: true, criteria: withCrit({ slabBendTwoWay: 6 }) }, cirsoc.slabPlan);
    expect(p.rules.bendAt.twoWay).toBeCloseTo(1 / 6, 12);
    expect(slabPlan('N1', one, geom([0, 5]), { ...sctx, bent: true, criteria: withCrit({ slabBendTwoWay: 6 }) }, aci.slabPlan).rules.bendAt.twoWay).toBe(0.2);
  });
});

describe('footings with a tie follow their criteria', () => {
  const fctx: FootingContext = { fc: 25, fy: 420, cover: 0.05, sizing: 'full', diameters: [10, 12, 16, 20, 25], preferred: { x: 12, y: 12 }, columnBars: { count: 4, dia: 16, tension: false } };
  const demand = (over: Partial<FootingDemand> = {}): FootingDemand => ({
    key: 'footing:n1', name: 'C1', nodeId: 1, at: { x: 0, y: 0, z: 0 }, column: { b: 0.3, h: 0.3, storey: 3 },
    service: { combo: 'D + L', N: 1300, Mx: 0, My: 0, Vx: 0, Vy: 0 }, lateralLeftOut: 0,
    combos: [{ combo: 'U', N: 1800, Mx: 0, My: 0, Vx: 0, Vy: 0 }],
    soil: { name: '', allowable: 150, presumed: true },
    edge: { anchor: [-1, 0], source: 'row', balance: 'tie', partners: [{ axis: 'x', key: 'footing:n2', nodeId: 2, name: 'C2', L: 5, column: { b: 0.3, h: 0.3 } }] },
    ...over,
  });
  const ok = (r: { verifications: Array<{ label: string; ok: boolean }> }, l: string) => r.verifications.find((v) => v.label === l)!.ok;

  it('the load, the friction, the section and the bars', () => {
    const r = cirsoc.footingRow(demand(), fctx, undefined, fmt);
    expect(ok(r, 'rcSheets.v.footTieLoad')).toBe(false);
    const c = withCrit({ footingTieMaxLoad: 1500, footingTieFriction: 36, footingTieMinDepth: 60, footingTieMinBars: 6 });
    const s = cirsoc.footingRow(demand(), { ...fctx, criteria: c }, undefined, fmt);
    expect(ok(s, 'rcSheets.v.footTieLoad')).toBe(true);
    const t = s.edge!.ties[0]!;
    expect(t.mu).toBeCloseTo(Math.tan(24 * Math.PI / 180), 12);
    expect(t.h).toBeCloseTo(0.6, 9);
    expect(t.count).toBeGreaterThanOrEqual(6);
    expect(label(s, 'rcSheets.v.footTieLoad')!.clause).toBe(CRITERION);
  });

  it('the stretch and the offset', () => {
    const r = cirsoc.footingRow(demand({ service: { combo: 'D + L', N: 600, Mx: 0, My: 0, Vx: 0, Vy: 0 }, combos: [{ combo: 'U', N: 840, Mx: 0, My: 0, Vx: 0, Vy: 0 }] }), { ...fctx, criteria: withCrit({ footingTieStretch: 4000, footingTieOffset: 10 }) }, undefined, fmt);
    const t = r.edge!.ties[0]!;
    expect(t.stretch!).toBeLessThanOrEqual(t.H / 4000 + 1e-12);
    expect(label(r, 'rcSheets.v.footTieOffset')!.capacity).toContain('H/10');
    expect(label(r, 'rcSheets.v.footTieStretch')!.capacity).toContain('H/4000');
  });
});
