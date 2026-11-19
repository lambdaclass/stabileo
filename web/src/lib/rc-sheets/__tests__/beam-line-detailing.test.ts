/**
 * How a beam line's bars are bent, laid out and scheduled: hooks turned where they fit, bent bars
 * in the deepest span's frame and labelled on the face they run at, stirrups from the support
 * faces, laps of bars longer than a stock bar in their length and weight, and bent bars under the
 * seismic provisions.
 */
import { describe, it, expect } from 'vitest';
import { beamRow, type BeamDemand, type BeamEnd, type SectionEnv } from '../beam-row';
import { beamLine, CIRSOC_LINE, type LineAdopted } from '../beam-line';
import { makeFmt } from '../format';
import { developedLength, lapLength } from '../shape';
import { bentLegs, extraBarsText, hookBack, hookLegOf, hookTurn, marksAt, setOut, stirrupPositions } from '../line-geometry';
import { barPolyline } from '../plans/beam-elevation';
import { bendingSchedule } from '../schedule/schedule';
import { scheduleView, SCHEDULE_VIEWS } from '../schedule/views';
import { bvbsLegs, scheduleBvbs, shapeText } from '../schedule/exports';
import { TS500_LINE } from '../ts500/line';
import { rulesFor } from '../codes';
import { twoSpanLine } from '../plans/__tests__/fixtures';

const fmt = makeFmt('.');
const env = (x: number, pos: number, neg: number): SectionEnv => ({ x, pos: { value: pos, source: { combo: 'U', x } }, neg: { value: neg, source: { combo: 'U', x } }, nPos: 0, nNeg: 0 });
const bctx = { mat: { fc: 30, fy: 420 }, cover: 0.025, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };
const column: BeamEnd = { kind: 'column', half: 0.2 };

interface SpanSpec { L: number; h: number }

/** A continuous line on columns, hogging 80 kN·m over every support and sagging 140 kN·m mid-span. */
function rowsOf(spans: SpanSpec[], c: object, ends: [BeamEnd, BeamEnd] = [column, column], torsion?: (x: number, L: number) => number, hog = 80) {
  const n = spans.length;
  const mAt = (t: number) => (140 + hog) * 4 * t * (1 - t) - hog;
  return spans.map(({ L, h }, k) => {
    const stations = Array.from({ length: 33 }, (_, i) => { const x = (i / 32) * L, t = x / L, m = mAt(t); return { x, pos: Math.max(0, m), neg: Math.max(0, -m), v: 200 * Math.abs(1 - 2 * t) + 40, ...(torsion ? { t: torsion(x, L) } : {}) }; });
    const tu = torsion ? Math.max(...stations.map((e) => e.t ?? 0)) : 0;
    const d: BeamDemand = {
      key: `beam:1:${k}`, name: `V1-${k + 1}`, level: 'N1', length: L, b: 0.3, h,
      start: env(0, 0, -mAt(0)), span: env(L / 2, mAt(0.5), 0), end: env(L, 0, -mAt(1)),
      negAny: { value: 0 }, nNegAny: 0, vu: { value: 240 }, nAtV: 0, tu: { value: tu }, combos: [], env: stations,
      supportHalf: { start: k === 0 ? ends[0].half : 0.2, end: k === n - 1 ? ends[1].half : 0.2 },
      ends: { start: k === 0 ? ends[0] : column, end: k === n - 1 ? ends[1] : column },
      line: { group: 1, index: k, spans: n, startNode: k + 1, endNode: k + 2, lineName: 'V1' },
    };
    return beamRow(d, c as never, undefined, fmt);
  });
}

const lineOf = (spans: SpanSpec[], extra: object = {}, adopted?: LineAdopted, ends?: [BeamEnd, BeamEnd], hog = 80) => {
  const c = { ...bctx, ...extra };
  const rows = rowsOf(spans, c, ends, undefined, hog);
  return { line: beamLine(rows, c, adopted, fmt), rows };
};

const fixed: LineAdopted = { bottom: { count: 2, dia: 25 }, top: { count: 2, dia: 12 }, supportTop: [{ count: 0, dia: 16 }, { count: 2, dia: 16 }, { count: 0, dia: 16 }], spanBottom: [{ count: 0, dia: 16 }, { count: 0, dia: 16 }] };

