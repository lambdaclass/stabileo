/**
 * The stiffness wizard with axially rigid members: every frame member keeps
 * its length, (u_j − u_i)·e = αΔT·L (zero without temperature). The free
 * displacements split into independent ones q and dependent ones that follow,
 * u_f = u⁰ + T·q (u⁰ from the support settlements and thermal elongations);
 * the system reduces to Tᵀ·K_ff·T·q = Tᵀ·(F_mod − K_ff·u⁰), where the EA/L
 * terms of the rigid members drop out. Their axial forces, which no
 * elongation gives, come from the force equilibrium of the joints, Cᵀ·N =
 * −(K·u − F) at the free translations, with the least L/EA energy when the
 * members form a set equilibrium alone does not resolve. The same treatment
 * the compatibility-matrix method gives its inextensible members
 * (steps/truss-compatibility-solve). Truss members stay extensible.
 */
import type { SolverInput } from './types';
import type { DSMStepData } from './solver-detailed';
import { rref, nullspace, solveDense } from './steps/sway-modes';
import { loadAlpha } from './thermal-alpha';

export interface RigidCondition { elementId: number; coefs: Array<{ dof: number; v: number }>; rhs: number }

export interface RigidReduction {
  members: number[];
  conditions: RigidCondition[];
  indep: number[];
  deps: number[];
  T: number[][];
  u0: number[];
  Kq: number[][];
  Fq: number[];
  q: number[];
  N: Map<number, number>;
  selfStress: boolean;
  nFreeAxial: number;
}

export type RigidStatus = 'on' | 'mechanism' | 'imposed' | 'none';

const EPS = 1e-12;

/** min Σ w·x² subject to A·x = b, by a particular solution plus the nullspace; null when A·x = b has no solution. */
export function leastEnergy(A: number[][], b: number[], w: number[]): { x: number[]; free: boolean } | null {
  const n = w.length;
  if (n === 0) return { x: [], free: false };
  const big = Math.max(1e-300, ...b.map(Math.abs), ...A.flat().map(Math.abs));
  const { R, pivots } = rref(A.map((r, k) => [...r, b[k]]), n);
  for (let r = pivots.length; r < R.length; r++) if (Math.abs(R[r][n]) > 1e-8 * big) return null;
  const x0 = new Array(n).fill(0);
  pivots.forEach((p, r) => { x0[p] = R[r][n]; });
  const S = nullspace(A.length ? A : [new Array(n).fill(0)], n);
  if (!S.length) return { x: x0, free: false };
  const K = S.map((a) => S.map((c) => a.reduce((s, v, k) => s + v * w[k] * c[k], 0)));
  const rhs = S.map((a) => -a.reduce((s, v, k) => s + v * w[k] * x0[k], 0));
  const cs = solveDense(K, rhs) ?? new Array(S.length).fill(0);
  return { x: x0.map((v, k) => v + S.reduce((s, vec, q) => s + vec[k] * cs[q], 0)), free: true };
}

