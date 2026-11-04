import { describe, it, expect } from 'vitest';
import { hingeTracks, trackAt } from '../tracks';

const h = (elementId: number, position: number, loadFactor: number, step: number, unloadedAt?: number) =>
  ({ elementId, end: 'start' as const, moment: 1, loadFactor, step, position, unloadedAt });

describe('hinge tracks', () => {
  const hinges = [
    h(3, 1, 53.788, 0),
    h(2, 0.47, 63.811, 1, 64.058),
    h(2, 0.475, 64.058, 2, 65.29),
    h(2, 0.48, 65.29, 3),
    h(3, 0, 66.451, 4),
    h(1, 1, 71.296, 5),
  ];

  it('joins a span hinge that closes as its neighbour opens into one track that moved', () => {
    const tr = hingeTracks(hinges, 5);
    expect(tr.members).toEqual([[0], [1, 2, 3], [4], [5]]);
    expect(tr.keySteps).toEqual([0, 1, 4, 5]);
  });

  it('keeps end hinges and hinges on other members as their own tracks', () => {
    const tr = hingeTracks([h(2, 0, 10, 0, 12), h(2, 0.5, 12, 1)], 1);
    expect(tr.members).toEqual([[0], [1]]);
  });

  it('reads a track at a step: the hinge it has reached and where it started', () => {
    const tr = hingeTracks(hinges, 5);
    expect(trackAt(hinges, tr.members[1], 2, 64.058)).toEqual({ now: 2, first: 1, open: true });
    expect(trackAt(hinges, tr.members[1], 0, 53.788)).toBeNull();
  });
});
