/**
 * A temperature change on a slab reaches the analysis.
 *
 * A single quad held so it can grow freely (one corner pinned, a second on a roller along the edge,
 * a third held out of plane only): a uniform ΔT must lengthen each edge by α·ΔT·L and stress nothing.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';

const ALPHA = 1.2e-5;

describe('thermal load on a quad', () => {
  beforeAll(async () => { await initSolver(); uiStore.analysisMode = 'pro'; });

  it('expands the plate by α·ΔT·L, where it used to do nothing', () => {
    modelStore.clear();
    const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(4, 0, 0), modelStore.addNode(4, 2, 0), modelStore.addNode(0, 2, 0)];
    const mid = [...modelStore.materials.keys()][0]!;
    const q = modelStore.addQuad(n as [number, number, number, number], mid, 0.2);
    const R = (tx: boolean, ty: boolean) => ({ dofRestraints: { tx, ty, tz: true, rx: true, ry: true, rz: true } });
    modelStore.addSupport(n[0]!, 'custom3d', undefined, R(true, true));
    modelStore.addSupport(n[1]!, 'custom3d', undefined, R(false, true));
    modelStore.addSupport(n[3]!, 'custom3d', undefined, R(true, false));
    modelStore.addSupport(n[2]!, 'custom3d', undefined, R(false, false));
    modelStore.addThermalLoadQuad3D(q, 30);
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const d = (id: number) => r.displacements.find((x) => x.nodeId === id)!;
    expect(d(n[1]!).ux).toBeCloseTo(ALPHA * 30 * 4, 9);
    expect(d(n[3]!).uy).toBeCloseTo(ALPHA * 30 * 2, 9);
    expect(d(n[2]!).ux).toBeCloseTo(ALPHA * 30 * 4, 9);
  });
});
