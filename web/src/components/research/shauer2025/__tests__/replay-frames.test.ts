import { expect, it } from 'vitest';
import { assertReplayFrames } from '../replay-frames';
import type { Replay } from '../../shell/replay';
import type { Step } from '../protocol';

function sample(): Replay<Step> {
  return {
    header: { nodes: 1, elements: 1, damage_max: 1.05, displacement_scale: [1], steps: [], config: {} },
    nodes: new Float64Array([0, 0]), elements: new Uint32Array([0, 0, 0, 0]),
    frames: [{
      step: { step: 0, pseudotime: 0.01, displacement: 0.1, reaction: 1, iterations: 1,
        converged: true, residual: 1e-9, damage_max: 0.1, damage_min: 0,
        elastic_energy: 1, fracture_energy: 0.1 },
      damage: new Float32Array([0.1]), displacement: new Float32Array([0, 0.1]),
    }],
  };
}

it('accepts a complete finite replay frame', () => {
  expect(() => assertReplayFrames(sample())).not.toThrow();
});

it('rejects missing, nonnumeric and nonfinite step values before rendering', () => {
  for (const key of Object.keys(sample().frames[0].step)) {
    for (const value of [undefined, null, '1', NaN, Infinity]) {
      const replay = sample();
      Object.assign(replay.frames[0].step, { [key]: value });
      expect(() => assertReplayFrames(replay), `${key}: ${value}`).toThrow('invalid replay frame');
    }
  }
});

it('rejects empty replays and invalid field lengths or values', () => {
  const empty = sample();
  empty.frames = [];
  expect(() => assertReplayFrames(empty)).toThrow();
  for (const key of ['damage', 'displacement'] as const) {
    for (const values of [[], [Infinity], [NaN, 0]]) {
      const replay = sample();
      replay.frames[0][key] = Float32Array.from(values);
      expect(() => assertReplayFrames(replay)).toThrow();
    }
  }
});
