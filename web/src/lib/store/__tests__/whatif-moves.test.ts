/**
 * "What if?" moves things, not only scales them: a point load along its member, a nodal load to
 * another node, a support to another node, a node (and the members meeting it) to another place.
 * Each is checked against the statics of a simply supported beam, and none survives leaving.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { modelStore, historyStore, uiStore } from '..';
import { whatIf } from '../whatif.svelte';
import { loadLabel } from '../../whatif/load-label';
import { response2D, response3D } from '../../whatif/response';

const P = -12;
let n1 = 0, n2 = 0, n3 = 0, m1 = 0, m2 = 0, s1 = 0, s3 = 0;

function beam() {
  n1 = modelStore.addNode(0, 0);
  n2 = modelStore.addNode(4, 0);
  n3 = modelStore.addNode(8, 0);
  m1 = modelStore.addElement(n1, n2);
  m2 = modelStore.addElement(n2, n3);
  s1 = modelStore.addSupport(n1, 'pinned');
  s3 = modelStore.addSupport(n3, 'rollerX');
}

function solve() {
  const r = modelStore.solve();
  if (!r || typeof r === 'string') throw new Error(String(r));
  return r;
}
const rz = (r: ReturnType<typeof solve>, node: number) => r.reactions.find((x) => x.nodeId === node)?.rz ?? 0;
const settle = () => vi.advanceTimersByTime(40);

beforeEach(() => {
  whatIf.abandon();
  historyStore.clear();
  modelStore.clear();
  uiStore.analysisMode = '2d';
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  beam();
});
afterEach(() => {
  whatIf.abandon();
  vi.clearAllTimers();
  vi.useRealTimers();
  modelStore.clear();
});

describe('moving a point load along its member', () => {
  it('carries the reactions with it: R₁ = P(L − x)/L', () => {
    modelStore.addPointLoadOnElement(m1, 1, P);
    whatIf.open();
    expect(rz(solve(), n1)).toBeCloseTo(-P * 7 / 8, 9);
    whatIf.setLoadAt(0, 3);
    settle();
    expect((modelStore.model.loads[0].data as { a: number }).a).toBe(3);
    const r = solve();
    expect(rz(r, n1)).toBeCloseTo(-P * 5 / 8, 9);
    expect(rz(r, n3)).toBeCloseTo(-P * 3 / 8, 9);
  });

  it('stays on its member: a distance past the end lands on the end', () => {
    modelStore.addPointLoadOnElement(m1, 1, P);
    whatIf.open();
    whatIf.setLoadAt(0, 99);
    settle();
    expect((modelStore.model.loads[0].data as { a: number }).a).toBeCloseTo(4, 12);
  });
});

describe('moving a nodal load to another node', () => {
  it('loads the new node and leaves the old one free', () => {
    modelStore.addNodalLoad(n2, 0, P);
    whatIf.open();
    expect(rz(solve(), n1)).toBeCloseTo(-P / 2, 9);
    whatIf.setLoadNode(0, n3);
    settle();
    const r = solve();
    expect(rz(r, n1)).toBeCloseTo(0, 9);
    expect(rz(r, n3)).toBeCloseTo(-P, 9);
  });
});

describe('moving a support to another node', () => {
  it('turns the beam into one with an overhang: the statics of the new span', () => {
    modelStore.addNodalLoad(n3, 0, P);
    whatIf.open();
    whatIf.setSupportNode(s3, n2);
    settle();
    expect([...modelStore.supports.values()].map((s) => s.nodeId).sort()).toEqual([n1, n2].sort());
    const r = solve();
    // Tip load P at 8 m, supports at 0 and 4 m: R₂ = 2P up, R₁ = P down.
    expect(rz(r, n2)).toBeCloseTo(-2 * P, 9);
    expect(rz(r, n1)).toBeCloseTo(P, 9);
  });

  it('never puts two supports on one node', () => {
    whatIf.open();
    whatIf.setSupportNode(s3, n1);
    settle();
    expect([...modelStore.supports.values()].map((s) => s.nodeId).sort()).toEqual([n1, n3].sort());
    expect(modelStore.supports.get(s1)?.nodeId).toBe(n1);
  });
});

describe('moving a node', () => {
  it('moves the members that meet it, and the change is gone on reset', () => {
    whatIf.open();
    whatIf.setNodeShift(n2, 1, 1.5);
    settle();
    expect(modelStore.nodes.get(n2)).toMatchObject({ x: 4, y: 1.5 });
    whatIf.setNodeShift(n2, 0, -1);
    settle();
    expect(modelStore.nodes.get(n2)).toMatchObject({ x: 3, y: 1.5 });
    expect(whatIf.changed).toBe(true);
    whatIf.reset();
    settle();
    expect(modelStore.nodes.get(n2)).toMatchObject({ x: 4, y: 0 });
    expect(whatIf.changed).toBe(false);
  });
});

describe('leaving', () => {
  it('puts back every load, support and node as they were', async () => {
    modelStore.addPointLoadOnElement(m1, 1, P);
    modelStore.addNodalLoad(n2, 0, P);
    whatIf.open();
    whatIf.setLoadAt(0, 2);
    whatIf.setLoadNode(1, n3);
    whatIf.setSupportNode(s3, n2);
    whatIf.setNodeShift(n2, 1, 1);
    settle();
    uiStore.liveCalc = true;
    await whatIf.close();
    expect((modelStore.model.loads[0].data as { a: number }).a).toBe(1);
    expect((modelStore.model.loads[1].data as { nodeId: number }).nodeId).toBe(n2);
    expect(modelStore.supports.get(s3)?.nodeId).toBe(n3);
    expect(modelStore.nodes.get(n2)).toMatchObject({ x: 4, y: 0 });
  });
});

describe('the response the panel compares', () => {
  it('finds a span load\'s peak moment inside the member, not at its ends', () => {
    modelStore.addDistributedLoad(m1, -10);
    const r = solve();
    const m = response2D(r).moment;
    // q on the left half of an 8 m simple span: the shear is zero at x = R₁/q = 3 m, where M = R₁²/2q.
    const R1 = 10 * 4 * 6 / 8;
    expect(m).toBeCloseTo(R1 * R1 / (2 * 10), 6);
    const ends = Math.max(...r.elementForces.flatMap((ef) => [Math.abs(ef.mStart), Math.abs(ef.mEnd)]));
    expect(m).toBeGreaterThan(ends);
  });
});

describe('carrying a nodal load or a support along a member', () => {
  it('a nodal load anywhere along a member: R₁ = P(L − x)/L at x = 5 m', () => {
    modelStore.addNodalLoad(n2, 0, P);
    whatIf.open();
    whatIf.setLoadAlong(0, m2, 0.25);
    settle();
    const at = (modelStore.model.loads[0].data as { nodeId: number }).nodeId;
    expect(modelStore.nodes.get(at)).toMatchObject({ x: 5, y: 0 });
    const r = solve();
    expect(rz(r, n1)).toBeCloseTo(-P * 3 / 8, 9);
    expect(rz(r, n3)).toBeCloseTo(-P * 5 / 8, 9);
  });

  it('a support anywhere along a member: the beam gains an overhang where it was cut', () => {
    modelStore.addNodalLoad(n2, 0, P);
    whatIf.open();
    whatIf.setSupportAlong(s3, m1, 0.5);
    settle();
    const at = modelStore.supports.get(s3)!.nodeId;
    expect(modelStore.nodes.get(at)).toMatchObject({ x: 2, y: 0 });
    // Supports at 0 and 2 m, load at 4 m: R(2) = 2P up, R(0) = P down.
    const r = solve();
    expect(rz(r, at)).toBeCloseTo(-2 * P, 9);
    expect(rz(r, n1)).toBeCloseTo(P, 9);
  });

  it('choosing a node again takes it off the member, and leaving puts every member back whole', async () => {
    modelStore.addNodalLoad(n2, 0, P);
    const members = modelStore.elements.size;
    whatIf.open();
    whatIf.setLoadAlong(0, m1, 0.5);
    settle();
    expect(modelStore.elements.size).toBe(members + 1);
    whatIf.setLoadNode(0, n3);
    settle();
    expect(modelStore.elements.size).toBe(members);
    expect((modelStore.model.loads[0].data as { nodeId: number }).nodeId).toBe(n3);
    whatIf.setSupportAlong(s3, m1, 0.5);
    settle();
    uiStore.liveCalc = true;
    await whatIf.close();
    expect(modelStore.elements.size).toBe(members);
    expect(modelStore.supports.get(s3)?.nodeId).toBe(n3);
  });
});

describe('what the canvas shows', () => {
  it('loads drawn over the results while the session wants them, and the reader\'s own setting back on leaving', async () => {
    uiStore.showLoads = false;
    uiStore.hideLoadsWithDiagram = true;
    whatIf.open();
    expect(whatIf.loadsShown).toBe(false);
    whatIf.showLoads(true);
    expect(whatIf.loadsShown).toBe(true);
    expect(uiStore.hideLoadsWithDiagram).toBe(false);
    uiStore.liveCalc = true;
    await whatIf.close();
    expect(uiStore.showLoads).toBe(false);
    expect(uiStore.hideLoadsWithDiagram).toBe(true);
  });
});

for (const workspace of ['2d', '3d'] as const) {
  it(`applies support destinations together in ${workspace}`, () => {
    uiStore.analysisMode = workspace;
    whatIf.open();
    whatIf.setSupportNode(s3, n2);
    settle();
    whatIf.setSupportNode(s1, n3);
    settle();
    expect(modelStore.supports.get(s1)?.nodeId).toBe(n3);
    expect(modelStore.supports.get(s3)?.nodeId).toBe(n2);
  });

  it(`relocates an untouched point load after shortening its member in ${workspace}`, () => {
    uiStore.analysisMode = workspace;
    if (workspace === '2d') modelStore.addPointLoadOnElement(m1, 3, P);
    else modelStore.addLoadEntry({ type: 'pointOnElement3d', data: { id: 1, elementId: m1, a: 3, py: 0, pz: P } });
    whatIf.open();
    whatIf.setNodeShift(n2, 0, -2);
    settle();
    expect(modelStore.loads[0].data).toMatchObject({ a: 2 });
  });

  it(`keeps the last valid support location on an occupied destination in ${workspace}`, () => {
    uiStore.analysisMode = workspace;
    whatIf.open();
    whatIf.setSupportNode(s3, n2);
    settle();
    const count = uiStore.toasts.length;
    whatIf.setSupportNode(s1, n2);
    settle();
    expect(uiStore.toasts.length).toBe(count + 1);
    expect(modelStore.supports.get(s1)?.nodeId).toBe(n1);
    expect(modelStore.supports.get(s3)?.nodeId).toBe(n2);
  });

  for (const t of [0, 1e-9, 1 - 1e-9, 1]) {
    it(`refuses an unsplittable station ${t} in ${workspace}`, () => {
      uiStore.analysisMode = workspace;
      whatIf.open();
      const count = uiStore.toasts.length;
      whatIf.setSupportAlong(s3, m1, t);
      settle();
      expect(uiStore.toasts.length).toBe(count + 1);
      expect(modelStore.elements.size).toBe(2);
      expect(modelStore.supports.get(s3)?.nodeId).toBe(n3);
    });
  }

  for (const t of [2e-9, 0.01, 0.5, 0.99, 1 - 2e-9]) {
    it(`keeps disconnected nodes separate at station ${t} in ${workspace}`, () => {
      uiStore.analysisMode = workspace;
      const x = t * 4;
      const nearby = modelStore.addNode(x, 0.005);
      modelStore.addElement(nearby, modelStore.addNode(x + 4, 0.005));
      if (workspace === '2d') modelStore.addNodalLoad(n2, 0, P);
      else modelStore.addNodalLoad3D(n2, 0, 0, P, 0, 0, 0);
      whatIf.open();
      whatIf.setLoadAlong(0, m1, t);
      whatIf.setSupportAlong(s3, m1, t);
      settle();
      const cut = modelStore.elements.get(m1)!.nodeJ;
      expect(cut).not.toBe(nearby);
      expect(modelStore.nodes.get(cut)).toMatchObject({ x, y: 0 });
      expect(modelStore.loads[0].data).toMatchObject({ nodeId: cut });
      expect(modelStore.supports.get(s3)?.nodeId).toBe(cut);
    });
  }
}

it('identifies the node and the member load components in the current units', () => {
  modelStore.addNodalLoad3D(n2, 2, 0, 0, 0, 0, 0);
  modelStore.addDistributedLoad3D(m1, 3, 4, 5, 6);
  expect(loadLabel(modelStore.loads[0], 0)).toContain(`(N${n2})`);
  const distributed = loadLabel(modelStore.loads[1], 1);
  expect(distributed).toContain(`(B${m1})`);
  for (const value of [3, 4, 5, 6]) expect(distributed).toContain(String(value));
  expect(distributed).toContain('/m');
});

it('summarizes the orthogonal components of a space cantilever', () => {
  modelStore.clear();
  uiStore.analysisMode = '3d';
  const fixed = modelStore.addNode(0, 0, 0);
  const tip = modelStore.addNode(4, 0, 0);
  modelStore.addElement(fixed, tip);
  modelStore.addSupport(fixed, 'fixed3d');
  modelStore.addNodalLoad3D(tip, 0, 3, 4, 0, 0, 0);
  const result = modelStore.solve3D();
  if (!result || typeof result === 'string') throw new Error(String(result));
  const shown = response3D(result);
  expect(shown.shear).toBeCloseTo(4, 9);
  expect(shown.moment).toBeCloseTo(4 * 4, 9);
  expect(shown.reaction).toBeCloseTo(Math.hypot(3, 4), 9);
});
