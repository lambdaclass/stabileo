/**
 * What the floor pass reads: which shells exist, the stress on them, the area load they
 * carry, and whether the analysis behind them has gone stale.
 */

/*
 * ── Why these left the store ─────────────────────────────────────────
 *
 * `detailing.svelte.ts` was 1566 lines against an 800-line ceiling, and 772 of them were
 * readings: functions that hold no state, own no user intent, and answer one question each.
 * The store's job is state and routing; a reading of the model is neither.
 *
 * They are not pure in the strict sense — they read `modelStore`, `resultsStore`,
 * `verificationStore` and `regulationsStore` rather than taking them as arguments — and that
 * is unchanged by the move, deliberately: rewriting twenty signatures to thread four stores
 * through would be a behaviour-shaped change wearing a refactor's clothes.
 *
 * Split three ways rather than one, because one file would have been 820 lines and the
 * problem would only have changed address. The three groups are the three questions the
 * detailing run asks: what the project states, what the floor holds, what lands on a footing.
 *
 * Nothing was rewritten. The bodies are the ones that were in the store, moved verbatim.
 */

import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import {
  classifyShell, type FloorShell, type FloorShellStress,
} from '../engine/detailing/run-floor-design';


/** Every shell in the model — quads and plates alike are shells and both are designed. */
export function collectShells(): FloorShell[] {
  const out: FloorShell[] = [];
  for (const q of modelStore.model.quads.values()) {
    out.push({ id: q.id, nodes: q.nodes, materialId: q.materialId, thickness: q.thickness });
  }
  for (const p of modelStore.model.plates.values()) {
    out.push({ id: p.id, nodes: p.nodes, materialId: p.materialId, thickness: p.thickness });
  }
  // Sorted so the run is deterministic regardless of Map insertion order.
  return out.sort((a, b) => a.id - b.id);
}


/**
 * The shells a run should design, filtered through the engine's own classifier.
 *
 * A shell the classifier cannot place — neither clearly horizontal nor clearly vertical — is
 * KEPT whenever either family is wanted, so a sloping roof panel is not silently dropped by a
 * filter that was only meant to exclude walls.
 */
export function scopedShells(wants: (f: 'slab' | 'wall' | 'footing') => boolean): FloorShell[] {
  const all = collectShells();
  if (wants('slab') && wants('wall')) return all;
  if (!wants('slab') && !wants('wall')) return [];
  return all.filter((sh) => {
    const pts = sh.nodes
      .map((n) => modelStore.model.nodes.get(n))
      .filter(Boolean)
      .map((n) => ({ x: n!.x, y: n!.y, z: n!.z ?? 0 }));
    if (pts.length < 3) return true;
    const { family } = classifyShell(sh.id, pts as never);
    if (family === 'slab') return wants('slab');
    if (family === 'wall') return wants('wall');
    // `inclined` and `degenerate` belong to neither and are reported by the run itself, so
    // they survive any filter rather than disappearing without a word.
    return true;
  });
}


/** Shell stresses from the active result set, quads and plates in one list. */
export function collectStresses(): FloorShellStress[] {
  const r = resultsStore.results3D;
  if (!r) return [];
  return [...(r.quadStresses ?? []), ...(r.plateStresses ?? [])]
    .map((s) => ({
      elementId: s.elementId,
      sigmaXx: s.sigmaXx, sigmaYy: s.sigmaYy, tauXy: s.tauXy,
      mx: s.mx, my: s.my, mxy: s.mxy,
    }))
    .sort((a, b) => a.elementId - b.elementId);
}


/**
 * Do the solved results on hand describe the model's own combinations?
 *
 * A real measurement rather than a flag. Per-combination results are keyed by combination id,
 * so a combination the model defines with no result, or a result for a combination the model no
 * longer defines, means the two have diverged — and reading per-combination column forces from
 * that set would attribute one combination's forces to another. This is the condition under
 * which a punching check would be a check of a different building.
 *
 * With no per-combination results at all there is nothing to be stale: the single active result
 * set is offered as itself, and the collector says so.
 */
export function analysisStaleForFloor(): boolean {
  const solved = resultsStore.perCombo3D;
  if (solved.size === 0) return false;
  const defined = new Set(modelStore.model.combinations.map((c) => c.id));
  if (defined.size === 0) return true;
  for (const id of defined) if (!solved.has(id)) return true;
  for (const id of solved.keys()) if (!defined.has(id)) return true;
  return false;
}


/**
 * Factored area load per shell, kPa, enveloped over the project's combinations.
 *
 * The `surface3d` loads carry a case id, and a combination states a factor per case, so
 * the factored load is `max over combinations of Σ factor·q` — a real envelope built from
 * the project's own combinations rather than a nominal figure.
 *
 * With no combinations defined the unfactored sum is used, and `designSlabPanel` receives
 * a demand that is honestly service-level. That is visible: the shear memo prints the `qu`
 * it was given.
 */
export function factoredAreaLoads(): Map<number, number> {
  const byCase = new Map<number, Map<number, number>>();
  for (const load of modelStore.model.loads) {
    if (load.type !== 'surface3d') continue;
    const { quadId, q, caseId } = load.data;
    const key = caseId ?? 0;
    const per = byCase.get(quadId) ?? new Map<number, number>();
    per.set(key, (per.get(key) ?? 0) + q);
    byCase.set(quadId, per);
  }

  const combos = modelStore.model.combinations;
  const out = new Map<number, number>();
  for (const [quadId, per] of byCase) {
    if (combos.length === 0) {
      out.set(quadId, [...per.values()].reduce((s, v) => s + v, 0));
      continue;
    }
    let worst = 0;
    for (const combo of combos) {
      let total = 0;
      for (const { caseId, factor } of combo.factors) total += factor * (per.get(caseId) ?? 0);
      if (total > worst) worst = total;
    }
    out.set(quadId, worst);
  }
  return out;
}
