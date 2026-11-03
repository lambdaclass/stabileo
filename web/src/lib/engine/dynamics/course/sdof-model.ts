/**
 * A single degree of freedom system taken from the model: the stiffness the
 * structure offers at one node in one direction, k = 1/δ with δ the
 * displacement under a unit force there (the stiffness matrix condensed onto
 * that degree of freedom), and the point mass at the node. A model whose other
 * point masses (or a rotational inertia) would move with it is refused: that
 * inertia is not in m, and the frequency would come out too high.
 */
import type { ModelData } from '../../solver-service';
import { buildSolverInput2D } from '../../solver-service';
import { freeDofCount, solveDetailed } from '../../solver-detailed';
import type { PointMass } from '../mass-source';
import { condense } from './mass-model';
import { zeros } from './dense';
import { MAX_SYSTEM_DOFS } from './mdof-system';

export interface SdofFromModel { nodeId: number; dir: 'ux' | 'uz'; k: number; delta: number; m: number; nFree: number }
export type SdofModelRefusal = 'noNode' | 'restrained' | 'mechanism' | 'noMass' | 'tooBig' | 'otherMasses';

export function sdofFromModel(model: ModelData, points: readonly PointMass[], nodeId: number | null, dir: 'ux' | 'uz'): SdofFromModel | SdofModelRefusal {
  if (nodeId === null || !model.nodes.has(nodeId)) return 'noNode';
  const input = buildSolverInput2D(model);
  if (!input) return 'noNode';
  if (freeDofCount(input) > MAX_SYSTEM_DOFS) return 'tooBig';
  const det = solveDetailed(input);
  const nF = det.dofNumbering.nFree;
  const angle = det.nodeFrames.find((f) => f.nodeId === nodeId)?.angle ?? 0;
  const free = det.dofNumbering.dofs.filter((d) => d.nodeId === nodeId && d.isFree && d.localDof < 2);
  const g: [number, number] = dir === 'ux' ? [1, 0] : [0, 1];
  const f = nodeDeflection(det.Kff, nF, free, angle, g);
  if (f === 'mechanism') return 'mechanism';
  const delta = g[0] * f[0] + g[1] * f[1];
  if (delta < 0 || !Number.isFinite(delta)) return 'mechanism';
  if (!(delta > 0) || free.length === 0) return 'restrained';
  const k = 1 / delta;
  const moves = (id: number, dofs: number[]) => det.dofNumbering.dofs.some((d) => d.nodeId === id && d.isFree && dofs.includes(d.localDof));
  if (points.some((q) => model.nodes.has(q.nodeId) && ((q.nodeId !== nodeId && q.m > 0 && moves(q.nodeId, [0, 1])) || ((q.izz ?? 0) > 0 && moves(q.nodeId, [2]))))) return 'otherMasses';
  const at = points.filter((q) => q.nodeId === nodeId && q.m > 0);
  const mx = at.reduce((sum, q) => sum + q.m, 0);
  const mz = at.reduce((sum, q) => sum + (q.horizontalOnly ? 0 : q.m), 0);
  const m = (mx * f[0] * f[0] + mz * f[1] * f[1]) / (delta * delta);
  if (!(m > 0)) return 'noMass';
  return { nodeId, dir, k, delta, m, nFree: nF };
}

/** The node a model's single degree of freedom system starts from: the first with a point mass. */
export function defaultSdofNode(model: ModelData, points: readonly PointMass[]): number | null {
  return points.find((p) => p.m > 0 && model.nodes.has(p.nodeId))?.nodeId ?? null;
}

/**
 * The node's global translation under a unit force g at it: the flexibility of its free DOFs
 * (in the node's frame, u_local = R·u_global), turned global. The mass that, with k = 1/(g·f),
 * gives the frequency of that deflected shape is (mx·fx² + mz·fz²)/(g·f)².
 */
function nodeDeflection(Kff: number[][], nF: number, free: Array<{ localDof: number; globalIndex: number }>, angle: number, g: [number, number]): [number, number] | 'mechanism' {
  if (!free.length) return [0, 0];
  const c = Math.cos(angle), s = Math.sin(angle);
  const gLocal = [c * g[0] + s * g[1], -s * g[0] + c * g[1]];
  let Kc: number[][];
  try { Kc = condense(Kff, zeros(nF), new Array(nF).fill(0), free.map((d) => d.globalIndex)).K; } catch { return 'mechanism'; }
  if (!Kc.every((r, i) => r[i] > 1e-12 * Math.abs(Kff[free[i].globalIndex][free[i].globalIndex]))) return 'mechanism';
  const uLocal = [0, 0];
  if (Kc.length === 1) {
    uLocal[free[0].localDof] = gLocal[free[0].localDof] / Kc[0][0];
  } else {
    const d0 = 1 / Math.sqrt(Kc[0][0]), d1 = 1 / Math.sqrt(Kc[1][1]);
    const r01 = Kc[0][1] * d0 * d1, r10 = Kc[1][0] * d0 * d1;
    const det = 1 - r01 * r10;
    if (!(det > 1e-12)) return 'mechanism';
    const p = free.map((d) => gLocal[d.localDof]);
    const q0 = p[0] * d0, q1 = p[1] * d1;
    uLocal[free[0].localDof] = d0 * (q0 - r01 * q1) / det; uLocal[free[1].localDof] = d1 * (q1 - r10 * q0) / det;
  }
  return [c * uLocal[0] - s * uLocal[1], s * uLocal[0] + c * uLocal[1]];
}
