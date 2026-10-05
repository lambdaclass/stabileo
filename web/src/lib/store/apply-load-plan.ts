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
import type { Load } from './model.svelte';

export interface ApplyLoadPlanOptions {
  clearExisting: boolean;
  /** Earthquake reversed by the sign in the combination. */
  bothSenses: boolean;
  /** A planned case's name in the app's language. */
  nameOf: (key: string, params?: Record<string, string | number>) => string;
  /** Patterns of partial loading also where their action is a companion (`combination-cases.ts`). */
  patternsInCompanions?: boolean;
}

/**
 * "Replace" acts per action: the loads the generator wrote before in the cases of the actions this
 * plan generates, and the combinations a code wrote. A load or a combination typed by hand stays,
 * and so do the cases of actions the plan does not touch. (It used to delete every load and every
 * combination of the model.)
 */
export function replacedByPlan(p: LoadPlan, loads: readonly Load[], cases: ReadonlyArray<{ id: number; type: string }>, combinations: ReadonlyArray<{ id: number; origin?: unknown }>): { loads: number[]; combinations: number[] } {
  const types = new Set(p.cases.map((c) => String(c.type)));
  const caseType = new Map(cases.map((c) => [c.id, c.type]));
  return {
    loads: loads.filter((l) => (l.data as { generatedBy?: string }).generatedBy && types.has(caseType.get(l.data.caseId ?? 1) ?? '')).map((l) => l.data.id),
    combinations: combinations.filter((c) => c.origin).map((c) => c.id),
  };
}

export function applyLoadPlan(p: LoadPlan, opts: ApplyLoadPlanOptions): void {
  modelStore.batch(() => {
    if (opts.clearExisting) {
      const gone = replacedByPlan(p, modelStore.loads, modelStore.model.loadCases, modelStore.model.combinations);
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
      const id = modelStore.ensureLoadCase(name, pc.type, { existingId: pc.existingId, alternatives: pc.alternatives, pattern: pc.pattern, category: pc.category });
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
    for (const n of p.nodal) {
      const id = caseOf(n.caseType, n.caseIndex);
      if (id === undefined) continue;
      modelStore.addNodalLoad3D(n.nodeId, n.fx, n.fy, n.fz, 0, 0, n.mz ?? 0, id);
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
      modelStore.addSurfaceLoad3D(s.quadId, s.q, id);
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
    modelStore.replaceLoads(modelStore.loads.map((l) => (l.data.id >= firstNewLoad ? ({ ...l, data: { ...l.data, generatedBy: by } } as Load) : l)));
  });
}
