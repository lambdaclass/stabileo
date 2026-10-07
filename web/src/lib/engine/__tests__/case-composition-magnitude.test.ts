/**
 * Combinations by SRSS and ABS where the results go: a magnitude has no sign, so design, the
 * station demands, the governing search, the envelopes and the statics check leave it out, and
 * what it is combined from is every part a linear combination takes (the settlement, the shells'
 * stresses, a variable member's pieces, a case named twice). Composite cases written by the
 * generator reach design as the combinations they replace.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import { uiStore } from '../../store/ui.svelte';
import { resultsStore } from '../../store/results.svelte';
import '../../store';
import { initSolver } from '../wasm-solver';
import { evaluateDiagramAt } from '../diagrams-3d';
import { computeStationDemands, steelDemandOf } from '../verification-service';
import { activePerCombo3D, activeCombinations, publishCombinations3D } from '../../store/active-results';
import { staticsRows, BALANCED } from '../../store/statics-rows';
import { envelopeOver, envelopeMembers, scopeBundle3D } from '../result-scopes';
import { addCompositeCases } from '../../store/generated-combinations';
import { currentWorkbookSheets } from '../../store/project-workbook';
import { withNotionalVariants } from '../loads/notional-combinations';
import { toSectionFields } from '../../section/section-choice';
import { computeSectionProperties } from '../../data/section-shapes';
import { t } from '../../i18n';
import { computeGoverning3D, type GoverningPerElement3D } from '../governing-case';
import type { AnalysisResults3D } from '../types-3d';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); modelStore.setResultScopes(null);
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro';
});
afterEach(() => { uiStore.analysisMode = '3d'; });

/** `selfWeight`: as the app solves, with the self-weight the statics side counts. */
const solve = (selfWeight = false) => {
  const r = modelStore.solveCombinations3D(selfWeight && uiStore.includeSelfWeight, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  return r;
};
const ef = (r: AnalysisResults3D, e: number) => r.elementForces.find((x) => x.elementId === e)!;
const disp = (r: AnalysisResults3D, n: number) => r.displacements.find((d) => d.nodeId === n)!;
const md = () => ({ elements: modelStore.elements, nodes: modelStore.nodes, sections: modelStore.sections, materials: modelStore.materials, supports: modelStore.supports });

/** A 6 m × 4 m portal in XZ, fixed feet; 20 kN/m on the beam in D, 15 kN sideways in W. */
function portal() {
  const n1 = modelStore.addNode(0, 0, 0), n2 = modelStore.addNode(6, 0, 0);
  const n3 = modelStore.addNode(0, 0, 4), n4 = modelStore.addNode(6, 0, 4);
  const c1 = modelStore.addElement(n1, n3), beam = modelStore.addElement(n3, n4), c2 = modelStore.addElement(n2, n4);
  for (const n of [n1, n2]) modelStore.addSupport(n, 'fixed3d');
  const D = modelStore.addLoadCase('D', 'D'), W = modelStore.addLoadCase('W', 'W');
  modelStore.addDistributedLoad3D(beam, 0, 0, -20, -20, undefined, undefined, D);
  modelStore.addNodalLoad3D(n3, 15, 0, 0, 0, 0, 0, W);
  return { n3, n4, c1, beam, c2, D, W };
}

/** A 6 m simply supported beam along X, 10 kN/m down in D. */
function simpleBeam() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
  const beam = modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d', undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: false } });
  modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: false, ty: true, tz: true, rx: false, ry: false, rz: false } });
  const D = modelStore.addLoadCase('D', 'D');
  modelStore.addDistributedLoad3D(beam, 0, 0, -10, -10, undefined, undefined, D);
  return { beam, D };
}

