/**
 * Which nodes carry a displacement label: the ones that moved most, and never too many.
 */
import { describe, it, expect } from 'vitest';
import { nodesToLabel, MAX_DISPLACEMENT_LABELS, DISPLACEMENT_LABEL_FLOOR } from '../deformed-view.svelte';

const d = (nodeId: number, ux: number, uy = 0, uz = 0) => ({ nodeId, ux, uy, uz });

describe('displacement labels', () => {
  it('label the nodes that moved at least a quarter of the most, largest first', () => {
    const got = nodesToLabel([d(1, 0), d(2, 0.004), d(3, 0, 0, -0.01), d(4, 0.0025), d(5, 0.0024)]);
    expect(got.map((g) => g.nodeId)).toEqual([3, 2, 4]); // 4 sits on the floor, 5 just under it
    expect(got[0]!.magnitude).toBeCloseTo(0.01, 12);
    expect(DISPLACEMENT_LABEL_FLOOR).toBe(0.25);
  });

  it('a structure at rest has none', () => {
    expect(nodesToLabel([d(1, 0), d(2, 0)])).toEqual([]);
  });

  it('a large model is capped, keeping the largest', () => {
    const many = Array.from({ length: 1000 }, (_, i) => d(i + 1, 1 + i / 1000));
    const got = nodesToLabel(many);
    expect(got).toHaveLength(MAX_DISPLACEMENT_LABELS);
    expect(got[0]!.nodeId).toBe(1000);
  });
});
