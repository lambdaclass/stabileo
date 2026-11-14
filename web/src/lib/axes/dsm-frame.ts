import type { DSMStepData } from '../engine/solver-detailed';
import { AXIS_NAMES, planeSigns, relabelComponentsWith, toUser, userAxisAlong, type AxesFrame } from './frame';

const LABELS_3D = ['u', 'v', 'w', 'θx', 'θy', 'θz'];
const label3D = (nodeId: number, k: number) => `${LABELS_3D[k]}${nodeId}`;

/** Global matrices become Q·K·Q, vectors Q·v and each [T] T·Q; local ones, and a node in its own inclined axes, are left as they are. */
export function dsmInFrame(d: DSMStepData, f: AxesFrame): DSMStepData {
  if (f.identity) return d;
  const per = d.dofNumbering.dofsPerNode;
  const space = per > 3;
  const p = planeSigns(f);
  const inclined = new Set([...d.nodeFrames.map((x) => x.nodeId), ...(d.nodeFrames3D ?? []).map((x) => x.nodeId)]);
  const n = d.dofNumbering.nTotal;
  const sign: number[] = new Array(n).fill(1);
  const labels = [...d.dofLabels];
  const dofs = d.dofNumbering.dofs.map((dof) => {
    const g = dof.globalIndex;
    if (space) {
      if (inclined.has(dof.nodeId)) return dof;
      const rot = dof.localDof >= 3;
      const a = userAxisAlong(f, dof.localDof % 3);
      const user = AXIS_NAMES.indexOf(a.name) + (rot ? 3 : 0);
      sign[g] = rot ? f.det * a.sign : a.sign;
      if (labels[g] === label3D(dof.nodeId, dof.localDof)) labels[g] = label3D(dof.nodeId, user);
      return { ...dof, localDof: user, label: labels[g]! };
    }
    const twoDSigns = [inclined.has(dof.nodeId) ? 1 : p.sx, inclined.has(dof.nodeId) ? 1 : p.sz, p.sr];
    sign[g] = twoDSigns[dof.localDof]!;
    return dof;
  });
  const relabel = new Map(d.dofLabels.map((l, i) => [l, labels[i]!]));
  const nFree = d.dofNumbering.nFree;
  const vec = (v: number[], offset = 0) => v.map((x, i) => sign[i + offset]! * x + 0);
  const mat = (m: number[][], ro = 0, co = 0) => m.map((row, i) => row.map((x, j) => sign[i + ro]! * sign[j + co]! * x + 0));
  const turn = (a: number) => Math.atan2(p.sz * Math.sin(a), p.sx * Math.cos(a));
  const rigid = d.rigid && {
    ...d.rigid,
    conditions: d.rigid.conditions.map((c) => ({ ...c, coefs: c.coefs.map((t) => ({ ...t, v: sign[t.dof]! * t.v + 0 })) })),
    T: d.rigid.T.map((row, i) => row.map((x, j) => sign[i]! * sign[d.rigid!.indep[j]!]! * x + 0)),
    u0: vec(d.rigid.u0),
    Kq: d.rigid.Kq.map((row, i) => row.map((x, j) => sign[d.rigid!.indep[i]!]! * sign[d.rigid!.indep[j]!]! * x + 0)),
    Fq: d.rigid.Fq.map((x, i) => sign[d.rigid!.indep[i]!]! * x + 0),
    q: d.rigid.q.map((x, i) => sign[d.rigid!.indep[i]!]! * x + 0),
  };
  return {
    ...d,
    dofNumbering: { ...d.dofNumbering, dofs },
    elements: d.elements.map((e) => {
      const s = e.dofIndices.map((g) => sign[g]!);
      return {
        ...e,
        angle: space ? e.angle : turn(e.angle),
        T: e.T.map((row) => row.map((x, j) => s[j]! * x + 0)),
        kGlobal: e.kGlobal.map((row, i) => row.map((x, j) => s[i]! * s[j]! * x + 0)),
        dofLabels: e.dofLabels.map((l) => relabel.get(l) ?? l),
      };
    }),
    K: mat(d.K),
    F: vec(d.F),
    loadContributions: d.loadContributions.map((c) => ({ ...c, value: sign[c.dofIndex]! * c.value + 0, dofLabel: labels[c.dofIndex] ?? c.dofLabel, source: relabelComponentsWith(f, c.source) })),
    Kff: mat(d.Kff),
    Kfr: mat(d.Kfr, 0, nFree),
    Krf: mat(d.Krf, nFree, 0),
    Krr: mat(d.Krr, nFree, nFree),
    Ff: vec(d.Ff),
    Fr: vec(d.Fr, nFree),
    uPrescribed: vec(d.uPrescribed, nFree),
    FfMod: vec(d.FfMod),
    uFree: vec(d.uFree),
    uAll: vec(d.uAll),
    reactionsRaw: vec(d.reactionsRaw, nFree),
    elementForces: d.elementForces.map((ef) => {
      const e = d.elements.find((x) => x.elementId === ef.elementId);
      return e ? { ...ef, uGlobal: ef.uGlobal.map((x, i) => sign[e.dofIndices[i]!]! * x + 0) } : ef;
    }),
    nodeFrames: d.nodeFrames.map((x) => ({ ...x, angle: turn(x.angle) })),
    nodeFrames3D: d.nodeFrames3D?.map((x) => ({ ...x, R: x.R.map((r) => toUser(f, [r[0]!, r[1]!, r[2]!])) })),
    nullModes: d.nullModes.map((l) => relabel.get(l) ?? l),
    rigid: rigid || undefined,
    dofLabels: labels,
    freeDofLabels: d.freeDofLabels.map((l) => relabel.get(l) ?? l),
    restrDofLabels: d.restrDofLabels.map((l) => relabel.get(l) ?? l),
  };
}
