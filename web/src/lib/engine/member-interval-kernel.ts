import { requireEngine } from './engine-unavailable';

export type MemberEndpoints = readonly [readonly number[], readonly number[]];
type MemberIntervalKernel = (i: Float64Array, j: Float64Array, a: number, b: number, values?: Float64Array) => Float64Array;
let intervalKernel: MemberIntervalKernel | null = null;

export function registerMemberIntervalKernel(kernel: MemberIntervalKernel | null): void { intervalKernel = kernel; }

export function canonicalMemberLoadInterval(points: MemberEndpoints, a: number, b: number, values?: ReadonlyArray<readonly [number, number]>): Float64Array {
  requireEngine(intervalKernel !== null, 'member load interval');
  return intervalKernel!(Float64Array.from(points[0]), Float64Array.from(points[1]), a, b, values === undefined ? undefined : Float64Array.from(values.flat()));
}
