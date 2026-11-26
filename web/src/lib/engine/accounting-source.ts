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
  single?: true;
}

export const accountingSource = Symbol();
export const accountingMemberPieces = Symbol();
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

export function scenarioIntents(loads: readonly Load[]): ScenarioSurfaceIntent[] {
  return loads.flatMap(load => {
    const intent = load.type === 'surface3d' ? scenarioSurfaceIntentOf(load) : undefined;
    return intent ? [intent] : [];
  });
}

function appendCaseFactor(intent: ScenarioSurfaceIntent, factor: number): ScenarioSurfaceIntent {
  return factor === 1 ? intent : { ...intent, caseFactors: [...(intent.caseFactors ?? []), factor] };
}

export function scenarioSurfaceExpectations(sources: AccountingCaseSources) {
  const authored = new Map([...sources.authored].map(([id, loads]) => [id, scenarioIntents(loads)]));
  if ([...authored.values()].every(intents => intents.length === 0)) return () => [];
  const cache = new Map<number, ScenarioSurfaceIntent[]>();
  const single = (id: number, factor: number): ScenarioSurfaceIntent[] => {
    const rule = sources.cases.get(id);
    const own = (authored.get(id) ?? []).map(intent => appendCaseFactor(intent, factor * (rule?.ratio ?? 1)));
    return own.concat((rule?.includes ?? []).flatMap(inc => single(inc.caseId, factor * inc.factor)));
  };
  const perCase = (id: number): ScenarioSurfaceIntent[] => {
    const existing = cache.get(id);
    if (existing) return existing;
    const rule = sources.cases.get(id);
    const own = (authored.get(id) ?? []).map(intent => appendCaseFactor(intent, rule?.ratio ?? 1));
    for (const { caseId, factor } of rule?.includes ?? []) {
      for (const intent of perCase(caseId)) own.push(appendCaseFactor(intent, factor));
    }
    cache.set(id, own);
    return own;
  };
  return sources.single ? (id: number) => single(id, 1) : perCase;
}
