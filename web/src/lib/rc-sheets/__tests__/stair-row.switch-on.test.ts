import { describe, it, expect } from 'vitest';
import { makeFmt } from '../format';
import { stairRow, stairSection, type StairDemand } from '../stair-row';

const fmt = makeFmt('.');
const ctx = { fc: 25, fy: 420, cover: 0.025, diameters: [8, 10, 12, 16] };
const spec = { riser: 0.175, tread: 0.28, steps: 10, waist: 0.18, width: 1.2, landingBottom: 0.6, landingTop: 0.6, ends: 'monolithic' as const, finishes: 1, live: 5 };
const demand = (over: Partial<StairDemand['spec']> = {}): StairDemand => ({ key: 'stair:e1', name: 'E1', source: 'desk', spec: { ...spec, ...over }, place: null, quads: [], presumed: [] });

const r = stairRow(demand(), ctx, undefined, fmt, 'cirsoc201-2025');

describe('a stair in the sheets', () => {

  it('is designed as a simply supported horizontal span with its load on plan, and verifies', () => {
    expect(r.design!.geometry.span).toBeCloseTo(0.6 + 9 * 0.28 + 0.6, 9);
    expect(r.status, r.verifications.filter((v) => !v.ok).map((v) => v.label).join(', ')).toBe('ok');
  });
});