describe('hooks of a beam line', () => {
  it('turns the bottom bars\' end hooks up into the end joints, toward their mid-depth as the top bars\' turn down, and draws them as long as they are cut', () => {
    const { line } = lineOf([{ L: 5, h: 0.4 }, { L: 5, h: 0.4 }], {}, fixed);
    const b = line.bars.find((x) => x.kind === 'continuous' && x.face === 'bottom')!;
    expect(hookTurn(b, 0)).toBeGreaterThan(0);
    expect(hookTurn(b, 1)).toBeGreaterThan(0);
    expect(hookTurn(b, 0)).toBeLessThanOrEqual(0.4 + 1e-9);
    const pts = barPolyline(line, b, 0);
    expect(Math.abs(pts[0]!.y - pts[1]!.y) / 1000).toBeCloseTo(hookLegOf(b), 6);
    expect((pts[0]!.y - pts[1]!.y) / 1000).toBeCloseTo(hookTurn(b, 0), 6);
    const top = line.bars.find((x) => x.kind === 'continuous' && x.face === 'top')!;
    expect(hookTurn(top, 0)).toBeLessThan(0);
    expect(line.verifications.find((v) => v.label === 'rcSheets.v.lineHookFit')).toBeUndefined();
  });

  it('turns a cantilever tip\'s hook through 180° where a 90° one does not fit the depth, rather than shorten its leg', () => {
    const free: BeamEnd = { kind: 'free', half: 0 };
    const { line } = lineOf([{ L: 5, h: 0.4 }, { L: 5, h: 0.4 }], {}, fixed, [column, free]);
    const b = line.bars.find((x) => x.kind === 'continuous' && x.face === 'bottom')!;
    expect(hookTurn(b, 0)).toBeGreaterThan(0);
    expect(b.hook180).toEqual([false, true]);
    const rise = (6 * 25 + 25) / 1000;
    expect(hookTurn(b, 1)).toBeCloseTo(rise, 9);
    expect(hookBack(b, 1)).toBeCloseTo(-(rise / 2 + 0.1), 9);
    expect(line.verifications.find((v) => v.label === 'rcSheets.v.lineHookFit')).toBeUndefined();
    expect(line.steps.flatMap((g) => g.steps).some((s) => s.label === 'rcSheets.s.lineHook180' && s.formula?.startsWith(`${b.mark} →`))).toBe(true);
    const pts = barPolyline(line, b, 0);
    const [p2, p1, p0] = [pts[pts.length - 3]!, pts[pts.length - 2]!, pts[pts.length - 1]!];
    expect((p1.y - p2.y) / 1000).toBeCloseTo(rise, 6);
    expect((p0.x - p1.x) / 1000).toBeCloseTo(hookBack(b, 1), 6);
  });

  it('fails the check, naming the depth that would hold the hook, when not even a 180° hook fits', () => {
    const free: BeamEnd = { kind: 'free', half: 0 };
    const { line } = lineOf([{ L: 3, h: 0.25 }, { L: 3, h: 0.25 }], {}, fixed, [column, free]);
    const b = line.bars.find((x) => x.kind === 'continuous' && x.face === 'bottom')!;
    expect(b.hook180).toBeUndefined();
    const fit = line.verifications.find((v) => v.label === 'rcSheets.v.lineHookFit')!;
    expect(fit.ok).toBe(false);
    expect(fit.demand).toBe(`${b.mark}: Ø25 18 cm`);
    expect(fit.capacity).toBe('17 cm · h ≥ 26 cm');
    expect(line.status).toBe('fail');
  });

  it('stops the bottom run straight at a simple support where a hook would not fit, §9.7.3.8.1 into it and §9.7.3.8.3(a) holding', () => {
    const support: BeamEnd = { kind: 'support', half: 0 };
    const rows = rowsOf([{ L: 5, h: 0.4 }], bctx, [support, support], undefined, 0);
    for (const e of rows[0]!.demand.env!) e.v = 75 * Math.abs(1 - 2 * e.x / 5);
    const line = beamLine(rows, bctx as never, { ...fixed, supportTop: [{ count: 0, dia: 16 }, { count: 0, dia: 16 }], spanBottom: [{ count: 0, dia: 16 }] }, fmt);
    const b = line.bars.find((x) => x.kind === 'continuous' && x.face === 'bottom')!;
    expect(b.hooks).toEqual([false, false]);
    expect(b.hook180).toBeUndefined();
    expect(b.from).toBeCloseTo(-0.15, 9);
    expect(b.to).toBeCloseTo(5.15, 9);
    expect(line.ends.from).toBeCloseTo(-0.15, 9);
    expect(line.verifications.find((v) => v.label === 'rcSheets.v.lineHookFit')).toBeUndefined();
    const st = line.steps.flatMap((g) => g.steps).filter((s) => s.label === 'rcSheets.s.lineStraightEnd');
    expect(st.map((s) => s.formula!.slice(0, 3))).toEqual([`${b.mark} ←`, `${b.mark} →`]);
    const top = line.bars.find((x) => x.kind === 'continuous' && x.face === 'top')!;
    expect(top.hooks).toEqual([true, true]);
  });

  it('proposes the run in a smaller bar whose 90° hook fits the depth where it may not stop straight, before any 180° hook', () => {
    const support: BeamEnd = { kind: 'support', half: 0 };
    const L = 5, m = 160, v = 260;
    const stations = Array.from({ length: 33 }, (_, i) => { const x = (i / 32) * L, t = x / L; return { x, pos: m * 4 * t * (1 - t), neg: 0, v: v * Math.abs(1 - 2 * t) }; });
    const d: BeamDemand = {
      key: 'beam:1:0', name: 'V1', level: 'N1', length: L, b: 0.25, h: 0.4, start: env(0, 0, 0), span: env(L / 2, m, 0), end: env(L, 0, 0),
      negAny: { value: 0 }, nNegAny: 0, vu: { value: v }, nAtV: 0, tu: { value: 0 }, combos: [], env: stations,
      supportHalf: { start: 0, end: 0 }, ends: { start: support, end: support }, line: { group: 1, index: 0, spans: 1, startNode: 1, endNode: 2, lineName: 'V1' },
    };
    const row = beamRow(d, bctx as never, undefined, fmt);
    expect(row.proposed.bottom[0]!.dia).toBe(25);
    const line = beamLine([row], bctx as never, undefined, fmt);
    const b = line.bars.find((x) => x.kind === 'continuous' && x.face === 'bottom')!;
    expect(b.bars).toEqual({ dia: 20, count: 4 });
    expect(b.hooks).toEqual([true, true]);
    expect(b.hook180).toBeUndefined();
    expect(line.verifications.filter((x) => !x.ok)).toEqual([]);
  });

  it('keeps the hook at a simple support where it fits, and turns through 180° a bar §9.7.3.8.3(a) does not let stop straight under a high end shear', () => {
    const support: BeamEnd = { kind: 'support', half: 0 };
    const own = { ...fixed, bottom: { count: 2, dia: 16 }, supportTop: [{ count: 0, dia: 16 }, { count: 0, dia: 16 }], spanBottom: [{ count: 3, dia: 16 }] };
    const { line } = lineOf([{ L: 5, h: 0.4 }], {}, own, [support, support], 0);
    expect(line.bars.find((x) => x.kind === 'continuous' && x.face === 'bottom')!.hooks).toEqual([true, true]);
    const tight = lineOf([{ L: 5, h: 0.4 }], {}, { ...own, bottom: { count: 2, dia: 25 } }, [support, support], 0).line;
    const b = tight.bars.find((x) => x.kind === 'continuous' && x.face === 'bottom')!;
    expect(b.hooks).toEqual([true, true]);
    expect(b.hook180).toEqual([true, true]);
    expect(tight.steps.flatMap((g) => g.steps).some((s) => s.label === 'rcSheets.s.lineStraightEnd')).toBe(false);
  });
});

