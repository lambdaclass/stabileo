import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { platesFromShells, looseShells } from '../plates-from-shells';
import { plateDiagnostics } from '../plate-diagnostics';

const loose = () => plateDiagnostics((k) => k).filter((d) => d.code === 'PLATE_LOOSE_CORNER').map((d) => d.details as { plate: string; nodes: string });
const nodesOf = (ids: number[]) => [...ids].sort((a, b) => a - b).join(', ');

describe('plate nodes connected to nothing', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro'; });

  it('leaves a balcony\'s free tip alone: the slab is held all along the edge it hangs from', () => {
    const n = [[4, 0], [6, 0], [6, 3], [4, 3]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
    const feet = [[4, 0], [4, 3]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    modelStore.addElement(feet[0]!, n[0]!, 'frame');
    modelStore.addElement(feet[1]!, n[3]!, 'frame');
    modelStore.addElement(n[0]!, n[3]!, 'frame');
    for (const f of feet) modelStore.addSupport(f, 'fixed3d');
    modelStore.addQuad(n as [number, number, number, number], 1, 0.15);
    platesFromShells(looseShells());
    expect(loose()).toEqual([]);
  });

  it('names the foot of a wall that rests on nothing, though its top is held', () => {
    const n = [[0, 0], [2, 0], [2, 3], [0, 3]].map(([x, z]) => modelStore.addNode(x!, 0, z!));
    modelStore.addSupport(n[0]!, 'fixed3d');
    modelStore.addElement(n[3]!, n[2]!, 'frame');
    modelStore.addQuad(n as [number, number, number, number], 1, 0.2);
    platesFromShells(looseShells());
    expect(loose()).toEqual([{ plate: expect.any(String), nodes: String(n[1]) }]);
  });

  it('takes a node a constraint ties as connected, and names every node of a plate held at one corner only', () => {
    const n = [[0, 0], [3, 0], [3, 3], [0, 3]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
    modelStore.addSupport(n[0]!, 'fixed3d');
    modelStore.addQuad(n as [number, number, number, number], 1, 0.15);
    platesFromShells(looseShells());
    expect(loose()).toEqual([{ plate: expect.any(String), nodes: nodesOf(n.slice(1)) }]);
    const m = modelStore.addNode(1.5, 1.5, 0);
    modelStore.addSupport(m, 'fixed3d');
    for (const s of n.slice(1)) modelStore.addConstraint({ type: 'rigidLink', masterNode: m, slaveNode: s } as never);
    expect(loose()).toEqual([]);
  });
});
