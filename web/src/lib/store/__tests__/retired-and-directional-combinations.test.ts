import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { addCirsocCombinations } from '../../actions/load-states';
import type { CombinationTerm, LoadCombinationSpec } from '../../codes/cirsoc101/combinations';
import * as caseExpansion from '../../engine/loads/combination-cases';
import { expandCombinations } from '../../engine/loads/combination-cases';
import { expandPlannedCombinations } from '../../engine/loads/load-plan-delta';
import { buildLoadPlan, type LoadPlan } from '../../engine/loads/load-plan';
import { mesh } from '../../engine/loads/__tests__/snow-surface-round2-fixture';
import { regulations } from '../../engine/loads/__tests__/snow-roof-plane-fixture';
import { withNotionalVariants } from '../../engine/loads/notional-combinations';
import { initSolver } from '../../engine/wasm-solver';
import { modelFeatures } from '../../provenance/model-features';
import { t, tp } from '../../i18n';
import { fixtureLoadCases } from '../../templates/load-fixture';
import { applyLoadPlan, previewLoadPlan } from '../apply-load-plan';
import { engineGuarded, errorText, runEngineAction } from '../engine-action';
import { deserializeProject, serializeProject } from '../file';
import * as generated from '../generated-combinations';
import { modelStore, uiStore } from '../index';

const applyOptions = { clearExisting: true, bothSenses: false, nameOf: (key: string) => key };
const terms = [{ symbol: 'D', factor: 1 }, { symbol: 'W', factor: 1 }] as const;
const gravity = { id: 11, type: 'D', name: 'Gravity' } as const;
const winds = [
  { id: 12, type: 'W', name: 'Current wind' },
  { id: 13, type: 'W', name: 'Former wind' },
] as const;

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  uiStore.analysisMode = 'pro';
  modelStore.clear();
});

function rule(...terms: CombinationTerm[]): LoadCombinationSpec {
  return { id: 'directions', label: 'Directions', refs: [], notes: [], terms };
}

function plan(spec: LoadCombinationSpec, cases: readonly {
  id: number; type: LoadPlan['cases'][number]['type']; name: string; alternatives?: string;
}[]): LoadPlan {
  const base = buildLoadPlan({
    model: mesh([[[0, 0, 3], [10, 0, 3]]]), regulations: regulations(), dead: [],
    occupancyKey: 'vivienda', tributaryWidth: 1, reductionElementKind: 'interiorBeam',
    floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, projectCombinations: [spec],
  });
  expect(base.outcome).toBe('READY');
  return {
    ...base, cases: cases.map(({ id, name, ...c }) => ({ ...c, nameKey: name, existingId: id, own: true })),
    distributed: [], nodal: [], surface: [], thermal: [], seismicGeneration: 'static',
  };
}

function installCases(cases: typeof modelStore.loadCases, spec: LoadCombinationSpec) {
  modelStore.restore({
    ...modelStore.snapshot(), loadCases: cases, combinations: [],
    combinationRules: [{ id: spec.id, purpose: 'strength', terms: spec.terms }],
  });
}

