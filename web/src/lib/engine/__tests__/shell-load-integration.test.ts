/**
 * Area loads on shells against their closed forms: the total and its moment for each direction,
 * field and extent; and the engine's own pressure vector for a uniform normal pressure.
 */
import { describe, it, expect } from 'vitest';
import { shellLoadForces, shellPointForces, type ShellPoint, type Vec3 } from '../shell-load-integration';
import { quadCornerShares } from '../solver-shells';

const P = (x: number, y: number, z = 0): ShellPoint => ({ x, y, z });
const sum = (f: Vec3[]): Vec3 => f.reduce<Vec3>((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]);
/** Moment of the corner forces about a point. */
const moment = (pts: ShellPoint[], f: Vec3[], o: Vec3 = [0, 0, 0]): Vec3 => f.reduce<Vec3>((m, F, i) => {
  const r: Vec3 = [pts[i]!.x - o[0], pts[i]!.y - o[1], (pts[i]!.z ?? 0) - o[2]];
  return [m[0] + r[1] * F[2] - r[2] * F[1], m[1] + r[2] * F[0] - r[0] * F[2], m[2] + r[0] * F[1] - r[1] * F[0]];
}, [0, 0, 0]);

const rect = [P(0, 0), P(2, 0), P(2, 3), P(0, 3)];

describe('a whole shell', () => {
  it('a downward load as before: q·A, each corner the element’s consistent share', () => {
    const r = shellLoadForces('quad', rect, { q: 4 })!;
    expect(sum(r.forces)[2]).toBeCloseTo(-24, 10);
    const shares = quadCornerShares(rect as never);
    r.forces.forEach((f, i) => expect(f[2]).toBeCloseTo(-4 * shares[i]!, 10));
    // An irregular quad: the same shares the solve always used.
    const irr = [P(0, 0), P(3, 0), P(2.5, 2), P(0.2, 1.4)];
    const s2 = quadCornerShares(irr as never);
    shellLoadForces('quad', irr, { q: 1 })!.forces.forEach((f, i) => expect(f[2]).toBeCloseTo(-s2[i]!, 10));
  });

  it('along the local z: the normal of the diagonals, as the engine’s pressure', () => {
    // Counter-clockwise seen from +Z: the local z is +Z.
    const r = shellLoadForces('quad', rect, { q: 2, frame: 'local' })!;
    expect(sum(r.forces)).toEqual([0, 0, expect.closeTo(12, 10)]);
    const cw = shellLoadForces('quad', [...rect].reverse(), { q: 2, frame: 'local' })!;
    expect(sum(cw.forces)[2]).toBeCloseTo(-12, 10);
  });

  it('a roof at 30°: per projected area the vertical total is q times the plan area', () => {
    const h = Math.tan(Math.PI / 6) * 4;
    const roof = [P(0, 0, 0), P(4, 0, h), P(4, 5, h), P(0, 5, 0)];
    const proj = shellLoadForces('quad', roof, { q: 1, frame: 'projected', dir: [0, 0, -1] })!;
    expect(sum(proj.forces)[2]).toBeCloseTo(-20, 9);
    const trueArea = shellLoadForces('quad', roof, { q: 1, frame: 'global', dir: [0, 0, -1] })!;
    expect(sum(trueArea.forces)[2]).toBeCloseTo(-20 / Math.cos(Math.PI / 6), 9);
    // Wind along X on the same roof, per projected area: the roof's projection on the YZ plane.
    const wx = shellLoadForces('quad', roof, { q: 1, frame: 'projected', dir: [1, 0, 0] })!;
    expect(sum(wx.forces)[0]).toBeCloseTo(5 * h, 9);
  });

  it('a triangle by corner: the mean value times the area, at the field’s centroid', () => {
    const tri = [P(0, 0), P(3, 0), P(0, 3)];
    const r = shellLoadForces('plate', tri, { q: 0, frame: 'global', dir: [0, 0, -1], qNodes: [0, 6, 0] })!;
    expect(sum(r.forces)[2]).toBeCloseTo(-9, 10); // area 4,5 × mean 2
    // A field rising along x: the resultant at x = 3/2 (∫x·(2x) / ∫2x over the triangle).
    const m = moment(tri, r.forces);
    expect(-m[1] / sum(r.forces)[2]).toBeCloseTo(1.5, 10);
  });
});

