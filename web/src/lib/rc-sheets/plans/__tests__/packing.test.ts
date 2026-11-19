/** The reinforcement drawings polished for the sheet: marks apart, every leg dimensioned in one unit, stirrups on one layer by diameter, and the figures packed onto few sheets. */
import { describe, it, expect } from 'vitest';
import type { DrawingInput } from '../../../sheets/compose';
import { composeSheets, fitsDense } from '../../../sheets/compose';
import { formatGeometry } from '../../../sheets/formats';
import type { P, Primitive } from '../../../sheets/primitives';
import { beamPlans } from '../beam-elevation';
import { DEFAULT_PLAN_SCALES, planDrawings, planSheets } from '../sheets';
import { columnStack, ctx, fmt, tr, twoSpanLine } from './fixtures';

type Dim = Extract<Primitive, { kind: 'dimension' }>;
const dims = (d: DrawingInput) => d.primitives.filter((p): p is Dim => p.kind === 'dimension');
const circles = (d: DrawingInput) => d.primitives.filter((p): p is Extract<Primitive, { kind: 'circle' }> => p.kind === 'circle');
const beamOpts = (maxWidth = 380) => ({ ...ctx(20), code: 'cirsoc201-2025' as const, maxWidth, group: 'V1' });
const project = { name: 'Obra', author: '', licence: '', date: '2026-11-16' };
const o = { format: 'A3' as const, scales: DEFAULT_PLAN_SCALES, code: 'cirsoc201-2025' as const, endZones: false, slabCover: 0.02, fmt, tr };

describe('a beam\'s drawings', () => {
  const { line, rows } = twoSpanLine(5, 5);
  const drawings = beamPlans(line, rows, beamOpts());
  const elevations = drawings.filter((d) => /:elev(-\d+)?$/.test(d.key));

  it('keep every mark of an elevation clear of every other, the top bars\' over the bottom bars\'', () => {
    for (const d of elevations) {
      const marks = circles(d).filter((c) => c.r < 2.7 * 20 && c.c.y < 0);
      for (let i = 0; i < marks.length; i++) for (let j = i + 1; j < marks.length; j++) {
        expect(Math.hypot(marks[i]!.c.x - marks[j]!.c.x, marks[i]!.c.y - marks[j]!.c.y)).toBeGreaterThanOrEqual(2 * marks[i]!.r - 1e-6);
      }
    }
    const shown = new Set(elevations.flatMap((d) => d.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text)));
    for (const b of line.bars) expect(shown.has(b.mark)).toBe(true);
  });

  it('dimension each span once, in centimetres, as every other dimension', () => {
    for (const d of drawings.filter((x) => !x.paper)) {
      for (const q of dims(d)) expect(q.text).toMatch(/^\d+$/);
      const keys = dims(d).filter((q) => Math.abs(q.a.y - q.b.y) < 1e-6).map((q) => `${Math.round(Math.min(q.a.x, q.b.x))}:${Math.round(Math.max(q.a.x, q.b.x))}:${Math.round(q.a.y)}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('dimension every straight leg of every bar in the breakdown, hooks included', () => {
    const bd = drawings.find((d) => d.key.endsWith(':bars') || d.key.endsWith(':elev'))!;
    const bars = bd.primitives.filter((p): p is Extract<Primitive, { kind: 'polyline' }> => p.kind === 'polyline' && /^ST-ARM-(SUP|INF|LEV)-/.test(p.layer));
    const ds = dims(bd);
    const near = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y) < 1;
    let legs = 0;
    for (const bar of bars.slice(-line.bars.length)) {
      for (let i = 1; i < bar.points.length; i++) {
        const a = bar.points[i - 1]!, b = bar.points[i]!;
        const ext = (q: Dim) => (near(q.a, a) && near(q.b, b)) || (near(q.a, b) && near(q.b, a));
        if (Math.hypot(b.x - a.x, b.y - a.y) < 5) continue;
        const along = ds.some(ext) || ds.some((q) => Math.abs(Math.hypot(q.b.x - q.a.x, q.b.y - q.a.y) - Math.hypot(b.x - a.x, b.y - a.y)) > 1 && [a, b].every((e) => near(q.a, e) || near(q.b, e) || (Math.min(q.a.x, q.b.x) - 1 <= e.x && e.x <= Math.max(q.a.x, q.b.x) + 1 && Math.abs(q.a.y - e.y) < 1)));
        expect(along, `leg ${i} of ${bar.layer}`).toBe(true);
        legs++;
      }
    }
    expect(legs).toBeGreaterThanOrEqual(line.bars.length);
  });

  it('draw every stirrup on the one layer of its diameter', () => {
    const layers = new Set(elevations.flatMap((d) => d.primitives.filter((p) => /^ST-ARM-EST-/.test(p.layer)).map((p) => p.layer)));
    expect(layers).toEqual(new Set(line.zones.map((z) => `ST-ARM-EST-Ø${z.stirrups.dia}`)));
  });

  it('go on three A3 sheets at 1:20, the long elevation cut once at its middle axis, each half with its bars on tracks', () => {
    const { drawings: ds, levels } = planDrawings({ line: [line], beam: rows, column: [], slab: [], slabPlan: [], wall: [] }, { families: ['beam'], levels: null }, o);
    expect(ds.filter((d) => /:elev-\d$/.test(d.key))).toHaveLength(2);
    expect(planSheets(ds, levels, 'A3', project, tr).length).toBeLessThanOrEqual(3);
  });
});

describe('dense sheets', () => {
  it('put a narrow drawing beside the title block and the small ones of a level together', () => {
    const g = formatGeometry('A3');
    const box = (key: string, w: number, h: number): DrawingInput => ({ key, title: key, primitives: [], width: w, height: h, origin: { x: 0, y: 0 }, paper: true, group: 'N1' });
    expect(fitsDense(g, 150, 250)).toBe(true);
    expect(fitsDense(g, 300, 250)).toBe(false);
    const sheets = composeSheets([box('tall', 150, 240), box('a', 100, 60), box('b', 100, 60), box('c', 100, 60)], 'A3', formatGeometry, true);
    expect(sheets).toHaveLength(1);
    const tall = sheets[0]!.drawings.find((d) => d.key === 'tall')!;
    expect(tall.y).toBeLessThan(g.titleBlock.y1);
    for (const d of sheets[0]!.drawings) for (const e of sheets[0]!.drawings) if (d !== e) expect(d.x + d.w <= e.x + 1e-6 || e.x + e.w <= d.x + 1e-6 || d.y + d.h <= e.y + 1e-6 || e.y + e.h <= d.y + 1e-6).toBe(true);
    for (const d of sheets[0]!.drawings) expect(d.x + d.w <= g.titleBlock.x0 + 1e-6 || d.y >= g.titleBlock.y1 - 1e-6).toBe(true);
  });

  it('draw a column with its section and schedule on one sheet', () => {
    const cols = columnStack();
    const { drawings, levels } = planDrawings({ line: [], beam: [], column: [cols[0]!], slab: [], slabPlan: [], wall: [] }, { families: ['column'], levels: null }, o);
    expect(planSheets(drawings, levels, 'A3', project, tr)).toHaveLength(1);
  });
});
