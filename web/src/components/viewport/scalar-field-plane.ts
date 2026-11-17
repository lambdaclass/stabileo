import * as THREE from 'three';

/**
 * Which global plane a 2D scalar-field model lies in, with Z up. 'plan' puts the data's (x, y) on
 * the horizontal XY plane (slabs, plates under transverse load, layouts drawn in plan);
 * 'elevation' puts it on the vertical XZ plane, the data's y becoming Z (arches, frames, beams,
 * specimens and sections drawn in elevation).
 */
export type ScalarFieldPlane = 'plan' | 'elevation';
export type ScalarFieldProjection = 'plan' | 'orbit';

export const SCALAR_FIELD_PLANES: readonly ScalarFieldPlane[] = ['plan', 'elevation'];

/** Rotation about X that carries the mesh's local (x, y, 0) onto the plane. */
export function planeRotationX(plane: ScalarFieldPlane): number {
  return plane === 'elevation' ? Math.PI / 2 : 0;
}

export function planeToWorld(plane: ScalarFieldPlane, x: number, y: number, out = new THREE.Vector3()): THREE.Vector3 {
  return plane === 'elevation' ? out.set(x, 0, y) : out.set(x, y, 0);
}

export function worldToPlane(plane: ScalarFieldPlane, p: THREE.Vector3): [number, number] {
  return plane === 'elevation' ? [p.x, p.z] : [p.x, p.y];
}

/** The plane through the origin, for pointer picking. */
export function pickingPlane(plane: ScalarFieldPlane): THREE.Plane {
  return new THREE.Plane(plane === 'elevation' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1), 0);
}

const PLAN_TIP = 0.018;
const ELEVATION_AZIMUTH = THREE.MathUtils.degToRad(30);
const ELEVATION_ALTITUDE = THREE.MathUtils.degToRad(20);

/** Camera offset from the target, per unit of fitting distance. The plan view is tipped 1° so Z stays the orbit axis. */
export function cameraDirection(plane: ScalarFieldPlane, projection: ScalarFieldProjection): THREE.Vector3 {
  if (plane === 'elevation') {
    if (projection === 'plan') return new THREE.Vector3(0, -1, 0);
    const c = Math.cos(ELEVATION_ALTITUDE);
    return new THREE.Vector3(Math.sin(ELEVATION_AZIMUTH) * c, -Math.cos(ELEVATION_AZIMUTH) * c, Math.sin(ELEVATION_ALTITUDE));
  }
  return projection === 'plan'
    ? new THREE.Vector3(0, -Math.sin(PLAN_TIP), Math.cos(PLAN_TIP))
    : new THREE.Vector3(0.45, -0.75, 0.6);
}

export type CameraFit = { position: THREE.Vector3; target: THREE.Vector3; near: number; far: number };

/** Where the camera goes to show the data rectangle [x0, y0, x1, y1] lying in `plane`. */
export function fitScalarFieldCamera(
  plane: ScalarFieldPlane,
  projection: ScalarFieldProjection,
  [x0, y0, x1, y1]: readonly [number, number, number, number],
  aspect: number,
  fovDegrees: number,
): CameraFit {
  const tan = Math.tan(THREE.MathUtils.degToRad(fovDegrees) / 2);
  if (plane === 'elevation') return fitElevation(projection, [x0, y0, x1, y1], aspect, tan);
  const w = Math.max(1e-9, x1 - x0);
  const h = Math.max(1e-9, y1 - y0);
  const target = planeToWorld(plane, (x0 + x1) / 2, (y0 + y1) / 2);
  const direction = cameraDirection(plane, projection);
  const dist = (1.08 * Math.max(h, w / aspect)) / 2 / tan;
  return {
    position: target.clone().addScaledVector(direction, dist),
    target,
    near: dist / 1000,
    far: dist * 100,
  };
}

const FILL = 1 / 1.08;

/** Moves and scales the view until the region's projected box is centred and fills the frame as the 2D view does. */
function fitElevation(projection: ScalarFieldProjection, [x0, y0, x1, y1]: readonly [number, number, number, number], aspect: number, tan: number): CameraFit {
  const u = cameraDirection('elevation', projection);
  const right = new THREE.Vector3(0, 0, 1).cross(u).normalize();
  const up = u.clone().cross(right);
  const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => planeToWorld('elevation', x, y));
  const target = planeToWorld('elevation', (x0 + x1) / 2, (y0 + y1) / 2);
  let dist = 1e-9;
  for (const c of corners) {
    const r = c.clone().sub(target);
    dist = Math.max(dist, r.dot(u) + Math.max(Math.abs(r.dot(right)) / aspect, Math.abs(r.dot(up))) / FILL / tan);
  }
  const rel = new THREE.Vector3();
  for (let i = 0; i < 40; i++) {
    const eye = target.clone().addScaledVector(u, dist);
    let [xmin, xmax, ymin, ymax] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const c of corners) {
      rel.subVectors(c, eye);
      const depth = -rel.dot(u);
      const nx = rel.dot(right) / (depth * tan * aspect);
      const ny = rel.dot(up) / (depth * tan);
      xmin = Math.min(xmin, nx); xmax = Math.max(xmax, nx);
      ymin = Math.min(ymin, ny); ymax = Math.max(ymax, ny);
    }
    const cx = (xmin + xmax) / 2;
    const cy = (ymin + ymax) / 2;
    const scale = Math.max(xmax - xmin, ymax - ymin, 1e-12) / 2 / FILL;
    if (Math.abs(cx) < 1e-6 && Math.abs(cy) < 1e-6 && Math.abs(scale - 1) < 1e-6) break;
    target.addScaledVector(right, cx * dist * tan * aspect).addScaledVector(up, cy * dist * tan);
    dist *= scale;
  }
  const slide = -target.y / u.y;
  target.addScaledVector(u, slide);
  dist -= slide;
  return { position: target.clone().addScaledVector(u, dist), target, near: dist / 1000, far: dist * 100 };
}

export type ProjectedAxes = { x: [number, number]; y: [number, number] };

/** Screen-space vectors, in pixels with y down, of the data's x and y spans through the centre of [x0, y0, x1, y1]. */
export function projectedDataAxes(
  plane: ScalarFieldPlane,
  camera: THREE.Camera,
  [x0, y0, x1, y1]: readonly [number, number, number, number],
  width: number,
  height: number,
): ProjectedAxes {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const screen = (ax: number, ay: number, bx: number, by: number): [number, number] => {
    const a = planeToWorld(plane, ax, ay).project(camera);
    const b = planeToWorld(plane, bx, by).project(camera);
    return [((b.x - a.x) * width) / 2, (-(b.y - a.y) * height) / 2];
  };
  return { x: screen(x0, cy, x1, cy), y: screen(cx, y0, cx, y1) };
}

/** Whether a 3D view keeps an elevation standing: its data y axis stays screen-vertical and keeps its proportion to the x axis seen in 2D. */
export function standsUp(flat: ProjectedAxes, oblique: ProjectedAxes): boolean {
  const length = ([dx, dy]: [number, number]) => Math.hypot(dx, dy);
  if (!(oblique.y[1] < 0) || Math.abs(oblique.y[0]) >= 0.1 * Math.abs(oblique.y[1])) return false;
  if (length(flat.x) < 1 || length(oblique.x) < 1) return length(oblique.y) > 0.5 * length(flat.y);
  return length(oblique.y) / length(oblique.x) > 0.75 * (length(flat.y) / length(flat.x));
}
