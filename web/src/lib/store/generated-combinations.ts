/**
 * Add generated combinations to the model, and file the service ones where the service checks
 * read them.
 *
 * A service combination is not a strength combination with small factors: it is what the
 * deflection check reads (`store/service-deflection.ts` takes the project's service
 * envelopes). So when service combinations are added they join a named envelope of purpose
 * `service`, and they are kept OUT of the active list the design reads.
 *
 * Strength combinations generated here are always in that list. With no list stated, "all"
 * already includes them. With one stated — by the user, or by an earlier generation that
 * added service combinations — the new ones are appended to it: a combination generated now
 * is one the user asked for. Before, a later strength-only generation left them out, and after
 * "replace existing" the pruned list was empty: the design read no combination at all.
 *
 * Run inside the caller's batch: one command, one undo step.
 */
import { caseOrder } from '../engine/case-effects';
import { EngineCheckError } from '../engine/engine-unavailable';
import { sumCombinationFactors } from '../engine/wasm-solver';
import { modelStore, type LoadCombination, type StructureModel } from './model.svelte';
import type { CaseCombination } from '../engine/loads/combination-cases';
import { generateCombinations, type LoadCombinationSpec, type CombinationInputs } from '../codes/cirsoc101/combinations';
import { generateServiceCombinations } from '../codes/cirsoc101/service-combinations';
import { ruleToSpec, type CombinationRule } from '../engine/loads/combination-rules';
import { withOrigin } from '../codes/families';
import { CIRSOC101_BASIS } from '../codes/families/cirsoc';

/**
 * The specs a template of the loads tab writes (CIRSOC 101-2025 strength, its service
 * combinations, or the project's own rules), each saying which code and rule wrote it and what for
 * (`withOrigin`), as the generator's do. The tab wrote them without: a service combination it
 * added was read by design under "all", and "replace generated loads" never took back what it wrote.
 */
export function templateCombinationSpecs(template: 'lrfd' | 'service' | 'project', present: CombinationInputs['present'], rules: readonly CombinationRule[]): LoadCombinationSpec[] {
  if (template === 'project') return rules.map((r) => withOrigin(ruleToSpec(r), CIRSOC101_BASIS, true));
  const specs = template === 'service' ? generateServiceCombinations({ present }) : generateCombinations({ present });
  return specs.map((c) => withOrigin(c, CIRSOC101_BASIS));
}

/** The envelope the generated service combinations join, created when missing. */
export const SERVICE_ENVELOPE_NAME = 'SLS';

export function addGeneratedCombinations(list: readonly CaseCombination[], prefix: (c: CaseCombination) => string = () => ''): number[] {
  const before = modelStore.combinations.map((c) => c.id);
  const ids: number[] = [];
  const service: number[] = [];
  for (const c of list) {
    const id = modelStore.addCombination(`${prefix(c)}${c.name}`, c.factors, c.origin);
    ids.push(id);
    if (c.purpose === 'service') service.push(id);
  }
  const strength = ids.filter((id) => !service.includes(id));
  const scopes = modelStore.resultScopes ?? {};
  if (service.length === 0) {
    if (scopes.active && strength.length > 0) modelStore.setResultScopes({ ...scopes, active: [...new Set([...scopes.active, ...strength])] });
    return ids;
  }

  // New envelope objects, not the stored one edited in place: that was the live model state,
  // changed before setResultScopes took its undo snapshot, so undo could not give it back.
  const envelopes = [...(scopes.envelopes ?? [])];
  const at = envelopes.findIndex((e) => e.purpose === 'service' && e.name === SERVICE_ENVELOPE_NAME);
  if (at >= 0) {
    envelopes[at] = { ...envelopes[at]!, comboIds: [...new Set([...envelopes[at]!.comboIds, ...service])] };
  } else {
    const nextId = envelopes.reduce((m, e) => Math.max(m, e.id), 0) + 1;
    envelopes.push({ id: nextId, name: SERVICE_ENVELOPE_NAME, purpose: 'service', comboIds: service });
  }
  // "All combinations" would now include the service ones; state the list without them.
  const active = scopes.active ? [...new Set([...scopes.active, ...strength])] : [...before, ...strength];
  modelStore.setResultScopes({ ...scopes, active, envelopes });
  return ids;
}

/**
 * Combinations written as composite cases instead (`LoadCase.includes`): one case each, taking in
 * the combination's cases with its factors, solved as one case, and a combination taking that case
 * with factor 1, filed as the combination it replaces would be (`addGeneratedCombinations`: its
 * origin, a service one in the service envelope and out of design). The cases alone solved nothing
 * with no other combination, and design, which reads combinations, never saw them. Each case says
 * it is the generator's (`LoadCase.generated`): "replace" takes it back with its combination
 * (`takeBackCompositeCases`). Returns the new cases' ids.
 */
