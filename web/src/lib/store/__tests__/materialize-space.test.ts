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
