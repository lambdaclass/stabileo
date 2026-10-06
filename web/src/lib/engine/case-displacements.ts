/**
 * Displacements a load case imposes on supported nodes (`NodeDisplacement3D`).
 *
 * ── Unlike a settlement ────────────────────────────────────────────
 *
 * A support's own prescribed displacement happens once, whatever the combination
 * (`settlement-case.ts`). One that belongs to a load case is an action of that case: a 1,2 factor
 * on the case imposes 1,2 times the displacement. Linear superposition makes it exact: the case is
 * its forces on the free structure plus its displacements on the structure with no forces, and a
 * combination adds each case's two parts with the case's factor.
 *
 * ── On a restrained direction ──────────────────────────────────────
 *
 * A displacement is imposed where a support holds the node, on a direction it restrains: a free
 * direction has nothing to impose it with. One anywhere else is refused, by name.
 *
 * Pure: no store.
 */
import type { NodeDisplacement3D, Support, Load } from '../store/model.svelte';
import { supportDofs3D } from './support-dofs-3d';

export const IMPOSED_FIELDS = ['dx', 'dy', 'dz', 'drx', 'dry', 'drz'] as const;
export type ImposedField = (typeof IMPOSED_FIELDS)[number];

const DOF: Record<ImposedField, 'rx' | 'ry' | 'rz' | 'rrx' | 'rry' | 'rrz'> = {
  dx: 'rx', dy: 'ry', dz: 'rz', drx: 'rrx', dry: 'rry', drz: 'rrz',
};

const isImposed = (l: Load): l is { type: 'displacement3d'; data: NodeDisplacement3D } => l.type === 'displacement3d';

/** Whether any load imposes a displacement. */
export function hasCaseDisplacements(loads: readonly Load[]): boolean {
  return loads.some((l) => isImposed(l) && IMPOSED_FIELDS.some((f) => l.data[f]));
}

/** The imposed displacements of the loads, each times its case's factor (a case not listed: none). */
export function imposedOf(loads: readonly Load[], factorOf: (caseId: number) => number = () => 1): Load[] {
  const out: Load[] = [];
  for (const l of loads) {
    if (!isImposed(l)) continue;
    const k = factorOf(l.data.caseId ?? 1);
    if (!k) continue;
    const data: NodeDisplacement3D = { id: l.data.id, nodeId: l.data.nodeId, ...(l.data.caseId !== undefined ? { caseId: l.data.caseId } : {}) };
    for (const f of IMPOSED_FIELDS) if (l.data[f]) data[f] = l.data[f]! * k;
    out.push({ type: 'displacement3d', data });
  }
  return out;
}

/** Restraints of a support, by direction: its own per-direction ones, or its type's. */
function restrains(s: Support, project2DToXZ: boolean): Record<'rx' | 'ry' | 'rz' | 'rrx' | 'rry' | 'rrz', boolean> {
  if (s.dofRestraints) {
    const r = s.dofRestraints;
    return { rx: r.tx, ry: r.ty, rz: r.tz, rrx: r.rx, rry: r.ry, rrz: r.rz };
  }
  return supportDofs3D(s, project2DToXZ);
}

/** Every imposed displacement with nothing to impose it: no support at the node, or a free direction. */
export function imposedUnsupported(
  supports: ReadonlyMap<number, Support>, loads: readonly Load[], project2DToXZ = false,
): Array<{ loadId: number; nodeId: number; field: ImposedField }> {
  const byNode = new Map([...supports.values()].map((s) => [s.nodeId, s]));
  const out: Array<{ loadId: number; nodeId: number; field: ImposedField }> = [];
  for (const l of loads) {
    if (!isImposed(l)) continue;
    const s = byNode.get(l.data.nodeId);
    const r = s ? restrains(s, project2DToXZ) : null;
    // A support in local axes imposes along those; a global displacement is not one of them.
    const local = s?.dofFrame === 'local';
    for (const f of IMPOSED_FIELDS) {
      if (!l.data[f]) continue;
      if (!r || local || !r[DOF[f]]) out.push({ loadId: l.data.id, nodeId: l.data.nodeId, field: f });
    }
  }
  return out;
}

/**
 * The supports with the imposed displacements of `imposed` added to their own prescribed ones,
 * summed per node and direction. A support with nothing imposed is returned as it is.
 */
export function supportsWithImposed<S extends Support>(supports: Map<number, S>, imposed: readonly Load[]): Map<number, S> {
  const add = new Map<number, Partial<Record<ImposedField, number>>>();
  for (const l of imposed) {
    if (!isImposed(l)) continue;
    const acc = add.get(l.data.nodeId) ?? {};
    for (const f of IMPOSED_FIELDS) if (l.data[f]) acc[f] = (acc[f] ?? 0) + l.data[f]!;
    add.set(l.data.nodeId, acc);
  }
  if (add.size === 0) return supports;
  return new Map([...supports].map(([id, s]) => {
    const a = add.get(s.nodeId);
    if (!a) return [id, s];
    const c = { ...s } as S & Partial<Record<ImposedField, number>>;
    // `dy` and `drz` are a plane support's aliases of dz and dry; a space support reads all six.
    for (const f of IMPOSED_FIELDS) if (a[f] !== undefined) c[f] = (c[f] ?? 0) + a[f]!;
    return [id, c];
  }));
}

/** The cases that impose a displacement. */
export function casesWithDisplacements(loads: readonly Load[]): Set<number> {
  const out = new Set<number>();
  for (const l of loads) if (isImposed(l) && IMPOSED_FIELDS.some((f) => l.data[f])) out.add(l.data.caseId ?? 1);
  return out;
}
