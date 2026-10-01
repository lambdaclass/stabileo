/**
 * P-Δ, buckling, modal and plastic collapse run the static solve's model checks
 * and survive the models the eigenvalue analyses used to fail on.
 *
 * Each block is one defect of the audit of Basic's advanced functions
 * (advanced-sweep-2d/3d.test.ts, D numbers of each): the repro, and a number
 * the fixed analysis owes — the static solve's own refusal, a textbook value,
 * or the same structure computed another way.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { modelStore, historyStore, uiStore } from '../../store';
import { setLocale, t } from '../../i18n';
import { solvePDelta, solveBuckling, solveModal, solvePDelta3D, solveBuckling3D, solveModal3D, isSolverReady } from '../wasm-solver';
import { runPlasticCollapse } from '../../actions/plastic';
import { analyzeKinematics as analyzeKinematics2D } from '../kinematic-2d';
import { restrainOrphanRotations2D } from '../orphan-rotations-2d';
import { exactOrphanRotations3D } from '../orphan-rotations-3d';
import type { AnalysisResults, SolverInput } from '../types';
import type { AnalysisResults3D, SolverInput3D } from '../types-3d';
import { resetModel3D, addPalette, frame, truss, support, DOF, equilibriumError, buildRandom } from './helpers/random-models-3d';

const quiet: Array<ReturnType<typeof vi.spyOn>> = [];
beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(isSolverReady()).toBe(true);
  for (const k of ['log', 'warn', 'error', 'info'] as const) quiet.push(vi.spyOn(console, k).mockImplementation(() => {}));
});
afterAll(() => { quiet.forEach((s) => s.mockRestore()); });

const errMsg = (e: unknown): string => typeof e === 'string' ? e : String((e as { message?: unknown })?.message ?? e);
const thrown = (f: () => unknown): string | null => { try { f(); return null; } catch (e) { return errMsg(e); } };

// ── 2D model building ───────────────────────────────────────────────

function build2D(fn: () => void) {
  uiStore.analysisMode = '2d';
  historyStore.clear();
  modelStore.clear();
  modelStore.batch(fn);
}
const N = (x: number, y: number) => modelStore.addNode(x, y);
const E = (a: number, b: number, type: 'frame' | 'truss' = 'frame') => modelStore.addElement(a, b, type);
/** 10 × 20 cm rectangle on every member: EI = 200e6 kPa · 6.667e-5 m⁴ = 13 333 kN·m², m = 160.1 kg/m. */
const RECT = { a: 0.02, iy: (0.1 * 0.2 ** 3) / 12 };
function rectEverywhere() {
  const id = modelStore.addSection({ name: 'R 10x20', a: RECT.a, iy: RECT.iy, iz: (0.2 * 0.1 ** 3) / 12, b: 0.1, h: 0.2, shape: 'rect' } as never);
  for (const e of [...modelStore.elements.keys()]) modelStore.updateElement(e, { sectionId: id });
}
const EI_KN = 200e3 * 1000 * RECT.iy;            // kN·m²
const EI_N = EI_KN * 1000;                        // N·m²
const MASS = ((78.5 * 1000) / 9.81) * RECT.a;     // kg/m
const input2D = () => modelStore.buildSolverInput(false)!;
const densities = () => new Map([...modelStore.materials].map(([id, m]) => [id, (m.rho * 1000) / 9.81]));
const staticMessage2D = () => { const r = modelStore.solve(); expect(typeof r).toBe('string'); return r as string; };

// ── 3D model building ───────────────────────────────────────────────

const input3D = () => modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
const staticSolve3D = () => modelStore.solve3D(false, false, false);

