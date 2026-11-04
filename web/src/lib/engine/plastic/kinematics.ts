/**
 * Small-displacement kinematics of a plane frame made of rigid pieces: the
 * mechanisms of the plastic unit.
 *
 * Every member is split at the interior sections given, and each piece moves
 * as a rigid body: its ends keep their distance (no axial strain) and turn
 * together (no curvature). The unknowns are the translations of every point
 * (nodes and interior sections), the rotation of every piece and the rotation
 * of every joint that some member end is rigidly attached to. Every section
 * given is released: its rotation jump is a linear function of the unknowns
 * (`rotation`), and a section that should stay rigid is held by asking that
 * jump to be zero. So one model serves every mechanism of a structure: the
 * hinges chosen are the sections left free.
 *
 * The jump is read along the member, right side minus left side (a member end
 * at its start: member minus joint; at its end: joint minus member). With the
 * bending moment positive when it tensions the local −y face ("sagging"),
 * M·Δθ is the work a hinge absorbs, positive when the hinge turns the way its
 * moment does.
 */
import type { SolverInput, SolverLoad } from '../types';

export interface KinSection { member: number; t: number }

export interface KinModel {
  n: number;
  /** Compatibility rows: C·d = 0 for every admissible motion. */
  rows: number[][];
  /** Rotation jump at each section, as a row over the unknowns. */
  rotation: number[][];
  /** External work of the reference loads, as a row over the unknowns (×λ in use). */
  work: number[];
  /** Rotation unknown of each joint that has one. */
  joint: Map<number, number>;
  /** Points of each member in order along it: t and point index. */
  stations: Map<number, Array<{ t: number; p: number }>>;
  /** Coordinates of each point. */
  points: Array<{ x: number; z: number }>;
  /** Point index of each node. */
  nodePoint: Map<number, number>;
  /** Rotation unknown of each piece of each frame member, in order along it. */
  piece: Map<number, number[]>;
  geo: Map<number, { a: { x: number; z: number }; b: { x: number; z: number }; L: number; c: number; s: number }>;
}

const key = (m: number, t: number) => `${m}:${t.toFixed(9)}`;

