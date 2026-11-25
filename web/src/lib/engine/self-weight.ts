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
 * gets its wL²/8 at midspan, which weight lumped at the ends did not give it.
 */
import { tp } from '../i18n';
import { createSectionWeight, requireMaterialDensity } from '../section/weight';
import type { ModelData } from './solver-service';
import type { SolverLoad3D } from './types-3d';
import type { GroupMembers, Load } from '../store/model.svelte';
import type { SelfWeightLoad } from './analysis-settings';
import { GRAVITY_SELF_WEIGHT } from './analysis-settings';
import { isCompositeCase } from './loads/combination-cases';
import { globalDistributedToSolver, PLANAR_LINE_COMPONENT_CUTOFF, type MemberRef, type Vec3 } from './member-loads';
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

export class InvalidSelfWeightGroup extends Error {
  constructor(groupId: number) {
    super(tp('svc.engine.invalidSelfWeightGroup', { id: groupId }));
  }
}

type SelfWeightGroups = {
  groups?: ReadonlyMap<number, { members?: unknown }>;
};

type SelfWeightScope = { members: Set<number> | null; plates: Set<number> | null; quads: Set<number> | null };

const groupMemberLists = { nodes: true, elements: true, plates: true, quads: true } satisfies Record<keyof GroupMembers, true>;

function isGroupMembership(value: unknown): value is GroupMembers {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  for (const [key, ids] of Object.entries(value)) {
    if (!Object.hasOwn(groupMemberLists, key)) return false;
    if (ids === undefined) continue;
    if (!Array.isArray(ids)) return false;
    for (const id of ids) {
      if (!Number.isSafeInteger(id) || id < 0) return false;
    }
  }
  return true;
}

export function resolveSelfWeightScope(model: SelfWeightGroups, s: SelfWeightLoad): SelfWeightScope | { invalidGroup: number } {
  if (s.groupId !== undefined) {
    const members = model.groups?.get(s.groupId)?.members;
    if (!isGroupMembership(members)) return { invalidGroup: s.groupId };
    return {
      members: new Set(members.elements),
      plates: new Set(members.plates),
      quads: new Set(members.quads),
    };
  }
  if (s.elements) return { members: new Set(s.elements), plates: new Set(), quads: new Set() };
  return { members: null, plates: null, quads: null };
}

export function selfWeightScope(model: SelfWeightGroups, s: SelfWeightLoad): SelfWeightScope {
  const scope = resolveSelfWeightScope(model, s);
  if ('invalidGroup' in scope) throw new InvalidSelfWeightGroup(scope.invalidGroup);
  return scope;
}

export type SelfWeightSource = {
  caseId: number;
  kind: 'member' | 'plate' | 'quad';
  id: number;
  direction: SelfWeightLoad['direction'];
  intensity: number;
  factor: number;
};

export type RecordSelfWeight<T> = (source: SelfWeightSource, rows: readonly T[]) => void;

export function selfWeightDirection(source: SelfWeightSource): Vec3 {
  return UNIT[source.direction];
}

export function planarSelfWeightComponents(
  direction: SelfWeightLoad['direction'], intensity: number, dx: number, dy: number,
): { axial: number; transverse: number } | null {
  const length = Math.hypot(dx, dy);
  if (!(length >= 1e-10) || direction === 'Y') return null;
  const c = dx / length, s = dy / length;
  const axial = intensity * (direction === 'X' ? c : s);
  const transverse = intensity * (direction === 'X' ? -s : c);
  return Math.max(Math.abs(axial), Math.abs(transverse)) > PLANAR_LINE_COMPONENT_CUTOFF ? { axial, transverse } : null;
}

export function* selfWeightSources(
  model: ModelData, entries: readonly SelfWeightLoad[], includeShells: boolean,
): Iterable<SelfWeightSource> {
  const weight = createSectionWeight(model.materials);
  for (const entry of entries) {
    const { caseId, direction, factor } = entry;
    const scope = selfWeightScope(model, entry);
    for (const el of model.elements.values()) {
      if (scope.members && !scope.members.has(el.id)) continue;
      const sec = model.sections.get(el.sectionId);
      if (!sec || !model.materials.get(el.materialId)) continue;
      const intensity = weight(sec, el.materialId) * factor;
      if (intensity !== 0) yield { caseId, id: el.id, direction, kind: 'member', intensity, factor };
    }
    if (!includeShells || factor === 0) continue;
    for (const kind of ['plate', 'quad'] as const) {
      const shells = kind === 'plate' ? model.plates : model.quads;
      const include = kind === 'plate' ? scope.plates : scope.quads;
      for (const shell of shells?.values() ?? []) {
        if (include && !include.has(shell.id)) continue;
        const material = model.materials.get(shell.materialId);
        if (!material) continue;
        const intensity = requireMaterialDensity(shell.materialId, material) * shell.thickness * factor;
        if (intensity !== 0) yield { caseId, id: shell.id, direction, kind, intensity, factor };
      }
    }
  }
}

export function selfWeightSolverLoads(
  model: ModelData, source: SelfWeightSource,
  memberRef: (elementId: number) => MemberRef | null,
  axialOnly: (elementId: number) => boolean,
): SolverLoad3D[] {
  const dir = selfWeightDirection(source);
  if (source.kind === 'member') {
    const m = memberRef(source.id);
    if (!m || !(m.axes.L > 1e-10)) return [];
    const g: Vec3 = [dir[0] * source.intensity, dir[1] * source.intensity, dir[2] * source.intensity];
    return globalDistributedToSolver(m, g, g, 0, m.axes.L, axialOnly(source.id));
  }
  const plate = source.kind === 'plate' ? model.plates?.get(source.id) : undefined;
  const quad = source.kind === 'quad' ? model.quads?.get(source.id) : undefined;
  const loads = plate
    ? plateSelfWeightLoads(new Map([[plate.id, plate]]), model.nodes, model.materials)
    : quad
      ? quadSelfWeightLoads(new Map([[quad.id, quad]]), model.nodes, model.materials)
      : [];
  return loads.map(load => {
    if (load.type !== 'nodal') return load;
    const w = -load.data.fz * source.factor;
    return { ...load, data: { ...load.data, fx: dir[0] * w, fy: dir[1] * w, fz: dir[2] * w } };
  });
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
