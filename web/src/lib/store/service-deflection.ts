/**
 * The service deflection of each member: relative to its chord, under service loads.
 *
 * Two things were wrong with the number the deflection check read, and both are settled here:
 *
 *   · WHAT is measured. It is the member's bending — the distance from the displaced curve to
 *     the chord of its displaced ends (`engine/member-deflection.ts`) — not a node's absolute
 *     displacement, and not an estimate from the moment.
 *   · UNDER WHICH LOADS. The project's service envelopes when it states any
 *     (`engine/result-scopes.ts`): the largest over their combinations. Without one, every load
 *     case at factor 1 — the unfactored solve — which is what "service" meant before, stated.
 *     Without that either, the active combinations, which are factored: the deflection is then
 *     conservative and the basis says so.
 *
 * Member offsets: the curve is taken between the nodes. With rigid offsets the flexible part is
 * shorter than the node-to-node length and its ends move with the offsets' rotation; the chord
 * deflection read here is then an approximation of that part's own.
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { activePerCombo3D } from './active-results';
import { memberLocalCurve, chordDeflection, eiOf, type ChordDeflection } from '../engine/member-deflection';
import { shouldEmbedFlat2DModelIn3D } from '../engine/solver-service';
import { projectNodeToScene } from '../geometry/coordinate-system';
import type { AnalysisResults3D } from '../engine/types-3d';

export type DeflectionBasis = 'service' | 'unfactored' | 'factored' | 'shown';

export interface ServiceSets { basis: DeflectionBasis; names: string[]; sets: Array<{ id: number; name: string; results: AnalysisResults3D }> }

/** The result sets the deflection check reads, and on what basis. */
export function serviceSets(): ServiceSets {
  const envs = (modelStore.resultScopes?.envelopes ?? []).filter((e) => e.purpose === 'service');
  const comboName = new Map(modelStore.combinations.map((c) => [c.id, c.name]));
  if (envs.length > 0) {
    const ids = [...new Set(envs.flatMap((e) => e.comboIds))];
    const sets = ids.flatMap((id) => {
      const r = resultsStore.perCombo3D.get(id);
      return r ? [{ id, name: comboName.get(id) ?? String(id), results: r }] : [];
    });
    if (sets.length > 0) return { basis: 'service', names: envs.map((e) => e.name), sets };
  }
  if (resultsStore.singleResults3D) return { basis: 'unfactored', names: [], sets: [{ id: 0, name: '', results: resultsStore.singleResults3D }] };
  const active = activePerCombo3D();
  if (active.size > 0) return { basis: 'factored', names: [], sets: [...active].map(([id, results]) => ({ id, name: comboName.get(id) ?? String(id), results })) };
  const shown = resultsStore.results3D;
  return { basis: 'shown', names: [], sets: shown ? [{ id: 0, name: '', results: shown }] : [] };
}

export type MemberDeflection = ChordDeflection & { setName: string };

/** Each member's largest chord deflection over the result sets, and the set that produced it. */
export function serviceDeflections(elementIds: Iterable<number>, sets: ServiceSets['sets']): Map<number, MemberDeflection> {
  const out = new Map<number, MemberDeflection>();
  // The solver's own frame: a flat model is solved embedded in XZ, and its displacements are too.
  const embed = shouldEmbedFlat2DModelIn3D(modelStore.model);
  // The solver works in its own right-handed frame whatever triad is displayed; the curve is read
  // in that frame too.
  const leftHand = false;
  const indexed = sets.map((s) => ({
    name: s.name,
    disp: new Map(s.results.displacements.map((d) => [d.nodeId, d])),
    forces: new Map(s.results.elementForces.map((f) => [f.elementId, f])),
  }));
  for (const elementId of elementIds) {
    const elem = modelStore.elements.get(elementId);
    if (!elem) continue;
    const nI = modelStore.nodes.get(elem.nodeI), nJ = modelStore.nodes.get(elem.nodeJ);
    if (!nI || !nJ) continue;
    const pI = projectNodeToScene(nI, embed), pJ = projectNodeToScene(nJ, embed);
    const ei = eiOf(modelStore.materials.get(elem.materialId), modelStore.sections.get(elem.sectionId));
    const localY = elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined
      ? { x: elem.localYx, y: elem.localYy, z: elem.localYz } : undefined;
    const roll = (elem.rollAngle ?? 0) + (modelStore.sections.get(elem.sectionId)?.rotation ?? 0);
    let best: MemberDeflection | null = null;
    for (const s of indexed) {
      const dI = s.disp.get(elem.nodeI), dJ = s.disp.get(elem.nodeJ), ef = s.forces.get(elementId);
      if (!dI || !dJ || !ef) continue;
      const curve = memberLocalCurve(pI, pJ, dI, dJ, ef, ei, localY, roll, leftHand, 40);
      if (!curve) continue;
      const d = chordDeflection(curve);
      if (!best || d.max > best.max) best = { ...d, setName: s.name };
    }
    if (best) out.set(elementId, best);
  }
  return out;
}
