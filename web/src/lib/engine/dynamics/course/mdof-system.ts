/**
 * The n degree of freedom system of a plane model, M·ü + K·u = F(t), as the
 * classroom writes it: K from the matrix stiffness method on the free degrees
 * of freedom, M from the bars' distributed mass (lumped or consistent) plus
 * the point masses, and the degrees of freedom without mass condensed out.
 */
import type { ModelData } from '../../solver-service';
import { buildSolverInput2D } from '../../solver-service';
import { solveDetailed, freeDofCount } from '../../solver-detailed';
import { withSectionMass } from '../section-mass';
import type { PointMass } from '../mass-source';
import { subdivideForAnalysis } from '../../../model/edit/analysis-subdivision';
import { type Mat, zeros, congruence } from './dense';
import { type MassModel, type Condensation, lumpedFrameMass, consistentFrameMass, trussMass, condense } from './mass-model';

export type DofDir = 'ux' | 'uz' | 'ry';
/** `angle`: the node's frame, u_local = R(angle)·u_global, when a support turns it. */
export interface DofRef { nodeId: number; dir: DofDir; angle?: number }

export const dofTex = (d: DofRef): string => (d.dir === 'ux' ? `u_{${d.nodeId}}` : d.dir === 'uz' ? `v_{${d.nodeId}}` : `\\theta_{${d.nodeId}}`);
export const dofText = (d: DofRef): string => `${d.dir === 'ux' ? 'u' : d.dir === 'uz' ? 'v' : 'θ'}${d.nodeId}`;

export interface MemberMass {
  elementId: number;
  /** The model's member this piece belongs to. */
  memberId: number;
  type: 'frame' | 'truss';
  rhoA: number;
  L: number;
  /** How its mass entered M. */
  kind: 'lumped' | 'consistent' | 'released';
}

export interface MdofSystem {
  /** The free degrees of freedom of the bar model, before condensation. */
  fullDofs: DofRef[];
  fullK: Mat;
  fullM: Mat;
  fullF: number[];
  /** The degrees of freedom the system is solved on, with K, M and the force pattern F. */
  dofs: DofRef[];
  K: Mat;
  M: Mat;
  F: number[];
  condensation: Condensation | null;
  /** The inertia load of a unit ground acceleration along global X and Z, on `dofs`: supports in a turned frame move with the ground too. */
  ground: { x: number[]; z: number[] };
  massModel: MassModel;
  nPerMember: number;
  members: MemberMass[];
  points: Array<{ nodeId: number; mx: number; mz: number }>;
  /** Total translational mass, t. */
  totalMass: number;
  /** Nodes along each member, model member id → nodes from I to J (ends included). */
  chains: Map<number, number[]>;
  /** Coordinates of every node of the bar model (x, z). */
  coords: Map<number, { x: number; z: number }>;
}

export interface SystemOptions {
  nPerMember: number;
  massModel: MassModel;
  /** Count the bars' own mass (density); off, only the point masses vibrate. */
  barMass: boolean;
  includeSelfWeight?: boolean;
}

export class SystemError extends Error {
  constructor(public code: 'empty' | 'noMass' | 'singular' | 'tooBig' | 'indefinite', public params: Record<string, number> = {}) { super(code); }
}

/** ω = √λ, refusing a λ below zero beyond n ulps of the largest: K is then not positive semidefinite, an unstable structure. */
export function circularFrequencies(lambda: readonly number[]): number[] {
  const scale = Math.max(0, ...lambda.map(Math.abs));
  if (lambda.some((l) => l < -lambda.length * Number.EPSILON * scale)) throw new SystemError('indefinite');
  return lambda.map((l) => Math.sqrt(Math.max(l, 0)));
}

export const MAX_SYSTEM_DOFS = 90;