describe('the stairs the sheets find', () => {
  const nodes = new Map<number, { x: number; y: number; z?: number }>();
  const quads = new Map<number, { id: number; nodes: number[]; thickness: number }>();
  let nid = 0;
  const node = (x: number, y: number, z: number) => { nodes.set(++nid, { x, y, z }); return nid; };
  const quad = (id: number, ns: number[], t = 0.18) => quads.set(id, { id, nodes: ns, thickness: t });
  const a0 = node(0, 0, 0), a1 = node(0, 1.2, 0), b0 = node(1, 0, 0), b1 = node(1, 1.2, 0);
  const c0 = node(3.52, 0, 1.75), c1 = node(3.52, 1.2, 1.75), d0 = node(4.5, 0, 1.75), d1 = node(4.5, 1.2, 1.75);
  quad(1, [a0, b0, b1, a1]);
  quad(2, [b0, c0, c1, b1]);
  quad(3, [c0, d0, d1, c1]);
  quad(9, [node(10, 0, 0), node(11, 0, 0), node(11, 1, 0), node(10, 1, 0)]);

  it('reads a flight of the model as a stair, with the level shells at its foot and head as its landings, and says what it presumed', async () => {
    const { stairDemands } = await import('../stair-demands');
    const [s] = stairDemands({ nodes, quads, entries: [], live: 5 });
    expect(s!.source).toBe('model');
    expect(s!.quads).toEqual([2]);
    expect(s!.spec.width).toBeCloseTo(1.2, 9);
    expect(s!.spec.landingBottom).toBeCloseTo(1, 9);
    expect(s!.spec.landingTop).toBeCloseTo(0.98, 9);
    expect(s!.spec.steps * s!.spec.riser).toBeCloseTo(1.75, 9);
    expect((s!.spec.steps - 1) * s!.spec.tread).toBeCloseTo(2.52, 9);
    expect(s!.place!.dir.x).toBeCloseTo(1, 9);
    expect(s!.presumed.length).toBeGreaterThan(0);
  });

  it('takes the risers a flight declares instead of presuming them, and only when its shells agree', async () => {
    const { stairDemands } = await import('../stair-demands');
    const [s] = stairDemands({ nodes, quads, entries: [], live: 5, declaredSteps: new Map([[2, 11]]) });
    expect([s!.spec.steps, s!.spec.riser, s!.spec.tread]).toEqual([11, expect.closeTo(1.75 / 11, 12), expect.closeTo(2.52 / 10, 12)]);
    expect(s!.presumed).not.toContain('rcSheets.stair.presumedRiser');
    const [p] = stairDemands({ nodes, quads, entries: [], live: 5 });
    expect([p!.spec.steps, p!.presumed]).toEqual([10, expect.arrayContaining(['rcSheets.stair.presumedRiser'])]);
  });

  it('ends a landing at the first beam or wall across the flight\'s width, the floor past it not the landing', async () => {
    const { stairDemands } = await import('../stair-demands');
    const withWall = new Map(quads);
    withWall.set(20, { id: 20, nodes: [node(4, 0, 1.75), node(4, 1.2, 1.75), node(4, 1.2, 4.5), node(4, 0, 4.5)], thickness: 0.15 });
    withWall.set(21, { id: 21, nodes: [node(4.2, 0, 1.75), node(4.2, 0.4, 1.75), node(4.2, 0.4, 4.5), node(4.2, 0, 4.5)], thickness: 0.15 });
    const [s] = stairDemands({ nodes, quads: withWall, entries: [], live: 5, bars: [[{ x: 0.4, y: -1, z: 0 }, { x: 0.4, y: 3, z: 0 }], [{ x: 0.7, y: 0, z: 0 }, { x: 0.7, y: 0.3, z: 0 }]] });
    expect([s!.spec.landingBottom, s!.spec.landingTop]).toEqual([expect.closeTo(0.6, 9), expect.closeTo(0.48, 9)]);
  });

  it('finds none where the model has no flight, and takes a desk stair over the flight it is linked to', async () => {
    const { stairDemands } = await import('../stair-demands');
    const flat = new Map([[9, quads.get(9)!]]);
    expect(stairDemands({ nodes, quads: flat, entries: [], live: 5 })).toEqual([]);
    const entry = { id: 'e1', name: 'E1', ...spec, analysisQuads: [2] };
    const all = stairDemands({ nodes, quads, entries: [entry], live: 5 });
    expect(all.map((d) => [d.key, d.source])).toEqual([['stair:e1', 'desk']]);
    expect(all[0]!.place!.z).toBeCloseTo(0, 9);
  });

  it('bars the stair as the course draws it: bent at the foot, crossed at the head, a leg into each support', () => {
    const main = r.bars.find((b) => b.role === 'main')!, land = r.bars.find((b) => b.role === 'landing')!;
    const [x0, z0] = main.shape.pts[0]!, [x1, z1] = main.shape.pts[1]!;
    expect(x0).toBeCloseTo(x1, 9);
    expect(z0).toBeGreaterThan(z1);
    expect(main.shape.pts.length).toBeGreaterThanOrEqual(4);
    const head = r.section.landingBottom + r.section.run;
    expect(Math.max(...main.shape.pts.map((p) => p[0]))).toBeGreaterThan(head - 0.3);
    expect(Math.min(...land.shape.pts.map((p) => p[0]))).toBeLessThan(head);
    expect(r.bars.some((b) => b.role === 'topFoot')).toBe(true);
    expect(r.bars.some((b) => b.role === 'topHead')).toBe(true);
    const simple = stairRow(demand({ ends: 'simple' }), ctx, undefined, fmt, 'cirsoc201-2025');
    expect(simple.bars.some((b) => b.role.startsWith('top'))).toBe(false);
  });

  it.each([
    ['the party-wall building\'s flight', { riser: 1.4 / 9, tread: 0.33, steps: 9, waist: 0.23, width: 1.05, landingBottom: 1.2, landingTop: 1.2, landingThickness: 0.23 }],
    ['a flight from the ground', { riser: 1.5 / 9, tread: 0.33, steps: 9, waist: 0.23, width: 1.05, landingBottom: 0, landingTop: 1.2, landingThickness: 0.23 }],
    ['a steep flight with thin landings', { riser: 0.18, tread: 0.26, steps: 12, waist: 0.15, width: 1.2, landingBottom: 0.9, landingTop: 0.4, landingThickness: 0.12 }],
  ])('keeps every bar of %s inside its concrete, the waist at the steps\' slope, crossed at the head and not cut by a level bar', (_n, over) => {
    const row = stairRow(demand(over), ctx, undefined, fmt, 'cirsoc201-2025');
    const sec = row.section, poly = sec.outline;
    expect(Math.tan(sec.angle)).toBeCloseTo(over.riser / over.tread, 12);
    const inside = ([x, z]: readonly [number, number]) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i]!, b = poly[j]!; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c; }
      return c;
    };
    for (const b of row.bars) {
      const pts = b.rows ?? b.shape.pts;
      const lines = b.rows ? pts.map((p) => [p, p] as const) : pts.slice(1).map((p, i) => [pts[i]!, p] as const);
      for (const [p, q] of lines) for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const at: [number, number] = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        expect(inside(at), `${b.role} ${b.mark} at ${at.map((v) => v.toFixed(3))}`).toBe(true);
      }
    }
    const head = sec.landingBottom + sec.run;
    const land = row.bars.find((b) => b.role === 'landing')!;
    const level = land.shape.pts.slice(1).map((p, i) => [land.shape.pts[i]!, p] as const).filter(([p, q]) => Math.abs(p[1] - q[1]) < 1e-9 && Math.abs(p[0] - q[0]) > 1e-9);
    expect(Math.min(...level.flatMap(([p, q]) => [p[0], q[0]])), 'the landing\'s bottom bar runs level only under the last step and the landing').toBeGreaterThan(head - over.tread);
    const main = row.bars.find((b) => b.role === 'main')!;
    expect(Math.max(...main.shape.pts.map((p) => p[1])), 'the flight\'s bottom bar reaches the head landing\'s top').toBeGreaterThan(sec.rise - 0.05);
  });

  it('says a code it does not design stairs under, instead of designing to another', () => {
    const ec = stairRow(demand(), ctx, undefined, fmt, 'en1992-1-1');
    expect(ec.status).toBe('none');
    expect(ec.unsupported).toBe('en1992-1-1');
    expect(ec.verifications[0]!.label).toBe('rcSheets.v.stairCode');
  });

  it('draws its section: landings, the steps between them and the waist under', () => {
    const s = stairSection({ ...spec });
    expect(s.outline.filter(([, z]) => z > 0 && z < 1.75).length).toBeGreaterThanOrEqual(2 * 9);
    expect(s.run).toBeCloseTo(9 * 0.28, 9);
    expect(s.rise).toBeCloseTo(1.75, 9);
  });
});

