import { expect, it } from 'vitest';
import data from '../../../../../../research/numerical-methods/riks-crisfield/reference-results/arc_length_snap_through.json';
import { frameReferenceLoadAt, compareFrameRun, DEFAULT_PARAMETERS, type CaseFile } from '../benchmark';
import { nativeReplay } from '../replay';
const frame = (data as CaseFile).cases.find(c => c.id === 'shallow-toggle')!;
it('matches independently differentiated frame energy, including beyond the truss peak', () => {
  for (const [v, force] of [[.0024736193991736002, 48.749671363], [.04228900098628047, 727.995663060], [.1, 1496.881937216], [.2, 2986.298129110]]) {
    expect(frameReferenceLoadAt(frame, v)).toBeCloseTo(force, 6);
  }
});
it('compares the rigid frame replay with its energy reference without claiming a limit', () => {
  const checks = compareFrameRun(frame, nativeReplay(frame));
  expect(checks.map(c => c.id)).toEqual(['equilibrium-path']);
  expect(checks[0].error).toBeLessThan(1e-5);
  expect(checks[0].passed).toBe(true);
  expect(compareFrameRun(frame, { ...nativeReplay(frame), frames: [], parameters: DEFAULT_PARAMETERS(frame) })[0].passed).toBe(false);
});
