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
  const at = det.dofNumbering.dofs.find((d) => d.nodeId === nodeId && d.localDof === (dir === 'ux' ? 0 : 1));
  if (!at || !at.isFree) return 'restrained';
  let k: number;
  try {
    k = condense(det.Kff, zeros(nF), new Array(nF).fill(0), [at.globalIndex]).K[0][0];
  } catch { return 'mechanism'; }
  if (!(k > 1e-9)) return 'mechanism';
  const p = points.find((q) => q.nodeId === nodeId);
  const m = p ? (dir === 'uz' && p.horizontalOnly ? 0 : p.m) : 0;
  if (!(m > 0)) return 'noMass';
  return { nodeId, dir, k, delta: 1 / k, m, nFree: nF };
}

/** The node a model's single degree of freedom system starts from: the first with a point mass. */
export function defaultSdofNode(model: ModelData, points: readonly PointMass[]): number | null {
  return points.find((p) => p.m > 0 && model.nodes.has(p.nodeId))?.nodeId ?? null;
}