describe('2D D15 — P-Δ, buckling, modal and plastic refuse what the static solve refuses, with its words', () => {
  const cases: Array<[string, () => void]> = [
    ['a stray node', () => { const a = N(0, 0), b = N(5, 0); N(2, 2); const e = E(a, b); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); modelStore.addDistributedLoad(e, -10); }],
    ['a beam with two internal hinges', () => { const n = [0, 2, 4, 6].map((x) => N(x, 0)); const e1 = E(n[0], n[1]); E(n[1], n[2]); const e3 = E(n[2], n[3]); modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[3], 'rollerX'); modelStore.toggleHinge(e1, 'end'); modelStore.toggleHinge(e3, 'start'); modelStore.addNodalLoad(n[1], 0, -10); }],
    ['a beam on two rollers', () => { const a = N(0, 0), b = N(5, 0); const e = E(a, b); modelStore.addSupport(a, 'rollerX'); modelStore.addSupport(b, 'rollerX'); modelStore.addPointLoadOnElement(e, 2, -10); }],
    ['a member hinged at its fixed support', () => { const a = N(0, 0), b = N(4, 0); const e = E(a, b); modelStore.addSupport(a, 'fixed'); modelStore.toggleHinge(e, 'start'); modelStore.addNodalLoad(b, 0, -10); }],
  ];
  it.each(cases)('%s', (_name, fn) => {
    build2D(fn);
    const expected = staticMessage2D();
    const input = input2D();
    expect(thrown(() => solvePDelta(input))).toBe(expected);
    expect(thrown(() => solveBuckling(input))).toBe(expected);
    expect(thrown(() => solveModal(input, densities()))).toBe(expected);
    expect(thrown(() => runPlasticCollapse())).toBe(expected);
  });
});

describe('2D D16 — the mechanism refusal is the localized diagnosis, in the app\'s axis names', () => {
  afterAll(() => setLocale('en'));
  it.each(['en', 'es', 'pt'])('%s', (loc) => {
    setLocale(loc);
    build2D(() => { const n = [N(0, 0), N(2, 0), N(4, 0)]; E(n[0], n[1], 'truss'); E(n[1], n[2], 'truss'); modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[2], 'pinned'); modelStore.addNodalLoad(n[1], 0, -10); });
    const msg = staticMessage2D();
    expect(msg).toBe(analyzeKinematics2D(input2D()).diagnosis);
    // The engine's own sentence is Spanish and Y-up: "desplazamiento en Y".
    expect(msg).not.toMatch(/desplazamiento en Y/);
    if (loc === 'es') expect(msg).toMatch(/desplazamiento en Z/);
    if (loc === 'en') expect(msg).toMatch(/displacement in Z/);
  });
});

describe('2D D17 — the external-stability check reads the support angle', () => {
  it('a beam on two rollers and a roller at 30° is isostatic, solves, and balances', () => {
    build2D(() => { const n = [0, 4, 8].map((x) => N(x, 0)); const e1 = E(n[0], n[1]); E(n[1], n[2]); modelStore.addSupport(n[0], 'rollerX'); modelStore.addSupport(n[1], 'rollerX'); modelStore.addSupport(n[2], 'rollerX', undefined, { angle: 30 }); modelStore.addPointLoadOnElement(e1, 2, -10); });
    const r = modelStore.solve() as AnalysisResults;
    expect(typeof r).toBe('object');
    const rx = r.reactions.reduce((s, x) => s + x.rx, 0), rz = r.reactions.reduce((s, x) => s + x.rz, 0);
    expect(Math.abs(rx)).toBeLessThan(1e-9);
    expect(rz).toBeCloseTo(10, 9);
    // The same with every roller horizontal is still refused: nothing holds it horizontally.
    build2D(() => { const n = [0, 4, 8].map((x) => N(x, 0)); const e1 = E(n[0], n[1]); E(n[1], n[2]); for (const k of n) modelStore.addSupport(k, 'rollerX'); modelStore.addPointLoadOnElement(e1, 2, -10); });
    expect(staticMessage2D()).toBe(t('svc.hypostaticNoHoriz'));
  });
  it('a roller on a member-local axis counts by the member\'s angle too', () => {
    // A 45° strut on a pin and a roller that rolls along the strut: the roller reacts across it.
    build2D(() => { const a = N(0, 0), b = N(3, 3), c = N(6, 3); E(a, b); const e = E(b, c); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(c, 'rollerX', undefined, { angle: 90 }); modelStore.addPointLoadOnElement(e, 1, -10); });
    expect(typeof modelStore.solve()).toBe('object');
  });
});

