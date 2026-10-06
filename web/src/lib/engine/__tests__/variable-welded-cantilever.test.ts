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
import { memberMeanArea, variableSectionPlan } from '../../section/variable';
import { solvePDelta3DCorrected } from '../pdelta-forces';
import { evaluateDiagramAt } from '../diagrams-3d';
import { withSectionMass } from '../dynamics/section-mass';
import { withMassSource } from '../dynamics/mass-source-model';
import { G } from '../dynamics/requests';
import { createSectionWeight } from '../../section/weight';
import { analyzeDrawn } from '../../section/drawn-properties';
import { catalogueOutline } from '../../section/canonical';
import type { DrawnSection } from '../../section/drawn';
import { isDesignedMember } from '../design/behaviour-demands';
import { checkModel } from '../model-diagnostics';
import { autoVerifyFromResults } from '../auto-verify';
import { validateAndSolve2D, solveCombinations2D, variableRefusal2D, solveCombinations3D } from '../solver-service';
import { envelopeOver } from '../result-scopes';
import { tp } from '../../i18n';
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

  it('a case taken as mass weighs on its pieces: 10 kN/m over 6 m is 60 kN of mass', () => {
    const { e } = cantilever();
    modelStore.addDistributedLoad3D(e, 0, 0, -10, -10, undefined, undefined, 1, { frame: 'global' });
    const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
    const ms = withMassSource(modelStore.model, [{ id: 1, name: 'D', type: 'D' }], { kind: 'custom', factors: [{ caseId: 1, factor: 1 }] }, input);
    expect(ms.report.addedT.get(1)).toBeCloseTo(60 / G, 6);
    // The member's own weight beside it: the pieces', each with its section's density.
    expect(ms.report.selfWeightT).toBeCloseTo((memberMeanArea(modelStore.sections, modelStore.elements.get(e)!)! * L * [...modelStore.materials.values()][0]!.rho) / G, 6);
  });

  it('a composite drawing of variable depth weighs with its materials, piece by piece', () => {
    const steel = [...modelStore.materials.values()][0]!;
    const concrete = modelStore.addMaterial({ name: 'Concrete', e: 27000, nu: 0.2, rho: 24 });
    const n = 27000 / steel.e;
    const box = (h: number): DrawnSection => ({
      version: 1, refMaterialId: steel.id,
      parts: [
        { id: 1, shape: { kind: 'hollowRect', b: 0.3, h, t: 0.01 }, at: [0, 0], rotationDeg: 0 },
        { id: 2, shape: { kind: 'rect', b: 0.28, h: h - 0.02 }, at: [0, 0], rotationDeg: 0, materialId: concrete, ratio: { e: n, g: n } },
      ],
    } as DrawnSection);
    const add = (h: number) => {
      const drawn = box(h);
      const p = analyzeDrawn(drawn, catalogueOutline).properties!;
      return modelStore.addSection(toSectionFields({ kind: 'drawn', name: `Box ${h}`, drawn, props: { a: p.a, iy: p.iy, iz: p.iz, j: p.j, b: p.bbox[2] - p.bbox[0], h: p.bbox[3] - p.bbox[1] } }, 0) as never);
    };
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    const sI = add(0.6), sJ = add(0.3);
    modelStore.updateElement(e, { sectionId: sI, variableSection: { sectionJ: sJ } } as never);
    modelStore.addSupport(a, 'fixed3d');
    expect(memberMeanArea(modelStore.sections, modelStore.elements.get(e)!)).toBeGreaterThan(0);
    const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
    const ms = withMassSource(modelStore.model, modelStore.model.loadCases, undefined, input);
    // The real weight: steel and concrete, each with its own density, over the mean of the pieces.
    const weight = createSectionWeight(modelStore.materials);
    const plan = variableSectionPlan(modelStore.sections.get(sI), modelStore.sections.get(sJ));
    if (!plan.ok) throw new Error(plan.problem);
    let kN = 0;
    for (let k = 0; k < 12; k++) kN += weight(plan.at((k + 0.5) / 12), steel.id) * (L / 12);
    expect(ms.report.selfWeightT).toBeCloseTo(kN / G, 6);
    // Not what the transformed area weighs at the steel's density, which is what the pieces had.
    const transformed = [...input.elements.values()].reduce((s, x) => s + input.sections.get(x.sectionId)!.a * (L / 12) * steel.rho, 0);
    expect(Math.abs(transformed / G - ms.report.selfWeightT) / ms.report.selfWeightT).toBeGreaterThan(0.1);
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

describe('an envelope over some of the combinations', () => {
  it('is taken piece by piece, as the solve\'s own, and keeps the pieces for the deflected shape', () => {
    const { b, e } = cantilever();
    modelStore.addNodalLoad3D(b, 0, 0, -P, 0, 0, 0);
    const live = modelStore.addLoadCase('L', 'L');
    modelStore.addDistributedLoad3D(e, 0, 0, -4, -4, undefined, undefined, live, { frame: 'global' });
    const dead = modelStore.model.loadCases.find((c) => c.id !== live)!.id;
    modelStore.addCombination('1.2D+1.6L', [{ caseId: dead, factor: 1.2 }, { caseId: live, factor: 1.6 }]);
    modelStore.addCombination('1.4D', [{ caseId: dead, factor: 1.4 }]);
    const m = modelStore.model;
    const bundle = solveCombinations3D(m, m.loadCases, m.combinations);
    if (!bundle || typeof bundle === 'string') throw new Error(String(bundle));
    const own = bundle.envelope;
    const over = envelopeOver(bundle.perCombo, [...bundle.perCombo.keys()])!;
    const f = over.maxAbsResults3D.elementForces.find((x) => x.elementId === e)!;
    expect(f.pieces?.length).toBe(12);
    expect(f.pieces!.map((p) => p.ei)).toEqual(own.maxAbsResults3D.elementForces.find((x) => x.elementId === e)!.pieces!.map((p) => p.ei));
    expect(over.maxAbsResults3D.displacements.map((d) => d.nodeId).sort()).toEqual([...modelStore.nodes.keys()].sort());
    expect(over.momentY.elements).toEqual(own.momentY.elements);
  });
});

describe('the solve\'s refusals', () => {
  it('name the model\'s nodes, never the interior nodes of a member\'s pieces', () => {
    cantilever();
    // A second tapered cantilever, apart from the first.
    const c = modelStore.addNode(0, 5, 0), d = modelStore.addNode(L, 5, 0);
    const e = modelStore.addElement(c, d, 'frame');
    modelStore.updateElement(e, { sectionId: weldedI(H0), variableSection: { sectionJ: weldedI(H1) } } as never);
    modelStore.addSupport(c, 'fixed3d');
    const r = modelStore.solve3D(false, false, true);
    expect(typeof r).toBe('string');
    const ids = (r as string).match(/\d+/g)!.map(Number);
    expect(ids.sort((x, y) => x - y)).toEqual([c, d].sort((x, y) => x - y));
  });
});

describe('the RC check', () => {
  it('leaves a concrete member of variable depth out, as design does, and checks a prismatic one beside it', () => {
    const conc = modelStore.addMaterial({ name: 'H-30', e: 30000, nu: 0.2, rho: 24, fy: 30 } as never);
    const rect = (h: number) => modelStore.addSection(toSectionFields({ kind: 'built', name: `R${h}`, shapeType: 'rect', params: { b: 0.3, h }, props: computeSectionProperties('rect', { b: 0.3, h })!, rotationDeg: 0 }, 0) as never);
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0), c = modelStore.addNode(-L, 0, 0);
    const tapered = modelStore.addElement(a, b, 'frame'), prismatic = modelStore.addElement(c, a, 'frame');
    const r60 = rect(0.6);
    modelStore.updateElement(tapered, { materialId: conc, sectionId: r60, variableSection: { sectionJ: rect(0.3) } } as never);
    modelStore.updateElement(prismatic, { materialId: conc, sectionId: r60 } as never);
    modelStore.addSupport(c, 'fixed3d');
    modelStore.addNodalLoad3D(b, 0, 0, -P, 0, 0, 0);
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const checked = autoVerifyFromResults(r, modelStore.model as never, null).concrete.map((v) => v.elementId);
    expect(checked).toEqual([prismatic]);
  });
});

describe('in the plane solve', () => {
  /** The cantilever drawn in the plane: x along it, y up. */
  function plane() {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(L, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.updateElement(e, { sectionId: weldedI(H0), variableSection: { sectionJ: weldedI(H1) } } as never);
    modelStore.addSupport(a, 'fixed');
    modelStore.addNodalLoad(b, 0, -P);
    return { a, b, e };
  }

  it('a member of variable section is refused by name, never solved prismatic with end I\'s section', () => {
    const { e } = plane();
    const refusal = tp('svc.variableIn2D', { n: e });
    expect(validateAndSolve2D(modelStore.model)).toBe(refusal);
    const cases = modelStore.model.loadCases;
    const combos = [{ id: 1, name: 'C', factors: [{ caseId: cases[0]!.id, factor: 1 }] }];
    expect(solveCombinations2D(modelStore.model, cases as never, combos as never)).toBe(refusal);
    expect(variableRefusal2D(modelStore.model)).toBe(refusal);
  });

  it('a truss of the same pair is solved prismatic, as in 3D, and not refused', () => {
    const { e } = plane();
    modelStore.updateElement(e, { type: 'truss' } as never);
    expect(variableRefusal2D(modelStore.model)).toBeNull();
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
