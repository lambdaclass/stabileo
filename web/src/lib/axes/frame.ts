export type AxisName = 'X' | 'Y' | 'Z';
export type Sign = 1 | -1;
export type SignedAxis = `${'+' | '-'}${AxisName}`;
export type Handedness = 'right' | 'left';
export type Vec3 = readonly [number, number, number];

export interface AxesChoice {
  up: SignedAxis;
  right: SignedAxis;
  hand: Handedness;
}

export const AXIS_NAMES: readonly AxisName[] = ['X', 'Y', 'Z'];

export const DEFAULT_AXES: AxesChoice = { up: '+Z', right: '+X', hand: 'right' };

export interface AxesFrame {
  readonly choice: AxesChoice;
  readonly rows: readonly [Vec3, Vec3, Vec3];
  readonly det: Sign;
  readonly identity: boolean;
}

function parse(s: SignedAxis): { index: number; sign: Sign } {
  return { index: AXIS_NAMES.indexOf(s[1] as AxisName), sign: s[0] === '-' ? -1 : 1 };
}

function unit(k: number, sign: number): [number, number, number] {
  const v: [number, number, number] = [0, 0, 0];
  v[k] = sign;
  return v;
}

function determinant(r: readonly Vec3[]): number {
  return r[0][0] * (r[1][1] * r[2][2] - r[1][2] * r[2][1])
    - r[0][1] * (r[1][0] * r[2][2] - r[1][2] * r[2][0])
    + r[0][2] * (r[1][0] * r[2][1] - r[1][1] * r[2][0]);
}

export function validChoice(c: Partial<AxesChoice> | null | undefined): c is AxesChoice {
  if (!c || typeof c !== 'object') return false;
  const ok = (s: unknown) => typeof s === 'string' && /^[+-][XYZ]$/.test(s);
  const hand = (h: unknown) => h === 'right' || h === 'left';
  return ok(c.up) && ok(c.right) && c.up![1] !== c.right![1] && hand(c.hand);
}

export function makeFrame(choice: AxesChoice): AxesFrame {
  if (!validChoice(choice)) throw new Error(`Invalid axes choice: ${JSON.stringify(choice)}`);
  const up = parse(choice.up);
  const right = parse(choice.right);
  const third = 3 - up.index - right.index;
  const rows: [number, number, number][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  rows[up.index] = unit(2, up.sign);
  rows[right.index] = unit(0, right.sign);
  rows[third] = unit(1, 1);
  if (Math.sign(determinant(rows)) !== (choice.hand === 'right' ? 1 : -1)) rows[third] = unit(1, -1);
  const det = Math.sign(determinant(rows)) as Sign;
  const identity = rows.every((r, i) => r.every((v, j) => v === (i === j ? 1 : 0)));
  return { choice, rows: rows as unknown as [Vec3, Vec3, Vec3], det, identity };
}

export function toUser(f: AxesFrame, v: Vec3): [number, number, number] {
  const [r0, r1, r2] = f.rows;
  return [
    r0[0] * v[0] + r0[1] * v[1] + r0[2] * v[2],
    r1[0] * v[0] + r1[1] * v[1] + r1[2] * v[2],
    r2[0] * v[0] + r2[1] * v[1] + r2[2] * v[2],
  ];
}

export function toModel(f: AxesFrame, u: Vec3): [number, number, number] {
  const [r0, r1, r2] = f.rows;
  return [
    r0[0] * u[0] + r1[0] * u[1] + r2[0] * u[2],
    r0[1] * u[0] + r1[1] * u[1] + r2[1] * u[2],
    r0[2] * u[0] + r1[2] * u[1] + r2[2] * u[2],
  ];
}

export function pseudoToUser(f: AxesFrame, v: Vec3): [number, number, number] {
  return toUser(f, v).map((x) => f.det * x) as [number, number, number];
}

export function pseudoToModel(f: AxesFrame, u: Vec3): [number, number, number] {
  return toModel(f, u).map((x) => f.det * x) as [number, number, number];
}

export function userAxisAlong(f: AxesFrame, modelAxis: number): { name: AxisName; sign: Sign } {
  for (let i = 0; i < 3; i++) {
    const c = f.rows[i][modelAxis];
    if (c !== 0) return { name: AXIS_NAMES[i], sign: c as Sign };
  }
  throw new Error(`No user axis along model axis ${modelAxis}`);
}

export function signedLabel(a: { name: AxisName; sign: Sign }): string {
  return `${a.sign < 0 ? '−' : '+'}${a.name}`;
}

export function upLabel(f: AxesFrame): string {
  return signedLabel(userAxisAlong(f, 2));
}

export function gravityLabel(f: AxesFrame): string {
  const up = userAxisAlong(f, 2);
  return signedLabel({ name: up.name, sign: (-up.sign) as Sign });
}

export function horizontalNames(f: AxesFrame): [AxisName, AxisName] {
  return [userAxisAlong(f, 0).name, userAxisAlong(f, 1).name];
}

export function plane2D(f: AxesFrame): { horizontal: { name: AxisName; sign: Sign }; vertical: { name: AxisName; sign: Sign }; normal: { name: AxisName; sign: Sign } } {
  return { horizontal: userAxisAlong(f, 0), vertical: userAxisAlong(f, 2), normal: userAxisAlong(f, 1) };
}

export function allChoices(): AxesChoice[] {
  const out: AxesChoice[] = [];
  for (const up of ['+X', '-X', '+Y', '-Y', '+Z', '-Z'] as SignedAxis[]) {
    for (const right of ['+X', '-X', '+Y', '-Y', '+Z', '-Z'] as SignedAxis[]) {
      if (right[1] === up[1]) continue;
      for (const hand of ['right', 'left'] as Handedness[]) out.push({ up, right, hand });
    }
  }
  return out;
}
