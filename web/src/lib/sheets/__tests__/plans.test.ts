/**
 * The construction drawings, one golden per kind of plan, each built from a small hand-made
 * input and composed onto an A2 sheet: formwork, column schedule, beam stirrups and breakdown,
 * foundations, punching, steel framing, anchors, a joint, the bending figure, the details and the
 * notes. Plus the facts each one must state whatever its drawing looks like.
 */
import { describe, expect, it } from 'vitest';
import { composeSheets, type DrawingInput } from '../compose';
import { sheetToSvg } from '../to-svg';
import { formatGeometry } from '../formats';
import { formworkPlan } from '../plans/formwork-plan';
import { columnSchedule, liftText, mergeIdentical } from '../plans/column-schedule';
import { barBreakdown, stirrupZones } from '../plans/beam-plans';
import { foundationPlan } from '../plans/foundation-plan';
import { punchingPlan } from '../plans/punching-plan';
import { anchorPlan, jointSheet, steelFrameElevation, steelLevelPlan, type SteelMember } from '../plans/steel-plans';
import { constructionDetails, hookPath } from '../plans/details';
import { generalNotes } from '../plans/general-notes';
import { drawTable } from '../plans/table';
import type { PlanAxis } from '../plans/plan-common';
import type { Primitive } from '../primitives';

const tr = (k: string, p?: Record<string, string | number>) => (p ? `${k} ${Object.values(p).join(' ')}` : k);
const fmt = (v: number, d = 2) => v.toFixed(d);
const axes: PlanAxis[] = [
  { name: '1', axis: 'x', at: 0 }, { name: '2', axis: 'x', at: 5 }, { name: '3', axis: 'x', at: 10 },
  { name: 'A', axis: 'y', at: 0 }, { name: 'B', axis: 'y', at: 4 },
];
const texts = (ps: readonly Primitive[]) => ps.filter((p): p is Extract<Primitive, { kind: 'text' }> => p.kind === 'text').map((p) => p.text);

async function golden(name: string, ds: DrawingInput[]) {
  const [sheet] = composeSheets(ds, 'A2');
  const g = formatGeometry(sheet!.format);
  await expect(sheetToSvg(g.width, g.height, sheet!.primitives)).toMatchFileSnapshot(`./__goldens__/plan-${name}.svg`);
}

const cols = [0, 5, 10].flatMap((x) => [0, 4].map((y) => ({ x, y })));

