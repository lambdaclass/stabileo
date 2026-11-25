import { msg } from '../../codes/message';
import { refuseGravityGeometry, type PlaneBasis } from './gravity-shell-partition';

const coordinateBits = new DataView(new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT));

export function dyadicInteger(value: number): bigint {
  if (!Number.isFinite(value)) refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
  coordinateBits.setFloat64(0, value);
  const bits = coordinateBits.getBigUint64(0);
  const exponent = (bits >> 52n) & 0x7ffn;
  const fraction = bits & 0xfffffffffffffn;
  const magnitude = exponent === 0n ? fraction : ((1n << 52n) | fraction) << (exponent - 1n);
  return bits >> 63n ? -magnitude : magnitude;
}

export const sign = (value: bigint) => value < 0n ? -1 : value > 0n ? 1 : 0;

export type DoubledPlanPoint = [bigint, bigint];

export type Elevation = { numerator: bigint; denominator: bigint };
type Point3 = [number, number, number];

function elevation(numerator: bigint, denominator: bigint): Elevation {
  if (denominator === 0n) refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
  return denominator < 0n ? { numerator: -numerator, denominator: -denominator } : { numerator, denominator };
}

export function exactElevation(z: number): Elevation {
  return elevation(dyadicInteger(z), 1n);
}

export function midpointElevation(a: number, b: number): Elevation {
  return elevation(dyadicInteger(a) + dyadicInteger(b), 2n);
}

function clearanceNumerator(upper: Elevation, lower: Elevation, limit: number): bigint {
  const threshold = lower.numerator + dyadicInteger(limit) * lower.denominator;
  return upper.numerator * lower.denominator - threshold * upper.denominator;
}

export function compareClearance(upper: Elevation, lower: Elevation, limit: number): number {
  return limit === Infinity ? -1 : limit === -Infinity ? 1 : sign(clearanceNumerator(upper, lower, limit));
}

export function clearanceMargin(upper: Elevation, lower: Elevation, limit: number): number {
  const numerator = clearanceNumerator(upper, lower, limit);
  if (numerator === 0n) return 0;
  const magnitude = numerator < 0n ? -numerator : numerator;
  const denominator = (upper.denominator * lower.denominator) << 1074n;
  const shiftOf = (value: bigint) => Math.max(0, value.toString(2).length - 53);
  const numShift = shiftOf(magnitude), denShift = shiftOf(denominator);
  const value = (Number(magnitude >> BigInt(numShift)) / Number(denominator >> BigInt(denShift))) * 2 ** (numShift - denShift);
  if (!(value > 0) || !Number.isFinite(value)) refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
  return sign(numerator) * value;
}

export function doubledPlanPoint([x, y]: [number, number]): DoubledPlanPoint {
  return [2n * dyadicInteger(x), 2n * dyadicInteger(y)];
}

export function exactPlaneHeight([a, b, c]: PlaneBasis, [x, y]: DoubledPlanPoint): Elevation {
  const [ax, ay, az] = a.map(dyadicInteger) as [bigint, bigint, bigint];
  const [bx, by, bz] = b.map(dyadicInteger) as [bigint, bigint, bigint];
  const [cx, cy, cz] = c.map(dyadicInteger) as [bigint, bigint, bigint];
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  const denominator = 2n * (ux * vy - uy * vx);
  const normalX = uy * vz - uz * vy, normalY = uz * vx - ux * vz;
  return elevation(az * denominator - normalX * (x - 2n * ax) - normalY * (y - 2n * ay), denominator);
}

export function exactBeamHeight(a: Point3, b: Point3, point: DoubledPlanPoint): Elevation {
  if (a[2] === b[2]) return exactElevation(a[2]);
  const axis = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 0 : 1;
  const start = dyadicInteger(a[axis]);
  const denominator = 2n * (dyadicInteger(b[axis]) - start);
  const az = dyadicInteger(a[2]), bz = dyadicInteger(b[2]);
  return elevation(az * denominator + (bz - az) * (point[axis] - 2n * start), denominator);
}

function projectedStation(a: Point3, b: Point3, [x, y]: DoubledPlanPoint) {
  const ax = dyadicInteger(a[0]), ay = dyadicInteger(a[1]);
  const bx = dyadicInteger(b[0]), by = dyadicInteger(b[1]);
  const dx = bx - ax, dy = by - ay;
  const length = 2n * (dx * dx + dy * dy);
  const station = (x - 2n * ax) * dx + (y - 2n * ay) * dy;
  return { station, length };
}

function heightAtStation(a: Point3, b: Point3, station: bigint, length: bigint): Elevation {
  const az = dyadicInteger(a[2]), bz = dyadicInteger(b[2]);
  return elevation(az * length + (bz - az) * station, length);
}

export function exactStripHeight(a: Point3, b: Point3, point: DoubledPlanPoint): Elevation {
  const { station, length } = projectedStation(a, b, point);
  return heightAtStation(a, b, station, length);
}

export function exactProjectedBeamHeight(a: Point3, b: Point3, point: DoubledPlanPoint): Elevation | undefined {
  const { station, length } = projectedStation(a, b, point);
  if (station < 0n || station > length) return undefined;
  return heightAtStation(a, b, station, length);
}
