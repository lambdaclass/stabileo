/*
 * A raft's whole behaviour is its deflection, and the deformed shape drew
 * nothing on one.
 *
 * `createDeformedLines` walks `elements` — members — so a model made the
 * correct way, plates with a thickness and no bars, answered the deformation
 * slider with an empty screen. The report was "the deformed shape does not
 * work on plates"; it was never asked to.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createDeformedShells } from '../deformed-shape-3d';

const NODES = new Map<number, any>([
  [1, { id: 1, x: 0, y: 0, z: 0 }],
  [2, { id: 2, x: 4, y: 0, z: 0 }],
  [3, { id: 3, x: 4, y: 4, z: 0 }],
  [4, { id: 4, x: 0, y: 4, z: 0 }],
]);
const QUADS = new Map<number, any>([[1, { id: 1, nodes: [1, 2, 3, 4] }]]);
const NONE = new Map<number, any>();

/** Every point the group draws, flattened. */
function points(g: THREE.Object3D): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  g.traverse((c) => {
    const geo = (c as THREE.Line).geometry as THREE.BufferGeometry | undefined;
    if (!geo?.getAttribute) return;
    const pos = geo.getAttribute('position');
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  });
  return out;
}

describe('the deformed shape of a shell', () => {
  it('draws a closed outline through the displaced corners', () => {
    const disp = [{ nodeId: 3, ux: 0, uy: 0, uz: -0.01 }] as any;
    const g = createDeformedShells(NONE, QUADS, NODES, disp, 100);
    const pts = points(g);
    expect(pts.length, 'four corners and back to the first').toBe(5);
    expect(pts[0].distanceTo(pts[4]), 'the outline closes').toBeCloseTo(0, 9);
  });

  it('moves a node by its displacement times the scale, and leaves the rest', () => {
    const disp = [{ nodeId: 3, ux: 0, uy: 0, uz: -0.01 }] as any;
    const pts = points(createDeformedShells(NONE, QUADS, NODES, disp, 100));
    // Node 3 is the third corner: −0.01 × 100 = −1.
    expect(pts[2].z).toBeCloseTo(-1, 9);
    expect(pts[0].z, 'an undisplaced corner stays put').toBeCloseTo(0, 9);
  });

  it('scales, which is the whole point of the slider', () => {
    const disp = [{ nodeId: 3, ux: 0, uy: 0, uz: -0.01 }] as any;
    const a = points(createDeformedShells(NONE, QUADS, NODES, disp, 100))[2].z;
    const b = points(createDeformedShells(NONE, QUADS, NODES, disp, 200))[2].z;
    expect(b / a).toBeCloseTo(2, 6);
  });

  it('draws triangles as well as quads', () => {
    const tri = new Map<number, any>([[1, { id: 1, nodes: [1, 2, 3] }]]);
    expect(points(createDeformedShells(tri, NONE, NODES, [] as any, 1)).length).toBe(4);
  });

  it('skips a shell whose nodes are missing rather than drawing a wrong one', () => {
    const bad = new Map<number, any>([[1, { id: 1, nodes: [1, 2, 99, 4] }]]);
    expect(points(createDeformedShells(NONE, bad, NODES, [] as any, 1)).length).toBe(0);
  });
});
