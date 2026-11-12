import type { Tensor3 } from '../section/tensors';
import { symmetricEigen } from '../engine/second-order/dense';

export type { Tensor3 };
export type Vec3 = [number, number, number];

const DEG = Math.PI / 180;

export const ZERO_TENSOR: Tensor3 = { xx: 0, yy: 0, zz: 0, xy: 0, xz: 0, yz: 0 };

export const PRESETS = {
  general: { xx: 80, yy: 20, zz: -30, xy: 30, xz: -10, yz: 15 },
  uniaxial: { xx: 100, yy: 0, zz: 0, xy: 0, xz: 0, yz: 0 },
  biaxial: { xx: 100, yy: 100, zz: 0, xy: 0, xz: 0, yz: 0 },
  triaxial: { xx: 100, yy: 50, zz: -40, xy: 0, xz: 0, yz: 0 },
  shear: { xx: 0, yy: 0, zz: 0, xy: 50, xz: 0, yz: 0 },
  hydrostatic: { xx: -60, yy: -60, zz: -60, xy: 0, xz: 0, yz: 0 },
} as const satisfies Record<string, Tensor3>;
export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

export function matrixOf(s: Tensor3): number[][] {
  return [[s.xx, s.xy, s.xz], [s.xy, s.yy, s.yz], [s.xz, s.yz, s.zz]];
}

export function normalFromAngles(phiDeg: number, thetaDeg: number): Vec3 {
  const p = phiDeg * DEG, q = thetaDeg * DEG;
  return [Math.sin(q) * Math.cos(p), Math.sin(q) * Math.sin(p), Math.cos(q)];
}

/** Azimuth from x in (−180°, 180°] and polar angle from z in [0°, 180°]. */
export function anglesFromNormal(n: Vec3): { phi: number; theta: number } {
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  const z = Math.min(1, Math.max(-1, n[2] / len));
  const theta = Math.acos(z) / DEG;
  const phi = Math.hypot(n[0], n[1]) < 1e-12 ? 0 : Math.atan2(n[1], n[0]) / DEG;
  return { phi, theta };
}

export const OCTAHEDRAL = { phi: 45, theta: Math.acos(1 / Math.sqrt(3)) / DEG };

export function traction(s: Tensor3, n: Vec3): Vec3 {
  return [
    s.xx * n[0] + s.xy * n[1] + s.xz * n[2],
    s.xy * n[0] + s.yy * n[1] + s.yz * n[2],
    s.xz * n[0] + s.yz * n[1] + s.zz * n[2],
  ];
}

export interface PlaneTraction {
  t: Vec3;
  sigmaN: number;
  tauN: number;
}

export function onPlane(s: Tensor3, n: Vec3): PlaneTraction {
  const t = traction(s, n);
  const sigmaN = t[0] * n[0] + t[1] * n[1] + t[2] * n[2];
  const tt = t[0] * t[0] + t[1] * t[1] + t[2] * t[2];
  return { t, sigmaN, tauN: Math.sqrt(Math.max(0, tt - sigmaN * sigmaN)) };
}

/** Two unit vectors that span the plane with normal `n`, so that (e1, e2, n) is right-handed. */
export function planeBasis(n: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const raw: Vec3 = [helper[1] * n[2] - helper[2] * n[1], helper[2] * n[0] - helper[0] * n[2], helper[0] * n[1] - helper[1] * n[0]];
  const l = Math.hypot(...raw) || 1;
  const e1: Vec3 = [raw[0] / l, raw[1] / l, raw[2] / l];
  return [e1, [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]]];
}