describe('SRSS and ABS are out of design', () => {
  it('(a) a column in compression is not read as one in tension', () => {
    const { c1, D } = portal();
    const lin = modelStore.addCombination('1.2D', [{ caseId: D, factor: 1.2 }]);
    const s = modelStore.addCombination('1.2D srss', [{ caseId: D, factor: 1.2 }]);
    modelStore.updateCombination(s, { method: 'srss' });
    const r = solve();
    // The SRSS result is a magnitude: N = +72 where the column carries −72.
    expect(ef(r.perCombo.get(s)!, c1).nStart).toBeCloseTo(72, 6);
    publishCombinations3D(r);
    expect([...activePerCombo3D().keys()]).toEqual([lin]);
    expect(activeCombinations().map((c) => c.id)).toEqual([lin]);
    const { demands } = computeStationDemands(activePerCombo3D(), activeCombinations(), md() as never);
    const d = steelDemandOf(ef(r.perCombo.get(lin)!, c1), demands.get(c1));
    expect(d.Nc).toBeCloseTo(72, 6);
    expect(d.Nt).toBe(0);
  });

  it('(b) the station demands do not read an SRSS member as one with no loads', () => {
    const { beam, D } = simpleBeam();
    const lin = modelStore.addCombination('D', [{ caseId: D, factor: 1 }]);
    const s = modelStore.addCombination('D srss', [{ caseId: D, factor: 1 }]);
    modelStore.updateCombination(s, { method: 'srss' });
    publishCombinations3D(solve());
    const { stations } = computeStationDemands(activePerCombo3D(), activeCombinations(), md() as never);
    const st = stations.get(beam)!;
    expect(st.comboResults.map((c) => c.comboId)).toEqual([lin]);
    const peak = Math.max(...st.comboResults.flatMap((c) => c.stations.map((x) => Math.max(Math.abs(x.my), Math.abs(x.mz)))));
    expect(peak).toBeCloseTo(45, 6);
  });

  it('(c) the governing search never names an ABS combination', () => {
    const { beam, c1, c2, D, W } = portal();
    const lin = modelStore.addCombination('D + W', [{ caseId: D, factor: 1 }, { caseId: W, factor: 1 }]);
    const a = modelStore.addCombination('D + W abs', [{ caseId: D, factor: 1 }, { caseId: W, factor: 1 }]);
    modelStore.updateCombination(a, { method: 'abs' });
    publishCombinations3D(solve());
    // Over every solved combination the ABS one would govern: |D| + |W| ≥ |D + W|.
    const names = new Map(modelStore.combinations.map((c) => [c.id, c.name]));
    const over = (g: Map<number, GoverningPerElement3D>) => [beam, c1, c2].flatMap((e) => Object.values(g.get(e)!).filter((x) => x).map((x) => x!.comboId));
    expect(over(computeGoverning3D(resultsStore.perCombo3D, names))).toContain(a);
    expect(new Set(over(resultsStore.governing3D))).toEqual(new Set([lin]));
  });

  it('with a stated active list naming one, design still leaves it out', () => {
    const { D } = portal();
    const lin = modelStore.addCombination('D', [{ caseId: D, factor: 1 }]);
    const s = modelStore.addCombination('D srss', [{ caseId: D, factor: 1 }]);
    modelStore.updateCombination(s, { method: 'srss' });
    modelStore.setResultScopes({ active: [lin, s] });
    publishCombinations3D(solve());
    expect([...activePerCombo3D().keys()]).toEqual([lin]);
    // It is still a result to look at.
    expect(resultsStore.perCombo3D.has(s)).toBe(true);
  });
});

describe('the statics check', () => {
  it('leaves SRSS and ABS combinations out, and says so', () => {
    const { D, W } = portal();
    const lin = modelStore.addCombination('D + W', [{ caseId: D, factor: 1 }, { caseId: W, factor: 1 }]);
    const s = modelStore.addCombination('srss', [{ caseId: D, factor: 1 }, { caseId: W, factor: 1 }]);
    modelStore.updateCombination(s, { method: 'srss' });
    publishCombinations3D(solve(true));
    const rows = staticsRows()!;
    expect(rows.combos.map((r) => r.comboId)).toEqual([lin]);
    expect(rows.combos[0]!.worstRelative).toBeLessThan(BALANCED);
    expect(rows.magnitude).toEqual([{ comboId: s, name: 'srss', method: 'srss' }]);
  });

  it('reads the cases as solved: a composite case, a reduced case, a reference case', () => {
    const { n4, D, W } = portal();
    const C = modelStore.addLoadCase('C', '');
    modelStore.updateLoadCaseFields(C, { includes: [{ caseId: D, factor: 1.2 }, { caseId: W, factor: 1.6 }] });
    const L = modelStore.addLoadCase('L', 'L');
    modelStore.addNodalLoad3D(n4, 0, 0, -10, 0, 0, 0, L);
    modelStore.updateLoadCaseFields(L, { reduction: { ratio: 0.6, tributaryAreaM2: 80, elementKind: 'interiorBeam', floorsSupported: 1 } });
    const R = modelStore.addLoadCase('R', 'W');
    modelStore.addNodalLoad3D(n4, 7, 0, 0, 0, 0, 0, R);
    modelStore.updateLoadCaseFields(R, { reference: true });
    const k = modelStore.addCombination('D + R', [{ caseId: D, factor: 1 }, { caseId: R, factor: 1 }]);
    publishCombinations3D(solve(true));
    const rows = staticsRows()!;
    const c = rows.cases.find((r) => r.caseId === C)!, d = rows.cases.find((r) => r.caseId === D)!;
    expect(c.applied.fz).toBeLessThan(-144);
    expect(c.applied.fz).toBeCloseTo(1.2 * d.applied.fz, 6);
    expect(c.worstRelative).toBeLessThan(BALANCED);
    const l = rows.cases.find((r) => r.caseId === L)!;
    expect(l.applied.fz).toBeCloseTo(-6, 6);
    expect(l.worstRelative).toBeLessThan(BALANCED);
    // The reference case is not a row of its own, and the combination taking it is covered.
    expect(rows.cases.some((r) => r.caseId === R)).toBe(false);
    const combo = rows.combos.find((r) => r.comboId === k)!;
    expect(combo.uncovered).toEqual([]);
    expect(combo.applied.fx).toBeCloseTo(7, 6);
    expect(combo.worstRelative).toBeLessThan(BALANCED);
  });
});

