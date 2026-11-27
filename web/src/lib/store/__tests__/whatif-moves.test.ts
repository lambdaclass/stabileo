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
import WhatIfMembers from '../../../components/whatif/WhatIfMembers.svelte';
import WhatIfPanel from '../../../components/WhatIfPanel.svelte';
import { i18n, setLocale } from '../../i18n';
import { whatIf } from '../whatif.svelte';
import { fmtQ, unitQ, displayUnits } from '../display-units.svelte';
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
    for (const factor of [1.015, 1.004, 0.996]) {
      whatIf.setLoadFactor(0, factor);
      settle();
      resultsStore.setResults(solve());
      expect(render(WhatIfPanel).body).toContain(new Intl.NumberFormat('fr', { style: 'percent', maximumFractionDigits: 1 }).format(Math.abs(factor - 1)));
    }
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
  it.each([['2d', false], ['3d', false], ['pro', false], ['pro', true]] as const)('keeps independent edits after a failed split and re-solves on exit in %s with live=%s', async (mode, live) => {
    uiStore.analysisMode = mode;
    uiStore.liveCalc = live;
    const run = vi.spyOn(calc, 'runLiveCalc').mockResolvedValue();
    const split = vi.spyOn(modelStore, 'splitMember').mockReturnValue(null);
    try {
      whatIf.open();
      whatIf.setMember(m2, 'e', 2);
      whatIf.setSupportAlong(s3, m1, 0.5);
      settle();
      expect(whatIf.active).toBe(true);
      expect(whatIf.memberFactors(m2).e).toBe(2);
      expect(whatIf.supportAlong[s3]).toBeUndefined();
      expect(modelStore.supports.get(s3)?.nodeId).toBe(n3);
      await whatIf.close();
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
    const support = modelStore.supports.get(s1)!.type;
    for (const [away, back] of [
      [() => { whatIf.setLoadAt(0, 2); settle(); expect(modelStore.loads[0].data).toMatchObject({ a: 2 }); },
        () => { whatIf.setLoadAt(0, 1); settle(); expect(modelStore.loads[0].data).toMatchObject({ a: 1 }); }],
      [() => { whatIf.setLoadNode(1, n3); settle(); expect(modelStore.loads[1].data).toMatchObject({ nodeId: n3 }); },
        () => { whatIf.setLoadNode(1, n2); settle(); expect(modelStore.loads[1].data).toMatchObject({ nodeId: n2 }); }],
      [() => whatIf.setRelease(m1, 'i', { ...baseline, my: !baseline.my }), () => whatIf.setRelease(m1, 'i', baseline)],
      [() => whatIf.setSupportAlong(s1, m1, 0.5), () => whatIf.setSupportNode(s1, n1)],
      [() => whatIf.setSupportType(s1, workspace === '2d' ? 'fixed' : 'fixed3d'), () => whatIf.setSupportType(s1, support)],
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
  const peak = Math.SQRT2 * (1 - 0.25 ** 2);
  expect(response3D({ ...result, elementForces: [member] }).moment).toBeCloseTo(peak, 12);
  const constant = { ...member, vyStart: 0, vzStart: 0, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, myStart: 10, mzStart: 10 };
  const pair = { ...constant, combined: { method: 'abs' as const, parts: [constant, { ...constant, mzStart: -10 }] } };
  resultsStore.setResults3D(result);
  whatIf.open();
  resultsStore.setResults3D({ ...result, elementForces: [pair] });
  expect(response3D(resultsStore.results3D!).moment).toBeCloseTo(Math.hypot(20, 20), 12);
  const shearCase = { ...constant, vyStart: 10, vzStart: 10 };
  const shearPair = { ...shearCase, combined: { method: 'abs' as const, parts: [shearCase, { ...shearCase, vzStart: -10 }] } };
  resultsStore.setResults3D({ ...result, elementForces: [shearPair] });
  expect(response3D(resultsStore.results3D!).shear).toBeCloseTo(Math.hypot(20, 20), 12);
  const html = render(WhatIfPanel).body;
  expect(html).toMatch(/Upper bound on resultant moment/);
  expect(html).toMatch(/Upper bound on resultant shear/);
  const momentRow = html.split('data-testid="whatif-resp-moment"')[1].split('</tr>')[0];
  expect(momentRow).toMatch(/resultant moment/i);
  expect(momentRow).not.toMatch(/[▲▼]/);
  for (const method of ['abs', 'srss'] as const) {
    const combined = { ...member, combined: { method, parts: [member, member] } };
    expect(response3D({ ...result, elementForces: [combined] }).moment)
      .toBeCloseTo((method === 'abs' ? 2 : Math.SQRT2) * peak, 12);
    const piece = { ...member, pieces: [{ x0: 0, x1: member.length, sectionId: 1, forces: combined }] };
    for (const ef of [combined, piece]) expect.soft(response3D({ ...result, elementForces: [ef] }).componentEnvelopeBound, method).toBe(true);
    const nested = { ...member, combined: { method, parts: [member, combined] } };
    const bounds = response3D({ ...result, elementForces: [nested] });
    for (const key of ['moment', 'shear'] as const) {
      expect(Number.isFinite(bounds[key])).toBe(true);
      const exact = response3D({ ...result, elementForces: [member] })[key];
      expect(bounds[key]).toBeGreaterThanOrEqual(exact * (method === 'abs' ? 3 : Math.sqrt(3)));
      for (const forces of [[nested, constant], [constant, nested]]) {
        const mixed = response3D({ ...result, elementForces: forces });
        expect(mixed[key]).toBe(Math.max(bounds[key], response3D({ ...result, elementForces: [constant] })[key]));
        expect(mixed.componentEnvelopeBound).toBe(true);
      }
    }
  }
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

it('labels the zero maximum nodal displacement of a loaded space span', () => {
  modelStore.clear();
  uiStore.analysisMode = '3d';
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
  const member = modelStore.addElement(a, b);
  modelStore.addSupport(a, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: false } });
  modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: false, ty: true, tz: true, rx: false, ry: false, rz: false } });
  modelStore.addDistributedLoad3D(member, 0, 0, -2, -2);
  whatIf.open();
  const result = modelStore.solve3D();
  if (!result || typeof result === 'string') throw new Error(String(result));
  resultsStore.setResults3D(result);
  expect(response3D(result).moment).toBeCloseTo(2 * 4 ** 2 / 8, 10);
  expect(response3D(result).delta).toBe(0);
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

it('reads vertical displacement from a legacy plane result', () => {
  modelStore.addNodalLoad(n2, 0, P);
  const result = solve();
  expect(response2D({ ...result, displacements: [{ nodeId: n2, ux: 3, uy: 4, ry: 0 }] as never }).delta).toBe(5);
});

it('compares only the selected case or combination to its original response', () => {
  modelStore.addNodalLoad(n2, 0, P);
  const result = solve();
  const alternate = { ...result, reactions: [] };
  const combination = { ...result, displacements: [] };
  resultsStore.setCombinationResults(new Map([[1, result], [2, alternate]]), new Map([[1, combination]]), null);
  resultsStore.activeCaseId = 1;
  whatIf.open();
  expect(whatIf.reference).toEqual(response2D(result));
  resultsStore.activeComboId = 1;
  resultsStore.activeView = 'combo';
  expect(resultsStore.results).toEqual(combination);
  expect(whatIf.reference).toBeNull();
  resultsStore.activeCaseId = 2;
  expect(resultsStore.results).toEqual(alternate);
  expect(whatIf.reference).toBeNull();
  resultsStore.activeCaseId = 1;
  expect(whatIf.reference).toEqual(response2D(result));
});

it('identifies each thermal load by member and signed uniform change and gradient', () => {
  modelStore.addThermalLoad(m1, 10, -4);
  modelStore.addThermalLoad(m2, -10, 4);
  modelStore.loads.forEach((load, i) => {
    const label = loadLabel(load, i);
    if (load.type !== 'thermal') throw Error('Expected a thermal load');
    const d = load.data;
    expect(label).toContain('B' + d.elementId);
    expect(label).toContain('ΔT=' + d.dtUniform);
    expect(label).toContain('ΔTg=' + d.dtGradient);
  });
});

it.each(['2d', '3d'] as const)('edits original members across a moving split in %s', mode => {
  uiStore.analysisMode = mode;
  if (mode === '2d') modelStore.addNodalLoad(n2, 0, P);
  else modelStore.addNodalLoad3D(n2, 0, 0, P, 0, 0, 0);
  whatIf.open();
  const originalE = modelStore.materials.get(modelStore.elements.get(m1)!.materialId)!.e;
  whatIf.setMember(m1, 'e', 2);
  whatIf.setRelease(m1, 'j', { my: true, mz: false, t: false });
  for (const station of [0.35, 0.65]) {
    whatIf.setLoadAlong(0, m1, station);
    settle();
    const segments = [...modelStore.elements.values()].filter(e => e.id !== m2);
    expect(segments).toHaveLength(2);
    for (const segment of segments) {
      expect(modelStore.materials.get(segment.materialId)!.e).toBe(2 * originalE);
      expect(!!segment.releaseI.my).toBe(false);
      expect(!!segment.releaseJ.my).toBe(segment.nodeJ === n2);
    }
    expect(segments[0].materialId).toBe(segments[1].materialId);
    expect(segments.find(e => e.nodeJ === n2)?.releaseJ.my).toBe(true);
    const html = render(WhatIfMembers).body;
    expect(html).toContain('data-testid="whatif-member-' + m1 + '"');
    expect(html).not.toContain('data-testid="whatif-member-' + segments.find(e => e.id !== m1)!.id + '"');
  }
});

it('leaves the verified model untouched throughout an unedited session', async () => {
  const version = modelStore.modelVersion;
  whatIf.open();
  settle();
  expect.soft(modelStore.modelVersion).toBe(version);
  await whatIf.close();
  expect(modelStore.modelVersion).toBe(version);
});

it.each([['xy', 3, 0, 4], ['xz', 3, 4, 0], ['yz', 4, 3, 0]] as const)('uses the projected member length when placing a point load in %s', (plane, x, y, z) => {
  const originalPlane = uiStore.drawPlane2D;
  uiStore.drawPlane2D = plane;
  try {
    modelStore.updateNode(n2, x, y, z);
    modelStore.addPointLoadOnElement(m1, 1, P);
    whatIf.open();
    whatIf.setLoadAt(0, 5);
    settle();
    expect(modelStore.loads[0]).toMatchObject({ type: 'pointOnElement', data: { a: 3 } });
  } finally {
    uiStore.drawPlane2D = originalPlane;
  }
});

it.each(['2d', '3d'] as const)('binds a nodal destination to its split station in %s', mode => {
  uiStore.analysisMode = mode;
  if (mode === '2d') modelStore.addNodalLoad(n2, 0, P);
  else modelStore.addNodalLoad3D(n2, 0, 0, P, 0, 0, 0);
  const type = mode === '2d' ? 'nodal' : 'nodal3d';
  whatIf.open();
  whatIf.setSupportAlong(s1, m1, 0.5);
  settle();
  const split = modelStore.supports.get(s1)!.nodeId;
  whatIf.setLoadNode(0, split);
  settle();
  expect(modelStore.loads[0]).toMatchObject({ type, data: { nodeId: modelStore.supports.get(s1)!.nodeId } });
  whatIf.setSupportNode(s3, split);
  settle();
  expect(whatIf.active).toBe(true);
  expect(modelStore.supports.get(s3)!.nodeId).toBe(n3);
  whatIf.setLoadNode(0, 99999);
  settle();
  expect(modelStore.loads[0]).toMatchObject({ type, data: { nodeId: modelStore.supports.get(s1)!.nodeId } });
});

it('requires the plane and self weight of the original solve', () => {
  modelStore.addNodalLoad(n2, 0, P);
  resultsStore.setResults(solve());
  whatIf.open();
  const plane = uiStore.drawPlane2D, weight = uiStore.includeSelfWeight;
  try {
    uiStore.includeSelfWeight = !weight;
    expect.soft(whatIf.reference).toBeNull();
    uiStore.includeSelfWeight = weight;
    uiStore.drawPlane2D = plane === 'xy' ? 'xz' : 'xy';
    expect(whatIf.reference).toBeNull();
  } finally {
    uiStore.drawPlane2D = plane;
    uiStore.includeSelfWeight = weight;
  }
});

it('reports temperature differences in the selected unit system', () => {
  const units = uiStore.unitSystem;
  try {
    uiStore.unitSystem = 'Imperial';
    modelStore.addThermalLoad(m1, 10, -5);
    expect(loadLabel(modelStore.loads[0], 0)).toMatch(/18(?:\.0+)? °F/);
    expect(loadLabel(modelStore.loads[0], 0)).toMatch(/-9(?:\.0+)? °F/);
  } finally {
    uiStore.unitSystem = units;
  }
});

it.each(['xz', 'yz'] as const)('moves the projected endpoint and clamps the point load on the %s analysis plane', plane => {
  const savedPlane = uiStore.drawPlane2D;
  uiStore.drawPlane2D = plane;
  try {
    modelStore.updateNode(n2, plane === 'xz' ? 0 : 3, plane === 'xz' ? 3 : 0, 4);
    modelStore.addPointLoadOnElement(m1, 4, P);
    whatIf.open();
    whatIf.setNodeShift(n2, 1, -2);
    settle();
    expect(modelStore.nodes.get(n2)?.z).toBe(2);
    expect(modelStore.loads[0]).toMatchObject({ data: { a: 2 } });
  } finally {
    uiStore.drawPlane2D = savedPlane;
  }
});

it('drops dependent support moves if a failed cut restores an occupied node', () => {
  whatIf.open();
  whatIf.setSupportAlong(s1, m1, 0.5);
  whatIf.setSupportNode(s3, n1);
  whatIf.setMember(m2, 'e', 2);
  const split = vi.spyOn(modelStore, 'splitMember').mockImplementationOnce(() => { throw new Error('unavailable cut'); });
  try {
    settle();
    expect(whatIf.active).toBe(true);
    expect(modelStore.supports.get(s1)?.nodeId).toBe(n1);
    expect(modelStore.supports.get(s3)?.nodeId).toBe(n3);
    expect(whatIf.supportNode[s3]).toBeUndefined();
    expect(whatIf.memberFactors(m2).e).toBe(2);
  } finally {
    split.mockRestore();
  }
});

it.each(['2d', '3d'] as const)('scales the listed section properties for global and individual edits in %s', mode => {
  uiStore.analysisMode = mode;
  const props = { a: 0.12, iy: 0.003, iz: 0.001, j: 0.0002 };
  const section = modelStore.addSection({ name: 'Explicit properties', ...props });
  for (const id of [m1, m2]) modelStore.updateElementSection(id, section);
  whatIf.open();
  expect.soft(render(WhatIfMembers).body).toContain(mode === '3d' ? 'Iy, Iz' : 'Iy');
  whatIf.setAll('iy', 2);
  whatIf.setMember(m1, 'iy', 1.5);
  settle();
  for (const [id, factor] of [[m1, 3], [m2, 2]]) {
    const sec = modelStore.sections.get(modelStore.elements.get(id)!.sectionId)!;
    expect(sec.a).toBe(props.a);
    expect(sec.iy).toBeCloseTo(props.iy * factor, 14);
    expect(sec.iz).toBeCloseTo(props.iz * (mode === '3d' ? factor : 1), 14);
    expect(sec.j).toBeCloseTo(props.j, 14);
  }
});

it('names a legacy member moment when the stored primary component is zero', () => {
  const data = { id: 1, elementId: m1, a: 1, p: 0, my: 0, mz: 6 };
  const label = (my: number, mz: number) => loadLabel({ type: 'pointOnElement', data: { ...data, my, mz } }, 0);
  expect(label(0, 6)).toBe(label(6, 0));
  expect(label(0, 6)).toContain(unitQ('moment'));
  expect(label(0, 0)).toContain(unitQ('force'));
});

it('names imposed translations and rotations in display units', () => {
  const label = loadLabel({ type: 'displacement3d', data: { id: 1, nodeId: 7, dx: 0.03, drx: 0.02 } }, 0);
  expect(label).toContain(fmtQ(0.03, 'displacement') + ' ' + unitQ('displacement'));
  expect(label).toContain(fmtQ(0.02, 'rotation') + ' ' + unitQ('rotation'));
});

it.each([undefined, 'plate'] as const)('identifies both temperature terms on shell %s', on => {
  const label = loadLabel({ type: 'thermalQuad3d', data: { id: 1, quadId: 7, on, dtUniform: 10, dtGradient: -4 } }, 0);
  expect(label).toContain('ΔT=' + fmtQ(10, 'temperatureDelta'));
  expect(label).toContain('ΔTg=' + fmtQ(-4, 'temperatureDelta'));
});

it.each(['linear', 'second-order'] as const)('scales spatial cantilever bending while preserving its %s twist', async analysis => {
  const { solvePDelta3D } = await import('../../engine/wasm-solver');
  modelStore.clear();
  uiStore.analysisMode = '3d';
  const root = modelStore.addNode(0, 0, 0);
  const tip = modelStore.addNode(4, 0, 0);
  const member = modelStore.addElement(root, tip);
  const section = modelStore.addSection({ name: 'Cantilever', a: 0.12, iy: 0.003, iz: 0.001, j: 0.0002 });
  modelStore.updateElementSection(member, section);
  modelStore.addSupport(root, 'fixed3d');
  modelStore.addNodalLoad3D(tip, 0, 2, 3, 5, 0, 0);
  const response = () => {
    const result = analysis === 'linear' ? modelStore.solve3D() : solvePDelta3D(modelStore.buildSolverInput3D()!).results;
    if (!result || typeof result === 'string') throw Error(String(result));
    return result.displacements.find(d => d.nodeId === tip)!;
  };
  const before = response();
  whatIf.open();
  whatIf.setMember(member, 'iy', 2);
  settle();
  const after = response();
  for (const component of ['uy', 'uz', 'rx'] as const) {
    expect(Math.abs(before[component])).toBeGreaterThan(0);
    expect(after[component] / before[component]).toBeCloseTo(component === 'rx' ? 1 : 0.5, 10);
  }
});

it.each(['2d', '3d'] as const)('lists the live joints of supports before Explore captures its %s baseline', async mode => {
  uiStore.analysisMode = mode;
  const { default: Supports } = await import('../../../components/whatif/WhatIfSupports.svelte');
  const picker = render(Supports).body.split('data-testid="whatif-supportnode-' + s1 + '"')[1].split('</select>')[0];
  expect(picker).toContain('value="n:' + n1 + '"');
  expect(picker).toContain('value="n:' + n2 + '"');
  expect(picker).not.toContain('value="n:' + n3 + '"');
});

it.each(['2d', '3d'] as const)('rejects a split resolving to an occupied support joint in %s', mode => {
  uiStore.analysisMode = mode;
  const at = modelStore.addNode(2, 0);
  modelStore.addSupport(at, 'pinned');
  const splitMember = modelStore.splitMember.bind(modelStore);
  const reuse = vi.spyOn(modelStore, 'splitMember').mockImplementation((id, stations, options) =>
    splitMember(id, stations, { ...options, reuseNodeTol: 0.01 }));
  try {
    whatIf.open();
    whatIf.setSupportAlong(s1, m1, 0.5);
    settle();
    expect(modelStore.supports.get(s1)?.nodeId).toBe(n1);
    expect(modelStore.elements.size).toBe(2);
    expect(whatIf.supportAlong[s1]).toBeUndefined();
    whatIf.setSupportAlong(s1, m1, 0.25);
    settle();
    expect(modelStore.nodes.get(modelStore.supports.get(s1)!.nodeId)?.x).toBe(1);
  } finally {
    reuse.mockRestore();
  }
});
