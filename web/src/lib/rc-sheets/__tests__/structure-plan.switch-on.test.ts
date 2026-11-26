/** A level of beams, columns or walls in plan: each where the model has it, turned as the model turns it, its bars in short, its labels clear of each other, and the drawing to scale. */
import { describe, it, expect } from 'vitest';
import { columnRow } from '../column-row';
import { check } from '../types';
import { columnBarsShort, governingCheck, lineBarsShort, scaleBarLength, structurePlan, type PlanColumnItem, type StructureModel, type StructureRows } from '../structure-plan';
import { placeStructureLabels, textBox } from '../structure-plan-labels';
import { segmentHitsBox, type Box } from '../slab-plan-labels';
import { structurePlanDrawing } from '../plans/structure-plan';
import { planDrawings } from '../plans/sheets';
import { ctx, fmt, tr, twoSpanLine, wall } from '../plans/__tests__/fixtures';

const overlap = (a: Box, b: Box) => a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9;
const close = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-9);

function model(extra: Partial<StructureModel> = {}): StructureModel {
  const nodes = new Map([[1, { x: 0, y: 0, z: 3 }], [2, { x: 5, y: 0, z: 3 }], [3, { x: 9, y: 0, z: 3 }], [10, { x: 2, y: 4, z: 0 }], [11, { x: 2, y: 4, z: 3 }], [12, { x: 2, y: 4, z: -3 }]]);
  const elements = new Map([[1, { nodeI: 10, nodeJ: 11, sectionId: 1, rollAngle: 30 }], [2, { nodeI: 12, nodeJ: 10, sectionId: 1 }]]);
  return { nodes, elements, sections: new Map([[1, { rotation: 60 }]]), ...extra };
}

function columnAt(level: string) {
  const c = { mat: { fc: 30, fy: 420 }, cover: 0.03, tieDia: 8, diameters: [12, 16, 20, 25] };
  const row = columnRow({ key: 'column:5:0', name: 'C5', level, b: 0.3, h: 0.6, length: 3, lu: 2.6, psiTop: 1, psiBot: 1, cases: [{ combo: 'U', pu: 900, mxTop: 40, mxBot: -20, myTop: 10, myBot: -5, vx: 20, vy: 8 }], nodes: { bottom: 10, top: 11 } }, c, undefined, fmt);
  return row;
}

function rows(): StructureRows {
  const { line, rows: spans } = twoSpanLine();
  const w = wall();
  return {
    line: [line], beam: spans, column: [columnAt('N1')],
    wall: [{ ...w, demand: { ...w.demand, plan: { x1: 0, y1: 6, x2: 4, y2: 6 } } }],
    slabPlan: [{ level: 'N1', panels: [{ key: 'slab:1', name: 'L1', rect: { x0: 0, x1: 9, y0: 0, y1: 5 }, h: 0.15, status: 'ok' }] }],
  };
}