describe('2D D9 — a model without loads', () => {
  const unloaded = () => { const a = N(0, 0), b = N(5, 0); E(a, b); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); };
  it('P-Δ is the linear result, converged and stable, with a note', () => {
    build2D(unloaded);
    const pd = solvePDelta(input2D());
    expect(pd.converged && pd.isStable).toBe(true);
    expect(pd.b2Factor).toBe(1);
    expect((pd as { notice?: string }).notice).toBe('noLoads');
  });
  it('plastic collapse says there is nothing to collapse under', () => {
    build2D(unloaded);
    expect(thrown(() => runPlasticCollapse())).toBe(t('advanced.plasticNoLoads'));
  });
  it('buckling still says no bar is compressed, and modal runs', () => {
    build2D(unloaded);
    expect(thrown(() => solveBuckling(input2D()))).toMatch(/no compressed elements/i);
    expect(solveModal(input2D(), densities()).modes.length).toBeGreaterThan(0);
  });
});

describe('2D D11 — every degree of freedom restrained', () => {
  it('P-Δ gives the linear result; modal says there is nothing free to vibrate', () => {
    build2D(() => { const a = N(0, 0), b = N(5, 0); const e = E(a, b); modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'fixed'); modelStore.addDistributedLoad(e, -10); });
    const st = modelStore.solve() as AnalysisResults;
    const pd = solvePDelta(input2D());
    expect(pd.converged && pd.isStable).toBe(true);
    expect((pd as { notice?: string }).notice).toBe('noFreeDofs');
    expect(pd.results.elementForces[0].mStart).toBeCloseTo(st.elementForces[0].mStart, 9);
    expect(thrown(() => solveModal(input2D(), densities()))).toBe(t('advanced.noFreeDofsModal'));
    // Nothing compressed: the usual answer.
    expect(thrown(() => solveBuckling(input2D()))).toMatch(/no compressed elements/i);
  });
  it('compressed, buckling says nothing is free to buckle', () => {
    build2D(() => { const a = N(0, 0), b = N(5, 0); const e = E(a, b); modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'fixed'); modelStore.addThermalLoad(e, 30, 0); });
    const st = modelStore.solve() as AnalysisResults;
    expect(st.elementForces[0].nStart).toBeLessThan(0);
    expect(thrown(() => solveBuckling(input2D()))).toBe(t('advanced.noFreeDofsBuckling'));
  });
});

