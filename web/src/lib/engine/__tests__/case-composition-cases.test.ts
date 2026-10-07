/**
 * The cases as solved, from the review of PRO 24: a notional case on a member solved as pieces, a
 * composite case typed as a load type, the hand reduction's parameters, the rules' symbols.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import '../../store';
import { initSolver } from '../wasm-solver';
import type { ModelData } from '../solver-service';
import { withCaseEffects } from '../case-effects';
import { toSectionFields } from '../../section/section-choice';
import { computeSectionProperties } from '../../data/section-shapes';
import { expandCombinations, presentSymbols } from '../loads/combination-cases';
import { combinationDefinition } from '../loads/combination-definition';
import { templateCombinationSpecs } from '../../store/generated-combinations';
import { resolveMassFactors } from '../dynamics/mass-source';
import { selfWeightFor } from '../self-weight';
import { planSelfWeight } from '../analysis-settings';
import { caseReduction, caseReductionRefusal, holdsGeneratorReducedLoads } from '../loads/case-reduction';
import { CIRSOC101_LOADS } from '../../codes/families/cirsoc';
import { findOccupancy } from '../../codes/cirsoc101/live-loads';
import { rulesFromTemplate, rulesToTemplate } from '../loads/combination-rules';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

const md = () => ({
  nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
  loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
  analysis: modelStore.analysis, groups: modelStore.model.groups,
}) as unknown as ModelData;

const rect = (h: number) => {
  const params = { b: 0.2, h };
  return modelStore.addSection(toSectionFields({ kind: 'built', name: `R${h}`, shapeType: 'concrete-rect', params, props: computeSectionProperties('concrete-rect', params)!, rotationDeg: 0 }, 0) as never);
};
const sumOf = (m: ModelData, caseId: number, k: 'fx' | 'fy') =>
  m.loads.filter((l) => l.data.caseId === caseId && l.type === 'nodal3d').reduce((s, l) => s + (l.data as unknown as Record<string, number>)[k]!, 0);

describe('a notional case on a member solved as pieces', () => {
  /** A 6 m tapered beam, fixed both ends, 20 kN/m in D; N = 0.002 of D along +X. */
  function tapered() {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.updateElement(e, { sectionId: rect(0.6), variableSection: { sectionJ: rect(0.3) } } as never);
    modelStore.addSupport(a, 'fixed3d' as never); modelStore.addSupport(b, 'fixed3d' as never);
    const D = modelStore.addLoadCase('D', 'D');
    modelStore.addDistributedLoad3D(e, 0, 0, -20, -20, undefined, undefined, D);
    const N = modelStore.addLoadCase('N', 'N');
    modelStore.updateLoadCaseFields(N, { notional: { sourceCaseId: D, ratio: 0.002, dir: '+X' } });
    return { a, b, e, D, N };
  }

  it('takes the source’s gravity on the member, at the model’s own nodes', () => {
    const { a, b, N } = tapered();
    const m = withCaseEffects(md(), modelStore.model.loadCases, { includeSelfWeight: false, leftHand: false });
    expect(sumOf(m, N, 'fx')).toBeCloseTo(0.002 * 20 * 6, 9);
    // Half at each end, as the span gives it; no load on a node the model does not have.
    for (const l of m.loads.filter((x) => x.data.caseId === N)) expect([a, b]).toContain((l.data as { nodeId: number }).nodeId);
  });

  it('and its self-weight rows', () => {
    const { D, N } = tapered();
    modelStore.setAnalysis({ selfWeight: [{ caseId: D, direction: 'Z', factor: -1 }] } as never);
    const m = withCaseEffects(md(), modelStore.model.loadCases, { includeSelfWeight: false, leftHand: false });
    const mat = [...modelStore.materials.values()][0]!;
    // γ·A along the taper (kN/m³): A runs linearly from 0.12 to 0.06 m², so 0.09 m² on average.
    const w = (mat.rho ?? 0) * 0.09 * 6;
    expect(w).toBeGreaterThan(0);
    expect(sumOf(m, N, 'fx')).toBeCloseTo(0.002 * (20 * 6 + w), 6);
  });
});

