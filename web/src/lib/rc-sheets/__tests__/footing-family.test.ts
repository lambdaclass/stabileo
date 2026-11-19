/**
 * The footing family around its rows: the demands read off the supports' reactions, the
 * overlaps flagged, the bars as the bending schedule counts them, the drawings to scale, the
 * workbook and the memoria.
 */
import { describe, it, expect } from 'vitest';
import { actionOf, footingDemands, type FootingDemandInput } from '../footing-demands';
import { footingOverlaps, rectanglesOverlap, withOverlaps } from '../footing-overlaps';
import { footingDetail } from '../footing-detail';
import { scheduleElements } from '../schedule/pieces';
import { bendingSchedule } from '../schedule/schedule';
import { footingPlans } from '../plans/footing-detail';
import { planDrawings, DEFAULT_PLAN_SCALES } from '../plans/sheets';
import { rcSheetsWorkbook } from '../workbook';
import { sheetsMemoriaElements } from '../../rc-sheets-readers/memoria';
import { rulesFor } from '../codes';
import { makeFmt } from '../format';
import type { FootingContext, FootingDemand, FootingRow } from '../footing-types';

const fmt = makeFmt('.');
const tr = (k: string, p?: Record<string, string | number>) => (p ? `${k}(${Object.values(p).join(',')})` : k);
const ctx: FootingContext = { fc: 25, fy: 420, cover: 0.055, sizing: 'full', diameters: [10, 12, 16, 20, 25], columnBars: { count: 8, dia: 16, tension: false } };
const R = rulesFor('cirsoc201-2025').bends;
const footingRow = rulesFor('cirsoc201-2025').footingRow;

const reaction = (nodeId: number, fz: number, extra: Partial<{ fx: number; fy: number; mx: number; my: number }> = {}) => ({ nodeId, fx: 0, fy: 0, fz, mx: 0, my: 0, mz: 0, ...extra });

function input(over: Partial<FootingDemandInput> = {}): FootingDemandInput {
  return {
    supportNodes: [1, 2, 3],
    nodes: new Map([[1, { x: 0, y: 0, z: 0 }], [2, { x: 5, y: 0, z: 0 }], [3, { x: 10, y: 0, z: 0 }]]),
    footings: [],
    columnAt: (n) => (n === 3 ? null : { b: 0.4, h: 0.4, name: `C${n}` }),
    soilOf: () => ({ name: 'S', allowable: 200 }),
    sets: [{ name: '1.2D+1.6L', result: { reactions: [reaction(1, 900, { mx: 12, fx: 3 }), reaction(2, 700)] } }],
    cases: [
      { type: 'D', result: { reactions: [reaction(1, 400), reaction(2, 300)] } },
      { type: 'L', result: { reactions: [reaction(1, 200), reaction(2, 150)] } },
      { type: 'W', result: { reactions: [reaction(1, 30, { my: 40 }), reaction(2, 0)] } },
    ],
    ...over,
  };
}

const row = (d: FootingDemand) => footingRow(d, ctx, undefined, fmt);