describe('2D D8 — modal and buckling on nodes only truss bars meet', () => {
  it('a pinned column held at its head by a truss bracket buckles at π²EI/L²', () => {
    // The bracket's apex (3, 4) is met only by bars; the load is axial, so the bars carry nothing.
    build2D(() => {
      const c = [0, 1, 2, 3, 4].map((y) => N(0, y));
      for (let i = 0; i < 4; i++) E(c[i], c[i + 1]);
      const apex = N(3, 4), s1 = N(3, 0), s2 = N(6, 4);
      E(c[4], apex, 'truss'); E(apex, s1, 'truss'); E(apex, s2, 'truss');
      modelStore.addSupport(c[0], 'pinned'); modelStore.addSupport(s1, 'pinned'); modelStore.addSupport(s2, 'pinned');
      modelStore.addNodalLoad(c[4], 0, -100);
      rectEverywhere();
    });
    expect(typeof modelStore.solve()).toBe('object');
    const lam = solveBuckling(input2D()).modes[0].loadFactor;
    expect(Math.abs((lam * 100) / ((Math.PI ** 2 * EI_KN) / 16) - 1)).toBeLessThan(0.005);
  });
  it('a pinned-pinned beam with a truss-only node hung from its supports keeps f1 = (π/2L²)·√(EI/m)', () => {
    build2D(() => {
      const n = Array.from({ length: 9 }, (_, i) => N(i, 0));
      for (let i = 0; i < 8; i++) E(n[i], n[i + 1]);
      const low = N(4, -1);
      E(n[0], low, 'truss'); E(low, n[8], 'truss');
      modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[8], 'pinned');
      rectEverywhere();
    });
    const md = solveModal(input2D(), densities());
    const f1 = md.modes.find((q: { massRatioY: number }) => q.massRatioY > 0.3)!.frequency;
    expect(Math.abs(f1 / ((Math.PI / (2 * 64)) * Math.sqrt(EI_N / MASS)) - 1)).toBeLessThan(0.01);
  });
  it('a king-post beam: the plane analysis agrees with the same structure solved in space', () => {
    build2D(() => {
      const a = N(0, 0), m = N(4, 0), b = N(8, 0), d = N(4, -1);
      E(a, m); E(m, b); E(m, d, 'truss'); E(a, d, 'truss'); E(d, b, 'truss');
      modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
      modelStore.addDistributedLoad(1, -10); modelStore.addDistributedLoad(2, -10);
      modelStore.addNodalLoad(b, -200, 0);
    });
    expect(typeof modelStore.solve()).toBe('object');
    const f2 = solveModal(input2D(), densities()).modes.map((q: { frequency: number }) => q.frequency);
    const l2 = solveBuckling(input2D()).modes.map((q: { loadFactor: number }) => q.loadFactor);
    // The same in the XZ plane of a space model, every node held out of plane.
    resetModel3D();
    modelStore.bulkMutate(() => {
      const a = modelStore.addNode(0, 0, 0), m = modelStore.addNode(4, 0, 0), b = modelStore.addNode(8, 0, 0), d = modelStore.addNode(4, 0, -1);
      frame(a, m, 1); frame(m, b, 1); truss(m, d, 1); truss(a, d, 1); truss(d, b, 1);
      support(a, 'custom3d', DOF('xyzXZ')); support(b, 'custom3d', DOF('yzXZ')); support(m, 'custom3d', DOF('yXZ')); support(d, 'custom3d', DOF('y'));
      const [e1, e2] = [...modelStore.elements.keys()];
      modelStore.addDistributedLoad3D(e1, 0, 0, -10, -10); modelStore.addDistributedLoad3D(e2, 0, 0, -10, -10);
      modelStore.addNodalLoad3D(b, -200, 0, 0, 0, 0, 0);
    });
    expect(typeof staticSolve3D()).toBe('object');
    const f3 = solveModal3D(input3D(), densities()).modes.map((q: { frequency: number }) => q.frequency);
    const l3 = solveBuckling3D(input3D()).modes.map((q: { loadFactor: number }) => q.loadFactor);
    for (let k = 0; k < 3; k++) expect(Math.abs(f3[k] / f2[k] - 1)).toBeLessThan(1e-6);
    for (let k = 0; k < 3; k++) expect(Math.abs(l3[k] / l2[k] - 1)).toBeLessThan(1e-6);
  });
  it('restrainOrphanRotations2D holds only the rotations nothing reaches', () => {
    const input = {
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 4, z: 0 }], [3, { id: 3, x: 2, z: -1 }], [4, { id: 4, x: 8, z: 0 }]]),
      materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
      elements: new Map([
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [2, { id: 2, type: 'truss', nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [3, { id: 3, type: 'truss', nodeI: 3, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [4, { id: 4, type: 'truss', nodeI: 2, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      ]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'pinned' }], [2, { id: 2, nodeId: 4, type: 'fixed' }]]),
      loads: [],
    } as unknown as SolverInput;
    const out = restrainOrphanRotations2D(input);
    // Node 3: truss only → held. Node 4: truss only but on a fixed support → already held.
    expect(out.constraints).toEqual([{ type: 'linearMPC', terms: [{ nodeId: 3, dof: 2, coefficient: 1 }] }]);
    expect(input.constraints).toBeUndefined();
  });
});

