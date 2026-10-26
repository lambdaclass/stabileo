/**
 * The beam-column joints of the model checked for shear (§15.4, `checkJointShear`), each at the
 * top of a column where beams frame in, along each plan direction on its own.
 *
 * For each combination and direction: the beams framing in along it, each with its end moment at
 * the joint on its governing axis and its effective depth, give the tensions T = |M|/jd (both
 * added, the lateral case's sense, which reads a gravity joint on the safe side); the column below
 * gives its shear along that direction. Aj is the column's depth along the direction by its width
 * across it (§15.4.2.4). The column is continuous when another rises above; the beam when beams
 * frame in from both sides; the joint confined when beams frame into all four faces, each at least
 * three quarters of the column's width (§15.2.8).
 */
import { checkJointShear, type JointShearCheck } from '../detailing/joint-shear';
import { computeLocalAxes3D } from '../local-axes-3d';
import { memberOffsetAt, type OffsetCarrier } from '../member-offsets';
import type { AnalysisResults3D } from '../types-3d';

type N = { id: number; x: number; y: number; z?: number };
/** With its declared insertion (`Element.offset`): a beam framing in off the column's axis. */
type E = { id: number; nodeI: number; nodeJ: number; rollAngle?: number } & OffsetCarrier;

export interface JointMember { id: number; kind: 'beam' | 'column'; b: number; h: number; d: number; fc: number; axis: 'My' | 'Mz' }

export interface JointResult {
  nodeId: number; columnId: number; direction: 'X' | 'Y';
  check: JointShearCheck; combo: string | null;
}

