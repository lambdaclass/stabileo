import type { Frame } from './simulation.svelte';

export function validFrame(frame: Frame, nodeCount: number, elementCount?: number): boolean {
  const scalarKeys = ['step', 'pseudotime', 'displacement', 'reaction', 'iterations', 'residual',
    'damage_max', 'damage_min', 'elastic_energy', 'fracture_energy'] as const;
  return Number.isInteger(nodeCount) && nodeCount > 0 &&
    scalarKeys.every(key => Number.isFinite(frame.step[key])) &&
    typeof frame.step.converged === 'boolean' &&
    frame.damage.length === nodeCount && frame.displacement.length === 2 * nodeCount &&
    (!frame.syy || (elementCount === undefined || frame.syy.length === elementCount)) &&
    [frame.damage, frame.displacement, ...(frame.syy ? [frame.syy] : [])].every(a => a.every(Number.isFinite));
}