describe('3D D10 / D3 / D6 / D9 — the static solve\'s refusal, from every analysis', () => {
  function ridgeRoof(o: { braced: boolean; ridgeFx?: number; ridgeFz?: number; ridgeMx?: number }) {
    resetModel3D();
    const A: number[] = [], B: number[] = [], R: number[] = [];
    modelStore.bulkMutate(() => {
      const P = addPalette();
      for (let i = 0; i <= 1; i++) {
        const a0 = modelStore.addNode(i * 5, 0, 0), b0 = modelStore.addNode(i * 5, 6, 0);
        A.push(modelStore.addNode(i * 5, 0, 4)); B.push(modelStore.addNode(i * 5, 6, 4)); R.push(modelStore.addNode(i * 5, 3, 5));
        frame(a0, A[i], P.ipn); frame(b0, B[i], P.ipn);
        support(a0, 'fixed3d'); support(b0, 'fixed3d');
        truss(A[i], R[i], P.tube); truss(R[i], B[i], P.tube); truss(A[i], B[i], P.bar);
      }
      frame(A[0], A[1], P.tube); frame(B[0], B[1], P.tube); truss(R[0], R[1], P.tube);
      if (o.braced) truss(A[0], R[1], P.bar);
      for (const r of R) modelStore.addNodalLoad3D(r, o.ridgeFx ?? 0, 0, o.ridgeFz ?? -10, 0, 0, 0);
      if (o.ridgeMx) modelStore.addNodalLoad3D(R[0], 0, 0, 0, o.ridgeMx, 0, 0);
      modelStore.addNodalLoad3D(A[1], 1, 1, -5, 0, 0, 0);
    });
    return R;
  }
  const refusedAlike = () => {
    const st = staticSolve3D();
    expect(typeof st).toBe('string');
    const input = input3D();
    expect(thrown(() => solvePDelta3D(input))).toBe(st);
    expect(thrown(() => solveBuckling3D(input))).toBe(st);
    expect(thrown(() => solveModal3D(input, densities()))).toBe(st);
  };
  it('D10: a stray node', () => {
    resetModel3D();
    modelStore.bulkMutate(() => {
      const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3); modelStore.addNode(2, 2, 2);
      frame(a, b, 1); support(a, 'fixed3d');
      modelStore.addNodalLoad3D(b, 1, 0, -10, 0, 0, 0);
    });
    expect(staticSolve3D()).toMatch(/not connected/);
    refusedAlike();
  });
  it('D3: a portal on pins with every beam end hinged (a sway mechanism the load excites)', () => {
    resetModel3D();
    modelStore.bulkMutate(() => {
      const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(5, 0, 0), modelStore.addNode(0, 0, 3), modelStore.addNode(5, 0, 3),
        modelStore.addNode(0, 4, 0), modelStore.addNode(5, 4, 0), modelStore.addNode(0, 4, 3), modelStore.addNode(5, 4, 3)];
      for (const [a, b] of [[0, 2], [1, 3], [4, 6], [5, 7]]) frame(n[a], n[b], 1);
      for (const [a, b] of [[2, 3], [6, 7], [2, 6], [3, 7]]) {
        const e = frame(n[a], n[b], 1);
        modelStore.updateElement(e, { releaseI: { my: true, mz: true, t: false }, releaseJ: { my: true, mz: true, t: false } });
      }
      for (const b of [n[0], n[1], n[4], n[5]]) support(b, 'pinned3d');
      modelStore.addNodalLoad3D(n[2], 10, 0, -10, 0, 0, 0);
    });
    refusedAlike();
  });
  it('D6: a truss ridge free to slide', () => { ridgeRoof({ braced: false, ridgeFx: 2, ridgeFz: -10 }); refusedAlike(); });
  it('D9: the same ridge held only by the tension of an uplift', () => { ridgeRoof({ braced: false, ridgeFx: 0.5, ridgeFz: 10 }); refusedAlike(); });
  it('the braced roof runs everything', () => {
    ridgeRoof({ braced: true });
    expect(typeof staticSolve3D()).toBe('object');
    const input = input3D();
    const pd = solvePDelta3D(input);
    expect(pd.converged && pd.isStable).toBe(true);
    expect(solveBuckling3D(input).modes[0].loadFactor).toBeGreaterThan(1);
    const md = solveModal3D(input, densities());
    expect(md.modes.length).toBeGreaterThanOrEqual(3);
    expect(md.modes[0].frequency).toBeGreaterThan(0.5);
    expect(md.discardedModes).toEqual([]);
  });

  it('D7: a moment on a node only truss bars meet is refused, naming the node, by the solve and by P-Δ', () => {
    const R = ridgeRoof({ braced: true, ridgeMx: 3 });
    const msg = t('svc.momentOnTrussNode').replace('{n}', String(R[0]));
    expect(staticSolve3D()).toBe(msg);
    expect(thrown(() => solvePDelta3D(input3D()))).toBe(msg);
  });
  it('D7: the same moment on a frame node is taken, and the reactions balance it', () => {
    resetModel3D();
    let top = 0;
    modelStore.bulkMutate(() => {
      const a = modelStore.addNode(0, 0, 0); top = modelStore.addNode(0, 0, 3);
      frame(a, top, 1); support(a, 'fixed3d');
      modelStore.addNodalLoad3D(top, 0, 0, 0, 3, 0, 0);
    });
    const r = staticSolve3D() as AnalysisResults3D;
    expect(typeof r).toBe('object');
    expect(equilibriumError(input3D(), r).moment).toBeLessThan(1e-9);
  });
});