export function applyAxialRigidity(input: SolverInput, d: DSMStepData): { data: DSMStepData; status: RigidStatus } {
  if (d.dofNumbering.dofsPerNode !== 3) return { data: d, status: 'none' };
  const nF = d.dofNumbering.nFree, nT = d.dofNumbering.nTotal;
  const frames = d.elements.filter((e) => e.type === 'frame');
  if (!frames.length) return { data: d, status: 'none' };
  const idx = new Map(d.dofNumbering.dofs.map((x) => [`${x.nodeId}:${x.localDof}`, x.globalIndex]));
  const frame = new Map(d.nodeFrames.map((f) => [f.nodeId, f.angle]));
  const alphaDt = new Map<number, number>();
  for (const l of input.loads) if (l.type === 'thermal' && l.data.dtUniform) alphaDt.set(l.data.elementId, (alphaDt.get(l.data.elementId) ?? 0) + loadAlpha(l.data) * l.data.dtUniform);

  const conditions: RigidCondition[] = frames.map((e) => {
    const c = Math.cos(e.angle), s = Math.sin(e.angle);
    const row = new Array(nT).fill(0);
    const put = (node: number, sg: number) => {
      const a = frame.get(node) ?? 0, ca = Math.cos(a), sa = Math.sin(a);
      const ix = idx.get(`${node}:0`)!, iz = idx.get(`${node}:1`)!;
      row[ix] += sg * (c * ca + s * sa);
      row[iz] += sg * (-c * sa + s * ca);
    };
    put(e.nodeI, -1); put(e.nodeJ, 1);
    return { elementId: e.elementId, coefs: row.flatMap((v, k) => (Math.abs(v) > EPS ? [{ dof: k, v }] : [])), rhs: (alphaDt.get(e.elementId) ?? 0) * e.length };
  });
  const Cf = conditions.map((c) => { const r = new Array(nF).fill(0); for (const t of c.coefs) if (t.dof < nF) r[t.dof] = t.v; return r; });
  const g = conditions.map((c) => c.rhs - c.coefs.reduce((s, t) => s + (t.dof >= nF ? t.v * d.uPrescribed[t.dof - nF] : 0), 0));

  // Pivots on the later columns, so the first free displacements (in the wizard's numbering) stay independent.
  const rev = Cf.map((r, k) => [...[...r].reverse(), g[k]]);
  const { R, pivots } = rref(rev, nF);
  const big = Math.max(1e-300, ...g.map(Math.abs));
  for (let r = pivots.length; r < R.length; r++) if (Math.abs(R[r][nF]) > 1e-9 * Math.max(big, 1)) return { data: d, status: 'imposed' };
  const orig = (c: number) => nF - 1 - c;
  const deps = pivots.map(orig).sort((a, b) => a - b);
  const indep = [...Array(nF).keys()].filter((k) => !deps.includes(k));
  const T = Array.from({ length: nF }, () => new Array(indep.length).fill(0));
  const u0 = new Array(nF).fill(0);
  indep.forEach((o, j) => {
    T[o][j] = 1;
    pivots.forEach((p, r) => { const v = -R[r][nF - 1 - o]; T[orig(p)][j] = Math.abs(v) < EPS ? 0 : v; });
  });
  pivots.forEach((p, r) => { u0[orig(p)] = R[r][nF]; });

  const Kff = d.Kff;
  const KT = Kff.map((row) => indep.map((_, j) => row.reduce((s, v, k) => s + v * T[k][j], 0)));
  const Kq = indep.map((_, i) => indep.map((__, j) => T.reduce((s, row, k) => s + row[i] * KT[k][j], 0)));
  const Ku0 = Kff.map((row) => row.reduce((s, v, k) => s + v * u0[k], 0));
  const Fq = indep.map((_, i) => T.reduce((s, row, k) => s + row[i] * (d.FfMod[k] - Ku0[k]), 0));
  const q = indep.length ? solveDense(Kq, Fq) : [];
  if (!q) return { data: d, status: 'mechanism' };
  const uf = u0.map((v, k) => v + T[k].reduce((s, t, j) => s + t * q[j], 0));
  const uAll = [...uf, ...d.uPrescribed];

  // Axial forces of the rigid members from the equilibrium of the free translations.
  const Ku = d.K.map((row) => row.reduce((s, v, k) => s + v * uAll[k], 0));
  const r = Ku.map((v, k) => v - d.F[k]);
  const transl = d.dofNumbering.dofs.filter((x) => x.isFree && x.localDof < 2).map((x) => x.globalIndex);
  const A = transl.map((k) => conditions.map((c) => c.coefs.find((t) => t.dof === k)?.v ?? 0));
  const w = frames.map((e) => e.length / Math.max(e.E * e.A, 1e-300));
  const sol = leastEnergy(A, transl.map((k) => -r[k]), w);
  if (!sol) return { data: d, status: 'mechanism' };
  const N = new Map(frames.map((e, a) => [e.elementId, Math.abs(sol.x[a]) < 1e-12 ? 0 : sol.x[a]]));

  const reactionsRaw = d.reactionsRaw.map((_, i) => {
    const k = nF + i;
    return r[k] + conditions.reduce((s, c) => s + (c.coefs.find((t) => t.dof === k)?.v ?? 0) * N.get(c.elementId)!, 0);
  });
  const elementForces = d.elementForces.map((f) => {
    const e = d.elements.find((x) => x.elementId === f.elementId)!;
    if (e.type !== 'frame') {
      const uG = [0, 1, 3, 4].map((k) => (k < 3 ? at(e.nodeI, k) : at(e.nodeJ, k - 3)));
      const uL = e.T.map((row) => row.reduce((s, v, k) => s + v * uG[k], 0));
      const Nt = (e.E * e.A * (uL[2] - uL[0])) / e.length;
      return { ...f, uGlobal: uG, uLocal: uL, fLocalRaw: [-Nt, 0, Nt, 0], fLocalFinal: [-Nt - f.fixedEndForces[0], 0, Nt - f.fixedEndForces[2], 0] };
    }
    const uG = [0, 1, 2, 3, 4, 5].map((k) => (k < 3 ? at(e.nodeI, k) : at(e.nodeJ, k - 3)));
    const uL = e.T.map((row) => row.reduce((s, v, k) => s + v * uG[k], 0));
    const raw = e.kLocal.map((row) => row.reduce((s, v, k) => s + v * uL[k], 0));
    const n = N.get(e.elementId)!;
    raw[0] -= n; raw[3] += n;
    return { ...f, uGlobal: uG, uLocal: uL, fLocalRaw: raw, fLocalFinal: raw.map((v, k) => v - f.fixedEndForces[k]) };
  });
  function at(node: number, ld: number): number { const k = idx.get(`${node}:${ld}`); return k === undefined ? 0 : uAll[k]; }

  const rigid: RigidReduction = {
    members: frames.map((e) => e.elementId), conditions, indep, deps, T, u0, Kq, Fq, q, N, selfStress: sol.free,
    nFreeAxial: transl.length,
  };
  return { data: { ...d, uFree: uf, uAll, reactionsRaw, elementForces, rigid }, status: 'on' };
}
