import { combinationDefinition } from '../engine/loads/combination-definition';
import { modelStore } from '../store/model.svelte';
import { axesStore } from './axes.svelte';
import { userAxisAlong, type AxesFrame } from './frame';

export interface NamedCase { name: string; axisNamed?: boolean }
export interface NamedCombination { name: string; origin?: unknown; nameTyped?: boolean; factors?: readonly { caseId: number; factor: number }[] }

export function axisTokensIn(f: AxesFrame, text: string): string {
  if (f.identity) return text;
  return text.replace(/(?:(?<=[XYZ])([+−-])|(?<![A-Za-z0-9])([+−-]?))([XYZ])(?![A-Za-z])/g, (_, adjacent: string | undefined, first: string | undefined, letter: string) => {
    const sign = adjacent ?? first ?? '';
    const a = userAxisAlong(f, 'XYZ'.indexOf(letter));
    if (!sign) return a.name;
    const s = (sign === '+' ? 1 : -1) * a.sign;
    return `${s > 0 ? '+' : sign === '-' ? '-' : '−'}${a.name}`;
  });
}

export function caseNameIn(f: AxesFrame, c: NamedCase): string {
  return c.axisNamed ? axisTokensIn(f, c.name) : c.name;
}

export function combinationNameIn(f: AxesFrame, c: NamedCombination, cases: readonly (NamedCase & { id: number; type?: string; includes?: readonly unknown[] })[] = []): string {
  if (!c.origin || c.nameTyped || f.identity) return c.name;
  if (!c.factors?.length || cases.length === 0) return c.name;
  return combinationDefinition(c.factors, cases.map(lc => ({ ...lc, name: caseNameIn(f, lc) })));
}

export const caseNameShown = (c: NamedCase): string => caseNameIn(axesStore.frame, c);
export const combinationNameShown = (c: NamedCombination): string => combinationNameIn(axesStore.frame, c, modelStore.model.loadCases);