describe('3D D8 — modal and buckling on nodes only truss bars meet', () => {
  it('an L-frame with a tie to a pinned support has natural frequencies and buckling factors', () => {
    resetModel3D();
    modelStore.bulkMutate(() => {
      const P = addPalette();
      const b = modelStore.addNode(0, 0, 0), tp = modelStore.addNode(0, 0, 3), e = modelStore.addNode(3, 0, 3), g = modelStore.addNode(3, 0, 0);
      frame(b, tp, P.ipn); frame(tp, e, P.ipn); truss(e, g, P.bar);
      support(b, 'fixed3d'); support(g, 'pinned3d');
      modelStore.addNodalLoad3D(e, 0, 0, -1, 0, 0, 0);
    });
    expect(typeof staticSolve3D()).toBe('object');
    const md = solveModal3D(input3D(), densities());
    expect(md.modes.length).toBeGreaterThanOrEqual(3);
    expect(md.modes[0].frequency).toBeGreaterThan(0);
    expect(solveBuckling3D(input3D()).modes[0].loadFactor).toBeGreaterThan(0);
  });
  it('a pinned beam with a truss tripod hung from its supports keeps both bending frequencies', () => {
    resetModel3D();
    const iy = 8e-5, iz = 2e-5, A = 0.01;
    modelStore.bulkMutate(() => {
      const sec = modelStore.addSection({ name: 'b', a: A, iy, iz, j: 1e-5 });
      const n = Array.from({ length: 9 }, (_, i) => modelStore.addNode(i, 0, 0));
      for (let i = 0; i < 8; i++) frame(n[i], n[i + 1], sec);
      const low = modelStore.addNode(4, 0, -1), side = modelStore.addNode(4, 2, -1);
      truss(n[0], low, sec); truss(low, n[8], sec); truss(low, side, sec);
      support(n[0], 'custom3d', DOF('xyzX')); support(n[8], 'custom3d', DOF('xyz')); support(side, 'pinned3d');
    });
    const md = solveModal3D(input3D(), densities());
    const m = ((78.5 * 1000) / 9.81) * A;
    const f = (I: number) => (Math.PI / (2 * 64)) * Math.sqrt((200e9 * I) / m);
    const lateral = md.modes.find((q: { massRatioY: number }) => q.massRatioY > 0.3)!.frequency;
    const vertical = md.modes.find((q: { massRatioZ: number }) => q.massRatioZ > 0.3)!.frequency;
    expect(Math.abs(lateral / f(iz) - 1)).toBeLessThan(0.01);
    expect(Math.abs(vertical / f(iy) - 1)).toBeLessThan(0.01);
  });
  it('exactOrphanRotations3D holds only the global rotations no member end resists', () => {
    const node = (id: number, x: number, y: number, z: number) => [id, { id, x, y, z }] as const;
    const input = {
      nodes: new Map([node(1, 0, 0, 0), node(2, 4, 0, 0), node(3, 4, 0, -2)]),
      materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-5 }]]),
      elements: new Map([
        // A beam along X, its moments released at node 2: node 2 keeps the beam's torsion (about X).
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseMyEnd: true, releaseMzEnd: true }],
        [2, { id: 2, type: 'truss', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1 }],
      ]),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [],
    } as unknown as SolverInput3D;
    const out = exactOrphanRotations3D(input);
    const at = (n: number) => [...out.supports.values()].find((s) => s.nodeId === n)!;
    expect([at(2).rrx, at(2).rry, at(2).rrz]).toEqual([false, true, true]);
    expect([at(3).rrx, at(3).rry, at(3).rrz]).toEqual([true, true, true]);
    expect(at(3).rx || at(3).ry || at(3).rz).toBe(false);
    expect(input.supports.size).toBe(1); // the input is not touched
  });
});

