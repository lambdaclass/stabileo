/**
 * Applies a previewed load plan (`engine/loads/load-plan.ts`) to the model, as one undo step.
 *
 * It used to run in the dialog without a batch, so every case, load and combination it added
 * was an undo step of its own: undoing a generated building meant pressing undo a few hundred
 * times.
 */
import { modelStore } from './index';
import { expandCombinations } from '../engine/loads/combination-cases';
import { addGeneratedCombinations } from './generated-combinations';
import type { LoadPlan } from '../engine/loads/load-plan';
import type { CurrentLoadState } from '../engine/loads/load-plan-delta';
import { findPlannedCase, type Load } from './model.svelte';

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
}

type ScopeCase = { id: number; type: string; name: string; alternatives?: string };
type ScopeCombination = { id: number; origin?: { code?: string; edited?: boolean }; factors?: ReadonlyArray<{ caseId: number; factor: number }> };

/** A combination a code wrote and nobody has edited since (`CombinationOrigin.edited`). */
export const codeWritten = (c: { origin?: { code?: string; edited?: boolean } }): boolean => !!c.origin && !c.origin.edited;

export function replaceScope(
  p: LoadPlan, loads: readonly Load[], cases: readonly ScopeCase[], combinations: readonly ScopeCombination[],
  nameOf?: ApplyLoadPlanOptions['nameOf'],
): ReplaceScope {
  const types = new Set(p.cases.map((c) => String(c.type)));
  const caseType = new Map(cases.map((c) => [c.id, c.type]));
  // The cases apply writes into, found as `ensureLoadCase` finds them. Without names, by id alone.
  const targets = new Set<number>();
  for (const pc of p.cases) {
    const found = nameOf
      ? findPlannedCase(cases, nameOf(pc.nameKey, pc.nameParams), pc.type, { existingId: pc.existingId, alternatives: pc.alternatives, own: pc.own })
      : cases.find((c) => c.id === pc.existingId);
    if (found) targets.add(found.id);
  }
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
      combinations: combinations.filter((c) => !codeWritten(c) && (c.factors ?? []).some((f) => f.factor !== 0 && targets.has(f.caseId))).map((c) => c.id),
    },
    targets: [...targets],
    defined: { loads: loads.filter((l) => defined(l) && types.has(caseType.get(caseOf(l)) ?? '')).map((l) => l.data.id) },
  };
}

/** What "replace" removes: the generated, and the unmarked too when asked. */
export function replacedByPlan(
  p: LoadPlan, loads: readonly Load[], cases: readonly ScopeCase[], combinations: readonly ScopeCombination[],
  opts: { alsoUnmarked?: boolean; nameOf?: ApplyLoadPlanOptions['nameOf'] } = {},
): { loads: number[]; combinations: number[] } {
  const s = replaceScope(p, loads, cases, combinations, opts.nameOf);
  return opts.alsoUnmarked
    ? { loads: [...s.generated.loads, ...s.unmarked.loads], combinations: [...s.generated.combinations, ...s.unmarked.combinations] }
    : s.generated;
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
  const s = replaceScope(p, loads, cases, combinations, nameOf);
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
  };
}

export function applyLoadPlan(p: LoadPlan, opts: ApplyLoadPlanOptions): void {
  modelStore.batch(() => {
    if (opts.clearExisting) {
      const gone = replacedByPlan(p, modelStore.loads, modelStore.model.loadCases, modelStore.model.combinations, { alsoUnmarked: opts.alsoUnmarked, nameOf: opts.nameOf });
      const ids = new Set(gone.loads);
      modelStore.replaceLoads(modelStore.loads.filter((l) => !ids.has(l.data.id)));
      for (const id of gone.combinations) modelStore.removeCombination(id);
    }
    const firstNewLoad = Math.max(0, ...modelStore.loads.map((l) => l.data.id)) + 1;

    // Every planned case to a real id, creating only what is missing. A case the plan has no
    // match for is still reused when one of the same type already carries its name, so applying
    // twice does not duplicate the wind cases of Fig. 2.4-8 (`ensureLoadCase`).
    const caseIds: number[] = [];
    const caseIdByType = new Map<string, number[]>();
    for (const pc of p.cases) {
      const name = opts.nameOf(pc.nameKey, pc.nameParams);
      const id = modelStore.ensureLoadCase(name, pc.type, { existingId: pc.existingId, alternatives: pc.alternatives, pattern: pc.pattern, category: pc.category, own: pc.own });
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
        modelStore.addDistributedLoad3D(d.elementId, d.qY ?? 0, d.qY ?? 0, d.q, qJ, d.a, d.b, id,
          { frame: d.frame, ...(d.qX ? { qXI: d.qX, qXJ: d.qX } : {}) });
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
      modelStore.addSurfaceLoad3D(s.quadId, s.q, id, s.frame ? { frame: s.frame, dir: s.dir, vary: s.vary } : undefined);
    }

    // The user's own cases of a type the plan generates into a group of its own (the live load
    // with its patterns, the two senses of ΔT) are not the plan's: they stay outside the group,
    // and without this every combination of the type left them out. They go in as plain cases,
    // summed at the type's factor beside whichever alternative of the group a combination takes.
    // Cases an earlier apply made for the group and this plan no longer uses stay out.
    const planIds = new Set(caseIds);
    const ownGroups = new Set(p.cases.filter((c) => c.own && c.alternatives).map((c) => c.alternatives!));
    for (const type of new Set(p.cases.filter((c) => c.own).map((c) => c.type))) {
      const list = caseIdByType.get(type)!;
      for (const lc of modelStore.model.loadCases) {
        if (lc.type === type && !planIds.has(lc.id) && !(lc.alternatives && ownGroups.has(lc.alternatives))) list.push(lc.id);
      }
    }

    // One combination per wind or seismic case, never two directions in one. Wind from −X and
    // −Y is generated as cases of its own (`wind-cases.ts`); earthquake is reversed by the sign.
    const planned = [...caseIdByType].flatMap(([type, ids]) => ids.map((id) => {
      const lc = modelStore.model.loadCases.find((c) => c.id === id);
      return { id, type, name: lc?.name ?? type, ...(lc?.alternatives ? { alternatives: lc.alternatives } : {}), ...(lc?.pattern ? { pattern: true } : {}) };
    }));
    addGeneratedCombinations(expandCombinations(p.combinations, planned, { bothSenses: { E: opts.bothSenses }, patternsInCompanions: opts.patternsInCompanions }));

    // What the generator wrote says so, for the next "replace".
    const by = p.generatedBy ?? 'generator';
    modelStore.replaceLoads(modelStore.loads.map((l) => (l.data.id >= firstNewLoad
      ? ({ ...l, data: { ...l.data, generatedBy: by, ...(carrierOf.has(l.data.id) ? { carrier: carrierOf.get(l.data.id) } : {}) } } as Load)
      : l)));
  });
}
