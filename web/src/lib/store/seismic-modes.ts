/**
 * The model's modes for the load generator's modal response spectrum method
 * (`engine/loads/seismic-modal.ts`), with the mass the plan itself assumes: the members' own
 * weight, the planned dead load and the planned live load at the seismic participation.
 *
 * Those loads are the level weights the forces are spread over (`LoadPlan.levels`) when the plan
 * loads by panels and is built without the §4.7.2 reduction, which the dialog does for the mass:
 * the weights carry Lo, not a member's reduced live load. By width the weights still come from
 * the extent of each level's nodes, and the two can differ.
 *
 * The plan's loads are not in the model yet when it is previewed, so they are handed to the
 * mass source as two temporary cases; nothing is written to the model. Modes are added until 90 %
 * of the mass in X and in Y (§7.2.3), as the Advanced panel's modal analysis does.
 */
import { modelStore, uiStore } from './index';
import { t } from '../i18n';
import { te } from '../i18n/engine-text';
import { modelHasMemberOffsets } from '../engine/member-offsets';
import { modelHasShellOffsets } from '../engine/shell-offsets';
import { withMassSource, densitiesFor } from '../engine/dynamics/mass-source-model';
import { modalUntilMass } from '../engine/dynamics/requests';
import { solveModal3D } from '../engine/wasm-solver';
import type { LoadPlan } from '../engine/loads/load-plan';
import { requireModalCarrierRotations, SeismicModeRefusal, type ModeShape, type ModalPoint } from '../engine/loads/seismic-modal';
import type { MassLine } from '../engine/loads/seismic-mass';
import { fundamentalFrequencies } from '../engine/loads/wind-dynamics';

const DEAD = -1, LIVE = -2;

/** The model's modal result under the plan's own masses, raw (`modesForPlan`, `windFrequenciesForPlan`). */
export function planModalResult(plan: LoadPlan, liveParticipation: number, seismic = false): { result: unknown; reached: boolean } | { error: string } {
  // Solved on the node lines (no helper nodes for the offsets): refused rather than handing the
  // seismic and wind plans modes of a centred model (`dynamic-input.ts` `centerlineInput`).
  if (modelHasMemberOffsets(modelStore.elements.values()) || modelHasShellOffsets(modelStore.plates, modelStore.quads)) {
    return { error: t('advanced.offsetsUnsupported') };
  }
  const loads: unknown[] = [];
  let id = 1;
  if (seismic) {
    if (!plan.seismicLevels) return { error: t('loadPlan.blocked.seismicMass.mode') };
    try {
      requireModalCarrierRotations(plan.seismicLevels);
    } catch (error) {
      if (!(error instanceof SeismicModeRefusal)) throw error;
      return { error: te(error) };
    }
    const lines = new Map<number, MassLine[]>();
    for (const level of plan.seismicLevels) for (const mass of level.mass) {
      if (!mass.added) continue;
      if (mass.kind === 'line') {
        if (!lines.has(mass.elementId)) lines.set(mass.elementId, []);
        lines.get(mass.elementId)!.push(mass);
      } else {
        loads.push({ type: 'surface3d', data: { id: id++, quadId: mass.quadId, q: mass.density, caseId: DEAD, ...(mass.on ? { on: mass.on } : {}) } });
      }
    }
    for (const [elementId, pieces] of lines) {
      const length = pieces[0]!.length;
      const cuts = [...new Set([0, length, ...pieces.flatMap(p => [p.a, p.b])])].sort((a, b) => a - b);
      const weight = pieces.reduce((s, p) => s + (p.wi + p.wj) / 2 * (p.b - p.a), 0);
      const q = weight / length;
      for (let k = 1; k < cuts.length; k++) {
        const a = cuts[k - 1]!, b = cuts[k]!;
        const active = pieces.filter(p => p.a <= a && p.b >= b);
        for (const station of [a, b]) {
          const actual = active.reduce((s, p) => s + p.wi + (p.wj - p.wi) * ((station - p.a) / (p.b - p.a)), 0);
          if (!Number.isFinite(actual) || Math.abs(actual - q) > 64 * Number.EPSILON * q) {
            return { error: t('loadPlan.blocked.seismicMass.mode') };
          }
        }
      }
      loads.push({ type: 'distributed3d', data: { id: id++, elementId, qYI: 0, qYJ: 0, qZI: -q, qZJ: -q, frame: 'global', caseId: DEAD } });
    }
  } else {
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
  }
  const leftHand = uiStore.axisConvention3D === 'leftHand';
  const input = modelStore.buildSolverInput3D(uiStore.includeSelfWeight, leftHand, { expandMemberOffsets: false, ...(seismic ? { uncut: true } : {}) });
  if (!input) return { error: 'empty' };
  if (seismic && [...input.elements.values()].some(e => e.releaseMyStart || e.releaseMyEnd || e.releaseMzStart ||
    e.releaseMzEnd || e.releaseTStart || e.releaseTEnd || e.type !== 'frame')) {
    return { error: t('loadPlan.blocked.seismicMass.mode') };
  }
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

export function modesForPlan(plan: LoadPlan, liveParticipation: number): { modes: ModeShape[]; reached: boolean } | { error: string } {
  const r = planModalResult(plan, liveParticipation, true);
  if ('error' in r) return r;
  type SolverMode = {
    period: number; displacements: Array<ModalPoint & { nodeId: number }>;
    participationX: number; participationY: number; massRatioX: number; massRatioY: number;
  };
  const modes: ModeShape[] = ((r.result as { modes?: SolverMode[] }).modes ?? []).map(m => ({
    period: m.period,
    shape: new Map(m.displacements.map(({ nodeId, ...d }) => [nodeId, d])),
    participation: {
      x: { gamma: m.participationX, ratio: m.massRatioX },
      y: { gamma: m.participationY, ratio: m.massRatioY },
    },
  }));
  return modes.length ? { modes, reached: r.reached } : { error: t('loadPlan.blocked.seismicMass.mode') };
}

/**
 * Each wind direction's fundamental frequency under the plan's masses (CIRSOC 102-2025 §1.9.2):
 * the lowest mode with a tenth of the mass along it (`wind-dynamics.ts`). The live load at the seismic
 * participation is in the mass: more mass lowers n₁ and raises G_f, the safe side.
 */
export function windFrequenciesForPlan(plan: LoadPlan, liveParticipation: number): ReturnType<typeof fundamentalFrequencies> | { error: string } {
  const r = planModalResult(plan, liveParticipation);
  if ('error' in r) return r;
  const modes = ((r.result as { modes?: Array<{ frequency: number; massRatioX?: number; massRatioY?: number }> }).modes ?? []);
  return fundamentalFrequencies(modes);
}