describe('bent bars', () => {
  it('are marked on the top face where they run on top and on the bottom face in the span', () => {
    const { line } = lineOf([{ L: 6, h: 0.5 }, { L: 6, h: 0.5 }], { bentBars: true }, undefined, undefined, 160);
    const bent = line.bars.filter((b) => b.kind === 'bent');
    expect(bent.length).toBeGreaterThan(0);
    expect(marksAt(line, 'top', 6)).toContain(bent[0]!.mark);
    expect(marksAt(line, 'bottom', 6)).not.toContain(bent[0]!.mark);
    expect(marksAt(line, 'bottom', 3)).toContain(bent[0]!.mark);
  });

  it('are set out by their legs, and the table names them with the support and span bars they work beside', () => {
    const { line } = lineOf([{ L: 6, h: 0.5 }, { L: 6, h: 0.5 }], { bentBars: true }, undefined, undefined, 160);
    const bent = line.bars.find((b) => b.kind === 'bent')!;
    expect(setOut(line, bent)).toBeNull();
    const legs = bentLegs(bent);
    expect(legs.every((g) => g.length > 0)).toBe(true);
    expect(legs.length).toBe(bent.shape.pts.length - 1 - (bent.hooks[0] ? 1 : 0) - (bent.hooks[1] ? 1 : 0));
    const text = extraBarsText(line, 'lev.');
    expect(text.supports).toContain(`2: ${line.adopted.supportTop[1]!.count ? `${line.adopted.supportTop[1]!.count}Ø${line.adopted.supportTop[1]!.dia} + ` : ''}${bent.bars.count}Ø${bent.bars.dia} lev.`);
    expect(text.spans).toContain(`${bent.bars.count}Ø${bent.bars.dia} lev.`);
  });

  it('run in the deepest span\'s frame, the spans aligned at the top', () => {
    const { line } = lineOf([{ L: 6, h: 0.6 }, { L: 6, h: 0.45 }], { bentBars: true }, undefined, undefined, 160);
    const bent = line.bars.find((b) => b.kind === 'bent' && b.runs[1]!.from > 6)!;
    expect(bent).toBeDefined();
    const inner = bctx.cover + (line.adopted.stirrups?.[1]?.dia ?? bctx.stirrupDia) / 1000 + bent.bars.dia / 2000;
    const ys = bent.shape.pts.map((p) => p[1]);
    expect(Math.min(...ys.filter((_, i) => !(bent.hooks[0] && i === 0) && !(bent.hooks[1] && i === ys.length - 1)))).toBeCloseTo(0.6 - 0.45 + inner, 9);
    expect(Math.max(...ys)).toBeCloseTo(0.6 - inner, 9);
  });

  it('adopted ones under the seismic provisions fail a check instead of being laid out silently', () => {
    const { line: l0 } = lineOf([{ L: 6, h: 0.55 }, { L: 6, h: 0.55 }, { L: 6, h: 0.55 }], { bentBars: true }, undefined, undefined, 160);
    expect(l0.adopted.bent?.some((g) => g.count > 0)).toBe(true);
    const { line } = lineOf([{ L: 6, h: 0.55 }, { L: 6, h: 0.55 }, { L: 6, h: 0.55 }], { bentBars: true, seismic: { overstrength: 1.25 } }, l0.adopted, undefined, 160);
    const v = line.verifications.find((x) => x.label === 'rcSheets.v.lineSeismicBent')!;
    expect(v.ok).toBe(false);
    expect(v.clause).toBe('§18.6.3');
    expect(line.status).toBe('fail');
  });
});

