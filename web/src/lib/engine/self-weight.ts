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
import { tp } from '../i18n';
import { createSectionWeight } from '../section/weight';
import type { ModelData } from './solver-service';
import type { SolverLoad3D } from './types-3d';
import type { Load } from '../store/model.svelte';
import type { SelfWeightLoad } from './analysis-settings';
import { GRAVITY_SELF_WEIGHT } from './analysis-settings';
import { isCompositeCase } from './loads/combination-cases';
import { globalDistributedToSolver, type MemberRef, type Vec3 } from './member-loads';
import { plateSelfWeightLoads, quadSelfWeightLoads } from './solver-shells';

/** The self-weight loads of one case, or of a single solve of every load when `caseRef` is null. */
export function selfWeightFor(
  model: Pick<ModelData, 'analysis'>,
  caseRef: { id: number; type?: string; includes?: ReadonlyArray<unknown> } | null,
  includeSelfWeight: boolean,
): SelfWeightLoad[] {
  const usesStandaloneToggle = caseRef === null && model.analysis?.standaloneSelfWeight === 'gravity';
  const stated = model.analysis?.selfWeight;
  if (!usesStandaloneToggle && stated) return caseRef ? stated.filter((s) => s.caseId === caseRef.id) : stated;
  if (!includeSelfWeight) return [];
  // A composite case typed D has it through the cases it takes in (`case-effects.ts`).
  if (caseRef && (caseRef.type !== 'D' || isCompositeCase(caseRef))) return [];
  return [{ caseId: caseRef?.id ?? 0, ...GRAVITY_SELF_WEIGHT }];
}

const UNIT: Record<SelfWeightLoad['direction'], Vec3> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };

export class MissingSelfWeightGroupMembership extends Error {
  constructor(groupId: number) {
    super(tp('svc.engine.missingSelfWeightGroupMembership', { id: groupId }));
  }
}

type SelfWeightGroups = {
  groups?: ReadonlyMap<number, { members?: { elements?: readonly number[]; plates?: readonly number[]; quads?: readonly number[] } | null }>;
};

type SelfWeightScope = { members: Set<number> | null; plates: Set<number> | null; quads: Set<number> | null };

export function resolveSelfWeightScope(model: SelfWeightGroups, s: SelfWeightLoad): SelfWeightScope | { missingMembership: number } {
  if (s.groupId !== undefined) {
    const group = model.groups?.get(s.groupId);
    const members = group?.members;
    if (group && members == null) return { missingMembership: s.groupId };
    return {
      members: new Set(members?.elements ?? []),
      plates: new Set(members?.plates ?? []),
      quads: new Set(members?.quads ?? []),
    };
  }
  if (s.elements) return { members: new Set(s.elements), plates: new Set(), quads: new Set() };
  return { members: null, plates: null, quads: null };
}

export function selfWeightScope(model: SelfWeightGroups, s: SelfWeightLoad): SelfWeightScope {
  const scope = resolveSelfWeightScope(model, s);
  if ('missingMembership' in scope) throw new MissingSelfWeightGroupMembership(scope.missingMembership);
  return scope;
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

/**
 * The member loads `entries` put on the members, as loads a drawing reads (the despiece): a
 * uniform load of ρ·A times the factor along the row's direction, per metre of member, on every
 * member the row covers. `plane`: as a plane model's load, global and vertical (the plane solve
 * takes the weight straight down, `buildSolverLoads2D`); otherwise a global 3D member load. The
 * shells' weight is not here: the despiece draws members only.
 */
export function selfWeightMemberLoads(
  model: Pick<ModelData, 'elements' | 'materials' | 'sections' | 'groups'>,
  entries: readonly SelfWeightLoad[],
  opts: { plane: boolean; firstId: number },
): Load[] {
  const out: Load[] = [];
  const weight = createSectionWeight(model.materials);
  let id = opts.firstId;
  for (const s of entries) {
    const dir = UNIT[s.direction];
    const scope = selfWeightScope(model, s);
    for (const el of model.elements.values()) {
      if (scope.members && !scope.members.has(el.id)) continue;
      const sec = model.sections.get(el.sectionId);
      if (!sec || !model.materials.get(el.materialId)) continue;
      const w = weight(sec, el.materialId) * s.factor;
      if (w === 0) continue;
      if (opts.plane) {
        if (s.direction !== 'Z') continue;
        out.push({ type: 'distributed', data: { id: id++, elementId: el.id, qI: w, qJ: w, isGlobal: true, caseId: s.caseId } });
      } else {
        out.push({ type: 'distributed3d', data: { id: id++, elementId: el.id, frame: 'global',
          qXI: dir[0] * w, qXJ: dir[0] * w, qYI: dir[1] * w, qYJ: dir[1] * w, qZI: dir[2] * w, qZJ: dir[2] * w, caseId: s.caseId } });
      }
    }
  }
  return out;
}
