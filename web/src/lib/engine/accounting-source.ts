import { plainDeepCopy } from '../utils/plain-deep-copy';
import type { Load, SurfaceLoad3D } from '../store/model.svelte';

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

export interface ScenarioSurfaceIntent {
  readonly baseline: Omit<SurfaceLoad3D, typeof scenarioSurfaceAdjustment>;
  readonly factor: number;
  readonly caseFactors?: readonly number[];
}

type SurfaceLoad = Extract<Load, { type: 'surface3d' }>;

type ScenarioSurfaceLoad = SurfaceLoad & { [scenarioSurfaceAdjustment]?: ScenarioSurfaceIntent };

export function scenarioSurfaceIntentOf(load: ScenarioSurfaceLoad): ScenarioSurfaceIntent | undefined {
  return load[scenarioSurfaceAdjustment];
}

export function withScenarioSurfaceIntent(load: SurfaceLoad, intent: ScenarioSurfaceIntent): SurfaceLoad {
  const scenario: ScenarioSurfaceLoad = { ...load, [scenarioSurfaceAdjustment]: intent };
  return scenario;
}

export function copyAccountingLoad(load: Load): Load {
  const copy = plainDeepCopy(load);
  if (load.type !== 'surface3d' || copy.type !== 'surface3d') return copy;
  const intent = scenarioSurfaceIntentOf(load);
  return intent ? withScenarioSurfaceIntent(copy, plainDeepCopy(intent)) : copy;
}
