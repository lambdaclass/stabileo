/**
 * The n degree of freedom system of a plane model, M·ü + K·u = F(t), as the
 * classroom writes it: K from the matrix stiffness method on the free degrees
 * of freedom, M from the bars' distributed mass (lumped or consistent) plus
 * the point masses, and the degrees of freedom without mass condensed out.
 */
import type { ModelData } from '../../solver-service';
import { buildSolverInput2D } from '../../solver-service';
import { solveDetailed } from '../../solver-detailed';
import { withSectionMass } from '../section-mass';
import type { PointMass } from '../mass-source';
import { subdivideForAnalysis } from '../../../model/edit/analysis-subdivision';
import { type Mat, zeros, congruence } from './dense';
import { type MassModel, type Condensation, lumpedFrameMass, consistentFrameMass, trussMass, condense } from './mass-model';

export type DofDir = 'ux' | 'uz' | 'ry';
export interface DofRef { nodeId: number; dir: DofDir }

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
  constructor(public code: 'empty' | 'noMass' | 'singular' | 'tooBig', public params: Record<string, number> = {}) { super(code); }
}

export const MAX_SYSTEM_DOFS = 90;

export function modelSystem(model: ModelData, points: readonly PointMass[], opts: SystemOptions): MdofSystem {
  const sub = subdivideForAnalysis(model, opts.nPerMember);
  const raw = buildSolverInput2D(sub.model, opts.includeSelfWeight ?? false);
  if (!raw) throw new SystemError('empty');
  const { input, densities } = withSectionMass(raw, sub.model);
  const det = solveDetailed(input);
  const nF = det.dofNumbering.nFree;
  if (nF > MAX_SYSTEM_DOFS) throw new SystemError('tooBig', { n: nF, max: MAX_SYSTEM_DOFS });
  const nT = det.dofNumbering.nTotal;
  const dirs: DofDir[] = det.dofNumbering.dofsPerNode === 3 ? ['ux', 'uz', 'ry'] : ['ux', 'uz'];
  const fullDofs: DofRef[] = det.dofNumbering.dofs.filter((d) => d.isFree).map((d) => ({ nodeId: d.nodeId, dir: dirs[d.localDof] }));
  const memberOf = new Map<number, number>();
  for (const [mid, segs] of sub.segments) for (const s of segs) memberOf.set(s, mid);

  const Mt = zeros(nT);
  const members: MemberMass[] = [];
  const consistent = opts.massModel !== 'lumped';
  for (const ed of det.elements) {
    const e = input.elements.get(ed.elementId)!;
    const rho = densities.get(e.materialId) ?? 0;
    const rhoA = opts.barMass ? (rho * ed.A) / 1000 : 0;
    if (!(rhoA > 0)) continue;
    const released = ed.type === 'frame' && (ed.hingeStart || ed.hingeEnd);
    let mg: Mat;
    if (ed.type === 'truss') mg = trussMass(rhoA, ed.length, consistent);
    else if (!consistent || released) mg = congruence(ed.T, lumpedFrameMass(rhoA, ed.length));
    else mg = congruence(ed.T, consistentFrameMass(rhoA, ed.length));
    members.push({ elementId: ed.elementId, memberId: memberOf.get(ed.elementId) ?? ed.elementId, type: ed.type, rhoA, L: ed.length, kind: released && consistent ? 'released' : consistent ? 'consistent' : 'lumped' });
    ed.dofIndices.forEach((gi, a) => ed.dofIndices.forEach((gj, b) => { Mt[gi][gj] += mg[a][b]; }));
  }
  const pts: MdofSystem['points'] = [];
  const indexOf = (nodeId: number, ld: number) => det.dofNumbering.dofs.find((d) => d.nodeId === nodeId && d.localDof === ld)?.globalIndex;
  for (const p of points) {
    if (!(p.m > 0) || !input.nodes.has(p.nodeId)) continue;
    const mz = p.horizontalOnly ? 0 : p.m;
    pts.push({ nodeId: p.nodeId, mx: p.m, mz });
    const ix = indexOf(p.nodeId, 0), iz = indexOf(p.nodeId, 1);
    if (ix !== undefined) Mt[ix][ix] += p.m;
    if (iz !== undefined) Mt[iz][iz] += mz;
  }

  const fullK = det.Kff.map((r) => [...r]);
  const fullM = Mt.slice(0, nF).map((r) => r.slice(0, nF));
  const fullF = [...det.FfMod];
  const scaleM = Math.max(...fullM.map((r, i) => Math.abs(r[i])), 0);
  if (!(scaleM > 0)) throw new SystemError('noMass');
  const hasMass = (i: number) => fullM[i].some((v) => Math.abs(v) > 1e-12 * scaleM);
  const translational = (i: number) => fullDofs[i].dir !== 'ry';
  const masters = fullDofs.map((_, i) => i).filter((i) => hasMass(i) && (opts.massModel !== 'guyan' || translational(i)));
  if (!masters.length) throw new SystemError('noMass');
  let condensation: Condensation | null = null;
  let K = fullK, M = fullM, F = fullF, dofs = fullDofs;
  if (masters.length < nF) {
    try { condensation = condense(fullK, fullM, fullF, masters); } catch { throw new SystemError('singular'); }
    ({ K, M, F } = condensation);
    dofs = masters.map((i) => fullDofs[i]);
  }

  const chains = new Map<number, number[]>();
  for (const [mid, segs] of sub.segments) {
    const e0 = model.elements.get(mid);
    if (e0) chains.set(mid, [e0.nodeI, ...(sub.inner.get(mid) ?? []), e0.nodeJ]);
    void segs;
  }
  const coords = new Map([...input.nodes.values()].map((n) => [n.id, { x: n.x, z: n.z }]));
  const totalMass = members.reduce((s, m) => s + m.rhoA * m.L, 0) + pts.reduce((s, p) => s + p.mx, 0);
  return { fullDofs, fullK, fullM, fullF, dofs, K, M, F, condensation, massModel: opts.massModel, nPerMember: Math.max(1, opts.nPerMember), members, points: pts, totalMass, chains, coords };
}
