/**
 * Named groups, and the property that makes a physical member a later RULE rather than a
 * later MIGRATION.
 *
 * `member-grouping.ts` derives its bands from coordinates and refuses a grouping the
 * geometry cannot support. That is right for something nobody stated. What a user DOES
 * state needs somewhere to live, and everything that wants to live there — a saved
 * selection, a floor a load command targets, the several collinear bars that are one
 * column to the engineer who drew them — has the same shape: identity, name, entities.
 *
 * So the schema is one, `kind` is the extension point, and the test that matters is the
 * last one: a kind this build does not know must come back out exactly as it went in.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';

function frame(): { a: number; b: number; e: number } {
  modelStore.clear?.();
  const m = modelStore.addMaterial({ name: 'S', e: 200000, nu: 0.3, rho: 78.5, fy: 355 });
  const s = modelStore.addSection({ name: 'R', b: 0.1, h: 0.2, a: 0.02, iy: 1e-5, iz: 1e-5, j: 1e-5, shape: 'rect' });
  const a = modelStore.addNode(0, 0, 0);
  const b = modelStore.addNode(4, 0, 0);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.updateElementSection(e, s);
  modelStore.updateElementMaterial(e, m);
  return { a, b, e };
}

describe('named groups', () => {
  beforeEach(() => { frame(); });

  it('a new model has none, and a model with none emits none', () => {
    expect(modelStore.model.groups.size).toBe(0);
    // Absent and empty mean the same for groups, so `restore(snapshot())` stays a no-op
    // and a file written before they existed opens unchanged.
    expect(modelStore.snapshot().groups).toBeUndefined();
  });

  it('holds what was stated: name, kind, entities', () => {
    const { a, e } = frame();
    const id = modelStore.addGroup('Eje A', 'selection', { nodes: [a], elements: [e] });
    const g = modelStore.model.groups.get(id)!;
    expect(g.name).toBe('Eje A');
    expect(g.kind).toBe('selection');
    expect(g.origin).toBe('user');
    expect(g.members.elements).toEqual([e]);
  });

  it('does not share its arrays with the caller', () => {
    const { e } = frame();
    const members = { elements: [e] };
    const id = modelStore.addGroup('G', 'selection', members);
    members.elements.push(999);
    expect(modelStore.model.groups.get(id)!.members.elements).toEqual([e]);
  });

  it('round-trips through a snapshot', () => {
    const { a, e } = frame();
    modelStore.addGroup('Planta 1', 'floor', { nodes: [a], elements: [e] }, { data: { elevation: 3.2 } });
    const snap = JSON.parse(JSON.stringify(modelStore.snapshot()));
    frame();
    expect(modelStore.model.groups.size).toBe(0);
    modelStore.restore(snap);
    const g = [...modelStore.model.groups.values()][0]!;
    expect(g.name).toBe('Planta 1');
    expect(g.kind).toBe('floor');
    expect(g.data).toEqual({ elevation: 3.2 });
  });

  it('the restored model does not share arrays with the snapshot it came from', () => {
    // A shallow copy would leave the live model editing the undo entry meant to go back
    // before it — the trap `choices.bolts` documents in the store.
    const { e } = frame();
    modelStore.addGroup('G', 'selection', { elements: [e] });
    const snap = modelStore.snapshot();
    modelStore.restore(JSON.parse(JSON.stringify(snap)));
    const id = [...modelStore.model.groups.keys()][0]!;
    modelStore.setGroupMembers(id, { elements: [] });
    expect(snap.groups![0]![1].members.elements).toEqual([e]);
  });
});

describe('a group never holds a dangling id', () => {
  it('loses a deleted element, and survives becoming empty', () => {
    const { e } = frame();
    const id = modelStore.addGroup('G', 'selection', { elements: [e] });
    modelStore.removeElement(e);
    const g = modelStore.model.groups.get(id);
    // Element numbers are reused: a group still holding the id would quietly come to mean
    // whatever element takes that number next.
    expect(g).toBeDefined();
    expect(g!.members.elements).toEqual([]);
  });

  it('loses a deleted node too', () => {
    const { a } = frame();
    const id = modelStore.addGroup('G', 'selection', { nodes: [a] });
    modelStore.removeNode(a);
    expect(modelStore.model.groups.get(id)!.members.nodes).toEqual([]);
  });
});

describe('the extension point', () => {
  it('accepts a kind the store has never heard of', () => {
    // This is the seam a later kind arrives through. A store that rejected what it did not
    // recognise would have to be edited before the rule that uses it could be written.
    const { e } = frame();
    const id = modelStore.addGroup('C12', 'physicalMember', { elements: [e] }, {
      data: { unbracedFrom: 'restraints' },
    });
    expect(modelStore.model.groups.get(id)!.kind).toBe('physicalMember');
  });

  it('carries an unknown kind through a round trip without reading it', () => {
    // THE test. A file written by a build that knows a kind this one does not must come
    // back whole. Dropping what you do not understand is how a project silently returns
    // smaller than it was saved.
    const { e } = frame();
    modelStore.addGroup('Something later', 'someKindFromTheFuture', { elements: [e] }, {
      data: { rule: 'not invented yet', nested: { deep: [1, 2, 3] } },
    });
    const snap = JSON.parse(JSON.stringify(modelStore.snapshot()));
    frame();
    modelStore.restore(snap);
    const g = [...modelStore.model.groups.values()][0]!;
    expect(g.kind).toBe('someKindFromTheFuture');
    expect(g.data).toEqual({ rule: 'not invented yet', nested: { deep: [1, 2, 3] } });
  });
});

describe('group IDs across restore and clear', () => {
  it.each([undefined, 1, 2, 80, 0, -4, 1.5, NaN, Infinity])('restores or repairs counter %s without overwriting groups', (counter) => {
    frame();
    const snap = JSON.parse(JSON.stringify(modelStore.snapshot())) as ReturnType<typeof modelStore.snapshot>;
    snap.groups = [[7, { id: 7, name: 'Saved', kind: 'selection', origin: 'user', members: {} }]];
    snap.nextId.group = counter;
    modelStore.restore(snap);
    const added = modelStore.addGroup('New', 'selection', {});
    expect(added).toBe(counter === 80 ? 80 : 8);
    expect(modelStore.model.groups.get(7)!.name).toBe('Saved');
    expect(modelStore.model.groups.size).toBe(2);
  });

  it('round-trips its counter and starts a fresh model at one', () => {
    frame();
    const first = modelStore.addGroup('Saved', 'selection', {});
    const snap = JSON.parse(JSON.stringify(modelStore.snapshot()));
    modelStore.clear();
    modelStore.restore(snap);
    expect(modelStore.addGroup('Next', 'selection', {})).toBe(first + 1);
    modelStore.clear();
    expect(modelStore.addGroup('Fresh', 'selection', {})).toBe(1);
  });
});

describe('groups follow cascading deletion and splitting', () => {
  it('removes both a node and its attached member, retaining unrelated members and metadata', () => {
    const { a, b, e } = frame();
    const c = modelStore.addNode(8, 0, 0);
    const other = modelStore.addElement(b, c, 'frame');
    const id = modelStore.addGroup('G', 'custom', { nodes: [a, b], elements: [e, other] }, { data: { keep: true } });
    modelStore.removeNode(a);
    expect(modelStore.model.groups.get(id)).toMatchObject({
      members: { nodes: [b], elements: [other] }, data: { keep: true },
    });
  });

  it('removes deleted triangles and quads from groups', () => {
    const { a, b } = frame();
    const c = modelStore.addNode(4, 3, 0);
    const d = modelStore.addNode(0, 3, 0);
    const mat = [...modelStore.materials.keys()][0]!;
    const plate = modelStore.addPlate([a, b, c], mat, 0.2);
    const quad = modelStore.addQuad([a, b, c, d], mat, 0.2);
    const id = modelStore.addGroup('Floor', 'floor', { plates: [plate], quads: [quad] });
    modelStore.removePlate(plate);
    modelStore.removeQuad(quad);
    expect(modelStore.model.groups.get(id)!.members).toEqual({ plates: [], quads: [] });
  });

  it('replaces a split member with both pieces in every group and survives snapshot restoration', () => {
    const { b, e } = frame();
    const c = modelStore.addNode(8, 0, 0);
    const other = modelStore.addElement(b, c, 'frame');
    const id = modelStore.addGroup('Column', 'physicalMember', { elements: [e, other] }, { data: { keep: [1] } });
    const selection = modelStore.addGroup('Selection', 'selection', { elements: [e] });
    const before = JSON.parse(JSON.stringify(modelStore.snapshot()));
    const split = modelStore.splitElementAtPoint(e, 0.5)!;
    expect(modelStore.elements.has(e)).toBe(false);
    expect(modelStore.model.groups.get(id)).toMatchObject({
      members: { elements: [split.elemA, split.elemB, other] }, data: { keep: [1] },
    });
    expect(modelStore.model.groups.get(selection)!.members.elements).toEqual([split.elemA, split.elemB]);
    const after = JSON.parse(JSON.stringify(modelStore.snapshot()));
    modelStore.restore(before);
    expect(modelStore.model.groups.get(id)!.members.elements).toEqual([e, other]);
    modelStore.restore(after);
    expect(modelStore.model.groups.get(id)!.members.elements).toEqual([split.elemA, split.elemB, other]);
  });
});

it('a subdivided physical member includes every segment, in order', () => {
  const { e } = frame();
  const id = modelStore.addGroup('Column', 'physicalMember', { elements: [e] });
  modelStore.subdivideElement(e, 3);
  const segments = [...modelStore.elements.keys()];
  expect(segments).toHaveLength(3);
  expect(modelStore.model.groups.get(id)!.members.elements).toEqual(segments);
});
