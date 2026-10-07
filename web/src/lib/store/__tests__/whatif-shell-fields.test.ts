/**
 * Explore's load slider on a shell load whose magnitude is not its q: a soil or a fluid on a wall
 * (q = 0, all of it in the variation, as the load generator writes it) and a value per corner.
 * The slider scaled numeric fields only, so a wall of fluid kept its 90 kN at × 2; it now scales
 * what every other scaling of a load scales (`scaledLoad`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';
import { whatIf } from '../whatif.svelte';
import { shellLoadForces } from '../../engine/shell-load-integration';
import type { SurfaceLoad3D } from '../model.svelte';

const flush = () => vi.advanceTimersByTime(200);

beforeEach(() => {
  whatIf.abandon();
  historyStore.clear();
  modelStore.clear();
  uiStore.analysisMode = '3d';
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  whatIf.abandon();
  vi.clearAllTimers();
  vi.useRealTimers();
  uiStore.analysisMode = '2d';
  modelStore.clear();
});

/** The total force of the model's first load, kN. */
function total(): number {
  const l = modelStore.model.loads[0]!.data as SurfaceLoad3D;
  const pts = modelStore.model.quads.get(l.quadId)!.nodes.map((id) => modelStore.nodes.get(id)!);
  const f = shellLoadForces('quad', pts, l)!.forces.reduce((s, v) => [s[0]! + v[0], s[1]! + v[1], s[2]! + v[2]], [0, 0, 0]);
  return Math.hypot(...f);
}

describe('the load slider on a shell field', () => {
  it('a fluid on a wall, 2 m wide and 3 m deep, γ = 10: 90 kN, and 180 kN at × 2', () => {
    const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(2, 0, 0), modelStore.addNode(2, 0, 3), modelStore.addNode(0, 0, 3)] as [number, number, number, number];
    const q = modelStore.addQuad(n, 1, 0.2);
    modelStore.addSurfaceLoad3D(q, 0, 1, { frame: 'global', dir: [0, 1, 0], vary: { dir: [0, 0, 1], c1: 3, q1: 0, c2: 0, q2: 30 } });
    expect(total()).toBeCloseTo(90, 9);
    whatIf.open();
    whatIf.setLoadFactor(0, 2); flush();
    expect(total()).toBeCloseTo(180, 9);
  });

  it('a value per corner', () => {
    const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(2, 0, 0), modelStore.addNode(2, 2, 0), modelStore.addNode(0, 2, 0)] as [number, number, number, number];
    const q = modelStore.addQuad(n, 1, 0.2);
    modelStore.addSurfaceLoad3D(q, 0, 1, { qNodes: [1, 2, 3, 4] });
    expect(total()).toBeCloseTo(10, 9);
    whatIf.open();
    whatIf.setLoadFactor(0, 3); flush();
    expect(total()).toBeCloseTo(30, 9);
    expect((modelStore.model.loads[0]!.data as SurfaceLoad3D).qNodes).toEqual([3, 6, 9, 12]);
  });
});
