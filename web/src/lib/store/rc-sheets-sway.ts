/**
 * What the column sheets read for sway, from the combinations they design for: each combination's
 * lateral part (its wind and earthquake cases at their factors), the moments that sway the storey
 * (`Ms`, §6.6.4.6.1), and, for a combination solved with P-Delta, its first-order state rebuilt
 * from the cases, for the stability index and for the limit of §6.2.6. Each storey's stability
 * index Q (§6.6.4.4.1) comes from those first-order states (`engine/design/sway.ts`).
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { superposed } from '../engine/combination-methods';
import type { SheetStoreyStability } from '../rc-sheets/demands';
import { storeyStability, swayK } from '../engine/design/sway';
import { computeJointPsiFromModel } from '../engine/codes/argentina/cirsoc201';
import type { AnalysisResults3D } from '../engine/types-3d';
import type { DemandSet } from '../rc-sheets/demands';

const LATERAL = new Set(['W', 'E']);

/** A combination's wind and earthquake cases at their factors, and its first-order state where it was solved with P-Delta; null where a case is not solved. */
export function swayParts(factors: ReadonlyArray<{ caseId: number; factor: number }>, result: AnalysisResults3D): Pick<DemandSet, 'lateral' | 'firstOrder'> {
  const types = new Map(modelStore.model.loadCases.map((c) => [c.id, c.type.toUpperCase()]));
  const part = (keep: (id: number) => boolean) => {
    const parts = factors.filter((f) => f.factor !== 0 && keep(f.caseId)).map((f) => ({ r: resultsStore.perCase3D.get(f.caseId), f: f.factor }));
    if (!parts.length || parts.some((p) => !p.r)) return undefined;
    const sum = superposed(parts as Array<{ r: AnalysisResults3D; f: number }>);
    delete sum.secondOrder;
    return sum;
  };
  const lateral = part((id) => LATERAL.has(types.get(id) ?? ''));
  const firstOrder = result.secondOrder ? part(() => true) : undefined;
  return { ...(lateral ? { lateral } : {}), ...(firstOrder ? { firstOrder } : {}) };
}

/** Each column element's storey read for sway from the sets' first-order states; `kMin` the least sway k the design takes for ΣPc. */
export function sheetStoreys(columns: readonly number[], sets: readonly DemandSet[], kMin: number): Map<number, SheetStoreyStability> {
  const out = new Map<number, SheetStoreyStability>();
  if (!columns.length || !sets.length) return out;
  const m = modelStore.model;
  const supports = new Map([...modelStore.supports.values()].map((s) => [s.nodeId, s]));
  const psi = (id: number) => computeJointPsiFromModel(id, m.nodes as never, m.elements as never, m.sections as never, m.materials as never, supports as never);
  const perCombo = new Map(sets.map((s, i) => [i, s.firstOrder ?? s.result]));
  const readings = new Map<number, SheetStoreyStability['byCombo']>();
  const storeys = storeyStability({
    nodes: m.nodes, elements: m.elements as never, sections: m.sections as never, materials: m.materials as never,
    columns, perCombo, comboNames: new Map(sets.map((s, i) => [i, s.name])), psi,
    effectiveLength: (psiA, psiB) => Math.max(kMin, swayK(psiA, psiB)),
    onCombination(column, name, reading) {
      const byCombo: SheetStoreyStability['byCombo'] = readings.get(column) ?? new Map();
      if (reading.Q > (byCombo.get(name)?.Q ?? -1)) byCombo.set(name, reading);
      readings.set(column, byCombo);
    },
  });
  for (const storey of storeys) {
    const row = { ...storey, byCombo: readings.get(storey.columns[0]!) ?? new Map() };
    for (const id of storey.columns) out.set(id, row);
  }
  return out;
}
