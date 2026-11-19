/**
 * The reinforcement drawings' data: what each figure dimensions adds up to the member, the scales
 * map model millimetres to paper ones, every mark of an elevation is in its schedule, every
 * stirrup and tie drawn is one the schedule counts, and an elevation too long for its sheet is cut
 * at its axes.
 */
import { describe, it, expect } from 'vitest';
import type { DrawingInput } from '../../../sheets/compose';
import type { Primitive } from '../../../sheets/primitives';
import { formatGeometry } from '../../../sheets/formats';
import { columnTieLayout, tieSegments } from '../../column-ties';
import { lineSupports } from '../../line-geometry';
import { planDrawing } from '../../slab-plan';
import { wallDetail } from '../../wall-detail';
import { beamPlans, beamScheduleRows } from '../beam-elevation';
import { bands, clipToBand } from '../clip';
import { columnPlans, columnScheduleRows } from '../column-elevation';
import { scheduleMark } from '../schedule-table';
import { DEFAULT_PLAN_SCALES, fitFormats, planDrawings, planSheets } from '../sheets';
import { slabLevelPlans } from '../slab-level';
import { wallPlans } from '../wall-detail';
import { columnStack, ctx, fmt, level, tr, twoSpanLine, wall } from './fixtures';

type Dim = Extract<Primitive, { kind: 'dimension' }>;
const dims = (d: DrawingInput) => d.primitives.filter((p): p is Dim => p.kind === 'dimension');
const len = (d: Dim) => Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
const texts = (d: DrawingInput) => d.primitives.filter((p): p is Extract<Primitive, { kind: 'text' }> => p.kind === 'text').map((p) => p.text);
const onLayer = (d: DrawingInput, re: RegExp) => d.primitives.filter((p) => re.test(p.layer));
const close = (a: number, b: number) => Math.abs(a - b) < 0.5;
const beamOpts = (maxWidth = 1150) => ({ ...ctx(20), code: 'cirsoc201-2025' as const, maxWidth, group: 'V1' });

