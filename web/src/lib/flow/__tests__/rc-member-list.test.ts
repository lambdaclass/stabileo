/**
 * The detailing list's census, and the three situations it must keep apart.
 *
 * The assertions that matter here are the negative ones: a family nobody has classified yet must
 * not read as a family the building does not have. That distinction is the whole reason the module
 * returns a state instead of a count, and it is invisible to a test that only checks totals.
 */

import { describe, it, expect } from 'vitest';
import {
  rcMemberList, rcFamilyCensus, rcMemberRows, rcVisibleFamilies,
  rcHasListableMembers, rcHasUnclassifiedFamilies, rcFamilyLabelKey, rcGroupOfFamily,
  type RcMemberListInput,
} from '../rc-member-list';
import { RC_ELEMENT_GROUPS, rcFamiliesIn } from '../rc-selection';
import { SCENE_SOLID_KINDS, type SceneSolidKind } from '../../engine/detailing/scene-model';

function input(
  membership: Array<[number, SceneSolidKind]>,
  detailed: number[] = [],
  modelCounts: Partial<Record<SceneSolidKind, number>> = {},
): RcMemberListInput {
  return { membership: new Map(membership), detailed: new Set(detailed), modelCounts };
}

/** A frame: two beams, two columns, all detailed. */
const FRAME = input(
  [[1, 'beam'], [2, 'beam'], [3, 'column'], [4, 'column']],
  [1, 2, 3, 4],
  { beam: 2, column: 2 },
);

describe('grouping — objective 1', () => {
  it('files every scene family under exactly one group', () => {
    const seen = new Map<SceneSolidKind, string[]>();
    for (const g of rcMemberList(FRAME)) {
      for (const f of g.families) seen.set(f.family, [...(seen.get(f.family) ?? []), g.group]);
    }
    // Exhaustiveness: a seventh scene family added without a group would silently vanish.
    expect([...seen.keys()].sort()).toEqual([...SCENE_SOLID_KINDS].sort());
    for (const [family, groups] of seen) {
      expect(groups, `${family} is in one group`).toHaveLength(1);
      expect(groups[0]).toBe(rcGroupOfFamily(family));
    }
  });

  it('keeps the groups in the presentation order the contract fixes', () => {
    expect(rcMemberList(FRAME).map((g) => g.group)).toEqual([...RC_ELEMENT_GROUPS]);
  });

  it('names keys and never text', () => {
    expect(rcFamilyLabelKey('beam')).toBe('design.families.beam');
    // The group heading key comes from the selection contract, not a second namespace here.
    expect(rcMemberList(FRAME)[0].labelKey).toBe('design.elementGroup.linear');
  });
});

describe('a frames-only model', () => {
  it('lists beams and columns, and renders the linear group', () => {
    const linear = rcMemberList(FRAME).find((g) => g.group === 'linear')!;
    expect(linear.render).toBe(true);
    /*
     * Read from the contract rather than written out. `SCENE_SOLID_KINDS` is `column, beam, …`,
     * and the first version of this spelled it "beam, column" — which is how the list, the layer
     * switches and the renderer come to present the same families in three different orders.
     * `rcFamiliesIn` owns the sequence; asserting a literal here would fork it.
     */
    expect(linear.families.map((f) => f.family)).toEqual(rcFamiliesIn('linear'));
    for (const f of linear.families) {
      expect(f.census.state).toBe('present');
      expect(f.census.total).toBe(2);
      expect(f.census.detailed).toBe(2);
    }
  });

  it('does NOT render surface or foundation, because the model has none', () => {
    for (const g of rcMemberList(FRAME)) {
      if (g.group === 'linear') continue;
      expect(g.render, `${g.group} is not rendered`).toBe(false);
      for (const f of g.families) expect(f.census.state).toBe('absent');
    }
  });

  it('lists rows in id order regardless of map insertion order', () => {
    const shuffled = input([[4, 'beam'], [1, 'beam'], [3, 'beam']], [], { beam: 3 });
    expect(rcMemberRows('beam', shuffled).map((r) => r.elementId)).toEqual([1, 3, 4]);
  });
});

