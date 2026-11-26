import type { SolverLoad3D } from './types-3d';

export type Vector = [number, number, number];

export const zero = (): Vector => [0, 0, 0];
export const xyz = (p: { x: number; y: number; z?: number }): Vector => [p.x, p.y, p.z ?? 0];
export const add = (a: Vector, b: Vector): Vector => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vector, b: Vector): Vector => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: Vector, x: number): Vector => [a[0] * x, a[1] * x, a[2] * x];
export const dot = (a: Vector, b: Vector): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vector): number => Math.hypot(...a);
export const unit = (a: Vector): Vector => mul(a, 1 / norm(a));
export const roundoff = 128 * Number.EPSILON;

export function agreesAtScale(a: number, b: number, scale: number, underflow = 0): boolean {
  const tolerance = roundoff * scale + underflow;
  return Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(tolerance)
    && Math.abs(a - b) <= tolerance;
}

export function agrees(a: number, b: number, scale: number): boolean {
  return Number.isFinite(scale) && agreesAtScale(a, b, Math.max(Math.abs(a), Math.abs(b), scale));
}

export class Sum {
  private sum = 0;
  private correction = 0;

  add(value: number): void {
    const next = this.sum + value;
    this.correction += Math.abs(this.sum) >= Math.abs(value)
      ? (this.sum - next) + value : (value - next) + this.sum;
    this.sum = next;
  }

  get value(): number { return this.sum + this.correction; }
}

const coordinateBits = new DataView(new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT));

export function dyadicInteger(value: number): bigint {
  coordinateBits.setFloat64(0, value);
  const bits = coordinateBits.getBigUint64(0);
  const exponent = (bits >> 52n) & 0x7ffn;
  const fraction = bits & 0xfffffffffffffn;
  const magnitude = exponent === 0n ? fraction : ((1n << 52n) | fraction) << (exponent - 1n);
  return bits >> 63n ? -magnitude : magnitude;
}

const absolute = ([x, y, z]: Vector): Vector => [Math.abs(x), Math.abs(y), Math.abs(z)];

function crossMagnitude([x, y, z]: Vector, [fx, fy, fz]: Vector): Vector {
  return [
    Math.abs(y * fz) + Math.abs(z * fy),
    Math.abs(z * fx) + Math.abs(x * fz),
    Math.abs(x * fy) + Math.abs(y * fx),
  ];
}

const eta = Number.MIN_VALUE;
const minNormal = eta / Number.EPSILON;

function underflowOf(a: number, b: number, result: number): number {
  return a !== 0 && b !== 0 && Math.abs(result) <= minNormal ? eta : 0;
}

function multiplyBound(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  const product = a * b;
  if (product >= minNormal || !Number.isFinite(product)) return product;
  return eta * Math.max(1, Math.ceil((Math.min(a, b) / eta) * Math.max(a, b)));
}

export class LoadScalar {
  constructor(readonly value: number, readonly underflow = 0) {}

  add(other: LoadScalar): LoadScalar {
    return new LoadScalar(this.value + other.value, this.underflow + other.underflow);
  }

  subtract(other: LoadScalar): LoadScalar {
    return new LoadScalar(this.value - other.value, this.underflow + other.underflow);
  }

  scale(factor: number | LoadScalar): LoadScalar {
    const b = typeof factor === 'number' ? factor : factor.value;
    const error = typeof factor === 'number' ? 0 : factor.underflow;
    const value = this.value * b;
    return new LoadScalar(value, underflowOf(this.value, b, value)
      + multiplyBound(this.underflow, Math.abs(b))
      + multiplyBound(Math.abs(this.value), error)
      + multiplyBound(this.underflow, error));
  }

  divide(divisor: number): LoadScalar {
    const value = this.value / divisor;
    const quotient = this.underflow / Math.abs(divisor);
    const carried = this.underflow > 0 && quotient < minNormal
      ? eta * Math.max(1, Math.ceil(this.underflow / (Math.abs(divisor) * eta))) : quotient;
    return new LoadScalar(value, carried + underflowOf(this.value, divisor, value));
  }
}

export class LoadVector {
  private constructor(readonly value: Vector, readonly magnitude: Vector, readonly underflow: Vector) {}

  static from(value: Vector, magnitude = absolute(value), underflow = zero()): LoadVector {
    return new LoadVector(value, magnitude, underflow);
  }

