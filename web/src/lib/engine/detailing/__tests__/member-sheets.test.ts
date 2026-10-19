import { describe, it, expect } from 'vitest';
import { buildStraightBarWithHooks } from '../../../codes/cirsoc201/bar-geometry';
import type { DetailingAssembly } from '../assembly';
import type { MemberGeometry } from '../scene-model';
import { assemblyProjection, memberElevationSheet, memberSectionSheet, preferredStation } from '../member-sheets';

// A 30 × 50 beam along Y, at x = 2, from y = 0 to y = 6, its axis at z = 3.
const Y = { x: 0, y: 1, z: 0 };
const UP = { x: 0, y: 0, z: 1 };
const bar = (id: string, x: number, z: number) => buildStraightBarWithHooks({
  id, diameterMm: 16, role: 'longitudinal',
  start: { x, y: 0.03, z }, end: { x, y: 5.97, z }, axis: Y, hookNormal: UP,
  ownerElementIds: [7], layerId: `e7:${id}`,
});
const assembly = {
  id: 'level-3.00', label: 'Nivel 3,00', elementIds: [7],
  // Two bottom and two top bars, 4 cm in from the faces.
  bars: [bar('b1', 1.89, 2.79), bar('b2', 2.11, 2.79), bar('t1', 1.89, 3.21), bar('t2', 2.11, 3.21)],
  marks: [], conflicts: [], unsupported: [], joints: [],
  provenance: { edition: '2025' },
} as unknown as DetailingAssembly;
const members: MemberGeometry[] = [{
  elementId: 7, kind: 'beam', start: { x: 2, y: 0, z: 3 }, end: { x: 2, y: 6, z: 3 }, width: 0.3, depth: 0.5,
}];
const common = {
  assembly, members, projection: assemblyProjection(assembly), clauses: [], sheetNumber: 'S1', title: 'test',
};

describe('sheets from the members\' real geometry', () => {
  it('looks along the assembly\'s own direction, so a beam along Y is drawn along its length', () => {
    expect(common.projection.right).toEqual({ x: 0, y: 1, z: 0 });
    const e = memberElevationSheet(common);
    const xs = e.polylines.flatMap((p) => p.points.map((q) => q.x));
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(5.5);
  });

  it('cuts the section with the outline and the bars in one plane, the bars inside the concrete', () => {
    const station = preferredStation(common)!;
    const s = memberSectionSheet({ ...common, station, noOutlineNote: 'none' });
    const outline = s.polylines[0]!.points;
    const xs = outline.map((p) => p.x), ys = outline.map((p) => p.y);
    // b × h of the member, not the box of the steel.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.3, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.5, 6);
    expect(s.circles).toHaveLength(4);
    for (const c of s.circles) {
      expect(c.centre.x).toBeGreaterThan(Math.min(...xs));
      expect(c.centre.x).toBeLessThan(Math.max(...xs));
      expect(c.centre.y).toBeGreaterThan(Math.min(...ys));
      expect(c.centre.y).toBeLessThan(Math.max(...ys));
    }
  });
});
