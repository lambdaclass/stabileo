import type { SolverInput } from '../../../lib/engine/types';
export type Frame = { lambda: number; theta: number; displacement: number[] };
export function readFrame(result: { converged: boolean; finalLoadFactor: number; steps: { converged: boolean }[]; results: { displacements: { nodeId: number; ux: number; uz: number; ry: number }[] } }): Frame {
  if (!result.converged || !result.steps.length || result.steps.some(s => !s.converged)) throw new Error('Unconverged path');
  const displacement = Array<number>(42).fill(0);
  const ids = new Set<number>();
  let theta = NaN;
  for (const d of result.results.displacements) {
    if (!Number.isInteger(d.nodeId) || d.nodeId < 1 || d.nodeId > 21 || ids.has(d.nodeId)) throw new Error('Invalid node');
    ids.add(d.nodeId);
    displacement[2 * (d.nodeId - 1)] = d.ux;
    displacement[2 * (d.nodeId - 1) + 1] = d.uz;
    if (d.nodeId === 11) theta = d.ry;
  }
  if (ids.size !== 21 || ![theta, result.finalLoadFactor, ...displacement].every(Number.isFinite)) throw new Error('Invalid result');
  return { lambda: result.finalLoadFactor, theta, displacement };
}
export function modelFromWire(wire: Record<string, unknown>): SolverInput {
  const entries = (key: string) => new Map(Object.entries(wire[key] as Record<string, unknown>).map(([id, value]) => [Number(id), value]));
  return { nodes: entries('nodes'), elements: entries('elements'), supports: entries('supports'), materials: entries('materials'), sections: entries('sections'), loads: wire.loads } as SolverInput;
}
