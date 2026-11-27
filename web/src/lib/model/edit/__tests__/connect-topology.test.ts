import { beforeEach, describe, expect, it } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import { connectTopology, topologyPreview } from '../connect-topology';
import { coincidentNodeGroups } from '../cleanup';

beforeEach(() => { modelStore.clear(); historyStore.clear(); });

describe('connecting a model', () => {
  it('merges coincident nodes and connects crossings in one undo step', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
    const c = modelStore.addNode(4, 0, 4), d = modelStore.addNode(0, 0, 4);
    const bottom = modelStore.addNode(2, 0, 0), top = modelStore.addNode(2, 0, 4);
    modelStore.addElement(a, c, 'frame');
    modelStore.addElement(b, d, 'frame');
    modelStore.addElement(bottom, top, 'frame');
    const duplicate = modelStore.addNode(4.00005, 0, 0);
    modelStore.addSupport(b, 'fixed3d');
    modelStore.addSupport(duplicate, 'pinned3d');
    modelStore.addNodalLoad3D(duplicate, 0, 0, -5, 0, 0, 0, 1);
    const group = modelStore.addGroup('joint', 'selection', { nodes: [duplicate] });

    const before = { nodes: modelStore.nodes.size, elements: modelStore.elements.size, history: historyStore.undoCount };
    const preview = topologyPreview();
    expect(preview.coincidentNodes).toBe(1);
    expect(preview.crossings).toBe(3);
    expect(preview.atNodes).toBe(0);
    expect(modelStore.nodes.size).toBe(before.nodes);
    expect(modelStore.elements.size).toBe(before.elements);
    expect(historyStore.undoCount).toBe(before.history);

    const report = connectTopology();
    expect(report.mergedNodes).toBe(1);
    expect(report.droppedSupports).toBe(1);
    expect(report.intersections.cut).toHaveLength(3);
    expect(report.atNodes.cut).toHaveLength(0);
    expect(report.finalMerge.mergedNodes).toBe(0);
    expect(report.removedZeroLength).toBe(0);
    expect(report.removedDuplicates).toBe(0);
    expect(report.removedOrphans).toBe(0);
    expect(modelStore.nodes.has(duplicate)).toBe(false);
    expect(coincidentNodeGroups()).toEqual([]);
    const centre = [...modelStore.nodes.values()].filter((n) => Math.hypot(n.x - 2, n.y, (n.z ?? 0) - 2) < 1e-6);
    expect(centre).toHaveLength(1);
    for (const element of modelStore.elements.values()) {
      if (element.nodeI === centre[0]!.id || element.nodeJ === centre[0]!.id) continue;
      for (const end of [element.nodeI, element.nodeJ]) {
        const n = modelStore.nodes.get(end)!;
        expect(Math.hypot(n.x - 2, n.y, (n.z ?? 0) - 2) > 1e-6).toBe(true);
      }
    }
    expect([...modelStore.supports.values()].map((s) => [s.nodeId, s.type])).toEqual([[b, 'fixed3d']]);
    expect((modelStore.loads[0]!.data as { nodeId: number }).nodeId).toBe(b);
    expect(modelStore.model.groups.get(group)!.members.nodes).toEqual([b]);
    expect(historyStore.undoCount).toBe(before.history + 1);

    historyStore.undo();
    expect(modelStore.nodes.has(duplicate)).toBe(true);
    expect(modelStore.nodes.size).toBe(before.nodes);
    expect(modelStore.elements.size).toBe(before.elements);
  });

  it('cuts a member at an existing interior node', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0), mid = modelStore.addNode(3, 0, 0);
    modelStore.addElement(a, b, 'frame');
    const report = connectTopology();
    expect(report.intersections.cut).toHaveLength(0);
    expect(report.atNodes.cut).toHaveLength(1);
    expect(modelStore.elements.size).toBe(2);
    for (const element of modelStore.elements.values()) {
      expect([element.nodeI, element.nodeJ]).toContain(mid);
    }
  });

  it('uses the requested tolerance in preview and in the actual cut', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0), near = modelStore.addNode(3, 0.0005, 0);
    modelStore.addElement(a, b, 'frame');
    expect(topologyPreview(0.0001).atNodes).toBe(0);
    expect(topologyPreview(0.001).atNodes).toBe(1);
    const report = connectTopology(0.001);
    expect(report.atNodes.cut).toHaveLength(1);
    expect(modelStore.elements.size).toBe(2);
    for (const element of modelStore.elements.values()) expect([element.nodeI, element.nodeJ]).toContain(near);
  });

  it('does not count a crossing that becomes a shared endpoint after merging', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0), c = modelStore.addNode(4, 0, 4);
    const duplicate = modelStore.addNode(4.00005, 0, 4);
    modelStore.addElement(a, c, 'frame');
    modelStore.addElement(b, duplicate, 'frame');
    expect(topologyPreview().crossings).toBe(0);
    const report = connectTopology();
    expect(report.intersections.cut).toHaveLength(0);
    expect(modelStore.elements.size).toBe(2);
  });

  it('removes a member collapsed by the first merge before cutting the others', () => {
    const a = modelStore.addNode(0, 0, 0), duplicate = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
    const c = modelStore.addNode(2, 0, 2), d = modelStore.addNode(2, 0, -2);
    const collapsed = modelStore.addElement(a, duplicate, 'frame');
    modelStore.addElement(b, c, 'frame');
    modelStore.addElement(c, d, 'frame');
    const report = connectTopology();
    expect(report.removedZeroLength).toBe(1);
    expect(modelStore.elements.has(collapsed)).toBe(false);
    expect(modelStore.elements.size).toBe(2);
    expect(report.intersections.cut).toHaveLength(0);
  });

  it('counts a member with several interior nodes once in preview and in the report', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    modelStore.addNode(2, 0, 0);
    modelStore.addNode(4, 0, 0);
    modelStore.addElement(a, b, 'frame');
    expect(topologyPreview().atNodes).toBe(1);
    const report = connectTopology();
    expect(report.atNodes.cut).toHaveLength(1);
    expect(modelStore.elements.size).toBe(3);
  });

  it('drops a constraint that becomes self-referential', () => {
    const a = modelStore.addNode(0, 0, 3), duplicate = modelStore.addNode(0, 0, 3);
    modelStore.addConstraint({ type: 'rigidLink', masterNode: a, slaveNode: duplicate } as never);
    const before = historyStore.undoCount;
    const report = connectTopology();
    expect(report.mergedNodes).toBe(1);
    expect(modelStore.model.constraints).toEqual([]);
    expect(historyStore.undoCount).toBe(before + 1);
  });

  it('refuses a nonpositive tolerance before changing anything', () => {
    modelStore.addNode(0, 0, 0);
    const before = historyStore.undoCount;
    expect(() => topologyPreview(0)).toThrow(RangeError);
    expect(() => connectTopology(Number.NaN)).toThrow(RangeError);
    expect(historyStore.undoCount).toBe(before);
  });
});
