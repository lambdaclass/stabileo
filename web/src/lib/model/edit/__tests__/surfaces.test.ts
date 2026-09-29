/**
 * Surfaces: areas against their closed forms, radii where they should be, and a cylindrical
 * shell that solves.
 */
import { describe, it, expect } from 'vitest';
import { SURFACE_DEFAULTS, surfaceArea, surfaceMesh } from '../surfaces';

const mesh = (k: keyof typeof SURFACE_DEFAULTS, over: Record<string, number> = {}) => surfaceMesh(k, { ...SURFACE_DEFAULTS[k], ...over })!;

describe('surfaces', () => {
  it('a full cylinder: n·along quads, area of the inscribed prism', () => {
    const m = mesh('cylinder', { radius: 2, height: 3, around: 24, along: 4 });
    expect(m.cells).toHaveLength(96);
    expect(m.points).toHaveLength(24 * 5);
    expect(surfaceArea(m)).toBeCloseTo(24 * 2 * 2 * Math.sin(Math.PI / 24) * 3, 9);
  });

  it('a half cylinder is open', () => {
    const m = mesh('cylinder', { angle: 180, around: 12, along: 2 });
    expect(m.points).toHaveLength(13 * 3);
  });

  it('a cone runs from its base to its top radius', () => {
    const m = mesh('cone', { radius: 3, topRadius: 1, height: 4 });
    const rs = m.points.map((p) => [Math.hypot(p[0], p[1]), p[2]]);
    for (const [r, z] of rs) expect(r).toBeCloseTo(3 - (2 * z!) / 4, 9);
  });

  it('a spherical cap lies on its sphere and reaches its rise', () => {
    const a = 6, h = 2, R = (a * a + h * h) / (2 * h);
    const m = mesh('sphericalCap', { baseRadius: a, rise: h, size: 0.5 });
    for (const p of m.points) expect(Math.hypot(p[0], p[1], p[2] + R - h)).toBeCloseTo(R, 9);
    expect(Math.max(...m.points.map((p) => p[2]))).toBeCloseTo(h, 6);
    // Close to the cap's area 2πRh.
    expect(surfaceArea(m) / (2 * Math.PI * R * h)).toBeGreaterThan(0.99);
  });

  it('a hyperboloid has its waist where it was asked', () => {
    const m = mesh('hyperboloid', { waist: 4, bottomRadius: 6, topRadius: 5, height: 20, waistAt: 14, along: 20 });
    const at = (z: number) => m.points.filter((p) => Math.abs(p[2] - z) < 1e-9).map((p) => Math.hypot(p[0], p[1]));
    expect(at(14)[0]).toBeCloseTo(4, 9);
    expect(at(0)[0]).toBeCloseTo(6, 9);
    expect(at(20)[0]).toBeCloseTo(5, 9);
  });

  it('a hyperbolic paraboloid has straight lines both ways', () => {
    const m = mesh('hypar', { lx: 8, ly: 8, rise: 1.5, nx: 4, ny: 4 });
    // Along x at fixed y, z is linear in x.
    const row = m.points.filter((p) => Math.abs(p[1] + 4) < 1e-9).sort((a, b) => a[0] - b[0]);
    const slopes = row.slice(1).map((p, i) => (p[2] - row[i]![2]) / (p[0] - row[i]![0]));
    for (const s of slopes) expect(s).toBeCloseTo(slopes[0]!, 9);
    expect(Math.max(...m.points.map((p) => p[2]))).toBeCloseTo(1.5, 9);
  });

  it('refuses what cannot be built', () => {
    expect(surfaceMesh('cone', { ...SURFACE_DEFAULTS.cone, topRadius: 0 })).toBeNull();
    expect(surfaceMesh('sphericalZone', { ...SURFACE_DEFAULTS.sphericalZone, toDeg: 90 })).toBeNull();
    expect(surfaceMesh('sphericalCap', { ...SURFACE_DEFAULTS.sphericalCap, rise: 10 })).toBeNull();
    expect(surfaceMesh('hyperboloid', { ...SURFACE_DEFAULTS.hyperboloid, bottomRadius: 3 })).toBeNull();
  });

  it('rejects oversized surface grids before creating their nodes', () => {
    expect(surfaceMesh('cylinder', { ...SURFACE_DEFAULTS.cylinder, around: 720, along: 500 })).toBeNull();
    expect(surfaceMesh('sphericalCap', { ...SURFACE_DEFAULTS.sphericalCap, size: 0.001 })).toBeNull();
  });

  it.each([
    ['cone', { topRadius: 0.0001 }],
    ['sphericalZone', { toDeg: 89.9999 }],
    ['cylinder', { height: 0.0001 }],
    ['hypar', { lx: 0.0001 }],
  ] as const)('rejects %s cells that collapse at placement tolerance', (kind, params) => {
    expect(surfaceMesh(kind, { ...SURFACE_DEFAULTS[kind], ...params })).toBeNull();
  });

  it('keeps small end rings whose corner spacing survives welding', async () => {
    const { modelStore } = await import('../../../store/model.svelte');
    const { insertFragment } = await import('../transformed-copy');
    const { surfaceFragment } = await import('../surfaces');
    const { translation } = await import('../affine');
    for (const [kind, params] of [['cone', { topRadius: 0.001 }], ['sphericalZone', { toDeg: 89.99 }]] as const) {
      modelStore.clear();
      const m = surfaceMesh(kind, { ...SURFACE_DEFAULTS[kind], ...params });
      expect(m).not.toBeNull();
      insertFragment(surfaceFragment(m!, 1, 0.15), [translation([0, 0, 0])]);
      expect([...modelStore.quads.values()].every((q) => new Set(q.nodes).size === 4)).toBe(true);
    }
  });
});

describe('a curved surface in the model', () => {
  it('a cylinder fixed at its base, loaded at the top ring, solves in equilibrium', async () => {
    const { modelStore } = await import('../../../store/model.svelte');
    await import('../../../store');
    const { insertFragment } = await import('../transformed-copy');
    const { surfaceFragment } = await import('../surfaces');
    const { validateAndSolve3D } = await import('../../../engine/solver-service');
    await new Promise((r) => setTimeout(r, 0));
    modelStore.clear();
    const mat = modelStore.addMaterial({ name: 'H', e: 30000, nu: 0.2, rho: 0 });
    const m = mesh('cylinder', { radius: 2, height: 4, around: 16, along: 4 });
    const r = insertFragment(surfaceFragment(m, mat, 0.2), [{ A: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] }]);
    expect(r.quads).toHaveLength(64);
    expect([...modelStore.quads.values()].every((q) => q.curved)).toBe(true);
    let top = 0;
    for (const id of r.nodes) {
      const n = modelStore.nodes.get(id)!;
      if (Math.abs(n.z ?? 0) < 1e-9) modelStore.addSupport(id, 'fixed3d' as never);
      if (Math.abs((n.z ?? 0) - 4) < 1e-9) { modelStore.addNodalLoad3D(id, 0, 0, -5, 0, 0, 0, 1); top++; }
    }
    const md = {
      nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
      loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
      quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints, connectors: modelStore.connectors,
    };
    const res = validateAndSolve3D(md as never);
    if (!res || typeof res === 'string') throw new Error(String(res));
    const fz = res.reactions.reduce((s, x) => s + x.fz, 0);
    expect(fz).toBeCloseTo(5 * top, 4);
  });
});