describe('stirrups', () => {
  it('take the torsion stirrups only where the torsion cannot be neglected, the middle of the span at the shear spacing', () => {
    const torsion = (x: number, L: number) => (x <= 1 + 1e-9 || x >= L - 1 - 1e-9 ? 30 : 1);
    const c = { ...bctx };
    const rows = rowsOf([{ L: 8, h: 0.6 }], c, [column, column], torsion);
    expect(rows[0]!.req.torsionNeglected).toBe(false);
    const line = beamLine(rows, c, undefined, fmt);
    const z = line.zones;
    expect(z.length).toBe(3);
    expect(z[1]!.stirrups.spacing).toBeGreaterThan(z[0]!.stirrups.spacing);
    expect(z[0]!.to).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(z[2]!.from).toBeLessThanOrEqual(8 - 1 + 1e-9);
    const everywhere = beamLine(rowsOf([{ L: 8, h: 0.6 }], c, [column, column], () => 30), c, undefined, fmt);
    expect(everywhere.zones.length).toBe(1);
  });


  it('start at the support faces, none inside a column, as the schedule counts them', () => {
    const { line } = twoSpanLine();
    const axes = [0, 5, 9];
    const all = stirrupPositions(line);
    expect(all.filter((s) => axes.some((xs, j) => Math.abs(s.x - xs) < (line.supportWidths[j] ?? 0) / 2 - 1e-9))).toEqual([]);
    expect(all[0]!.x).toBeCloseTo(line.supportWidths[0]! / 2 + 0.05, 9);
    expect(line.zones[0]!.from).toBeCloseTo(line.supportWidths[0]! / 2, 9);
    expect(line.zones[line.zones.length - 1]!.to).toBeCloseTo(9 - line.supportWidths[2]! / 2, 9);
    const s = bendingSchedule({ line: [line], column: [], slab: [], wall: [] }, { code: 'cirsoc201-2025', slabCover: 0.02 });
    expect(s.rows.filter((r) => r.kind === 'stirrup').reduce((n, r) => n + r.total, 0)).toBe(all.length);
  });
});

