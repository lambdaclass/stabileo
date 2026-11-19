import { along, axisName, modelAxisOf, modelFlags, modelRot, modelVec, signedModelName, userFlags, userRot, userVec } from './display';
import { axesStore } from './axes.svelte';
import type { AxisName, Sign } from './frame';
import type { ToModelFrame } from '../model/loads/write-load';

export const typedFrame: ToModelFrame = {
  vec: (v) => modelVec(v[0], v[1], v[2]),
  rot: (v) => modelRot(v[0], v[1], v[2]),
};

export const verticalNameIn = (s: string): string => s.replace(/\bZ\b/, axisName(2));
export const gravityNameIn = (s: string): string => s.replace('−Z', signedModelName(2, -1));
export const gravityFactorIn = (s: string): string => verticalNameIn(s).replace('−1', along(2).sign > 0 ? '−1' : '+1');
export const verticalCoordIn = (s: string): string => s.replace('− z)', `− ${axisName(2).toLowerCase()})`);

export function userSlot(i: number, moment = false): { k: 0 | 1 | 2; sign: Sign } {
  const m = modelAxisOf((['X', 'Y', 'Z'] as const)[i]!);
  return { k: m.index, sign: (moment ? axesStore.frame.det * m.sign : m.sign) as Sign };
}

export interface Six { fx: number; fy: number; fz: number; mx: number; my: number; mz: number }

export function userSix<T extends Six>(v: T): Six {
  const [fx, fy, fz] = userVec(v.fx, v.fy, v.fz);
  const [mx, my, mz] = userRot(v.mx, v.my, v.mz);
  return { fx, fy, fz, mx, my, mz };
}

export type Plane = 'XY' | 'XZ' | 'YZ';
const sortedPlane = (a: string, b: string): Plane => [a, b].sort().join('') as Plane;

export const userPlane = (p: Plane): Plane => sortedPlane(axisName(XYZi(p[0]!)), axisName(XYZi(p[1]!)));
export const modelPlane = (p: Plane): Plane => sortedPlane('XYZ'[modelAxisOf(p[0] as AxisName).index]!, 'XYZ'[modelAxisOf(p[1] as AxisName).index]!);
function XYZi(a: string): 0 | 1 | 2 { return 'XYZ'.indexOf(a) as 0 | 1 | 2; }

export function userDofName(i: number): string {
  return `${i < 3 ? 'u' : 'r'}${axisName((i % 3) as 0 | 1 | 2).toLowerCase()}`;
}

export function modelDof(name: string): { index: number; sign: Sign } | null {
  const m = /^([ur])([xyz])$/.exec(name.trim());
  if (!m) return null;
  const s = userSlot('xyz'.indexOf(m[2]!), m[1] === 'r');
  return { index: s.k + (m[1] === 'r' ? 3 : 0), sign: s.sign };
}

export function userDof(name: string, value: number): { dof: string; value: number } {
  const m = /^([ur])([xyz])$/.exec(name);
  if (!m) return { dof: name, value };
  const k = 'xyz'.indexOf(m[2]!) as 0 | 1 | 2;
  const a = along(k);
  const sign = m[1] === 'r' ? axesStore.frame.det * a.sign : a.sign;
  return { dof: `${m[1]}${a.name.toLowerCase()}`, value: sign * value };
}

export function modelFlags6<T>(u: readonly T[]): T[] {
  return [...modelFlags(u[0]!, u[1]!, u[2]!), ...modelFlags(u[3]!, u[4]!, u[5]!)];
}

export function userFlags6<T>(m: readonly T[]): T[] {
  return [...userFlags(m[0]!, m[1]!, m[2]!), ...userFlags(m[3]!, m[4]!, m[5]!)];
}

export function signedAxisText(d: string): string {
  const m = /^([+\-−])([XYZ])$/.exec(d);
  return m ? signedModelName(XYZi(m[2]!), m[1] === '+' ? 1 : -1) : d;
}

export function planNamesIn(s: string): string {
  return s
    .replace(/\b[XY]\b/g, (m) => axisName(m === 'X' ? 0 : 1))
    .replace(/(?<=\()[xy]\b|\b[xy](?=\))/g, (m) => axisName(m === 'x' ? 0 : 1).toLowerCase());
}

export const modelAxisText = (k: 0 | 1 | 2): string => signedModelName(k, 1).replace('+', '');

export const signedNamesIn = (s: string): string => s.replace(/[+−][XYZ]\b/g, (m) => signedAxisText(m));

export const axisNamesIn = (s: string): string => s.replace(/\b[XYZ]\b/g, (m) => axisName(XYZi(m)));
