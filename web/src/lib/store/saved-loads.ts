/**
 * The loads the load generator writes from the settings the project saved, as opening its dialog
 * and applying would: the settings read as the dialog reads them (`autoLoadsMemory`), the plan
 * built as it builds it (`planInputOf`), wind and seismic only where their regulation is bound. A
 * gallery example arrives with the settings and gets its loads here.
 */
import { modelStore } from './model.svelte';
import { regulationsStore } from './regulations.svelte';
import { applyLoadPlan } from './apply-load-plan';
import { buildLoadPlan, type LoadPlanInput } from '../engine/loads/load-plan';
import { autoLoadsMemory } from '../../components/pro/auto-loads-memory';
import { planInputOf } from '../../components/pro/auto-loads-plan';
import type { EngineMessage } from '../codes/message';
import { tp } from '../i18n';
import { PHYSICAL_GROUP_KIND } from '../model/physical/types';
import { plateLoops, plateSurfaceOf } from '../model/physical/plate';

/**
 * The physical plates not meshed yet, each as one shell of its outline with its id negated: the
 * plan loads, weighs and reads it as the slab, roof or wall it is, and Apply turns its area loads
 * into floor-load definitions on the plate, which every mesh it is given takes (`applyLoadPlan`).
 */
export function unmeshedPlateShells(): Map<number, { id: number; nodes: number[]; thickness: number; materialId: number }> {
  const out = new Map<number, { id: number; nodes: number[]; thickness: number; materialId: number }>();
  for (const g of modelStore.model.groups.values()) {
    const surface = g.kind === PHYSICAL_GROUP_KIND ? plateSurfaceOf(g) : null;
    if (!surface || (g.members.quads?.length ?? 0) + (g.members.plates?.length ?? 0) > 0) continue;
    const { outer, holes } = plateLoops(g);
    if (outer.length < 3 || holes.length) continue;
    out.set(-g.id, { id: -g.id, nodes: outer, thickness: surface.thickness, materialId: surface.materialId });
  }
  return out;
}

/** The model as a load plan reads it, its unmeshed plates as shells (`unmeshedPlateShells`). */
export function loadPlanModel(): LoadPlanInput['model'] {
  const plates = unmeshedPlateShells();
  return {
    nodes: modelStore.nodes as never,
    elements: modelStore.elements as never,
    sections: modelStore.model.sections as never,
    materials: modelStore.model.materials as never,
    loadCases: modelStore.model.loadCases,
    quads: (plates.size ? new Map([...modelStore.model.quads, ...plates]) : modelStore.model.quads) as never,
    plates: modelStore.model.plates as never,
    supports: modelStore.supports,
    constraints: modelStore.model.constraints,
  };
}

/**
 * Generate and apply, adding to what the model has. Null when applied; otherwise why not, the
 * model untouched: a blocked plan's reasons, or the refusal of applying it.
 */
export function generateSavedLoads(): EngineMessage[] | null {
  const memory = autoLoadsMemory(regulationsStore.roles, { wind: regulationsStore.bound('wind'), seismic: regulationsStore.bound('seismic') });
  const plan = buildLoadPlan(planInputOf(memory, { roles: regulationsStore.roles, model: loadPlanModel() }));
  if (plan.outcome !== 'READY') return plan.blockedKeys;
  const refusal = applyLoadPlan(plan, { clearExisting: false, bothSenses: memory.bothSenses, patternsInCompanions: memory.patternsInCompanions, nameOf: tp });
  return refusal ? [refusal] : null;
}
