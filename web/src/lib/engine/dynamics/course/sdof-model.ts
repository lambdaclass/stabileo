/**
 * A single degree of freedom system taken from the model: the stiffness the
 * structure offers at one node in one direction, k = 1/δ with δ the
 * displacement under a unit force there (the stiffness matrix condensed onto
 * that degree of freedom), and the point mass at the node.
 */
import type { ModelData } from '../../solver-service';
import { buildSolverInput2D } from '../../solver-service';
import { solveDetailed } from '../../solver-detailed';
import type { PointMass } from '../mass-source';
import { condense } from './mass-model';
import { zeros } from './dense';

export interface SdofFromModel { nodeId: number; dir: 'ux' | 'uz'; k: number; delta: number; m: number; nFree: number }
export type SdofModelRefusal = 'noNode' | 'restrained' | 'mechanism' | 'noMass';

export function sdofFromModel(model: ModelData, points: readonly PointMass[], nodeId: number | null, dir: 'ux' | 'uz'): SdofFromModel | SdofModelRefusal {
  if (nodeId === null || !model.nodes.has(nodeId)) return 'noNode';
  const input = buildSolverInput2D(model);
  if (!input) return 'noNode';
  const det = solveDetailed(input);
  const nF = det.dofNumbering.nFree;
  const frame = det.nodeFrames.find((f) => f.nodeId === nodeId);
  let k: number;
  if (!frame) {
    const at = det.dofNumbering.dofs.find((d) => d.nodeId === nodeId && d.localDof === (dir === 'ux' ? 0 : 1));
    if (!at || !at.isFree) return 'restrained';
    try {
      k = condense(det.Kff, zeros(nF), new Array(nF).fill(0), [at.globalIndex]).K[0][0];
    } catch { return 'mechanism'; }
  } else {
    const r = inclinedStiffness(det.Kff, nF, det.dofNumbering.dofs.filter((d) => d.nodeId === nodeId && d.isFree && d.localDof < 2), frame.angle, dir);
    if (typeof r === 'string') return r;
    k = r;
  }
  if (!(k > 1e-9)) return 'mechanism';
  const at = points.filter((q) => q.nodeId === nodeId && q.m > 0);
  const m = at.reduce((sum, q) => sum + (dir === 'uz' && q.horizontalOnly ? 0 : q.m), 0);
  if (!(m > 0)) return 'noMass';
  return { nodeId, dir, k, delta: 1 / k, m, nFree: nF };
}

/** The node a model's single degree of freedom system starts from: the first with a point mass. */
export function defaultSdofNode(model: ModelData, points: readonly PointMass[]): number | null {
  return points.find((p) => p.m > 0 && model.nodes.has(p.nodeId))?.nodeId ?? null;
}

/**
 * k along a global direction at a node whose DOFs are in a rotated frame (u_local = R·u_global):
 * the flexibility of its free local DOFs, turned global, read along that direction.
 */
function inclinedStiffness(Kff: number[][], nF: number, free: Array<{ localDof: number; globalIndex: number }>, angle: number, dir: 'ux' | 'uz'): number | 'restrained' | 'mechanism' {
  const c = Math.cos(angle), s = Math.sin(angle);
  const gLocal = dir === 'ux' ? [c, -s] : [s, c];
  const along = free.map((d) => gLocal[d.localDof]);
  if (along.every((v) => Math.abs(v) < 1e-12)) return 'restrained';
  let Kc: number[][];
  try { Kc = condense(Kff, zeros(nF), new Array(nF).fill(0), free.map((d) => d.globalIndex)).K; } catch { return 'mechanism'; }
  let delta: number;
  if (Kc.length === 1) delta = (along[0] * along[0]) / Kc[0][0];
  else {
    const det = Kc[0][0] * Kc[1][1] - Kc[0][1] * Kc[1][0];
    if (!(Math.abs(det) > 1e-12 * Math.max(Math.abs(Kc[0][0]), Math.abs(Kc[1][1])) ** 2)) return 'mechanism';
    const F = [[Kc[1][1] / det, -Kc[0][1] / det], [-Kc[1][0] / det, Kc[0][0] / det]];
    delta = along[0] * (F[0][0] * along[0] + F[0][1] * along[1]) + along[1] * (F[1][0] * along[0] + F[1][1] * along[1]);
  }
  return delta > 0 ? 1 / delta : 'mechanism';
}