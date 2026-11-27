import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { updateGrid } from '../grid';
import { buildUnderlays } from '../../three/underlay-3d';
import { planClipZ } from '../plan-cut';
import type { Underlay } from '../../model/underlay';

const lines = (o: THREE.Object3D) => {
  const out: THREE.LineSegments[] = [];
  o.traverse((c) => { if (c instanceof THREE.LineSegments) out.push(c); });
  return out;
};

describe('a background drawing over the grid of its level', () => {
  const scene = new THREE.Scene();
  const grid = updateGrid(scene, null, true, 1, 50, 'XY', 0, { u: 0, v: 0, span: 30 })!;
  const underlay = { id: 'u', name: 'plan', z: 0, visible: true, opacity: 0.9, segments: [0, 0, 5, 0, 5, 0, 5, 5], dx: 0, dy: 0, rotationDeg: 0, scale: 1 } as unknown as Underlay;
  const drawing = buildUnderlays([underlay], 0)!;

  it('is not hidden where its lines lie on the grid lines: no grid line writes depth', () => {
    const g = lines(grid);
    expect(g.length).toBeGreaterThan(1);
    for (const l of g) expect((l.material as THREE.Material).depthWrite).toBe(false);
  });

  it('is drawn after every grid line, so where they coincide the drawing shows', () => {
    const top = Math.max(...lines(grid).map((l) => l.renderOrder));
    for (const l of lines(drawing)) expect(l.renderOrder).toBeGreaterThan(top);
  });

  it('is not cut by a plan cut on its own level', () => {
    expect(planClipZ(0)).toBeGreaterThan(0);
    expect(planClipZ(3) - 3).toBeLessThan(0.01);
  });
});
