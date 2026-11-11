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