  private at(index: 0 | 1 | 2): LoadScalar {
    return new LoadScalar(this.value[index], this.underflow[index]);
  }

  private static fromComponents([x, y, z]: [LoadScalar, LoadScalar, LoadScalar], magnitude?: Vector): LoadVector {
    return LoadVector.from([x.value, y.value, z.value], magnitude, [x.underflow, y.underflow, z.underflow]);
  }

  add(other: LoadVector): LoadVector {
    return new LoadVector(add(this.value, other.value), add(this.magnitude, other.magnitude), add(this.underflow, other.underflow));
  }

  scale(factor: number | LoadScalar, magnitude = Math.abs(typeof factor === 'number' ? factor : factor.value)): LoadVector {
    return LoadVector.fromComponents([this.at(0).scale(factor), this.at(1).scale(factor), this.at(2).scale(factor)],
      mul(this.magnitude, magnitude));
  }

  componentAlong(index: 0 | 1 | 2, axis: Vector): LoadVector {
    return LoadVector.from(axis).scale(this.at(index), this.magnitude[index]);
  }

  projectOnto(axes: { ex: Vector; ey: Vector; ez: Vector }): LoadVector {
    const project = ([x, y, z]: Vector) => this.at(0).scale(x).add(this.at(1).scale(y)).add(this.at(2).scale(z));
    const { ex, ey, ez } = axes;
    return LoadVector.fromComponents([project(ex), project(ey), project(ez)], [
      dot(this.magnitude, absolute(ex)), dot(this.magnitude, absolute(ey)), dot(this.magnitude, absolute(ez)),
    ]);
  }

  scaleComponents(factors: Vector): LoadVector {
    return LoadVector.fromComponents([this.at(0).scale(factors[0]), this.at(1).scale(factors[1]), this.at(2).scale(factors[2])],
      [this.magnitude[0] * Math.abs(factors[0]), this.magnitude[1] * Math.abs(factors[1]), this.magnitude[2] * Math.abs(factors[2])]);
  }

  momentAt(arm: Vector | LoadVector): LoadVector {
    const position = arm instanceof LoadVector ? arm : LoadVector.from(arm);
    const x = position.at(0), y = position.at(1), z = position.at(2);
    return LoadVector.fromComponents([
      this.at(2).scale(y).subtract(this.at(1).scale(z)),
      this.at(0).scale(z).subtract(this.at(2).scale(x)),
      this.at(1).scale(x).subtract(this.at(0).scale(y)),
    ], crossMagnitude([x.value, y.value, z.value], this.magnitude));
  }
}

export const memberLineSources = ['external', 'prestress'] as const;
export type MemberLineSource = (typeof memberLineSources)[number];

type AssembledMagnitudes3D =
  | { force: LoadVector; couple: LoadVector; memberLine?: { member: number; end: 'i' | 'j'; source: MemberLineSource } }
  | { qI: LoadVector; qJ: LoadVector; source: MemberLineSource };

export const assembledMagnitudes3D = new WeakMap<SolverLoad3D, AssembledMagnitudes3D>();

export function scaleAssembledMagnitudes3D(source: SolverLoad3D, scaled: SolverLoad3D, factor: number): void {
  const magnitudes = assembledMagnitudes3D.get(source);
  if (!magnitudes) return;
  assembledMagnitudes3D.set(scaled, 'force' in magnitudes
    ? { ...magnitudes, force: magnitudes.force.scale(factor), couple: magnitudes.couple.scale(factor) }
    : { ...magnitudes, qI: magnitudes.qI.scale(factor), qJ: magnitudes.qJ.scale(factor) });
}

const zeroCouple = LoadVector.from(zero());

type WrenchComponent = { total: Sum; magnitude: Sum; underflow: Sum };

export function positionAt(start: Vector, axis: Vector, station: number | LoadScalar): LoadVector {
  return LoadVector.from(start).add(LoadVector.from(axis).scale(station));
}

export type MemberLinePieces = ReadonlyMap<number, { member: number; offset: number; scale: number }>;

export class Wrench {
  private readonly memberLines: Partial<Record<MemberLineSource, Map<number, Wrench>>> = {};
  private readonly components: WrenchComponent[] = Array.from({ length: 6 }, () => ({
    total: new Sum(), magnitude: new Sum(), underflow: new Sum(),
  }));

  constructor(private readonly memberPieces?: MemberLinePieces) {}

