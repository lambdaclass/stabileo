/**
 * Pre-sizing the model's footings from the solved reactions: each footing's service gravity
 * reaction at its nodes, the allowable pressure of its soil (or its piles' capacity from the
 * soil's strata), and its column's footprint. One undo step on the foundation channel, which
 * keeps the solve the sizes came from.
 */
import { modelStore } from './model.svelte';
import { collectNodeReactions } from './detailing-footing-inputs';
import { serviceGravity } from '../engine/detailing/service-reaction';
import { findProfile } from '../model/geotechnical';
import { presizeFooting, type PresizeNote, type Presized } from '../model/foundation/presize';
import { pileCapacity } from '../model/foundation/piles';
import { planHalf } from '../model/building/build-on-grid';

export type PresizeRefusalReason = 'noLoad' | 'thickness' | 'noPile' | 'noService' | 'noBearing' | 'noStrata';

export type PresizeOutcome =
  | { id: number; name: string; size: Presized; notes: PresizeNote[] }
  | { id: number; name: string; refused: PresizeRefusalReason };

/** Default piles when a cap names none: 50 cm, 12 m. */
const DEFAULT_PILE = { diameter: 0.5, length: 12 };

export function presizeModelFootings(ids?: number[]): PresizeOutcome[] {
  const footings = [...modelStore.model.footings.values()].filter((f) => !ids || ids.includes(f.id));
  const nodesOf = (f: (typeof footings)[number]) => [f.nodeId, ...(f.supportedNodeIds ?? [])];
  const reactions = collectNodeReactions(footings.flatMap(nodesOf));
  const out: PresizeOutcome[] = [];
  const updates: Array<[number, Presized]> = [];
  for (const f of footings) {
    const loads = [];
    let missing = false;
    for (const n of nodesOf(f)) {
      const s = reactions.get(n)?.cases ? serviceGravity(reactions.get(n)!.cases!) : null;
      const p = modelStore.nodes.get(n);
      if (!s || !p) { missing = true; break; }
      loads.push({ x: p.x, y: p.y, axial: s.axial });
    }
    if (missing) { out.push({ id: f.id, name: f.name, refused: 'noService' }); continue; }
    const profile = findProfile(modelStore.model.geotechnical, f.soilProfileId);
    const allowable = profile?.bearing.kind === 'allowablePressure' ? profile.bearing.allowableBearingKPa : null;
    let pile: { capacity: number; diameter: number; length: number } | undefined;
    if (f.kind === 'pileCap') {
      if (!profile?.strata?.length) { out.push({ id: f.id, name: f.name, refused: 'noStrata' }); continue; }
      const d = f.piles?.diameter || DEFAULT_PILE.diameter, len = f.piles?.length || DEFAULT_PILE.length;
      pile = { capacity: pileCapacity(profile.strata, d, len).total, diameter: d, length: len };
    } else if (allowable === null) { out.push({ id: f.id, name: f.name, refused: 'noBearing' }); continue; }
    const half = f.columnElementId !== undefined ? planHalf(f.columnElementId) : null;
    const r = presizeFooting({
      kind: f.kind, loads, allowableKPa: allowable ?? 0, thickness: f.thickness,
      ...(half ? { column: { x: 2 * half[0], y: 2 * half[1] } } : {}),
      ...(f.anchor ? { anchor: f.anchor } : {}), ...(pile ? { pile } : {}),
    });
    if ('refused' in r) { out.push({ id: f.id, name: f.name, refused: r.refused }); continue; }
    updates.push([f.id, r]);
    out.push({ id: f.id, name: f.name, size: r, notes: r.notes });
  }
  if (updates.length > 0) modelStore.batchFoundation(() => {
    for (const [id, r] of updates) {
      modelStore.updateFooting(id, {
        B: r.B, L: r.L, rotationDeg: r.rotationDeg, eccentricityB: r.eccentricityB, eccentricityL: r.eccentricityL,
        ...(r.piles ? { piles: r.piles } : {}),
      });
    }
  });
  return out;
}
