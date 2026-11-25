/**
 * Applies a previewed load plan (`engine/loads/load-plan.ts`) to the model, as one undo step.
 *
 * It used to run in the dialog without a batch, so every case, load and combination it added
 * was an undo step of its own: undoing a generated building meant pressing undo a few hundred
 * times.
 */
import { modelStore } from './index';
import { addGeneratedCombinations, loadCasesWithDirectEffects, takeBackCompositeCases } from './generated-combinations';
import type { LoadPlan } from '../engine/loads/load-plan';
import { isCompositeCase, type CaseCombination } from '../engine/loads/combination-cases';
import { describePlanDelta, expandPlannedCombinations, type CurrentLoadState } from '../engine/loads/load-plan-delta';
import { findPlannedCase, plannedCaseName, type Load, type LoadCase, type LoadCombination } from './model.svelte';
import { designData, patchDesignData } from './design-data';
import { fromLoadPlan, loadsGeneratedWith, unverifiedSeismicLoads } from '../provenance/model-features';
import { RESULTS_VERSION } from '../provenance/registry';
import { untouchedDefaults, DEFAULT_CASE_NAME_KEYS } from '../model/default-loads';
import { t } from '../i18n';
import { msg } from '../codes/message';
import { hasModalSeismicDerivation, MODAL_SEISMIC_UNAVAILABLE } from '../engine/loads/seismic-generation';

export interface ApplyLoadPlanOptions {
  clearExisting: boolean;
  /** Earthquake reversed by the sign in the combination. */
  bothSenses: boolean;
  /** A planned case's name in the app's language. */
  nameOf: (key: string, params?: Record<string, string | number>) => string;
  /** Patterns of partial loading also where their action is a companion (`combination-cases.ts`). */
  patternsInCompanions?: boolean;
  /**
   * With `clearExisting`, also what carries no generator mark in the cases the plan writes into,
   * and the combinations that use them (`replaceScope`): a project saved before the marks.
   */
  alsoUnmarked?: boolean;
}

/**
 * "Replace" acts per action: the loads the generator wrote before in the cases of the actions this
 * plan generates, and the combinations a code wrote. A load or a combination typed by hand stays,
 * and so do the cases of actions the plan does not touch. (It used to delete every load and every
 * combination of the model.)
 *
 * What carries no mark is the user's — or an older version's: a project saved before the marks
 * holds the generator's loads and code combinations unmarked, and replacing kept them and added
 * the plan on top, every load twice, with nothing said. So the scope names them apart
 * (`unmarked`): the unmarked loads in the very cases the plan writes into, and the unmarked
 * combinations that use those cases. The preview says they stay and the plan adds to them, and
 * they go only when the user asks (`alsoUnmarked`).
 */
export interface ReplaceScope {
  /** What "replace" takes: the generator's loads in the regenerated actions, and the combinations a code wrote. */
  generated: { loads: number[]; combinations: number[] };
  /** What carries no generator mark in the cases the plan writes into: kept unless asked. */
  unmarked: { loads: number[]; combinations: number[] };
  /** The cases the plan writes into that exist already, by id. */
  targets: number[];
  /**
   * What floor-load definitions wrote in cases of the actions the plan generates. Never removed
   * here: the definition writes them again (`store/defined-loads.ts`), so they stay, as the
   * definitions do, and the plan adds to them; the preview says so (a floor both load is loaded
   * twice). They used to count among the unmarked: "also remove" deleted them and the next rewrite
   * brought them back, and without it the preview called them the user's.
   */
  defined: { loads: number[] };
  /** Removed whatever "replace" says: they were never the user's. */
  defaults: { cases: number[]; combinations: number[] };
}

type ScopeCase = Pick<LoadCase, 'id' | 'type' | 'name' | 'alternatives' | 'group' | 'includes' | 'snowBasis' | 'generated' | 'autoLoadsRetired'> & { reduction?: unknown };
type ScopeCombination = { id: number; name?: string; origin?: { code?: string; edited?: boolean }; factors?: ReadonlyArray<{ caseId: number; factor: number }> };

/** A combination a code wrote and nobody has edited since (`CombinationOrigin.edited`). */
export const codeWritten = (c: { origin?: { code?: string; edited?: boolean } }): boolean => !!c.origin && !c.origin.edited;

