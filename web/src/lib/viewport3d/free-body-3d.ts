/**
 * The 3D despiece's actions, for `drawFreeBody`: the end action on every member and joint, the
 * support reactions and the applied loads, in scene space (Z up), ready to be projected.
 *
 * The end actions are `memberEndAction3D` (tested for ΣF = 0 and ΣM = 0 on real solves), split
 * along the member's own axes (N, Vy, Vz; T, My, Mz) or the world's (Fx, Fy, Fz), or composed
 * into one force and one moment. A joint's action is the member's, reversed.
 */
import { axisLetter } from '../axes/display';
import { computeLocalAxes3D } from '../engine/local-axes-3d';
import { distributedGlobalEnds, pointResultants } from '../engine/member-loads';
import { pointGlobal } from '../engine/member-point-loads';
import { projectNodeToScene, get2DDisplayNodalLoadVertical, get2DDisplayNodalLoadMoment } from '../geometry/coordinate-system';
import { transverseSign } from '../engine/transverse-sign-2d';
import { DESPIECE_COL, memberEndAction3D, type DespieceBasis } from '../three/despiece-3d';
import type { ElementForces3D, Reaction3D } from '../engine/types-3d';
import type { Element, Node, Section, Load } from '../store/model.svelte';
import { freeBodyKeeps, type FBAction, type FBEnd, type FBLoad, type FBSupport, type P3 } from '../canvas/free-body';

const EPS = 1e-3;
type V = [number, number, number];
const unit = (v: V): P3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return { x: v[0] / l, y: v[1] / l, z: v[2] / l }; };
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];

// One resultant per triangle where a trapezoid changes sign (`member-loads.ts`).
export { pointResultants };

