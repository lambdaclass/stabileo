/**
 * The loads the load generator writes from the settings the project saved, as opening its dialog
 * and applying would: the settings read as the dialog reads them (`autoLoadsMemory`), the plan
 * built as it builds it (`planInputOf`), wind and seismic only where their regulation is bound. A
 * gallery example arrives with the settings and gets its loads here.
 */
import { regulationsStore } from './regulations.svelte';
import { applyLoadPlan } from './apply-load-plan';
import { buildLoadPlan } from '../engine/loads/load-plan';
import { autoLoadsMemory } from '../../components/pro/auto-loads-memory';
import { planInputOf } from '../../components/pro/auto-loads-plan';
import type { EngineMessage } from '../codes/message';
import { tp } from '../i18n';
import { loadPlanModel } from './load-plan-model';

export { loadPlanModel } from './load-plan-model';

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
