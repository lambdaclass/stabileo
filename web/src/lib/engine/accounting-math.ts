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

const absolute = ([x, y, z]: Vector): Vector => [Math.abs(x), Math.abs(y), Math.abs(z)];

function crossMagnitude([x, y, z]: Vector, [fx, fy, fz]: Vector): Vector {
  return [
    Math.abs(y * fz) + Math.abs(z * fy),
    Math.abs(z * fx) + Math.abs(x * fz),
    Math.abs(x * fy) + Math.abs(y * fx),
  ];
}

export class Wrench {
  private readonly components = Array.from({ length: 6 }, () => ({ total: new Sum(), magnitude: new Sum() }));
  private readonly forceScale = new Sum();

  apply(at: Vector, force: Vector, couple = zero()): void {
    this.addTotals(force, add(cross(at, force), couple),
      absolute(force), add(crossMagnitude(at, force), absolute(couple)), norm(force));
  }

  private addTotals(force: Vector, moment: Vector, forceMagnitude: Vector, momentMagnitude: Vector, forceScale: number): void {
    for (let i = 0; i < 3; i++) {
      const f = this.components[i]!, m = this.components[i + 3]!;
      f.total.add(force[i]!);
      f.magnitude.add(forceMagnitude[i]!);
      m.total.add(moment[i]!);
      m.magnitude.add(momentMagnitude[i]!);
    }
    this.forceScale.add(forceScale);
  }

  addScaled(other: Wrench, factor: number): void {
    const { force, moment } = other.read('total');
    const magnitude = other.read('magnitude');
    const scale = Math.abs(factor);
    this.addTotals(mul(force, factor), mul(moment, factor),
      mul(magnitude.force, scale), mul(magnitude.moment, scale), other.forceScale.value * scale);
  }

  toWorld(plane: 'xz' | 'yz', origin: Vector): Wrench {
    const rotate = ([x, y, z]: Vector): Vector => plane === 'xz' ? [x, -z, y] : [z, x, y];
    const { force, moment } = this.read('total');
    const magnitude = this.read('magnitude');
    const worldForce = rotate(force);
    const worldForceMagnitude = absolute(rotate(magnitude.force));
    const world = new Wrench();
    world.addTotals(worldForce, add(rotate(moment), cross(origin, worldForce)),
      worldForceMagnitude, add(absolute(rotate(magnitude.moment)), crossMagnitude(origin, worldForceMagnitude)),
      this.forceScale.value);
    return world;
  }

  component(index: number): { value: number; scale: number } {
    const { total, magnitude } = this.components[index]!;
    return { value: total.value, scale: index < 3 ? this.forceScale.value : magnitude.value };
  }

  private read(key: 'total' | 'magnitude'): { force: Vector; moment: Vector } {
    const c = this.components.map(component => component[key].value);
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
