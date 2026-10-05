/**
 * Handles on a member load's stretch: with one distributed load selected in PRO, a handle at each
 * end of its stretch (a and b), dragged along the member to move that end. The model takes one
 * undo step for the whole drag; the drawing follows as it goes.
 */
import * as THREE from 'three';
import { modelStore, uiStore } from '../store';
import type { DistributedLoad3D } from '../store/model.svelte';

export interface StretchHandles {
  loadId: number;
  I: THREE.Vector3;
  J: THREE.Vector3;
  L: number;
  a: number;
  b: number;
}

/** The selected load's handles, or null: PRO, one load selected, and that load on a member's stretch. */
export function activeStretchHandles(): StretchHandles | null {
  if (uiStore.analysisMode !== 'pro' || uiStore.selectedLoads.size !== 1) return null;
  const id = [...uiStore.selectedLoads][0]!;
  const l = modelStore.loads.find((x) => x.data.id === id);
  if (!l || l.type !== 'distributed3d') return null;
  const d = l.data as DistributedLoad3D;
  const e = modelStore.elements.get(d.elementId);
  const ni = e && modelStore.nodes.get(e.nodeI), nj = e && modelStore.nodes.get(e.nodeJ);
  if (!e || !ni || !nj) return null;
  const I = new THREE.Vector3(ni.x, ni.y, ni.z ?? 0), J = new THREE.Vector3(nj.x, nj.y, nj.z ?? 0);
  const L = I.distanceTo(J);
  if (!(L > 0)) return null;
  return { loadId: id, I, J, L, a: d.a ?? 0, b: d.b ?? L };
}

/** Where along the member a stretch end is, in the world. */
export function handlePoint(h: StretchHandles, end: 'a' | 'b'): THREE.Vector3 {
  return h.I.clone().lerp(h.J, (end === 'a' ? h.a : h.b) / h.L);
}

/** The handle under the pointer, within `tolPx` on screen, or null. */
export function handleUnder(
  h: StretchHandles, camera: THREE.Camera, rect: { left: number; top: number; width: number; height: number },
  clientX: number, clientY: number, tolPx = 10,
): 'a' | 'b' | null {
  let best: 'a' | 'b' | null = null, bestD = tolPx;
  for (const end of ['a', 'b'] as const) {
    const p = handlePoint(h, end).project(camera);
    const sx = rect.left + ((p.x + 1) / 2) * rect.width, sy = rect.top + ((1 - p.y) / 2) * rect.height;
    const dd = Math.hypot(sx - clientX, sy - clientY);
    if (dd <= bestD) { best = end; bestD = dd; }
  }
  return best;
}

/** The point of the member closest to the pointer's ray, as a distance from end I, clamped to the member. */
export function stationOnRay(h: StretchHandles, ray: THREE.Ray): number {
  const u = h.J.clone().sub(h.I).normalize();
  const w0 = h.I.clone().sub(ray.origin);
  const b = u.dot(ray.direction), d = u.dot(w0), e = ray.direction.dot(w0);
  const den = 1 - b * b;
  const s = den > 1e-9 ? (b * e - d) / den : 0;
  return Math.min(h.L, Math.max(0, s));
}

/**
 * Move one end of the stretch to `s`, kept on its side of the other end, to a millimetre. A full
 * length end is stored as absent, as the model states one.
 */
export function moveStretchEnd(h: StretchHandles, end: 'a' | 'b', s: number): void {
  const mm = Math.round(s * 1000) / 1000;
  if (end === 'a') modelStore.updateLoad(h.loadId, { a: Math.min(mm, h.b - 0.001) });
  else modelStore.updateLoad(h.loadId, { b: Math.max(mm, h.a + 0.001) });
}

/** The two handles as small spheres, for the scene. */
export function handleMeshes(h: StretchHandles): THREE.Group {
  const g = new THREE.Group();
  g.name = 'loadStretchHandles';
  const geo = new THREE.SphereGeometry(0.07, 16, 12);
  for (const end of ['a', 'b'] as const) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd166, depthTest: false }));
    m.renderOrder = 999;
    m.position.copy(handlePoint(h, end));
    m.userData = { loadHandle: end };
    g.add(m);
  }
  return g;
}
