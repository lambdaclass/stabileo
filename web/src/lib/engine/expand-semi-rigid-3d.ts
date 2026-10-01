/**
 * Semi-rigid member ends, expanded at solve time the way released joints are
 * (`expand-joints-3d.ts`): the end moves to a coincident helper node, an eccentric connection
 * ties the helper to the node in every degree of freedom but the two bending rotations, and a
 * zero-length connector gives those two rotations the stiffness stated on the member, kN·m/rad.
 *
 * A zero-length connector acts in global axes (the engine takes local x = X, local y = −Z,
 * local z = Y for it), so the member's bending axes must lie along global axes; a member that is
 * not aligned is refused (`SemiRigidError`) — solving it with rigid ends, as it once was, gave
 * a stiffer structure and said nothing. The model is not touched: the helpers exist in the
 * solver input only and their results are pruned like the joints'.
 */
import type { SolverInput3D } from './types-3d';
import type { Constraint3D } from './types-3d';
import type { Element } from '../store/model.svelte';
import { computeLocalAxes3D, memberRoll } from './local-axes-3d';

export interface SemiRigidEnd { ky: number; kz: number }
export interface SemiRigid { i?: SemiRigidEnd; j?: SemiRigidEnd }

/** A semi-rigid end the expansion cannot model; the solves turn it into their error message. */
export class SemiRigidError extends Error {
  constructor(readonly code: 'invalid' | 'notAligned', readonly elementId: number) {
    super(code === 'invalid'
      ? `Member ${elementId}: semi-rigid stiffness must be finite and nonnegative`
      : `Member ${elementId}: semi-rigid ends need a member along the global axes`);
  }
}

export function modelHasSemiRigid(elements: Iterable<Element>): boolean {
  for (const e of elements) if (e.semiRigid?.i || e.semiRigid?.j) return true;
  return false;
}

/** The global axis a unit vector lies along, or null. */
const globalAxis = (v: readonly number[]) => {
  for (let k = 0; k < 3; k++) if (Math.abs(Math.abs(v[k]!) - 1) < 1e-6) return k;
  return null;
};

/** Stiffness about global X, Y, Z on a zero-length connector's own fields. */
const CONNECTOR_ROT = ['kMoment', 'kBendZ', 'kBendY'] as const;

type P3 = { x: number; y: number; z?: number };
type Axes = { localYx?: number; localYy?: number; localYz?: number; rollAngle?: number };

/** The global axes a member's local y and z lie along, or null when they do not. */
function bendingAxes(nI: P3, nJ: P3, e: Axes): { ay: number; az: number } | null {
  const localY = e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined ? { x: e.localYx, y: e.localYy, z: e.localYz } : undefined;
  const axes = computeLocalAxes3D({ id: 0, x: nI.x, y: nI.y, z: nI.z ?? 0 }, { id: 0, x: nJ.x, y: nJ.y, z: nJ.z ?? 0 }, localY, e.rollAngle ?? 0, false);
  const ay = globalAxis(axes.ey), az = globalAxis(axes.ez);
  return ay === null || az === null ? null : { ay, az };
}

/**
 * The members whose semi-rigid ends a solve refuses (`SemiRigidError`), because their bending axes do not lie along
 * global axes (see the header). The model check reports them before a solve, so it reads the axes the solve reads:
 * the member's roll with its section's rotation (`memberRoll`, as the solver input composes them). The member's
 * roll alone passed a member along X on a section turned 30°, which the solve then refused.
 */
export function semiRigidNotAligned(
  elements: Iterable<Element>, nodes: ReadonlyMap<number, P3>, sections: ReadonlyMap<number, { rotation?: number }>,
): number[] {
  const out: number[] = [];
  for (const e of elements) {
    if (!e.semiRigid?.i && !e.semiRigid?.j) continue;
    const nI = nodes.get(e.nodeI), nJ = nodes.get(e.nodeJ);
    if (nI && nJ && !bendingAxes(nI, nJ, { ...(e as Axes), rollAngle: memberRoll(e, sections) })) out.push(e.id);
  }
  return out.sort((a, b) => a - b);
}

export function expandSemiRigid3D(input: SolverInput3D, modelElements: Map<number, Element>): { helpers: Set<number> } {
  const helpers = new Set<number>();
  const els = [...modelElements.values()].filter((e) => e.semiRigid?.i || e.semiRigid?.j).sort((a, b) => a.id - b.id);
  if (els.length === 0) return { helpers };
  let nextNode = Math.max(0, ...input.nodes.keys()) + 1;
  const connectors = new Map(input.connectors ?? []);
  let nextConn = Math.max(0, ...connectors.keys()) + 1;
  const constraints: Constraint3D[] = [...(input.constraints ?? [])];

  for (const e of els) {
    const se = input.elements.get(e.id);
    if (!se) continue;
    const nI = input.nodes.get(se.nodeI), nJ = input.nodes.get(se.nodeJ);
    if (!nI || !nJ) continue;
    const aligned = bendingAxes(nI, nJ, se as Axes);
    // Refused, not solved rigid: main's rule (`SemiRigidError`); the model check names them first.
    if (!aligned) throw new SemiRigidError('notAligned', e.id);
    const { ay, az } = aligned;
    for (const end of ['i', 'j'] as const) {
      const spec = e.semiRigid?.[end];
      if (!spec) continue;
      if (![spec.ky, spec.kz].every((k) => Number.isFinite(k) && k >= 0)) {
        throw new SemiRigidError('invalid', e.id);
      }
      const node = end === 'i' ? nI : nJ;
      const helper = nextNode++;
      input.nodes.set(helper, { id: helper, x: node.x, y: node.y, z: node.z });
      helpers.add(helper);
      if (end === 'i') se.nodeI = helper; else se.nodeJ = helper;
      const releases = [false, false, false, false, false, false];
      releases[3 + ay] = true;
      releases[3 + az] = true;
      constraints.push({ type: 'eccentricConnection', masterNode: node.id, slaveNode: helper, offsetX: 0, offsetY: 0, offsetZ: 0, releases } as Constraint3D);
      const c: Record<string, number> = { kAxial: 0, kShear: 0, kShearZ: 0, kMoment: 0, kBendY: 0, kBendZ: 0 };
      // Zero is a released rotation, not an unspecified rigid connection.
      c[CONNECTOR_ROT[ay]] = spec.ky;
      c[CONNECTOR_ROT[az]] = spec.kz;
      const id = nextConn++;
      connectors.set(id, { id, nodeI: node.id, nodeJ: helper, ...c } as never);
    }
  }
  input.constraints = constraints;
  input.connectors = connectors as never;
  return { helpers };
}