  apply(at: Vector | LoadVector, force: LoadVector, couple = zeroCouple): void {
    this.addTotals(force, force.momentAt(at).add(couple));
  }

  private addTotals(force: LoadVector, moment: LoadVector): void {
    for (const [offset, load] of [[0, force], [3, moment]] as const) {
      for (let i = 0; i < 3; i++) {
        const component = this.components[offset + i]!;
        component.total.add(load.value[i]!);
        component.magnitude.add(load.magnitude[i]!);
        component.underflow.add(load.underflow[i]!);
      }
    }
  }

  addScaled(other: Wrench, factor: number): void {
    const force = other.read(0), moment = other.read(3);
    this.addTotals(factor === 1 ? force : force.scale(factor), factor === 1 ? moment : moment.scale(factor));
    for (const source of memberLineSources) {
      for (const [id, measure] of other.memberLines[source] ?? []) this.memberLineMeasure(id, source).addScaled(measure, factor);
    }
  }

  memberLineMeasures(source: MemberLineSource): ReadonlyMap<number, Wrench> | undefined { return this.memberLines[source]; }

  private memberLineMeasure(id: number, source: MemberLineSource): Wrench {
    const lines = this.memberLines[source] ??= new Map();
    let measure = lines.get(id);
    if (!measure) {
      measure = new Wrench();
      lines.set(id, measure);
    }
    return measure;
  }

  memberLineForce(id: number, station: LoadScalar, force: LoadVector, source: MemberLineSource = 'external'): void {
    const piece = this.memberPieces?.get(id);
    if (piece) {
      station = station.scale(piece.scale).add(new LoadScalar(piece.offset));
      id = piece.member;
    }
    this.memberLineMeasure(id, source).addTotals(force, force.scale(station));
  }

  toWorld(plane: 'xz' | 'yz', origin: Vector): Wrench {
    const rotate = ([x, y, z]: Vector): Vector => plane === 'xz' ? [x, -z, y] : [z, x, y];
    const toWorldVector = (v: LoadVector) => LoadVector.from(rotate(v.value),
      absolute(rotate(v.magnitude)), absolute(rotate(v.underflow)));
    const force = toWorldVector(this.read(0)), moment = toWorldVector(this.read(3));
    const world = new Wrench();
    world.addTotals(force, moment.add(force.momentAt(origin)));
    for (const source of memberLineSources) {
      for (const [id, measure] of this.memberLines[source] ?? []) {
        world.memberLineMeasure(id, source).addTotals(toWorldVector(measure.read(0)), toWorldVector(measure.read(3)));
      }
    }
    return world;
  }

  component(index: number): { value: number; scale: number; underflow: number } {
    const { total, magnitude, underflow } = this.components[index]!;
    return { value: total.value, scale: magnitude.value, underflow: underflow.value };
  }

  private read(offset: number): LoadVector {
    const vector = (key: keyof WrenchComponent): Vector => [
      this.components[offset]![key].value, this.components[offset + 1]![key].value, this.components[offset + 2]![key].value,
    ];
    return LoadVector.from(vector('total'), vector('magnitude'), vector('underflow'));
  }

  line(
    start: Vector, axis: Vector, a: number, b: number, qI: LoadVector, qJ: LoadVector,
    member?: number, source: MemberLineSource = 'external',
  ): void {
    const length = new LoadScalar(b - a);
    const half = length.divide(2), third = length.divide(3);
    const parts = [
      [new LoadScalar(a).add(third), qI.scale(half)],
      [new LoadScalar(b).subtract(third), qJ.scale(half)],
    ] as const;
    for (const [station, force] of parts) {
      this.apply(positionAt(start, axis, station), force);
      if (member !== undefined) this.memberLineForce(member, station, force, source);
    }
  }
}

export function polygonMeasure(points: readonly Vector[], origin: Vector, normal: Vector) {
  const area = new Sum();
  const first = [new Sum(), new Sum(), new Sum()];
  for (let i = 0; i < points.length; i++) {
    const a = sub(points[i]!, origin), b = sub(points[(i + 1) % points.length]!, origin);
    const triangle = dot(cross(a, b), normal) / 2;
    area.add(triangle);
    for (let j = 0; j < 3; j++) first[j]!.add(triangle * ((a[j]! + b[j]!) / 3));
  }
  return { area: area.value, first: first.map(s => s.value) as Vector };
}