describe('the footing demands', () => {
  it('turn each support reaction round: N down, the moments and the shears acting on the footing', () => {
    expect(actionOf('k', { fx: 3, fy: -2, fz: 900, mx: 12, my: -5 })).toEqual({ combo: 'k', N: 900, Mx: -12, My: 5, Vx: -3, Vy: 2 });
  });

  it('take one footing per supported column, the gravity cases at unit factors for service, and count the lateral cases left out', () => {
    const D = footingDemands(input());
    expect(D.map((d) => d.key)).toEqual(['footing:n1', 'footing:n2']);
    expect(D[0]!.service!.N).toBe(600);
    expect(D[0]!.lateralLeftOut).toBe(1);
    expect(D[1]!.lateralLeftOut).toBe(0);
    expect(D[0]!.combos[0]).toMatchObject({ N: 900, Mx: -12, Vx: -3 });
  });

  it('read the modelled footing at its node, and a footing under several columns as a strip each of them belongs to', () => {
    const f = { id: 7, name: 'Z7', nodeId: 1, kind: 'isolated', B: 2, L: 2.4, thickness: 0.5, rotationDeg: 0, eccentricityB: 0.1, eccentricityL: 0, cover: 0.05, foundingElevation: -1.5, soilProfileId: 3 };
    const comb = { ...f, id: 8, name: 'Z8', nodeId: 2, kind: 'combined', supportedNodeIds: [3, 4] };
    const D = footingDemands(input({ supportNodes: [1, 2, 3, 4], nodes: new Map([1, 2, 3, 4].map((n) => [n, { x: 3 * n, y: 0, z: 0 }])), columnAt: (n) => ({ b: 0.4, h: 0.4, name: `C${n}` }), footings: [f, comb] }));
    expect(D.map((d) => d.name)).toEqual(['Z7', 'C2', 'C3', 'C4']);
    expect(D[0]!.footing).toMatchObject({ B: 2, L: 2.4, h: 0.5, ex: 0.1, founding: -1.5 });
    for (const d of D.slice(1)) {
      expect(d.footing!.outOfScope).toBeUndefined();
      expect(d.footing!.group).toEqual({ kind: 'strip', members: ['footing:n2', 'footing:n3', 'footing:n4'] });
      expect(d.at.x + d.footing!.ex).toBeCloseTo(6 + 0.1, 9);
    }
  });

  it('read a combined footing of two columns as one carrying its second column, its plan in global axes even turned a quarter', () => {
    const comb = { id: 8, name: 'Z8', nodeId: 2, kind: 'combined', B: 4, L: 1.5, thickness: 0.5, rotationDeg: 90, eccentricityB: 1.2, eccentricityL: 0.1, cover: 0.05, foundingElevation: -1.5, soilProfileId: 3, supportedNodeIds: [3] };
    const D = footingDemands(input({ supportNodes: [2, 3], nodes: new Map([[2, { x: 0, y: 0, z: 0 }], [3, { x: 0, y: 2.4, z: 0 }]]), columnAt: (n) => ({ b: 0.4, h: 0.4, name: `C${n}` }), footings: [comb] }));
    expect(D.map((d) => d.name)).toEqual(['Z8']);
    expect(D[0]!.carried).toMatchObject({ key: 'footing:n3', nodeId: 3, name: 'C3' });
    expect(D[0]!.footing).toMatchObject({ B: 1.5, L: 4 });
    expect(D[0]!.footing!.ex).toBeCloseTo(-0.1, 9);
    expect(D[0]!.footing!.ey).toBeCloseTo(1.2, 9);
    expect(D[0]!.footing!.outOfScope).toBeUndefined();
  });
});

describe('overlapping footings', () => {
  const [a, b] = footingDemands(input({ nodes: new Map([[1, { x: 0, y: 0, z: 0 }], [2, { x: 1.5, y: 0, z: 0 }], [3, { x: 9, y: 0, z: 0 }]]) })).map(row) as [FootingRow, FootingRow];

  it('are found by separating axes, turned or not', () => {
    const sq = (cx: number, cy: number, h: number) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ({ x: cx + u! * h, y: cy + v! * h }));
    expect(rectanglesOverlap(sq(0, 0, 1), sq(1.9, 0, 1))).toBe(true);
    expect(rectanglesOverlap(sq(0, 0, 1), sq(2.1, 0, 1))).toBe(false);
    expect(rectanglesOverlap(sq(0, 0, 1), sq(2.1, 0, 1), 0.2)).toBe(true);
    const diamond = [{ x: 2.5, y: 0 }, { x: 3.5, y: 1 }, { x: 2.5, y: 2 }, { x: 1.5, y: 1 }];
    expect(rectanglesOverlap(sq(0, 0, 1), diamond)).toBe(false);
  });

  it('fail both rows with a line naming the other', () => {
    expect(a.B + b.B).toBeGreaterThan(3);
    expect(footingOverlaps([a, b]).groups).toEqual([[a.key, b.key]]);
    const [x, y] = withOverlaps([a, b]);
    expect(x!.status).toBe('fail');
    expect(x!.verifications.at(-1)).toMatchObject({ label: 'rcSheets.v.footOverlap', demand: b.name });
    expect(y!.verifications.at(-1)!.demand).toBe(a.name);
    const far = withOverlaps([a, { ...b, demand: { ...b.demand, at: { x: 9, y: 0, z: 0 } } }]);
    expect(far.every((r) => !r.verifications.some((v) => v.label === 'rcSheets.v.footOverlap'))).toBe(true);
  });
});