export function addCompositeCases(list: readonly CaseCombination[], prefix: (c: CaseCombination) => string = () => ''): number[] {
  const ids: number[] = [];
  const resolved = list.map(c => ({ ...c, factors: activeCombinationFactors(c.factors) }));
  modelStore.batch(() => {
    const combos: CaseCombination[] = [];
    for (const c of resolved) {
      const name = `${prefix(c)}${c.name}`;
      const id = modelStore.addLoadCase(name, '', { generated: true });
      modelStore.updateLoadCaseFields(id, { includes: c.factors });
      ids.push(id);
      combos.push({ ...c, name, factors: [{ caseId: id, factor: 1 }] });
    }
    addGeneratedCombinations(combos);
  });
  return ids;
}

export function loadCasesWithDirectEffects({ loadCases, loads, analysis }: CompositeModel): Set<number> {
  return new Set([
    ...loads.map(l => l.data.caseId ?? 1),
    ...(analysis?.selfWeight ?? []).map(row => row.caseId),
    ...loadCases.filter(c => c.spectral !== undefined || c.notional !== undefined).map(c => c.id),
  ]);
}

/**
 * The generator's composite cases that nothing takes any more, removed: what "replace generated
 * loads" leaves of them once their combinations are gone. They stayed, solved and listed as
 * cases. One a combination still takes (the user's, or one edited by hand), or another case takes
 * in or reads its notional loads off, stays. Run inside the caller's batch.
 */
export function takeBackCompositeCases(): number[] {
  const gone: number[] = [];
  const occupied = loadCasesWithDirectEffects(modelStore.model);
  // One removed can leave another unused (a generated case taken in only by a generated one).
  for (let changed = true; changed;) {
    changed = false;
    const cases = modelStore.model.loadCases;
    const used = new Set(occupied);
    for (const c of modelStore.combinations) for (const f of c.factors) if (f.factor !== 0) used.add(f.caseId);
    for (const c of cases) {
      for (const i of c.includes ?? []) if (i.caseId !== c.id) used.add(i.caseId);
      if (c.notional && c.notional.sourceCaseId !== c.id) used.add(c.notional.sourceCaseId);
    }
    for (const c of cases.filter((x) => x.generated && !used.has(x.id))) {
      modelStore.removeLoadCase(c.id);
      gone.push(c.id);
      changed = true;
    }
  }
  return gone;
}

type Factors = ReadonlyArray<LoadCombination['factors'][number]>;

export function activeCombinationFactors(factors: Factors): LoadCombination['factors'] {
  return sumCombinationFactors(factors).filter(({ factor }) => factor !== 0);
}

type ExistingCombination = Pick<LoadCombination, 'factors' | 'method'> & Partial<Pick<LoadCombination, 'name'>>;
type CompositeModel = Pick<StructureModel, 'loadCases' | 'loads' | 'analysis'>;
type ReportInvalid = (combination: ExistingCombination, error: EngineCheckError) => void;

export function combinationExists(
  factors: Factors,
  combinations: readonly ExistingCombination[],
  compositeModel?: CompositeModel,
  reportInvalid?: ReportInvalid,
): boolean {
  return generatedCombinationMatcher(combinations, compositeModel, reportInvalid)(factors);
}

function generatedWrappers(model: CompositeModel): Map<number, Factors> {
  const occupied = loadCasesWithDirectEffects(model);
  for (const id of caseOrder(model.loadCases).looped) occupied.add(id);
  return new Map(model.loadCases
    .filter(c => c.generated && c.includes?.length && c.type === '' && !occupied.has(c.id))
    .map(c => [c.id, c.includes!]));
}

export function generatedCombinationMatcher(
  combinations: readonly ExistingCombination[],
  compositeModel?: CompositeModel,
  reportInvalid?: ReportInvalid,
): (factors: Factors) => boolean {
  const wrappers = compositeModel && generatedWrappers(compositeModel);
  const existing: Factors[] = [];
  for (const combination of combinations) {
    if (combination.method !== undefined && combination.method !== 'linear') continue;
    try {
      const roots = activeCombinationFactors(combination.factors);
      if (!wrappers) {
        existing.push(roots);
      } else if (roots.length === 1 && roots[0]!.factor === 1) {
        const includes = wrappers.get(roots[0]!.caseId);
        if (includes) existing.push(activeCombinationFactors(includes));
      }
    } catch (error) {
      if (!(error instanceof EngineCheckError)) throw error;
      reportInvalid?.(combination, error);
    }
  }
  return factors => {
    const expected = activeCombinationFactors(factors);
    return expected.length > 0 && existing.some(actual =>
      actual.length === expected.length && actual.every(({ caseId, factor }, i) =>
        caseId === expected[i]!.caseId && factor === expected[i]!.factor));
  };
}
