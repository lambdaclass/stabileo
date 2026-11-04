/**
 * The Advanced panel's imperfection analysis adds notional loads and solves. Two cases made it
 * do nothing and report the unchanged structure as the imperfect one:
 *   · a plane model stands in X–Z and is held out of its plane at every node, so notional loads
 *     along Y went straight into the restraints;
 *   · no node carries a downward load, so every notional load is zero.
 * `notionalLoadsRefusal` names both, and the panel refuses them. Through the store's real input.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { initSolver, solve3D } from '../wasm-solver';
import { notionalLoadsRefusal, withNotionalLoads } from '../advanced-analyses';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

function portal(): void {
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 4), c = modelStore.addNode(6, 4), d = modelStore.addNode(6, 0);
  modelStore.addElement(a, b, 'frame');
  modelStore.addElement(b, c, 'frame');
  modelStore.addElement(c, d, 'frame');
  modelStore.addSupport(a, 'fixed');
  modelStore.addSupport(d, 'fixed');
}

const sway = (r: ReturnType<typeof solve3D>) => Math.max(...r.displacements.map((x) => Math.abs(x.ux) + Math.abs(x.uy)));

describe('notional loads that would move nothing are refused', () => {
  it('a plane model in X–Z: along Y they move nothing (refused), along X they sway it', () => {
    portal();
    const top = [...modelStore.elements.values()][1]!;
    modelStore.addDistributedLoad(top.id, -20);
    const input = modelStore.buildSolverInput3D(false, false)!;
    for (const n of input.nodes.values()) expect(n.y).toBe(0);

    // What used to happen: the Y loads change nothing at all.
    const base = solve3D(input);
    const alongY = solve3D(withNotionalLoads(input, 0.005, 'Y').input);
    expect(withNotionalLoads(input, 0.005, 'Y').totalH).toBeGreaterThan(0);
    expect(sway(alongY)).toBeCloseTo(sway(base), 15);
    expect(notionalLoadsRefusal(input, 0.005, 'Y')).toBe('restrained');

    // Along X they act, and are not refused.
    const alongX = solve3D(withNotionalLoads(input, 0.005, 'X').input);
    expect(sway(alongX)).toBeGreaterThan(sway(base) + 1e-6);
    expect(notionalLoadsRefusal(input, 0.005, 'X')).toBeNull();
  });

  it('no downward load: refused', () => {
    portal();
    const b = [...modelStore.nodes.values()][1]!;
    modelStore.addNodalLoad(b.id, 10, 0, 0);
    const input = modelStore.buildSolverInput3D(false, false)!;
    expect(withNotionalLoads(input, 0.005, 'X').totalH).toBe(0);
    expect(notionalLoadsRefusal(input, 0.005, 'X')).toBe('noGravity');
  });
});
