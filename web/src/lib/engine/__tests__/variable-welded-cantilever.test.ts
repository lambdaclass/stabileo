/**
 * A welded I cantilever of variable depth through every analysis that reaches the model: the
 * static solve against the integral of its own taper, its loads across the pieces, a rigid end
 * zone, an inclined member under a projected load, and P-Delta, modal and buckling as the results
 * store publishes them, one member each with no piece or interior node left. And a member whose
 * section at J the solve does not use: solved prismatic, designed so, and named by the findings.
 *
 * 6 m, b = 200 mm, flanges 12 mm, web 8 mm, depth 600 → 300 mm, 20 kN at the tip: 19,05 mm.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { resultsStore } from '../../store/results.svelte';
import '../../store/index';
import { initSolver, solveModal3D, solveBuckling3D } from '../wasm-solver';
import { toSectionFields } from '../../section/section-choice';
import { computeSectionProperties } from '../../data/section-shapes';
import { memberMeanArea } from '../../section/variable';
import { solvePDelta3DCorrected } from '../pdelta-forces';
import { evaluateDiagramAt } from '../diagrams-3d';
import { withSectionMass } from '../dynamics/section-mass';
import { isDesignedMember } from '../design/behaviour-demands';
import { checkModel } from '../model-diagnostics';
import type { AnalysisResults3D } from '../types-3d';
import type { ElementBucklingData3D } from '../result-types';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); resultsStore.clear(); });

const B = 0.2, TF = 0.012, TW = 0.008, L = 6, P = 20, H0 = 0.6, H1 = 0.3;
const Iof = (h: number) => computeSectionProperties('I-custom', { h, b: B, tw: TW, tf: TF })!;
const weldedI = (h: number) => {
  const params = { h, b: B, tw: TW, tf: TF };
  return modelStore.addSection(toSectionFields({ kind: 'built', name: `I${h}`, shapeType: 'I-custom', params, props: Iof(h), rotationDeg: 0 }, 0) as never);
};
const E = () => [...modelStore.materials.values()][0]!.e * 1000;

/** δ = ∫ P (Lf − x)² / (E I(x)) dx over the flexible length, Simpson with two thousand intervals. */
function exactTip(Lf = L) {
  const n = 2000, dx = Lf / n;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const x = i * dx, h = H0 + (H1 - H0) * (x / Lf);
    sum += ((P * (Lf - x) ** 2) / (E() * Iof(h).iy)) * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2);
  }
  return (sum * dx) / 3;
}

function cantilever(extra: Record<string, unknown> = {}) {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
  const e = modelStore.addElement(a, b, 'frame');
  const sI = weldedI(H0), sJ = weldedI(H1);
  modelStore.updateElement(e, { sectionId: sI, variableSection: { sectionJ: sJ }, ...extra } as never);
  modelStore.addSupport(a, 'fixed3d');
  return { a, b, e, sI, sJ };
}
const solve = () => {
  const r = modelStore.solve3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  return r;
};