describe('SRSS and ABS with P-Delta per combination, and a nonlinear model', () => {
  it('P-Delta: first-order magnitudes, said on the result; none for one with no equilibrium', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 4);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addNodalLoad3D(b, 0, 0.12, -180, 0, 0, 0, 1);
    const under = modelStore.addCombination('0.2 D', [{ caseId: 1, factor: 0.2 }]);
    const s = modelStore.addCombination('0.2 D srss', [{ caseId: 1, factor: 0.2 }]);
    const past = modelStore.addCombination('3 D srss', [{ caseId: 1, factor: 3 }]);
    modelStore.updateCombination(s, { method: 'srss' });
    modelStore.updateCombination(past, { method: 'srss' });
    modelStore.setAnalysis({ perCombination: 'pdelta' });
    const r = solve();
    expect(r.perCombo.get(under)!.secondOrder).toBeDefined();
    expect(r.perCombo.get(s)!.magnitude).toEqual({ method: 'srss', firstOrder: true });
    expect(r.perCombo.has(past)).toBe(false);
    expect(r.unstable).toContain(past);
  });

  it('a nonlinear model refuses them, by name', () => {
    const { c1, D } = portal();
    modelStore.updateElement(c1, { behaviour: 'compressionOnly' } as never);
    const s = modelStore.addCombination('D srss', [{ caseId: D, factor: 1 }]);
    modelStore.updateCombination(s, { method: 'srss' });
    const r = modelStore.solveCombinations3D(false, false, true);
    expect(r).toBe(t('svc.magnitudeNonlinear').replace('{names}', 'D srss'));
  });
});