describe('a stair through the sheets\' outputs', () => {
  it('schedules each position as many times as the width or the run takes, bent as it is placed', async () => {
    const { stairPieces } = await import('../schedule/pieces');
    const e = stairPieces(r);
    expect(e.family).toBe('stair');
    expect(e.pieces.map((p) => p.kind)).toEqual(r.bars.map((b) => ({ main: 'stairMain', landing: 'stairLanding', topFoot: 'stairTop', topFootFlight: 'stairTop', topHead: 'stairTop', dist: 'stairDist', distTop: 'stairDist' })[b.role]));
    const main = r.bars.find((b) => b.role === 'main')!;
    expect(main.count).toBe(Math.floor((1.2 - 2 * 0.025) / main.spacing + 1e-9) + 1);
  });

  it('draws its section to scale with every position and its schedule', async () => {
    const { stairPlans, stairSectionPrimitives } = await import('../plans/stair-detail');
    const ps = stairSectionPrimitives(r);
    expect(ps.filter((p) => p.kind === 'polyline').length).toBe(1 + r.bars.filter((b) => !b.rows).length);
    expect(ps.filter((p) => p.kind === 'circle').length).toBe(r.bars.filter((b) => b.rows).reduce((t, b) => t + b.rows!.length, 0));
    const drawings = stairPlans(r, { scale: 25, fmt, tr: (k: string) => k, code: 'cirsoc201-2025', group: 'g' });
    expect(drawings.length).toBeGreaterThanOrEqual(2);
  });

  it('has a sheet of its own in the workbook', async () => {
    const { rcSheetsWorkbook } = await import('../workbook');
    const book = rcSheetsWorkbook({ beam: [], column: [], slab: [], wall: [], stair: [r], code: 'CIRSOC 201-2025' }, (k) => k);
    const sheet = book.find((s) => s.name === 'rcSheets.family.stair')!;
    expect(sheet.rows[2]![0]).toBe('E1');
    expect(sheet.rows[2]![2]).toBe('10 × 17.5/28');
  });

  it('stands its bars in 3D along the flight\'s run, across its width, from the foot landing\'s top over the shells\' mid-surface', async () => {
    const { stairBars3d } = await import('../rebar-3d-stairs');
    expect(stairBars3d(r, 0.025)).toEqual([]);
    const placed = stairRow({ ...demand(), place: { x: 2, y: 5, z: 3, dir: { x: 0, y: 1 } } }, ctx, undefined, fmt, 'cirsoc201-2025');
    const bars = stairBars3d(placed, 0.025);
    const main = placed.bars.find((b) => b.role === 'main')!;
    expect(bars.filter((b) => b.kind === 'stairMain')).toHaveLength(main.count);
    const first = bars.find((b) => b.kind === 'stairMain')!.segments[0]!;
    expect(first[0]![1]).toBeCloseTo(5 - 0.6 + main.shape.pts[0]![0], 9);
    expect(first[0]![2]).toBeCloseTo(3 + placed.section.tl / 2 + main.shape.pts[0]![1], 9);
    expect(Math.max(...bars.flatMap((b) => b.segments.flat().map((p) => Math.abs(p[0] - 2))))).toBeLessThanOrEqual(0.6 + 1e-9);
  });
});
