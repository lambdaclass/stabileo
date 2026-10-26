/**
 * The background drawings in the 3D view, each at its level: the one on the active level drawn
 * plainly, the others faint. Nothing here is pickable; a drawing is a reference to capture points
 * from (`model/underlay.ts snapToUnderlays`), not an object to select.
 */
import * as THREE from 'three';
import { laidPoint, type Underlay } from '../model/underlay';
import { disposeObject } from './selection-helpers';

const COLOR = 0x9a8f7a;

export function buildUnderlays(list: readonly Underlay[], activeZ: number | null): THREE.Group | null {
  const shown = list.filter((u) => u.visible && u.segments.length >= 4);
  if (shown.length === 0) return null;
  const group = new THREE.Group();
  group.name = 'underlays';
  group.userData.noPick = true;
  for (const u of shown) {
    const pts = new Float32Array((u.segments.length / 2) * 3);
    for (let i = 0, k = 0; i + 1 < u.segments.length; i += 2, k += 3) {
      const [x, y] = laidPoint(u, u.segments[i]!, u.segments[i + 1]!);
      pts[k] = x; pts[k + 1] = y; pts[k + 2] = u.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const onLevel = activeZ === null || Math.abs(activeZ - u.z) < 1e-6;
    const mat = new THREE.LineBasicMaterial({ color: COLOR, transparent: true, opacity: onLevel ? 0.9 : 0.25, depthWrite: false });
    const lines = new THREE.LineSegments(geo, mat);
    lines.renderOrder = -2;
    lines.userData.noPick = true;
    lines.name = `underlay:${u.id}`;
    group.add(lines);
  }
  return group;
}

/** Replace `prev` in `scene` with the drawings as they stand now. */
export function syncUnderlays(scene: THREE.Scene, prev: THREE.Group | null, list: readonly Underlay[], activeZ: number | null): THREE.Group | null {
  if (prev) { scene.remove(prev); disposeObject(prev); }
  const next = buildUnderlays(list, activeZ);
  if (next) scene.add(next);
  return next;
}
