/**
 * Moving loads in 3D, against the closed forms for a simply supported span: one axle gives
 * P·L/4 under it at midspan, and two equal axles d apart give P·(L − d/2)²/(2L) under the axle
 * nearer the centre (the classic position with the span's centre halfway between the resultant
 * and that axle).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';
import { buildSolverInput3D } from '../solver-service';
import { buildPath3D, sweepMovingLoad3D, trainLoads } from '../moving-loads-3d';

const L = 6, P = 100;

function beam(parts = 1) {
  modelStore.clear();
  const mat = modelStore.addMaterial({ name: 'S', e: 200_000, nu: 0.3, rho: 78.5, fy: 250 } as never);
  const sec = modelStore.addSection({ name: 'b', a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-5, b: 0.2, h: 0.3 } as never);
  const nodes = Array.from({ length: parts + 1 }, (_, i) => modelStore.addNode((L * i) / parts, 0, 0));
  const els: number[] = [];
  for (let i = 0; i < parts; i++) {
    const e = modelStore.addElement(nodes[i]!, nodes[i + 1]!, 'frame');
    modelStore.updateElementMaterial(e, mat); modelStore.updateElementSection(e, sec);
    els.push(e);
  }
  modelStore.addSupport(nodes[0]!, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: false } });
  modelStore.addSupport(nodes[parts]!, 'custom3d', undefined, { dofRestraints: { tx: false, ty: true, tz: true, rx: false, ry: false, rz: false } });
  const input = buildSolverInput3D(modelStore.model as never, false, false)!;
  return { input, els };
}

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; });
afterEach(() => { uiStore.analysisMode = '3d'; });

describe('moving loads in 3D', () => {
  it('one axle on a one-member span: P·L/4, under the axle, which the member ends never show', async () => {
    const { input, els } = beam(1);
    const path = buildPath3D(input, els)!;
    const env = await sweepMovingLoad3D(input, path, { name: 'P', axles: [{ offset: 0, weight: P }] }, { step: 0.5 });
    const my = env.elements.get(els[0]!)!.my;
    const peak = Math.max(Math.abs(my.max.value), Math.abs(my.min.value));
    expect(peak).toBeCloseTo((P * L) / 4, 6);
    const at = Math.abs(my.max.value) > Math.abs(my.min.value) ? my.max : my.min;
    expect(at.x).toBeCloseTo(L / 2, 6);
  });

  it('two equal axles: P·(L − d/2)²/(2L), reached on a path of three members read in reverse', async () => {
    const d = 1.2;
    const { input, els } = beam(3);
    // Listed back to front: the chain is ordered from the first listed member's free end.
    const path = buildPath3D(input, [...els].reverse())!;
    expect(path.map((p) => p.reversed)).toEqual([true, true, true]);
    const step = 0.05;
    const env = await sweepMovingLoad3D(input, path, { name: 'T', axles: [{ offset: 0, weight: P }, { offset: d, weight: P }] }, { step });
    let peak = 0;
    for (const id of els) {
      const my = env.elements.get(id)!.my;
      peak = Math.max(peak, Math.abs(my.max.value), Math.abs(my.min.value));
    }
    const exact = (P * (L - d / 2) ** 2) / (2 * L);
    // The sweep samples the position every 5 cm; the exact position is between two samples.
    expect(peak).toBeLessThanOrEqual(exact + 1e-9);
    expect(peak / exact).toBeGreaterThan(0.995);
  });

  it('splits the weight on an inclined member into its own axes', () => {
    modelStore.clear();
    const mat = modelStore.addMaterial({ name: 'S', e: 200_000, nu: 0.3, rho: 78.5, fy: 250 } as never);
    const sec = modelStore.addSection({ name: 'b', a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-5, b: 0.2, h: 0.3 } as never);
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 4);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.updateElementMaterial(e, mat); modelStore.updateElementSection(e, sec);
    modelStore.addSupport(a, 'fixed3d' as never);
    const input = buildSolverInput3D(modelStore.model as never, false, false)!;
    const loads = trainLoads(input, buildPath3D(input, [e])!, { name: 'P', axles: [{ offset: 0, weight: 10 }] }, 2.5);
    const point = loads.find((l) => l.type === 'pointOnElement')!.data as { py: number; pz: number; a: number };
    expect(point.a).toBeCloseTo(2.5, 12);
    // Transverse part 10·cos(53,13°) = 6; the axial 8 goes to the two nodes, half each at midlength.
    expect(Math.hypot(point.py, point.pz)).toBeCloseTo(6, 9);
    const nodal = loads.filter((l) => l.type === 'nodal').map((l) => l.data as { fz: number });
    expect(nodal.reduce((s, n) => s + n.fz, 0)).toBeCloseTo(-8 * 0.8, 9);
  });

  it('refuses a set of members that is not one chain', () => {
    const { input, els } = beam(3);
    expect(buildPath3D(input, [els[0]!, els[2]!])).toBeNull();
  });
});
