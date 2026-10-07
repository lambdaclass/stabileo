import type { Point3 } from '../../codes/cirsoc201/bar-geometry';

/** Registered by WASM initialization. Keeping this module dependency-free lets the
 * synchronous detailing code run without importing the solver or requiring WASM. */
export interface CollisionGeometry {
  build_hash(cell: number, deduplicate: boolean): void;
  candidates(index: number): Uint32Array;
  bucket_scans(): number;
  measure(index: number, candidates: Uint32Array, placement: number, maxClear: number, prune: boolean): Float64Array;
  free(): void;
}
export type CollisionGeometryConstructor = new (points: Float64Array, offsets: Uint32Array, radii: Float64Array) => CollisionGeometry;
let constructor: CollisionGeometryConstructor | null = null;
export function registerCollisionKernel(value: CollisionGeometryConstructor | null): void { constructor = value; }
export function prepareCollisionKernel(points: readonly Point3[][], radii: Float64Array): CollisionGeometry | null {
  if (!constructor) return null;
  const offsets = new Uint32Array(points.length + 1);
  for (let i = 0; i < points.length; i++) offsets[i + 1] = offsets[i] + points[i].length;
  const packed = new Float64Array(offsets[points.length] * 3);
  let k = 0;
  for (const bar of points) for (const p of bar) { packed[k++] = p.x; packed[k++] = p.y; packed[k++] = p.z; }
  return new constructor(packed, offsets, radii);
}
