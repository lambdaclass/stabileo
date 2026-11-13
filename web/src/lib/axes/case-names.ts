import { axesStore } from './axes.svelte';
import { userAxisAlong, type AxesFrame } from './frame';

export interface NamedCase { name: string; axisNamed?: boolean }
export interface NamedCombination { name: string; origin?: unknown; nameTyped?: boolean }

export function axisTokensIn(f: AxesFrame, text: string): string {
  if (f.identity) return text;
  return text.replace(/(?<![A-Za-z0-9])([+−-]?)([XYZ])(?![A-Za-z])/g, (_, sign: string, letter: string) => {
    const a = userAxisAlong(f, 'XYZ'.indexOf(letter));
    if (!sign) return a.name;
    const s = (sign === '+' ? 1 : -1) * a.sign;
    return `${s > 0 ? '+' : sign === '-' ? '-' : '−'}${a.name}`;
  });
}

export function caseNameIn(f: AxesFrame, c: NamedCase): string {
  return c.axisNamed ? axisTokensIn(f, c.name) : c.name;
}

export function combinationNameIn(f: AxesFrame, c: NamedCombination): string {
  return c.origin && !c.nameTyped ? axisTokensIn(f, c.name) : c.name;
}

export const caseNameShown = (c: NamedCase): string => caseNameIn(axesStore.frame, c);
export const combinationNameShown = (c: NamedCombination): string => combinationNameIn(axesStore.frame, c);
