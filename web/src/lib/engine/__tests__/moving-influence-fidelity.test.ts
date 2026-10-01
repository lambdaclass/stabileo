/**
 * The moving load and the influence line against the static solve.
 *
 * Both analyses put a vertical force somewhere on the structure and solve. The
 * static solve is the reference for both: an influence ordinate at x is the
 * static value of the same quantity under a unit load at x (Müller-Breslau),
 * and each train position is the static solve of the train standing there.
 *
 * The cases are the ones that used to break:
 *   - members drawn against the direction of travel (the axle was measured from
 *     the path's node, not the member's, and landed mirrored, pushing up);
 *   - a settled support (the line carried the settlement's reactions);
 *   - a rotated section and an inclined roller (the line built its own input,
 *     with other section properties and every roller horizontal);
 *   - truss bars (the engine drops a load placed on a bar; it is applied as
 *     its two lever-rule nodal loads);
 *   - mechanisms (the moving load returned an envelope, the line said
 *     "undefined").
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { modelStore, historyStore, uiStore } from '../../store';
import type { Load } from '../../store/model.svelte';
import { isSolverReady } from '../wasm-solver';
import { solveMovingLoads, solveMovingLoadsAsync, errorText, type LoadTrain, type MovingLoadEnvelope } from '../moving-loads';
import { computeInfluenceLine } from '../influence-service';
import { validateAndSolve2D } from '../solver-service';
import { withoutSettlement } from '../settlement-case';
import { analyzeKinematics } from '../kinematic-2d';
import { computeDiagramValueAt } from '../diagrams';
import type { AnalysisResults } from '../types';

const quiet: Array<ReturnType<typeof vi.spyOn>> = [];
beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(isSolverReady()).toBe(true);
  uiStore.analysisMode = '2d';
  for (const k of ['log', 'warn'] as const) quiet.push(vi.spyOn(console, k).mockImplementation(() => {}));
});
afterAll(() => { quiet.forEach((s) => s.mockRestore()); });

function build(fn: () => void) {
  historyStore.clear();
  modelStore.clear();
  modelStore.batch(fn);
}
const N = (x: number, y: number) => modelStore.addNode(x, y);
const El = (a: number, b: number, t: 'frame' | 'truss' = 'frame') => modelStore.addElement(a, b, t);
const inputNow = () => modelStore.buildSolverInput(false)!;

/** The static solve of the model under these loads only, without its settlements. */
function staticWith(loads: Load[]): AnalysisResults {
  const m = modelStore.model;
  const r = validateAndSolve2D({ ...m, loads, supports: withoutSettlement(m.supports) } as never, false);
  if (!r || typeof r === 'string') throw new Error(`static solve refused: ${r}`);
  return r;
}

let loadId = 800000;
/**
 * A downward force W at the world point (x, y) on member `elementId`, written as a
 * user would load it: a global point load on a frame member, the two lever-rule
 * nodal loads on a truss bar. Independent of the code under test.
 */
function forceAt(elementId: number, x: number, y: number, W: number): Load[] {
  const el = modelStore.elements.get(elementId)!;
  const ni = modelStore.nodes.get(el.nodeI)!, nj = modelStore.nodes.get(el.nodeJ)!;
  const L = Math.hypot(nj.x - ni.x, nj.y - ni.y);
  const a = Math.hypot(x - ni.x, y - ni.y);
  if (el.type === 'truss') {
    const t = a / L;
    return [
      { type: 'nodal', data: { id: ++loadId, nodeId: el.nodeI, fx: 0, fz: -W * (1 - t), my: 0 } } as Load,
      { type: 'nodal', data: { id: ++loadId, nodeId: el.nodeJ, fx: 0, fz: -W * t, my: 0 } } as Load,
    ];
  }
  return [{ type: 'pointOnElement', data: { id: ++loadId, elementId, a, p: -W, isGlobal: true } } as Load];
}

/** World position of `pos` metres along the moving load's path. */
function onPath(env: MovingLoadEnvelope, pos: number): { elementId: number; x: number; y: number } | null {
  const total = env.path[env.path.length - 1].cumStart + env.path[env.path.length - 1].length;
  if (pos < 0 || pos > total) return null;
  const seg = env.path.find((s) => pos >= s.cumStart && pos <= s.cumStart + s.length)!;
  const from = modelStore.nodes.get(seg.nodeI)!;
  const f = (pos - seg.cumStart) / seg.length;
  return { elementId: seg.elementId, x: from.x + f * seg.dx, y: from.y + f * seg.dy };
}

