import { describe, it, expect } from 'vitest';
import { otherStructureWind } from '../wind-other';
import { velocityPressure, G_RIGID, type WindProject } from '../../../codes/cirsoc102/wind';
import { towerCf, solidSignCf, freeRoofCn } from '../../../codes/cirsoc102/other-structures';
import type { WindModel } from '../wind-cases';

const project = (kind: WindProject['structureKind']): WindProject => ({
  basicSpeed: 45, exposure: 'C', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, structureKind: kind,
  enclosure: 'open', meanRoofHeight: 9, L: 2, B: 2, roofSlopeDeg: 0, rigid: true,
});

function model(points: Array<[number, number, number]>, members: Array<[number, number]>): WindModel {
  return {
    nodes: new Map(points.map(([x, y, z], i) => [i + 1, { id: i + 1, x, y, z }])),
    elements: new Map(members.map(([a, b], i) => [i + 1, { id: i + 1, nodeI: a, nodeJ: b }])),
  };
}

describe('wind on other structures', () => {
  it('a square trussed tower: F = qz G Cf ε B Δz per level, along each direction', () => {
    const pts: Array<[number, number, number]> = [];
    for (const z of [0, 3, 6, 9]) for (const [x, y] of [[0, 0], [2, 0], [2, 2], [0, 2]]) pts.push([x, y, z]);
    const m = model(pts, [[1, 5], [5, 9], [9, 13]]);
    const p = project('latticeTowerTriangularOrRect');
    const out = otherStructureWind({ model: m, structure: { kind: 'latticeTower', section: 'square', round: false, solidity: 0.2, diagonal: true }, project: p, directions: ['+x'], tributaryWidth: 1 });
    expect(out.cases.map((c) => c.nameParams.dir)).toEqual(['+X', '45°']);
    const cf = towerCf(0.2, 'square', false);
    // Levels 3, 6, 9: bands [0, 4,5], [4,5, 7,5], [7,5, 9].
    const bands: Array<[number, number]> = [[0, 4.5], [4.5, 7.5], [7.5, 9]];
    const expected = bands.reduce((s, [a, b]) => s + Math.max(velocityPressure((a + b) / 2, p) / 1000 * G_RIGID * cf, 0.8) * 0.2 * 2 * (b - a), 0);
    const fx = out.cases[0]!.nodal.reduce((s, n) => s + n.fx, 0);
    expect(fx).toBeCloseTo(expected, 6);
  });

  it('a solid sign: F = qh G Cf As over its face, case A and the two eccentric cases B', () => {
    const pts: Array<[number, number, number]> = [];
    for (const z of [0, 3, 5]) for (const y of [0, 4]) pts.push([0, y, z]);
    const m = model(pts, [[1, 3], [3, 5], [2, 4], [4, 6]]);
    const p = project('solidSign');
    const out = otherStructureWind({ model: m, structure: { kind: 'solidSign', clearance: 3 }, project: p, directions: ['+x'], tributaryWidth: 1 });
    expect(out.cases).toHaveLength(3);
    const cf = solidSignCf(4 / 2, 2 / 5);
    const F = (velocityPressure(5, p) / 1000) * G_RIGID * cf * 4 * 2;
    for (const c of out.cases) expect(c.nodal.reduce((s, n) => s + n.fx, 0)).toBeCloseTo(F, 6);
    // B: no net force across, a moment of F · 0,2 B about the vertical.
    const b = out.cases[1]!.nodal;
    expect(b.reduce((s, n) => s + n.fy, 0)).toBeCloseTo(0, 9);
  });

  it('a pitched free roof: windward and leeward halves, normal to their slopes, cases A and B', () => {
    // Two rafters each side of a ridge along Y at x = 5, rising from +4 m to +5 m.
    const pts: Array<[number, number, number]> = [[0, 0, 4], [5, 0, 5], [10, 0, 4], [0, 6, 4], [5, 6, 5], [10, 6, 4]];
    const m = model(pts, [[1, 2], [2, 3], [4, 5], [5, 6], [2, 5]]);
    const p = project('building');
    const out = otherStructureWind({ model: m, structure: { kind: 'freeRoof', roof: 'pitched', blocked: false }, project: p, directions: ['+x'], tributaryWidth: 3 });
    expect(out.cases.map((c) => c.nameParams.c)).toEqual(['A', 'B']);
    const theta = (Math.atan(1 / 5) * 180) / Math.PI;
    const k = freeRoofCn('pitched', theta, 'A', false);
    const a = out.cases[0]!.distributed;
    const windward = a.find((d) => d.elementId === 1)!;   // x 0–5, the windward half for +X
    const q = (velocityPressure(4.5, p) / 1000) * G_RIGID * k.cnw * 3;
    expect(Math.hypot(windward.qX, windward.qZ)).toBeCloseTo(Math.abs(q), 6);
    // Positive CN pushes toward the top surface: down, and on the slope facing the wind, along it.
    if (k.cnw > 0) expect(windward.qZ).toBeLessThan(0);
  });
});
