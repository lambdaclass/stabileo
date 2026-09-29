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
import { initSolver, input3DToWireObject } from '../wasm-solver';
import { finishSolve3D } from '../solve-finish';
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

describe('wherever the solve ran', () => {
  it('the wire a worker receives carries the tags, and its finish gives the part back', () => {
    // The worker gets the wire object, not the input; the tags have to survive the conversion.
    const e = column();
    const input = modelStore.buildSolverInput3D(false, false);
    if (!input) throw new Error('no input');
    const wire = input3DToWireObject(input);
    const raw = { reactions: [], elementForces: [{ elementId: e, nStart: -20, nEnd: -20 }] };
    finishSolve3D(raw, wire as never);
    expect(raw.elementForces[0]!.nStart).toBeCloseTo(-q * L, 9);
    expect(raw.elementForces[0]!.nEnd).toBeCloseTo(0, 9);
  });

  it('a model with a cable: the other members keep the axial part of their loads', async () => {
    const e = column();
    // A cable from the head to an anchor 3 m away, pulled by a small side load at the head.
    const head = modelStore.elements.get(e)!.nodeJ;
    const anchor = modelStore.addNode(3, 0, 0);
    modelStore.addSupport(anchor, 'pinned3d');
    const c = modelStore.addElement(head, anchor, 'truss');
    // A wire rope, so its own weight is small beside the pull.
    const rope = modelStore.addSection({ name: 'Rope', a: 1e-3, iy: 1e-10, iz: 1e-10, j: 1e-10 } as never);
    modelStore.updateElementSection(c, rope);
    modelStore.updateElement(c, { behaviour: 'cable' });
    modelStore.addNodalLoad3D(head, -20, 0, 0, 0, 0, 0, 1);
    const r = await modelStore.solve3DAsync(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const f = forces(r, e);
    // Foot and head differ by the whole load along the column, as without the cable.
    expect(f.nStart - f.nEnd).toBeCloseTo(-q * L, 6);
  });
});