describe('a line longer than a stock bar', () => {
  const { line } = lineOf([{ L: 6, h: 0.55 }, { L: 6, h: 0.55 }, { L: 6, h: 0.55 }]);
  const cont = line.bars.filter((b) => b.kind === 'continuous');

  it('laps its continuous bars into pieces no longer than 12 m, the laps in their length and weight', () => {
    for (const b of cont) {
      const at = line.splices.filter((sp) => sp.mark === b.mark);
      expect(at.length).toBeGreaterThan(0);
      expect(at.length).toBe(2 * b.shape.laps!.count);
      expect(b.shape.laps!.length).toBe(at[0]!.length);
      expect(at.reduce((n, sp) => n + sp.bars, 0)).toBe(b.bars.count * b.shape.laps!.count);
      const bare = developedLength({ ...b.shape, laps: undefined });
      expect(b.length).toBeCloseTo(bare + b.shape.laps!.count * at[0]!.length, 9);
      expect(b.weight).toBeCloseTo(b.bars.count * (Math.PI * (b.bars.dia / 1000) ** 2 / 4) * b.length * 7850, 6);
      const edges = [b.from - 1, ...at.map((sp) => sp.x), b.to + 1];
      for (let i = 1; i < edges.length; i++) expect(edges[i]! - edges[i - 1]!).toBeGreaterThan(0);
    }
    expect(line.verifications.find((v) => v.label === 'rcSheets.v.lineSplices')!.capacity).toContain(cont[0]!.mark);
  });

  it('schedules the lapped length and orders the stock bars it is cut from, the same in every view, the CSV text and BVBS', () => {
    const s = bendingSchedule({ line: [line], column: [], slab: [], wall: [] }, { code: 'cirsoc201-2025', slabCover: 0.02 });
    const row = s.rows.find((r) => r.elevation.concat(r.mark).includes(cont[0]!.mark) && r.kind === 'continuous')!;
    expect(row.unitLength).toBeCloseTo(cont[0]!.length, 9);
    expect(row.long).toBe(true);
    expect(shapeText(row.shape)).toContain(` + ${row.shape.laps!.count}×`);
    const legs = bvbsLegs(row.shape);
    expect(legs.reduce((a, x) => a + x.l, 0)).toBeGreaterThan(lapLength(row.shape) * 1000 + 12000);
    expect(scheduleBvbs(s, { project: 'P', index: '', grade: 'ADN 420' })).toContain(`@l${Math.round(row.unitLength * 1000)}@`);
    for (const v of SCHEDULE_VIEWS) expect(scheduleView(s, v).total.kg, v).toBeCloseTo(s.total.kg, 9);
    const d = s.byDiameter.find((x) => x.dia === row.dia)!;
    expect(d.stockBars).toBeGreaterThanOrEqual(row.total * Math.ceil(row.unitLength / 12));
  });
});

describe('TS 500 lines', () => {
  it('bend their bars on the mandrels the schedule cites', () => {
    const R = rulesFor('ts500-2000').bends;
    for (const dia of [12, 25, 28, 32]) {
      expect(TS500_LINE.mandrel!(dia)).toBeCloseTo(R.mandrel(dia, 'longitudinal'), 12);
      expect(TS500_LINE.hookExtension!(dia)).toBeCloseTo(R.extension(dia, 90, 'longitudinal'), 12);
    }
    expect(TS500_LINE.mandrel!(32)).toBeCloseTo(8 * 0.032, 12);
  });
});

