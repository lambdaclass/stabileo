/**
 * Deflection relative to the chord, against closed forms, and the loads it is read under.
 *
 * The curve is the engine's nodal solution interpolated with Hermite plus the fixed-fixed
 * particular solution, so for prismatic Euler–Bernoulli members it is exact: the tests hold it
 * to 1e-9 relative, except where the peak lies between samples and the parabolic refinement
 * carries it.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { serviceSets, serviceDeflections } from '../service-deflection';
import { deflectionChecks } from '../serviceability';
import { runGlobalSolve } from '../../engine/live-calc';
import { eiOf } from '../../engine/member-deflection';

const L = 6, q = 10, P = 20;
let beam = 0;

function ei() {
  const e = modelStore.elements.get(beam)!;
  return eiOf(modelStore.materials.get(e.materialId), modelStore.sections.get(e.sectionId))!;
}

/** A horizontal member along X, loaded in its local z plane, with the given end restraints. */
function member(endI: 'fixed' | 'pinned', endJ: 'fixed' | 'roller' | 'free') {
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
  beam = modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, endI === 'fixed' ? 'fixed3d' : 'custom3d', undefined,
    endI === 'fixed' ? undefined : { dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: false } });
  if (endJ !== 'free') {
    modelStore.addSupport(b, endJ === 'fixed' ? 'fixed3d' : 'custom3d', undefined,
      endJ === 'fixed' ? undefined : { dofRestraints: { tx: false, ty: true, tz: true, rx: false, ry: false, rz: false } });
  }
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  return b;
}

function solveAndRead(): { max: number; x: number; maxW: number; maxV: number } {
  const single = modelStore.solve3D(false, false, true);
  if (!single || typeof single === 'string') throw new Error(String(single));
  resultsStore.setResults3D(single);
  const d = serviceDeflections([beam], serviceSets().sets).get(beam)!;
  return d;
}

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; });
afterEach(() => { uiStore.analysisMode = '3d'; });

