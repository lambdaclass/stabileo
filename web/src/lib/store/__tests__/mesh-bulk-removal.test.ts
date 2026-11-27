import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';
import { applyPlateMeshes, clearPlateMesh, createPlate, planPlateMesh } from '../physical-plates';

beforeEach(() => { modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro'; });
afterEach(() => vi.restoreAllMocks());

describe('bulk removal', () => {
  it.skip('known wrong result: #2365 a snapshot inside a bulk edit has no loads on a removed node', () => {
    const removed = modelStore.addNode(0, 0, 0);
    const kept = modelStore.addNode(1, 0, 0);
    for (const node of [removed, kept]) modelStore.addNodalLoad3D(node, 0, 0, -1, 0, 0, 0);
    modelStore.bulkMutate(() => {
      modelStore.removeNode(removed);
      expect(modelStore.snapshot().loads.map(load => load.data)).toEqual([expect.objectContaining({ nodeId: kept })]);
    });
  });

  it('keeps shell families and their buffered loads separate even when ids coincide', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(2, 0, 0);
    const c = modelStore.addNode(2, 2, 0), d = modelStore.addNode(0, 2, 0);
    const q = modelStore.addQuad([a, b, c, d], 1, .2);
    const p = modelStore.addPlate([a, b, c], 1, .2);
    expect(p).toBe(q);
    const group = modelStore.addGroup('shells', 'selection', { quads: [q], plates: [p] });
    modelStore.addSurfaceLoad3D(q, 5);
    modelStore.addSurfaceLoad3D(p, 7, 1, { on: 'plate' });
    const before = modelStore.snapshot();
    historyStore.clear();
    const quads = modelStore.quads, plates = modelStore.plates;
    modelStore.bulkMutate(() => {
      modelStore.addThermalLoadQuad3D(q, 10);
      modelStore.addLoadEntry({ type: 'thermalQuad3d', data: { id: 0, quadId: p, on: 'plate', dtUniform: 20, dtGradient: 0 } });
      modelStore.removeQuad(q);
      expect(modelStore.quads).toBe(quads);
      expect(modelStore.loads).toHaveLength(1);
      expect(modelStore.loads[0]!.data).toMatchObject({ quadId: p, on: 'plate' });
      modelStore.bulkMutate(() => modelStore.removePlate(p));
      expect(modelStore.plates).toBe(plates);
    });
    expect(modelStore.quads).not.toBe(quads);
    expect(modelStore.plates).not.toBe(plates);
    expect(modelStore.loads).toEqual([]);
    expect(modelStore.model.groups.get(group)!.members).toEqual({ quads: [], plates: [] });
    const after = modelStore.snapshot();
    expect(historyStore.undoCount).toBe(1);
    historyStore.undo(); expect(modelStore.snapshot()).toEqual(before);
    historyStore.redo(); expect(modelStore.snapshot()).toEqual(after);
  });

  it('commits node deletions on an exception without resurrecting loads or constraints', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(2, 0, 0), c = modelStore.addNode(4, 0, 0);
    const beam = modelStore.addElement(a, b);
    modelStore.addDistributedLoad3D(beam, 0, 0, -3, -3);
    modelStore.addSupport(b, 'pinned3d');
    modelStore.addNodalLoad3D(b, 0, 0, -5, 0, 0, 0);
    modelStore.addConstraint({ type: 'diaphragm', masterNode: a, slaveNodes: [b, c] });
    modelStore.addConnector({ nodeI: a, nodeJ: b, kAxial: 1, kShear: 1, kMoment: 1, kShearZ: 1, kBendY: 1, kBendZ: 1 });
    modelStore.addFooting(b);
    modelStore.setMassSource({ kind: 'custom', factors: [], points: [{ nodeId: b, m: 2 }, { nodeId: c, m: 3 }] });
    const before = modelStore.snapshot();
    historyStore.clear();
    const nodes = modelStore.nodes, supports = modelStore.supports;
    expect(() => modelStore.bulkMutate(() => {
      modelStore.addNodalLoad3D(b, 0, 0, -6, 0, 0, 0);
      modelStore.addConstraint({ type: 'equalDOF', masterNode: a, slaveNode: b, dofs: [0] });
      modelStore.removeNode(b);
      expect(modelStore.nodes).toBe(nodes);
      expect(modelStore.supports).toBe(supports);
      throw new Error('stop');
    })).toThrow('stop');
    expect(modelStore.nodes).not.toBe(nodes);
    expect(modelStore.supports).not.toBe(supports);
    expect([...modelStore.nodes.keys()]).toEqual([a, c]);
    expect(modelStore.elements.size).toBe(0);
    expect(modelStore.supports.size).toBe(0);
    expect(modelStore.loads).toEqual([]);
    expect(modelStore.model.constraints).toEqual([{ type: 'diaphragm', masterNode: a, slaveNodes: [c] }]);
    expect(modelStore.model.connectors.size).toBe(0);
    expect(modelStore.model.footings.size).toBe(0);
    expect(modelStore.model.massSource!.points).toEqual([{ nodeId: c, m: 3 }]);
    const after = modelStore.snapshot();
    expect(historyStore.undoCount).toBe(1);
    historyStore.undo(); expect(modelStore.snapshot()).toEqual(before);
    historyStore.redo(); expect(modelStore.snapshot()).toEqual(after);
    modelStore.addNode(8, 0, 0);
    expect(historyStore.undoCount).toBe(2);
  });

  it.each(['quad', 'tri'] as const)('clears a %s mesh with one collection per deletion phase and one undo step', (element) => {
    const outline = [[0, 0], [6, 0], [6, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    const made = createPlate({ outline, materialId: 1, thickness: .15, mesh: { size: .5, element, followMembers: false } });
    if (!('id' in made)) throw new Error(JSON.stringify(made));
    expect(applyPlateMeshes([planPlateMesh(made.id)!]).refused).toEqual([]);
    const before = modelStore.snapshot(), count = modelStore.nodes.size;
    historyStore.clear();
    const nodeMaps = new Set(), shellMaps = new Set();
    const removeNode = modelStore.removeNode.bind(modelStore);
    const removeShell = element === 'quad' ? modelStore.removeQuad.bind(modelStore) : modelStore.removePlate.bind(modelStore);
    vi.spyOn(modelStore, 'removeNode').mockImplementation((id) => { nodeMaps.add(modelStore.nodes); removeNode(id); });
    vi.spyOn(modelStore, element === 'quad' ? 'removeQuad' : 'removePlate').mockImplementation((id) => {
      shellMaps.add(element === 'quad' ? modelStore.quads : modelStore.plates); removeShell(id);
    });
    expect(clearPlateMesh(made.id)).toEqual({ removedNodes: count - outline.length, keptNodes: 0 });
    expect(nodeMaps.size).toBe(1);
    expect(shellMaps.size).toBe(1);
    expect([...modelStore.nodes.keys()]).toEqual(outline);
    expect(modelStore.quads.size + modelStore.plates.size).toBe(0);
    const after = modelStore.snapshot();
    expect(historyStore.undoCount).toBe(1);
    historyStore.undo(); expect(modelStore.snapshot()).toEqual(before);
    historyStore.redo(); expect(modelStore.snapshot()).toEqual(after);
  });
});
