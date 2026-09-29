/**
 * What an edit left touching without a connection, the connection, and the
 * prompt's undo rule: accepted right away it joins the edit's undo step.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import { connectionPrompt } from '../../../store/connection-prompt.svelte';
import {
  membersCrossing, nodesOnMember, nodeCoincidentWith, membersThroughNode,
  connectMember, connectNodeToMembers, joinNodes,
} from '../connection-check';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); connectionPrompt.decline(); });

/** A beam 0→4 along x and a post crossing it at x = 2, unconnected. */
function crossed() {
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0);
  const c = modelStore.addNode(2, -2), d = modelStore.addNode(2, 2);
  const beam = modelStore.addElement(a, b), post = modelStore.addElement(c, d);
  return { a, b, c, d, beam, post };
}

describe('finding what touches without a connection', () => {
  it('a member crossing another', () => {
    const { beam, post } = crossed();
    expect(membersCrossing(post)).toEqual([beam]);
    expect(membersCrossing(beam)).toEqual([post]);
  });

  it('a node on a member, and the member under a node', () => {
    const { beam } = crossed();
    const n = modelStore.addNode(1, 0);
    expect(nodesOnMember(beam)).toEqual([n]);
    expect(membersThroughNode(n)).toEqual([beam]);
  });

  it('a node on top of another', () => {
    const { b } = crossed();
    const n = modelStore.addNode(4, 0);
    expect(nodeCoincidentWith(n)).toBe(b);
  });

  it('members meeting at a shared node are not a crossing', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0), c = modelStore.addNode(4, 3);
    const m1 = modelStore.addElement(a, b);
    modelStore.addElement(b, c);
    expect(membersCrossing(m1)).toEqual([]);
  });
});

describe('connecting', () => {
  it('cuts both members at the crossing, around one new node', () => {
    const { post } = crossed();
    connectMember(post);
    expect(modelStore.elements.size).toBe(4);
    expect(modelStore.nodes.size).toBe(5);
    const mid = [...modelStore.nodes.values()].find((n) => Math.abs(n.x - 2) < 1e-9 && Math.abs(n.y) < 1e-9)!;
    const at = [...modelStore.elements.values()].filter((e) => e.nodeI === mid.id || e.nodeJ === mid.id);
    expect(at).toHaveLength(4);
  });

  it('cuts a member at the crossing and at the nodes on it', () => {
    const { beam } = crossed();
    modelStore.addNode(1, 0);
    connectMember(beam);
    // The beam in three (at the node, at the crossing), the post in two.
    expect(modelStore.elements.size).toBe(5);
    expect(nodesOnMember([...modelStore.elements.keys()][0]!)).toEqual([]);
  });

  it('cuts the members under a node', () => {
    const { beam } = crossed();
    const n = modelStore.addNode(3, 0);
    connectNodeToMembers(n);
    expect(modelStore.elements.has(beam)).toBe(false);
    expect([...modelStore.elements.values()].filter((e) => e.nodeI === n || e.nodeJ === n)).toHaveLength(2);
  });

  it('joins a node into another, dropping a member left with both ends there', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0), c = modelStore.addNode(4, 0);
    modelStore.addElement(a, b);
    modelStore.addElement(b, c); // zero length once c joins b
    const m3 = modelStore.addElement(a, c); // a duplicate of a–b once c joins b
    joinNodes(c, b);
    expect(modelStore.nodes.has(c)).toBe(false);
    expect(modelStore.elements.size).toBe(1);
    expect(modelStore.elements.has(m3)).toBe(false);
  });
});

describe('the prompt and undo', () => {
  it('accepted right away, the connection is part of the edit\'s undo step', () => {
    const { post } = crossed();
    const before = historyStore.undoCount;
    connectionPrompt.ask({ message: '', accept: '', decline: '', run: () => connectMember(post) });
    connectionPrompt.accept();
    expect(historyStore.undoCount).toBe(before);
    expect(modelStore.elements.size).toBe(4);
  });

  it('accepted after another edit, it is a step of its own', () => {
    const { post } = crossed();
    connectionPrompt.ask({ message: '', accept: '', decline: '', run: () => connectMember(post) });
    modelStore.addNode(9, 9);
    const before = historyStore.undoCount;
    connectionPrompt.accept();
    expect(historyStore.undoCount).toBe(before + 1);
  });

  it('does nothing once what it asked about is gone', () => {
    const { post } = crossed();
    connectionPrompt.ask({ message: '', accept: '', decline: '', run: () => connectMember(post), stillApplies: () => modelStore.elements.has(post) });
    modelStore.removeElement(post);
    const size = modelStore.elements.size;
    connectionPrompt.accept();
    expect(modelStore.elements.size).toBe(size);
  });
});