describe('relative to the chord, against closed forms', () => {
  it('simply supported, uniform load: 5qL⁴/384EI at midspan', () => {
    member('pinned', 'roller');
    modelStore.addDistributedLoad3D(beam, 0, 0, -q, -q);
    const d = solveAndRead();
    expect(d.max / ((5 * q * L ** 4) / (384 * ei().EIy))).toBeCloseTo(1, 9);
    expect(d.x).toBeCloseTo(L / 2, 9);
  });

  it('fixed at both ends, uniform load: qL⁴/384EI', () => {
    member('fixed', 'fixed');
    modelStore.addDistributedLoad3D(beam, 0, 0, -q, -q);
    const d = solveAndRead();
    expect(d.max / ((q * L ** 4) / (384 * ei().EIy))).toBeCloseTo(1, 9);
  });

  it('simply supported, off-centre point load: the peak between samples, refined', () => {
    member('pinned', 'roller');
    const a = 2;
    modelStore.addPointLoadOnElement3D(beam, a, 0, -P);
    const d = solveAndRead();
    // Simply supported, P at a from I with a < L/2: the largest deflection is on the longer side,
    // at L − √((L² − a²)/3), and is P·a·(L² − a²)^{3/2} / (9√3·L·EI).
    const EI = ei().EIy;
    const xm = L - Math.sqrt((L * L - a * a) / 3);
    const exact = (P * a * (L * L - a * a) ** 1.5) / (9 * Math.sqrt(3) * L * EI);
    // The peak falls between samples; the parabola through the three around it recovers it to
    // about 1e-5 of the value (40 segments), which is what the check reads.
    expect(d.max / exact).toBeCloseTo(1, 4);
    expect(d.x).toBeCloseTo(xm, 2);
  });

  it('fixed at both ends, triangular load: qL⁴/768EI at midspan', () => {
    // The fixed-fixed particular solution of a linearly varying load used to carry
    // (qJ − qI)(L + x)/120L, whose fourth derivative leaves a constant term the load
    // does not have; the midspan of a pure triangle came out 0.6× the true value.
    member('fixed', 'fixed');
    modelStore.addDistributedLoad3D(beam, 0, 0, 0, -q);
    const d = solveAndRead();
    // v(x) = w·x²(L − x)²(x + 2L)/(120·L·EI). The midspan reads wL⁴/768EI; the peak is
    // off-centre — the load is not symmetric — at x = L·(√105 − 5)/10, between samples.
    expect(d.max / ((q * L ** 4) / (768 * ei().EIy))).toBeCloseTo(1, 2);
    expect(d.x).toBeCloseTo(L * (Math.sqrt(105) - 5) / 10, 2);
  });

  it('fixed at both ends, trapezoidal load: the uniform and triangular parts superpose', () => {
    // qI = q, qJ = 2q = uniform q + triangle peaking at q. The midspan reads
    // qL⁴/384EI + qL⁴/768EI = qL⁴/256EI; the peak sits ~1 % off-centre, between samples.
    member('fixed', 'fixed');
    modelStore.addDistributedLoad3D(beam, 0, 0, -q, -2 * q);
    const d = solveAndRead();
    expect(d.max / ((q * L ** 4) / (256 * ei().EIy))).toBeCloseTo(1, 2);
    expect(d.x).toBeCloseTo(L / 2, 1);
  });

  it('simply supported, triangular load: the released-end slopes read the end curvatures', () => {
    // v(x) = w·x·(3x⁴ − 10L²x² + 7L⁴)/(360·L·EI); the peak is at x = L·√(1 − √(8/15)).
    // The end rotations that build this curve come from the particular solution's end
    // curvatures (7wL³/360EI and wL³/45EI against wL²/30 and wL²/20), so a wrong
    // particularVpp shows up here too.
    member('pinned', 'roller');
    modelStore.addDistributedLoad3D(beam, 0, 0, 0, -q);
    const d = solveAndRead();
    const EI = ei().EIy;
    const xm = L * Math.sqrt(1 - Math.sqrt(8 / 15));
    const exact = (q * xm * (3 * xm ** 4 - 10 * L * L * xm ** 2 + 7 * L ** 4)) / (360 * L * EI);
    expect(d.max / exact).toBeCloseTo(1, 4);
    expect(d.x).toBeCloseTo(xm, 2);
  });

  it('a cantilever is measured from the tangent at its root: PL³/3EI at the tip', () => {
    // Its chord runs through the tip, so a chord reading would miss most of it: it gave
    // v(x) − x·v(L)/L, about a third of the tip deflection.
    const tip = member('fixed', 'free');
    modelStore.addNodalLoad3D(tip, 0, 0, -P, 0, 0, 0);
    const d = solveAndRead() as ReturnType<typeof solveAndRead> & { cantilever?: boolean };
    expect(d.cantilever).toBe(true);
    expect(d.max / ((P * L ** 3) / (3 * ei().EIy))).toBeCloseTo(1, 6);
    expect(d.x).toBeCloseTo(L, 9);
  });

  it('a cantilever off a flexible column: its own bending, without the column\'s rotation', () => {
    modelStore.clear();
    const base = modelStore.addNode(0, 0, 0), top = modelStore.addNode(0, 0, 3), tip = modelStore.addNode(L, 0, 3);
    modelStore.addElement(base, top, 'frame');
    beam = modelStore.addElement(top, tip, 'frame');
    modelStore.addSupport(base, 'fixed3d');
    for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
    modelStore.addNodalLoad3D(tip, 0, 0, -P, 0, 0, 0);
    const d = solveAndRead();
    // The column rotates its top, and the tip drops far more than the beam bends; relative to the
    // tangent at the root the beam's own curve is the fixed cantilever's.
    const drop = Math.abs(resultsStore.results3D!.displacements.find((x) => x.nodeId === tip)!.uz);
    const own = (P * L ** 3) / (3 * ei().EIy);
    expect(drop).toBeGreaterThan(1.5 * own);
    expect(d.max / own).toBeCloseTo(1, 4);
  });

  it('a cantilever under uniform load reads qL⁴/8EI at the tip', () => {
    member('fixed', 'free');
    modelStore.addDistributedLoad3D(beam, 0, 0, -q, -q);
    const d = solveAndRead();
    expect(d.max / ((q * L ** 4) / (8 * ei().EIy))).toBeCloseTo(1, 5);
    expect(d.x).toBeCloseTo(L, 9);
  });

  it('a cantilever whose tip is past L/360 fails the check', () => {
    const tip = member('fixed', 'free');
    // P chosen so the true tip deflection is exactly twice the limit — a cantilever the chord
    // reading passed (0.19 of the tip, times the long-term factor, stays under it). A
    // cantilever's limit is taken over twice its length (`deflection-limits.ts`): 2L/360.
    const EI = ei().EIy;
    const p = (2 * ((2 * L) / 360)) * (3 * EI) / L ** 3;
    modelStore.addNodalLoad3D(tip, 0, 0, -p, 0, 0, 0);
    solveAndRead();
    const row = deflectionChecks([beam]).rows.get(beam)!;
    expect(row.deflection.max / ((p * L ** 3) / (3 * EI))).toBeCloseTo(1, 5);
    expect(row.check.status).toBe('fail');
  });

  it('a cantilever drawn tip-to-root reads the same, from the tangent at its far-end root', () => {
    modelStore.clear();
    const tipN = modelStore.addNode(0, 0, 0), root = modelStore.addNode(L, 0, 0);
    beam = modelStore.addElement(tipN, root, 'frame');
    modelStore.addSupport(root, 'fixed3d');
    for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
    modelStore.addNodalLoad3D(tipN, 0, 0, -P, 0, 0, 0);
    const d = solveAndRead();
    expect(d.max / ((P * L ** 3) / (3 * ei().EIy))).toBeCloseTo(1, 5);
    expect(d.x).toBeCloseTo(0, 9);
  });

  it('a member that moves without bending has no deflection', () => {
    // Two cantilever columns carry a beam pinned at both ends; a lateral load sways the frame and
    // translates the beam. Its absolute displacement is large; its own bending is zero.
    modelStore.clear();
    const n1 = modelStore.addNode(0, 0, 0), n2 = modelStore.addNode(0, 0, 3), n3 = modelStore.addNode(L, 0, 3), n4 = modelStore.addNode(L, 0, 0);
    modelStore.addElement(n1, n2, 'frame');
    beam = modelStore.addElement(n2, n3, 'frame');
    modelStore.addElement(n4, n3, 'frame');
    modelStore.updateElement(beam, { releaseI: { my: true, mz: true, t: false }, releaseJ: { my: true, mz: true, t: false } } as never);
    modelStore.addSupport(n1, 'fixed3d');
    modelStore.addSupport(n4, 'fixed3d');
    modelStore.addNodalLoad3D(n2, 50, 0, 0, 0, 0, 0);
    const d = solveAndRead();
    const sway = Math.abs(resultsStore.results3D!.displacements.find((x) => x.nodeId === n2)!.ux);
    expect(sway).toBeGreaterThan(1e-4);
    expect(d.max).toBeLessThan(sway * 1e-9);
  });
});

