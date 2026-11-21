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

export function agrees(a: number, b: number, scale: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(scale)
    && Math.abs(a - b) <= roundoff * Math.max(Math.abs(a), Math.abs(b), scale);
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

export class Wrench {
  readonly components = Array.from({ length: 6 }, () => new Sum());
  readonly forceScale = new Sum();
  readonly momentScale = new Sum();

  apply(at: Vector, force: Vector, couple = zero()): void {
    const moment = add(cross(at, force), couple);
    const f = norm(force);
    this.addTotals(force, moment, f, norm(at) * f + norm(couple));
  }

  addTotals(force: Vector, moment: Vector, forceScale: number, momentScale: number): void {
    for (let i = 0; i < 3; i++) {
      this.components[i]!.add(force[i]!);
      this.components[i + 3]!.add(moment[i]!);
    }
    this.forceScale.add(forceScale);
    this.momentScale.add(momentScale);
  }

  addScaled(other: Wrench, factor: number): void {
    const { force, moment } = other.resultants;
    const magnitude = Math.abs(factor);
    this.addTotals(mul(force, factor), mul(moment, factor),
      other.forceScale.value * magnitude, other.momentScale.value * magnitude);
  }

  get resultants(): { force: Vector; moment: Vector } {
    const c = this.components.map(component => component.value);
    return { force: [c[0]!, c[1]!, c[2]!], moment: [c[3]!, c[4]!, c[5]!] };
  }

  line(start: Vector, axis: Vector, a: number, b: number, qI: Vector, qJ: Vector): void {
    const length = b - a;
    this.apply(add(start, mul(axis, a + length / 3)), mul(qI, length / 2));
    this.apply(add(start, mul(axis, b - length / 3)), mul(qJ, length / 2));
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