describe('3D — a mechanism the static solve accepts: its zero modes are discarded and named', () => {
  it('a column on a pin free to spin under beams released about the vertical (the sweep\'s hinged-frame#10)', () => {
    // Node 11: a column pinned at its foot, the three beams at its head released about the
    // vertical. The loads do not turn it, and the static solve accepts it; the rank analysis
    // finds the spin. Buckling used to fail its decomposition here.
    buildRandom('hinged-frame', 10);
    expect(typeof staticSolve3D()).toBe('object');
    const input = input3D();
    // Modal: the engine's own cut drops a zero frequency; none reaches the result.
    expect(solveModal3D(input, densities()).modes.every((q: { frequency: number }) => q.frequency > 1e-3)).toBe(true);
    // Buckling: the spin is held for the analysis and named, instead of a failed decomposition.
    const bk = solveBuckling3D(input);
    expect(bk.modes.every((q: { loadFactor: number }) => q.loadFactor > 0)).toBe(true);
    expect(bk.discardedModes).toEqual([{ value: 0, nodeId: 11, dof: 'rz' }]);
  });
});

describe('2D — a moment on a node nothing there can turn against is refused, naming the node', () => {
  const msg = (n: number) => t('svc.momentOnTrussNode').replace('{n}', String(n));

  it('on a truss-only node of a mixed model — by the solve and by every advanced analysis', () => {
    build2D(() => {
      const a = N(0, 0), b = N(4, 0), c = N(2, -2);
      E(a, b); E(a, c, 'truss'); E(c, b, 'truss');
      modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'rollerX');
      modelStore.addNodalLoad(c, 0, -5, 3);
    });
    expect(staticMessage2D()).toBe(msg(3));
    const input = input2D();
    expect(thrown(() => solvePDelta(input))).toBe(msg(3));
    expect(thrown(() => solveBuckling(input))).toBe(msg(3));
    expect(thrown(() => solveModal(input, densities()))).toBe(msg(3));
    expect(thrown(() => runPlasticCollapse())).toBe(msg(3));
  });

  it('on a joint where every frame end is hinged', () => {
    build2D(() => {
      const n = [N(0, 0), N(3, 0), N(6, 0)];
      const e1 = E(n[0], n[1]), e2 = E(n[1], n[2]);
      modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[2], 'rollerX');
      modelStore.toggleHinge(e1, 'end'); modelStore.toggleHinge(e2, 'start');
      modelStore.addNodalLoad(n[1], 0, 0, 2);
    });
    expect(staticMessage2D()).toBe(msg(2));
  });

  it('on any node of a pure truss, which has no rotations at all', () => {
    build2D(() => {
      const n = [N(0, 0), N(2, 0), N(4, 0)];
      E(n[0], n[1], 'truss'); E(n[1], n[2], 'truss');
      modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[2], 'pinned');
      modelStore.addNodalLoad(n[1], 0, -10, 1);
    });
    expect(staticMessage2D()).toBe(msg(2));
  });

  it('on a frame node it is taken, and the reactions balance it', () => {
    build2D(() => {
      const a = N(0, 0), b = N(3, 0);
      E(a, b);
      modelStore.addSupport(a, 'fixed');
      modelStore.addNodalLoad(b, 0, 0, 3);
    });
    const r = modelStore.solve() as AnalysisResults;
    expect(typeof r).toBe('object');
    const base = r.reactions.find((x) => x.nodeId === 1)!;
    expect(Math.abs(Math.abs(base.my) - 3)).toBeLessThan(1e-9);
  });
});

