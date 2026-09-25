/**
 * Deflection relative to the chord, against closed forms, and the loads it is read under.
 *
 * The curve is the engine's nodal solution interpolated with Hermite plus the fixed-fixed
 * particular solution, so for prismatic Euler–Bernoulli members it is exact: the tests hold it
 * to 1e-9 relative, except where the peak lies between samples and the parabolic refinement
 * carries it.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { serviceSets, serviceDeflections } from '../service-deflection';
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

  it('a cantilever is measured from its chord, not from where it started', () => {
    const tip = member('fixed', 'free');
    modelStore.addNodalLoad3D(tip, 0, 0, -P, 0, 0, 0);
    const d = solveAndRead();
    const EI = ei().EIy;
    // v(x) = P x²(3L − x)/6EI; relative to the chord x·v(L)/L, largest where 6Lx − 3x² − 2L² = 0.
    const v = (x: number) => (P * x * x * (3 * L - x)) / (6 * EI);
    const xm = L * (1 - 1 / Math.sqrt(3));
    const exact = Math.abs(v(xm) - (xm / L) * v(L));
    expect(d.max / exact).toBeCloseTo(1, 5);
    expect(d.max).toBeLessThan(v(L) / 2); // the absolute tip displacement is not the number
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
