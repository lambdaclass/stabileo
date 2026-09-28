/**
 * A member's axial force under a load along it: the part the engine never sees.
 *
 * A column 4 m tall, fixed at its foot, carrying 10 kN/m down along its axis: by statics its
 * foot carries −40 kN and its head nothing. The engine takes no axial member load, so the load
 * reaches the nodes and the member used to report −20 kN all along, the average; a validation
 * model's column read −23.68 where it carries −26.04 at the foot.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';
import { extractForcesAtStation } from '../station-forces';
import type { AnalysisResults3D } from '../types-3d';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); });

const L = 4, q = 10;
function column() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, L);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d');
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  // Global Z, down, along the member's whole length.
  modelStore.addDistributedLoad3D(e, 0, 0, -q, -q, undefined, undefined, 1, { frame: 'global' });
  return e;
}
const forces = (r: AnalysisResults3D, e: number) => r.elementForces.find((f) => f.elementId === e)!;

describe('the axial part of a member load', () => {
  it('reaches the member: its foot carries the whole load, its head none', async () => {
    const e = column();
    const r = await modelStore.solve3DAsync(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const f = forces(r, e);
    expect(f.nStart).toBeCloseTo(-q * L, 9);
    expect(f.nEnd).toBeCloseTo(0, 9);
    expect(extractForcesAtStation(f, 0.5).n).toBeCloseTo(-q * L / 2, 9);
    // The support still takes it once.
    expect(r.reactions.reduce((s, x) => s + x.fz, 0)).toBeCloseTo(q * L, 9);
  });

  it('in a combination, with its factor, and to second order', () => {
    const e = column();
    const k = modelStore.addCombination('1.4 D', [{ caseId: 1, factor: 1.4 }]);
    const lin = modelStore.solveCombinations3D(false, false, true);
    if (!lin || typeof lin === 'string') throw new Error(String(lin));
    expect(forces(lin.perCombo.get(k)!, e).nStart).toBeCloseTo(-1.4 * q * L, 9);
    expect(forces(lin.perCase.get(1)!, e).nEnd).toBeCloseTo(0, 9);
    modelStore.setAnalysis({ perCombination: 'pdelta' });
    const pd = modelStore.solveCombinations3D(false, false, true);
    if (!pd || typeof pd === 'string') throw new Error(String(pd));
    expect(forces(pd.perCombo.get(k)!, e).nStart).toBeCloseTo(-1.4 * q * L, 6);
  });
});
