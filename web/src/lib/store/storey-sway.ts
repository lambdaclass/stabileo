/**
 * The model's storeys read for sway (`engine/design/sway.ts`) from the published combinations,
 * and the δs each sway storey gives its slender columns. A column is slender in a sway storey
 * when k·lu/r passes 22 (§6.6.4.1(a)), k the sway factor from its joints' Ψ and r = 0,3 of its
 * smaller side.
 */
import { modelStore } from './model.svelte';
import { activePerCombo3D, activeCombinations } from './active-results';
import { storeyStability, swayK, type StoreyStability } from '../engine/design/sway';
import { computeJointPsiFromModel } from '../engine/codes/argentina/cirsoc201';
import type { MemberContext } from '../engine/design/member-context';

export function modelStoreyStability(columns: readonly number[]): StoreyStability[] {
  const m = modelStore.model;
  const psi = (id: number) => computeJointPsiFromModel(id, m.nodes as never, m.elements as never, m.sections as never, m.materials as never, m.supports as never);
  return storeyStability({
    nodes: m.nodes, elements: m.elements as never, sections: m.sections as never, materials: m.materials as never,
    columns, perCombo: activePerCombo3D(), comboNames: new Map(activeCombinations().map((c) => [c.id, c.name])), psi,
  });
}

/** Set δs on the slender columns of each sway storey. Returns the storeys read. */
export function applyStoreySway(contexts: ReadonlyMap<number, MemberContext>): StoreyStability[] {
  const cols = [...contexts.values()].filter((c) => c.elementType === 'column').map((c) => c.elementId);
  if (!cols.length) return [];
  const storeys = modelStoreyStability(cols);
  const m = modelStore.model;
  for (const s of storeys) {
    if (!s.sway) continue;
    for (const id of s.columns) {
      const ctx = contexts.get(id);
      if (!ctx) continue;
      const p = computeJointPsiFromModel(id, m.nodes as never, m.elements as never, m.sections as never, m.materials as never, m.supports as never);
      const r = 0.3 * Math.min(ctx.section.b, ctx.section.h);
      if (r > 0 && (swayK(p.psiA, p.psiB) * ctx.L) / r > 22) ctx.slenderDeltaS = s.deltaS;
    }
  }
  return storeys;
}
