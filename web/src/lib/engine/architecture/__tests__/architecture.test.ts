/**
 * Architecture by hand: a brick wall with plaster (U by resistances in series, surface mass,
 * weight) against the project's limits; plan geometry; the geometry check; a point cloud slice;
 * a wall read from an IFC outline.
 */
import { describe, expect, it } from 'vitest';
import { checkGeometry, cloudSlice, constructionProps, constructionRows, pointInPolygon, polygonArea, polygonPerimeter, wallFromOutline, type ArchWall, type Construction, type Room } from '../architecture';

const brick: Construction = { id: 'c', name: 'Ladrillo 18 + revoque', kind: 'wall', rsi: 0.13, rse: 0.04, uMax: 1.8, massMin: 300, rwRequired: 45,
  layers: [{ name: 'ladrillo', thickness: 0.18, lambda: 0.81, density: 1600 }, { name: 'revoque', thickness: 0.02, lambda: 0.93, density: 1900 }] };

describe('constructions', () => {
  it('U by resistances in series, mass and weight, by hand', () => {
    const p = constructionProps(brick);
    expect(p.thickness).toBeCloseTo(0.2, 12);
    expect(p.r).toBeCloseTo(0.13 + 0.18 / 0.81 + 0.02 / 0.93 + 0.04, 12);
    expect(p.u).toBeCloseTo(1 / (0.13 + 0.18 / 0.81 + 0.02 / 0.93 + 0.04), 12);
    expect(p.mass).toBeCloseTo(288 + 38, 9);
    expect(p.weight).toBeCloseTo(326 * 9.81 / 1000, 9);
  });

  it('against the project\'s limits: U exceeds, mass within, Rw without its test value', () => {
    const rows = constructionRows(brick);
    expect(rows.map((r) => [r.titleKey, r.status])).toEqual([['check.arch.thermal', 'fail'], ['check.arch.mass', 'ok'], ['check.arch.acoustic', 'notVerified']]);
    expect(constructionRows({ ...brick, rw: 48 })[2]!.status).toBe('ok');
  });
});

describe('plan geometry and its check', () => {
  const sq = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
  it('area, perimeter, inside', () => {
    expect(polygonArea(sq)).toBe(12);
    expect(polygonPerimeter(sq)).toBe(14);
    expect(pointInPolygon({ x: 2, y: 1 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 1 }, sq)).toBe(false);
  });
  it('finds overlaps, gaps, walls of no length, crossed outlines and overlapping rooms', () => {
    const w = (id: string, a: [number, number], b: [number, number]): ArchWall => ({ id, name: id, levelId: 'N1', z: 3, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, height: 2.8, constructionId: 'c' });
    const walls = [w('A', [0, 0], [4, 0]), w('B', [3, 0], [6, 0]), w('C', [4.03, 0.5], [4.03, 3]), w('D', [1, 1], [1, 1])];
    const room = (id: string, pts: Array<[number, number]>): Room => ({ id, name: id, levelId: 'N1', z: 3, outline: pts.map(([x, y]) => ({ x, y })), height: 2.8 });
    const issues = checkGeometry(walls, [room('R1', [[0, 0], [4, 0], [4, 3], [0, 3]]), room('R2', [[3, 1], [6, 1], [6, 2], [3, 2]]), room('X', [[0, 0], [2, 2], [2, 0], [0, 2]])]);
    const kinds = issues.map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['zeroWall', 'overlap', 'selfCrossing', 'roomOverlap']));
    expect(issues.find((i) => i.kind === 'overlap')!.ids).toEqual(['A', 'B']);
    expect(checkGeometry([w('E', [0, 0], [4, 0]), w('F', [4.03, 0], [4.03, 3])], []).some((i) => i.kind === 'gap')).toBe(true);
  });
});

describe('point clouds and IFC walls', () => {
  it('slices a cloud at a height, one point per cell', () => {
    const s = cloudSlice('0 0 1.0\n0.001 0 1.01\n1 0 1.04\n2 0 1.2\nbad\n3;0;0.99;255;0;0', 1, 0.05, 0.02);
    expect(s.read).toBe(5);
    expect(s.kept).toBe(3);
    expect(s.segments.length).toBe(3 * 8);
  });
  it('a wall from its outline: bottom edge, height', () => {
    const g = wallFromOutline([{ x: 0, y: 2, z: 0 }, { x: 4, y: 2, z: 0 }, { x: 4, y: 2, z: 2.8 }, { x: 0, y: 2, z: 2.8 }])!;
    expect(g.height).toBeCloseTo(2.8, 12);
    expect(Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y)).toBeCloseTo(4, 12);
  });
});
