/*
 * The selection operations a finite-element program is expected to have, and
 * did not.
 *
 * Picking one thing, dragging a Window or Crossing box, filtering by kind and
 * taking several kinds at once were all present. What was missing is
 * everything that treats the selection as a SET: take all of it, take none,
 * take the other half, or name what you want by id because you are reading it
 * out of a table.
 */
import { describe, it, expect } from 'vitest';
import { selectAll, invertSelection, parseIdList, selectByIds, allShellKeys, seedMembersOf, membersAsKinds } from '../select-ops';

const model = {
  nodes: new Map([[1, {}], [2, {}], [3, {}]]),
  elements: new Map([[1, {}], [2, {}]]),
  plates: new Map([[1, {}]]),
  quads: new Map([[1, {}], [2, {}]]),
};

const KINDS = (...k: string[]) => new Set(k);

describe('select all', () => {
  it('takes only the kinds being selected', () => {
    /*
     * Restricted deliberately: "select all" while the reader is working on
     * members must not hand back every node and plate as well, because the
     * next thing they do — delete, assign a section — would reach things they
     * cannot see they have taken.
     */
    const s = selectAll(model, KINDS('elements'));
    expect([...s.elements].sort()).toEqual([1, 2]);
    expect(s.nodes.size).toBe(0);
    expect(s.shells.size).toBe(0);
  });

  it('keys shells by kind, because the two id spaces overlap', () => {
    expect([...allShellKeys(model)].sort()).toEqual(['p1', 'q1', 'q2']);
  });

  it('takes several kinds when several are armed', () => {
    const s = selectAll(model, KINDS('nodes', 'shells'));
    expect(s.nodes.size).toBe(3);
    expect(s.shells.size).toBe(3);
    expect(s.elements.size).toBe(0);
  });
});

describe('invert', () => {
  it('returns everything of those kinds that was not selected', () => {
    const s = invertSelection(model, KINDS('nodes'), {
      nodes: new Set([2]), elements: new Set(), shells: new Set(),
    });
    expect([...s.nodes].sort()).toEqual([1, 3]);
  });

  it('of nothing is everything, and of everything is nothing', () => {
    const empty = { nodes: new Set<number>(), elements: new Set<number>(), shells: new Set<string>() };
    expect(invertSelection(model, KINDS('elements'), empty).elements.size).toBe(2);
    expect(invertSelection(model, KINDS('elements'), {
      ...empty, elements: new Set([1, 2]),
    }).elements.size).toBe(0);
  });
});

describe('naming what you want by id', () => {
  it('reads a list the way a person writes one', () => {
    expect(parseIdList('3, 7-10, 15').ids).toEqual([3, 7, 8, 9, 10, 15]);
  });

  it('accepts whatever separator was reached for', () => {
    expect(parseIdList('1 2;3,4').ids).toEqual([1, 2, 3, 4]);
  });

  it('reads a backwards range forwards, since that is what was meant', () => {
    expect(parseIdList('10-7').ids).toEqual([10, 9, 8, 7]);
  });

  it('does not repeat an id named twice', () => {
    expect(parseIdList('1-3, 2').ids).toEqual([1, 2, 3]);
  });

  it('reports what it could not read instead of dropping it', () => {
    const r = parseIdList('1, seven, 3');
    expect(r.ids).toEqual([1, 3]);
    expect(r.bad).toEqual(['seven']);
  });

  it('reports ids the model does not have', () => {
    /* "Select 1, 2, 9" quietly giving two of three is the kind of wrongness
       that ends with a member missing from a design run. */
    const r = selectByIds(model, 'elements', '1, 2, 9');
    expect([...r.selection.elements].sort()).toEqual([1, 2]);
    expect(r.missing).toEqual([9]);
  });

  it('takes one kind at a time, because node 1 and member 1 are different', () => {
    const r = selectByIds(model, 'nodes', '1');
    expect(r.selection.nodes.size).toBe(1);
    expect(r.selection.elements.size).toBe(0);
  });

  it('keys plates and quads apart', () => {
    expect([...selectByIds(model, 'plates', '1').selection.shells]).toEqual(['p1']);
    expect([...selectByIds(model, 'quads', '1').selection.shells]).toEqual(['q1']);
  });
});

describe('Basic: like the selection, in the kinds armed above', () => {
  // A beam 1-2 and a column 2-3; a support at 1; a load on the beam and one at node 3.
  const linked = {
    elements: new Map([[1, { nodeI: 1, nodeJ: 2 }], [2, { nodeI: 2, nodeJ: 3 }]]),
    supports: new Map([[5, { nodeId: 1 }]]),
    loads: [{ data: { id: 8, elementId: 1 } }, { data: { id: 9, nodeId: 3 } }],
  };

  it('takes its reference members from members, loads, nodes and supports alike', () => {
    expect(seedMembersOf(linked, { nodes: [], elements: [], supports: [], loads: [8] })).toEqual([1]);
    expect(seedMembersOf(linked, { nodes: [], elements: [], supports: [5], loads: [] })).toEqual([1]);
    expect(seedMembersOf(linked, { nodes: [3], elements: [], supports: [], loads: [] })).toEqual([2]);
  });

  it('gives a set of members back as the armed kinds: members, nodes, supports, loads', () => {
    const s = membersAsKinds(linked, [1], new Set(['supports', 'loads']));
    expect([...s.elements]).toEqual([]);
    expect([...s.supports!]).toEqual([5]);
    expect([...s.loads!]).toEqual([8]);
    const n = membersAsKinds(linked, [2], new Set(['nodes', 'loads']));
    expect([...n.nodes].sort()).toEqual([2, 3]);
    expect([...n.loads!]).toEqual([9]);
  });

  it('selects supports and loads by their numbers', () => {
    const model = { nodes: new Map(), elements: new Map(), supports: new Map([[5, {}]]), loads: [{ data: { id: 8 } }] };
    const s = selectByIds(model as never, 'supports', '5, 6');
    expect([...s.selection.supports!]).toEqual([5]);
    expect(s.missing).toEqual([6]);
    expect([...selectByIds(model as never, 'loads', '8').selection.loads!]).toEqual([8]);
  });
});
