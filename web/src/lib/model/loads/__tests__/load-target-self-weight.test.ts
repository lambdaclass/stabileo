/**
 * The self-weight's "Apply to": on a group it weighs the group's shells with its members
 * (`engine/self-weight.ts` `selfWeightScope`), so the count beside Add says both, and a group of
 * slabs alone is offered. Other loads count, and offer groups by, what they go on.
 */
import { describe, it, expect } from 'vitest';
import { groupOffered, resolveTargets, selfWeightReach, selfWeightTarget, type TargetModel } from '../load-targets';
import { selfWeightScope } from '../../../engine/self-weight';
import type { ModelGroup } from '../../../store/model.svelte';

const sq = (id: number) => ({ id, nodes: [1, 2, 3, 4] });
const groups = new Map<number, Pick<ModelGroup, 'kind' | 'members'>>([
  [1, { kind: 'custom', members: { elements: [1], quads: [1, 2] } }],
  [2, { kind: 'custom', members: { quads: [2], plates: [1] } }],
  [3, { kind: 'floorLoad', members: { quads: [1] } }],
]);
const model: TargetModel = {
  nodes: new Map([[1, { x: 0, y: 0 }], [2, { x: 1, y: 0 }], [3, { x: 1, y: 1 }], [4, { x: 0, y: 1 }]]),
  elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1 }], [2, { id: 2, nodeI: 2, nodeJ: 3, sectionId: 1 }]]),
  quads: new Map([[1, sq(1)], [2, sq(2)]]),
  plates: new Map([[1, { id: 1, nodes: [1, 2, 3] }]]),
  groups,
};
const noSel = { nodes: [], elements: [] };

describe('the count beside Add, for the self-weight', () => {
  it('a group: its members and its slabs, as the rule weighs them', () => {
    // What the picker counted before: the members alone.
    expect(resolveTargets('members', { by: 'group', groupId: 1 }, model, noSel)).toHaveLength(1);
    const reach = selfWeightReach({ by: 'group', groupId: 1 }, model, noSel);
    expect(reach).toEqual({ members: 1, slabs: 2 });
    const scope = selfWeightScope(model as never, { caseId: 1, direction: 'Z', factor: -1, groupId: 1 });
    expect(reach).toEqual({ members: scope.members!.size, slabs: scope.quads!.size + scope.plates!.size });
  });

  it('the whole model: every member and slab; another target: the members alone', () => {
    expect(selfWeightReach({ by: 'all' }, model, noSel)).toEqual({ members: 2, slabs: 3 });
    expect(selfWeightReach({ by: 'ids', text: '1, 2' }, model, noSel)).toEqual({ members: 2, slabs: 0 });
  });
});

describe('the groups offered', () => {
  it('for the self-weight, a group of slabs alone; for a member load, groups with members', () => {
    const g = groups;
    expect(groupOffered(g.get(2)!, 'members')).toBe(false);
    expect(groupOffered(g.get(2)!, 'members', true)).toBe(true);
    expect(groupOffered(g.get(1)!, 'members')).toBe(true);
    expect(groupOffered(g.get(2)!, 'quads')).toBe(true);
    expect(groupOffered(g.get(2)!, 'nodes')).toBe(false);
    // A floor-load definition is never a target.
    expect(groupOffered(g.get(3)!, 'members', true)).toBe(false);
    expect(groupOffered(g.get(3)!, 'quads')).toBe(false);
  });
});

it('#2565 rejects a partial typed self-weight selection and stale group membership', () => {
  expect(selfWeightTarget({ by: 'ids', text: '1-2' }, model, noSel)).toEqual({ elements: [1, 2] });
  expect(selfWeightTarget({ by: 'ids', text: '1, 1.5' }, model, noSel)).toEqual({ error: expect.stringContaining('1.5') });
  expect(selfWeightTarget({ by: 'ids', text: '1, 3' }, model, noSel)).toEqual({ error: expect.stringContaining('3') });
  expect(selfWeightTarget({ by: 'ids', text: '9007199254740992-9007199254740992' }, model, noSel))
    .toEqual({ error: expect.stringContaining('9007199254740992') });
  const stale = { ...model, quads: new Map([[1, sq(1)]]) };
  expect(selfWeightTarget({ by: 'group', groupId: 1 }, stale, noSel)).toEqual({ error: expect.stringContaining('2') });
  expect(selfWeightTarget({ by: 'group', groupId: 1 }, model, noSel)).toEqual({ groupId: 1 });
});

it.each([
  '9007199254740993',
  '09007199254740992',
  '9007199254740991 – 9007199254740993',
])('#2565 — reports typed self-weight token %s verbatim', token => {
  const result = selfWeightTarget({ by: 'ids', text: `1, ${token}` }, model, noSel);
  expect(result).toEqual({ error: expect.stringContaining(token) });
});

it('accepts live typed IDs at the safe integer boundary', () => {
  const hi = Number.MAX_SAFE_INTEGER;
  const withBoundary = {
    ...model,
    elements: new Map([...model.elements, [hi, { ...model.elements.get(1)!, id: hi }]]),
  };
  for (const text of [String(hi), `${hi}-${hi}`]) {
    expect(selfWeightTarget({ by: 'ids', text }, withBoundary, noSel)).toEqual({ elements: [hi] });
  }
});
