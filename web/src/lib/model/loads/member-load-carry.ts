/**
 * Member loads carried by a geometric edit: a copy or a transform in place (the structure moved by
 * an affine map, each member's local y and z keeping or changing sign, `sy` and `sz`), and a member
 * reversed (end I and end J swapped, local x reversed).
 *
 * A force follows the member's axes; a moment, an axial vector, also takes the determinant of the
 * transform, so a mirrored copy turns a moment the other way. A load along the global axes turns
 * with the structure in a copy and stays where it points when a member is reversed. A temperature
 * gradient, a difference between two faces, follows the sign of the axis across those faces; a
 * tendon's eccentricity follows z's.
 *
 * One place for these, so a point load, a thermal load and a tendon are carried alike by every
 * edit (`transform-fields.ts`, `transform-in-place.ts`, `flip-members.ts`, `reverse-element.ts`).
 */
import type { PointLoadOnElement3D, PrestressLoad3D, SurfaceLoad3D, ThermalLoad } from '../../store/model.svelte';
import { applyAxial, applyPoint, applyVector, det, type Affine, type Vec3 } from '../edit/affine';
import { reexpressPointLocal } from '../../engine/member-point-loads';

export interface AxisSigns { sy: 1 | -1; sz: 1 | -1 }

/** A point load on the copy of its member under `T`. */
export function carryPointLoad<P extends PointLoadOnElement3D>(d: P, T: Affine, s: AxisSigns): P {
  if ((d.frame ?? 'local') === 'global') {
    const F = applyVector(T, [d.px ?? 0, d.py, d.pz]);
    const M = applyAxial(T, [d.mx ?? 0, d.my ?? 0, d.mz ?? 0]);
    const out = { ...d, py: F[1], pz: F[2] } as P;
    if (d.px !== undefined || F[0] !== 0) out.px = F[0];
    if (d.mx !== undefined || d.my !== undefined || d.mz !== undefined) { out.mx = M[0]; out.my = M[1]; out.mz = M[2]; }
    return out;
  }
  return reexpressPointLocal(d, { y: s.sy, z: s.sz }, det(T.A) < 0 ? -1 : 1);
}

/** A point load on its member reversed, `L` long, its local y and z now `s` times the old ones. */
export function reversePointLoad<P extends PointLoadOnElement3D>(d: P, L: number, s: AxisSigns): P {
  const at = { ...d, a: L - (d.a ?? 0) } as P;
  return (d.frame ?? 'local') === 'global' ? at : reexpressPointLocal(at, { x: -1, y: s.sy, z: s.sz });
}

/** A thermal load's gradients on a member whose local y and z are `s` times the old ones. */
export function carryThermal<D extends ThermalLoad>(d: D, s: AxisSigns): D {
  return { ...d, dtGradient: s.sz * d.dtGradient, ...(d.dtGradientY !== undefined ? { dtGradientY: s.sy * d.dtGradientY } : {}) };
}

/** A tendon on a member whose local z is `sz` times the old one; `reversed`: its ends swapped too. */
export function carryPrestress<D extends PrestressLoad3D>(d: D, sz: 1 | -1, reversed = false): D {
  return reversed
    ? { ...d, eI: sz * d.eJ, eM: sz * d.eM, eJ: sz * d.eI }
    : { ...d, eI: sz * d.eI, eM: sz * d.eM, eJ: sz * d.eJ };
}

/**
 * A surface load on the copy of its shell under `T` (`flipped`: a reflection reversed the corner
 * order). Its global direction, the direction and ends of its variation, and its region turn with
 * the structure; along the local z it follows the shell's normal, which the copy carries; a value
 * per corner follows the corners.
 */
export function carrySurface<D extends SurfaceLoad3D>(d: D, T: Affine, flipped: boolean, shell: 'quad' | 'plate'): D {
  const out = { ...d };
  const dirOf = (v: Vec3) => { const w = applyVector(T, v); const n = Math.hypot(...w); return (n > 0 ? [w[0] / n, w[1] / n, w[2] / n] : w) as Vec3; };
  if (d.dir) out.dir = dirOf(d.dir);
  if (d.vary) {
    // c is measured along the turned direction from the turned origin of the old one.
    const dir = dirOf(d.vary.dir);
    const shift = dir[0] * T.t[0] + dir[1] * T.t[1] + dir[2] * T.t[2];
    out.vary = { ...d.vary, dir, c1: d.vary.c1 + shift, c2: d.vary.c2 + shift };
  }
  if (d.region) {
    out.region = {
      normal: applyVector(T, d.region.normal),
      points: d.region.points.map((p) => applyPoint(T, p)),
      ...(d.region.holes ? { holes: d.region.holes.map((h) => h.map((p) => applyPoint(T, p))) } : {}),
    };
  }
  if (d.qNodes && flipped) {
    const q = d.qNodes;
    out.qNodes = shell === 'plate' ? [q[0]!, q[2]!, q[1]!] : [q[0]!, q[3]!, q[2]!, q[1]!];
  }
  return out;
}
