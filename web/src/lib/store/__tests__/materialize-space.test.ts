/**
 * A plane model standing in the space workspace stays standing when it is
 * edited there: the first space edit rewrites it in space coordinates as it
 * is shown, with the same structure, and undo stands the plane model back up.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';

/* At the model's own supports: the embedded solve also restrains every node out of plane. */
const R = (r: unknown) => (r as { reactions: Array<{ nodeId: number; fx: number; fy: number; fz: number; my: number }> }).reactions
  .filter((x) => [...modelStore.supports.values()].some((s) => s.nodeId === x.nodeId))
  .map((x) => [x.nodeId, +x.fx.toFixed(6), +x.fy.toFixed(6), +x.fz.toFixed(6), +x.my.toFixed(6)])
  .sort((a, b) => a[0] - b[0]);

beforeEach(() => { historyStore.clear(); uiStore.analysisMode = '2d'; modelStore.clear(); });

describe('a standing plane model edited in 3D', () => {
  /* Every Basic 2D example but the trusses (see below). */
  it.each(['simply-supported', 'cantilever', 'cantilever-point', 'point-loads', 'gerber-beam', 'continuous-beam',
    'spring-support', 'settlement', 'thermal', 'three-hinge-arch', 'portal-frame', 'two-story-frame',
    'bridge-moving-load', 'frame-cirsoc-dl', 'building-3story-dlw', 'frame-seismic'])('%s: same reactions after the rewrite', async (name) => {
    await modelStore.loadExample(name);
    uiStore.analysisMode = '3d';
    expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
    const before = modelStore.solve3D(false, false, false);
    const heights = [...modelStore.nodes.values()].map((n) => n.y);
    expect(modelStore.ensureSpaceCoordinates()).toBe(true);
    expect(uiStore.viewportPresentation3D).toBe('native3d');
    // Standing as shown: the old heights are now z, and there is no depth.
    const nodes = [...modelStore.nodes.values()];
    expect(nodes.map((n) => n.z ?? 0)).toEqual(heights);
    expect(nodes.every((n) => n.y === 0)).toBe(true);
    const after = modelStore.solve3D(false, false, false);
    if (typeof before === 'string') { expect(typeof after).toBe('string'); return; }
    expect(typeof after).toBe('object');
    expect(R(after)).toEqual(R(before));
  });

  it('adding a node keeps the building standing, and undo brings the plane model back', async () => {
    await modelStore.loadExample('building-3story-dlw');
    uiStore.analysisMode = '3d';
    const snapshot = [...modelStore.nodes.values()].map((n) => ({ ...n }));
    historyStore.pushState();
    const id = modelStore.addNode(2, 3, 0);
    const top = Math.max(...snapshot.map((n) => n.y));
    expect(Math.max(...[...modelStore.nodes.values()].map((n) => n.z ?? 0))).toBe(top);
    expect(modelStore.nodes.get(id)).toMatchObject({ x: 2, y: 3 });
    historyStore.undo();
    expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
    expect([...modelStore.nodes.values()].map((n) => ({ ...n }))).toEqual(snapshot);
  });

  it('a plane truss becomes what it is in space: free out of its plane', async () => {
    // The embedded solve restrained every node out of plane; a space model has
    // only its supports, and a plane truss has no out-of-plane stiffness.
    await modelStore.loadExample('truss');
    uiStore.analysisMode = '3d';
    modelStore.ensureSpaceCoordinates();
    expect(modelStore.solve3D(false, false, false)).toMatch(/mecanismo|mechanism/i);
  });

  it('in 2D nothing is rewritten', async () => {
    await modelStore.loadExample('portal-frame');
    expect(modelStore.ensureSpaceCoordinates()).toBe(false);
    expect([...modelStore.nodes.values()].some((n) => n.y > 0)).toBe(true);
  });
});

describe('edits whose arguments were read before the rewrite', () => {
  const standing = async () => {
    await modelStore.loadExample('portal-frame');
    uiStore.analysisMode = '3d';
    expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
    return [...modelStore.nodes.values()].map((n) => ({ ...n }));
  };

  it('a node table edit of X keeps the node where it stood', async () => {
    const before = await standing();
    const top = before.find((n) => n.y > 0)!;
    // What NodesTable.updateNodeX passes: the new x, and the y it read.
    historyStore.pushState();
    modelStore.updateNode(top.id, top.x + 1, modelStore.getNode(top.id)!.y);
    expect(modelStore.nodes.get(top.id)).toMatchObject({ x: top.x + 1, y: 0, z: top.y });
    for (const n of before.filter((n) => n.id !== top.id)) {
      expect(modelStore.nodes.get(n.id)).toMatchObject({ x: n.x, y: 0, z: n.y });
    }
  });

  it('an edit of Z does not lay the frame down', async () => {
    const before = await standing();
    const top = before.find((n) => n.y > 0)!;
    historyStore.pushState();
    modelStore.updateNodeZ(top.id, 0.5);
    // Every other node still stands at its height; none of them read y as depth.
    for (const n of before.filter((n) => n.id !== top.id)) {
      expect(modelStore.nodes.get(n.id)).toMatchObject({ x: n.x, y: 0, z: n.y });
    }
    expect(uiStore.viewportPresentation3D).toBe('native3d');
  });

  it.each([
    ['nodal', () => modelStore.addNodalLoad3D([...modelStore.nodes.keys()][1], 1, 0, 0, 0, 0, 0)],
    ['distributed', () => modelStore.addDistributedLoad3D([...modelStore.elements.keys()][0], 0, 0, -1, -1)],
    ['point on member', () => modelStore.addPointLoadOnElement3D([...modelStore.elements.keys()][0], 1, 0, -1)],
  ])('undo of a %s space load stands the plane model back up', async (_label, add) => {
    const before = await standing();
    const loads = JSON.stringify(modelStore.model.loads);
    add();
    historyStore.undo();
    expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
    expect([...modelStore.nodes.values()].map((n) => ({ ...n }))).toEqual(before);
    expect(JSON.stringify(modelStore.model.loads)).toBe(loads);
  });
});

describe('a member temperature through the rewrite', () => {
  it('stays the load it was: its gradient and its strain, under its own id', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed');
    const id = modelStore.addLoadEntry({ type: 'thermal', data: { id: 0, elementId: e, dtUniform: 5, dtGradient: 20, strain: 1e-3 } });
    uiStore.analysisMode = '3d';
    const before = modelStore.solve3D(false, false, false) as unknown as { displacements: Array<{ nodeId: number; ux: number; uz: number }> };
    expect(modelStore.ensureSpaceCoordinates()).toBe(true);
    const thermal = modelStore.model.loads.filter((l) => l.type === 'thermal');
    expect(thermal).toHaveLength(1);
    expect(thermal[0]!.data).toMatchObject({ id, elementId: e, dtUniform: 5, dtGradient: 20, strain: 1e-3 });
    // And the structure does what it did: the tip lengthens and bends the same.
    const after = modelStore.solve3D(false, false, false) as unknown as typeof before;
    const tip = (r: typeof before) => r.displacements.find((d) => d.nodeId === b)!;
    expect(tip(after).ux).toBeCloseTo(tip(before).ux, 9);
    expect(tip(after).uz).toBeCloseTo(tip(before).uz, 9);
  });
});
