/**
 * Where a member's forces are read for design when the diagram's extrema cannot be resolved: a
 * peak under a point load is on the load's discontinuity, which the critical stations refuse; the
 * sheets read 40 divisions and the load's position, the peak among them.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store';
import { initSolver } from '../../engine/wasm-solver';
import { buildCriticalStations, extractForcesAtStation } from '../../engine/station-forces';
import { designStations } from '../demands';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); });

describe('the design stations of a member', () => {
  it('read the peak under a point load where the critical stations refuse it', () => {
    const conc = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
    const sec = modelStore.addSection({ name: '20×40', a: 0.08, iy: 0.2 * 0.4 ** 3 / 12, iz: 0.4 * 0.2 ** 3 / 12, j: 0.001, b: 0.2, h: 0.4, shape: 'rect' } as never);
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4.37, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.updateElementSection(e, sec); modelStore.updateElementMaterial(e, conc);
    modelStore.addSupport(a, 'fixed3d' as never); modelStore.addSupport(b, 'fixed3d' as never);
    modelStore.addPointLoadOnElement3D(e, 4.37 / 2, 0, -50);
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const ef = r.elementForces.find((f) => f.elementId === e)!;
    let refused = false;
    try { buildCriticalStations(ef); } catch { refused = true; }
    const ts = designStations(ef);
    expect(ts[0]).toBe(0);
    expect(ts[ts.length - 1]).toBe(1);
    expect(ts).toContain(0.5);
    expect(Math.abs(extractForcesAtStation(ef, 0.5).my)).toBeCloseTo((50 * 4.37) / 8, 6);
    if (refused) expect(ts.length).toBeGreaterThanOrEqual(41);
  });
});