function reversed(train: LoadTrain): LoadTrain {
  const mo = Math.max(...train.axles.map((a) => a.offset));
  return { name: train.name, axles: train.axles.map((a) => ({ offset: mo - a.offset, weight: a.weight })) };
}

/**
 * Every position's reactions against the static solve of the train standing there.
 * An asymmetric train is swept forward and then reversed; `step` tells where one ends.
 */
function expectPositionsMatchStatic(env: MovingLoadEnvelope, train: LoadTrain, step: number) {
  const W = train.axles.reduce((s, a) => s + a.weight, 0);
  const total = env.path[env.path.length - 1].cumStart + env.path[env.path.length - 1].length;
  const maxOff = Math.max(...train.axles.map((a) => a.offset));
  let nForward = 0;
  for (let r = -maxOff; r <= total; r += step) nForward++;
  for (const [i, p] of env.positions.entries()) {
    const loads: Load[] = [];
    for (const ax of (i < nForward ? train : reversed(train)).axles) {
      const at = onPath(env, p.refPosition + ax.offset);
      if (at) loads.push(...forceAt(at.elementId, at.x, at.y, ax.weight));
    }
    if (loads.length === 0) continue;
    const st = staticWith(loads);
    for (const r of st.reactions) {
      const o = p.results.reactions.find((x) => x.nodeId === r.nodeId)!;
      expect(Math.abs(o.rx - r.rx)).toBeLessThan(1e-6 * W);
      expect(Math.abs(o.rz - r.rz)).toBeLessThan(1e-6 * W);
      expect(Math.abs(o.my - r.my)).toBeLessThan(1e-6 * W * 10);
    }
  }
}

const oneAxle: LoadTrain = { name: '100', axles: [{ offset: 0, weight: 100 }] };
const truck: LoadTrain = { name: 'truck', axles: [{ offset: 0, weight: 35 }, { offset: 4.3, weight: 145 }, { offset: 8.6, weight: 145 }] };

describe('moving load: members drawn in either direction (D4)', () => {
  it('a 10 m span drawn right to left: the left reaction reaches 100 and never pulls; M = W·L/4', () => {
    build(() => { const a = N(0, 0), b = N(10, 0); El(b, a); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); });
    const env = solveMovingLoads(inputNow(), { train: oneAxle, step: 0.25 }) as MovingLoadEnvelope;
    expect(typeof env).toBe('object');
    const rz = env.positions.map((p) => p.results.reactions.find((r) => r.nodeId === 1)!.rz);
    expect(Math.max(...rz)).toBeCloseTo(100, 6);
    expect(Math.min(...rz)).toBeGreaterThan(-1e-6);
    // Right to left the axle at ref x must give Rz(left) = W·(1 − x/10).
    for (const p of env.positions) {
      const rl = p.results.reactions.find((r) => r.nodeId === 1)!.rz;
      expect(rl).toBeCloseTo(100 * (1 - p.refPosition / 10), 6);
    }
    const m = env.fullEnvelope!.moment.elements[0];
    expect(Math.max(...m.posValues.map(Math.abs), ...m.negValues.map(Math.abs))).toBeCloseTo(250, 6);
  });

  it('a gable with its left rafter drawn downhill and a continuous beam drawn both ways: every position is the static solve', () => {
    build(() => {
      const a = N(0, 0), b = N(5, 2), c = N(10, 0);
      El(b, a); El(b, c);
      modelStore.addSupport(a, 'pinned'); modelStore.addSupport(c, 'pinned');
    });
    let env = solveMovingLoads(inputNow(), { train: truck, step: 0.5 }) as MovingLoadEnvelope;
    expect(typeof env).toBe('object');
    expectPositionsMatchStatic(env, truck, 0.5);

    build(() => {
      const n = [0, 4, 8, 12].map((x) => N(x, 0));
      El(n[0], n[1]); El(n[2], n[1]); El(n[3], n[2]);
      modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[1], 'rollerX'); modelStore.addSupport(n[2], 'rollerX'); modelStore.addSupport(n[3], 'rollerX');
    });
    env = solveMovingLoads(inputNow(), { train: truck, step: 0.5 }) as MovingLoadEnvelope;
    expectPositionsMatchStatic(env, truck, 0.5);
  });

  it('the async sweep places the axles the same way', async () => {
    build(() => { const a = N(0, 0), b = N(10, 0); El(b, a); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); });
    const env = await solveMovingLoadsAsync(inputNow(), { train: truck, step: 1 }) as MovingLoadEnvelope;
    expect(typeof env).toBe('object');
    expectPositionsMatchStatic(env, truck, 1);
  });
});

