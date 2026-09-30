/**
 * A uniform load on a quad reaches its corners as the element's consistent loads, ∫ Nᵢ dA.
 *
 * A quarter of the area to each corner is right only for a parallelogram. On any other quad it
 * puts the resultant at the average of the corners instead of at the area's centroid, which moves
 * the moment of every slab pressure and of every shell's self-weight on an irregular mesh.
 */
import { describe, it, expect } from 'vitest';
import { quadCornerShares, convertSurfaceLoad, quadSelfWeightLoads } from '../solver-shells';

const n = (id: number, x: number, y: number, z = 0) => ({ id, x, y, z });

describe('a uniform load on a quad', () => {
  it('splits a rectangle in four equal shares', () => {
    const s = quadCornerShares([n(1, 0, 0), n(2, 4, 0), n(3, 4, 2), n(4, 0, 2)] as never);
    for (const x of s) expect(x).toBeCloseTo(2, 12);
  });

  it('puts the resultant of a trapezoid at its centroid, and adds up to its area', () => {
    // Bottom 6, top 2, height 3: area 12; centroid height h(b + 2a)/(3(a + b)) = 3·10/24 = 1.25.
    const ps = [n(1, 0, 0), n(2, 6, 0), n(3, 4, 3), n(4, 2, 3)] as const;
    const s = quadCornerShares(ps as never);
    const A = s.reduce((a, b) => a + b, 0);
    expect(A).toBeCloseTo(12, 12);
    const yc = s.reduce((acc, w, i) => acc + w * ps[i]!.y, 0) / A;
    const xc = s.reduce((acc, w, i) => acc + w * ps[i]!.x, 0) / A;
    expect(yc).toBeCloseTo(1.25, 12);
    expect(xc).toBeCloseTo(3, 12);
    // The average of the corners would say 1.5.
    expect((0 + 0 + 3 + 3) / 4).toBe(1.5);
  });

  it('is what the surface load and the self-weight hand the engine', () => {
    const nodes = new Map([n(1, 0, 0), n(2, 6, 0), n(3, 4, 3), n(4, 2, 3)].map((p) => [p.id, p]));
    const quads = new Map([[1, { id: 1, nodes: [1, 2, 3, 4] as [number, number, number, number], materialId: 1, thickness: 0.2 }]]);
    const s = quadCornerShares([...nodes.values()] as never);
    const surf = convertSurfaceLoad({ id: 1, quadId: 1, q: 5 } as never, quads, nodes as never);
    surf.forEach((l, i) => expect((l.data as { fz: number }).fz).toBeCloseTo(-5 * s[i]!, 12));
    const sw = quadSelfWeightLoads(quads, nodes as never, new Map([[1, { id: 1, name: 'c', e: 30000, nu: 0.2, rho: 25 }]]) as never);
    sw.forEach((l, i) => expect((l.data as { fz: number }).fz).toBeCloseTo(-25 * 0.2 * s[i]!, 12));
  });
});