describe('a model with slabs, walls and foundations', () => {
  const FULL = input(
    [[1, 'beam'], [3, 'column'], [10, 'slab'], [11, 'wall'], [20, 'footing'], [21, 'pedestal']],
    [1, 3, 10],
    { beam: 1, column: 1, slab: 1, wall: 1, footing: 1, pedestal: 1 },
  );

  it('renders all three groups', () => {
    for (const g of rcMemberList(FULL)) expect(g.render, g.group).toBe(true);
  });

  it('puts the pedestal with the foundations, not with the columns', () => {
    const foundation = rcMemberList(FULL).find((g) => g.group === 'foundation')!;
    expect(foundation.families.map((f) => f.family).sort()).toEqual(['footing', 'pedestal']);
    const linear = rcMemberList(FULL).find((g) => g.group === 'linear')!;
    expect(linear.families.some((f) => f.family === 'pedestal')).toBe(false);
  });

  it('counts detailed members without overstating them', () => {
    const slab = rcFamilyCensus('slab', FULL);
    expect(slab).toMatchObject({ state: 'present', total: 1, detailed: 1 });
    // Modelled, classified, and NOT detailed: the count says so rather than hiding the member.
    const wall = rcFamilyCensus('wall', FULL);
    expect(wall).toMatchObject({ state: 'present', total: 1, detailed: 0 });
    expect(rcMemberRows('wall', FULL)).toEqual([
      { elementId: 11, family: 'wall', detailed: false },
    ]);
  });
});

describe('absent versus not counted yet — the distinction §2 requires', () => {
  it('a family the model does not hold is absent', () => {
    expect(rcFamilyCensus('slab', FRAME).state).toBe('absent');
  });

  it('a family with candidates but no classification is UNKNOWN, not absent', () => {
    // The demand pass has not run: the model has frame elements, nothing is classified.
    const undesigned = input([], [], { beam: 8, column: 8 });
    expect(rcFamilyCensus('beam', undesigned).state).toBe('unknown');
    expect(rcFamilyCensus('column', undesigned).state).toBe('unknown');
    // And it is not reported as a zero, which is what would read as "this building has no beams".
    expect(rcFamilyCensus('beam', undesigned).total).toBe(0);
    expect(rcHasUnclassifiedFamilies(undesigned)).toBe(true);
  });

  it('an unknown family is still rendered — hiding it is the flattening', () => {
    // Shells exist but the floor pass has not decided slab from wall.
    const shells = input([[1, 'beam']], [], { beam: 1, slab: 4, wall: 4 });
    const surface = rcMemberList(shells).find((g) => g.group === 'surface')!;
    expect(surface.render, 'the group is rendered').toBe(true);
    for (const f of surface.families) expect(f.census.state).toBe('unknown');
    expect(rcVisibleFamilies(shells)).toContain('slab');
    expect(rcVisibleFamilies(shells)).toContain('wall');
  });

  it('distinguishes a model with nothing from a model not yet classified', () => {
    const empty = input([], [], {});
    const pending = input([], [], { beam: 5 });
    expect(rcHasListableMembers(empty)).toBe(false);
    expect(rcHasListableMembers(pending)).toBe(false);
    // Same emptiness of ROWS, different statements about the structure.
    expect(rcHasUnclassifiedFamilies(empty)).toBe(false);
    expect(rcHasUnclassifiedFamilies(pending)).toBe(true);
    expect(rcFamilyCensus('beam', empty).state).toBe('absent');
    expect(rcFamilyCensus('beam', pending).state).toBe('unknown');
  });
});

describe('families that exist but have not been designed', () => {
  it('lists their members, marked undetailed, rather than dropping them', () => {
    const classified = input([[1, 'beam'], [2, 'beam']], [], { beam: 2 });
    const beam = rcFamilyCensus('beam', classified);
    expect(beam).toMatchObject({ state: 'present', total: 2, detailed: 0 });
    expect(rcMemberRows('beam', classified).every((r) => !r.detailed)).toBe(true);
  });

  it('a partly detailed family reports both halves', () => {
    const partial = input([[1, 'beam'], [2, 'beam'], [3, 'beam']], [2], { beam: 3 });
    expect(rcFamilyCensus('beam', partial)).toMatchObject({ total: 3, detailed: 1 });
    expect(rcMemberRows('beam', partial).map((r) => r.detailed)).toEqual([false, true, false]);
  });
});

describe('the linear group is never hidden', () => {
  it('renders even on a completely empty project', () => {
    const empty = input([], [], {});
    const linear = rcMemberList(empty).find((g) => g.group === 'linear')!;
    expect(linear.render).toBe(true);
    expect(rcVisibleFamilies(empty)).toEqual(rcFamiliesIn('linear'));
  });
});

describe('the result is complete, so a caller never has to guess', () => {
  it('every group and every family appears, rendered or not', () => {
    const list = rcMemberList(input([], [], {}));
    expect(list).toHaveLength(RC_ELEMENT_GROUPS.length);
    const families = list.flatMap((g) => g.families.map((f) => f.family));
    expect([...families].sort()).toEqual([...SCENE_SOLID_KINDS].sort());
  });

  it('detailed never exceeds total', () => {
    // A stale detailed set naming members that are no longer classified must not inflate anything.
    const stale = input([[1, 'beam']], [1, 2, 3, 99], { beam: 1 });
    const beam = rcFamilyCensus('beam', stale);
    expect(beam.detailed).toBeLessThanOrEqual(beam.total);
    expect(beam).toMatchObject({ total: 1, detailed: 1 });
  });
});