export function freeBodyActions3D(opts: {
  elements: Map<number, Element>;
  nodes: Map<number, Node>;
  forces: ElementForces3D[];
  reactions: Reaction3D[];
  sections?: Map<number, Section>;
  project2D: boolean;
  leftHand: boolean;
  basis: DespieceBasis;
  resultant: boolean;
  showReactions: boolean;
  loads?: Load[];
  /** Write a load intensity or force with its unit. */
  loadText: (v: number, q: 'force' | 'distributedLoad' | 'moment') => string;
  /**
   * Components below this share of their piece's own actions are left out (`freeBodyKeeps`, the
   * 2D rule too): a 3D solve leaves hundredths of a kN where the structure carries nothing, and
   * writing "T = 0.0 kN·m" at every cut buries what it does carry. 0 shows everything (the tests).
   */
  negligible?: number;
  /**
   * How the member loads are shown: along the member as they act ('all'), or as the point
   * force(s) they amount to ('resultant'). Nodal loads are point forces either way.
   */
  loadMode?: 'all' | 'resultant';
}): {
  members: Array<{ id: number; nodeI: number; nodeJ: number; i: P3; j: P3 }>;
  nodes: (id: number) => P3 | undefined;
  ends: FBEnd[];
  supports: FBSupport[];
  loads: FBLoad[];
} {
  const scene = new Map<number, P3>();
  const at = (id: number) => {
    if (!scene.has(id)) { const n = opts.nodes.get(id); if (n) scene.set(id, projectNodeToScene(n, opts.project2D)); }
    return scene.get(id);
  };
  const forceOf = new Map(opts.forces.map((f) => [f.elementId, f]));
  const members: Array<{ id: number; nodeI: number; nodeJ: number; i: P3; j: P3 }> = [];
  const ends: FBEnd[] = [];
  const loads: FBLoad[] = [];
  const axesOf = new Map<number, { ex: V; ey: V; ez: V; len: number }>();
  let maxF = 0, maxM = 0;
  for (const f of opts.forces) {
    maxF = Math.max(maxF, Math.abs(f.nStart), Math.abs(f.nEnd), Math.abs(f.vyStart), Math.abs(f.vyEnd), Math.abs(f.vzStart), Math.abs(f.vzEnd));
    maxM = Math.max(maxM, Math.abs(f.mxStart), Math.abs(f.mxEnd), Math.abs(f.myStart), Math.abs(f.myEnd), Math.abs(f.mzStart), Math.abs(f.mzEnd));
  }
  const share = opts.negligible ?? 0;
  const model = { force: maxF, moment: maxM };

  for (const [, e] of opts.elements) {
    const pI = at(e.nodeI), pJ = at(e.nodeJ);
    if (!pI || !pJ) continue;
    members.push({ id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ, i: pI, j: pJ });
    let axes;
    try {
      const localY = (!opts.project2D && e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined)
        ? { x: e.localYx, y: e.localYy, z: e.localYz } : undefined;
      const roll = opts.project2D ? undefined : ((e.rollAngle ?? 0) + (opts.sections?.get(e.sectionId)?.rotation ?? 0));
      axes = computeLocalAxes3D({ id: 0, x: pI.x, y: pI.y, z: pI.z ?? 0 }, { id: 0, x: pJ.x, y: pJ.y, z: pJ.z ?? 0 }, localY, roll, false);
    } catch { continue; }
    const ex = axes.ex as V, ey = axes.ey as V, ez = axes.ez as V;
    axesOf.set(e.id, { ex, ey, ez, len: Math.hypot(pJ.x - pI.x, pJ.y - pI.y, (pJ.z ?? 0) - (pI.z ?? 0)) });
    const f = forceOf.get(e.id);
    if (!f) continue;
    const len = axesOf.get(e.id)!.len;
    // The member's own largest end force and moment, what its negligible components are read against.
    const own = { force: 0, moment: 0 };
    for (const [o, n, vy, vz, mx, my, mz] of [
      [1, f.nStart, f.vyStart, f.vzStart, f.mxStart, f.myStart, f.mzStart],
      [-1, f.nEnd, f.vyEnd, f.vzEnd, f.mxEnd, f.myEnd, f.mzEnd],
    ] as Array<[1 | -1, number, number, number, number, number, number]>) {
      const a = memberEndAction3D(ex, ey, ez, o, n, vy, vz, mx, my, mz);
      own.force = Math.max(own.force, Math.hypot(...(a.force as V)));
      own.moment = Math.max(own.moment, Math.hypot(...(a.moment as V)));
    }
    for (const [end, nodeId, out, n, vy, vz, mx, my, mz] of [
      ['I', e.nodeI, 1, f.nStart, f.vyStart, f.vzStart, f.mxStart, f.myStart, f.mzStart],
      ['J', e.nodeJ, -1, f.nEnd, f.vyEnd, f.vzEnd, f.mxEnd, f.myEnd, f.mzEnd],
    ] as Array<['I' | 'J', number, 1 | -1, number, number, number, number, number, number]>) {
      const act = memberEndAction3D(ex, ey, ez, out, n, vy, vz, mx, my, mz);
      const F = act.force as V, M = act.moment as V;
      const comps = (sign: 1 | -1): FBAction[] => {
        const list: FBAction[] = [];
        // A component's arm across the member: what it adds to the member's moment balance.
        const lever = (axis: V) => len * Math.hypot(...cross(axis, ex));
        const push = (name: string, kind: 'force' | 'moment', axis: V, comp: number, color: string) => {
          if (Math.abs(comp) > EPS && freeBodyKeeps(comp, kind, share, { own, model }, kind === 'force' ? lever(axis) : 0)) {
            list.push({ name, kind, dir: unit(scale(axis, Math.sign(comp) * sign)), magnitude: Math.abs(comp), color });
          }
        };
        if (opts.resultant) {
          const fm = Math.hypot(...F), mm = Math.hypot(...M);
          if (fm > EPS) list.push({ name: 'F', kind: 'force', dir: unit(scale(F, sign)), magnitude: fm, color: DESPIECE_COL.axial });
          if (mm > EPS) list.push({ name: 'M', kind: 'moment', dir: unit(scale(M, sign)), magnitude: mm, color: DESPIECE_COL.moment });
          return list;
        }
        if (opts.basis === 'global') {
          push(`F${axisLetter(0)}`, 'force', [1, 0, 0], F[0], DESPIECE_COL.axial);
          push(`F${axisLetter(1)}`, 'force', [0, 1, 0], F[1], DESPIECE_COL.axial);
          push(`F${axisLetter(2)}`, 'force', [0, 0, 1], F[2], DESPIECE_COL.axial);
        } else {
          push('N', 'force', ex, dot(F, ex), DESPIECE_COL.axial);
          push('Vy', 'force', ey, dot(F, ey), DESPIECE_COL.shear);
          push('Vz', 'force', ez, dot(F, ez), DESPIECE_COL.shear);
        }
        push('T', 'moment', ex, dot(M, ex), DESPIECE_COL.moment);
        push('My', 'moment', ey, dot(M, ey), DESPIECE_COL.moment);
        push('Mz', 'moment', ez, dot(M, ez), DESPIECE_COL.moment);
        return list;
      };
      ends.push({ memberId: e.id, end, nodeId, side: 'member', actions: comps(1) });
      ends.push({ memberId: e.id, end, nodeId, side: 'node', actions: comps(-1) });
    }
  }

  const supports: FBSupport[] = [];
  if (opts.showReactions) {
    // A reaction is read against the same component at every support, and the largest reaction.
    const comp = (r: Reaction3D): number[] => [r.fx, r.fy, r.fz, r.mx ?? 0, r.my ?? 0, r.mz ?? 0];
    const same = [0, 1, 2, 3, 4, 5].map((k) => Math.max(0, ...opts.reactions.map((r) => Math.abs(comp(r)[k]!))));
    const largest = { force: Math.max(same[0]!, same[1]!, same[2]!), moment: Math.max(same[3]!, same[4]!, same[5]!) };
    for (const r of opts.reactions) {
      const list: FBAction[] = [];
      let k = 0;
      const push = (name: string, kind: 'force' | 'moment', axis: V, v: number) => {
        const sameComp = same[k++]!;
        if (Math.abs(v) > EPS && freeBodyKeeps(v, kind, share, { own: { force: sameComp, moment: sameComp }, model: largest })) {
          list.push({ name, kind, dir: unit(scale(axis, Math.sign(v))), magnitude: Math.abs(v), color: DESPIECE_COL.reaction });
        }
      };
      push(`R${axisLetter(0)}`, 'force', [1, 0, 0], r.fx); push(`R${axisLetter(1)}`, 'force', [0, 1, 0], r.fy); push(`R${axisLetter(2)}`, 'force', [0, 0, 1], r.fz);
      push(`M${axisLetter(0)}`, 'moment', [1, 0, 0], r.mx ?? 0); push(`M${axisLetter(1)}`, 'moment', [0, 1, 0], r.my ?? 0); push(`M${axisLetter(2)}`, 'moment', [0, 0, 1], r.mz ?? 0);
      if (list.length) supports.push({ nodeId: r.nodeId, actions: list });
    }
  }

  // Normalize plane loads into scene-global components before the common drawing path.
  // Keep their positions and profiles; solver-equivalent nodal forces would lose those.
  const inScene = (ld: Load): Load => {
    if (ld.type === 'nodal') {
      const d = ld.data, v = get2DDisplayNodalLoadVertical(d), m = get2DDisplayNodalLoadMoment(d);
      return { type: 'nodal3d', data: { id: d.id, nodeId: d.nodeId, fx: d.fx,
        fy: opts.project2D ? 0 : v, fz: opts.project2D ? v : 0,
        mx: 0, my: opts.project2D ? m : 0, mz: opts.project2D ? 0 : m } };
    }
    if (ld.type !== 'distributed' && ld.type !== 'pointOnElement') return ld;
    const d = ld.data, ax = axesOf.get(d.elementId);
    if (!ax) return ld;
    const c = ax.ex[0], s = opts.project2D ? ax.ex[2] : ax.ex[1];
    const angle = (d.angle ?? 0) * Math.PI / 180;
    const transverse = (opts.project2D ? transverseSign(c, s) : 1) * Math.cos(angle);
    const x = d.isGlobal ? Math.sin(angle) : -s * transverse + c * Math.sin(angle);
    const v = d.isGlobal ? Math.cos(angle) : c * transverse + s * Math.sin(angle);
    const dir: V = [x, opts.project2D ? 0 : v, opts.project2D ? v : 0];
    if (ld.type === 'distributed') {
      const d = ld.data;
      return { type: 'distributed3d', data: { ...d, frame: 'global',
        qXI: dir[0] * d.qI, qXJ: dir[0] * d.qJ,
        qYI: dir[1] * d.qI, qYJ: dir[1] * d.qJ,
        qZI: dir[2] * d.qI, qZJ: dir[2] * d.qJ } };
    }
    const p = ld.data;
    // Its moment about the plane's normal, put where a nodal moment of the plane goes.
    const m = p.my ?? p.mz ?? 0;
    return { type: 'pointOnElement3d', data: { ...p, frame: 'global',
      px: dir[0] * p.p + ax.ex[0] * (p.px ?? 0),
      py: dir[1] * p.p + ax.ex[1] * (p.px ?? 0),
      pz: dir[2] * p.p + ax.ex[2] * (p.px ?? 0),
      mx: 0, my: opts.project2D ? m : 0, mz: opts.project2D ? 0 : m } };
  };

  for (const source of opts.loads ?? []) {
    const ld = inScene(source);
    if (ld.type === 'nodal3d') {
      const d = ld.data, f: V = [d.fx, d.fy, d.fz];
      if (Math.hypot(...f) > EPS) loads.push({ kind: 'nodal', nodeId: d.nodeId, dir: unit(f), label: opts.loadText(Math.hypot(...f), 'force') });
      const m: V = [d.mx ?? 0, d.my ?? 0, d.mz ?? 0];
      if (Math.hypot(...m) > EPS) loads.push({ kind: 'nodal', action: 'moment', nodeId: d.nodeId, dir: unit(m), label: opts.loadText(Math.hypot(...m), 'moment') });
    } else if (ld.type === 'distributed3d' || ld.type === 'pointOnElement3d') {
      const ax = axesOf.get(ld.data.elementId);
      if (!ax) continue;
      if (ld.type === 'distributed3d') {
        const d = ld.data;
        const { gI, gJ, a: a0, b: b0 } = distributedGlobalEnds(d, { ...ax, L: ax.len }, opts.leftHand);
        if (opts.loadMode === 'resultant') {
          // Preserve each component's force and moment, including sign-reversing couples.
          // Components with the same centroid can share one resultant vector.
          const parts: Array<{ f: V; at: number }> = [];
          for (const k of [0, 1, 2] as const) {
            for (const r of pointResultants(gI[k], gJ[k], a0, b0)) {
              let part = parts.find(p => Math.abs(p.at - r.at) <= 1e-9 * ax.len);
              if (!part) { part = { f: [0, 0, 0], at: r.at }; parts.push(part); }
              part.f[k] += r.mag;
            }
          }
          for (const p of parts) {
            const f = Math.hypot(...p.f);
            if (f > EPS) loads.push({ kind: 'point', memberId: d.elementId, t: p.at / ax.len, dir: unit(p.f), label: opts.loadText(f, 'force') });
          }
          continue;
        }
        const qi = Math.hypot(...gI), qj = Math.hypot(...gJ);
        if (Math.max(qi, qj) > EPS) {
          const uniform = gI.every((v, k) => Math.abs(v - gJ[k]) < 1e-12);
          const label = uniform ? opts.loadText(qi, 'distributedLoad')
            : `${opts.loadText(qi, 'distributedLoad')} → ${opts.loadText(qj, 'distributedLoad')}`;
          loads.push({ kind: 'dist', memberId: d.elementId, t0: a0 / ax.len, t1: b0 / ax.len,
            qI: { x: gI[0], y: gI[1], z: gI[2] }, qJ: { x: gJ[0], y: gJ[1], z: gJ[2] }, label });
        }
      } else {
        // Its force and its moment as the solve reads them (`member-point-loads.ts`): local y is
        // typed along the y the user sees, negated under the left-hand convention. The moment was
        // left out, and a member under one did not balance by all of it.
        const d = ld.data;
        const { F, M } = pointGlobal(d, { ...ax, L: ax.len }, opts.leftHand);
        const t = (d.a ?? 0) / ax.len;
        if (Math.hypot(...F) > EPS) loads.push({ kind: 'point', memberId: d.elementId, t, dir: unit(F), label: opts.loadText(Math.hypot(...F), 'force') });
        if (Math.hypot(...M) > EPS) loads.push({ kind: 'point', action: 'moment', memberId: d.elementId, t, dir: unit(M), label: opts.loadText(Math.hypot(...M), 'moment') });
      }
    }
  }

  return { members, nodes: at, ends, supports, loads };
}
