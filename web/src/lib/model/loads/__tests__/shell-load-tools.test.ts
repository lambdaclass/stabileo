/**
 * The shell tools and edits: a tank's fluid pushes every wall and the bottom outward with γH²/2 and
 * γH·A; a concentrated force keeps its resultant; a mirrored or rotated copy carries the field and
 * the region; scaling scales every value.
 */
import { describe, it, expect } from 'vitest';
import { hydrostaticSurfaceLoads, shellPointNodalLoads, type ShellRef } from '../shell-load-tools';
import { shellLoadForces, type Vec3 } from '../../../engine/shell-load-integration';
import { carrySurface } from '../member-load-carry';
import { scaledLoad } from '../load-magnitudes';
import { rotation, reflection, translation, compose } from '../../edit/affine';
import type { SurfaceLoad3D } from '../../../store/model.svelte';

/** A 4 × 2 m tank, 3 m deep: four walls and a bottom, nodes in no particular winding. */
function tank(): ShellRef[] {
  const P = (x: number, y: number, z: number) => ({ x, y, z });
  const sh = (id: number, pts: ReturnType<typeof P>[]): ShellRef => ({ id, pts, nodes: pts.map((_, i) => id * 10 + i) });
  return [
    sh(1, [P(0, 0, 0), P(4, 0, 0), P(4, 0, 3), P(0, 0, 3)]),
    sh(2, [P(4, 0, 0), P(4, 2, 0), P(4, 2, 3), P(4, 0, 3)]),
    sh(3, [P(4, 2, 0), P(0, 2, 0), P(0, 2, 3), P(4, 2, 3)].reverse()),
    sh(4, [P(0, 2, 0), P(0, 0, 0), P(0, 0, 3), P(0, 2, 3)]),
    sh(5, [P(0, 0, 0), P(4, 0, 0), P(4, 2, 0), P(0, 2, 0)]),
  ];
}
const total = (s: ShellRef, l: Omit<SurfaceLoad3D, 'id' | 'caseId'>): Vec3 =>
  shellLoadForces(s.on ?? 'quad', s.pts, l)!.forces.reduce<Vec3>((a, f) => [a[0] + f[0], a[1] + f[1], a[2] + f[2]], [0, 0, 0]);

describe('a tank of water', () => {
  it('every wall pushed outward with γH²/2 per metre, the bottom down with γH·A', () => {
    const shells = tank();
    const loads = hydrostaticSurfaceLoads(shells, 10, 3);
    expect(loads).toHaveLength(5);
    const F = loads.map((l, i) => total(shells[i]!, l));
    expect(F[0]![1]).toBeCloseTo(-10 * 9 / 2 * 4, 9); // y = 0 wall: toward −y
    expect(F[1]![0]).toBeCloseTo(10 * 9 / 2 * 2, 9);  // x = 4 wall: toward +x
    expect(F[2]![1]).toBeCloseTo(10 * 9 / 2 * 4, 9);  // y = 2 wall, reversed winding: still outward
    expect(F[3]![0]).toBeCloseTo(-10 * 9 / 2 * 2, 9);
    expect(F[4]![2]).toBeCloseTo(-10 * 3 * 8, 9);     // the bottom
    // Half full: nothing above 1,5 m.
    const half = hydrostaticSurfaceLoads(shells, 10, 1.5);
    expect(total(shells[0]!, half[0]!)[1]).toBeCloseTo(-10 * 1.5 ** 2 / 2 * 4, 9);
  });
});

describe('a force on a slab', () => {
  it('on the shell under the point, its resultant kept', () => {
    const slab: ShellRef = { id: 7, pts: [{ x: 0, y: 0, z: 3 }, { x: 4, y: 0, z: 3 }, { x: 4, y: 4, z: 3 }, { x: 0, y: 4, z: 3 }], nodes: [1, 2, 3, 4] };
    const n = shellPointNodalLoads([slab], [1, 3, 3], [0, 0, -20])!;
    expect(n.reduce((s, x) => s + x.fz, 0)).toBeCloseTo(-20, 12);
    expect(n.reduce((s, x, i) => s + x.fz * slab.pts[i]!.x, 0)).toBeCloseTo(-20, 12);
    expect(shellPointNodalLoads([slab], [1, 3, 5], [0, 0, -20])).toBeNull(); // off its plane
  });
});

describe('edits', () => {
  const slab = [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 2, z: 0 }, { x: 0, y: 2, z: 0 }];
  const load: SurfaceLoad3D = {
    id: 1, quadId: 1, q: 0, frame: 'global', dir: [1, 0, 0],
    vary: { dir: [1, 0, 0], c1: 1, q1: 2, c2: 3, q2: 4 },
    region: { normal: [0, 0, 1], points: [[1, 0, 0], [3, 0, 0], [3, 1, 0], [1, 1, 0]] },
  };
  const F = (pts: typeof slab, l: SurfaceLoad3D) => shellLoadForces('quad', pts, l)!.forces.reduce<Vec3>((a, f) => [a[0] + f[0], a[1] + f[1], a[2] + f[2]], [0, 0, 0]);

  it('a copy turned 90° about Z and moved carries the field, the region and the direction', () => {
    const T = compose(translation([10, 5, 0]), rotation([0, 0, 0], [0, 0, 1], 90));
    const moved = slab.map((p) => { const x = T.A[0] * p.x + T.A[1] * p.y + T.t[0], y = T.A[3] * p.x + T.A[4] * p.y + T.t[1]; return { x, y, z: 0 }; });
    const before = F(slab, load), after = F(moved, carrySurface(load, T, false, 'quad'));
    expect(after[1]).toBeCloseTo(before[0], 9);
    expect(after[0]).toBeCloseTo(0, 9);
  });

  it('a mirror reverses the corner values with the corners', () => {
    const T = reflection([0, 0, 0], [1, 0, 0]);
    const c = carrySurface({ id: 1, quadId: 1, q: 0, qNodes: [1, 2, 3, 4] }, T, true, 'quad');
    expect(c.qNodes).toEqual([1, 4, 3, 2]);
  });

  it('scaling scales q, the corner values and the variation', () => {
    const s = scaledLoad({ type: 'surface3d', data: { ...load, qNodes: [1, 2, 3, 4] } }, 2).data as SurfaceLoad3D;
    expect(s.qNodes).toEqual([2, 4, 6, 8]);
    expect([s.vary!.q1, s.vary!.q2]).toEqual([4, 8]);
    expect(s.vary!.c1).toBe(1);
  });
});