export function replaceScope(
  p: LoadPlan, loads: readonly Load[], cases: readonly ScopeCase[], combinations: readonly ScopeCombination[],
  nameOf?: ApplyLoadPlanOptions['nameOf'],
): ReplaceScope {
  const types = new Set(p.cases.map((c) => String(c.type)));
  const caseType = new Map(cases.map((c) => [c.id, c.type]));
  const targets = new Set<number>();
  for (const pc of p.cases) {
    const found = findPlannedCase(cases, nameOf?.(pc.nameKey, pc.nameParams), pc.type, pc);
    if (found) targets.add(found.id);
  }
  // A default case the plan writes into is the plan's target and stays; the rest of the untouched ones go.
  const defaultCandidates = cases.filter(c => c.autoLoadsRetired !== true);
  const untouched = p.combinations.length > 0
    ? untouchedDefaults(defaultCandidates, combinations, loads, type => t(DEFAULT_CASE_NAME_KEYS[type]))
    : { cases: [], combinations: [] };
  const defaults = { cases: untouched.cases.filter((id) => !targets.has(id)), combinations: untouched.combinations };
  const defaultCombo = new Set(defaults.combinations);
  const marked = (l: Load) => !!(l.data as { generatedBy?: string }).generatedBy;
  const defined = (l: Load) => (l.data as { fromDef?: number }).fromDef !== undefined;
  const caseOf = (l: Load) => l.data.caseId ?? 1;
  return {
    generated: {
      loads: loads.filter((l) => marked(l) && types.has(caseType.get(caseOf(l)) ?? '')).map((l) => l.data.id),
      combinations: combinations.filter(codeWritten).map((c) => c.id),
    },
    unmarked: {
      loads: loads.filter((l) => !marked(l) && !defined(l) && targets.has(caseOf(l))).map((l) => l.data.id),
      combinations: combinations.filter((c) => !codeWritten(c) && !defaultCombo.has(c.id) && (c.factors ?? []).some((f) => f.factor !== 0 && targets.has(f.caseId))).map((c) => c.id),
    },
    targets: [...targets],
    defined: { loads: loads.filter((l) => defined(l) && types.has(caseType.get(caseOf(l)) ?? '')).map((l) => l.data.id) },
    defaults,
  };
}

/** What "replace" removes: the generated, and the unmarked too when asked. */
export function replacedByPlan(
  p: LoadPlan, loads: readonly Load[], cases: readonly ScopeCase[], combinations: readonly ScopeCombination[],
  opts: { alsoUnmarked?: boolean; nameOf?: ApplyLoadPlanOptions['nameOf'] } = {},
): { loads: number[]; combinations: number[] } {
  return replacementFromScope(replaceScope(p, loads, cases, combinations, opts.nameOf), opts.alsoUnmarked);
}

function replacementFromScope(scope: ReplaceScope, alsoUnmarked?: boolean): ReplaceScope['generated'] {
  return alsoUnmarked
    ? { loads: [...scope.generated.loads, ...scope.unmarked.loads], combinations: [...scope.generated.combinations, ...scope.unmarked.combinations] }
    : scope.generated;
}

function combinationKey({ name, factors, origin }: Pick<LoadCombination, 'name' | 'factors' | 'origin'>): string {
  return JSON.stringify([
    name, factors.map(({ caseId, factor }) => [caseId, factor]),
    origin && [origin.code, origin.family, origin.edition, origin.rule, origin.purpose],
  ]);
}

function replacePlanCombinations(expanded: readonly CaseCombination[], ids: readonly number[]): void {
  const obsolete = new Set(ids);
  const matching = new Map<string, number[]>();
  for (const combination of modelStore.combinations) {
    if (!obsolete.has(combination.id) || !codeWritten(combination) || combination.method || combination.nameTyped) continue;
    const key = combinationKey(combination);
    const same = matching.get(key) ?? [];
    same.push(combination.id);
    matching.set(key, same);
  }
  const fresh: CaseCombination[] = [];
  for (const combination of expanded) {
    const reused = matching.get(combinationKey(combination))?.pop();
    if (reused === undefined) fresh.push(combination);
    else obsolete.delete(reused);
  }
  for (const id of obsolete) modelStore.removeCombination(id);
  addGeneratedCombinations(fresh);
}

const DISTRIBUTED_TYPES: readonly string[] = ['distributed', 'distributed3d'];
const NODAL_TYPES: readonly string[] = ['nodal', 'nodal3d'];

