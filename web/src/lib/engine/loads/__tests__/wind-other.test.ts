import { describe, it, expect } from 'vitest';
import { otherStructureWind } from '../wind-other';
import { velocityPressure, G_RIGID, type WindProject } from '../../../codes/cirsoc102/wind';
import { towerCf, solidSignCf, freeRoofCn, chimneyCf } from '../../../codes/cirsoc102/other-structures';
import type { OtherWindCase } from '../wind-other';
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
    const m = model(pts, Array.from({ length: 4 }, (_, i) => [[1 + i, 5 + i], [5 + i, 9 + i], [9 + i, 13 + i]] as Array<[number, number]>).flat());
    const p = project('latticeTowerTriangularOrRect');
    const out = otherStructureWind({ model: m, structure: { kind: 'latticeTower', section: 'square', round: false, solidity: 0.2, diagonal: true }, project: p, directions: ['+x'], tributaryWidth: 1 });
    // Only +x asked: the one diagonal beside it, toward +y (no sense asked on y).
    expect(out.cases.filter(c => c.nameKey === 'wind.other.case').map((c) => c.nameParams.dir)).toEqual(['+X', '+X+Y']);
    const cf = towerCf(0.2, 'square', false);
    const expected = referenceIntegral(9, z => (velocityPressure(z, p) / 1000 * G_RIGID * cf) * 0.2 * 2);
    const fx = force(out.cases[0]!, 'x');
    expect(fx).toBeCloseTo(expected, 6);
  });

  it('a solid sign: F = qh G Cf As over its face, case A and the two eccentric cases B', () => {
    const pts: Array<[number, number, number]> = [];
    for (const z of [0, 3, 5]) for (const y of [0, 4]) pts.push([0, y, z]);
    const m = model(pts, [[1, 3], [3, 5], [2, 4], [4, 6]]);
    const p = project('solidSign');
    const out = otherStructureWind({ model: m, structure: { kind: 'solidSign', clearance: 3 }, project: p, directions: ['+x'], tributaryWidth: 1 });
    expect(out.cases).toHaveLength(6);
    const cf = solidSignCf(4 / 2, 2 / 5);
    const F = (velocityPressure(5, p) / 1000) * G_RIGID * cf * 4 * 2;
    for (const c of out.cases.filter(c => c.nameKey === 'wind.other.signCase')) expect(force(c, 'x')).toBeCloseTo(F, 6);
    expect(force(out.cases.find(c => c.nameKey === 'wind.other.minimumOtherCase')!, 'x')).toBeCloseTo(0.8 * 4 * 2, 6);
    // B: no net force across, a moment of F · 0,2 B about the vertical.
    expect(force(out.cases[1]!, 'y')).toBeCloseTo(0, 9);
  });

  it('a pitched free roof: windward and leeward halves, normal to their slopes, cases A and B', () => {
    // Two rafters each side of a ridge along Y at x = 5, rising from +4 m to +5 m.
    const pts: Array<[number, number, number]> = [[0, 0, 4], [5, 0, 5], [10, 0, 4], [0, 6, 4], [5, 6, 5], [10, 6, 4]];
    const m = model(pts, [[1, 2], [2, 3], [4, 5], [5, 6], [2, 5]]);
    const p = project('building');
    const out = otherStructureWind({ model: m, structure: { kind: 'freeRoof', roof: 'pitched', blocked: false }, project: p, directions: ['+x'], tributaryWidth: 3 });
    expect(out.cases.map((c) => c.nameParams.c ?? c.nameKey)).toEqual(['A', 'B', 'wind.other.minimumCase']);
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

describe('wind on other structures: a monoslope free roof, and stick models', () => {
  // Rafters rise along +X from z = 4 at x = 0 to z = 6 at x = 8; two frames 6 m apart.
  const mono = () => model(
    [[0, 0, 4], [4, 0, 5], [8, 0, 6], [0, 6, 4], [4, 6, 5], [8, 6, 6]],
    [[1, 2], [2, 3], [4, 5], [5, 6], [3, 6], [1, 4]],
  );
  const theta = (Math.atan(2 / 8) * 180) / Math.PI;

  it('Figura 2.4-4: wind from the low edge is γ = 180° (on the top face), from the high edge γ = 0°', () => {
    const p = project('building');
    for (const [dir, upslope] of [['+x', true], ['-x', false]] as const) {
      const out = otherStructureWind({ model: mono(), structure: { kind: 'freeRoof', roof: 'monoslope', blocked: false }, project: p, directions: [dir], tributaryWidth: 3 });
      for (const c of ['A', 'B'] as const) {
        const k = freeRoofCn('monoslope', theta, c, false, upslope);
        const loads = out.cases.find((x) => x.nameParams.c === c)!.distributed;
        // Element 1 is the half at x 0–4, element 2 the one at x 4–8: windward for +X, leeward for −X.
        const [w, l] = dir === '+x' ? [1, 2] : [2, 1];
        const q = (velocityPressure(5, p) / 1000) * G_RIGID * 3;
        for (const [id, cn] of [[w, k.cnw], [l, k.cnl]] as const) {
          const d = loads.find((x) => x.elementId === id)!;
          expect(Math.hypot(d.qX, d.qZ)).toBeCloseTo(Math.abs(q * cn), 6);
          // Positive CN pushes toward the top surface, down.
          expect(Math.sign(d.qZ)).toBe(-Math.sign(cn));
        }
        // The net horizontal force goes downwind either way.
        const fx = loads.filter((d) => d.elementId <= 4).reduce((t, d) => t + d.qX * Math.hypot(4, 1), 0);
        expect(Math.sign(fx)).toBe(dir === '+x' ? 1 : -1);
      }
      if (upslope) expect(freeRoofCn('monoslope', theta, 'A', false, true).cnw).toBeGreaterThan(0);
    }
  });

  it('a chimney modelled as a stick takes the D given, and without one is refused, not given 1 m', () => {
    const m = model([[0, 0, 0], [0, 0, 10], [0, 0, 20]], [[1, 2], [2, 3]]);
    const p = project('chimneyRound');
    const none = otherStructureWind({ model: m, structure: { kind: 'chimney', section: 'roundRough' }, project: p, directions: ['+x'], tributaryWidth: 1 });
    expect(none.cases).toHaveLength(0);
    expect(none.notes.map((n) => n.key)).toEqual(['wind.other.noDiameter']);
    const out = otherStructureWind({ model: m, structure: { kind: 'chimney', section: 'roundRough', diameter: 3 }, project: p, directions: ['+x'], tributaryWidth: 1 });
    const expected = referenceIntegral(20, z => {
      const q = velocityPressure(z, p) / 1000;
      return (q * G_RIGID * chimneyCf('roundRough', 20 / 3, 3 * Math.sqrt(q * 1000))) * 3;
    });
    expect(force(out.cases[0]!, 'x')).toBeCloseTo(expected, 6);
  });

  it('a lattice tower modelled as a stick takes the face width given', () => {
    const m = model([[0, 0, 0], [0, 0, 6], [0, 0, 12]], [[1, 2], [2, 3]]);
    const p = project('latticeTowerTriangularOrRect');
    const tower = { kind: 'latticeTower' as const, section: 'square' as const, round: false, solidity: 0.2, diagonal: false };
    const none = otherStructureWind({ model: m, structure: tower, project: p, directions: ['+x'], tributaryWidth: 1 });
    expect(none.cases).toHaveLength(0);
    expect(none.notes.map((n) => n.key)).toEqual(['wind.other.noWidth']);
    const out = otherStructureWind({ model: m, structure: { ...tower, width: 2 }, project: p, directions: ['+x'], tributaryWidth: 1 });
    const cf = towerCf(0.2, 'square', false);
    const expected = referenceIntegral(12, z => (velocityPressure(z, p) / 1000 * G_RIGID * cf) * 0.2 * 2);
    expect(force(out.cases[0]!, 'x')).toBeCloseTo(expected, 6);
  });
});

describe('wind on other structures: diagonals, the projected width, and a flexible structure', () => {
  const tower = () => {
    const pts: Array<[number, number, number]> = [];
    for (const z of [0, 3, 6, 9]) for (const [x, y] of [[0, 0], [2, 0], [2, 2], [0, 2]]) pts.push([x, y, z]);
    return model(pts, Array.from({ length: 4 }, (_, i) => [[1 + i, 5 + i], [5 + i, 9 + i], [9 + i, 13 + i]] as Array<[number, number]>).flat());
  };

  it('a square tower on its diagonals: all four when ±x and ±y are asked, each pushing its own way', () => {
    const p = project('latticeTowerTriangularOrRect');
    const out = otherStructureWind({
      model: tower(), structure: { kind: 'latticeTower', section: 'square', round: false, solidity: 0.2, diagonal: true },
      project: p, directions: ['+x', '-x', '+y', '-y'], tributaryWidth: 1,
    });
    const diag = out.cases.filter((c) => c.nameKey === 'wind.other.case' && String(c.nameParams.dir).length === 4);
    expect(diag.map((c) => c.nameParams.dir)).toEqual(['+X+Y', '+X-Y', '-X+Y', '-X-Y']);
    const along = force(out.cases.find((c) => c.nameParams.dir === '+X')!, 'x');
    for (const c of diag) {
      const [sx, sy] = [String(c.nameParams.dir)[0] === '+' ? 1 : -1, String(c.nameParams.dir)[2] === '+' ? 1 : -1];
      const fx = force(c, 'x'), fy = force(c, 'y');
      expect(Math.sign(fx)).toBe(sx);
      expect(Math.sign(fy)).toBe(sy);
      expect(Math.abs(fx)).toBeCloseTo(Math.abs(fy), 9);
      // The diagonal's force is the face's, times the factor of note 4, along the diagonal.
      expect(Math.hypot(fx, fy)).toBeGreaterThan(along * 0.99);
    }
  });

  it('a square chimney on its diagonal, as a stick: Af is the projected width D√2, h/D still on the side D', () => {
    const m = model([[0, 0, 0], [0, 0, 10], [0, 0, 20]], [[1, 2], [2, 3]]);
    const p = project('chimneySquare');
    const out = otherStructureWind({ model: m, structure: { kind: 'chimney', section: 'squareDiagonal', diameter: 2 }, project: p, directions: ['+x'], tributaryWidth: 1 });
    const expected = referenceIntegral(20, z => {
      const q = velocityPressure(z, p) / 1000;
      return (q * G_RIGID * chimneyCf('squareDiagonal', 20 / 2, 2 * Math.sqrt(q * 1000))) * 2 * Math.SQRT2;
    });
    expect(force(out.cases[0]!, 'x')).toBeCloseTo(expected, 6);
  });

  it('a flexible structure says G = 0,85 of a rigid one was used, since G_f is not implemented', () => {
    const m = model([[0, 0, 0], [0, 0, 10], [0, 0, 20]], [[1, 2], [2, 3]]);
    const rigid = otherStructureWind({ model: m, structure: { kind: 'chimney', section: 'roundRough', diameter: 3 }, project: project('chimneyRound'), directions: ['+x'], tributaryWidth: 1 });
    expect(rigid.notes.map((n) => n.key)).not.toContain('wind.other.flexibleAssumedRigid');
    const flexible = otherStructureWind({ model: m, structure: { kind: 'chimney', section: 'roundRough', diameter: 3 }, project: { ...project('chimneyRound'), rigid: false }, directions: ['+x'], tributaryWidth: 1 });
    expect(flexible.notes.map((n) => n.key)).toContain('wind.other.flexibleAssumedRigid');
  });
});

describe('§2.1.5: the minimum wind force on an open building, for a free roof', () => {
  // A pitched free roof on four columns from the ground: ridge along Y at x = 5, eaves +4 m, ridge +5 m.
  const shed = () => model(
    [[0, 0, 4], [5, 0, 5], [10, 0, 4], [0, 6, 4], [5, 6, 5], [10, 6, 4], [0, 0, 0], [10, 0, 0], [0, 6, 0], [10, 6, 0]],
    [[1, 2], [2, 3], [4, 5], [5, 6], [2, 5], [7, 1], [8, 3], [9, 4], [10, 6]],
  );
  const low = (): WindProject => ({ ...project('building'), basicSpeed: 20 });
  const fx = (c: OtherWindCase) => force(c, 'x');

  it('is a horizontal case of its own per direction, 0,75 kN/m² over the whole vertical projection by default', () => {
    const out = otherStructureWind({ model: shed(), structure: { kind: 'freeRoof', roof: 'pitched', blocked: false }, project: low(), directions: ['+x', '-x', '+y'], tributaryWidth: 3 });
    const min = out.cases.filter((c) => c.nameKey === 'wind.other.minimumCase');
    expect(min.map((c) => c.nameParams.dir)).toEqual(['+X', '-X', '+Y']);
    // Wind along X sees 5 m (ground to ridge) × 6 m; along Y, 5 m × 10 m.
    expect(fx(min[0]!)).toBeCloseTo(0.75 * 5 * 6, 9);
    expect(fx(min[1]!)).toBeCloseTo(-0.75 * 5 * 6, 9);
    expect(force(min[2]!, 'y')).toBeCloseTo(0.75 * 5 * 10, 9);
    expect(min[0]!.nodal).toEqual([]);
    expect(new Set(min[0]!.distributed.map(d => d.elementId))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(out.derivation.filter((m) => m.key === 'wind.other.minimumOpenEnvelope')).toHaveLength(3);
  });

  it('at a low basic speed it exceeds the horizontal force of the figures, which applied nothing more', () => {
    const out = otherStructureWind({ model: shed(), structure: { kind: 'freeRoof', roof: 'pitched', blocked: false }, project: low(), directions: ['+x'], tributaryWidth: 3 });
    const rafter = Math.hypot(5, 1);
    for (const c of out.cases.filter((x) => x.nameKey === 'wind.other.freeRoofCase')) {
      const h = Math.abs(c.distributed.reduce((t, d) => t + d.qX * rafter, 0));
      expect(h).toBeLessThan(0.75 * 5 * 6);
    }
  });

  it('takes the Af given per axis, and the projection on the axis given none', () => {
    const out = otherStructureWind({ model: shed(), structure: { kind: 'freeRoof', roof: 'pitched', blocked: false, area: { x: 8 } }, project: low(), directions: ['+x', '+y'], tributaryWidth: 3 });
    const min = out.cases.filter((c) => c.nameKey === 'wind.other.minimumCase');
    expect(fx(min[0]!)).toBeCloseTo(0.75 * 8, 9);
    expect(force(min[1]!, 'y')).toBeCloseTo(0.75 * 50, 9);
    expect(out.derivation.map((m) => m.key).filter((k) => k.startsWith('wind.other.minimumOpen'))).toEqual(['wind.other.minimumOpen', 'wind.other.minimumOpenEnvelope']);
  });

  it('a frame modelled in one plane takes the tributary width across a wind along it (Codex review)', () => {
    // One frame in the XZ plane: every node at y = 0.
    const frame = model([[0, 0, 4], [5, 0, 5], [10, 0, 4], [0, 0, 0], [10, 0, 0]], [[1, 2], [2, 3], [4, 1], [5, 3]]);
    const out = otherStructureWind({ model: frame, structure: { kind: 'freeRoof', roof: 'pitched', blocked: false }, project: low(), directions: ['+x'], tributaryWidth: 3 });
    const min = out.cases.filter((c) => c.nameKey === 'wind.other.minimumCase');
    expect(min).toHaveLength(1);
    expect(fx(min[0]!)).toBeCloseTo(0.75 * 5 * 3, 9);
  });
});

function referenceIntegral(h: number, density: (z: number) => number) {
  const cuts = [0, Math.min(5, h), h];
  let sum = 0;
  for (let j = 1; j < cuts.length; j++) {
    const a = cuts[j - 1]!, b = cuts[j]!, n = 8192, dz = (b - a) / n;
    let v = density(a) + density(b);
    for (let k = 1; k < n; k++) v += (k % 2 ? 4 : 2) * density(a + k * dz);
    sum += v * dz / 3;
  }
  return sum;
}

function force(c: OtherWindCase, axis: 'x' | 'y') {
  return c.nodal.reduce((sum, p) => sum + (axis === 'x' ? p.fx : p.fy), 0) + c.distributed.reduce((sum, p) => sum + (axis === 'x' ? (p.qX + (p.qXJ ?? p.qX)) : (p.qY + (p.qYJ ?? p.qY))) * (p.b - p.a) / 2, 0);
}