describe('a composite case typed as a load type', () => {
  /** D and L, and C = 1,2 D + 1,6 L typed D, as the new-case form makes it by default. */
  function typedComposite() {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d' as never); modelStore.addSupport(b, 'fixed3d' as never);
    const D = modelStore.model.loadCases[0]!.id;
    modelStore.addDistributedLoad3D(e, 0, 0, -20, -20, undefined, undefined, D);
    const L = modelStore.addLoadCase('L', 'L');
    modelStore.addDistributedLoad3D(e, 0, 0, -10, -10, undefined, undefined, L);
    const C = modelStore.addLoadCase('C', 'D');
    modelStore.updateLoadCaseFields(C, { includes: [{ caseId: D, factor: 1.2 }, { caseId: L, factor: 1.6 }] });
    return { D, L, C };
  }

  it('is not a dead load to the combination generator', () => {
    const { D, C } = typedComposite();
    const cases = modelStore.model.loadCases;
    const specs = templateCombinationSpecs('lrfd', presentSymbols(cases), []);
    const out = expandCombinations(specs, cases);
    const d14 = out.find((c) => c.factors.every((f) => f.factor === 1.4))!;
    expect(d14.factors).toEqual([{ caseId: D, factor: 1.4 }]);
    expect(out.every((c) => c.factors.every((f) => f.caseId !== C))).toBe(true);
    // And named alone in a combination's definition.
    expect(combinationDefinition([{ caseId: D, factor: 1.2 }, { caseId: C, factor: 1 }], cases)).toBe('1.2 D + 1.0 C');
  });

  it('weighs nothing of its own under a code’s mass rule: its cases weigh as themselves', () => {
    const { D, C } = typedComposite();
    const f = resolveMassFactors(modelStore.model.loadCases, { kind: 'preset', presetId: 'cirsoc103-2018', params: {} });
    expect(f.find((x) => x.caseId === D)).toMatchObject({ factor: 1, basis: 'preset' });
    expect(f.find((x) => x.caseId === C)).toMatchObject({ factor: 0, basis: 'composite' });
  });

  it('takes the self-weight of the older switch through its cases, not again as its own', () => {
    const { D, C } = typedComposite();
    const m = withCaseEffects(md(), modelStore.model.loadCases, { includeSelfWeight: true, leftHand: false });
    const rows = (m.analysis?.selfWeight ?? []).filter((r) => r.caseId === C);
    expect(rows.map((r) => r.factor)).toEqual([-1.2]);
    expect((m.analysis?.selfWeight ?? []).filter((r) => r.caseId === D).map((r) => r.factor)).toEqual([-1]);
    expect(selfWeightFor({ analysis: undefined }, modelStore.model.loadCases.find((c) => c.id === C)!, true)).toEqual([]);
    expect(planSelfWeight(modelStore.model.loadCases, true).deadCases).toBe(1);
  });
});

describe('the reduction of an imposed load typed by hand', () => {
  const at = (key: string, a: number, floors = 1) => caseReduction(CIRSOC101_LOADS, { occupancy: findOccupancy(key), tributaryAreaM2: a, elementKind: 'interiorBeam', floorsSupported: floors });

  it('reads Lo and the exclusions off the occupancy of Table 4.1', () => {
    // §4.7.2: an 80 m² interior beam of a dwelling, 0,25 + 4,57/√(2·80).
    expect(at('vivienda', 80)!.ratio).toBeCloseTo(0.25 + 4.57 / Math.sqrt(160), 9);
    // §4.7.3: a machine room, Lo = 7,5 kN/m², is not reduced on one floor (it was 0,611 with Lo = 1)
    // and by 20 % on two.
    expect(at('cuarto_maquinas', 80)!).toMatchObject({ ratio: 1, lo: 7.5 });
    expect(at('cuarto_maquinas', 80, 2)!.ratio).toBeCloseTo(0.8, 12);
    // §4.7.4: a passenger garage; §4.7.5: public assembly; Table 4.1 note (a).
    expect(at('garaje_autos', 80)!.ratio).toBe(1);
    expect(at('garaje_autos', 80, 2)!.ratio).toBeCloseTo(0.8, 12);
    expect(at('reunion_asientos_fijos', 80)!.ratio).toBe(1);
    expect(at('deposito_liviano', 80)!.ratio).toBe(1);
    // With no area, nothing to work out.
    expect(at('vivienda', 0)).toBeNull();
  });

  it('only for L, and not twice', () => {
    expect(caseReductionRefusal('L', false)).toBeNull();
    for (const ty of ['Lr', 'Cr', 'Tr', 'D']) expect(caseReductionRefusal(ty, false)).toBe('notImposed');
    expect(caseReductionRefusal('L', true)).toBe('generatorReduced');
    const loads = [{ data: { caseId: 2, generatedBy: 'cirsoc101-2025-basis' } }, { data: { caseId: 3 } }];
    expect(holdsGeneratorReducedLoads(loads, 2, { applyLiveReduction: true })).toBe(true);
    expect(holdsGeneratorReducedLoads(loads, 2, undefined)).toBe(true);
    expect(holdsGeneratorReducedLoads(loads, 2, { applyLiveReduction: false })).toBe(false);
    expect(holdsGeneratorReducedLoads(loads, 3, { applyLiveReduction: true })).toBe(false);
  });
});