export function modelJointChecks(input: {
  nodes: ReadonlyMap<number, N>;
  elements: ReadonlyMap<number, E>;
  members: ReadonlyMap<number, JointMember>;
  perCombo: ReadonlyMap<number, AnalysisResults3D>;
  comboNames?: ReadonlyMap<number, string>;
  /** Section rotations, for a `local` insertion offset on a rotated section. */
  sections?: ReadonlyMap<number, { rotation?: number }>;
}): JointResult[] {
  const at = new Map<number, number[]>();
  for (const [id] of input.members) {
    const e = input.elements.get(id);
    if (!e) continue;
    for (const n of [e.nodeI, e.nodeJ]) at.set(n, [...(at.get(n) ?? []), id]);
  }
  const Z = (n: N) => n.z ?? 0;
  const out: JointResult[] = [];
  for (const [nodeId, ids] of at) {
    const node = input.nodes.get(nodeId);
    if (!node) continue;
    // The column below this node, whose top it is.
    const below = ids.find((id) => {
      const m = input.members.get(id)!, e = input.elements.get(id)!;
      if (m.kind !== 'column') return false;
      const other = input.nodes.get(e.nodeI === nodeId ? e.nodeJ : e.nodeI);
      return !!other && Z(other) < Z(node) - 1e-3;
    });
    if (below === undefined) continue;
    const above = ids.some((id) => {
      const m = input.members.get(id)!, e = input.elements.get(id)!;
      const other = input.nodes.get(e.nodeI === nodeId ? e.nodeJ : e.nodeI);
      return m.kind === 'column' && !!other && Z(other) > Z(node) + 1e-3;
    });
    const col = input.members.get(below)!, ce = input.elements.get(below)!;
    const cA = input.nodes.get(ce.nodeI)!, cB = input.nodes.get(ce.nodeJ)!;
    const cax = computeLocalAxes3D({ id: cA.id, x: cA.x, y: cA.y, z: Z(cA) }, { id: cB.id, x: cB.x, y: cB.y, z: Z(cB) }, undefined, ce.rollAngle);
    const beams = ids.filter((id) => input.members.get(id)!.kind === 'beam').map((id) => {
      const e = input.elements.get(id)!;
      const far = input.nodes.get(e.nodeI === nodeId ? e.nodeJ : e.nodeI)!;
      const dx = far.x - node.x, dy = far.y - node.y, L = Math.hypot(dx, dy) || 1;
      return { id, ux: dx / L, uy: dy / L, atStart: e.nodeI === nodeId, m: input.members.get(id)! };
    });
    if (!beams.length) continue;
    const faces = new Set(beams.filter((b) => b.m.b >= 0.75 * Math.min(col.b, col.h)).map((b) => `${Math.round(b.ux)}:${Math.round(b.uy)}`));
    const confined = faces.size >= 4;
    for (const dir of ['X', 'Y'] as const) {
      const along = beams.filter((b) => Math.abs(dir === 'X' ? b.ux : b.uy) > 0.9);
      if (!along.length) continue;
      const u = dir === 'X' ? [1, 0, 0] : [0, 1, 0];
      const extent = (v: number[]) => Math.abs(u[0]! * v[0]! + u[1]! * v[1]!);
      const depth = extent(cax.ez) * col.h + extent(cax.ey) * col.b;
      const width = extent(cax.ez) * col.b + extent(cax.ey) * col.h;
      const continuousBeam = along.some((b) => (dir === 'X' ? b.ux : b.uy) > 0) && along.some((b) => (dir === 'X' ? b.ux : b.uy) < 0);
      // §15.4.2.4(b): the beam's axis to the nearer side face of the column, across the shear.
      // Each member on its declared insertion (`memberOffsetAt`): a beam placed flush with the
      // column's face has its axis b/2 off the column's, not on it. Where no member declares one
      // the beams are centred, the clause's ecc is half the width, and nothing is passed.
      const colOff = memberOffsetAt(ce, nodeId, input.nodes, input.sections);
      const perp = dir === 'X' ? 'y' : 'x';
      const offAxis = Math.max(0, ...along.map((b) => Math.abs(memberOffsetAt(input.elements.get(b.id)!, nodeId, input.nodes, input.sections)[perp] - colOff[perp])));
      const beamEccentricity = offAxis > 1e-9 ? Math.max(0, width / 2 - offAxis) : undefined;
      let worst: { check: JointShearCheck; combo: string | null } | null = null;
      for (const [cid, res] of input.perCombo) {
        const forces = new Map(res.elementForces.map((f) => [f.elementId, f]));
        const cf = forces.get(below);
        if (!cf) continue;
        const colTopAtJ = ce.nodeJ === nodeId;
        const vy = colTopAtJ ? cf.vyEnd : cf.vyStart, vz = colTopAtJ ? cf.vzEnd : cf.vzStart;
        const Vcol = Math.abs(vy * (cax.ey[dir === 'X' ? 0 : 1]!) + vz * (cax.ez[dir === 'X' ? 0 : 1]!));
        const incident = along.map((b) => {
          const f = forces.get(b.id);
          const M = f ? (b.m.axis === 'My' ? (b.atStart ? f.myStart : f.myEnd) : (b.atStart ? f.mzStart : f.mzEnd)) : 0;
          return { elementId: b.id, endMoment: M, d: b.m.d, side: (M >= 0 ? 1 : -1) as 1 | -1 };
        });
        const check = checkJointShear({
          fc: col.fc, columnDepth: depth, columnWidth: width, beamWidth: Math.max(...along.map((b) => b.m.b)),
          ...(beamEccentricity !== undefined ? { beamEccentricity } : {}),
          beams: incident, columnShear: Vcol,
          columnContinuity: above ? 'continuous' : 'other', beamContinuity: continuousBeam ? 'continuous' : 'other',
          confinement: confined ? 'confined' : 'unconfined',
        });
        const supported = (c: JointShearCheck) => c.status !== 'UNSUPPORTED';
        const better = !worst
          || (!supported(worst.check) && supported(check))
          || (supported(worst.check) && supported(check) && check.utilization > worst.check.utilization);
        if (better) {
          worst = { check, combo: input.comboNames?.get(cid) ?? String(cid) };
        }
      }
      if (worst) out.push({ nodeId, columnId: below, direction: dir, ...worst });
    }
  }
  return out.sort((a, b) => a.nodeId - b.nodeId || a.direction.localeCompare(b.direction));
}
