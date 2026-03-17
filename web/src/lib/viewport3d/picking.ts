// Pure picking / intersection utilities extracted from Viewport3D.svelte
import * as THREE from 'three';
import { findUserData } from '../three/selection-helpers';
import { planeNormal, type WorkingPlane3D } from '../geometry/coordinate-system';

// ─── 2D segment intersection (Crossing select) ──────────────────

/**
 * Test whether two 2D line segments intersect.
 * Returns true when the segments (ax1,ay1)-(ax2,ay2) and (bx1,by1)-(bx2,by2)
 * share a point, using a parametric t/u approach.
 */
export function segmentsIntersect2D(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number,
): boolean {
  const dx = ax2 - ax1, dy = ay2 - ay1;
  const ex = bx2 - bx1, ey = by2 - by1;
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-10) return false;
  const t = ((bx1 - ax1) * ey - (by1 - ay1) * ex) / denom;
  const u = ((bx1 - ax1) * dy - (by1 - ay1) * dx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * Test whether a 2D line segment intersects an axis-aligned rectangle.
 * The rectangle is defined by its top-left (rx1,ry1) and bottom-right (rx2,ry2).
 */
export function segmentIntersectsRect2D(
  px1: number, py1: number, px2: number, py2: number,
  rx1: number, ry1: number, rx2: number, ry2: number,
): boolean {
  // Either endpoint inside the rect
  if (px1 >= rx1 && px1 <= rx2 && py1 >= ry1 && py1 <= ry2) return true;
  if (px2 >= rx1 && px2 <= rx2 && py2 >= ry1 && py2 <= ry2) return true;
  // Check intersection with each rect edge
  const edges: [number, number, number, number][] = [
    [rx1, ry1, rx2, ry1], [rx2, ry1, rx2, ry2],
    [rx1, ry2, rx2, ry2], [rx1, ry1, rx1, ry2],
  ];
  for (const [ex1, ey1, ex2, ey2] of edges) {
    if (segmentsIntersect2D(px1, py1, px2, py2, ex1, ey1, ex2, ey2)) return true;
  }
  return false;
}

// ─── 3D raycast picking ──────────────────────────────────────────

/**
 * Intersect the raycaster's ray with a ground plane determined by the working
 * plane setting.  Returns the intersection point, or null.
 *
 * The raycaster is set up from the given `mouse` NDC and `camera` inside this
 * function so callers only need to pass already-updated mouse coordinates.
 */
export function getGroundIntersection(
  raycaster: THREE.Raycaster,
  mouse: THREE.Vector2,
  camera: THREE.Camera,
  workingPlane: WorkingPlane3D,
  nodeCreateZ: number,
): THREE.Vector3 | null {
  raycaster.setFromCamera(mouse, camera);
  raycaster.camera = camera;

  // Choose plane based on working plane setting
  const plane = new THREE.Plane(planeNormal(workingPlane), -nodeCreateZ);

  const target = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(plane, target);
  return hit ? target : null;
}

/**
 * Raycast into `nodesParent` and return the id of the first node mesh hit,
 * or null if nothing was hit.
 */
export function findNodeHit(
  raycaster: THREE.Raycaster,
  mouse: THREE.Vector2,
  camera: THREE.Camera,
  nodesParent: THREE.Group,
): number | null {
  raycaster.setFromCamera(mouse, camera);
  raycaster.camera = camera;
  const nodeHits = raycaster.intersectObjects(nodesParent.children, true);
  for (const hit of nodeHits) {
    const ud = findUserData(hit.object);
    if (ud?.type === 'node') return ud.id;
  }
  return null;
}

/**
 * Raycast into `elementsParent` and return the id of the first element hit,
 * or null if nothing was hit.
 */
export function findElementHit(
  raycaster: THREE.Raycaster,
  mouse: THREE.Vector2,
  camera: THREE.Camera,
  elementsParent: THREE.Group,
): number | null {
  raycaster.setFromCamera(mouse, camera);
  raycaster.camera = camera;
  const elemHits = raycaster.intersectObjects(elementsParent.children, true);
  for (const hit of elemHits) {
    const ud = findUserData(hit.object);
    if (ud?.type === 'element') return ud.id;
  }
  return null;
}
