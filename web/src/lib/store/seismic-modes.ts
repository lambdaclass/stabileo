import { modelStore, uiStore } from './index';
import { t } from '../i18n';
import { modelHasMemberOffsets } from '../engine/member-offsets';
import { modelHasShellOffsets } from '../engine/shell-offsets';
import { withMassSource, densitiesFor } from '../engine/dynamics/mass-source-model';
import { modalUntilMass } from '../engine/dynamics/requests';
import { solveModal3D } from '../engine/wasm-solver';
import type { LoadPlan } from '../engine/loads/load-plan';
import { fundamentalFrequencies } from '../engine/loads/wind-dynamics';

const DEAD = -1, LIVE = -2;
type WindModalLoads = Pick<LoadPlan, 'distributed' | 'surface'>;

export function planModalResult(plan: WindModalLoads, liveParticipation: number): { result: unknown; reached: boolean } | { error: string } {
  if (modelHasMemberOffsets(modelStore.elements.values()) || modelHasShellOffsets(modelStore.plates, modelStore.quads)) {
    return { error: t('advanced.offsetsUnsupported') };
  }
  const loads: unknown[] = [];
  let id = 1;
  const full = (caseType: string, caseIndex?: number) => caseIndex === undefined && (caseType === 'D' || caseType === 'L');
  for (const d of plan.distributed) {
    if (!full(d.caseType, d.caseIndex)) continue;
    loads.push({ type: 'distributed3d', data: {
      id: id++, elementId: d.elementId, qYI: 0, qYJ: 0, qZI: d.q, qZJ: d.qJ ?? d.q,
      ...(d.a !== undefined ? { a: d.a, b: d.b } : {}), ...(d.frame && d.frame !== 'local' ? { frame: d.frame } : {}),
      caseId: d.caseType === 'D' ? DEAD : LIVE,
    } });
  }
  for (const s of plan.surface) {
    if (!full(s.caseType, s.caseIndex)) continue;
    loads.push({ type: 'surface3d', data: { id: id++, quadId: s.quadId, q: s.q, caseId: s.caseType === 'D' ? DEAD : LIVE } });
  }
  const leftHand = uiStore.axisConvention3D === 'leftHand';
  const input = modelStore.buildSolverInput3D(uiStore.includeSelfWeight, leftHand, { expandMemberOffsets: false });
  if (!input) return { error: 'empty' };
  const md = {
    nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
    loads, materials: modelStore.materials, sections: modelStore.sections,
    quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints,
    connectors: modelStore.connectors,
  };
  const ms = withMassSource(md as never, [{ id: DEAD, name: 'D', type: 'D' }, { id: LIVE, name: 'L', type: 'L' }],
    { kind: 'custom', factors: [{ caseId: DEAD, factor: 1 }, { caseId: LIVE, factor: liveParticipation }] }, input, leftHand);
  const densities = densitiesFor(ms.input, ms.densities);
  const r = modalUntilMass((n) => solveModal3D(ms.input, densities, n) as never, 12);
  if (typeof r.result === 'string') return { error: r.result };
  return { result: r.result, reached: r.reached };
}

/**
 * Each wind direction's fundamental frequency under the plan's masses (CIRSOC 102-2025 §1.9.2):
 * the lowest mode with a tenth of the mass along it (`wind-dynamics.ts`). The live load at the seismic
 * participation is in the mass: more mass lowers n₁ and raises G_f, the safe side.
 */
export function windFrequenciesForPlan(plan: WindModalLoads, liveParticipation: number): ReturnType<typeof fundamentalFrequencies> | { error: string } {
  const r = planModalResult(plan, liveParticipation);
  if ('error' in r) return r;
  const modes = ((r.result as { modes?: Array<{ frequency: number; massRatioX?: number; massRatioY?: number }> }).modes ?? []);
  return fundamentalFrequencies(modes);
}