describe('a field with ends', () => {
  it('a hydrostatic wall: γH²/2 per metre, at a third of the height', () => {
    // A wall 2 m wide, 3 m high, in the XZ plane; water to its top pushes along +Y.
    const wall = [P(0, 0, 0), P(2, 0, 0), P(2, 0, 3), P(0, 0, 3)];
    const water = { q: 0, frame: 'global' as const, dir: [0, 1, 0] as Vec3, vary: { dir: [0, 0, 1] as Vec3, c1: 3, q1: 0, c2: 0, q2: 30 } };
    const r = shellLoadForces('quad', wall, water)!;
    expect(sum(r.forces)[1]).toBeCloseTo(10 * 9 / 2 * 2, 9);
    const m = moment(wall, r.forces);
    expect(m[0] / sum(r.forces)[1]).toBeCloseTo(-1, 9); // z̄ = H/3

    // The level at 2,5 m on two quads stacked at 1,5 m: the part above it takes nothing.
    const low = [P(0, 0, 0), P(2, 0, 0), P(2, 0, 1.5), P(0, 0, 1.5)], high = [P(0, 0, 1.5), P(2, 0, 1.5), P(2, 0, 3), P(0, 0, 3)];
    const v = { ...water, vary: { dir: [0, 0, 1] as Vec3, c1: 2.5, q1: 0, c2: 0, q2: 25 } };
    const a = shellLoadForces('quad', low, v)!, b = shellLoadForces('quad', high, v)!;
    expect(sum(a.forces)[1] + sum(b.forces)[1]).toBeCloseTo(10 * 2.5 ** 2 / 2 * 2, 9);
    expect(b.loadedArea).toBeCloseTo(2, 9);
    const mm = moment(low, a.forces)[0] + moment(high, b.forces)[0];
    expect(mm / (sum(a.forces)[1] + sum(b.forces)[1])).toBeCloseTo(-2.5 / 3, 9);
  });

  it('a trapezoid across a slab, within its range only', () => {
    const slab = [P(0, 0), P(4, 0), P(4, 2), P(0, 2)];
    const r = shellLoadForces('quad', slab, { q: 0, vary: { dir: [1, 0, 0], c1: 1, q1: 2, c2: 3, q2: 4 } })!;
    expect(sum(r.forces)[2]).toBeCloseTo(-(2 + 4) / 2 * 2 * 2, 9);
    expect(r.loadedArea).toBeCloseTo(4, 9);
  });
});

describe('a region', () => {
  const slab = [P(0, 0), P(4, 0), P(4, 4), P(0, 4)];
  const square = (x0: number, y0: number, x1: number, y1: number): Vec3[] => [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]];

  it('a partial rectangle, with an opening taken out', () => {
    const r = shellLoadForces('quad', slab, { q: 3, region: { normal: [0, 0, 1], points: square(1, 1, 3, 2) } })!;
    expect(sum(r.forces)[2]).toBeCloseTo(-6, 9);
    const m = moment(slab, r.forces);
    expect(m[0] / sum(r.forces)[2]).toBeCloseTo(1.5, 9); // ȳ
    const holed = shellLoadForces('quad', slab, { q: 3, region: { normal: [0, 0, 1], points: square(0, 0, 4, 4), holes: [square(1, 1, 2, 2)] } })!;
    expect(sum(holed.forces)[2]).toBeCloseTo(-3 * 15, 9);
    // A region beyond the shell loads the part on it; one given clockwise loads the same.
    const beyond = shellLoadForces('quad', slab, { q: 1, region: { normal: [0, 0, 1], points: square(3, 3, 6, 6).reverse() } })!;
    expect(sum(beyond.forces)[2]).toBeCloseTo(-1, 9);
  });

  it('a region over a whole irregular quad gives the whole integral', () => {
    const irr = [P(0, 0), P(3, 0), P(2.5, 2), P(0.2, 1.4)];
    const whole = shellLoadForces('quad', irr, { q: 1 })!;
    const cut = shellLoadForces('quad', irr, { q: 1, region: { normal: [0, 0, 1], points: square(-1, -1, 4, 4) } })!;
    cut.forces.forEach((f, i) => expect(f[2]).toBeCloseTo(whole.forces[i]![2], 7));
  });

  it('a non-convex region: an L', () => {
    const L: Vec3[] = [[0, 0, 0], [3, 0, 0], [3, 1, 0], [1, 1, 0], [1, 3, 0], [0, 3, 0]];
    const r = shellLoadForces('quad', slab, { q: 1, region: { normal: [0, 0, 1], points: L } })!;
    expect(sum(r.forces)[2]).toBeCloseTo(-5, 9);
  });
});

describe('a concentrated load', () => {
  it('its shape-function split keeps the force and its moment', () => {
    const slab = [P(0, 0), P(4, 0), P(4, 2), P(0, 2)];
    const f = shellPointForces('quad', slab, [1, 0.5, 0], [0, 0, -10])!;
    expect(sum(f)[2]).toBeCloseTo(-10, 12);
    const m = moment(slab, f);
    expect(m[0]).toBeCloseTo(-5, 10);
    expect(m[1]).toBeCloseTo(10, 10);
    expect(shellPointForces('quad', slab, [5, 0.5, 0], [0, 0, -10])).toBeNull();
    const tri = shellPointForces('plate', [P(0, 0), P(3, 0), P(0, 3)], [1, 1, 0], [0, 0, -3])!;
    expect(tri.map((v) => v[2])).toEqual([expect.closeTo(-1, 12), expect.closeTo(-1, 12), expect.closeTo(-1, 12)]);
  });
});
