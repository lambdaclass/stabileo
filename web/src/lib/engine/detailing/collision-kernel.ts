import type { Point3 } from '../../codes/cirsoc201/bar-geometry';

/** Registered by WASM initialization. Keeping this module dependency-free lets the
 * synchronous detailing code run without importing the solver or requiring WASM. */
export interface CollisionGeometry {
  build_hash(cell: number, deduplicate: boolean): void;
  candidates(index: number): Uint32Array;
  query_measured(index: number, placement: number, maxClear: number, prune: boolean): Float64Array;
  bucket_scans(): number;
  update_bar(index: number, points: Float64Array): void;
  changed_pairs(changed: Uint32Array): Uint32Array;
  measure(index: number, candidates: Uint32Array, placement: number, maxClear: number, prune: boolean): Float64Array;
  free(): void;
}
export type CollisionGeometryConstructor = new (points: Float64Array, offsets: Uint32Array, radii: Float64Array) => CollisionGeometry;
let constructor: CollisionGeometryConstructor | null = null;
let incrementalRepair = true;
let fusedQueries = true;
/** Reference switches for differential benchmarks; both optimizations are enabled in production. */
export function registerCollisionKernel(value: CollisionGeometryConstructor | null, incremental = true, fused = true): void {
  constructor = value;
  incrementalRepair = incremental;
  fusedQueries = fused;
}
export function collisionQueryFusionEnabled(): boolean { return fusedQueries; }
export function collisionRepairKernelAvailable(): boolean {
  return constructor !== null && incrementalRepair;
}
export function prepareCollisionKernel(points: readonly Point3[][], radii: Float64Array, forRepair = false): CollisionGeometry | null {
  if (!constructor || (forRepair && !incrementalRepair)) return null;
  const offsets = new Uint32Array(points.length + 1);
  for (let i = 0; i < points.length; i++) offsets[i + 1] = offsets[i] + points[i].length;
  const packed = new Float64Array(offsets[points.length] * 3);
  let k = 0;
  for (const bar of points) for (const p of bar) { packed[k++] = p.x; packed[k++] = p.y; packed[k++] = p.z; }
  return new constructor(packed, offsets, radii);
}