/** A 12 m Warren truss, bottom chord drawn alternately forwards and backwards. */
function warren() {
  build(() => {
    const b = [0, 3, 6, 9, 12].map((x) => N(x, 0));
    const t = [1.5, 4.5, 7.5, 10.5].map((x) => N(x, 2));
    El(b[0], b[1], 'truss'); El(b[2], b[1], 'truss'); El(b[2], b[3], 'truss'); El(b[4], b[3], 'truss');
    for (let i = 0; i < 3; i++) El(t[i + 1], t[i], 'truss');
    for (let i = 0; i < 4; i++) { El(b[i], t[i], 'truss'); El(t[i], b[i + 1], 'truss'); }
    modelStore.addSupport(b[0], 'pinned'); modelStore.addSupport(b[4], 'rollerX');
  });
}

describe('truss bars carry the load through their nodes (D18)', () => {
  it('a train on the bottom chord of a truss: R_left = ΣW·(1 − x/L), and every position is the static solve', () => {
    warren();
    const chord = [1, 2, 3, 4];
    const env = solveMovingLoads(inputNow(), { train: truck, step: 0.5, pathElementIds: chord }) as MovingLoadEnvelope;
    expect(typeof env).toBe('object');
    expectPositionsMatchStatic(env, truck, 0.5);
    for (const p of env.positions.slice(0, 20)) {
      let want = 0;
      for (const ax of truck.axles) { const x = p.refPosition + ax.offset; if (x >= 0 && x <= 12) want += ax.weight * (1 - x / 12); }
      expect(p.results.reactions.find((r) => r.nodeId === 1)!.rz).toBeCloseTo(want, 6);
    }
  });

  it('the influence line of a truss reaction is 1 − x/L on every bar, chords and diagonals', () => {
    warren();
    const il = computeInfluenceLine(modelStore.model as never, 'Rz', 1) as { points: Array<{ x: number; value: number }> };
    expect(typeof il).toBe('object');
    for (const p of il.points) expect(p.value).toBeCloseTo(1 - p.x / 12, 9);
  });

  it('a king-post beam: M at midspan of the beam under a load on the post line — Müller-Breslau on frames and bars alike', () => {
    build(() => {
      const a = N(0, 0), m = N(4, 0), b = N(8, 0), k = N(4, -1.5);
      El(a, m); El(b, m); El(a, k, 'truss'); El(k, b, 'truss'); El(m, k, 'truss');
      modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    });
    for (const [q, node, elem] of [['M', undefined, 1], ['Rz', 3, undefined]] as const) {
      const il = computeInfluenceLine(modelStore.model as never, q, node, elem, 0.5) as { points: Array<{ x: number; y: number; value: number; elementId: number }> };
      for (const p of il.points) {
        const st = staticWith(forceAt(p.elementId, p.x, p.y, 1));
        const want = q === 'M'
          ? computeDiagramValueAt('moment', 0.5, st.elementForces.find((f) => f.elementId === 1)!)
          : st.reactions.find((r) => r.nodeId === 3)!.rz;
        expect(p.value).toBeCloseTo(want, 8);
      }
    }
  });
});

