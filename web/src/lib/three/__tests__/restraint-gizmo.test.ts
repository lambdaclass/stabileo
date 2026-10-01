/**
 * PRO's symbol for a support that is neither fixed nor pinned: every piece starts at the node,
 * and the translations read as the support they make when they make one.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createSupportGizmo } from '../create-support-gizmo';

const R = (o: Partial<Record<'tx' | 'ty' | 'tz' | 'rx' | 'ry' | 'rz', boolean>>) =>
  ({ tx: false, ty: false, tz: false, rx: false, ry: false, rz: false, ...o });

function parts(dofRestraints: ReturnType<typeof R>, springs = {}) {
  const g = createSupportGizmo({ x: 0, y: 0, z: 0 }, { supportId: 1, supportType: 'custom3d', dofRestraints, restraintSymbols: true, springs });
  const meshes: THREE.Mesh[] = [];
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const plates = meshes.filter((m) => m.geometry instanceof THREE.BoxGeometry).length;
  const balls = meshes.filter((m) => m.geometry instanceof THREE.SphereGeometry).length;
  const pyramid = meshes.some((m) => !(m.geometry instanceof THREE.CylinderGeometry) && !(m.geometry instanceof THREE.BoxGeometry)
    && !(m.geometry instanceof THREE.SphereGeometry));
  return { meshes, plates, balls, pyramid };
}

describe('restraint symbols', () => {
  it('three translations and a rotation: the pinned pyramid, no links', () => {
    const p = parts(R({ tx: true, ty: true, tz: true, rz: true }));
    expect(p.pyramid).toBe(true);
    expect(p.plates).toBe(0);
  });

  it('Z alone: the roller free in the plane', () => {
    const p = parts(R({ tz: true, rx: true }));
    expect(p.pyramid).toBe(true);
    expect(p.balls).toBe(4 + 1); // four rollers and the joint
  });

  it('a partial set: a link and a plate per held or elastic translation', () => {
    expect(parts(R({ tx: true, tz: true })).plates).toBe(2);
    expect(parts(R({ tx: true, ty: true }), { kz: 5000 }).plates).toBe(3);
  });

  it('touches the node: every piece lies within reach of it', () => {
    for (const r of [R({ tx: true, rz: true }), R({ tx: true, ty: true, tz: true, rx: true, ry: true })]) {
      const box = new THREE.Box3().setFromObject(parts(r).meshes[0]!.parent!);
      expect(box.distanceToPoint(new THREE.Vector3(0, 0, 0))).toBe(0);
    }
  });
});