export function buildKinematics(input: SolverInput, sections: KinSection[], removed: ReadonlySet<number> = new Set()): KinModel {
  const points: Array<{ x: number; z: number }> = [];
  const nodePoint = new Map<number, number>();
  for (const n of input.nodes.values()) { nodePoint.set(n.id, points.length); points.push({ x: n.x, z: n.z }); }

  const members = [...input.elements.values()].filter((e) => !removed.has(e.id));
  const geo = new Map(members.map((e) => {
    const a = input.nodes.get(e.nodeI)!, b = input.nodes.get(e.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    return [e.id, { a, b, L, c: (b.x - a.x) / L, s: (b.z - a.z) / L }];
  }));

  const stations = new Map<number, Array<{ t: number; p: number }>>();
  const interiorAt = new Map<string, number>();
  for (const e of members) {
    const g = geo.get(e.id)!;
    const list = [{ t: 0, p: nodePoint.get(e.nodeI)! }];
    const ts = [...new Set(sections.filter((s) => s.member === e.id && s.t > 1e-9 && s.t < 1 - 1e-9).map((s) => s.t))].sort((x, y) => x - y);
    for (const t of ts) {
      const p = points.length;
      points.push({ x: g.a.x + (g.b.x - g.a.x) * t, z: g.a.z + (g.b.z - g.a.z) * t });
      interiorAt.set(key(e.id, t), list.length);
      list.push({ t, p });
    }
    list.push({ t: 1, p: nodePoint.get(e.nodeJ)! });
    stations.set(e.id, list);
  }

  let n = 2 * points.length;
  const pieceRot = new Map<number, number[]>();
  for (const e of members) {
    if (e.type === 'truss') continue;
    const k = stations.get(e.id)!.length - 1;
    pieceRot.set(e.id, Array.from({ length: k }, () => n++));
  }
  const endReleased = new Set(sections.filter((s) => s.t <= 1e-9 || s.t >= 1 - 1e-9).map((s) => `${s.member}:${s.t < 0.5 ? 'I' : 'J'}`));
  const nodalMoment = new Set(input.loads.filter((l) => l.type === 'nodal' && Math.abs(l.data.my) > 1e-12).map((l) => (l.data as { nodeId: number }).nodeId));
  const joint = new Map<number, number>();
  for (const e of members) {
    if (e.type === 'truss') continue;
    for (const [node, modelHinge] of [[e.nodeI, e.hingeStart], [e.nodeJ, e.hingeEnd]] as const) {
      if (!modelHinge && !joint.has(node)) joint.set(node, n++);
    }
  }
  for (const node of nodalMoment) if (!joint.has(node) && input.nodes.has(node)) joint.set(node, n++);

  const rows: number[][] = [];
  const row = () => new Array(n).fill(0);
  for (const e of members) {
    const g = geo.get(e.id)!;
    const st = stations.get(e.id)!;
    for (let k = 0; k + 1 < st.length; k++) {
      const pa = st[k].p, pb = st[k + 1].p;
      const len = (st[k + 1].t - st[k].t) * g.L;
      const ax = row();
      ax[2 * pb] += g.c; ax[2 * pb + 1] += g.s; ax[2 * pa] -= g.c; ax[2 * pa + 1] -= g.s;
      rows.push(ax);
      if (e.type === 'truss') continue;
      const tr = row();
      tr[2 * pb] += -g.s; tr[2 * pb + 1] += g.c; tr[2 * pa] -= -g.s; tr[2 * pa + 1] -= g.c;
      tr[pieceRot.get(e.id)![k]] = -len;
      rows.push(tr);
    }
    if (e.type === 'truss') continue;
    const rot = pieceRot.get(e.id)!;
    for (const [end, node, modelHinge, piece] of [['I', e.nodeI, e.hingeStart, rot[0]], ['J', e.nodeJ, e.hingeEnd, rot[rot.length - 1]]] as const) {
      if (modelHinge || endReleased.has(`${e.id}:${end}`)) continue;
      const r = row();
      r[piece] = 1; r[joint.get(node)!] = -1;
      rows.push(r);
    }
  }
  for (const s of input.supports.values()) {
    const p = nodePoint.get(s.nodeId);
    if (p === undefined) continue;
    const hold = (fx: number, fz: number) => { const r = row(); r[2 * p] = fx; r[2 * p + 1] = fz; rows.push(r); };
    const t = s.type;
    if (t === 'fixed' || t === 'pinned') { hold(1, 0); hold(0, 1); }
    else if (t === 'rollerX') hold(0, 1);
    else if (t === 'rollerZ') hold(1, 0);
    else if (t === 'inclinedRoller') { const a = s.angle ?? 0; hold(-Math.sin(a), Math.cos(a)); }
    else if (t === 'spring') { if ((s.kx ?? 0) > 0) hold(1, 0); if ((s.ky ?? 0) > 0) hold(0, 1); }
    const holdsRotation = t === 'fixed' || (t === 'spring' && (s.kz ?? 0) > 0);
    if (holdsRotation && joint.has(s.nodeId)) { const r = row(); r[joint.get(s.nodeId)!] = 1; rows.push(r); }
  }

  const rotation = sections.map((s) => {
    const r = row();
    const e = input.elements.get(s.member);
    const rot = pieceRot.get(s.member);
    if (!e || !rot) return r;
    if (s.t <= 1e-9) {
      if (!e.hingeStart && joint.has(e.nodeI)) { r[rot[0]] += 1; r[joint.get(e.nodeI)!] -= 1; }
    } else if (s.t >= 1 - 1e-9) {
      if (!e.hingeEnd && joint.has(e.nodeJ)) { r[joint.get(e.nodeJ)!] += 1; r[rot[rot.length - 1]] -= 1; }
    } else {
      const k = interiorAt.get(key(s.member, s.t))!;
      r[rot[k]] += 1; r[rot[k - 1]] -= 1;
    }
    return r;
  });

  const km: KinModel = { n, rows, rotation, work: [], joint, stations, points, nodePoint, piece: pieceRot, geo };
  km.work = workRow(input, km, input.loads);
  return km;

}

/** External work of `loads` as a row over the unknowns of `km`. */
export function workRow(input: SolverInput, km: KinModel, loads: readonly SolverLoad[]): number[] {
  const work = new Array(km.n).fill(0);
  const { stations, nodePoint, joint, piece: pieceRot, geo } = km;
  const pieceAt = (m: number, t: number) => {
    const st = stations.get(m)!;
    let k = 0;
    while (k + 2 < st.length && t > st[k + 1].t + 1e-12) k++;
    return { k, a: st[k], b: st[k + 1] };
  };
  const addDisp = (m: number, t: number, fx: number, fz: number, w = 1) => {
    const { a, b } = pieceAt(m, t);
    const xi = b.t - a.t < 1e-12 ? 0 : (t - a.t) / (b.t - a.t);
    work[2 * a.p] += w * (1 - xi) * fx; work[2 * a.p + 1] += w * (1 - xi) * fz;
    work[2 * b.p] += w * xi * fx; work[2 * b.p + 1] += w * xi * fz;
  };
  const addCouple = (m: number, t: number, my: number) => {
    const e = input.elements.get(m)!;
    if (e.type === 'truss') {
      const g = geo.get(m)!;
      const { a, b } = pieceAt(m, t);
      const len = (b.t - a.t) * g.L;
      work[2 * b.p] += (my * -g.s) / len; work[2 * b.p + 1] += (my * g.c) / len;
      work[2 * a.p] -= (my * -g.s) / len; work[2 * a.p + 1] -= (my * g.c) / len;
    } else {
      work[pieceRot.get(m)![pieceAt(m, t).k]] += my;
    }
  };
  const GAUSS = [-Math.sqrt(3 / 5), 0, Math.sqrt(3 / 5)];
  const WGT = [5 / 9, 8 / 9, 5 / 9];
  for (const l of loads) {
    if (l.type === 'nodal') {
      const p = nodePoint.get(l.data.nodeId);
      if (p === undefined) continue;
      work[2 * p] += l.data.fx; work[2 * p + 1] += l.data.fz;
      const j = joint.get(l.data.nodeId);
      if (j !== undefined) work[j] += l.data.my;
    } else if (l.type === 'pointOnElement') {
      const g = geo.get(l.data.elementId);
      if (!g) continue;
      const t = Math.min(1, Math.max(0, l.data.a / g.L));
      const p = l.data.p, px = l.data.px ?? 0;
      addDisp(l.data.elementId, t, px * g.c - p * g.s, px * g.s + p * g.c);
      if (Math.abs(l.data.my ?? 0) > 0) addCouple(l.data.elementId, t, l.data.my ?? 0);
    } else if (l.type === 'distributed' || l.type === 'axialDistributed') {
      const g = geo.get(l.data.elementId);
      if (!g) continue;
      const la = l.data.a ?? 0, lb = l.data.b ?? g.L;
      if (lb - la < 1e-12) continue;
      const qAt = (x: number) => l.data.qI + ((l.data.qJ - l.data.qI) * (x - la)) / (lb - la);
      const [dx, dz] = l.type === 'distributed' ? [-g.s, g.c] : [g.c, g.s];
      const cuts = [la, ...stations.get(l.data.elementId)!.map((s) => s.t * g.L).filter((x) => x > la + 1e-12 && x < lb - 1e-12), lb];
      for (let k = 0; k + 1 < cuts.length; k++) {
        const x0 = cuts[k], x1 = cuts[k + 1], h = (x1 - x0) / 2, mid = (x0 + x1) / 2;
        GAUSS.forEach((gp, i) => {
          const x = mid + gp * h;
          const q = qAt(x) * WGT[i] * h;
          addDisp(l.data.elementId, x / g.L, q * dx, q * dz);
        });
      }
    }
  }

  return work;
}

export const dot = (a: number[], b: number[]) => a.reduce((s, v, k) => s + v * b[k], 0);

/** Displaced position of a point for a motion d, magnified by `scale`. */
export function displaced(km: KinModel, p: number, d: number[], scale: number): { x: number; z: number } {
  return { x: km.points[p].x + scale * d[2 * p], z: km.points[p].z + scale * d[2 * p + 1] };
}
