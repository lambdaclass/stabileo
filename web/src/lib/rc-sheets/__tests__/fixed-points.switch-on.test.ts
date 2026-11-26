import { describe, it, expect } from 'vitest';
import { fixedSymbol, settingOut, stackKey, withFixedPoints, type FixedPointKind } from '../fixed-points';
import type { PlanColumnItem, StructurePlan } from '../structure-plan';

const rect = (x: number, y: number, b: number, h: number): Array<[number, number]> => [[x - b / 2, y - h / 2], [x + b / 2, y - h / 2], [x + b / 2, y + h / 2], [x - b / 2, y + h / 2]];
const col = (name: string, x: number, y: number, b: number, h: number): PlanColumnItem => ({ kind: 'column', key: `column:${name}`, name, status: 'ok', bars: '', at: [x, y], rotDeg: 0, b, h, outline: rect(x, y, b, h), rebars: [{ at: [x, y], dia: 16 }] });
const plan = (level: string, items: PlanColumnItem[]): StructurePlan => ({ family: 'vertical', level, items, unplaced: [], slabs: [], axes: [], bounds: { x0: 0, y0: 0, x1: 1, y1: 1 } as never });
const plans = [plan('PB', [col('C1', 2, 3, 0.6, 0.18)]), plan('1º', [col('C1', 2, 3, 0.4, 0.18)])];
const levels = ['PB', '1º'];

describe('a column stack\'s fixed point', () => {
  it('leaves every section on its axis when it is the centre', () => {
    const out = withFixedPoints(plans, levels, () => 'c');
    for (const p of out) { const c = p.items[0] as PlanColumnItem; expect(c.fixed!.shift).toBe(0); expect(c.fixed!.at).toEqual([2, 3]); }
  });

  it('keeps a face where the section shrinks above, moving the upper section off its axis by half the change', () => {
    const out = withFixedPoints(plans, levels, (k) => (k === stackKey([2, 3]) ? 'px' : 'c') as FixedPointKind);
    const low = out[0]!.items[0] as PlanColumnItem, up = out[1]!.items[0] as PlanColumnItem;
    expect(low.fixed!.at[0]).toBeCloseTo(2.3, 9);
    expect(up.fixed!.at[0]).toBeCloseTo(2.3, 9);
    expect(up.fixed!.centre[0]).toBeCloseTo(2.1, 9);
    expect(up.fixed!.shift).toBeCloseTo(0.1, 9);
    expect(Math.max(...up.outline.map((p) => p[0]))).toBeCloseTo(2.3, 9);
    expect(up.rebars[0]!.at[0]).toBeCloseTo(2.1, 9);
  });

  it('is drawn as a circle at the centre, a half circle at a face and a quarter circle at a corner, opening into the section', () => {
    const f = (kind: FixedPointKind) => ({ kind, stack: 's', at: [0, 0] as [number, number], rotDeg: 0, centre: [0, 0] as [number, number], shift: 0 });
    expect(fixedSymbol(f('c'), 0.06).kind).toBe('circle');
    const face = fixedSymbol(f('px'), 0.06) as { start: number; end: number };
    expect(face.end - face.start).toBeCloseTo(180, 9);
    expect((face.start + face.end) / 2).toBeCloseTo(180, 9);
    const corner = fixedSymbol(f('pxpy'), 0.06) as { start: number; end: number };
    expect(corner.end - corner.start).toBeCloseTo(90, 9);
  });

  it('is set out from the origin and from the nearest axes, with how far its stack moves', () => {
    const out = withFixedPoints(plans, levels, () => 'px');
    const [s] = settingOut(out, levels, [{ name: 'A', axis: 'x', at: 0 }, { name: 'B', axis: 'x', at: 2.5 }, { name: '1', axis: 'y', at: 3 }]);
    expect(s).toMatchObject({ name: 'C1', kind: 'px', axisX: { name: 'B' }, axisY: { name: '1' } });
    expect(s!.x).toBeCloseTo(2.3, 9);
    expect(s!.axisX!.d).toBeCloseTo(-0.2, 9);
    expect(s!.axisY!.d).toBeCloseTo(0, 9);
    expect(s!.shift).toBeCloseTo(0.1, 9);
  });
});

describe('the axes in the IFC', () => {
  it('are an IfcGrid of the axes each way, placed with the building and held by the lowest storey', async () => {
    const { writeIfc } = await import('../../ifc/ifc-writer');
    const { withIfcGrid } = await import('../../ifc/ifc-grid');
    const base = writeIfc({ project: { name: 'P', time: '2026-01-01T00:00:00', app: 'Stabileo' }, storeys: [{ name: 'PB', z: 0 }, { name: '1º', z: 3 }], members: [], slabs: [], walls: [], footings: [], bars: [], parts: [] });
    const out = withIfcGrid(base, [{ name: 'A', axis: 'x', at: 0 }, { name: 'B', axis: 'x', at: 5 }, { name: '1', axis: 'y', at: 0 }], { x0: -1, x1: 6, y0: -1, y1: 1 });
    expect(out.match(/IFCGRIDAXIS\(/g)).toHaveLength(3);
    expect(out).toMatch(/IFCGRID\('[^']+',\$,'Grid',\$,\$,#\d+,#\d+,\(#\d+,#\d+\),\(#\d+\),\$,\$\);/);
    const ids = [...out.matchAll(/^#(\d+)=/gm)].map((m) => Number(m[1]));
    expect(new Set(ids).size).toBe(ids.length);
    const storey = /^#(\d+)=IFCBUILDINGSTOREY\('[^']*',\$,'PB'/m.exec(out)![1];
    expect(out).toMatch(new RegExp(`IFCRELCONTAINEDINSPATIALSTRUCTURE\\('[^']+',\\$,\\$,\\$,\\(#\\d+\\),#${storey}\\);`));
    expect(out.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true);
    expect(withIfcGrid(base, [{ name: 'A', axis: 'x', at: 0 }], { x0: 0, x1: 1, y0: 0, y1: 1 })).toBe(base);
  });
});

describe('the fixed points a project keeps', () => {
  it('are those that name a kind the sheets know', async () => {
    const { fixedPointsOf } = await import('../fixed-points');
    expect(fixedPointsOf({ '1,2': 'px', '3,4': 'sideways', '5,6': 'nxny' })).toEqual({ fixedPoints: { '1,2': 'px', '5,6': 'nxny' } });
    expect(fixedPointsOf({ a: 1 })).toEqual({});
    expect(fixedPointsOf(null)).toEqual({});
  });
});
