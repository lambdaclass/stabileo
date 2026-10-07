/**
 * Global ↔ Local on a member load is the same load read on other axes.
 *
 * Only the frame used to change: a column with a global qX = 5 kN/m (a push to the side), switched
 * to Local, kept qX = 5, which in the local frame runs along the member. The card showed
 * qY = qZ = 0 and the column took 15 kN down its axis.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { uiStore } from '../../../store/ui.svelte';
import { historyStore } from '../../../store/history.svelte';
import '../../../store/index';
import { setMemberLoadFrame } from '../../../store/load-ops';
import { initSolver } from '../../../engine/wasm-solver';
import { memberRef3D, type ModelData } from '../../../engine/solver-service';
import { distributedGlobalEnds } from '../../../engine/member-loads';
import { pointGlobal } from '../../../engine/member-point-loads';
import type { DistributedLoad3D, PointLoadOnElement3D } from '../../../store/model.svelte';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  uiStore.analysisMode = '3d';
  uiStore.axisConvention3D = 'rightHand';
  modelStore.clear(); historyStore.clear();
});

/** A 3 m column on a fixed base, as the review's. */
function column() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d');
  return e;
}

const sums = () => {
  const r = modelStore.solve3D(false, uiStore.axisConvention3D === 'leftHand');
  if (!r || typeof r === 'string') throw new Error(String(r));
  return r.reactions.reduce((s, x) => ({ fx: s.fx + x.fx, fy: s.fy + x.fy, fz: s.fz + x.fz }), { fx: 0, fy: 0, fz: 0 });
};
const load = <T>(id: number) => modelStore.loads.find((l) => l.data.id === id)!.data as unknown as T;
const axesOf = (e: number) => memberRef3D(modelStore.model as unknown as ModelData, e)!.axes;

describe('switching a distributed load between Global and Local', () => {
  it('a global sideways qX on a column stays sideways in Local, and comes back the same', () => {
    const e = column();
    const id = modelStore.addDistributedLoad3D(e, 0, 0, 0, 0, undefined, undefined, undefined, { frame: 'global', qXI: 5, qXJ: 5 });
    const before = sums();
    expect(before.fx).toBeCloseTo(-15, 6);
    expect(before.fz).toBeCloseTo(0, 6);

    expect(setMemberLoadFrame(id, 'local')).toBe(true);
    const local = load<DistributedLoad3D>(id);
    expect(local.frame).toBeUndefined();
    // Across the member now, nothing along it: what the card shows is the whole load.
    expect(local.qXI ?? 0).toBeCloseTo(0, 9);
    expect(Math.hypot(local.qYI, local.qZI)).toBeCloseTo(5, 9);
    const after = sums();
    expect(after.fx).toBeCloseTo(before.fx, 6);
    expect(after.fy).toBeCloseTo(before.fy, 6);
    expect(after.fz).toBeCloseTo(before.fz, 6);

    expect(setMemberLoadFrame(id, 'global')).toBe(true);
    const back = load<DistributedLoad3D>(id);
    expect(back).toMatchObject({ frame: 'global', qXI: 5, qXJ: 5, qYI: 0, qZI: 0 });
  });

  it('keeps the global resultant of a tapered load on a sloping member, both ends, both conventions', () => {
    for (const hand of ['rightHand', 'leftHand'] as const) {
      modelStore.clear();
      uiStore.axisConvention3D = hand;
      const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 2, 3);
      const e = modelStore.addElement(a, b, 'frame');
      const id = modelStore.addDistributedLoad3D(e, -2, -6, 1, 3, 0.5, 4, undefined, { qXI: 0.7, qXJ: -1.1 });
      const lh = hand === 'leftHand';
      const g0 = distributedGlobalEnds(load<DistributedLoad3D>(id), axesOf(e), lh);
      setMemberLoadFrame(id, 'global');
      const g1 = distributedGlobalEnds(load<DistributedLoad3D>(id), axesOf(e), lh);
      setMemberLoadFrame(id, 'local');
      const g2 = distributedGlobalEnds(load<DistributedLoad3D>(id), axesOf(e), lh);
      for (const g of [g1, g2]) {
        for (let k = 0; k < 3; k++) {
          expect(g.gI[k]).toBeCloseTo(g0.gI[k]!, 9);
          expect(g.gJ[k]).toBeCloseTo(g0.gJ[k]!, 9);
        }
        expect([g.a, g.b]).toEqual([g0.a, g0.b]);
      }
    }
  });

  it('a point load keeps its force and moment', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 4, 0);
    const e = modelStore.addElement(a, b, 'frame');
    const id = modelStore.addPointLoadOnElement3D(e, 2, -10, 4);
    modelStore.updateLoad(id, { px: 2, my: 1.5 });
    const p0 = pointGlobal(load<PointLoadOnElement3D>(id), axesOf(e));
    setMemberLoadFrame(id, 'global');
    expect(load<PointLoadOnElement3D>(id).frame).toBe('global');
    const p1 = pointGlobal(load<PointLoadOnElement3D>(id), axesOf(e));
    for (let k = 0; k < 3; k++) {
      expect(p1.F[k]).toBeCloseTo(p0.F[k]!, 9);
      expect(p1.M[k]).toBeCloseTo(p0.M[k]!, 9);
    }
  });

  it('the frame it already has is no edit', () => {
    const e = column();
    const id = modelStore.addDistributedLoad3D(e, 1, 1, 0, 0);
    const steps = historyStore.undoCount;
    expect(setMemberLoadFrame(id, 'local')).toBe(false);
    expect(historyStore.undoCount).toBe(steps);
  });
});
