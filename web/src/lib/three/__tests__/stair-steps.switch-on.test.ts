/**
 * A flight's steps drawn over its slab: as many as it has risers, each a riser high and a tread
 * deep, sitting on the slab's top face from the foot to the head, whichever way the flight runs.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { flightSteps, createFlightStepsMesh } from '../stair-steps';

const flight = (y0: number, y1: number, z0: number, z1: number) =>
  [{ x: 2, y: y0, z: z0 }, { x: 3, y: y0, z: z0 }, { x: 3, y: y1, z: z1 }, { x: 2, y: y1, z: z1 }];

describe('a flight\'s steps', () => {
  it('climb its rise in its risers over its run, on the top face of its slab', () => {
    const s = flightSteps(flight(9.7, 12.34, 0, 1.4), 0.15, 9)!;
    expect(s.riser).toBeCloseTo(1.4 / 9, 12);
    expect(s.tread).toBeCloseTo(2.64 / 9, 12);
    expect(s.triangles.length, 'two ends, a riser and a tread a step').toBe(9 * 6 * 9);
    const zs = [], ys = [];
    for (let i = 0; i < s.triangles.length; i += 3) { ys.push(s.triangles[i + 1]!); zs.push(s.triangles[i + 2]!); }
    const cos = 2.64 / Math.hypot(2.64, 1.4);
    expect(Math.min(...zs)).toBeCloseTo(0.075 / cos, 12);
    expect(Math.max(...zs)).toBeCloseTo(1.4 + 0.075 / cos, 12);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([expect.closeTo(9.7, 12), expect.closeTo(12.34, 12)]);
  });

  it('rise the way the flight does, wherever its outline starts', () => {
    const up = flightSteps(flight(9.7, 12.34, 0, 1.4), 0.15, 9)!, down = flightSteps(flight(12.34, 9.7, 1.4, 2.8), 0.15, 9)!;
    const lowest = (t: number[]) => { let k = 2; for (let i = 2; i < t.length; i += 3) if (t[i]! < t[k]!) k = i; return t[k - 1]!; };
    expect(lowest(up.triangles)).toBeCloseTo(9.7, 12);
    expect(lowest(down.triangles)).toBeCloseTo(12.34, 12);
    expect(down.riser).toBeCloseTo(1.4 / 9, 12);
  });

  it('are none on a level slab, a wall or a flight with no risers', () => {
    expect(flightSteps(flight(0, 3, 1, 1), 0.15, 9)).toBeNull();
    expect(flightSteps([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 3 }, { x: 0, y: 0, z: 3 }], 0.15, 9)).toBeNull();
    expect(flightSteps(flight(9.7, 12.34, 0, 1.4), 0.15, 0)).toBeNull();
  });

  it('are drawn as faces and edges the viewport never picks', () => {
    const g = createFlightStepsMesh(flightSteps(flight(9.7, 12.34, 0, 1.4), 0.15, 9)!, 0xf6a560, 'solid');
    const hits: THREE.Intersection[] = [];
    const ray = new THREE.Raycaster(new THREE.Vector3(2.5, 11, 10), new THREE.Vector3(0, 0, -1));
    g.traverse((o) => o.raycast(ray, hits));
    expect(hits).toEqual([]);
    expect(g.children.map((c) => c.type)).toEqual(['Mesh', 'LineSegments']);
  });
});