describe('influence line: the static solve\'s structure, a unit load and nothing else (D5, D7)', () => {
  it('a settled two-span beam with thermal and gravity loads: Rz is 1 at its own support and 0 at the others', () => {
    build(() => {
      const a = N(0, 0), b = N(5, 0), c = N(10, 0); const e1 = El(a, b); El(b, c);
      modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX', undefined, { dz: -0.01 }); modelStore.addSupport(c, 'rollerX');
      modelStore.addDistributedLoad(e1, -10); modelStore.addThermalLoad(e1, 30, 20);
    });
    const il = computeInfluenceLine(modelStore.model as never, 'Rz', 2) as { points: Array<{ x: number; value: number }> };
    const at = (x: number) => il.points.find((p) => Math.abs(p.x - x) < 1e-9)!.value;
    expect(at(0)).toBeCloseTo(0, 9); expect(at(5)).toBeCloseTo(1, 9); expect(at(10)).toBeCloseTo(0, 9);
  });

  it('a rotated IPN span and a 30° roller: Rz, Rx, M and V ordinates equal the static solve under a unit load', () => {
    build(() => {
      const a = N(0, 0), b = N(5, 0), c = N(10, 0); El(a, b); const e2 = El(b, c);
      const { id: _id, canonical: _c, ...ipn } = modelStore.sections.get(1)! as never as Record<string, unknown>;
      void _id; void _c;
      const rot = modelStore.addSection({ ...ipn, name: 'IPN 300 90°', rotation: 90 } as never);
      modelStore.updateElement(e2, { sectionId: rot });
      modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); modelStore.addSupport(c, 'rollerX', undefined, { angle: 30 });
    });
    const targets = [['Rz', 2, undefined], ['Rx', 1, undefined], ['Rz', 3, undefined], ['M', undefined, 1], ['V', undefined, 2]] as const;
    let rxPeak = 0;
    for (const [q, node, elem] of targets) {
      const il = computeInfluenceLine(modelStore.model as never, q, node, elem, 0.5) as { points: Array<{ x: number; y: number; value: number; elementId: number; t: number }> };
      for (const p of il.points.filter((_, i) => i % 3 === 0)) {
        const st = staticWith(forceAt(p.elementId, p.x, p.y, 1));
        const want = q === 'M' || q === 'V'
          ? computeDiagramValueAt(q === 'M' ? 'moment' : 'shear', 0.5, st.elementForces.find((f) => f.elementId === elem)!)
          : q === 'Rx' ? st.reactions.find((r) => r.nodeId === node)!.rx : st.reactions.find((r) => r.nodeId === node)!.rz;
        expect(p.value).toBeCloseTo(want, 8);
        if (q === 'Rx') rxPeak = Math.max(rxPeak, Math.abs(p.value));
      }
    }
    // The inclined roller's thrust shows in the pin's horizontal reaction.
    expect(rxPeak).toBeGreaterThan(0.05);
  });
});

describe('mechanisms are refused before the sweep (D14, D15)', () => {
  const twoHinges = () => { const n = [0, 2, 4, 6].map((x) => N(x, 0)); const e1 = El(n[0], n[1]); El(n[1], n[2]); const e3 = El(n[2], n[3]); modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[3], 'rollerX'); modelStore.toggleHinge(e1, 'end'); modelStore.toggleHinge(e3, 'start'); };
  const hingedAtFixed = () => { const a = N(0, 0), b = N(4, 0); const e = El(a, b); modelStore.addSupport(a, 'fixed'); modelStore.toggleHinge(e, 'start'); };
  const squareTruss = () => { const n = [N(0, 0), N(3, 0), N(3, 3), N(0, 3)]; for (let i = 0; i < 4; i++) El(n[i], n[(i + 1) % 4], 'truss'); modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[1], 'rollerX'); };

  it.each([['beam with two internal hinges', twoHinges], ['member hinged at its fixed support', hingedAtFixed], ['square truss without a diagonal', squareTruss]] as const)(
    '%s: the influence line refuses with the static solve\'s message, the moving load with the kinematic diagnosis', async (_n, fn) => {
      build(fn);
      const staticMsg = validateAndSolve2D({ ...modelStore.model, loads: [] } as never, false);
      expect(typeof staticMsg).toBe('string');
      const il = computeInfluenceLine(modelStore.model as never, 'Rz', [...modelStore.supports.values()][0].nodeId);
      expect(il).toBe(staticMsg);
      expect(il as string).not.toMatch(/undefined/);

      const diagnosis = analyzeKinematics(inputNow()).diagnosis;
      expect(solveMovingLoads(inputNow(), { train: oneAxle, step: 0.5 })).toBe(diagnosis);
      expect(await solveMovingLoadsAsync(inputNow(), { train: oneAxle, step: 0.5 })).toBe(diagnosis);
    });

  it('errorText reads a thrown string as well as an Error', () => {
    expect(errorText('Singular stiffness matrix')).toBe('Singular stiffness matrix');
    expect(errorText(new Error('boom'))).toBe('boom');
    expect(errorText({})).toBe('[object Object]');
  });
});
