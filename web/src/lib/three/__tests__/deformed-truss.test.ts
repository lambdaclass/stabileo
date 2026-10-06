/**
 * A truss member carries axial force only, so the deformed shape draws it straight between its
 * displaced nodes, whatever the joints it meets turn by. It used to take the nodes' rotations
 * like a frame member and curve, as if it carried a moment it cannot carry.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createDeformedLines } from '../deformed-shape-3d';

const NODES = new Map<number, any>([
  [1, { id: 1, x: 0, y: 0, z: 0 }],
  [2, { id: 2, x: 4, y: 0, z: 0 }],
]);
// The ends move and turn, as at joints shared with bending members.
const DISP = [
  { nodeId: 1, ux: 0, uy: 0, uz: 0, rx: 0, ry: 0.02, rz: 0.01 },
  { nodeId: 2, ux: 0.001, uy: 0.002, uz: -0.01, rx: 0, ry: -0.03, rz: 0.02 },
] as never;
const FORCES = [{
  elementId: 1, length: 4, nStart: -10, nEnd: -10,
  vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0,
  myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0, hingeStart: false, hingeEnd: false,
  pointLoadsY: [], pointLoadsZ: [], distributedLoadsY: [], distributedLoadsZ: [],
}] as never;
const EI = new Map([[1, { EIy: 1000, EIz: 1000 }]]) as never;

function points(g: THREE.Object3D): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  g.traverse((o) => {
    const pos = (o as THREE.LineSegments).geometry?.getAttribute?.('position');
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  });
  return out;
}

/** The largest distance of any point from the line through the first and last. */
function offLine(ps: THREE.Vector3[]): number {
  const a = ps[0]!, b = ps[ps.length - 1]!;
  const d = b.clone().sub(a).normalize();
  return Math.max(...ps.map((p) => p.clone().sub(a).sub(d.clone().multiplyScalar(p.clone().sub(a).dot(d))).length()));
}

describe('deformed shape of a truss member', () => {
  it('is straight between its displaced nodes, where a frame member curves', () => {
    const el = (type: string) => new Map([[1, { id: 1, type, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]]) as never;
    const truss = points(createDeformedLines(el('truss'), NODES, DISP, FORCES, 100, EI));
    const frame = points(createDeformedLines(el('frame'), NODES, DISP, FORCES, 100, EI));
    expect(truss.length).toBeGreaterThan(2);
    // Within the float32 precision of the line buffer.
    expect(offLine(truss)).toBeLessThan(1e-5);
    expect(offLine(frame)).toBeGreaterThan(1e-3);
  });
});
