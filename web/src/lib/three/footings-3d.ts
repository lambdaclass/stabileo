/**
 * The footings in the model's 3D view: each a block at its founding level, turned and offset as
 * it is laid out, its pedestal on it and its piles under it. A footing not yet sized shows as a
 * thin outline of a nominal size, so it is seen and not mistaken for a sized one. Not pickable:
 * a footing is edited from the foundations panel.
 */
import * as THREE from 'three';
import type { Footing } from '../model/footing';
import { pileCentres } from '../model/foundation/piles';
import { disposeObject } from './selection-helpers';

const COLOR = 0xb8b2a7, PILE = 0x8f877a, UNSIZED = 0xd08a3a;
const NOMINAL = 0.6;

type NodeLike = { x: number; y: number; z?: number };

export function buildFootings(footings: Iterable<Footing>, nodes: ReadonlyMap<number, NodeLike>): THREE.Group | null {
  const list = [...footings];
  if (list.length === 0) return null;
  const group = new THREE.Group();
  group.name = 'footings';
  group.userData.noPick = true;
  const solid = new THREE.MeshStandardMaterial({ color: COLOR, transparent: true, opacity: 0.55, roughness: 0.9, depthWrite: false });
  const pileMat = new THREE.MeshStandardMaterial({ color: PILE, transparent: true, opacity: 0.55, roughness: 0.9, depthWrite: false });
  for (const f of list) {
    const n = nodes.get(f.nodeId);
    if (!n) continue;
    const th = (f.rotationDeg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
    // The centroid sits off the node by the eccentricity, in the footing's own axes.
    const cx = n.x + f.eccentricityB * c - f.eccentricityL * s, cy = n.y + f.eccentricityB * s + f.eccentricityL * c;
    const sized = f.B > 0 && f.L > 0;
    const B = sized ? f.B : NOMINAL, L = sized ? f.L : NOMINAL, t = Math.max(f.thickness, 0.05);
    const frame = new THREE.Group();
    frame.position.set(cx, cy, f.foundingElevation);
    frame.rotation.z = th;
    frame.userData.noPick = true;
    frame.name = `footing:${f.id}`;
    if (sized) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(B, L, t), solid);
      box.position.z = t / 2;
      box.userData.noPick = true;
      frame.add(box);
    }
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(B, L, t)), new THREE.LineBasicMaterial({ color: sized ? 0x6f6a61 : UNSIZED }));
    edges.position.z = t / 2;
    edges.userData.noPick = true;
    frame.add(edges);
    if (f.pedestal && f.pedestal.B > 0 && f.pedestal.L > 0 && f.pedestal.height > 0) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(f.pedestal.B, f.pedestal.L, f.pedestal.height), solid);
      p.position.set(-f.eccentricityB, -f.eccentricityL, t + f.pedestal.height / 2);
      p.userData.noPick = true;
      frame.add(p);
    }
    if (f.kind === 'pileCap' && f.piles && f.piles.count > 0 && f.piles.diameter > 0 && f.piles.length > 0) {
      for (const [u, v] of pileCentres(f.piles)) {
        const geo = new THREE.CylinderGeometry(f.piles.diameter / 2, f.piles.diameter / 2, f.piles.length, 16);
        geo.rotateX(Math.PI / 2);
        const m = new THREE.Mesh(geo, pileMat);
        m.position.set(u, v, -f.piles.length / 2);
        m.userData.noPick = true;
        frame.add(m);
      }
    }
    group.add(frame);
  }
  return group;
}

/** Replace `prev` in `scene` with the footings as they stand now. */
export function syncFootings(scene: THREE.Scene, prev: THREE.Group | null, footings: Iterable<Footing>, nodes: ReadonlyMap<number, NodeLike>): THREE.Group | null {
  if (prev) { scene.remove(prev); disposeObject(prev); }
  const next = buildFootings(footings, nodes);
  if (next) scene.add(next);
  return next;
}