export function modelSystem(model: ModelData, points: readonly PointMass[], opts: SystemOptions): MdofSystem {
  const sub = subdivideForAnalysis(model, opts.nPerMember);
  const raw = buildSolverInput2D(sub.model, opts.includeSelfWeight ?? false);
  if (!raw) throw new SystemError('empty');
  const { input, densities } = withSectionMass(raw, sub.model);
  const prospective = freeDofCount(input);
  if (prospective > MAX_SYSTEM_DOFS) throw new SystemError('tooBig', { n: prospective, max: MAX_SYSTEM_DOFS });
  const det = solveDetailed(input);
  const nF = det.dofNumbering.nFree;
  if (nF > MAX_SYSTEM_DOFS) throw new SystemError('tooBig', { n: nF, max: MAX_SYSTEM_DOFS });
  const nT = det.dofNumbering.nTotal;
  const dirs: DofDir[] = det.dofNumbering.dofsPerNode === 3 ? ['ux', 'uz', 'ry'] : ['ux', 'uz'];
  const frameOf = new Map(det.nodeFrames.map((f) => [f.nodeId, f.angle]));
  const fullDofs: DofRef[] = det.dofNumbering.dofs.filter((d) => d.isFree).map((d) => {
    const angle = frameOf.get(d.nodeId);
    return angle !== undefined && d.localDof < 2 ? { nodeId: d.nodeId, dir: dirs[d.localDof], angle } : { nodeId: d.nodeId, dir: dirs[d.localDof] };
  });
  const memberOf = new Map<number, number>();
  for (const [mid, segs] of sub.segments) for (const s of segs) memberOf.set(s, mid);

  const Mt = zeros(nT);
  const own = new Array<number>(nT).fill(0);
  const members: MemberMass[] = [];
  const consistent = opts.massModel !== 'lumped';
  for (const ed of det.elements) {
    const e = input.elements.get(ed.elementId)!;
    const rho = densities.get(e.materialId) ?? 0;
    const rhoA = opts.barMass ? (rho * ed.A) / 1000 : 0;
    if (!(rhoA > 0)) continue;
    const released = ed.type === 'frame' && (ed.hingeStart || ed.hingeEnd);
    let mg: Mat;
    if (ed.type === 'truss') mg = congruence(ed.T, trussMass(rhoA, ed.length, consistent));
    else if (!consistent || released) mg = congruence(ed.T, lumpedFrameMass(rhoA, ed.length));
    else mg = congruence(ed.T, consistentFrameMass(rhoA, ed.length));
    members.push({ elementId: ed.elementId, memberId: memberOf.get(ed.elementId) ?? ed.elementId, type: ed.type, rhoA, L: ed.length, kind: released && consistent ? 'released' : consistent ? 'consistent' : 'lumped' });
    ed.dofIndices.forEach((gi, a) => ed.dofIndices.forEach((gj, b) => { Mt[gi][gj] += mg[a][b]; own[gi] = Math.max(own[gi], Math.abs(mg[a][b])); }));
  }
  const pts: MdofSystem['points'] = [];
  const frameAngle = new Map(det.nodeFrames.map((f) => [f.nodeId, f.angle]));
  const indexOf = (nodeId: number, ld: number) => det.dofNumbering.dofs.find((d) => d.nodeId === nodeId && d.localDof === ld)?.globalIndex;
  for (const p of points) {
    if (!input.nodes.has(p.nodeId)) continue;
    const ir = indexOf(p.nodeId, 2), J = p.izz ?? 0;
    if (J > 0 && ir !== undefined) { Mt[ir][ir] += J; own[ir] = Math.max(own[ir], J); }
    if (!(p.m > 0)) continue;
    const mz = p.horizontalOnly ? 0 : p.m;
    pts.push({ nodeId: p.nodeId, mx: p.m, mz });
    const ix = indexOf(p.nodeId, 0), iz = indexOf(p.nodeId, 1);
    const a = frameAngle.get(p.nodeId) ?? 0, c = Math.cos(a), s = Math.sin(a);
    const m = [[c * c * p.m + s * s * mz, c * s * (mz - p.m)], [c * s * (mz - p.m), s * s * p.m + c * c * mz]];
    const at = [ix, iz];
    for (let r = 0; r < 2; r++) for (let q = 0; q < 2; q++) { const gi = at[r], gj = at[q]; if (gi !== undefined && gj !== undefined) { Mt[gi][gj] += m[r][q]; own[gi] = Math.max(own[gi], p.m); } }
  }

  const fullK = det.Kff.map((r) => [...r]);
  const fullM = Mt.slice(0, nF).map((r) => r.slice(0, nF));
  const fullF = [...det.FfMod];
  const scaleM = Math.max(...fullM.map((r, i) => Math.abs(r[i])), 0);
  if (!(scaleM > 0)) throw new SystemError('noMass');
  const hasMass = (i: number) => fullM[i].some((v) => Math.abs(v) > 1e-12 * own[i]);
  const translational = (i: number) => fullDofs[i].dir !== 'ry';
  const masters = fullDofs.map((_, i) => i).filter((i) => hasMass(i) && (opts.massModel !== 'guyan' || translational(i)));
  if (!masters.length) throw new SystemError('noMass');
  const rigid = (dir: 'ux' | 'uz') => {
    const r = new Array(nT).fill(0);
    for (const d of det.dofNumbering.dofs) {
      if (d.localDof > 1) continue;
      const a = frameOf.get(d.nodeId) ?? 0, c = Math.cos(a), sn = Math.sin(a);
      r[d.globalIndex] = dir === 'ux' ? (d.localDof === 0 ? c : -sn) : (d.localDof === 0 ? sn : c);
    }
    return Mt.slice(0, nF).map((row) => row.reduce((acc, v, j) => acc + v * r[j], 0));
  };
  let ground = { x: rigid('ux'), z: rigid('uz') };
  let condensation: Condensation | null = null;
  let K = fullK, M = fullM, F = fullF, dofs = fullDofs;
  if (masters.length < nF) {
    try { condensation = condense(fullK, fullM, fullF, masters); } catch { throw new SystemError('singular'); }
    ({ K, M, F } = condensation);
    dofs = masters.map((i) => fullDofs[i]);
    ground = { x: condense(fullK, fullM, ground.x, masters).F, z: condense(fullK, fullM, ground.z, masters).F };
  }

  const chains = new Map<number, number[]>();
  for (const [mid, segs] of sub.segments) {
    const e0 = model.elements.get(mid);
    if (e0) chains.set(mid, [e0.nodeI, ...(sub.inner.get(mid) ?? []), e0.nodeJ]);
    void segs;
  }
  const coords = new Map([...input.nodes.values()].map((n) => [n.id, { x: n.x, z: n.z }]));
  const totalMass = members.reduce((s, m) => s + m.rhoA * m.L, 0) + pts.reduce((s, p) => s + p.mx, 0);
  return { fullDofs, fullK, fullM, fullF, dofs, K, M, F, condensation, ground, massModel: opts.massModel, nPerMember: Math.max(1, opts.nPerMember), members, points: pts, totalMass, chains, coords };
}
