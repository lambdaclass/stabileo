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
import { t, tp } from '../i18n';
import { createSectionWeight, requireMaterialDensity } from '../section/weight';
import { plainDeepCopy } from '../utils/plain-deep-copy';
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

export const selfWeightMemberProjection = Symbol('selfWeightMemberProjection');

type IdLookup = Pick<ReadonlySet<number>, 'has' | 'keys'>;
const targetFamilies = ['elements', 'plates', 'quads'] as const;
type TargetFamily = (typeof targetFamilies)[number];
type HasTarget = (family: TargetFamily, id: number) => boolean;
type SelfWeightTargets = {
  elements: IdLookup;
  plates?: IdLookup;
  quads?: IdLookup;
  groups?: ReadonlyMap<number, { members?: unknown }>;
  [selfWeightMemberProjection]?: SelfWeightMemberProjection;
};

export type SelfWeightMemberProjection = {
  source: SelfWeightTargets;
  replacements: ReadonlyMap<number, readonly number[]>;
};

type SelfWeightScope = { members: ReadonlySet<number> | null; plates: ReadonlySet<number> | null; quads: ReadonlySet<number> | null };
type MissingTarget = { missingTarget: { family: TargetFamily; id: number } };
type ScopeFailure = { invalidGroup: number } | { invalidMemberId: unknown } | MissingTarget;

const groupMemberLists = { nodes: true, elements: true, plates: true, quads: true } satisfies Record<keyof GroupMembers, true>;
const targetLabels = { elements: 'table.elemLabel', plates: 'quickEdit.plate', quads: 'quickEdit.quad' } as const;

function isSelectorId(id: unknown): id is number {
  return typeof id === 'number' && Number.isSafeInteger(id) && id >= 0;
}

function isMembershipRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isGroupMembership(value: unknown): value is GroupMembers {
  if (!isMembershipRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  for (const [key, ids] of Object.entries(value)) {
    if (!Object.hasOwn(groupMemberLists, key)) return false;
    if (ids === undefined) continue;
    if (!Array.isArray(ids)) return false;
    for (const id of ids) {
      if (!isSelectorId(id)) return false;
    }
  }
  return true;
}

function missingTarget(hasTarget: HasTarget, family: TargetFamily, ids: unknown): MissingTarget | null {
  if (!Array.isArray(ids)) return null;
  for (const id of ids) {
    if (isSelectorId(id) && !hasTarget(family, id)) return { missingTarget: { family, id } };
  }
  return null;
}

function missingGroupTarget(hasTarget: HasTarget, members: Partial<Record<TargetFamily, unknown>>): MissingTarget | null {
  for (const family of targetFamilies) {
    const missing = missingTarget(hasTarget, family, members[family]);
    if (missing) return missing;
  }
  return null;
}

export function resolveSelfWeightScope(model: SelfWeightTargets, s: Pick<SelfWeightLoad, 'elements' | 'groupId'>): SelfWeightScope | ScopeFailure {
  const projection = model[selfWeightMemberProjection];
  if (projection) {
    const scope = resolveSelfWeightScope(projection.source, s);
    if (!('members' in scope) || scope.members === null) return scope;
    const members = new Set<number>();
    for (const id of scope.members) {
      for (const target of projection.replacements.get(id) ?? [id]) members.add(target);
    }
    return { ...scope, members };
  }

  const hasTarget: HasTarget = (family, id) => model[family]?.has(id) ?? false;
  if (s.elements !== undefined) {
    if (!Array.isArray(s.elements)) return { invalidMemberId: s.elements };
    for (const id of s.elements) {
      if (!isSelectorId(id)) return { invalidMemberId: id };
    }
    const missing = missingTarget(hasTarget, 'elements', s.elements);
    if (missing) return missing;
  }
  if (s.groupId !== undefined) {
    const members = model.groups?.get(s.groupId)?.members;
    if (!isGroupMembership(members)) return { invalidGroup: s.groupId };
    return missingGroupTarget(hasTarget, members)
      ?? { members: new Set(members.elements), plates: new Set(members.plates), quads: new Set(members.quads) };
  }
  if (s.elements !== undefined) return { members: new Set(s.elements), plates: new Set(), quads: new Set() };
  return { members: null, plates: null, quads: null };
}

export function selfWeightTargetClaimedByRemap(
  model: Pick<SelfWeightTargets, 'groups'>, rule: Pick<SelfWeightLoad, 'elements' | 'groupId'>,
  claimed: Record<TargetFamily, ReadonlySet<number>>,
): MissingTarget | null {
  const remainsUnclaimed: HasTarget = (family, id) => !claimed[family].has(id);
  const explicit = missingTarget(remainsUnclaimed, 'elements', rule.elements);
  if (explicit) return explicit;
  const members = rule.groupId === undefined ? undefined : model.groups?.get(rule.groupId)?.members;
  return isMembershipRecord(members) ? missingGroupTarget(remainsUnclaimed, members) : null;
}

export function selfWeightScopeRefusal(issue: ScopeFailure): string {
  if ('invalidGroup' in issue) return tp('svc.engine.invalidSelfWeightGroup', { id: issue.invalidGroup });
  if ('invalidMemberId' in issue) return tp('svc.engine.invalidSelfWeightMemberId', { id: String(issue.invalidMemberId) });
  const { family, id } = issue.missingTarget;
  return tp('svc.engine.missingSelfWeightTarget', { kind: t(targetLabels[family]), id });
}

export class InvalidSelfWeightScope extends Error {
  constructor(issue: ScopeFailure) {
    super(selfWeightScopeRefusal(issue));
  }
}

export function selfWeightScope(model: SelfWeightTargets, s: SelfWeightLoad): SelfWeightScope {
  const scope = resolveSelfWeightScope(model, s);
  if (!('members' in scope)) throw new InvalidSelfWeightScope(scope);
  return scope;
}

export function projectSelfWeightMembers(model: SelfWeightTargets, replacements: ReadonlyMap<number, readonly number[]>): SelfWeightMemberProjection {
  const { elements, plates, quads, groups, [selfWeightMemberProjection]: previous } = model;
  return { source: { elements, plates, quads, groups, [selfWeightMemberProjection]: previous }, replacements };
}

export function snapshotSelfWeightProjection(projection: SelfWeightMemberProjection): SelfWeightMemberProjection {
  const { elements, plates, quads, groups, [selfWeightMemberProjection]: previous } = projection.source;
  return {
    source: {
      elements: new Set(elements.keys()),
      plates: plates && new Set(plates.keys()),
      quads: quads && new Set(quads.keys()),
      groups: groups && new Map([...groups].map(([id, group]) => {
        const members = group?.members;
        return [id, { members: isGroupMembership(members) ? plainDeepCopy(members) : undefined }];
      })),
      [selfWeightMemberProjection]: previous && snapshotSelfWeightProjection(previous),
    },
    replacements: new Map([...projection.replacements].map(([id, targets]) => [id, [...targets]])),
  };
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
    if (!includeShells && factor === 0 && entry.elements === undefined) continue;
    const scope = selfWeightScope(model, entry);
    if (!includeShells && factor === 0) continue;
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
  model: Pick<ModelData, 'elements' | 'materials' | 'sections' | 'groups' | 'plates' | 'quads' | typeof selfWeightMemberProjection>,
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
