import { describe, it, expect } from 'vitest';
import { regroupBars } from '../rebar-groups';
import type { LongBarGroup } from '../../../store/model.svelte';

const groups: LongBarGroup[] = [
  { layers: [{ count: 2, diameter: 16, row: 0 }], label: 'full-length' },
  { layers: [{ count: 2, diameter: 16, row: 0 }], label: 'cutoff', continueStart: false, continueEnd: false, extensionStart: 0.4 },
];

describe('cut groups follow an edit of the layers', () => {
  it('keeps the bars that ran through, and gives the rest the cut-off ends', () => {
    const out = regroupBars(groups, [{ count: 5, diameter: 16, row: 0 }])!;
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ continueStart: true, continueEnd: true, layers: [{ count: 2, diameter: 16, row: 0 }] });
    expect(out[1]).toMatchObject({ label: 'cutoff', continueStart: false, continueEnd: false, extensionStart: 0.4, layers: [{ count: 3, row: 0 }] });
  });
  it('splits row by row, from the first row', () => {
    const out = regroupBars(groups, [{ count: 1, diameter: 20, row: 0 }, { count: 3, diameter: 16, row: 1 }])!;
    expect(out[0].layers).toEqual([{ count: 1, diameter: 20, row: 0 }, { count: 1, diameter: 16, row: 1 }]);
    expect(out[1].layers).toEqual([{ count: 2, diameter: 16, row: 1 }]);
  });
  it('has nothing to split when every bar now runs through, or there were no cut-offs', () => {
    expect(regroupBars(groups, [{ count: 2, diameter: 16, row: 0 }])).toBeNull();
    expect(regroupBars([groups[0]!], [{ count: 6, diameter: 16, row: 0 }])).toBeNull();
    expect(regroupBars(undefined, [{ count: 6, diameter: 16, row: 0 }])).toBeNull();
  });
});
