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

export interface ApplyLoadPlanOptions {
  clearExisting: boolean;
  /** Earthquake reversed by the sign in the combination. */
  bothSenses: boolean;
  /** A planned case's name in the app's language. */
  nameOf: (key: string, params?: Record<string, string | number>) => string;
  /** Patterns of partial loading also where their action is a companion (`combination-cases.ts`). */
  patternsInCompanions?: boolean;
}

export function applyLoadPlan(p: LoadPlan, opts: ApplyLoadPlanOptions): void {
  modelStore.batch(() => {
    if (opts.clearExisting) {
      for (const id of modelStore.loads.map((l) => l.data.id)) modelStore.removeLoad(id);
      for (const c of [...modelStore.model.combinations]) modelStore.removeCombination(c.id);
    }

    // Every planned case to a real id, creating only what is missing. A case the plan has no
    // match for is still reused when one of the same type already carries its name, so applying
    // twice does not duplicate the wind cases of Fig. 2.4-8 (`ensureLoadCase`).
    const caseIds: number[] = [];
    const caseIdByType = new Map<string, number[]>();
    for (const pc of p.cases) {
      const name = opts.nameOf(pc.nameKey, pc.nameParams);
      const id = modelStore.ensureLoadCase(name, pc.type, { existingId: pc.existingId, alternatives: pc.alternatives, pattern: pc.pattern });
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
      const id = caseOf('T');
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
  });
}