describe('what an SRSS or ABS combination is combined from', () => {
  it('the settlement, once, as a linear combination takes it', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(5, 0, 0), c = modelStore.addNode(10, 0, 0);
    const e1 = modelStore.addElement(a, b, 'frame'), e2 = modelStore.addElement(b, c, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addSupport(b, 'pinned3d', undefined, { dz: -0.01 });
    modelStore.addSupport(c, 'pinned3d');
    for (const e of [e1, e2]) modelStore.addDistributedLoad3D(e, 0, 0, -10, -10, undefined, undefined, 1);
    const s = modelStore.addCombination('D srss', [{ caseId: 1, factor: 1 }]);
    modelStore.updateCombination(s, { method: 'srss' });
    const r = solve();
    expect(disp(r.perCombo.get(s)!, b).uz).toBeCloseTo(0.01, 9);
  });

  it('a case named twice adds its factors before it is squared', () => {
    const { n3, D } = portal();
    const s = modelStore.addCombination('srss', [{ caseId: D, factor: 1.2 }, { caseId: D, factor: 0.2 }]);
    modelStore.updateCombination(s, { method: 'srss' });
    const r = solve();
    expect(disp(r.perCombo.get(s)!, n3).uz).toBeCloseTo(Math.abs(1.4 * disp(r.perCase.get(D)!, n3).uz), 12);
  });

  it('shell stresses, factored and combined component by component', () => {
    const n: number[][] = [];
    for (let i = 0; i <= 2; i++) { n.push([]); for (let k = 0; k <= 2; k++) n[i]!.push(modelStore.addNode(i, 0, k)); }
    const mat = [...modelStore.materials.keys()][0]!;
    for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) modelStore.addQuad([n[i]![k]!, n[i + 1]![k]!, n[i + 1]![k + 1]!, n[i]![k + 1]!], mat, 0.2);
    for (let i = 0; i <= 2; i++) modelStore.addSupport(n[i]![0]!, 'fixed3d');
    for (let i = 0; i <= 2; i++) modelStore.addNodalLoad3D(n[i]![2]!, 0, 0, -20, 0, 0, 0, 1);
    modelStore.addNodalLoad3D(n[2]![2]!, 5, 0, -10, 0, 0, 0, 2);
    const one = modelStore.addCombination('1.5 D srss', [{ caseId: 1, factor: 1.5 }]);
    const two = modelStore.addCombination('D + 1.6 L srss', [{ caseId: 1, factor: 1 }, { caseId: 2, factor: 1.6 }]);
    modelStore.updateCombination(one, { method: 'srss' });
    modelStore.updateCombination(two, { method: 'srss' });
    const r = solve();
    const q = (res: AnalysisResults3D, id: number) => res.quadStresses!.find((x) => x.elementId === id)!;
    const ids = r.perCase.get(1)!.quadStresses!.map((x) => x.elementId);
    expect(ids).toHaveLength(4);
    for (const id of ids) {
      const d = q(r.perCase.get(1)!, id), l = q(r.perCase.get(2)!, id);
      expect(q(r.perCombo.get(one)!, id).sigmaYy).toBeCloseTo(Math.abs(1.5 * d.sigmaYy), 9);
      expect(q(r.perCombo.get(two)!, id).sigmaYy).toBeCloseTo(Math.hypot(d.sigmaYy, 1.6 * l.sigmaYy), 9);
      expect(q(r.perCombo.get(two)!, id).tauXy).toBeCloseTo(Math.hypot(d.tauXy, 1.6 * l.tauXy), 9);
    }
  });

  it('a variable member keeps its pieces, factored', () => {
    const rect = (h: number) => {
      const params = { b: 0.2, h };
      return modelStore.addSection(toSectionFields({ kind: 'built', name: `R${h}`, shapeType: 'concrete-rect', params, props: computeSectionProperties('concrete-rect', params)!, rotationDeg: 0 }, 0) as never);
    };
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(8, 0, 0), c = modelStore.addNode(16, 0, 0);
    const e = modelStore.addElement(a, b, 'frame'), e2 = modelStore.addElement(b, c, 'frame');
    modelStore.updateElement(e, { sectionId: rect(0.8), variableSection: { sectionJ: rect(0.3) } } as never);
    modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'pinned3d'); modelStore.addSupport(c, 'pinned3d');
    // Hyperstatic: the moment along the member depends on its stiffness along it.
    modelStore.addDistributedLoad3D(e, 0, 0, -10, -10, undefined, undefined, 1);
    modelStore.addDistributedLoad3D(e2, 0, 0, -10, -10, undefined, undefined, 1);
    const s = modelStore.addCombination('1.5 D srss', [{ caseId: 1, factor: 1.5 }]);
    modelStore.updateCombination(s, { method: 'srss' });
    const r = solve();
    const part = ef(r.perCombo.get(s)!, e).combined!.parts[0]!;
    expect(part.pieces?.length).toBe(ef(r.perCase.get(1)!, e).pieces!.length);
    for (const x of [0.1, 0.3, 0.5, 0.8]) {
      expect(evaluateDiagramAt(ef(r.perCombo.get(s)!, e), 'momentY', x)).toBeCloseTo(Math.abs(1.5 * evaluateDiagramAt(ef(r.perCase.get(1)!, e), 'momentY', x)), 6);
    }
  });
});