describe('the course notes and CIRSOC 201-2025 on a line', () => {
  const simple: BeamEnd = { kind: 'support', half: 0.15 };

  it('sizes a light line\'s bottom run to min(As,min; 4/3·As) (§9.6.1.3) in at most four bars', () => {
    const { line, rows } = lineOf([{ L: 6, h: 0.75 }, { L: 6, h: 0.75 }, { L: 6, h: 0.75 }], {}, undefined, undefined, 10);
    const req = Math.max(...rows.map((r) => r.req.bottom));
    const asMin = CIRSOC_LINE.minBottom(bctx, 0.3, 0.75 - 0.025 - 0.008 - 0.01);
    expect(line.adopted.bottom.count).toBeLessThanOrEqual(4);
    expect(line.adopted.bottom.count * Math.PI * (line.adopted.bottom.dia / 20) ** 2).toBeGreaterThanOrEqual(Math.min(asMin, (4 / 3) * req) - 1e-9);
  });

  it('carries a third of the span steel and 0.75·Vu/fy into a simple support, a quarter into a column', () => {
    const { line, rows } = lineOf([{ L: 6, h: 0.5 }], {}, undefined, [simple, simple], 0);
    const area = line.adopted.bottom.count * Math.PI * (line.adopted.bottom.dia / 20) ** 2;
    const need = Math.max(rows[0]!.req.bottom / 3, (0.75 * rows[0]!.demand.env![0]!.v * 10) / 420);
    expect(area).toBeGreaterThanOrEqual(need - 1e-9);
    const v = line.verifications.find((x) => x.label === 'rcSheets.v.lineBottomRun')!;
    expect(v.ok).toBe(true);
    expect(v.demand).toContain(fmt(Math.max(need, rows[0]!.req.bottom / 4)));
    const framed = lineOf([{ L: 6, h: 0.5 }], {}, undefined, [column, column], 0);
    expect(framed.line.verifications.find((x) => x.label === 'rcSheets.v.lineBottomRun')!.demand).toContain(fmt(Math.max(framed.rows[0]!.req.bottom / 4, 0)));
  });

  it('hangs the top with bars no thinner than the stirrup or half the bottom bar, at least a sixth of the support steel, and checks a perimeter beam\'s integrity', () => {
    const { line, rows } = lineOf([{ L: 6, h: 0.5 }, { L: 6, h: 0.5 }], {}, undefined, undefined, 160);
    const negMax = Math.max(...rows.flatMap((r) => r.req.bySection.filter((x) => x.sign === 'neg').map((x) => x.req)));
    expect(line.adopted.top.dia).toBeGreaterThanOrEqual(Math.max(8, Math.ceil(line.adopted.bottom.dia / 2)));
    expect(line.adopted.top.count * Math.PI * (line.adopted.top.dia / 20) ** 2).toBeGreaterThanOrEqual(negMax / 6 - 1e-9);
    expect(line.verifications.find((x) => x.label === 'rcSheets.v.lineIntegrity')?.ok).toBe(true);
    const inner = rowsOf([{ L: 6, h: 0.5 }, { L: 6, h: 0.5 }], bctx, undefined, undefined, 160);
    inner.forEach((r) => { r.demand.perimeter = false; });
    expect(beamLine(inner, bctx, undefined, fmt).verifications.find((x) => x.label === 'rcSheets.v.lineIntegrity')).toBeUndefined();
  });

  it('staggers the laps of the continuous bars, class A where they may be (an inner beam, twice the steel needed), class B in a perimeter beam', () => {
    const spans = [{ L: 6, h: 0.55 }, { L: 6, h: 0.55 }, { L: 6, h: 0.55 }];
    const edge = lineOf(spans).line;
    const rows = rowsOf(spans, bctx);
    rows.forEach((r) => { r.demand.perimeter = false; });
    const inner = beamLine(rows, bctx, undefined, fmt);
    const of = (l: typeof edge) => l.splices.filter((sp) => sp.face === 'bottom' && l.bars.find((b) => b.mark === sp.mark)!.kind === 'continuous');
    expect(of(edge).every((sp) => sp.spliceClass === 'B')).toBe(true);
    expect(of(inner).every((sp) => sp.spliceClass === 'A')).toBe(true);
    expect(of(inner)[0]!.length).toBeLessThan(of(edge)[0]!.length);
    const [p, q] = of(edge);
    expect(q!.x - p!.x).toBeGreaterThanOrEqual(p!.length - 1e-9);
    expect(p!.bars + q!.bars).toBe(edge.adopted.bottom.count);
  });

  it('keeps the positive bars\' ld within Mn/Vu + ℓa at the points of inflection (§9.7.3.8.3(b)), the proposal by a thinner bar', () => {
    const { line } = lineOf([{ L: 6, h: 0.5 }, { L: 6, h: 0.5 }], {}, undefined, undefined, 160);
    const v = line.verifications.find((x) => x.label === 'rcSheets.v.lineInflectionLd')!;
    expect(v).toBeDefined();
    expect(v.ok).toBe(true);
    const thick = lineOf([{ L: 6, h: 0.5 }, { L: 6, h: 0.5 }], { mat: { fc: 20, fy: 500 } }, { ...line.adopted, bottom: { count: 2, dia: 25 } }, undefined, 160).line;
    const t = thick.verifications.find((x) => x.label === 'rcSheets.v.lineInflectionLd')!;
    expect(t.ratio!).toBeGreaterThan(v.ratio!);
    expect(t.ok).toBe(t.ratio! <= 1 + 1e-6);
  });

  it('carries a third of the support bars past the point of inflection by ln/16 of the clear span', () => {
    const L = 12, half = 0.6;
    const mAt = (t: number) => 300 * 4 * t * (1 - t) - 150;
    const rows = [0, 1].map((k) => {
      const stations = Array.from({ length: 49 }, (_, i) => { const x = (i / 48) * L, t = x / L, m = mAt(t); return { x, pos: Math.max(0, m), neg: Math.max(0, -m), v: 200 * Math.abs(1 - 2 * t) + 40 }; });
      const d: BeamDemand = {
        key: `beam:1:${k}`, name: `V1-${k + 1}`, level: 'N1', length: L, b: 0.3, h: 0.5, start: env(0, 0, 150), span: env(6, 150, 0), end: env(L, 0, 150),
        negAny: { value: 0 }, nNegAny: 0, vu: { value: 240 }, nAtV: 0, tu: { value: 0 }, combos: [], env: stations,
        supportHalf: { start: half, end: half }, ends: { start: { kind: 'column', half }, end: { kind: 'column', half } }, line: { group: 1, index: k, spans: 2, startNode: k + 1, endNode: k + 2, lineName: 'V1' },
      };
      return beamRow(d, bctx, undefined, fmt);
    });
    const line = beamLine(rows, bctx, undefined, fmt);
    const bar = line.bars.find((b) => b.kind === 'support' && b.from < L && b.to > L)!;
    const pi = rows[1]!.demand.env!.find((e) => e.neg <= 1e-6)!.x, d = 0.5 - 0.025 - 0.008 - 0.01;
    expect(bar.to - L).toBeCloseTo(Math.ceil((pi + Math.max(d, (L - 2 * half) / 16)) / 0.05 - 1e-9) * 0.05, 9);
    expect(bar.to - L).toBeLessThan(pi + L / 16);
  });
});

