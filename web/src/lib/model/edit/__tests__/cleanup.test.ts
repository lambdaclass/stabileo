/**
 * The integrity clean-up: each finding cleared in one step, nothing it refers to left dangling.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import { checkCurrentModel } from '../../../engine/solve-diagnostics';
import {
  planCoincidentNodeMerge, coincidentNodeGroups, mergeCoincidentNodes, removeDuplicateMembers, removeZeroLengthMembers,
  removeOrphanNodes, cleanUpModel,
} from '../cleanup';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

const codes = () => new Set(checkCurrentModel().map((d) => d.code));

describe('merging coincident nodes', () => {
  it('two members drawn to twin nodes become connected, loads and groups follow', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0), b2 = modelStore.addNode(3, 0, 0.00005), c = modelStore.addNode(6, 0, 0);
    const e1 = modelStore.addElement(a, b, 'frame'), e2 = modelStore.addElement(b2, c, 'frame');
    modelStore.addNodalLoad3D(b2, 0, 0, -5, 0, 0, 0, 1);
    const g = modelStore.addGroup('joint', 'selection', { nodes: [b2] });
    expect(coincidentNodeGroups()).toEqual([[b, b2]]);
    historyStore.clear();
    const r = mergeCoincidentNodes();
    expect(r.mergedNodes).toBe(1);
    expect(modelStore.nodes.has(b2)).toBe(false);
    expect(modelStore.elements.get(e2)!.nodeI).toBe(b);
    expect(modelStore.elements.get(e1)!.nodeJ).toBe(b);
    expect((modelStore.loads[0]!.data as { nodeId: number }).nodeId).toBe(b);
    expect(modelStore.model.groups.get(g)!.members.nodes).toEqual([b]);
    expect(historyStore.undoCount).toBe(1);
  });

  it('refuses conflicting supports without changing the model', () => {
    const a = modelStore.addNode(0, 0, 0), a2 = modelStore.addNode(0, 0, 0);
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addSupport(a2, 'pinned3d');
    const before = modelStore.snapshot();
    historyStore.clear();
    expect(planCoincidentNodeMerge().conflicts).toEqual([{ reason: 'supports', nodes: [a, a2] }]);
    const r = mergeCoincidentNodes();
    expect(r).toMatchObject({ blockedMerges: 1, mergedNodes: 0, droppedSupports: 0 });
    expect(modelStore.snapshot()).toEqual(before);
    expect(cleanUpModel().blockedMerges).toBe(1);
    expect(modelStore.snapshot()).toEqual(before);
    expect(historyStore.undoCount).toBe(0);
  });

  it('renames the nodes a constraint names', () => {
    const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(4, 0, 3), b2 = modelStore.addNode(4, 0, 3);
    modelStore.addConstraint({ type: 'rigidLink', masterNode: a, slaveNode: b2 } as never);
    mergeCoincidentNodes();
    expect(modelStore.model.constraints[0]).toMatchObject({ masterNode: a, slaveNode: b });
  });
});

describe('the other findings', () => {
  it('duplicate members: the lowest id stays, the loads that went with the others are counted', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0);
    const e1 = modelStore.addElement(a, b, 'frame'), e2 = modelStore.addElement(b, a, 'frame');
    modelStore.addDistributedLoad3D(e2, 0, 0, -2, -2, undefined, undefined, 1);
    const r = removeDuplicateMembers();
    expect(r.removedDuplicates).toBe(1);
    expect(r.removedLoadsOnDuplicates).toBe(1);
    expect([...modelStore.elements.keys()]).toEqual([e1]);
  });

  it('zero-length members and orphan nodes go; a node a support or a load names is not an orphan', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 0.00001);
    const loose = modelStore.addNode(9, 9, 9), supported = modelStore.addNode(5, 5, 0), loaded = modelStore.addNode(6, 6, 0);
    modelStore.addSupport(supported, 'fixed3d');
    modelStore.addNodalLoad3D(loaded, 1, 0, 0, 0, 0, 0, 1);
    modelStore.addElement(a, b, 'frame');
    expect(removeZeroLengthMembers().removedZeroLength).toBe(1);
    const r = removeOrphanNodes();
    expect(r.removedOrphans).toBe(3); // a, b and the loose one
    expect(modelStore.nodes.has(loose)).toBe(false);
    expect(modelStore.nodes.has(supported)).toBe(true);
    expect(modelStore.nodes.has(loaded)).toBe(true);
  });
});

describe('clean up all', () => {
  it('clears every finding it covers, in one undo step', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0), b2 = modelStore.addNode(4, 0, 0), c = modelStore.addNode(8, 0, 0);
    modelStore.addElement(a, b, 'frame');
    modelStore.addElement(a, b2, 'frame');          // a duplicate once b2 becomes b
    modelStore.addElement(b2, c, 'frame');
    modelStore.addNode(20, 0, 0);                    // an orphan
    modelStore.addSupport(a, 'fixed3d');
    historyStore.clear();
    expect(codes().has('MODEL_COINCIDENT_NODES')).toBe(true);
    const r = cleanUpModel();
    expect(r).toMatchObject({ mergedNodes: 1, removedDuplicates: 1, removedOrphans: 1 });
    const left = codes();
    for (const k of ['MODEL_COINCIDENT_NODES', 'MODEL_DUPLICATE_ELEMENT', 'MODEL_DISCONNECTED_NODE', 'MODEL_ZERO_LENGTH']) expect(left.has(k), k).toBe(false);
    expect(historyStore.undoCount).toBe(1);
  });
});

describe('moving onto the structure welds', () => {
  it('a moved node that lands on a node that stayed becomes it, in one undo step', async () => {
    const { transformInPlace } = await import('../transform-in-place');
    const { translation } = await import('../affine');
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0);
    modelStore.addElement(a, b, 'frame');
    // A loose bar beside it, moved so its end lands on b.
    const c = modelStore.addNode(0, 2, 0), d = modelStore.addNode(0, 5, 0);
    const loose = modelStore.addElement(c, d, 'frame');
    const r = transformInPlace({ nodes: [c, d], elements: [loose] }, translation([3, -2, 0]));
    expect(r.welded).toBe(1);
    expect(modelStore.nodes.has(c)).toBe(false);
    expect(modelStore.elements.get(loose)!.nodeI).toBe(b);
    historyStore.undo();
    expect(modelStore.nodes.has(c)).toBe(true);
    expect(modelStore.nodes.get(c)!.y).toBe(2);
  });
});

describe('merge preflight', () => {
  it.each(['member', 'connector', 'constraint', 'shell'] as const)('does not collapse a %s', kind => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 0.00001);
    if (kind === 'member') modelStore.addElement(a, b);
    if (kind === 'connector') modelStore.addConnector({ nodeI: a, nodeJ: b, kAxial: 100, kShear: 100, kMoment: 100 });
    if (kind === 'constraint') modelStore.addConstraint({ type: 'rigidLink', masterNode: a, slaveNode: b } as never);
    if (kind === 'shell') modelStore.addPlate([a, b, modelStore.addNode(1, 0, 0)], 1, 0.1);
    const before = modelStore.snapshot();
    expect(planCoincidentNodeMerge().conflicts.some(c => c.reason === 'connection')).toBe(true);
    expect(mergeCoincidentNodes().blockedMerges).toBeGreaterThan(0);
    expect(modelStore.snapshot()).toEqual(before);
  });

  it('does not snap a transitive cluster farther than the tolerance', () => {
    for (const x of [0, 0.00008, 0.00016]) modelStore.addNode(x, 0, 0);
    const before = modelStore.snapshot();
    expect(planCoincidentNodeMerge().conflicts[0]?.reason).toBe('tolerance');
    expect(mergeCoincidentNodes().blockedMerges).toBe(1);
    expect(modelStore.snapshot()).toEqual(before);
  });

  it.each([NaN, Infinity, 0, -1, 1])('refuses invalid tolerance %s', tolerance => {
    modelStore.addNode(0, 0, 0);
    expect(mergeCoincidentNodes(tolerance).blockedMerges).toBe(1);
  });

  it('revalidates the model after a safe preview and preserves identical springs', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 0);
    expect(planCoincidentNodeMerge().conflicts).toEqual([]);
    const s = modelStore.addSupport(a, 'spring');
    const t = modelStore.addSupport(b, 'spring');
    modelStore.updateSupport(s, { kx: 100 }); modelStore.updateSupport(t, { kx: 100 });
    const before = modelStore.snapshot();
    expect(mergeCoincidentNodes().blockedMerges).toBe(1);
    expect(modelStore.snapshot()).toEqual(before);
  });
});

it('preserves unrelated supports during a safe merge', () => {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 0);
  const remote = modelStore.addNode(5, 0, 0);
  modelStore.addSupport(remote, 'fixed3d');
  modelStore.addSupport(remote, 'pinned3d');
  const supports = modelStore.snapshot().supports;
  expect(mergeCoincidentNodes()).toMatchObject({ mergedNodes: 1, blockedMerges: 0, droppedSupports: 0 });
  expect(modelStore.nodes.has(a)).toBe(true);
  expect(modelStore.nodes.has(b)).toBe(false);
  expect(modelStore.snapshot().supports).toEqual(supports);
});

it('does not collapse an unmeshed physical plate outline', async () => {
  const { createPlate } = await import('../../../store/physical-plates');
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0.00005, 0);
  const c = modelStore.addNode(4, 4, 0), d = modelStore.addNode(4, 0, 0);
  expect(createPlate({ outline: [a, b, c, d], materialId: 1, thickness: 0.15 })).toHaveProperty('id');
  const before = modelStore.snapshot();
  expect(mergeCoincidentNodes().blockedMerges).toBeGreaterThan(0);
  expect(modelStore.snapshot()).toEqual(before);
});
