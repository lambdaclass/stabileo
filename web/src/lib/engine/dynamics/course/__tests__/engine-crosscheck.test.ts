import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { modelStore, historyStore, uiStore } from '../../../../store';
import { solveModal, solveHarmonic2D, solveTimeHistory2D, guyanReduce2D, isSolverReady } from '../../../wasm-solver';
import { withBasicMass } from '../../basic-mass';
import { densityRecord } from '../../requests';
import { modelSystem } from '../mdof-system';
import { condense } from '../mass-model';
import { convergenceTable, exactBeam } from '../convergence';
import { subdivideForAnalysis } from '../../../../model/edit/analysis-subdivision';
import { buildSolverInput2D } from '../../../solver-service';
import { sdofProps, harmonic, forcedResponse } from '../sdof';
import { sdofSyntheticInput } from '../sdof-engine';

const quiet: Array<ReturnType<typeof vi.spyOn>> = [];
beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(isSolverReady()).toBe(true);
  for (const k of ['log', 'warn', 'info'] as const) quiet.push(vi.spyOn(console, k).mockImplementation(() => {}));
});
afterAll(() => { quiet.forEach((s) => s.mockRestore()); });

const RECT = { a: 0.02, iz: (0.1 * 0.2 ** 3) / 12 };
function build(fn: () => void) {
  uiStore.analysisMode = '2d';
  historyStore.clear();
  modelStore.clear();
  modelStore.batch(() => {
    fn();
    const id = modelStore.addSection({ name: 'R 10x20', a: RECT.a, iy: RECT.iz, iz: (0.2 * 0.1 ** 3) / 12, b: 0.1, h: 0.2, shape: 'rect' } as never);
    for (const e of [...modelStore.elements.keys()]) modelStore.updateElement(e, { sectionId: id });
  });
}
function cantilever(L = 3) {
  build(() => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(L, 0);
    modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed');
  });
}
const points = () => modelStore.model.massSource?.points ?? [];
function engineFrequencies(n: number): number[] {
  const sub = subdivideForAnalysis(modelStore.model, n);
  const input = buildSolverInput2D(sub.model)!;
  const phys = withBasicMass(input, { ...sub.model, massSource: modelStore.model.massSource });
  return solveModal(phys.input, phys.densities, 12).modes.map((m: { frequency: number }) => m.frequency);
}

describe('cantilever: frequencies against n, mass model and the exact beam', () => {
  it('the exact beam is recognised: 3.516·√(EI/mL⁴) first, then the bending and axial modes in order', () => {
    cantilever();
    const ex = exactBeam(modelStore.model, points())!;
    expect(ex.beamCase).toBe('cantilever');
    const EI = 200e6 * RECT.iz, rhoA = (78.5 / 9.81) * RECT.a;
    expect(ex.EI).toBeCloseTo(EI, 3);
    expect(ex.rhoA).toBeCloseTo(rhoA, 9);
    expect(ex.modes[0].kind).toBe('bending');
    expect(ex.modes[0].f).toBeCloseTo((3.516 * Math.sqrt(EI / (rhoA * 81))) / (2 * Math.PI), 1);
  });

  it('the consistent mass is the engine\'s: same frequencies for every n', () => {
    cantilever();
    for (const n of [1, 2, 4]) {
      const mine = convergenceTable(modelStore.model, points(), [n], 3, true)[0].f.consistent;
      const eng = engineFrequencies(n);
      mine.forEach((f, i) => expect(f).toBeCloseTo(eng[i], 6));
    }
  });

  it('lumped converges from below, consistent from above, both towards the exact first frequency', () => {
    cantilever();
    const ex = exactBeam(modelStore.model, points())!;
    const f1 = ex.modes[0].f;
    const rows = convergenceTable(modelStore.model, points(), [1, 2, 4, 8], 2, true);
    const err = (mm: 'lumped' | 'consistent' | 'guyan') => rows.map((r) => Math.abs(r.f[mm][0] - f1) / f1);
    expect(rows[0].f.lumped[0]).toBeCloseTo((Math.sqrt(6) / 3.516) * f1, 2);
    rows.forEach((r) => {
      expect(r.f.lumped[0]).toBeLessThan(f1);
      expect(r.f.consistent[0]).toBeGreaterThan(f1 * (1 - 1e-6));
      expect(r.f.guyan[0]).toBeGreaterThanOrEqual(r.f.consistent[0] * (1 - 1e-9));
    });
    for (const mm of ['lumped', 'consistent', 'guyan'] as const) {
      const e = err(mm);
      for (let i = 1; i < e.length; i++) expect(e[i]).toBeLessThan(e[i - 1] + 1e-12);
    }
    expect(err('lumped')[3]).toBeLessThan(0.01);
    expect(err('consistent')[3]).toBeLessThan(1e-4);
  });
});