describe('under which loads', () => {
  it('a service envelope when one is stated; unfactored otherwise; the factored combinations as the last resort', () => {
    member('pinned', 'roller');
    const dead = modelStore.addLoadCase('Defl dead', 'D');
    modelStore.addDistributedLoad3D(beam, 0, 0, -q, -q, undefined, undefined, dead);
    const service = modelStore.addCombination('1.0D', [{ caseId: dead, factor: 1 }]);
    const strength = modelStore.addCombination('1.4D', [{ caseId: dead, factor: 1.4 }]);
    modelStore.setResultScopes({ envelopes: [{ id: 1, name: 'SLS', purpose: 'service', comboIds: [service] }] });
    const r = modelStore.solveCombinations3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    publishCombinations3D(r);
    const s = serviceSets();
    expect(s.basis).toBe('service');
    expect(s.sets.map((x) => x.id)).toEqual([service]);
    const d = serviceDeflections([beam], s.sets).get(beam)!;
    expect(d.max / ((5 * q * L ** 4) / (384 * ei().EIy))).toBeCloseTo(1, 9);
    expect(d.setName).toBe('1.0D');

    modelStore.setResultScopes(null);
    const r2 = modelStore.solveCombinations3D(false, false, true);
    if (!r2 || typeof r2 === 'string') throw new Error(String(r2));
    publishCombinations3D(r2);
    expect(serviceSets().basis).toBe('factored');
    expect(serviceSets().sets.map((x) => x.id)).toEqual([service, strength]);
  });
});

