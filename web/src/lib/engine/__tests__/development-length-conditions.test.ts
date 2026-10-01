/**
 * The development length the check, the adapter and the report use takes Tabla 25.4.2.3's row
 * and §25.4.2.5's ψt from what is known about the bar, and absent that, the long answer.
 *
 * `requiredLd` called `deriveDevelopment` with the favourable row and ψt = 1 for every bar, while
 * `deriveDevelopment` itself refuses to default the row: «assuming the favourable row silently
 * shortens every anchorage by a third». A top Ø16 in a 50 cm H-25 beam, ADN 420, with nothing
 * known about its spacing, needs 420·1,3/(1,4·√25)·16 = 1248 mm; it was given 640.
 */
import { describe, it, expect } from 'vitest';
import { requiredLd, favourableRowHolds, continuingGroupsInto } from '../station-design-forces';
import { concreteBelowTopBars } from '../../codes/cirsoc201/anchorage';
import { verifyElement } from '../codes/argentina/cirsoc201';
import { cirsoc201Adapter } from '../design/adapters/cirsoc201-adapter';

describe('development length of a top bar', () => {
  it('takes ψt = 1,3 and the other-cases row unless the layout is known', () => {
    const below = concreteBelowTopBars(0.5, 0.025, 8, 16);
    expect(below).toBeGreaterThan(0.3);
    expect(requiredLd(16, 25, 420, { concreteBelowM: below })).toBeCloseTo(1.248, 3);
    // The favourable row, established, still carries ψt: 420·1,3/(2,1·5)·16 = 832 mm.
    expect(requiredLd(16, 25, 420, { concreteBelowM: below, favourableSpacing: true })).toBeCloseTo(0.832, 3);
  });

  it('takes ψt = 1 in a 30 cm beam, with 251 mm of concrete below', () => {
    expect(requiredLd(16, 25, 420, { concreteBelowM: concreteBelowTopBars(0.30, 0.025, 8, 16) })).toBeCloseTo(0.960, 3);
  });

  it('is what the report table prints for a beam, and the adapter answers', () => {
    const v = verifyElement({ elementId: 1, elementType: 'beam', Mu: 60, Vu: 40, Nu: 0, b: 0.25, h: 0.5, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 });
    const row = v.detailing!.bars[0]!;
    expect(row.ld).toBeCloseTo(requiredLd(row.diameter, 25, 420, { concreteBelowM: concreteBelowTopBars(0.5, 0.025, 8, row.diameter) }), 2);
    expect(row.ld).toBeGreaterThan(requiredLd(row.diameter, 25, 420, { favourableSpacing: true }));
    const limits = cirsoc201Adapter.detailingLimits({
      elementType: 'beam', section: { b: 0.25, h: 0.5 },
      material: { fc: 25, fy: 420, cover: 0.025, stirrupDia: 8, maxAggregateSize: { value: 19 } },
    } as never);
    expect(limits.ld(16)).toBeCloseTo(1.248, 3);
    expect(limits.lapSplice(16)).toBeCloseTo(1.3 * 1.248, 3);
  });
});

describe('the favourable row, established from the layout', () => {
  const section = { b: 0.3, cover: 0.025, stirrupDia: 8, fc: 25, fy: 420 };
  const atMinimum = { diameter: 8, legs: 2, spacing: 0.15 };

  it('holds for widely spaced bars, with or without stirrups', () => {
    // 3Ø16 across 23,4 cm: 93 mm clear ≥ 2·db.
    expect(favourableRowHolds([{ count: 3, diameter: 16, row: 0 }], section, [undefined], 0.45)).toBe(true);
  });

  it('needs stirrups at the minimum when the clear spacing is between db and 2·db', () => {
    // 6Ø16: (234 − 96)/5 = 27,6 mm clear.
    const six = [{ count: 6, diameter: 16, row: 0 }];
    expect(favourableRowHolds(six, section, [atMinimum, atMinimum], 0.45)).toBe(true);
    expect(favourableRowHolds(six, section, [atMinimum, undefined], 0.45)).toBe(false);
    // Ø6 c/30 is below Av,min = 0,35·bw/fyt and above d/2.
    expect(favourableRowHolds(six, section, [{ diameter: 6, legs: 2, spacing: 0.3 }], 0.45)).toBe(false);
  });

  it('decides whether a curtailed group reaches the region it is counted in', () => {
    const group = [{ layers: [{ count: 2, diameter: 16, row: 0 }], label: 'top', extensionEnd: 1.0 }];
    // 1,0 m reaches 0,83 m (favourable, ψt) but not 1,25 m (other row, ψt).
    const fav = continuingGroupsInto(group, 'end', 3, 25, 420, { favourableSpacing: true, concreteBelowM: 0.44 });
    const other = continuingGroupsInto(group, 'end', 3, 25, 420, { concreteBelowM: 0.44 });
    expect(fav.groups).toHaveLength(1);
    expect(fav.anchorageIssues).toHaveLength(0);
    expect(other.anchorageIssues[0]!.severity).not.toBe('ok');
  });
});
