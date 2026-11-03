/**
 * A single degree of freedom system taken from the model: the stiffness the
 * structure offers at one node in one direction, k = 1/δ with δ the
 * displacement under a unit force there (the stiffness matrix condensed onto
 * that degree of freedom), and the point mass at the node.
 */
import type { ModelData } from '../../solver-service';
import { buildSolverInput2D } from '../../solver-service';
import { freeDofCount, solveDetailed } from '../../solver-detailed';
import type { PointMass } from '../mass-source';
import { condense } from './mass-model';
import { zeros } from './dense';
import { MAX_SYSTEM_DOFS } from './mdof-system';

export interface SdofFromModel { nodeId: number; dir: 'ux' | 'uz'; k: number; delta: number; m: number; nFree: number }
export type SdofModelRefusal = 'noNode' | 'restrained' | 'mechanism' | 'noMass' | 'tooBig';

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
  const scale = Math.max(...Kff.map((r, i) => Math.abs(r[i])));
  if (!Kc.every((r, i) => r[i] > 1e-12 * scale)) return 'mechanism';
  const uLocal = [0, 0];
  if (Kc.length === 1) {
    uLocal[free[0].localDof] = gLocal[free[0].localDof] / Kc[0][0];
  } else {
    const det = Kc[0][0] * Kc[1][1] - Kc[0][1] * Kc[1][0];
    if (!(Math.abs(det) > 1e-12 * Math.max(Math.abs(Kc[0][0]), Math.abs(Kc[1][1])) ** 2)) return 'mechanism';
    const p = free.map((d) => gLocal[d.localDof]);
    const u0 = (Kc[1][1] * p[0] - Kc[0][1] * p[1]) / det, u1 = (-Kc[1][0] * p[0] + Kc[0][0] * p[1]) / det;
    uLocal[free[0].localDof] = u0; uLocal[free[1].localDof] = u1;
  }
  return [c * uLocal[0] - s * uLocal[1], s * uLocal[0] + c * uLocal[1]];
}