describe('beam elevation', () => {
  const { line, rows } = twoSpanLine();
  const drawings = beamPlans(line, rows, beamOpts());
  const elev = drawings.find((d) => d.key === `${line.key}:elev`)!;
  const axes = lineSupports(line).map((x) => x * 1000);

  it('dimensions the spans axis to axis, adding up to the line, and the line overall', () => {
    const chain = axes.slice(1).map((x, j) => dims(elev).find((d) => close(d.a.x, axes[j]!) && close(d.b.x, x) && d.offset < -25));
    expect(chain.every(Boolean)).toBe(true);
    expect(chain.reduce((s, d) => s + len(d!), 0)).toBeCloseTo(line.length * 1000, 6);
    expect(dims(elev).some((d) => close(d.a.x, axes[0]!) && close(d.b.x, axes[axes.length - 1]!) && close(len(d), line.length * 1000))).toBe(true);
    expect(chain.map((d) => d!.text)).toEqual(line.spans.map((s) => fmt((s.x1 - s.x0) * 100, 0)));
  });

  it('dimensions every stirrup zone over its length, and draws as many stirrups as the schedule counts', () => {
    const spanned = (z: { from: number; to: number }) => axes.slice(1).some((x, j) => Math.abs(axes[j]! - z.from * 1000) < 10 && Math.abs(x - z.to * 1000) < 10);
    for (const z of line.zones) expect(dims(elev).some((d) => close(d.a.x, z.from * 1000) && close(d.b.x, z.to * 1000) && d.text === fmt((z.to - z.from) * 100, 0)) || spanned(z)).toBe(true);
    const drawn = onLayer(elev, /^ST-ARM-EST-Ø/).filter((p) => p.kind === 'line').length;
    const counted = beamScheduleRows(line, 'cirsoc201-2025').filter((r) => r.kind === 'stirrup').reduce((s, r) => s + r.total, 0);
    expect(drawn).toBe(counted);
  });

  it('puts every bar on its face and diameter layer, with its hooks as long as its shape bends them', () => {
    for (const bar of line.bars) {
      const layer = `ST-ARM-${bar.kind === 'bent' ? 'LEV' : bar.face === 'top' ? 'SUP' : 'INF'}-Ø${bar.bars.dia}`;
      const polys = elev.primitives.filter((p) => p.kind === 'polyline' && p.layer === layer);
      expect(polys.length).toBeGreaterThan(0);
    }
    const cont = line.bars.find((b) => b.kind === 'continuous' && b.face === 'bottom')!;
    const poly = elev.primitives.find((p) => p.kind === 'polyline' && p.layer === `ST-ARM-INF-Ø${cont.bars.dia}`) as Extract<Primitive, { kind: 'polyline' }>;
    expect(poly.points[0]!.x).toBeCloseTo(cont.from * 1000, 6);
    expect(poly.points[poly.points.length - 1]!.x).toBeCloseTo(cont.to * 1000, 6);
    const leg = poly.points[0]!.y - poly.points[1]!.y;
    expect(leg).toBeCloseTo((cont.shape.pts[0]![1] - cont.shape.pts[1]![1]) * 1000, 6);
    expect(leg).toBeGreaterThan(0);
  });

  it('marks every bar on the elevation, and every one of those marks is in the schedule and its table', () => {
    const shown = new Set(texts(elev));
    for (const b of line.bars) expect(shown.has(b.mark)).toBe(true);
    const sched = beamScheduleRows(line, 'cirsoc201-2025');
    const inSchedule = new Set(sched.flatMap((r) => [r.mark, ...r.elevation]));
    for (const b of line.bars) expect(inSchedule.has(b.mark)).toBe(true);
    const table = drawings.find((d) => d.key === `${line.key}-bbs`)!;
    expect(table.paper).toBe(true);
    for (const r of sched) expect(texts(table)).toContain(scheduleMark(r));
  });

  it('draws each distinct section once, cut where the workspace cuts it, its concrete to size', () => {
    const secs = drawings.filter((d) => d.key.startsWith(`${line.key}:sec-`));
    expect(secs.length).toBeGreaterThan(0);
    const s1 = secs[0]!;
    const conc = s1.primitives.find((p) => p.layer === 'ST-HORM') as Extract<Primitive, { kind: 'polyline' }>;
    const xs = conc.points.map((p) => p.x), ys = conc.points.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(250, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(500, 6);
    expect(dims(s1).map((d) => d.text)).toEqual(['25', '50']);
    expect(texts(elev).filter((t) => t === '1').length).toBeGreaterThanOrEqual(2);
    expect(onLayer(s1, /^ST-ARM-(SUP|INF)-Ø/).filter((p) => p.kind === 'circle' && p.fill).length).toBeGreaterThan(3);
  });

  it('cuts an elevation too long for the sheet at its axes, never inside a span, the span dimensions still adding up', () => {
    const long = twoSpanLine(6, 5);
    const ds = beamPlans(long.line, long.rows, beamOpts(300))
      .filter((d) => d.key.includes(':elev') && !d.key.endsWith('-bars'));
    expect(ds.map((d) => d.key)).toEqual([`${long.line.key}:elev-1`, `${long.line.key}:elev-2`]);
    for (const d of ds) expect(d.width / 20).toBeLessThanOrEqual(300 + 30);
    const ax = lineSupports(long.line).map((x) => x * 1000);
    const chain = ds.flatMap((d) => dims(d).filter((q) => ax.some((x) => close(q.a.x, x)) && ax.some((x) => close(q.b.x, x)) && q.offset < -25 && len(q) < long.line.length * 1000 - 1));
    expect(chain.reduce((s, d) => s + len(d), 0)).toBeCloseTo(long.line.length * 1000, 6);
  });
});

describe('column elevation', () => {
  const [low, high] = columnStack();
  const o = { ...ctx(20), code: 'cirsoc201-2025' as const, endZones: false, group: 'C' };
  const ds = columnPlans(high!, [low!, high!], o);
  const elev = ds[0]!;
  const layout = columnTieLayout(high!, 'cirsoc201-2025');

  it('draws every tie the layout places and the schedule counts', () => {
    const ties = onLayer(elev, /^ST-ARM-EST-Ø/).filter((p) => p.kind === 'line');
    expect(ties.length).toBe(layout.ties.length);
    const hoops = columnScheduleRows(high!, [low!, high!], o).filter((r) => r.kind === 'hoop').reduce((s, r) => s + r.total, 0);
    expect(hoops).toBe(layout.ties.length);
  });

  it('dimensions the clear height and its tie zones, adding up to the storey above the joint below', () => {
    expect(dims(elev).some((d) => close(len(d), layout.clear * 1000) && d.text?.startsWith('lu = '))).toBe(true);
    const segs = tieSegments(layout);
    const zones = segs.map((z) => dims(elev).find((d) => close(d.a.y, z.to * 1000) && close(d.b.y, z.from * 1000))!);
    expect(zones.every(Boolean)).toBe(true);
    expect(zones.reduce((s, d) => s + len(d), 0)).toBeCloseTo((layout.clear + layout.jointTop) * 1000, 6);
    if (layout.lap) expect(dims(elev).some((d) => close(len(d), (layout.lap!.to - layout.lap!.from) * 1000))).toBe(true);
  });

  it('draws its section with every bar, on the longitudinal layers', () => {
    const bars = onLayer(ds[1]!, /^ST-ARM-LONG-Ø/).filter((p) => p.kind === 'circle');
    expect(bars.length).toBe(4 + 2 * high!.adopted.nx + 2 * high!.adopted.ny);
  });
});

describe('slab level plan', () => {
  const { plan } = level();
  const o = { ...ctx(50), code: 'cirsoc201-2025' as const, slabCover: 0.02, group: 'L' };
  const ds = slabLevelPlans(plan, o);

  it('draws one plan per face that has bars, one bar per package with its legs folded onto the plan', () => {
    const faces = ds.filter((d) => !d.paper);
    expect(faces.map((d) => d.key)).toEqual(['slabplan:N1:bottom', 'slabplan:N1:top'].filter((k) => plan.packages.some((p) => k.endsWith(p.layer))));
    const top = faces.find((d) => d.key.endsWith(':top'))!;
    const drawn = planDrawing(plan, { bottom: false, top: true, base: false }, fmt, 1);
    const polys = top.primitives.filter((p) => p.kind === 'polyline' && /^ST-ARM-SUP[XY]-Ø/.test(p.layer));
    expect(polys.length).toBe(drawn.length);
    expect((polys[0] as Extract<Primitive, { kind: 'polyline' }>).points.length).toBe(4);
  });

  it('dimensions the panels both ways, adding up to the level, and each top bar past the support faces', () => {
    const top = ds.find((d) => d.key.endsWith(':top'))!;
    const along = dims(top).filter((d) => close(d.a.y, d.b.y) && d.offset === -10);
    expect(along.reduce((s, d) => s + len(d), 0)).toBeCloseTo(9000, 6);
    const across = dims(top).filter((d) => close(d.a.x, d.b.x) && d.offset === 10);
    expect(across.reduce((s, d) => s + len(d), 0)).toBeCloseTo(5000, 6);
    const support = plan.packages.find((p) => p.layer === 'top' && p.kind === 'support')!;
    for (const r of support.reach) expect(dims(top).some((d) => close(len(d), r.length * 1000))).toBe(true);
  });

  it('marks every package, and the level schedule carries each mark', () => {
    const marks = new Set(ds.filter((d) => !d.paper).flatMap((d) => texts(d)).map((t) => t.split(' · ')[0]));
    const sched = ds.filter((d) => d.paper).flatMap(texts).flatMap((t) => t.split('='));
    for (const pk of plan.packages.filter((p) => !p.base)) {
      expect(marks.has(pk.mark)).toBe(true);
      expect(sched).toContain(pk.mark);
    }
  });
});

describe('wall detail', () => {
  const r = wall();
  const ds = wallPlans(r, [r], { ...ctx(20), code: 'cirsoc201-2025', group: 'M' });
  const d = wallDetail(r, 'cirsoc201-2025');

  it('draws every vertical bar in the section and dimensions length, height and thickness', () => {
    const bars = ds[1]!.primitives.filter((p) => p.kind === 'circle' && /^ST-ARM-(VERT|BORDE)-Ø/.test(p.layer));
    expect(bars.length).toBe(d.verticals.length);
    expect(dims(ds[0]!).map(len)).toEqual([4000, 3000]);
    expect(dims(ds[1]!).map(len)).toEqual([4000, 200]);
  });
});

describe('scales and sheets', () => {
  const { line, rows } = twoSpanLine();
  const pr = { line: [line], beam: rows, column: columnStack(), slab: level().rows, slabPlan: [level().plan], wall: [wall()] };
  const o = { format: 'A3' as const, scales: DEFAULT_PLAN_SCALES, code: 'cirsoc201-2025' as const, endZones: false, slabCover: 0.02, fmt, tr };

  it('draws elevations and sections at 1:20 and plans at 1:50 unless asked otherwise', () => {
    const { drawings } = planDrawings(pr, { families: ['beam', 'slab'], levels: null }, o);
    expect(drawings.filter((d) => !d.paper && d.key.startsWith('line') && !d.key.endsWith(':bars')).every((d) => d.scale === 20)).toBe(true);
    expect(drawings.filter((d) => !d.paper && d.key.startsWith('slabplan')).every((d) => d.scale === 50)).toBe(true);
    const other = planDrawings(pr, { families: ['beam'], levels: null }, { ...o, scales: { elevation: 25, plan: 100 } });
    expect(other.drawings.filter((d) => !d.paper && !d.key.endsWith(':bars')).every((d) => d.scale === 25)).toBe(true);
  });

  it('places model millimetres on paper at the scale: a 250 mm wide section is 12.5 mm on the sheet', () => {
    const { drawings, levels } = planDrawings(pr, { families: ['beam'], levels: null }, o);
    const sheets = planSheets(drawings, levels, 'A3', { name: 'Obra', author: '', licence: '', date: '2026-11-15' }, tr);
    const sheet = sheets.find((s) => s.placed?.some((p) => p.key.endsWith(':sec-1')))!;
    const placed = sheet.placed!.find((p) => p.key.endsWith(':sec-1'))!;
    const conc = sheet.primitives.slice(sheet.blockCount! + placed.from, sheet.blockCount! + placed.to).find((p) => p.layer === 'ST-HORM') as Extract<Primitive, { kind: 'polyline' }>;
    const xs = conc.points.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(250 / 20, 6);
    expect(placed.scale).toBe(20);
    expect(sheet.views!.find((v) => v.key === placed.key)!.scale).toBe(20);
  });

  it('fills the title block with the project, level, scale, sheet number, date and the author and licence fields', () => {
    const { drawings, levels } = planDrawings(pr, { families: ['column'], levels: ['N1'] }, o);
    const sheets = planSheets(drawings, levels, 'A3', { name: 'Edificio', author: 'B. P.', licence: '', date: '2026-11-15' }, tr);
    expect(sheets.map((s) => s.number)).toEqual(sheets.map((_, i) => `E-${String(i + 1).padStart(2, '0')}`));
    const t = sheets[0]!.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text);
    expect(t).toContain('Edificio');
    expect(t).toContain('E-01');
    expect(t.some((x) => x.startsWith('1:20'))).toBe(true);
    expect(t).toContain('rcSheets.plans.tb.level: N1');
    expect(t).toContain('rcSheets.plans.tb.date: 2026-11-15');
    expect(t).toContain('rcSheets.plans.tb.author: B. P. · rcSheets.plans.tb.licence:');
    expect(sheets[0]!.width).toBe(420);
  });

  it('picks by family and level, or one element alone', () => {
    const cols = planDrawings(pr, { families: ['column'], levels: ['N0'] }, o).drawings;
    expect(new Set(cols.map((d) => d.key.split(':').slice(0, 3).join(':').replace(/-bbs.*$/, '')))).toEqual(new Set(['column:1:0']));
    const one = planDrawings(pr, { families: [], levels: null, element: line.key }, o).drawings;
    expect(one.every((d) => d.key.startsWith(line.key))).toBe(true);
    expect(one.length).toBeGreaterThan(2);
    const slab = planDrawings(pr, { families: [], levels: null, element: level().rows[0]!.key }, o).drawings;
    expect(slab.some((d) => d.key === 'slabplan:N1:bottom')).toBe(true);
  });

  it('moves a drawing too large for the sheet at its scale to the next size that holds it', () => {
    const g = formatGeometry('A3').drawable;
    const big: DrawingInput = { key: 'x', title: 'x', primitives: [], width: (g.x1 - g.x0 + 50) * 50, height: 1000, origin: { x: 0, y: 0 }, scale: 50 };
    const r = fitFormats([big], 'A3');
    expect(r.drawings[0]!.format).toBe('A2');
    expect(r.moved).toEqual(['x']);
    expect(fitFormats([{ ...big, width: 1000 }], 'A3').drawings[0]!.format).toBeUndefined();
  });
});

