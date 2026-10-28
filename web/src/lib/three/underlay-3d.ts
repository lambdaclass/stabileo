/**
 * The background drawings in the 3D view, each at its level: the one on the active level drawn
 * plainly, the others faint. Nothing here is pickable; a drawing is a reference to capture points
 * from (`model/osnap.ts`), not an object to select.
 */
import * as THREE from 'three';
import { laidPoint, segmentShown, type Underlay } from '../model/underlay';
import { disposeObject } from './selection-helpers';

const COLOR = 0x9a8f7a;

export function buildUnderlays(list: readonly Underlay[], activeZ: number | null): THREE.Group | null {
  const shown = list.filter((u) => u.visible && u.segments.length >= 4);
  if (shown.length === 0) return null;
  const group = new THREE.Group();
  group.name = 'underlays';
  group.userData.noPick = true;
  for (const u of shown) {
    const n = u.segments.length / 4;
    const kept: number[] = [];
    for (let s = 0; s < n; s++) if (segmentShown(u, s)) kept.push(s);
    const pts = new Float32Array(kept.length * 6);
    kept.forEach((s, j) => {
      const [x1, y1] = laidPoint(u, u.segments[s * 4]!, u.segments[s * 4 + 1]!);
      const [x2, y2] = laidPoint(u, u.segments[s * 4 + 2]!, u.segments[s * 4 + 3]!);
      pts.set([x1, y1, u.z, x2, y2, u.z], j * 6);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const onLevel = activeZ === null || Math.abs(activeZ - u.z) < 1e-6;
    const own = Math.min(1, Math.max(0.1, u.opacity ?? 0.9));
    const mat = new THREE.LineBasicMaterial({ color: COLOR, transparent: true, opacity: onLevel ? own : Math.min(own, 0.25), depthWrite: false });
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
