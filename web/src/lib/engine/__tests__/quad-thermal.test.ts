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

describe.each(['quad', 'curved', 'plate'] as const)('thermal load on a %s', (kind) => {
  beforeAll(async () => { await initSolver(); uiStore.analysisMode = 'pro'; });

  it.each(['family', ALPHA, 0, -5e-6, undefined] as const)('#2656 expands the plate with its declared coefficient %s', (alpha) => {
    modelStore.clear();
    const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(4, 0, 0), modelStore.addNode(4, 2, 0), modelStore.addNode(0, 2, 0)];
    const mid = alpha === 'family' ? [...modelStore.materials.keys()][0]!
      : modelStore.addMaterial({ name: 'Specimen', e: 11000, nu: 0.2, rho: 25, alpha });
    const expected = typeof alpha === 'number' ? alpha : ALPHA;
    if (kind === 'plate') {
      for (const triangle of [[0, 1, 2], [0, 2, 3]]) {
        const plate = modelStore.addPlate(triangle.map(i => n[i]!) as [number, number, number], mid, 0.2);
        modelStore.addLoadEntry({ type: 'thermalQuad3d', data: { id: plate, on: 'plate', quadId: plate, dtUniform: 30, dtGradient: 0 } });
      }
    } else {
      const q = modelStore.addQuad(n as [number, number, number, number], mid, 0.2, { curved: kind === 'curved' });
      modelStore.addThermalLoadQuad3D(q, 30);
    }
    const R = (tx: boolean, ty: boolean) => ({ dofRestraints: { tx, ty, tz: true, rx: true, ry: true, rz: true } });
    modelStore.addSupport(n[0]!, 'custom3d', undefined, R(true, true));
    modelStore.addSupport(n[1]!, 'custom3d', undefined, R(false, true));
    modelStore.addSupport(n[3]!, 'custom3d', undefined, R(true, false));
    modelStore.addSupport(n[2]!, 'custom3d', undefined, R(false, false));
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    expect(r.structuredDiagnostics?.some(d => d.code === 'thermal_default_assumed' && d.phase === 'alpha') ?? false).toBe(alpha === undefined);
    const d = (id: number) => r.displacements.find((x) => x.nodeId === id)!;
    expect(d(n[1]!).ux).toBeCloseTo(expected * 30 * 4, 9);
    expect(d(n[3]!).uy).toBeCloseTo(expected * 30 * 2, 9);
    expect(d(n[2]!).ux).toBeCloseTo(expected * 30 * 4, 9);
  });
});