describe('mass, accidental and ice cases', () => {
  it('enter through a project’s rule', () => {
    const D = modelStore.model.loadCases[0]!.id;
    const A = modelStore.addLoadCase('Impact', 'A'), I = modelStore.addLoadCase('Ice', 'I'), M = modelStore.addLoadCase('Equipment', 'M');
    const rules = [{ id: 'r1', purpose: 'strength' as const, terms: [{ symbol: 'D' as const, factor: 1.2 }, { symbol: 'A' as const, factor: 1 }, { symbol: 'I' as const, factor: 0.5 }] }];
    const out = expandCombinations(templateCombinationSpecs('project', presentSymbols(modelStore.model.loadCases), rules), modelStore.model.loadCases);
    expect(out).toHaveLength(1);
    expect(out[0]!.factors).toEqual([{ caseId: D, factor: 1.2 }, { caseId: A, factor: 1 }, { caseId: I, factor: 0.5 }]);
    expect(out[0]!.name).toBe('1.2 D + 1.0 A + 0.5 I');
    // A template file keeps them.
    expect(rulesFromTemplate(rulesToTemplate(rules, 't'))!.rules[0]!.terms.map((t) => t.symbol)).toEqual(['D', 'A', 'I']);
    // And no code rule names them: the automatic combinations leave them out.
    const auto = expandCombinations(templateCombinationSpecs('lrfd', presentSymbols(modelStore.model.loadCases), []), modelStore.model.loadCases);
    expect(auto.every((c) => c.factors.every((f) => ![A, I, M].includes(f.caseId)))).toBe(true);
  });

  it('a mass case weighs whole under CIRSOC 103', () => {
    const M = modelStore.addLoadCase('Equipment', 'M'), Cr = modelStore.addLoadCase('Crane', 'Cr');
    const f = resolveMassFactors(modelStore.model.loadCases, { kind: 'preset', presetId: 'cirsoc103-2018', params: {} });
    expect(f.find((x) => x.caseId === M)).toMatchObject({ factor: 1, basis: 'preset' });
    expect(f.find((x) => x.caseId === Cr)).toMatchObject({ factor: 0, basis: 'notMass' });
  });
});

describe('the solve of every load, without combinations', () => {
  it('reduces a reduced case and leaves a reference case out', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d' as never); modelStore.addSupport(b, 'fixed3d' as never);
    const D = modelStore.model.loadCases[0]!.id;
    modelStore.addDistributedLoad3D(e, 0, 0, -20, -20, undefined, undefined, D);
    const L = modelStore.addLoadCase('L', 'L');
    modelStore.addDistributedLoad3D(e, 0, 0, -10, -10, undefined, undefined, L);
    modelStore.updateLoadCaseFields(L, { reduction: { ratio: 0.6, tributaryAreaM2: 80, elementKind: 'interiorBeam', floorsSupported: 1 } });
    const W = modelStore.addLoadCase('W', 'W');
    modelStore.addDistributedLoad3D(e, 0, 0, -50, -50, undefined, undefined, W);
    modelStore.updateLoadCaseFields(W, { reference: true });
    const single = modelStore.solve3D(false, false, true);
    if (!single || typeof single === 'string') throw new Error(String(single));
    const fz = single.reactions.reduce((s, r) => s + r.fz, 0);
    expect(fz).toBeCloseTo((20 + 0.6 * 10) * 6, 6);
  });
});