describe('envelopes leave magnitudes out', () => {
  it('a named envelope and the service sets skip an SRSS combination; a list of only magnitudes keeps the cases’ envelope', () => {
    const { D } = portal();
    const lin = modelStore.addCombination('D', [{ caseId: D, factor: 1 }]);
    const s = modelStore.addCombination('3 D srss', [{ caseId: D, factor: 3 }]);
    modelStore.updateCombination(s, { method: 'srss' });
    const r = solve();
    const both = envelopeOver(r.perCombo, [lin, s])!;
    const alone = envelopeOver(r.perCombo, [lin])!;
    expect(JSON.stringify(both.maxAbsResults3D)).toBe(JSON.stringify(alone.maxAbsResults3D));
    expect(envelopeMembers({ comboIds: [lin, s] }, r.perCombo, r.perCase).map((m) => m.id)).toEqual([lin]);
    // Only magnitudes stated active: the bundle's own envelope, as with no linear combination.
    const scoped = scopeBundle3D(r, { active: [s] }, modelStore.combinations);
    expect(typeof scoped).not.toBe('string');
  });

  it('notional variants are not added to service combinations', () => {
    const { D } = portal();
    const N = modelStore.addLoadCase('N', 'N');
    modelStore.updateLoadCaseFields(N, { notional: { sourceCaseId: D, ratio: 0.002, dir: '+X' } });
    const out = withNotionalVariants([
      { name: '1.4D', factors: [{ caseId: D, factor: 1.4 }], purpose: 'strength', specId: '1' },
      { name: 'D', factors: [{ caseId: D, factor: 1 }], purpose: 'service', specId: 's1' },
    ], modelStore.model.loadCases);
    expect(out.map((c) => c.name)).toEqual(['1.4D', '1.4D + N +X', 'D']);
  });
});

describe('the project workbook', () => {
  it('lists an SRSS combination as a magnitude, and leaves it out of the maxima and the envelope', () => {
    const { D } = portal();
    const lin = modelStore.addCombination('D', [{ caseId: D, factor: 1 }]);
    const s = modelStore.addCombination('3 D srss', [{ caseId: D, factor: 3 }]);
    modelStore.updateCombination(s, { method: 'srss' });
    publishCombinations3D(solve());
    const sheets = currentWorkbookSheets(2, { model: false });
    const sourceRows = (name: string) => sheets.find((x) => x.name === name)!.rows.slice(1);
    // The rows of the end forces name it by its kind.
    const forces = sourceRows('EndForces').filter((r) => r[2] === '3 D srss');
    expect(forces.length).toBeGreaterThan(0);
    expect(forces.every((r) => r[0] === 'magnitude')).toBe(true);
    for (const name of ['Maxima', 'Envelope']) {
      const rows = sourceRows(name);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.flat()).not.toContain('3 D srss');
    }
    void lin;
  });
});

describe('a code combination’s method changed by hand', () => {
  it('marks it edited', () => {
    const { D } = portal();
    const k = modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }], { code: 'cirsoc', family: 'cirsoc', edition: '2025', rule: '1', purpose: 'strength' });
    modelStore.updateCombination(k, { method: 'linear' });
    expect(modelStore.combinations.find((c) => c.id === k)!.origin!.edited).toBeUndefined();
    modelStore.updateCombination(k, { method: 'srss' });
    expect(modelStore.combinations.find((c) => c.id === k)!.origin!.edited).toBe(true);
  });
});

describe('combinations written as composite cases', () => {
  it('reach design as the linear combinations they replace', () => {
    const { c1, D, W } = portal();
    const list = [
      { name: '1.2D + 1.6W', factors: [{ caseId: D, factor: 1.2 }, { caseId: W, factor: 1.6 }], purpose: 'strength' as const, specId: '4' },
      { name: '1.4D', factors: [{ caseId: D, factor: 1.4 }], purpose: 'strength' as const, specId: '1' },
    ];
    modelStore.batch(() => { addCompositeCases(list); });
    const composite = publishAndRead();
    // The same demands as the combinations would have given.
    for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
    for (const c of modelStore.model.loadCases.filter((x) => x.includes)) modelStore.removeLoadCase(c.id);
    for (const c of list) modelStore.addCombination(c.name, c.factors);
    const plain = publishAndRead();
    expect(composite.names).toEqual(plain.names);
    expect(composite.nc).toBeCloseTo(plain.nc, 9);
    expect(composite.nc).toBeGreaterThan(0);

    function publishAndRead() {
      publishCombinations3D(solve());
      const combos = activeCombinations();
      const { demands } = computeStationDemands(activePerCombo3D(), combos, md() as never);
      const any = [...activePerCombo3D().values()][0]!;
      return { names: combos.map((c) => c.name), nc: steelDemandOf(ef(any, c1), demands.get(c1)).Nc };
    }
  });
});
