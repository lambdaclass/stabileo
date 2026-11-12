import { along, modelIndexOfUser, twoD, userFlags, userRot, userVec } from './display';
import type { AxisName } from './frame';
import { TWO_D_DISPLACEMENT_LABELS, TWO_D_REACTION_LABELS } from '../geometry/coordinate-system';

const MODEL_LETTERS = ['X', 'Y', 'Z'] as const;

function userLetterOf(modelLetter: string): AxisName {
  return along(MODEL_LETTERS.indexOf(modelLetter.toUpperCase() as AxisName) as 0 | 1 | 2).name;
}

export function relabelAxes(text: string): string {
  return text.replace(/(?<![A-Za-z])([XYZ]{1,2})(?![A-Za-z])/g, (token) => {
    const letters = [...token].map(userLetterOf);
    return (token.length === 2 ? letters.sort() : letters).join('');
  });
}

export function relabelComponents(text: string): string {
  return text.replace(/(?<![A-Za-z])(F|R|M|u|d|θ|δ)([xyz])(?![A-Za-z])/g, (_, p: string, l: string) => `${p}${userLetterOf(l).toLowerCase()}`);
}

export function planeName(plane: string): string {
  return relabelAxes(plane.toUpperCase());
}

export function shownDof(code: string): string {
  const m = /^(u|r|d|θ|R|F|M|k|kr)([xyz])$/.exec(code);
  if (!m) return code;
  return `${m[1]}${userLetterOf(m[2]).toLowerCase()}`;
}

export function shownDofSymbol(code: string): string {
  const s = shownDof(code);
  return s.startsWith('r') && s.length === 2 ? `θ${s[1]}` : s;
}

export function modelDofIndex(userIndex: number): number {
  return userIndex < 3 ? modelIndexOfUser(userIndex) : 3 + modelIndexOfUser(userIndex - 3);
}

export function userVecParts(prefix: string, v: readonly [number, number, number], moment = false): Array<{ name: string; value: number }> {
  const u = moment ? userRot(v[0], v[1], v[2]) : userVec(v[0], v[1], v[2]);
  return u.map((value, i) => ({ name: `${prefix}${MODEL_LETTERS[i]!.toLowerCase()}`, value }));
}

export function axisRatios(v: readonly [number, number, number], is3D: boolean): Array<{ name: string; value: number }> {
  if (!is3D) return [{ name: twoD.horizontal, value: v[0] }, { name: twoD.vertical, value: v[2] }];
  return userFlags(v[0], v[1], v[2]).map((value, i) => ({ name: MODEL_LETTERS[i]!, value }));
}

export function ratiosText(v: readonly [number, number, number], is3D: boolean, digits: number, sep: string): string {
  return axisRatios(v, is3D).map((r) => `${r.name}=${(r.value * 100).toFixed(digits)}%`).join(sep);
}

export function ilShown(q: string): { symbol: string; sign: number } {
  switch (q) {
    case 'Rz': case 'Ry': return { symbol: TWO_D_REACTION_LABELS.vertical, sign: twoD.z(1) };
    case 'Rx': return { symbol: TWO_D_REACTION_LABELS.horizontal, sign: twoD.x(1) };
    case 'My': case 'Mz': return { symbol: TWO_D_REACTION_LABELS.moment, sign: twoD.rot(1) };
    case 'uz': return { symbol: TWO_D_DISPLACEMENT_LABELS.vertical, sign: twoD.z(1) };
    case 'ux': return { symbol: TWO_D_DISPLACEMENT_LABELS.horizontal, sign: twoD.x(1) };
    case 'ry': return { symbol: 'θ', sign: twoD.rot(1) };
    default: return { symbol: q, sign: 1 };
  }
}

/** The sign sentence of these says up or counterclockwise: with the user's axis reversed it reads backwards. */
export const ilSignReversed = (q: string): boolean => ['Rz', 'Ry', 'uz', 'My', 'Mz'].includes(q) && ilShown(q).sign === -1;

export function ilText(q: string, text: string): string {
  const shown = ilShown(q);
  return shown.symbol === q || q === 'ry' ? text : relabelAxes(text.replace(new RegExp(`(?<![A-Za-z])${q}(?![A-Za-z])`, 'g'), shown.symbol));
}

export function supportTypeShown(type: string): string {
  const m = /^(roller)([XYZ]{2})$/.exec(type);
  return m ? `${m[1]}${planeName(m[2])}` : type;
}
