/**
 * Architecture through the store: on a frame with a slab, a construction, a wall along a beam and
 * another across the slab; their weight put on the structure (the beam's share and the slab's
 * equivalent area load add up to the walls' weight), applied again without doubling; an office
 * on a grid bay loading the shells inside it; the background drawings, a cloud slice and the
 * memoria.
 */
import { describe, it, expect } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { placeFrame, placeSlabs } from '../../model/building/build-on-grid';
import { applyRoomLoads, applyWallLoads, architectureMemoria, geometryIssues, importCloud, levels, saveConstruction, saveRoom, saveWall } from '../architecture';
import { constructionProps } from '../../engine/architecture/architecture';
import type { StructuralGrid } from '../../model/grid';

const grid: StructuralGrid = {
  axes: [{ id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 6 }, { id: 'y0', name: 'A', axis: 'y', at: 0 }, { id: 'y1', name: 'B', axis: 'y', at: 5 }],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }],
};
const tag = (t: string) => modelStore.loads.filter((l) => (l.data as { generatedBy?: string }).generatedBy === t);

describe('architecture', () => {
  it('walls and rooms load the structure; drawings, cloud and memoria', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    const mat = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.00213, iz: 0.00213, j: 0.0036, b: 0.4, h: 0.4, shape: 'rect' } as never);
    const bm = modelStore.addSection({ name: '30×60', a: 0.18, iy: 0.0054, iz: 0.00135, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' } as never);
    modelStore.setGrid(grid);
    placeFrame(grid, { x: ['x0', 'x1'], y: ['y0', 'y1'], levels: ['N0', 'N1'], columns: { sectionId: col, materialId: mat }, beamsX: { sectionId: bm, materialId: mat }, beamsY: { sectionId: bm, materialId: mat } }, { fixBase: true });
    placeSlabs(grid, { levels: ['N1'], thickness: 0.15, materialId: mat, meshSize: 1 });
    modelStore.addLoadCase('L', 'L');
    expect(levels().map((l) => l.id)).toEqual(['N0', 'N1']);

    const c = { id: 'c1', name: 'Ladrillo', kind: 'wall' as const, rsi: 0.13, rse: 0.04, layers: [{ name: 'ladrillo', thickness: 0.15, lambda: 0.81, density: 1600 }] };
    saveConstruction(c);
    const w = constructionProps(c).weight * 2.7;
    saveWall({ id: 'w1', name: 'M1', levelId: 'N1', z: 3, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 2.7, constructionId: 'c1' });
    saveWall({ id: 'w2', name: 'M2', levelId: 'N1', z: 3, a: { x: 3, y: 0.5 }, b: { x: 3, y: 4.5 }, height: 2.7, constructionId: 'c1' });
    expect(modelStore.underlays.some((u) => u.id === 'arch-N1')).toBe(true);

    const n = applyWallLoads();
    expect(n).toBeGreaterThan(2);
    const total = () => tag('arch:walls').reduce((s, l) => {
      const d = l.data as { qZI?: number; a?: number; b?: number; q?: number; quadId?: number };
      if (l.type === 'distributed3d') return s + -d.qZI! * ((d.b ?? 0) - (d.a ?? 0));
      const q = modelStore.quads.get(d.quadId!)!; const ps = q.nodes.map((id) => modelStore.nodes.get(id)!);
      const A = Math.abs(ps.reduce((acc, p, i) => { const r = ps[(i + 1) % ps.length]!; return acc + p.x * r.y - r.x * p.y; }, 0)) / 2;
      return s + d.q! * A;
    }, 0);
    expect(total()).toBeCloseTo(w * 6 + w * 4, 6);
    expect(tag('arch:walls').some((l) => l.type === 'distributed3d')).toBe(true);
    applyWallLoads();
    expect(tag('arch:walls')).toHaveLength(n);

    saveRoom({ id: 'r1', name: 'Oficina', levelId: 'N1', z: 3, outline: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 5 }, { x: 0, y: 5 }], height: 2.7, use: 'office' });
    expect(applyRoomLoads()).toBe(modelStore.quads.size);
    expect(tag('arch:rooms').every((l) => (l.data as { q: number }).q === 2.5)).toBe(true);

    expect(geometryIssues()).toEqual([]);
    expect(importCloud('1 1 4.0\n2 1 4.02\n3 1 5', 'N1', 1, 'Nube')).toEqual({ read: 3, kept: 2 });
    expect(modelStore.underlays.some((u) => u.id.startsWith('cloud-'))).toBe(true);
    const html = architectureMemoria((k) => k, 'es');
    expect(html).toContain('Oficina');
    expect(html).toContain('Ladrillo');
  });
});