describe('the anchorage of the course and CIRSOC 201-2025 on a line', () => {
  it('bends the bent-up bars on 9·db under CIRSOC 201-2025, the hook mandrel under ACI 318-19', () => {
    const c = { ...bctx, bentBars: true };
    const rows = rowsOf([{ L: 6, h: 0.5 }, { L: 6, h: 0.5 }], c, undefined, undefined, 160);
    const cirsoc = rulesFor('cirsoc201-2025').beamLine(rows, c, undefined, fmt).bars.find((b) => b.kind === 'bent')!;
    expect(cirsoc.shape.mandrel).toBeCloseTo(9 * cirsoc.bars.dia / 1000, 12);
    const aci = rulesFor('aci318-19').beamLine(rows, c, undefined, fmt).bars.find((b) => b.kind === 'bent')!;
    expect(aci.shape.mandrel).toBeCloseTo(rulesFor('aci318-19').bends.mandrel(aci.bars.dia, 'longitudinal'), 12);
  });

  it('develops a bar by the general expression of §25.4.2.4 with the cover and spacing of its layer', async () => {
    const { deriveDevelopment, confinementOf } = await import('../../codes/cirsoc201/anchorage');
    const c = bctx, clear = c.cover + c.stirrupDia / 1000;
    const spacing = (0.3 - 2 * clear - 0.016) / 3;
    const want = deriveDevelopment({ diameterMm: 16, fy: 420, fc: 30, favourableSpacing: false, psiT: 1, edition: '2025', confinement: confinementOf(16, clear * 1000, spacing * 1000) }).ldM;
    expect(CIRSOC_LINE.development(c, 16, false, 0.5, { count: 4, width: 0.3 })).toBeCloseTo(want, 12);
    expect(CIRSOC_LINE.development(c, 16, false, 0.5, { count: 4, width: 0.3 })).not.toBeCloseTo(CIRSOC_LINE.development(c, 16, false, 0.5), 6);
  });
});

