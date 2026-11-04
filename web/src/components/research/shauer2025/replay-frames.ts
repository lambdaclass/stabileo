import type { Replay } from '../shell/replay';
import type { Step } from './protocol';

const SCALARS = ['pseudotime', 'displacement', 'reaction', 'residual', 'damage_max', 'damage_min',
  'elastic_energy', 'fracture_energy'] as const;

export function assertReplayFrames(replay: Replay<Step>): void {
  if (!replay.frames.length || replay.frames.some(({ step, damage, displacement }) =>
    !step || typeof step !== 'object' ||
    !SCALARS.every(key => Number.isFinite(step[key])) ||
    !Number.isSafeInteger(step.step) || step.step < 0 ||
    !Number.isSafeInteger(step.iterations) || step.iterations < 0 ||
    typeof step.converged !== 'boolean' ||
    damage.length !== replay.header.nodes || displacement.length !== 2 * replay.header.nodes ||
    !damage.every(Number.isFinite) || !displacement.every(Number.isFinite)
  )) throw new Error('invalid replay frame');
}
