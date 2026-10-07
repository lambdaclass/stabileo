/**
 * A region's openings, against what the drawing shows: load where a point is inside the outline
 * and in no opening. An opening reaching past the outline used to be subtracted whole, so the
 * shell beside the zone took the part outside as an upward load; two openings over the same
 * ground were subtracted twice. And a variation between two equal coordinates is an empty range,
 * on a shell lying in it as on one crossing it.
 */
import { describe, it, expect } from 'vitest';
import { shellLoadForces, shellLoadSamples, type ShellPoint, type ShellLoadSpec, type Vec3 } from '../shell-load-integration';

const P = (x: number, y: number, z = 0): ShellPoint => ({ x, y, z });
const V = (x: number, y: number, z = 0): Vec3 => [x, y, z];
const sq = (x0: number, y0: number, x1: number, y1: number): Vec3[] => [V(x0, y0), V(x1, y0), V(x1, y1), V(x0, y1)];
const fz = (kind: 'quad' | 'plate', pts: ShellPoint[], spec: ShellLoadSpec) => shellLoadForces(kind, pts, spec)!.forces.reduce((s, f) => s + f[2], 0);
const quad = (x0: number, y0: number, x1: number, y1: number) => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];

/** The loaded share of a rectangular shell by the drawing's own rule, on a fine grid (trapezoid weights). */
function sampledArea(pts: ShellPoint[], spec: ShellLoadSpec): number {
  const n = 397;
  const s = shellLoadSamples('quad', pts, { ...spec, q: 1 }, n)!;
  const w = (k: number) => (k === 0 || k === n ? 0.5 : 1);
  let loaded = 0;
  s.samples.forEach((x, k) => { if (x.q !== 0) loaded += w(Math.floor(k / (n + 1))) * w(k % (n + 1)); });
  return loaded / (n * n);
}

describe('openings', () => {
  const region = (holes: Vec3[][]): ShellLoadSpec['region'] => ({ normal: [0, 0, 1], points: sq(0, 0, 4, 4), holes });

  it('an opening reaching past the zone takes nothing from the shell beside it', () => {
    const spec: ShellLoadSpec = { q: 5, region: region([sq(3, 1, 5, 2)]) };
    // The shell beside the zone: no load at all, and no area.
    const beside = shellLoadForces('quad', quad(4, 0, 8, 4), spec)!;
    expect(beside.loadedArea).toBeCloseTo(0, 12);
    expect(fz('quad', quad(4, 0, 8, 4), spec)).toBeCloseTo(0, 12);
    // The zone's own shell: 16 − 1 m².
    expect(shellLoadForces('quad', quad(0, 0, 4, 4), spec)!.loadedArea).toBeCloseTo(15, 10);
    expect(fz('quad', quad(0, 0, 4, 4), spec)).toBeCloseTo(-75, 9);
  });

  it('two openings over the same ground are taken out once', () => {
    const spec: ShellLoadSpec = { q: 1, region: region([sq(1, 1, 3, 3), sq(2, 2, 3, 3)]) };
    expect(shellLoadForces('quad', quad(0, 0, 4, 4), spec)!.loadedArea).toBeCloseTo(12, 10);
    expect(fz('quad', quad(0, 0, 4, 4), spec)).toBeCloseTo(-12, 9);
    // Partly overlapping, on a mesh of four shells: the union is 4 + 4 − 1 = 7 m².
    const spec2: ShellLoadSpec = { q: 1, region: region([sq(0.5, 0.5, 2.5, 2.5), sq(1.5, 1.5, 3.5, 3.5)]) };
    const mesh = [quad(0, 0, 2, 2), quad(2, 0, 4, 2), quad(2, 2, 4, 4), quad(0, 2, 2, 4)];
    expect(mesh.reduce((s, m) => s + shellLoadForces('quad', m, spec2)!.loadedArea, 0)).toBeCloseTo(16 - 7, 10);
    expect(mesh.reduce((s, m) => s + fz('quad', m, spec2), 0)).toBeCloseTo(-9, 9);
  });

  it('agrees with the drawing, a triangle and a varying field included', () => {
    const spec: ShellLoadSpec = { q: 1, region: { normal: [0, 0, 1], points: [V(0, 0), V(4, 0), V(4, 4), V(2, 2), V(0, 4)], holes: [sq(3, -1, 6, 1), sq(0.5, 0.5, 1.5, 3.5), sq(1, 1, 2, 2)] } };
    for (const m of [quad(0, 0, 4, 4), quad(2, 0, 6, 4), quad(-1, 1, 2, 3)]) {
      const r = shellLoadForces('quad', m, spec)!;
      expect(r.loadedArea / r.area).toBeCloseTo(sampledArea(m, spec), 2);
    }
    // The total over a triangle under a field linear in x: ∫ q dA over the region, by its pieces.
    const tri = [P(0, 0), P(4, 0), P(0, 4)];
    const lin: ShellLoadSpec = { q: 0, vary: { dir: [1, 0, 0], c1: 0, q1: 0, c2: 4, q2: 4 }, region: { normal: [0, 0, 1], points: sq(0, 0, 4, 4), holes: [sq(1, 0, 2, 1), sq(1.5, 0.5, 5, 0.75)] } };
    // ∫x over the triangle (32/3), less the opening's ∫x over [1,2]×[0,1] (1.5) and the rest of the
    // second opening inside the triangle and outside the first: x from 2 to 3.25 (y + x ≤ 4), y in [0.5, 0.75].
    const strip = (y: number) => { const x1 = 4 - y; return (x1 * x1 - 4) / 2; };
    const n = 2000; let rest = 0;
    for (let i = 0; i < n; i++) rest += strip(0.5 + 0.25 * (i + 0.5) / n) * 0.25 / n;
    expect(-fz('plate', tri, lin)).toBeCloseTo(32 / 3 - 1.5 - rest, 6);
  });
});

describe('a variation between two equal coordinates', () => {
  const spec: ShellLoadSpec = { q: 0, vary: { dir: [0, 0, 1], c1: 0, q1: 7, c2: 0, q2: 7 } };
  it('is an empty range: nothing on a shell lying at it, nothing on one crossing it', () => {
    const flat = shellLoadForces('quad', quad(0, 0, 2, 2), spec)!;
    expect(flat.loadedArea).toBe(0);
    expect(fz('quad', quad(0, 0, 2, 2), spec)).toBe(0);
    const wall = [P(0, 0, -1), P(2, 0, -1), P(2, 0, 1), P(0, 0, 1)];
    expect(shellLoadForces('quad', wall, spec)!.loadedArea).toBe(0);
    // And the drawing shows none.
    expect(shellLoadSamples('quad', quad(0, 0, 2, 2), spec)!.samples.every((s) => s.q === 0)).toBe(true);
  });
});