describe('point masses in Basic reach the engine', () => {
  it('a tip mass M on a light cantilever: ω ≈ √(3EI/((M + 0.236 m L)·L³)) and it lowers the engine frequency', () => {
    cantilever(2);
    const before = engineFrequencies(1)[0];
    const M = 1.5;
    modelStore.setMassSource({ kind: 'custom', factors: [], points: [{ nodeId: 2, m: M }] });
    const after = engineFrequencies(4)[0];
    expect(after).toBeLessThan(before);
    const EI = 200e6 * RECT.iz, rhoA = (78.5 / 9.81) * RECT.a;
    const rayleigh = Math.sqrt((3 * EI) / ((M + 0.236 * rhoA * 2) * 8)) / (2 * Math.PI);
    expect(Math.abs(after - rayleigh) / rayleigh).toBeLessThan(0.01);
    const mine = convergenceTable(modelStore.model, points(), [4], 1, true)[0].f.consistent[0];
    expect(mine).toBeCloseTo(after, 6);
  });

  it('a horizontal-only mass moves only the horizontal frequency', () => {
    cantilever(2);
    modelStore.setMassSource({ kind: 'custom', factors: [], points: [{ nodeId: 2, m: 2, horizontalOnly: true }] });
    const s = modelSystem(modelStore.model, points(), { nPerMember: 1, massModel: 'lumped', barMass: true });
    const ix = s.fullDofs.findIndex((d) => d.nodeId === 2 && d.dir === 'ux');
    const iz = s.fullDofs.findIndex((d) => d.nodeId === 2 && d.dir === 'uz');
    const half = ((78.5 / 9.81) * RECT.a * 2) / 2;
    expect(s.fullM[ix][ix]).toBeCloseTo(2 + half, 10);
    expect(s.fullM[iz][iz]).toBeCloseTo(half, 10);
  });
});

describe('static condensation against the engine', () => {
  it('a three-element cantilever condensed onto its tip: the engine\'s Guyan reduction and the exact tip stiffness', () => {
    cantilever(3);
    const s = modelSystem(modelStore.model, [], { nPerMember: 3, massModel: 'consistent', barMass: true });
    const tip = s.fullDofs.map((d, i) => (d.nodeId === 2 ? i : -1)).filter((i) => i >= 0);
    const c = condense(s.fullK, s.fullM, s.fullF, tip);
    const sub = subdivideForAnalysis(modelStore.model, 3);
    const g = guyanReduce2D({ solver: buildSolverInput2D(sub.model)!, boundaryNodes: [2] });
    expect(g.nBoundary).toBe(3);
    expect(g.nInterior).toBe(6);
    const kc: number[] = g.kCondensed;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(c.K[i][j]).toBeCloseTo(kc[i * 3 + j], 3);
    const EI = 200e6 * RECT.iz, L = 3;
    expect(c.K[1][1]).toBeCloseTo((12 * EI) / L ** 3, 3);
    expect(c.K[1][2]).toBeCloseTo((-6 * EI) / L ** 2, 3);
    expect(c.K[2][2]).toBeCloseTo((4 * EI) / L, 3);
  });
});

describe('the single degree of freedom against the engine', () => {
  const m = 2, k = 800, xi = 0.05;

  it('the synthetic one-degree system has ω = √(k/m) in the engine', () => {
    const syn = sdofSyntheticInput(m, k);
    const r = solveModal(syn.input, syn.densities, 1);
    expect(r.modes[0].omega).toBeCloseTo(Math.sqrt(k / m), 6);
  });

  it('the engine\'s harmonic amplitude is D·F0/k', () => {
    const syn = sdofSyntheticInput(m, k);
    const p = sdofProps(m, k, xi);
    for (const beta of [0.5, 1, 2]) {
      const W = beta * p.omega;
      const r = solveHarmonic2D({ solver: syn.forced(10), densities: densityRecord(syn.densities), frequencies: [W / (2 * Math.PI)], dampingRatio: xi, responseNodeId: syn.node, responseDof: 'x' });
      expect(r.responsePoints[0].amplitude).toBeCloseTo(harmonic(p, 10, W).X, 6);
    }
  });

  it('the engine\'s time history from rest follows transient + steady state', () => {
    const syn = sdofSyntheticInput(m, k);
    const p = sdofProps(m, k, 0);
    const W = 0.6 * p.omega, F0 = 10;
    const dt = p.T / 200, nSteps = 800;
    const forceHistory = Array.from({ length: nSteps + 1 }, (_, i) => ({ time: i * dt, loads: [{ nodeId: syn.node, fx: F0 * Math.sin(W * i * dt), fz: 0, my: 0 }] }));
    const r = solveTimeHistory2D({ solver: syn.input, densities: syn.densities, timeStep: dt, nSteps, forceHistory });
    const ux: number[] = r.nodeHistories.find((h: { nodeId: number }) => h.nodeId === syn.node).ux;
    const exact = forcedResponse(p, harmonic(p, F0, W), 0, 0).total;
    const peak = Math.max(...ux.map(Math.abs));
    for (const i of [100, 250, 400, 650, 800]) expect(Math.abs(ux[i] - exact(i * dt))).toBeLessThan(0.01 * peak);
  });
});