/** The polygon where the plane through the origin with normal `n` cuts the cube [−h, h]³, in order around `n`. */
export function planeThroughCube(n: Vec3, h = 1): Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3, k = (i + 2) % 3;
    if (Math.abs(n[i]) < 1e-12) continue;
    for (const a of [-h, h]) for (const b of [-h, h]) {
      const x = -(n[j] * a + n[k] * b) / n[i];
      if (Math.abs(x) > h * (1 + 1e-9)) continue;
      const p: Vec3 = [0, 0, 0];
      p[i] = x; p[j] = a; p[k] = b;
      if (!points.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-9 * h)) points.push(p);
    }
  }
  const [e1, e2] = planeBasis(n);
  const angle = (p: Vec3) => Math.atan2(p[0] * e2[0] + p[1] * e2[1] + p[2] * e2[2], p[0] * e1[0] + p[1] * e1[1] + p[2] * e1[2]);
  return points.sort((a, b) => angle(a) - angle(b));
}

export function splitTraction(s: Tensor3, n: Vec3): { t: Vec3; normal: Vec3; shear: Vec3; sigmaN: number; tauN: number } {
  const { t, sigmaN, tauN } = onPlane(s, n);
  const normal: Vec3 = [sigmaN * n[0], sigmaN * n[1], sigmaN * n[2]];
  return { t, normal, shear: [t[0] - normal[0], t[1] - normal[1], t[2] - normal[2]], sigmaN, tauN };
}

/** The normal of a plane of maximum shear: halfway between the σ1 and σ3 directions. */
export function maxShearNormal(directions: [Vec3, Vec3, Vec3]): Vec3 {
  const [a, , c] = directions;
  const v: Vec3 = [a[0] + c[0], a[1] + c[1], a[2] + c[2]];
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export interface Principal3 {
  values: [number, number, number];
  directions: [Vec3, Vec3, Vec3];
}

function oriented(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  const u = v.map((c) => c / len) as Vec3;
  const lead = u.find((c) => Math.abs(c) > 1e-9) ?? 1;
  return (lead < 0 ? u.map((c) => (c === 0 ? 0 : -c)) : u) as Vec3;
}

/** σ1 ≥ σ2 ≥ σ3 with unit directions; equal values get an arbitrary orthonormal pair, never NaN. */
export function principal3(s: Tensor3): Principal3 {
  const scale = Math.max(Math.abs(s.xx), Math.abs(s.yy), Math.abs(s.zz), Math.abs(s.xy), Math.abs(s.xz), Math.abs(s.yz));
  if (scale === 0 || !Number.isFinite(scale)) return { values: [0, 0, 0], directions: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
  const unit = matrixOf(s).map((row) => row.map((v) => v / scale));
  const { values, vectors } = symmetricEigen(unit);
  const order = [0, 1, 2].sort((a, b) => values[b] - values[a]);
  const snap = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v) * scale;
  const column = (j: number): Vec3 => [vectors[0][j], vectors[1][j], vectors[2][j]];
  return {
    values: order.map((j) => snap(values[j])) as [number, number, number],
    directions: order.map((j) => oriented(column(j))) as [Vec3, Vec3, Vec3],
  };
}

export interface Invariants3 {
  i1: number;
  i2: number;
  i3: number;
  mean: number;
  vonMises: number;
  tauMax: number;
}

export function invariants3(s: Tensor3, values = principal3(s).values): Invariants3 {
  const i1 = s.xx + s.yy + s.zz;
  const i2 = s.xx * s.yy + s.yy * s.zz + s.zz * s.xx - s.xy ** 2 - s.yz ** 2 - s.xz ** 2;
  const i3 = s.xx * (s.yy * s.zz - s.yz ** 2) - s.xy * (s.xy * s.zz - s.yz * s.xz) + s.xz * (s.xy * s.yz - s.yy * s.xz);
  const vonMises = Math.sqrt(Math.max(0, 0.5 * ((s.xx - s.yy) ** 2 + (s.yy - s.zz) ** 2 + (s.zz - s.xx) ** 2) + 3 * (s.xy ** 2 + s.yz ** 2 + s.xz ** 2)));
  return { i1, i2, i3, mean: i1 / 3, vonMises, tauMax: (values[0] - values[2]) / 2 };
}

export function sphereSamples(count: number): Vec3[] {
  const n = Math.max(1, Math.round(count));
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const z = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - z * z);
    return [r * Math.cos(golden * i), r * Math.sin(golden * i), z] as Vec3;
  });
}
