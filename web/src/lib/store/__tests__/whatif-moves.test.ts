/**
 * "What if?" moves things, not only scales them: a point load along its member, a nodal load to
 * another node, a support to another node, a node (and the members meeting it) to another place.
 * Each is checked against the statics of a simply supported beam, and none survives leaving.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { modelStore, historyStore, uiStore } from '..';
import * as calc from '../../engine/live-calc';
import { resultsStore } from '..';
import { render } from 'svelte/server';
import WhatIfPanel from '../../../components/WhatIfPanel.svelte';
import { i18n, setLocale } from '../../i18n';
import { whatIf } from '../whatif.svelte';
import { displayUnits } from '../display-units.svelte';
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

it.each([0, 1e-13])('shows every solved quantity for a tip load of %s', force => {
  modelStore.addNodalLoad(n2, 0, force);
  whatIf.open();
  resultsStore.setResults(solve());
  const html = render(WhatIfPanel).body;
  for (const key of ['delta', 'moment', 'shear', 'axial', 'reaction']) expect(html).toContain(`data-testid="whatif-resp-${key}"`);
  expect(html).toMatch(/class="wif-now[^"]*"[^>]*>0[.0]* kN/);
  if (force !== 0) expect(html).toMatch(/class="wif-now[^"]*"[^>]*>[1-9][^<]*E-\d+ kN/);
});

it('formats a response change with the active French percent convention', () => {
  const originalLocale = i18n.locale;
  try {
    setLocale('fr');
    modelStore.addNodalLoad(n2, 0, P);
    resultsStore.setResults(solve());
    whatIf.open();
    whatIf.setLoadFactor(0, 1.015);
    settle();
    resultsStore.setResults(solve());
    expect(render(WhatIfPanel).body).toContain(new Intl.NumberFormat('fr', { style: 'percent', maximumFractionDigits: 1 }).format(0.015));
  } finally {
    setLocale(originalLocale);
  }
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
  it.each([['2d', false], ['3d', false], ['pro', false], ['pro', true]] as const)('re-solves the restored model after placement fails in %s with live=%s', async (mode, live) => {
    uiStore.analysisMode = mode;
    uiStore.liveCalc = live;
    const run = vi.spyOn(calc, 'runLiveCalc').mockResolvedValue();
    const split = vi.spyOn(modelStore, 'splitMember').mockReturnValue(null);
    try {
      whatIf.open();
      whatIf.setSupportAlong(s3, m1, 0.5);
      settle();
      await vi.waitFor(() => expect(run).toHaveBeenCalledWith(mode, uiStore.axisConvention3D));
      expect(whatIf.active).toBe(false);
      expect(uiStore.liveCalc).toBe(live);
      expect(modelStore.supports.get(s3)?.nodeId).toBe(n3);
    } finally {
      run.mockRestore();
      split.mockRestore();
    }
  });

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
  it(`preserves an out-of-member baseline station on entry, unrelated edits and reset in ${workspace}`, () => {
    uiStore.analysisMode = workspace;
    if (workspace === '2d') modelStore.addPointLoadOnElement(m1, 6, P);
    else modelStore.addPointLoadOnElement3D(m1, 6, 0, P);
    whatIf.open();
    settle();
    expect(modelStore.loads[0].data).toMatchObject({ a: 6 });
    whatIf.setNodeShift(n3, 0, 1);
    settle();
    expect(modelStore.loads[0].data).toMatchObject({ a: 6 });
    whatIf.setLoadAt(0, 2);
    settle();
    expect(modelStore.loads[0].data).toMatchObject({ a: 2 });
    whatIf.reset();
    settle();
    expect(modelStore.loads[0].data).toMatchObject({ a: 6 });
  });

  it(`returning placements to their original values clears changed in ${workspace}`, () => {
    uiStore.analysisMode = workspace;
    if (workspace === '2d') {
      modelStore.addPointLoadOnElement(m1, 1, P);
      modelStore.addNodalLoad(n2, 0, P);
    } else {
      modelStore.addPointLoadOnElement3D(m1, 1, 0, P);
      modelStore.addNodalLoad3D(n2, 0, 0, P, 0, 0, 0);
    }
    whatIf.open();
    const baseline = { ...modelStore.elements.get(m1)!.releaseI };
    for (const [away, back] of [
      [() => { whatIf.setLoadAt(0, 2); settle(); expect(modelStore.loads[0].data).toMatchObject({ a: 2 }); },
        () => { whatIf.setLoadAt(0, 1); settle(); expect(modelStore.loads[0].data).toMatchObject({ a: 1 }); }],
      [() => { whatIf.setLoadNode(1, n3); settle(); expect(modelStore.loads[1].data).toMatchObject({ nodeId: n3 }); },
        () => { whatIf.setLoadNode(1, n2); settle(); expect(modelStore.loads[1].data).toMatchObject({ nodeId: n2 }); }],
      [() => whatIf.setRelease(m1, 'i', { ...baseline, my: !baseline.my }), () => whatIf.setRelease(m1, 'i', baseline)],
      [() => whatIf.setSupportAlong(s1, m1, 0.5), () => whatIf.setSupportNode(s1, n1)],
      [() => whatIf.setSupportType(s1, 'fixed'), () => whatIf.setSupportType(s1, 'pinned')],
    ]) {
      away(); settle();
      expect(whatIf.changed).toBe(true);
      back(); settle();
      expect(whatIf.changed).toBe(false);
    }
  });

  it(`shows loads when the diagram is off in ${workspace}`, () => {
    uiStore.analysisMode = workspace;
    uiStore.showLoads = uiStore.showLoads3D = true;
    uiStore.hideLoadsWithDiagram = true;
    expect(whatIf.loadsShown).toBe(true);
  });

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
  const before = uiStore.unitSystem;
  try {
    uiStore.unitSystem = 'SI';
    expect(loadLabel(modelStore.loads[1], 1)).toBe(`qy=3.00→4.00 kN/m, qz=5.00→6.00 kN/m (B${m1})`);
    uiStore.unitSystem = 'Imperial';
    expect(loadLabel(modelStore.loads[1], 1)).toBe(`qy=0.2056→0.2741 kip/ft, qz=0.3426→0.4111 kip/ft (B${m1})`);
  } finally {
    uiStore.unitSystem = before;
  }
});

it('summarizes the transverse resultants of a space cantilever', () => {
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
  expect(shown.shear).toBeCloseTo(Math.hypot(3, 4), 9);
  expect(shown.moment).toBeCloseTo(4 * Math.hypot(3, 4), 9);
  expect(shown.reaction).toBeCloseTo(Math.hypot(3, 4), 9);
  const member = { ...result.elementForces[0], length: 1, myStart: 1 - 0.25 ** 2, mzStart: 1 - 0.75 ** 2,
    vzStart: 0.5, vyStart: -1.5, qZI: -2, qZJ: -2, qYI: 2, qYJ: 2 };
  expect(response3D({ ...result, elementForces: [member] }).moment).toBeCloseTo(Math.SQRT2 * (1 - 0.25 ** 2), 12);
});

it('labels the zero maximum nodal displacement of a loaded single span', async () => {
  await modelStore.loadExample('simply-supported');
  whatIf.open();
  const result = solve();
  expect(result.elementForces).toHaveLength(1);
  expect(response2D(result).moment).toBeGreaterThan(0);
  expect(response2D(result).delta).toBe(0);
  resultsStore.setResults(result);
  expect(render(WhatIfPanel).body).toMatch(/nodal/i);
});

it('shows a nonzero displacement at two fixed display decimals', () => {
  modelStore.addNodalLoad(n2, 0, -1e-8);
  whatIf.open();
  resultsStore.setResults(solve());
  displayUnits.setDecimals('displacement', 2);
  try {
    expect(render(WhatIfPanel).body.match(/data-testid="whatif-resp-delta"[\s\S]*?<td class="wif-now[^>]*>(.*?)<\/td>/)?.[1]).toMatch(/E-/i);
  } finally {
    displayUnits.setDecimals('displacement', null);
  }
});