describe('over the physical member, not the element', () => {
  /** A 6 m simply supported beam along X drawn as `n` elements; returns their ids. */
  function cutBeam(n: number): number[] {
    modelStore.clear();
    const nodes = Array.from({ length: n + 1 }, (_, i) => modelStore.addNode((L * i) / n, 0, 0));
    const ids = nodes.slice(1).map((b, i) => modelStore.addElement(nodes[i]!, b, 'frame'));
    modelStore.addSupport(nodes[0]!, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: false } });
    modelStore.addSupport(nodes[n]!, 'custom3d', undefined, { dofRestraints: { tx: false, ty: true, tz: true, rx: false, ry: false, rz: false } });
    for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
    for (const id of ids) modelStore.addDistributedLoad3D(id, 0, 0, -q, -q);
    beam = ids[0]!;
    return ids;
  }

  it('a beam cut into uneven pieces reads 5qL⁴/384EI over the whole span, for every piece', () => {
    const ids = cutBeam(3);
    // Move the inner nodes off the thirds, so the pieces are uneven and sampled unevenly.
    const inner = [...modelStore.elements.values()].map((e) => e.nodeJ).slice(0, 2);
    modelStore.updateNode(inner[0]!, 1.3, 0, 0);
    modelStore.updateNode(inner[1]!, 4.1, 0, 0);
    const single = modelStore.solve3D(false, false, true);
    if (!single || typeof single === 'string') throw new Error(String(single));
    resultsStore.setResults3D(single);
    const got = serviceDeflections(ids, serviceSets().sets);
    const exact = (5 * q * L ** 4) / (384 * ei().EIy);
    for (const id of ids) {
      const d = got.get(id)!;
      expect(d.span).toEqual(ids);
      expect(d.L).toBeCloseTo(L, 12);
      // Midspan is not a sample here; the parabola through the three around it carries the peak.
      expect(d.max / exact).toBeCloseTo(1, 5);
      expect(d.x).toBeCloseTo(L / 2, 3);
    }
  });

  it('a level bar framing in rides on the span; a column stops it', () => {
    const ids = cutBeam(2);
    const mid = modelStore.elements.get(ids[0]!)!.nodeJ;
    // A secondary beam, level, framing in at midspan and carried on a far support.
    const far = modelStore.addNode(L / 2, 4, 0);
    const secondary = modelStore.addElement(mid, far, 'frame');
    modelStore.addSupport(far, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: false, ry: false, rz: false } });
    modelStore.addDistributedLoad3D(secondary, 0, 0, -q, -q);
    let single = modelStore.solve3D(false, false, true);
    if (!single || typeof single === 'string') throw new Error(String(single));
    resultsStore.setResults3D(single);
    expect(serviceDeflections(ids, serviceSets().sets).get(ids[0]!)!.span).toEqual(ids);

    // A column under the midspan node holds the girder up there: two spans.
    const foot = modelStore.addNode(L / 2, 0, -3);
    modelStore.addElement(foot, mid, 'frame');
    modelStore.addSupport(foot, 'fixed3d');
    single = modelStore.solve3D(false, false, true);
    if (!single || typeof single === 'string') throw new Error(String(single));
    resultsStore.setResults3D(single);
    const got = serviceDeflections(ids, serviceSets().sets);
    expect(got.get(ids[0]!)!.span).toEqual([ids[0]]);
    expect(got.get(ids[1]!)!.span).toEqual([ids[1]]);
  });

  it('a physical-member group does not stretch the span across a column', () => {
    const ids = cutBeam(2);
    const mid = modelStore.elements.get(ids[0]!)!.nodeJ;
    const foot = modelStore.addNode(L / 2, 0, -3);
    modelStore.addElement(foot, mid, 'frame');
    modelStore.addSupport(foot, 'fixed3d');
    modelStore.addGroup('V1', 'physicalMember', { elements: ids });
    const single = modelStore.solve3D(false, false, true);
    if (!single || typeof single === 'string') throw new Error(String(single));
    resultsStore.setResults3D(single);
    expect(serviceDeflections(ids, serviceSets().sets).get(ids[1]!)!.span).toEqual([ids[1]]);
  });
});

describe('the unfactored basis after a PRO solve', () => {
  afterEach(() => { vi.restoreAllMocks(); uiStore.analysisMode = '2d'; });

  it.each([false, true])('includes every case at factor 1, with declared self-weight=%s', async (withSelfWeight) => {
    member('pinned', 'roller');
    const dead = modelStore.addLoadCase('Defl D', 'D');
    const live = modelStore.addLoadCase('Defl L', 'L');
    // State the load basis explicitly; the legacy toggle adds weight to every D case.
    modelStore.setAnalysis({ selfWeight: withSelfWeight ? [{ caseId: dead, direction: 'Z', factor: -1 }] : [] });
    modelStore.addDistributedLoad3D(beam, 0, 0, -q, -q, undefined, undefined, dead);
    modelStore.addDistributedLoad3D(beam, 0, 0, -2 * q, -2 * q, undefined, undefined, live);
    modelStore.addCombination('1.2D+1.6L', [{ caseId: dead, factor: 1.2 }, { caseId: live, factor: 1.6 }]);
    uiStore.analysisMode = 'pro';
    // The worker pool is not there under vitest; the same solve, in-process.
    vi.spyOn(modelStore, 'solveCombinations3DParallel').mockImplementation(async (w, l, p) => modelStore.solveCombinations3D(w, l, p));
    await runGlobalSolve();
    const s = serviceSets();
    expect(s.basis).toBe('unfactored');
    const d = serviceDeflections([beam], s.sets).get(beam)!;
    const element = modelStore.elements.get(beam)!;
    const ownWeight = withSelfWeight ? modelStore.materials.get(element.materialId)!.rho * modelStore.sections.get(element.sectionId)!.a : 0;
    expect(d.max / ((5 * (3 * q + ownWeight) * L ** 4) / (384 * ei().EIy))).toBeCloseTo(1, 6);
  });
});
