/**
 * Self-weight as a load: which of it a case carries, and what the engine is given for it.
 *
 * A project that states `analysis.selfWeight` gets exactly those loads, each in its own case,
 * along its direction, times its factor, over its members. A project that does not keeps the
 * rule the app ran on until now, self-weight on the whole model in every dead-load case (and in
 * a single solve of every load), so an older model computes as it always did until it is
 * migrated.
 *
 * On a member it is a uniform load of ρ·A along the member, applied as a member load: a beam
 * gets its wL²/8 at midspan, which weight lumped at the ends did not give it. On a shell it is
 * ρ·t over the area, split equally between the corners as before.
 */
import { createSectionWeight } from '../section/weight';
import type { ModelData } from './solver-service';
import type { SolverLoad3D } from './types-3d';
import type { SelfWeightLoad } from './analysis-settings';
import { GRAVITY_SELF_WEIGHT } from './analysis-settings';
import { globalDistributedToSolver, type MemberRef, type Vec3 } from './member-loads';
import { plateSelfWeightLoads, quadSelfWeightLoads } from './solver-shells';

/** The self-weight loads of one case, or of a single solve of every load when `caseRef` is null. */
export function selfWeightFor(
  model: Pick<ModelData, 'analysis'>,
  caseRef: { id: number; type?: string } | null,
  includeSelfWeight: boolean,
): SelfWeightLoad[] {
  const stated = model.analysis?.selfWeight;
  if (stated) return caseRef ? stated.filter((s) => s.caseId === caseRef.id) : stated;
  if (!includeSelfWeight) return [];
  if (caseRef && caseRef.type !== 'D') return [];
  return [{ caseId: caseRef?.id ?? 0, ...GRAVITY_SELF_WEIGHT }];
}

const UNIT: Record<SelfWeightLoad['direction'], Vec3> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };

/** What a self-weight load covers: member ids, and the shells, or everything. */
export function selfWeightScope(model: Pick<ModelData, 'groups'>, s: SelfWeightLoad): { members: Set<number> | null; plates: Set<number> | null; quads: Set<number> | null } {
  if (s.groupId !== undefined) {
    const g = model.groups?.get(s.groupId);
    return {
      members: new Set(g?.members.elements ?? []),
      plates: new Set(g?.members.plates ?? []),
      quads: new Set(g?.members.quads ?? []),
    };
  }
  if (s.elements) return { members: new Set(s.elements), plates: new Set(), quads: new Set() };
  return { members: null, plates: null, quads: null };
}

/**
 * The engine's loads for `entries`. `memberRef` gives a member's end nodes and axes as the solve
 * builds them; `axialOnly` names the members that take no bending, whose weight goes to the end
 * nodes.
 */
export function selfWeightSolverLoads(
  model: ModelData,
  entries: SelfWeightLoad[],
  memberRef: (elementId: number) => MemberRef | null,
  axialOnly: (elementId: number) => boolean,
): SolverLoad3D[] {
  const out: SolverLoad3D[] = [];
  const weight = createSectionWeight(model.materials);
  for (const s of entries) {
    const dir = UNIT[s.direction];
    const scope = selfWeightScope(model, s);
    for (const el of model.elements.values()) {
      if (scope.members && !scope.members.has(el.id)) continue;
      const mat = model.materials.get(el.materialId);
      const sec = model.sections.get(el.sectionId);
      const m = memberRef(el.id);
      if (!mat || !sec || !m || !(m.axes.L > 1e-10)) continue;
      const w = weight(sec, el.materialId) * s.factor;
      if (w === 0) continue;
      const g: Vec3 = [dir[0] * w, dir[1] * w, dir[2] * w];
      out.push(...globalDistributedToSolver(m, g, g, 0, m.axes.L, axialOnly(el.id)));
    }
    // Shells: the corners' shares of ρ·t·A, which the helpers give downward.
    const along = (loads: SolverLoad3D[]) => loads.map((l) => {
      if (l.type !== 'nodal') return l;
      const W = -l.data.fz * s.factor;
      return { ...l, data: { ...l.data, fx: dir[0] * W, fy: dir[1] * W, fz: dir[2] * W } };
    });
    if (model.plates?.size) {
      const plates = scope.plates ? new Map([...model.plates].filter(([id]) => scope.plates!.has(id))) : model.plates;
      if (plates.size) out.push(...along(plateSelfWeightLoads(plates as never, model.nodes, model.materials)));
    }
    if (model.quads?.size) {
      const quads = scope.quads ? new Map([...model.quads].filter(([id]) => scope.quads!.has(id))) : model.quads;
      if (quads.size) out.push(...along(quadSelfWeightLoads(quads as never, model.nodes, model.materials)));
    }
  }
  return out;
}