describe('3D D7 — the moment refusal is per axis, not per node', () => {
  function columnWithFreeTorsion(momentMz: number) {
    resetModel3D();
    modelStore.bulkMutate(() => {
      const a = modelStore.addNode(0, 0, 0), top = modelStore.addNode(0, 0, 3);
      frame(a, top, 1); support(a, 'fixed3d');
      // Torsion released at the head: bending rotations there are resisted, the one
      // about the bar axis (global z) is not.
      modelStore.updateElement(1, { releaseJ: { t: true, my: false, mz: false } } as never);
      modelStore.addNodalLoad3D(top, 0, 0, 0, 0, 0, momentMz);
    });
  }

  it('a moment about the released axis is refused although another rotation is resisted', () => {
    columnWithFreeTorsion(3);
    expect(staticSolve3D()).toBe(t('svc.momentOnTrussNode').replace('{n}', '2'));
  });

  it('a moment about a resisted axis of the same node is taken, and the reactions balance it', () => {
    resetModel3D();
    modelStore.bulkMutate(() => {
      const a = modelStore.addNode(0, 0, 0), top = modelStore.addNode(0, 0, 3);
      frame(a, top, 1); support(a, 'fixed3d');
      modelStore.updateElement(1, { releaseJ: { t: true, my: false, mz: false } } as never);
      modelStore.addNodalLoad3D(top, 0, 0, 0, 3, 0, 0);
    });
    const r = staticSolve3D() as AnalysisResults3D;
    expect(typeof r).toBe('object');
    // 1e-5, not the usual 1e-9: the head's torsion rotation carries the stabiliser's
    // vanishing spring (its rank is 2), whose reaction is round-off next to 3 kN·m.
    expect(equilibriumError(input3D(), r).moment).toBeLessThan(1e-5);
  });

  it('a moment about the released axis of a beam at 45° in plan is refused too', () => {
    // The released axis (1, 1, 0)/√2 shares its global components with the resisted
    // bending axes, so judging component by component took it as held: the tip turned
    // 6.5e4 rad and 0.71 kN·m went missing from the moment balance.
    resetModel3D();
    modelStore.bulkMutate(() => {
      const a = modelStore.addNode(0, 0, 0), tip = modelStore.addNode(3, 3, 0);
      frame(a, tip, 1); support(a, 'fixed3d');
      modelStore.updateElement(1, { releaseJ: { t: true, my: false, mz: false } } as never);
      const m = 3 / Math.SQRT2;
      modelStore.addNodalLoad3D(tip, 0, 0, 0, m, m, 0);
    });
    expect(staticSolve3D()).toBe(t('svc.momentOnTrussNode').replace('{n}', '2'));
  });
});