describe('the beams of a level in plan', () => {
  const plan = structurePlan('beam', 'N1', rows(), model({ axes: [{ name: 'A', axis: 'x', at: 0 }, { name: '1', axis: 'y', at: 0 }, { name: 'Z', axis: 'x', at: 40 }] }));

  it('draws each span axis to axis at its width, with the line\'s bars in short and its status', () => {
    expect(plan.items).toHaveLength(1);
    const it = plan.items[0]!;
    if (it.kind !== 'beam') throw new Error('not a beam');
    expect(it.spans.map((s) => [...s.a, ...s.b])).toEqual([[0, 0, 5, 0], [5, 0, 9, 0]]);
    expect(it.spans.every((s) => s.width === 0.25)).toBe(true);
    expect(it.bars).toBe(lineBarsShort(rows().line[0]!));
    expect(it.bars).toMatch(/^\d+Ø\d+ \/ \d+Ø\d+ · Ø\d+ c\/\d+/);
    expect(['ok', 'warn', 'fail']).toContain(it.status);
    for (const c of it.cuts) { expect(c[1]).toBe(0); expect(c[0]).toBeGreaterThanOrEqual(0); expect(c[0]).toBeLessThanOrEqual(9); }
  });

  it('ticks across the beam where its bars are lapped, in the workspace and on paper', () => {
    const r = rows(), base = r.line[0]!;
    const lapped = { ...base, splices: [{ mark: 'A', face: 'bottom' as const, x: 5.3, length: 0.6, bars: 2, spliceClass: 'B' as const }, { mark: 'B', face: 'top' as const, x: 7, length: 0.6, bars: 2, spliceClass: 'B' as const }] };
    const p = structurePlan('beam', 'N1', { ...r, line: [lapped] }, model());
    const it = p.items[0]!;
    if (it.kind !== 'beam') throw new Error('not a beam');
    expect(it.splices).toHaveLength(2);
    for (const [[x1, y1], [x2, y2]] of it.splices) { expect(x1).toBeCloseTo(x2, 9); expect(Math.abs(y2 - y1)).toBeCloseTo(1.2 * 0.25, 9); }
    expect(it.splices.map((t) => t[0][0])).toEqual([expect.closeTo(5.3, 9), expect.closeTo(7, 9)]);
    const d = structurePlanDrawing(p, { scale: 100, fmt, tr, group: 'g' } as never);
    const ticks = (d as { primitives: Array<{ kind: string; a?: { x: number; y: number }; b?: { x: number; y: number } }> }).primitives
      .filter((q) => q.kind === 'line' && Math.abs(q.a!.x - 5300) < 1e-6 && Math.abs(q.b!.x - 5300) < 1e-6);
    expect(ticks).toHaveLength(1);
  });

  it('runs the grid\'s axes a metre past what is drawn, leaves out the ones far from it, and lays the slabs under it', () => {
    expect(plan.axes.map((a) => a.name)).toEqual(['A', '1']);
    expect(plan.axes[0]!.a[1]).toBeCloseTo(-1 - 0.125, 9);
    expect(plan.axes[1]!.b[0]).toBeCloseTo(10, 9);
    expect(plan.slabs).toEqual([{ x0: 0, x1: 9, y0: 0, y1: 5 }]);
    expect(plan.bounds.x0).toBeCloseTo(-1, 9);
  });

  it('draws nothing of another level, and lays the first level\'s slabs under a level with none', () => {
    const other = structurePlan('beam', 'N2', rows(), model());
    expect(other.items).toEqual([]);
    expect(other.slabs).toEqual([{ x0: 0, x1: 9, y0: 0, y1: 5 }]);
  });
});

describe('the columns of a level in plan', () => {
  it('cut at the base, to scale, turned by the member\'s roll and its section\'s rotation, the bars inside', () => {
    const plan = structurePlan('column', 'N1', rows(), model());
    const c = plan.items[0] as PlanColumnItem;
    expect(c.at).toEqual([2, 4]);
    expect(c.rotDeg).toBe(90);
    const xs = c.outline.map((p) => p[0]), ys = c.outline.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.6, 9);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.3, 9);
    for (const b of c.rebars) {
      expect(Math.abs(b.at[0] - 2)).toBeLessThan(0.3);
      expect(Math.abs(b.at[1] - 4)).toBeLessThan(0.15);
    }
    const r = rows().column[0]!;
    expect(c.rebars).toHaveLength(4 + 2 * r.adopted.nx + 2 * r.adopted.ny);
    expect(c.bars).toBe(columnBarsShort(r));
    const counts = [...c.bars.matchAll(/(\d+)Ø\d+(?= [·+])/g)].reduce((n, m) => n + Number(m[1]), 0);
    expect(counts).toBe(c.rebars.length);
    expect(c.bars.endsWith(` · Ø${r.adopted.tieDia} c/${Math.round(r.adopted.tieSpacing * 100)}`)).toBe(true);
  });

  it('stands unturned when nothing turns it, and says which rows the model gives no place', () => {
    const plain = structurePlan('column', 'N1', rows(), model({ sections: new Map(), elements: new Map([[1, { nodeI: 10, nodeJ: 11, sectionId: 1 }]]) }));
    const c = plain.items[0] as PlanColumnItem;
    expect(close(c.outline[0]!, [2 - 0.15, 4 - 0.3])).toBe(true);
    const lost = structurePlan('column', 'N1', rows(), model({ nodes: new Map() }));
    expect(lost.items).toEqual([]);
    expect(lost.unplaced).toEqual(['column:5:0']);
  });
});

describe('the walls of a level in plan', () => {
  it('as a band as thick as the wall along its base', () => {
    const plan = structurePlan('wall', 'N1', rows(), model());
    const w = plan.items[0]!;
    if (w.kind !== 'wall') throw new Error('not a wall');
    expect([...w.a, ...w.b]).toEqual([0, 6, 4, 6]);
    expect(Math.max(...w.outline.map((p) => p[1])) - Math.min(...w.outline.map((p) => p[1]))).toBeCloseTo(0.2, 9);
    expect(w.bars).toMatch(/^V Ø\d+ c\/\d+ · H Ø\d+ c\/\d+ \(\d×\)/);
  });
});

