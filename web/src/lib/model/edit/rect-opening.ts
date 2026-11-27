import { dot, norm, type Vec3 } from './affine';

export function rectangleOpening(center: Vec3, u: Vec3, v: Vec3, width: number, height: number): Vec3[] | null {
  if (![...center, ...u, ...v, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  if (Math.abs(norm(u) - 1) > 1e-6 || Math.abs(norm(v) - 1) > 1e-6 || Math.abs(dot(u, v)) > 1e-6) return null;
  const a = width / 2, b = height / 2;
  const corner = (x: number, y: number): Vec3 => [
    center[0] + x * a * u[0] + y * b * v[0],
    center[1] + x * a * u[1] + y * b * v[1],
    center[2] + x * a * u[2] + y * b * v[2],
  ];
  return [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
}
