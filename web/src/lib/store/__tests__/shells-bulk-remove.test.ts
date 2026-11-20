/**
 * Removing a mesh of thousands of shells and nodes in one bulk mutation: each removal used to copy
 * the model's maps, filter every load and walk every group, so clearing a seven-storey building's
 * 8000 shells froze the browser for minutes before an analysis. Inside `bulkMutate` the loads and
 * group memberships of what is removed go once, at the end, and the result is the one the
 * per-removal path gave: their loads and memberships gone, everything else kept, one undo step.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '../history.svelte';
import '../index';

beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); historyStore.clear(); });

function strip(n: number) {
  const nodes: number[] = [], quads: number[] = [];
  modelStore.bulkMutate(() => {
    for (let i = 0; i <= n; i++) nodes.push(modelStore.addNode(i, 0, 0), modelStore.addNode(i, 1, 0));
    for (let i = 0; i < n; i++) quads.push(modelStore.addQuad([nodes[2 * i]!, nodes[2 * i + 2]!, nodes[2 * i + 3]!, nodes[2 * i + 1]!], 1, 0.2));
  });
  return { nodes, quads };
}

describe('a mesh removed in one bulk mutation', () => {
  it('drops the loads and group memberships of what it removes, once, keeps the rest, and undoes in one step', () => {
    const { nodes, quads } = strip(4000);
    const keptNode = modelStore.addNode(0, 5, 0);
    const keptQuad = quads.pop()!;
    const lastNodes = nodes.splice(-4);
    modelStore.addSurfaceLoad3D(quads[0]!, -5);
    modelStore.addSurfaceLoad3D(keptQuad, -7);
    modelStore.addNodalLoad3D(nodes[3]!, 0, 0, -10, 0, 0, 0);
    modelStore.addNodalLoad3D(keptNode, 0, 0, -20, 0, 0, 0);
    const g = modelStore.addGroup('mesh', 'user' as never, { quads: [...quads, keptQuad], nodes: [...nodes, keptNode] });
    const loadsBefore = modelStore.loads.length;
    const t0 = performance.now();
    modelStore.bulkMutate(() => {
      for (const q of quads) modelStore.removeQuad(q);
      for (const n of nodes) modelStore.removeNode(n);
    });
    // The per-removal path took over a minute on 8000 shells in the browser.
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(modelStore.quads.size).toBe(1);
    expect(modelStore.nodes.has(keptNode) && lastNodes.every((n) => modelStore.nodes.has(n))).toBe(true);
    expect(modelStore.loads.map((l) => (l.data as { q?: number; fz?: number }).q ?? (l.data as { fz?: number }).fz)).toEqual([-7, -20]);
    expect(modelStore.model.groups.get(g)!.members).toMatchObject({ quads: [keptQuad], nodes: [keptNode] });
    historyStore.undo();
    expect(modelStore.quads.size).toBe(quads.length + 1);
    expect(modelStore.loads.length).toBe(loadsBefore);
  });
});