describe('construction drawings', () => {
  it('formwork plan: axes, columns, beams with b×h, the slab and the level', async () => {
    const d = formworkPlan({
      level: { name: 'N1', z: 3.2 }, axes, scale: 100,
      columns: cols.map((p, i) => ({ name: `C${i + 1}`, at: p, section: { kind: 'rect' as const, b: 0.3, h: 0.3 } })),
      beams: [{ name: 'V101', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, width: 0.2, depth: 0.5 }, { name: 'V102', a: { x: 5, y: 0 }, b: { x: 10, y: 0 }, width: 0.2, depth: 0.5 }, { name: 'V103', a: { x: 0, y: 0 }, b: { x: 0, y: 4 }, width: 0.2, depth: 0.45 }],
      slabs: [{ name: 'L101', outline: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 0, y: 4 }], thickness: 0.12 }],
      walls: [],
    }, 'Formwork N1', (v) => v.toFixed(2));
    const t = texts(d.primitives);
    expect(t).toContain('V101 20×50');
    expect(t).toContain('C1 30×30');
    expect(t).toContain('L101 — h 12');
    expect(t).toContain('+3.20');
    expect(d.primitives.filter((p) => p.kind === 'dimension')).toHaveLength(3);
    await golden('formwork', [d]);
  });

  it('column schedule: identical stacks merged, a cell per lift with its steel', async () => {
    const lift = (level: string, zLo: number, zHi: number, b: number) => ({ level, zLo, zHi, section: { kind: 'rect' as const, b, h: b }, bars: { kind: 'faces' as const, corner: 16, face: 12, nB: 1, nT: 1, nL: 1, nR: 1 }, ties: { diameter: 6, spacing: 0.15, endSpacing: 0.1 } });
    const c1 = { name: 'C1', lifts: [lift('N1', 0, 3, 0.3), lift('N2', 3, 6, 0.25)] };
    const c2 = { name: 'C2', lifts: [lift('N1', 0, 3, 0.3), lift('N2', 3, 6, 0.25)] };
    const c3 = { name: 'C3', lifts: [lift('N1', 0, 3, 0.35), { level: 'N2', zLo: 3, zHi: 6, section: { kind: 'steel' as const, profile: 'HEB 200' } }] };
    expect(mergeIdentical([c1, c2, c3]).map((c) => c.name)).toEqual(['C1 = C2', 'C3']);
    expect(liftText(c1.lifts[0]!)).toBe('30×30\n4Ø16+4Ø12\neØ6 c/15 (10)');
    const ds = columnSchedule([c1, c2, c3], tr);
    expect(texts(ds[0]!.primitives)).toContain('HEB 200');
    await golden('columns', ds);
  });

  it('beam line: stirrup zones dimensioned, the marks with their shapes', async () => {
    const z = stirrupZones('A +3.20', [
      { name: '1', length: 5, support: { diameter: 6, spacing: 0.1, length: 1 }, span: { diameter: 6, spacing: 0.2 } },
      { name: '2', length: 4, span: { diameter: 6, spacing: 0.15 } },
    ], tr)!;
    expect(texts(z.primitives)).toEqual(expect.arrayContaining(['eØ6 c/10', 'eØ6 c/20', 'eØ6 c/15']));
    expect(z.primitives.filter((p) => p.kind === 'dimension').map((p) => (p as { text?: string }).text)).toEqual(['100', '300', '100', '400']);
    const L = { points: [{ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 4, y: 0 }], legs: [{ lengthM: 0.3, at: { x: 0, y: 0.5 }, horizontal: false }, { lengthM: 4.5, at: { x: 2, y: 0 }, horizontal: true }], extent: { min: { x: 0, y: 0 }, max: { x: 4, y: 1 } } };
    const b = barBreakdown('A +3.20', [{ mark: 'B1', count: 2, diameter: 16, cut: 4.8, shape: L }, { mark: 'B2', count: 3, diameter: 12, cut: 9.1 }], tr, fmt)!;
    expect(texts(b.primitives)).toEqual(expect.arrayContaining(['B1 — 2Ø16 — L 4.80 m', '450', '30']));
    await golden('beam', [z, b]);
  });

  it('foundation plan: footings tied to the axes, the footing table', async () => {
    const ds = foundationPlan(cols.map((p, i) => ({
      name: `Z${i + 1}`, at: p, B: 1.6, L: 1.6, thickness: 0.5, rotDeg: 0, ecc: { x: i === 0 ? 0.25 : 0, y: 0 }, founding: -1.5, kind: 'isolated',
      column: { name: '', at: p, section: { kind: 'rect' as const, b: 0.3, h: 0.3 } },
      mats: { bottomX: { diameter: 12, spacing: 0.15 }, bottomY: { diameter: 12, spacing: 0.15 } },
    })), axes, 100, tr, (v) => v.toFixed(2));
    expect(ds).toHaveLength(2);
    // Z1 sits 250 mm off axis 1: the one setting-out dimension.
    expect(ds[0]!.primitives.filter((p) => p.kind === 'dimension' && Math.abs(Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) - 250) < 1)).toHaveLength(1);
    expect(texts(ds[1]!.primitives)).toEqual(expect.arrayContaining(['Z1', '160×160×50', 'Ø12 c/15', '-1.50']));
    await golden('foundations', ds);
  });

  it('punching plan: the critical perimeter and the rails of stirrups', async () => {
    const d = punchingPlan('Punching L1', null, [
      { name: 'N5', at: { x: 5, y: 4 }, halfX: 0.27, halfY: 0.27, d: 0.12, utilization: 1.32, status: 'fail', reinforcement: { lines: 8, spacing: 0.06, extent: 0.5, legDiameter: 8 } },
      { name: 'N2', at: { x: 0, y: 4 }, halfX: 0.27, halfY: 0.27, d: 0.12, utilization: 0.71, status: 'ok' },
    ], axes, 50, tr, fmt)!;
    expect(d.primitives.filter((p) => p.layer === 'RC-PUNCHING' && p.kind === 'line')).toHaveLength(8);
    expect(texts(d.primitives)).toEqual(expect.arrayContaining(['N5 — 1.32', 'N2 — 0.71']));
    await golden('punching', [d]);
  });

  const steel: SteelMember[] = [
    ...cols.map((p, i) => ({ name: `P${i + 1}`, a: { ...p, z: 0 }, b: { ...p, z: 4 }, profile: 'HEB 200', role: 'column' as const })),
    { name: 'V1', a: { x: 0, y: 0, z: 4 }, b: { x: 5, y: 0, z: 4 }, profile: 'IPE 300', role: 'beam' },
    { name: 'V2', a: { x: 5, y: 0, z: 4 }, b: { x: 10, y: 0, z: 4 }, profile: 'IPE 300', role: 'beam' },
    { name: 'V3', a: { x: 0, y: 4, z: 4 }, b: { x: 10, y: 4, z: 4 }, profile: 'IPE 330', role: 'beam' },
    { name: 'D1', a: { x: 0, y: 0, z: 0 }, b: { x: 5, y: 0, z: 4 }, profile: 'L 2½', role: 'brace' },
  ];

  it('steel: framing by level and by axis, the anchor plan and a joint', async () => {
    const lv = steelLevelPlan({ name: 'N1', z: 4 }, steel, axes, 100, 'Steel N1', (v) => v.toFixed(2))!;
    expect(texts(lv.primitives)).toEqual(expect.arrayContaining(['V1 IPE 300', 'V3 IPE 330', 'P1 HEB 200']));
    const fr = steelFrameElevation('A', { x: 0, y: 0 }, { x: 1, y: 0 }, steel, 50, 'Frame A')!;
    expect(texts(fr.primitives)).toEqual(expect.arrayContaining(['D1 L 2½', 'P3 HEB 200']));
    const an = anchorPlan([{ name: 'PB1', at: { x: 0, y: 0 }, N: 350, B: 300, t: 20, anchorD: 20, kind: 'Fixed base', anchors: [{ x: -0.125, y: -0.1 }, { x: 0.125, y: -0.1 }, { x: 0.125, y: 0.1 }, { x: -0.125, y: 0.1 }] }], axes, 20, tr);
    expect(an[0]!.primitives.filter((p) => p.layer === 'ST-ANCHOR')).toHaveLength(4);
    expect(texts(an[1]!.primitives)).toContain('350×300×20');
    const plate = { kind: 'plate', center: { x: 0, y: 0, z: 0.01 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 }, size: [0.35, 0.3, 0.02] as [number, number, number] };
    const js = jointSheet({ name: 'U1', kind: 'Fixed base', at: { x: 0, y: 0, z: 0 }, members: [steel[0]!], parts: [plate], params: [['Plate', '20 mm']] }, tr);
    expect(js).toHaveLength(3);
    // The plate in plan is its 350 × 300 outline.
    const pl = js[1]!.primitives.find((p) => p.layer === 'ST-PLATE') as Extract<Primitive, { kind: 'polyline' }>;
    const xs = pl.points.map((p) => p.x), ys = pl.points.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(350, 3);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(300, 3);
    await golden('steel', [lv, fr]);
    await golden('anchors', [...an, ...js]);
  });

  it('details: hooks from the code tables, drawn with the project bar', async () => {
    const ds = constructionDetails({ bar: 16, tie: 8, cover: 25 }, tr);
    expect(ds.map((d) => d.key)).toEqual(['detail-hooks', 'detail-tie', 'detail-lap', 'detail-starters', 'detail-slab-edge', 'detail-joint']);
    // Ø16 at 90°: tail 12·db = 192, mandrel 6·db = 96.
    expect(texts(ds[0]!.primitives)).toContain('plan.detail.hookAt 90 16 96');
    expect(ds[0]!.primitives.some((p) => p.kind === 'dimension' && p.text === '192')).toBe(true);
    // A 90° hook ends heading at right angles to the run.
    const h = hookPath({ x: 0, y: 0 }, 0, 100, 50, 90, 80);
    expect(h[h.length - 1]!.x).toBeCloseTo(150, 6);
    expect(h[h.length - 1]!.y).toBeCloseTo(130, 6);
    await golden('details', ds);
  });

  it('notes: materials, covers and codes, numbered and wrapped', async () => {
    const d = generalNotes({ concrete: 'H-25', rebar: 'ADN 420', covers: { beam: 0.025, column: 0.03 }, codes: ['CIRSOC 201-2025'] }, tr);
    const t = texts(d.primitives);
    expect(t[0]).toBe('plan.notes.title');
    expect(t.some((s) => s.startsWith('1. plan.notes.concrete H-25'))).toBe(true);
    expect(t.some((s) => s.includes('plan.notes.el.beam 25 mm'))).toBe(true);
    await golden('notes', [d]);
  });

  it('a table grows a row for a figure and scales the figure into its cell', () => {
    const fig: Primitive[] = [{ kind: 'polyline', layer: 'RC-OUTLINE', closed: true, points: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 600 }, { x: 0, y: 600 }] }];
    const t = drawTable({ columns: [{ label: 'a', width: 30 }, { label: 'b', width: 40 }], rows: [['x', { figure: fig, text: 'y' }], ['z', 'w']], figureHeight: 40 });
    expect(t.height).toBe(7 + 40 + 7);
    const placed = t.primitives.filter((p) => p.layer === 'RC-OUTLINE')[0] as Extract<Primitive, { kind: 'polyline' }>;
    const h = Math.max(...placed.points.map((p) => p.y)) - Math.min(...placed.points.map((p) => p.y));
    expect(h).toBeLessThanOrEqual(40);
    expect(h).toBeGreaterThan(20);
  });
});