describe('a welded I cantilever of variable depth', () => {
  it('deflects 19,05 mm at the tip, within 0,25 % of the integral of its taper', () => {
    const { b } = cantilever();
    modelStore.addNodalLoad3D(b, 0, 0, -P, 0, 0, 0);
    const uz = -solve().displacements.find((d) => d.nodeId === b)!.uz;
    expect(uz).toBeCloseTo(0.01905, 5);
    expect(Math.abs(uz - exactTip()) / exactTip()).toBeLessThan(0.0025);
  });

  it('weighs the mean of its pieces\' areas, which for a web growing linearly is the mean of its ends\'', () => {
    const { e, sI, sJ } = cantilever();
    const mean = memberMeanArea(modelStore.sections, modelStore.elements.get(e)!)!;
    expect(mean).toBeCloseTo((modelStore.sections.get(sI)!.a + modelStore.sections.get(sJ)!.a) / 2, 9);
  });

  it('carries loads across its pieces, one on a cut, with the reactions and moments of statics', () => {
    const { a, e } = cantilever();
    modelStore.addDistributedLoad3D(e, 0, 0, -3, -7, 0.7, 4.3);
    modelStore.addPointLoadOnElement3D(e, 2.5, 1.5, -4);
    modelStore.addPointLoadOnElement3D(e, 3.0, 0, -5); // on a cut: twelve pieces of 0,5 m
    const r = solve();
    const R = r.reactions.find((x) => x.nodeId === a)!;
    const W = ((3 + 7) / 2) * 3.6;
    expect(R.fz).toBeCloseTo(W + 4 + 5, 6);
    expect(R.fy).toBeCloseTo(-1.5, 6);
    const f = r.elementForces.find((x) => x.elementId === e)!;
    const xc = 0.7 + (3.6 * (3 + 2 * 7)) / (3 * (3 + 7));
    expect(Math.abs(evaluateDiagramAt(f, 'momentY', 0))).toBeCloseTo(W * xc + 4 * 2.5 + 5 * 3, 5);
    // Inside a piece, past the point loads: the trapezoid beyond x = 3,3 m alone.
    const q = (x: number) => 3 + (4 * (x - 0.7)) / 3.6;
    let M = 0;
    const n = 2000, dx = (4.3 - 3.3) / n;
    for (let i = 0; i < n; i++) { const x = 3.3 + (i + 0.5) * dx; M += q(x) * (x - 3.3) * dx; }
    expect(Math.abs(evaluateDiagramAt(f, 'momentY', 3.3 / L))).toBeCloseTo(M, 4);
  });

  it('with a rigid end zone at I, tapers over its flexible length', () => {
    const off = 0.5;
    const { b, e } = cantilever({ offset: { frame: 'global', i: { x: off, y: 0, z: 0 } } });
    modelStore.addNodalLoad3D(b, 0, 0, -P, 0, 0, 0);
    const r = solve();
    const uz = -r.displacements.find((d) => d.nodeId === b)!.uz;
    expect(Math.abs(uz - exactTip(L - off)) / exactTip(L - off)).toBeLessThan(0.0025);
    expect(r.elementForces.map((f) => f.elementId)).toEqual([e]);
    expect(r.elementForces[0]!.length).toBeCloseTo(L - off, 9);
  });

  it('inclined, under a projected partial load and a temperature, balances its reactions', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(8, 0, 3);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.updateElement(e, { sectionId: weldedI(H0), variableSection: { sectionJ: weldedI(H1), segments: 7 } } as never);
    modelStore.addSupport(a, 'pinned3d' as never);
    modelStore.addSupport(b, 'pinned3d' as never);
    modelStore.addDistributedLoad3D(e, 0, 0, -4, -4, 1.1, 6.3, undefined, { frame: 'projected' } as never);
    modelStore.addThermalLoad(e, 20, 10);
    const r = solve();
    expect(r.reactions.reduce((s, x) => s + x.fz, 0)).toBeCloseTo((4 * (6.3 - 1.1) * 8) / Math.hypot(8, 3), 6);
    expect(r.reactions.reduce((s, x) => s + x.fx, 0)).toBeCloseTo(0, 6);
    expect(r.elementForces.map((f) => f.elementId)).toEqual([e]);
  });

  it('P-Delta from the advanced analyses is published as one member, its linear results too', () => {
    const { b, e } = cantilever();
    modelStore.addNodalLoad3D(b, -50, 0, -P, 0, 0, 0);
    const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
    const res = solvePDelta3DCorrected(input);
    if (typeof res === 'string') throw new Error(res);
    // The engine's own result has the pieces; what the store publishes does not.
    expect(res.results.elementForces.length).toBe(12);
    resultsStore.setPDeltaResult3D(res as never);
    const nodes = [...modelStore.nodes.keys()].sort();
    for (const r of [resultsStore.results3D!, resultsStore.pdeltaResult3D!.results, resultsStore.pdeltaResult3D!.linearResults]) {
      expect(r.elementForces.map((f) => f.elementId)).toEqual([e]);
      expect(r.displacements.map((d) => d.nodeId).sort()).toEqual(nodes);
    }
    expect((resultsStore.pdeltaResult3D!.amplification ?? []).every((x) => modelStore.nodes.has(x.nodeId))).toBe(true);
    // Second order: more tip deflection than the linear solve.
    const tip = (r: AnalysisResults3D) => -r.displacements.find((d) => d.nodeId === b)!.uz;
    expect(tip(resultsStore.pdeltaResult3D!.results)).toBeGreaterThan(tip(resultsStore.pdeltaResult3D!.linearResults));
  });

  it('modal and buckling shapes are published on the model\'s nodes, and buckling names the member', () => {
    const { b, e } = cantilever();
    modelStore.addNodalLoad3D(b, -50, 0, 0, 0, 0, 0);
    const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
    const nodes = [...modelStore.nodes.keys()].sort();

    const physical = withSectionMass(input, modelStore.model);
    const modal = solveModal3D(physical.input, physical.densities, 3);
    if (typeof modal === 'string') throw new Error(modal);
    expect(modal.modes[0]!.displacements.length).toBeGreaterThan(nodes.length);
    resultsStore.setModalResult3D(modal as never);
    for (const m of resultsStore.modalResult3D!.modes) expect(m.displacements.map((d) => d.nodeId).sort()).toEqual(nodes);

    const buckling = solveBuckling3D(input, 2);
    if (typeof buckling === 'string') throw new Error(buckling);
    expect(buckling.elementData.length).toBe(12);
    resultsStore.setBucklingResult3D(buckling as never);
    const published = resultsStore.bucklingResult3D!;
    for (const m of published.modes) expect(m.displacements.map((d) => d.nodeId).sort()).toEqual(nodes);
    expect(published.elementData.map((x) => x.elementId)).toEqual([e]);
    const row = published.elementData[0]!;
    expect(row.length).toBeCloseTo(L, 9);
    expect(row.kEffective).toBeCloseTo(row.effectiveLength / L, 9);
    // The most slender piece stands for the member.
    expect(Math.max(row.slendernessY, row.slendernessZ)).toBeCloseTo(Math.max(...(buckling.elementData as ElementBucklingData3D[]).map((x) => Math.max(x.slendernessY, x.slendernessZ))), 9);
  });
});

