/**
 * A plate meshed beside another plate's shells meets them node to node, or the neighbour waits for
 * a new mesh: no node of either is left strictly inside an edge of the other.
 */
import { describe, it, expect } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';
import { applyPlateMeshes, createPlate, physicalPlates, planPlateMesh, plateStatus, preparePlatesForAnalysis } from '../physical-plates';
import { platesFromShells } from '../plates-from-shells';
import { meshBeforeAnalysis } from '../mesh-policy.svelte';

function besideShells(xs: number[]): { below: number; above: number } {
  modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
  const at = (x: number, y: number) => [...modelStore.nodes.values()].find((n) => n.x === x && n.y === y)?.id ?? modelStore.addNode(x, y, 0);
  const keys: string[] = [];
  for (let i = 0; i + 1 < xs.length; i++) keys.push(`q${modelStore.addQuad([at(xs[i]!, -3), at(xs[i + 1]!, -3), at(xs[i + 1]!, 0), at(xs[i]!, 0)], 1, 0.15)}`);
  for (const x of [0, 4]) modelStore.addSupport(at(x, -3), 'pinned3d');
  const [below] = platesFromShells(keys);
  const outline = [at(0, 0), at(4, 0), at(4, 3), at(0, 3)];
  for (const n of outline.slice(2)) modelStore.addSupport(n, 'pinned3d');
  const above = (createPlate({ outline, materialId: 1, thickness: 0.15 }) as { id: number }).id;
  return { below: below!, above };
}

const shared = () => [...new Set([...modelStore.quads.values()].flatMap((q) => q.nodes))]
  .map((n) => modelStore.nodes.get(n)!).filter((n) => Math.abs(n.y) < 1e-9).map((n) => n.x).sort((a, b) => a - b);
const edgesOn = (keys: number[]) => keys.map((q) => modelStore.quads.get(q)!.nodes.map((n) => modelStore.nodes.get(n)!))
  .flatMap((ns) => ns.map((a, i) => [a, ns[(i + 1) % ns.length]!] as const)).filter(([a, b]) => Math.abs(a.y) < 1e-9 && Math.abs(b.y) < 1e-9);
const hanging = (below: number) => {
  const xs = shared();
  const g = physicalPlates().find((p) => p.id === below)!.group;
  return edgesOn(g.members.quads ?? []).some(([a, b]) => xs.some((x) => x > Math.min(a.x, b.x) + 1e-6 && x < Math.max(a.x, b.x) - 1e-6));
};

describe('a plate meshed on a grid beside another plate\'s shells', () => {
  it('meets the neighbour\'s nodes between a corner and its first node too, and leaves it current', () => {
    const { below, above } = besideShells([0, 2, 4]);
    expect(plateStatus(below)).toBe('current');
    const plan = planPlateMesh(above, { size: 0.5, element: 'quad', pattern: 'square' })!;
    expect(plan.mesh).not.toBeNull();
    applyPlateMeshes([plan]);
    expect(shared()).toEqual([0, 2, 4]);
    expect(hanging(below)).toBe(false);
    expect(plateStatus(below)).toBe('current');
  });
});

describe('a plate meshed beside one shell', () => {
  it('leaves that shell\'s plate waiting for a mesh, which the analysis gives it to meet the new nodes', () => {
    const { below, above } = besideShells([0, 4]);
    applyPlateMeshes([planPlateMesh(above, { size: 0.5, element: 'quad' })!]);
    expect(hanging(below)).toBe(true);
    expect(plateStatus(below)).toBe('stale');
    meshBeforeAnalysis.value = true;
    expect(preparePlatesForAnalysis()).toMatchObject({ ok: true });
    expect(hanging(below)).toBe(false);
    expect(plateStatus(below)).toBe('current');
    expect(plateStatus(above)).toBe('current');
  });
});
