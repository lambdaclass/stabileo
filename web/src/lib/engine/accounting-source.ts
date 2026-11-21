import { plainDeepCopy } from '../utils/plain-deep-copy';
import type { Load } from '../store/model.svelte';

export interface AccountingCaseSources {
  authored: ReadonlyMap<number, readonly Load[]>;
  generated: ReadonlyMap<number, readonly Load[]>;
  cases: ReadonlyMap<number, {
    ratio: number;
    includes: readonly { caseId: number; factor: number }[];
  }>;
  targets: ReadonlySet<number>;
}

export const accountingSource = Symbol();
export const scenarioSurfaceAdjustment = Symbol();
export const accountingCaseSources = Symbol();
export const accountingProjection = Symbol();

export function copyAccountingLoad(load: Load): Load {
  const copy = plainDeepCopy(load);
  if (load.type === 'surface3d' && copy.type === 'surface3d') {
    const adjustment = load.data[scenarioSurfaceAdjustment];
    if (adjustment) copy.data[scenarioSurfaceAdjustment] = plainDeepCopy(adjustment);
  }
  return copy;
}
