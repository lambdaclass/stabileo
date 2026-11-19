import { quantityTransform } from './quantity-transform';
import { axesStore } from './axes.svelte';
import { userAxisAlong, type AxisName, type Sign } from './frame';

type Triple = [number, number, number];

const frame = () => axesStore.frame;

export function along(modelAxis: 0 | 1 | 2): { name: AxisName; sign: Sign } {
  return userAxisAlong(frame(), modelAxis);
}

export const axisName = (modelAxis: 0 | 1 | 2): AxisName => along(modelAxis).name;
export const axisLetter = (modelAxis: 0 | 1 | 2): string => along(modelAxis).name.toLowerCase();

export function modelAxisOf(userAxis: AxisName): { index: 0 | 1 | 2; sign: Sign } {
  const row = frame().rows[['X', 'Y', 'Z'].indexOf(userAxis)];
  const index = row.findIndex((c) => c !== 0) as 0 | 1 | 2;
  return { index, sign: row[index] as Sign };
}

export function signedModelName(modelAxis: 0 | 1 | 2, sign: Sign): string {
  const a = along(modelAxis);
  return `${a.sign * sign < 0 ? '−' : '+'}${a.name}`;
}

export function isIdentity(): boolean {
  return frame().identity;
}

export const userVec = (x: number, y: number, z: number): Triple => quantityTransform(frame()).triple({ kind: 'vector', values: [x, y, z] });
export const modelVec = (x: number, y: number, z: number): Triple => quantityTransform(frame(), 'toModel').triple({ kind: 'vector', values: [x, y, z] });
export const userRot = (x: number, y: number, z: number): Triple => quantityTransform(frame()).triple({ kind: 'pseudovector', values: [x, y, z] });
export const modelRot = (x: number, y: number, z: number): Triple => quantityTransform(frame(), 'toModel').triple({ kind: 'pseudovector', values: [x, y, z] });

export function userFlags<T>(x: T, y: T, z: T): [T, T, T] {
  return quantityTransform(frame()).permute([x, y, z]);
}

export function modelFlags<T>(x: T, y: T, z: T): [T, T, T] {
  return quantityTransform(frame(), 'toModel').permute([x, y, z]);
}

export const twoD = {
  get horizontal(): AxisName { return axisName(0); },
  get vertical(): AxisName { return axisName(2); },
  get normal(): AxisName { return axisName(1); },
  x: (modelX: number): number => quantityTransform(frame()).plane({ kind: 'vector', value: modelX, axis: 'x' }),
  z: (modelVertical: number): number => quantityTransform(frame()).plane({ kind: 'vector', value: modelVertical, axis: 'z' }),
  rot: (modelRotY: number): number => quantityTransform(frame()).plane({ kind: 'pseudovector', value: modelRotY, axis: 'rot' }),
  fromX: (shown: number): number => twoD.x(shown),
  fromZ: (shown: number): number => twoD.z(shown),
  fromRot: (shown: number): number => twoD.rot(shown),
};

export function coordLabels(is3D: boolean): string[] {
  return is3D ? ['X', 'Y', 'Z'] : [twoD.horizontal, twoD.vertical];
}

export function shownCoords(node: { x: number; y: number; z?: number }, is3D: boolean): number[] {
  return is3D ? userVec(node.x, node.y, node.z ?? 0) : [twoD.x(node.x), twoD.z(node.y)];
}

export function modelCoords(shown: number[], is3D: boolean): { x: number; y: number; z: number } {
  if (is3D) {
    const [x, y, z] = modelVec(shown[0], shown[1], shown[2]);
    return { x, y, z };
  }
  return { x: twoD.fromX(shown[0]), y: twoD.fromZ(shown[1]), z: 0 };
}

export function axesKey(): string {
  const c = axesStore.choice;
  return `${c.up}${c.right}${c.hand}`;
}

export type UserComponent = 'fx' | 'fy' | 'fz' | 'mx' | 'my' | 'mz';

export function modelLoad3D(dir: UserComponent, value: number): { fx: number; fy: number; fz: number; mx: number; my: number; mz: number } {
  const i = 'xyz'.indexOf(dir[1]);
  const u: Triple = [0, 0, 0];
  u[i] = value;
  const moment = dir[0] === 'm';
  const [a, b, c] = moment ? modelRot(u[0], u[1], u[2]) : modelVec(u[0], u[1], u[2]);
  return moment ? { fx: 0, fy: 0, fz: 0, mx: a, my: b, mz: c } : { fx: a, fy: b, fz: c, mx: 0, my: 0, mz: 0 };
}

export const planeFlipped = (): boolean => along(0).sign * along(2).sign < 0;

export const XYZ = ['x', 'y', 'z'] as const;

export function modelIndexOfUser(userIndex: 0 | 1 | 2 | number): 0 | 1 | 2 {
  return modelAxisOf((['X', 'Y', 'Z'] as const)[userIndex]).index;
}

export const planeGlobalValue = (v: number): number => twoD.z(v);
export const planeGlobalAngle = (a: number): number => (planeFlipped() ? -a : a);

export function planeDistributedLoad(qI: number, qJ: number, angle: number, global: boolean): { qI: number; qJ: number; angle: number | undefined; isGlobal: true | undefined } {
  const a = global ? planeGlobalAngle(angle) + 0 : angle;
  const q = (v: number) => (global ? planeGlobalValue(v) : v);
  return { qI: q(qI), qJ: q(qJ), angle: a !== 0 ? a : undefined, isGlobal: global ? true : undefined };
}

export const userComponent = (axis: number, value: number, kind: 'vector' | 'pseudovector' | 'magnitude'): number => quantityTransform(frame()).component(axis, value, kind).value;

export function globalComponent(global: boolean, axis: 0 | 1 | 2, kind: 'vector' | 'pseudovector' | 'magnitude') {
  return { name: global ? axisName(axis) : 'XYZ'[axis]!, value: (v: number): number => global ? userComponent(axis, v, kind) : v };
}