/**
 * The model's load state as the preview reads it (`describePlanDelta`), counted from the same scope
 * apply removes, so the preview and apply cannot disagree. Both the 2D and the 3D variants count:
 * `addDistributedLoad3D` stores `distributed3d`, and counting `distributed` alone read 0 in PRO.
 */
export function loadStateForPlan(p: LoadPlan, nameOf?: ApplyLoadPlanOptions['nameOf']): CurrentLoadState {
  const loads = modelStore.loads, cases = modelStore.model.loadCases, combinations = modelStore.model.combinations;
  return describeCurrentLoads(replaceScope(p, loads, cases, combinations, nameOf));
}

function describeCurrentLoads(s: ReplaceScope): CurrentLoadState {
  const loads = modelStore.loads, cases = modelStore.model.loadCases, combinations = modelStore.model.combinations;
  const typeOf = new Map(cases.map((c) => [c.id, String(c.type)]));
  const byType = (ids: readonly number[]) => {
    const want = new Set(ids);
    const out: Record<string, { distributed: number; nodal: number; other: number }> = {};
    for (const l of loads) {
      if (!want.has(l.data.id)) continue;
      const row = (out[typeOf.get(l.data.caseId ?? 1) ?? ''] ??= { distributed: 0, nodal: 0, other: 0 });
      if (DISTRIBUTED_TYPES.includes(l.type)) row.distributed++;
      else if (NODAL_TYPES.includes(l.type)) row.nodal++;
      else row.other++;
    }
    return out;
  };
  return {
    distributed: loads.filter((l) => DISTRIBUTED_TYPES.includes(l.type)).length,
    nodal: loads.filter((l) => NODAL_TYPES.includes(l.type)).length,
    combinations: combinations.length,
    caseTypes: cases.map((c) => String(c.type)),
    generated: { byType: byType(s.generated.loads), combinations: s.generated.combinations.length },
    unmarked: { byType: byType(s.unmarked.loads), combinations: s.unmarked.combinations.length },
    defined: { byType: byType(s.defined.loads) },
    defaults: {
      cases: cases.filter((c) => s.defaults.cases.includes(c.id)).map((c) => ({ name: c.name, type: String(c.type) })),
      combinations: s.defaults.combinations.length,
    },
  };
}

function prepareCombinationCases(
  p: LoadPlan, nameOf: ApplyLoadPlanOptions['nameOf'], scope: ReplaceScope, replaced?: ReplaceScope['generated'],
) {
  const removed = new Set(scope.defaults.cases);
  const retained = modelStore.loadCases.filter(c => !removed.has(c.id));
  const projected = new Map(retained.map(c => [c.id, c]));
  let virtualId = retained.reduce((id, c) => Math.min(id, c.id - 1), -1);
  const bindings = p.cases.map(planned => {
    const name = nameOf(planned.nameKey, planned.nameParams);
    const available = [...projected.values()];
    const found = findPlannedCase(available, name, planned.type, planned);
    const pc = { ...planned, group: found?.group ?? planned.group };
    const projectedCase: LoadCase = {
      ...found,
      id: found?.id ?? virtualId--,
      name: found?.name ?? plannedCaseName(available, name, pc.type, pc),
      type: found?.type ?? pc.type,
      group: pc.group,
      alternatives: pc.alternatives || found?.alternatives,
      pattern: pc.pattern || undefined,
      snowBasis: pc.snowBasis,
    };
    projected.set(projectedCase.id, projectedCase);
    return { pc, name, projectedId: projectedCase.id, targetName: projectedCase.name };
  });
  const planIds = new Set(bindings.map(b => b.projectedId));
  const removedLoads = new Set(replaced?.loads);
  const replacedCaseIds = new Set(modelStore.loads.filter(l => removedLoads.has(l.data.id)).map(l => l.data.caseId ?? 1));
  const occupied = loadCasesWithDirectEffects({
    loadCases: retained,
    loads: modelStore.loads.filter(l => !removedLoads.has(l.data.id)),
    analysis: modelStore.model.analysis,
  });
  const supplementedTypes = new Set(p.cases.filter(c => c.own || c.type === 'Lr').map(c => c.type.toUpperCase()));
  const cases = [...planIds].map(id => projected.get(id)!);
  const retainedCases: LoadCase[] = [];
  const caseRetirement = new Map<number, true | undefined>();
  for (const c of retained) {
    if (isCompositeCase(c)) continue;
    if (planIds.has(c.id)) {
      if (c.autoLoadsRetired === true) caseRetirement.set(c.id, undefined);
      continue;
    }
    const empty = !occupied.has(c.id);
    const retired = c.autoLoadsRetired === true || (empty && replacedCaseIds.has(c.id));
    if (retired && c.autoLoadsRetired !== true) caseRetirement.set(c.id, true);
    if (empty && (retired || c.generated)) continue;
    if (supplementedTypes.has((c.type ?? '').toUpperCase())) cases.push(c);
    else retainedCases.push(c);
  }
  return { bindings, cases, retainedCases, caseRetirement };
}