function loadsCandidates(template: 'project' | 'lrfd' | 'service') {
  const source = readFileSync('src/components/pro/ProLoadsTab.svelte', 'utf8').split('</script>')[0]!;
  const ast = ts.createSourceFile('ProLoadsTab.ts', source.slice(source.indexOf('>') + 1), ts.ScriptTarget.ESNext, true);
  const names = ['buildCandidates', 'candidatesFrom', 'openComboGenerator'];
  const declarations = ast.statements.filter(d => ts.isFunctionDeclaration(d) && names.includes(d.name?.text ?? ''));
  const { outputText } = ts.transpileModule(declarations.map(d => d.getText(ast)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  const deps = { ...caseExpansion, ...generated, errorText, runEngineAction, modelStore, uiStore, t, withNotionalVariants };
  const run = new Function(...Object.keys(deps), 'template', `
    const combinations = modelStore.combinations;
    const asComposite = false, addNotionals = false, windBySign = false, seismicBothSenses = false;
    let candidateCombos = [], activeTemplate, showComboModal = false;
    ${outputText}
    openComboGenerator(template);
    return showComboModal ? candidateCombos : null;
  `);
  return run(...Object.values(deps), template) as { generated: caseExpansion.CaseCombination }[] | null;
}

function caseIds(combinations: readonly { factors: ReadonlyArray<{ caseId: number }> }[]) {
  return combinations.map(c => c.factors.map(f => f.caseId).sort((a, b) => a - b).join('+')).sort();
}

it('#2566 — saved project rules exclude a wind case emptied by replacement', () => {
  const spec = rule(...terms);
  installCases([gravity, ...winds], spec);
  const node = modelStore.addNode(0, 0, 0);
  const previous = plan(spec, [gravity, ...winds]);
  previous.nodal = [
    { nodeId: node, caseType: 'W', caseIndex: 1, fx: 3, fy: 0, fz: 0 },
    { nodeId: node, caseType: 'W', caseIndex: 2, fx: -3, fy: 0, fz: 0 },
  ];
  expect(applyLoadPlan(previous, applyOptions)).toBeUndefined();
  const replacement = plan(spec, [gravity, winds[0]]);
  replacement.nodal = previous.nodal.slice(0, 1);
  expect(applyLoadPlan(replacement, applyOptions)).toBeUndefined();
  expect(deserializeProject(serializeProject())).toBe(true);
  expect(modelStore.loadCases.map(c => c.id)).toContain(winds[1].id);
  expect.soft(modelFeatures(modelStore.snapshot())).toContain('retiredAutoLoadsCases');
  const expected = [`${gravity.id}+${winds[0].id}`];
  expect.soft(caseIds(modelStore.combinations)).toEqual(expected);
  expect.soft(caseIds(expandCombinations([spec], modelStore.loadCases))).toEqual(expected);
  expect.soft(caseIds(loadsCandidates('project')!.map(c => c.generated))).toEqual(expected);
  expect.soft(previewLoadPlan(replacement, applyOptions.nameOf, { replaceExisting: true }).after.combinations).toBe(1);
  modelStore.addNodalLoad3D(node, -3, 0, 0, 0, 0, 0, winds[1].id);
  expect(previewLoadPlan(replacement, applyOptions.nameOf, { replaceExisting: true }).after.combinations).toBe(2);
  expect(applyLoadPlan(replacement, applyOptions)).toBeUndefined();
  expect(caseIds(modelStore.combinations)).toEqual(['11+12', '11+13']);
});

it.each(['2d', '3d'] as const)(
  '#2566 — rule generation in %s follows direct loads on a retired case', dim => {
    const spec = rule(...terms);
    const retired = { ...winds[1], autoLoadsRetired: true as const };
    const manual = { id: 14, type: 'W', name: 'Intentional no wind' };
    uiStore.analysisMode = dim;
    installCases([gravity, winds[0], retired, manual], spec);
    const node = modelStore.addNode(0, 0, 0);
    if (dim === '2d') modelStore.addNodalLoad(node, 0, -3, 0, gravity.id);
    else modelStore.addNodalLoad3D(node, 0, 0, -3, 0, 0, 0, gravity.id);
    const from = () => {
      for (const combination of modelStore.combinations) modelStore.removeCombination(combination.id);
      expect(addCirsocCombinations()).toBeGreaterThan(0);
      return modelStore.combinations;
    };
    const fixture = () => fixtureLoadCases({
      name: 'Retired wind', loadCases: modelStore.loadCases, combinations: [],
      loads: modelStore.loads.map(({ type, data }) => ({ type, data: { caseId: data.caseId } })),
    }, { loadCases: [], combinations: [] }).combinations;
    const expected = (occupied: boolean) => {
      expect.soft(caseIds(loadsCandidates('project')!.map(c => c.generated))).toEqual(
        occupied ? ['11+12', '11+13', '11+14'] : ['11+12', '11+14']);
      for (const combinations of [from(), fixture(), ...(['lrfd', 'service'] as const).map(template =>
        loadsCandidates(template)!.map(c => c.generated))]) {
        const ids = new Set(combinations.flatMap(c => c.factors.map(f => f.caseId)));
        expect.soft(ids.has(retired.id)).toBe(occupied);
        expect.soft(ids.has(winds[0].id)).toBe(true);
        expect.soft(ids.has(manual.id)).toBe(true);
      }
    };
    expected(false);
    const load = dim === '2d'
      ? modelStore.addNodalLoad(node, 3, 0, 0, retired.id)
      : modelStore.addNodalLoad3D(node, 3, 0, 0, 0, 0, 0, retired.id);
    expected(true);
    expect(modelStore.removeLoad(load)).toBe(true);
    expected(false);
  },
);

const sharedCases = [
  { id: 21, type: 'W', name: 'Wind A', alternatives: 'A' },
  { id: 22, type: 'E', name: 'Seismic A', alternatives: 'A' },
  { id: 23, type: 'W', name: 'Wind B', alternatives: 'B' },
  { id: 24, type: 'E', name: 'Seismic B', alternatives: 'B' },
] as const;
const standalone = { id: 25, type: 'W', name: 'Standalone wind' } as const;
const lateralTerms = [...terms, { symbol: 'E', factor: 1 }] as const;

it.each(['2d', 'pro'] as const)(
  '#2566 — a %s rule refuses a standalone direction that two shared sets leave out', mode => {
    uiStore.analysisMode = mode;
    const spec = rule(...lateralTerms);
    const cases = [gravity, ...sharedCases, standalone];
    installCases(cases, spec);
    const input = plan(spec, cases);
    const before = modelStore.snapshot();
    const refusal = 'combos.refused.directionalCase';
    expect.soft(() => expandCombinations([spec], cases)).toThrow(refusal);
    expect.soft(() => expandPlannedCombinations(input, {})).toThrow(refusal);

    const toast = vi.spyOn(uiStore, 'toast').mockImplementation(() => {});
    try {
      expect.soft(loadsCandidates('project')).toBeNull();
      expect.soft(toast).toHaveBeenCalledWith(expect.stringContaining(standalone.name), 'error');
    } finally {
      toast.mockRestore();
    }

    const message = tp(refusal, { rule: spec.label, case: standalone.name });
    expect.soft(engineGuarded(() => previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: true })).error).toBe(message);
    expect.soft(engineGuarded(() => applyLoadPlan(input, applyOptions)).error).toBe(message);
    expect(modelStore.snapshot()).toEqual(before);
  },
);

it('#2566 two shared sets with no competing standalone wind retain both legal combinations', () => {
  const spec = rule(...lateralTerms);
  const cases = [gravity, ...sharedCases];
  installCases(cases, spec);
  const input = plan(spec, cases);
  expect(caseIds(expandCombinations([spec], cases))).toEqual(['11+21+24', '11+22+23']);
  expect(previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: true }).after.combinations).toBe(2);
  expect(applyLoadPlan(input, applyOptions)).toBeUndefined();
  expect(caseIds(modelStore.combinations)).toEqual(['11+21+24', '11+22+23']);
  expect(caseIds(expandCombinations([spec], [gravity, ...sharedCases.slice(0, 2), standalone])))
    .toEqual(['11+21', '11+22+25']);
});