describe('the footing bars', () => {
  const r = row(footingDemands(input())[0]!);
  const det = footingDetail(r, R);

  it('lay each layer as the mesh says, the second on the first, and the dowels on both', () => {
    const lower = det.layers.find((l) => l.dir === r.layers.lower)!, upper = det.layers.find((l) => l.dir !== r.layers.lower)!;
    expect(lower.z).toBeCloseTo(r.cover + lower.dia / 2000, 9);
    expect(upper.z).toBeCloseTo(r.cover + lower.dia / 1000 + upper.dia / 2000, 9);
    expect(det.dowels!.count).toBe(8);
    expect(det.dowels!.rise).toBeCloseTo(r.h - det.dowels!.z + r.dowels!.lap, 9);
  });

  it('go into the bending schedule, one mark per layer and the dowels', () => {
    const el = scheduleElements({ line: [], column: [], slab: [], wall: [], footing: [r] }, { code: 'cirsoc201-2025', slabCover: 0.02 });
    expect(el).toHaveLength(1);
    expect(el[0]!.family).toBe('footing');
    expect(el[0]!.pieces.map((p) => [p.kind, p.count])).toEqual([['footingX', det.layers[0]!.positions.length], ['footingY', det.layers[1]!.positions.length], ['dowel', 8]]);
    const s = bendingSchedule({ line: [], column: [], slab: [], wall: [], footing: [r] }, { code: 'cirsoc201-2025', slabCover: 0.02 });
    expect(s.byFamily.find((f) => f.family === 'footing')!.kg).toBeGreaterThan(0);
  });

  it('are drawn to scale in plan and section, and the export draws them as their own family', () => {
    const o = { scale: 20, fmt, tr, code: 'cirsoc201-2025' as const, group: 'F' };
    const ds = footingPlans(r, o);
    expect(ds.map((d) => d.key)).toEqual(expect.arrayContaining([`${r.key}:plan`, `${r.key}:sec`]));
    const plan = ds.find((d) => d.key.endsWith(':plan'))!;
    const bars = plan.primitives.filter((p) => /ST-ARM-INF[XY]/.test(p.layer));
    expect(bars).toHaveLength(det.layers[0]!.positions.length + det.layers[1]!.positions.length);
    const dimB = plan.primitives.find((p) => p.kind === 'dimension')!;
    expect(dimB.kind === 'dimension' && Math.abs(dimB.b.x - dimB.a.x)).toBeCloseTo(r.B * 1000, 6);
    const rows = { line: [], beam: [], column: [], slab: [], slabPlan: [], wall: [], footing: [r] };
    const sel = planDrawings(rows, { families: ['footing'], levels: null }, { format: 'A3', scales: DEFAULT_PLAN_SCALES, code: 'cirsoc201-2025', endZones: false, slabCover: 0.02, fmt, tr });
    expect(sel.drawings.some((d) => d.key === `${r.key}:sec`)).toBe(true);
    expect(planDrawings(rows, { families: ['wall'], levels: null }, { format: 'A3', scales: DEFAULT_PLAN_SCALES, code: 'cirsoc201-2025', endZones: false, slabCover: 0.02, fmt, tr }).drawings).toHaveLength(0);
  });
});

describe('the footings in the documents', () => {
  const r = row(footingDemands(input())[0]!);

  it('fill a sheet of the workbook', () => {
    const sheets = rcSheetsWorkbook({ beam: [], column: [], slab: [], wall: [], footing: [r], code: 'CIRSOC 201-2025' }, (k) => k);
    const s = sheets.find((x) => x.name === 'rcSheets.family.footing')!;
    expect(s.rows[2]![0]).toBe(r.name);
    expect(s.rows[2]![3]).toBe(Math.round(r.B * 100));
    expect(s.rows[2]![6]).toBe(Math.round(r.founding * 100) / 100);
  });

  it('are elements of the memoria with their size, bars and checks', () => {
    const el = sheetsMemoriaElements({ beam: [], line: [], column: [], slab: [], wall: [], punching: [], footing: [r] }, 'cirsoc201-2025', tr, (v) => v.toFixed(2));
    expect(el).toHaveLength(1);
    expect(el[0]).toMatchObject({ family: 'footing', name: r.name, heldBy: ['memo.rc.notAdopted'] });
    expect(el[0]!.rows.map((x) => x.titleKey)).toEqual(r.verifications.map((v) => v.label));
    expect(el[0]!.data[0]![1]).toBe(`${r.B.toFixed(2)} × ${r.L.toFixed(2)} × ${r.h.toFixed(2)} m`);
  });
});