describe('a member whose section at J the solve does not use', () => {
  const findings = () => {
    const m = modelStore.model;
    return checkModel({ ...m, loads: m.loads, loadCases: m.loadCases } as never).filter((d) => d.code === 'MODEL_VARIABLE_REFUSED');
  };

  it('two sections of different families: solved prismatic with end I\'s, designed so, and named', () => {
    const named = (n: string) => modelStore.addSection({ name: n, a: 0.001, iz: 1e-6 } as never);
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.updateElement(e, { sectionId: named('IPE 300'), variableSection: { sectionJ: named('HEB 300') } } as never);
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addNodalLoad3D(b, 0, 0, -P, 0, 0, 0);
    const r = solve();
    expect(r.elementForces[0]!.pieces).toBeUndefined();
    expect(isDesignedMember(modelStore.elements.get(e)!, modelStore.sections)).toBe(true);
    expect(findings().map((d) => d.elementIds)).toEqual([[e]]);
  });

  it('a truss: its section at J is not used, and it is designed and named; a frame of the same pair is neither', () => {
    const { e } = cantilever();
    expect(isDesignedMember(modelStore.elements.get(e)!, modelStore.sections)).toBe(false);
    expect(findings()).toEqual([]);
    modelStore.updateElement(e, { type: 'truss' } as never);
    expect(isDesignedMember(modelStore.elements.get(e)!, modelStore.sections)).toBe(true);
    expect(findings().map((d) => d.elementIds)).toEqual([[e]]);
    // Out of the analysis is out of both.
    modelStore.updateElement(e, { type: 'frame', behaviour: 'inactive' } as never);
    expect(findings()).toEqual([]);
  });
});