describe('what a plan says of each element', () => {
  it('names the failing check, the worst of them, else the one nearest its capacity', () => {
    const a = check('a', true, { ratio: 0.4 }), b = check('b', true, { ratio: 0.9 }), c = check('c', false, { ratio: 1.2 }), d = check('d', false);
    expect(governingCheck([a, b])).toBe(b);
    expect(governingCheck([a, c, b])).toBe(c);
    expect(governingCheck([a, c, d])).toBe(d);
    expect(governingCheck([check('e', true)])).toBeUndefined();
  });

  it('measures the scale bar in 1, 2 or 5 times a power of ten', () => {
    expect(scaleBarLength(53, 80)).toBe(2);
    expect(scaleBarLength(20, 80)).toBe(5);
    expect(scaleBarLength(400, 80)).toBe(0.2);
  });
});

describe('the labels of a plan', () => {
  const grid = (): StructureRows => {
    const base = twoSpanLine();
    const lines = [0, 5, 10].map((_, i) => ({ ...base.line, key: `line:${i}`, group: i, name: `V${i + 1}` }));
    const spans = [0, 5, 10].flatMap((_, i) => base.rows.map((r, k) => ({ ...r, key: `beam:${i}:${k}`, demand: { ...r.demand, line: { ...r.demand.line!, group: i, startNode: 100 * i + k + 1, endNode: 100 * i + k + 2 } } })));
    return { line: lines, beam: spans, column: [], wall: [], slabPlan: [] };
  };
  const nodes = new Map([0, 5, 10].flatMap((y, i) => [[100 * i + 1, { x: 0, y }], [100 * i + 2, { x: 5, y }], [100 * i + 3, { x: 9, y }]] as Array<[number, { x: number; y: number }]>));
  const plan = structurePlan('beam', 'N1', grid(), { nodes, elements: new Map() });
  const size = { char: 0.1, height: 0.2, gap: 0.06 };
  const text = (it: { name: string; bars: string }) => `${it.name} · ${it.bars}`;

  it('stand one by each element, clear of each other and of every beam', () => {
    const places = placeStructureLabels(plan.items, text, size);
    expect(places.size).toBe(3);
    const boxes = [...places.values()].map((p) => p.box);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!, boxes[j]!)).toBe(false);
    for (const it of plan.items) if (it.kind === 'beam') for (const s of it.spans) for (const b of boxes) expect(segmentHitsBox(s.a, s.b, b)).toBe(false);
    for (const it of plan.items) expect(boxes[plan.items.indexOf(it)]!.x1 - boxes[plan.items.indexOf(it)]!.x0).toBeCloseTo(text(it).length * size.char, 9);
  });

  it('turn with a beam that runs up the plan', () => {
    expect(textBox([0, 0], 2, 0.2, 90)).toMatchObject({ x0: expect.closeTo(-0.1, 9), y0: expect.closeTo(-1, 9) });
    const up = structurePlan('beam', 'N1', grid(), { nodes: new Map([...nodes].map(([k, p]) => [k, { x: p.y, y: p.x }])), elements: new Map() });
    for (const p of placeStructureLabels(up.items, text, size).values()) expect(Math.abs(p.rot)).toBe(90);
  });

  it('go to the exported sheet at the plan\'s scale, one text a member, ahead of the family\'s drawings', () => {
    const d = structurePlanDrawing(plan, { ...ctx(50), group: 'g' });
    expect(d.key).toBe('structplan:beam:N1');
    expect(d.scale).toBe(50);
    const texts = d.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text);
    for (const it of plan.items) expect(texts).toContain(text(it));
    const { line, rows: spans } = twoSpanLine();
    const out = planDrawings({ line: [line], beam: spans, column: [], slab: [], slabPlan: [], wall: [], structure: [plan] }, { families: ['beam'], levels: null }, { format: 'A3', scales: { elevation: 20, plan: 50 }, code: 'cirsoc201-2025', endZones: false, slabCover: 0.02, fmt, tr });
    expect(out.drawings[0]!.key).toBe('structplan:beam:N1');
    const one = planDrawings({ line: [line], beam: spans, column: [], slab: [], slabPlan: [], wall: [], structure: [plan] }, { families: [], levels: null, element: line.key }, { format: 'A3', scales: { elevation: 20, plan: 50 }, code: 'cirsoc201-2025', endZones: false, slabCover: 0.02, fmt, tr });
    expect(one.drawings.some((x) => x.key.startsWith('structplan:'))).toBe(false);
  });
});