export function previewLoadPlan(
  p: LoadPlan, nameOf: ApplyLoadPlanOptions['nameOf'], options: Parameters<typeof describePlanDelta>[2],
) {
  const scope = replaceScope(p, modelStore.loads, modelStore.loadCases, modelStore.combinations, nameOf);
  const replaced = options.replaceExisting ? replacementFromScope(scope, options.alsoUnmarked) : undefined;
  const { cases, retainedCases } = prepareCombinationCases(p, nameOf, scope, replaced);
  return describePlanDelta(p, describeCurrentLoads(scope), { ...options, retainedCases }, cases);
}

export function applyLoadPlan(p: LoadPlan, opts: ApplyLoadPlanOptions) {
  if (p.outcome !== 'READY' || p.blockedKeys.length > 0) return p.blockedKeys[0];
  const expandOptions = { bothSenses: { E: opts.bothSenses }, patternsInCompanions: opts.patternsInCompanions };
  const scope = replaceScope(p, modelStore.loads, modelStore.loadCases, modelStore.combinations, opts.nameOf);
  const replaced = opts.clearExisting ? replacementFromScope(scope, opts.alsoUnmarked) : undefined;
  const { bindings, cases, retainedCases, caseRetirement } = prepareCombinationCases(p, opts.nameOf, scope, replaced);
  const expanded = expandPlannedCombinations(p, { ...expandOptions, retainedCases }, cases);
  if (hasModalSeismicDerivation(p.derivation) || (p.cases.some(c => c.type === 'E') && p.seismicGeneration !== 'static')) {
    return msg(MODAL_SEISMIC_UNAVAILABLE);
  }
  modelStore.batch(() => {
    const saved = { designData: designData(), loads: modelStore.loads as never, loadCases: modelStore.loadCases, regulations: modelStore.model.regulations };
    const legacySeismic = new Set(unverifiedSeismicLoads(saved).map(l => l.data?.id));
    const before = loadsGeneratedWith(saved);
    // The basis of what is about to be written, for the memoria (`LoadBasis`).
    const { windGust: _gust, ...scalars } = p.factors;
    const factors = Object.fromEntries(Object.entries(scalars).filter(([, v]) => v !== undefined)) as Record<string, NonNullable<(typeof scalars)[keyof typeof scalars]>>;
    patchDesignData({ loadBasis: {
      at: new Date().toISOString(), resultsVersion: RESULTS_VERSION, ...(p.generatedBy ? { generatedBy: p.generatedBy } : {}), factors,
      levels: (p.seismicModel?.levels ?? p.levels).map(({ nodeIds: _n, ...l }) => l), ...(p.seismic ? { seismic: p.seismic } : {}),
      derivation: p.derivation, assumptions: p.assumptions, refs: p.refs,
    } });
    for (const id of scope.defaults.combinations) modelStore.removeCombination(id);
    for (const id of scope.defaults.cases) modelStore.removeLoadCase(id);
    if (replaced) {
      const ids = new Set(replaced.loads);
      modelStore.replaceLoads(modelStore.loads.filter((l) => !ids.has(l.data.id)));
    }
    for (const [id, autoLoadsRetired] of caseRetirement) {
      modelStore.updateLoadCaseFields(id, { autoLoadsRetired });
    }
    if (modelStore.loads.some(l => !legacySeismic.has(l.data.id) && fromLoadPlan((l.data as { generatedBy?: string }).generatedBy))) {
      patchDesignData({ loadBasis: { ...designData().loadBasis!, resultsVersion: Math.min(before, RESULTS_VERSION) } });
    }
    const firstNewLoad = Math.max(0, ...modelStore.loads.map((l) => l.data.id)) + 1;

    // Every planned case to a real id, creating only what is missing. A case the plan has no
    // match for is still reused when one of the same type already carries its name, so applying
    // twice does not duplicate the wind cases of Fig. 2.4-8 (`ensureLoadCase`).
    const caseIds: number[] = [];
    const caseIdByType = new Map<string, number[]>();
    const existingCases = new Set(modelStore.loadCases.map(c => c.id));
    const caseIdByProjectedId = new Map<number, number>();
    for (const { pc, name, projectedId, targetName } of bindings) {
      const bound = caseIdByProjectedId.get(projectedId);
      const id = bound !== undefined || existingCases.has(projectedId)
        ? modelStore.ensureLoadCase(name, pc.type, { ...pc, existingId: bound ?? projectedId })
        : modelStore.addLoadCase(targetName, pc.type, pc);
      caseIdByProjectedId.set(projectedId, id);
      if (!existingCases.has(id)) modelStore.markLoadCaseAxisNamed(id);
      if (pc.snowBasis === 'flatRoof') modelStore.updateLoadCaseFields(id, { solve: false });
      caseIds.push(id);
      const list = caseIdByType.get(pc.type) ?? [];
      list.push(id);
      caseIdByType.set(pc.type, list);
    }
    const caseOf = (type: string, index?: number) => (index !== undefined ? caseIds[index] : caseIdByType.get(type)?.[0]);

    for (const d of p.distributed) {
      const id = caseOf(d.caseType, d.caseIndex);
      if (id === undefined) continue;
      const qJ = d.qJ ?? d.q;
      if (d.frame === 'global' || d.frame === 'projected') {
        modelStore.addDistributedLoad3D(d.elementId, d.qY ?? 0, d.qYJ ?? d.qY ?? 0, d.q, qJ, d.a, d.b, id,
          { frame: d.frame, ...(d.qX || d.qXJ ? { qXI: d.qX ?? 0, qXJ: d.qXJ ?? d.qX ?? 0 } : {}) });
      } else {
        modelStore.addDistributedLoad3D(d.elementId, 0, 0, d.q, qJ, d.a, d.b, id);
      }
    }
    // A floor's share at a re-entrant corner keeps the member it belongs to, which carries its mass.
    const carrierOf = new Map<number, number>();
    for (const n of p.nodal) {
      const id = caseOf(n.caseType, n.caseIndex);
      if (id === undefined) continue;
      const loadId = modelStore.addNodalLoad3D(n.nodeId, n.fx, n.fy, n.fz, 0, 0, n.mz ?? 0, id);
      if (n.carrier !== undefined) carrierOf.set(loadId, n.carrier);
    }
    for (const th of p.thermal) {
      const id = caseOf('T', th.caseIndex);
      if (id === undefined) continue;
      if (th.elementId !== undefined) modelStore.addThermalLoad(th.elementId, th.dtUniform, th.dtGradient, id);
      else if (th.quadId !== undefined) modelStore.addThermalLoadQuad3D(th.quadId, th.dtUniform, th.dtGradient, id);
    }
    for (const s of p.surface) {
      const id = caseOf(s.caseType, s.caseIndex);
      if (id === undefined) continue;
      modelStore.addSurfaceLoad3D(s.quadId, s.q, id, { ...(s.frame ? { frame: s.frame, dir: s.dir, vary: s.vary } : {}), ...(s.on ? { on: s.on } : {}) });
    }

    const combinations = expanded.map(combination => ({
      ...combination,
      factors: combination.factors.map(f => ({ ...f, caseId: caseIdByProjectedId.get(f.caseId) ?? f.caseId })),
    }));
    if (replaced) {
      replacePlanCombinations(combinations, replaced.combinations);
      takeBackCompositeCases();
    } else {
      addGeneratedCombinations(combinations);
    }

    // What the generator wrote says so, for the next "replace".
    const by = p.generatedBy ?? 'generator';
    const seismicIds = new Set(caseIdByType.get('E'));
    modelStore.replaceLoads(modelStore.loads.map(l => {
      if (l.data.id < firstNewLoad) {
        return legacySeismic.has(l.data.id) && l.data.seismicGeneration !== 'unverified'
          ? { ...l, data: { ...l.data, seismicGeneration: 'unverified' } } as Load : l;
      }
      return {
        ...l,
        data: {
          ...l.data, generatedBy: by, ...(carrierOf.has(l.data.id) ? { carrier: carrierOf.get(l.data.id) } : {}),
          ...(l.data.caseId !== undefined && seismicIds.has(l.data.caseId) ? { seismicGeneration: 'static' } : {}),
        },
      } as Load;
    }));
  });
  return undefined;
}
