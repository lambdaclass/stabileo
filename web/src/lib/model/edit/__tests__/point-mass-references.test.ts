/**
 * A point mass names its node by id (`MassSource.points`). Every command that renumbers, merges
 * or deletes nodes has to carry it along: left behind it sat on the wrong node, or on a number the
 * next node drawn would take (Codex review of #399).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import { renumber } from '../renumber';
import { mergeCollinear } from '../merge-collinear';
import { mergeNodesInto, removeOrphanNodes } from '../cleanup';

beforeEach(() => { modelStore.clear(); historyStore.clear(); });

const points = () => modelStore.model.massSource?.points ?? [];
const at = (id: number) => { const n = modelStore.nodes.get(id)!; return `${n.x},${n.y},${n.z ?? 0}`; };

describe('a point mass follows its node', () => {
  it('through a renumbering', () => {
    const top = modelStore.addNode(0, 0, 3), base = modelStore.addNode(0, 0, 0), far = modelStore.addNode(5, 0, 0);
    modelStore.addElement(base, top, 'frame');
    modelStore.addElement(far, top, 'frame');
    modelStore.setMassSource({ kind: 'custom', factors: [], points: [{ nodeId: top, m: 7, horizontalOnly: true }] });
    const r = renumber({ nodes: true, members: true, order: 'zyx' });
    if ('refused' in r) throw new Error('refused');
    expect(points()).toHaveLength(1);
    expect(at(points()[0]!.nodeId)).toBe('0,0,3');
    expect(points()[0]).toMatchObject({ m: 7, horizontalOnly: true });
  });

  it('through a merge of nodes, onto the node that stays', () => {
    const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(4, 0, 3);
    modelStore.addElement(a, c, 'frame');
    modelStore.setMassSource({ kind: 'custom', factors: [], points: [{ nodeId: b, m: 2 }, { nodeId: a, m: 3 }] });
    mergeNodesInto(new Map([[b, a]]));
    expect(modelStore.nodes.has(b)).toBe(false);
    // Both masses on the surviving node: they add in the engine.
    expect(points().map((p) => [p.nodeId, p.m])).toEqual([[a, 2], [a, 3]]);
  });

  it('goes with its node when the node is deleted, as a nodal load does', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
    modelStore.addElement(a, b, 'frame');
    modelStore.setMassSource({ kind: 'custom', factors: [], points: [{ nodeId: b, m: 2 }, { nodeId: a, m: 1 }] });
    modelStore.removeNode(b);
    expect(points()).toEqual([{ nodeId: a, m: 1 }]);
    historyStore.undo();
    expect(points()).toEqual([{ nodeId: b, m: 2 }, { nodeId: a, m: 1 }]);
  });

  it('keeps its node from being merged away between two collinear members', () => {
    const a = modelStore.addNode(0, 0, 0), m = modelStore.addNode(3, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e1 = modelStore.addElement(a, m, 'frame'), e2 = modelStore.addElement(m, b, 'frame');
    modelStore.setMassSource({ kind: 'custom', factors: [], points: [{ nodeId: m, m: 4 }] });
    const r = mergeCollinear([e1, e2]);
    expect(r.refused.nodeBusy).toBe(1);
    expect(modelStore.nodes.has(m)).toBe(true);
    expect(points()[0]!.nodeId).toBe(m);
  });

  it('keeps its node from being removed as an orphan', () => {
    const lone = modelStore.addNode(9, 9, 3);
    modelStore.setMassSource({ kind: 'custom', factors: [], points: [{ nodeId: lone, m: 1 }] });
    removeOrphanNodes();
    expect(modelStore.nodes.has(lone)).toBe(true);
  });
});