describe('clipping to a band', () => {
  it('cuts lines and outlines, keeps texts where they stand and only whole dimensions', () => {
    const ps: Primitive[] = [
      { kind: 'line', layer: 'L', a: { x: -10, y: 0 }, b: { x: 10, y: 0 } },
      { kind: 'polyline', layer: 'L', closed: true, points: [{ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: -10, y: 5 }] },
      { kind: 'text', layer: 'T', at: { x: 20, y: 0 }, text: 'a', height: 2 },
      { kind: 'dimension', layer: 'D', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 },
      { kind: 'dimension', layer: 'D', a: { x: -4, y: 0 }, b: { x: 4, y: 0 }, offset: 1 },
    ];
    const out = clipToBand(ps, 0, 5);
    expect(out.map((p) => p.kind)).toEqual(['line', 'polyline', 'dimension']);
    expect((out[0] as { a: { x: number }; b: { x: number } }).a.x).toBe(0);
    expect((out[0] as { b: { x: number } }).b.x).toBe(5);
    const xs = (out[1] as { points: Array<{ x: number }> }).points.map((p) => p.x);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 5]);
  });

  it('bands break at the farthest axis within reach, else at the next one, never inside a span', () => {
    expect(bands(0, 10, 4, [3, 6, 9])).toEqual([[0, 3], [3, 6], [6, 10]]);
    expect(bands(0, 12, 4, [3, 6, 9])).toEqual([[0, 3], [3, 6], [6, 9], [9, 12]]);
    expect(bands(0, 10, 4, [])).toEqual([[0, 10]]);
    expect(bands(0, 12, 4, [7])).toEqual([[0, 7], [7, 12]]);
  });
});
