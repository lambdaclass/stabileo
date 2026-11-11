import { beforeEach, expect, it } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { historyStore } from '../../store/history.svelte';
import { centerlineInput, dynamicInput } from '../../store/dynamic-input';
import * as wasm from '../wasm-solver';
import { solveCombinations3D } from '../solver-service';
import { withNotionalLoads, concreteMaterials, creepSteps, plasticForSolve } from '../advanced-analyses';
import { plasticInput3D } from '../plastic-moments';
import { movingLoadBase3D, buildPath3D, sweepMovingLoad3D } from '../moving-loads-3d';
import { densityRecord } from '../dynamics/requests';
import { withBasicMass } from '../dynamics/basic-mass';
import { planModalResult } from '../../store/seismic-modes';
import { spectralCaseResults } from '../../store/spectral-cases';
import { knownIssueResultDisposition } from '../known-issues';
import { amplification } from '../pdelta-amplification';
import { errorText } from '../../utils/error-text';
import { t, tp } from '../../i18n';
import { cableRefusal, recordFixedReplay } from './sa-059-replay';

beforeEach(() => {
  modelStore.clear(); historyStore.clear();
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false; uiStore.axisConvention3D = 'rightHand';
});
function fixture(braced = true) {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
  const frame = modelStore.addElement(a, b, 'frame'), cable = modelStore.addElement(a, b, 'truss');
  modelStore.updateElement(cable, { behaviour: 'cable' });
  modelStore.addSupport(a, 'fixed3d');
  if (braced) modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: false, rx: false, ry: false, rz: false } });
  modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0, 1);
  return { a, b, frame, cable };
}
it('refuses buckling, influence lines, creep, imperfections and pushover without cable forces', async () => {
  const { b, frame, cable } = fixture(false);
  const input = centerlineInput({ caseDisplacements: true });
  const concrete = modelStore.addMaterial({ name: 'H-30', e: 30000, nu: 0.2, fy: 30, rho: 25 });
  modelStore.updateElement(frame, { materialId: concrete });
  const settings = new Map([...concreteMaterials(modelStore.materials)].map(([id, m]) => [id, { fck: m.fy!, rh: 60, h0: 200, t0: 28, cement: 'N' as const }]));
  expect(settings.size).toBe(1);
  const paths: Array<[string, () => unknown]> = [
    ['buckling', () => wasm.solveBuckling3D(input, 6)],
    ['influence axial', () => wasm.computeInfluenceLine3D({ solver: centerlineInput({ uncut: true }), quantity: 'N', targetElementId: cable, targetPosition: 0.5, gravityDirection: 'z' })],
    ['concrete creep', () => creepSteps(centerlineInput({ caseDisplacements: true }), settings, [365], wasm.solve3D)],
    ['imperfections', () => wasm.solve3D(withNotionalLoads(input, 0.005, 'X').input)],
    ['pushover', () => {
      modelStore.addNodalLoad3D(b, 1, 0, 0, 0, 0, 0, 1);
      const solver = centerlineInput();
      const plastic = plasticForSolve(plasticInput3D(modelStore.sections, modelStore.materials, modelStore.elements), solver, id => modelStore.elements.get(id)?.sectionId);
      return wasm.solvePlastic3D({ solver, sections: plastic.sections, materials: plastic.materials, mpOverrides: plastic.mpOverrides, maxHinges: 20 });
    }],
  ];
  for (const [path, run] of paths) await cableRefusal(path, run, cable);
});
it('refuses modal, spectral, harmonic, time history and the toolbar modal path', async () => {
  const { b, cable } = fixture();
  const { input, densities } = dynamicInput();
  const paths: Array<[string, () => unknown]> = [
    ['modal', () => wasm.solveModal3D(input, densities, 6)],
    ...(['X', 'Y', 'Z'] as const).map(direction => [`spectral ${direction}`, () => wasm.solveSpectral3D({ solver: input, modes: [], densities, spectrum: { name: 'test', points: [{ period: 0, sa: 1 }, { period: 10, sa: 1 }], inG: true }, direction, rule: 'CQC', importanceFactor: 1, reductionFactor: 1, xi: 0.05 })] as [string, () => unknown]),
    ['harmonic', () => wasm.solveHarmonic3D({ solver: input, densities: densityRecord(densities), frequencies: [0.1, 1], dampingRatio: 0.05, responseNodeId: b, responseDof: 'z' })],
    ['time history', () => wasm.solveTimeHistory3D({ solver: input, densities: densityRecord(densities), timeStep: 0.02, nSteps: 10, method: 'newmark', beta: 0.25, gamma: 0.5, dampingXi: 0.05 })],
    ['toolbar modal', () => {
      const basic = withBasicMass(modelStore.buildSolverInput3D(false, false, { basic: false, expandMemberOffsets: false })!, modelStore.model as never, 'izz');
      return wasm.solveModal3D(basic.input, basic.densities);
    }],
    ['seismic/wind plan modal', () => planModalResult({ distributed: [], surface: [] } as never, 0.25)],
  ];
  for (const [path, run] of paths) await cableRefusal(path, run, cable);
});
it('refuses moving envelopes and Basic toolbar P-Delta', async () => {
  const { frame, cable } = fixture();
  await cableRefusal('moving envelope', async () => {
    const base = movingLoadBase3D(modelStore.model as never)!;
    return sweepMovingLoad3D(base, buildPath3D(base, [frame])!, { name: 'one', axles: [{ offset: 0, weight: 10 }] }, { step: 3 });
  }, cable);
  const basic = modelStore.buildSolverInput3D(false, false, { basic: true, expandMemberOffsets: false, caseDisplacements: true })!;
  expect(basic.elements.get(cable)!.type).toBe('cable');
  await cableRefusal('Basic toolbar P-Delta', () => wasm.solvePDelta3D(basic), cable);
});
it('saved spectral cases return a translated refusal without any force payload', () => {
  fixture(false);
  modelStore.model.dynamics = { spectra: [{ id: 1, name: 'test', ordinate: 'Sa', unit: 'g', interpolation: 'linear', points: [[0, 1], [10, 1]] }] };
  modelStore.model.loadCases = [{ id: 2, name: 'spectrum', type: 'E', spectral: { source: { kind: 'user', spectrumId: 1 }, factors: { x: 0, y: 0, z: 1 }, rule: 'cqc', xi: 0.05, scale: 1 } }] as never;
  const r = spectralCaseResults();
  expect(typeof r).toBe('string');
  expect(r).toBe(tp('analysisValidity.cable', { elements: '2' }));
  recordFixedReplay({ path: 'saved spectral case', refused: true, elementForces: [], error: r });
});
it.each([undefined, 'pdelta'] as const)('load combinations retain tension-only cable analysis (perCombination=%s)', (perCombination) => {
  const { frame, cable } = fixture();
  modelStore.model.analysis = { ...modelStore.model.analysis, perCombination };
  const r = solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, [{ id: 1, name: 'D', factors: [{ caseId: 1, factor: 1 }] }]);
  if (!r || typeof r === 'string') throw new Error(String(r));
  expect(r.perCase.size).toBeGreaterThan(0);
  expect(r.perCombo.size).toBe(1);
  for (const result of [...r.perCase.values(), ...r.perCombo.values()]) {
    expect(result.elementForces.find(f => f.elementId === cable)!.nStart).toBe(0);
    expect(result.elementForces.find(f => f.elementId === frame)!.nStart).toBe(-10);
    expect(knownIssueResultDisposition(result).refused).toBe(false);
    recordFixedReplay({ path: `combinations cable (perCombination=${perCombination})`, refused: false, elementForces: result.elementForces });
  }
});
it('the actual P-Delta panel handler with shortening withholds the result and displays the refusal', async () => {
  const { readFileSync } = await import('node:fs');
  const ts = await import('typescript');
  const { resultsStore } = await import('../../store');
  const { b, cable } = fixture();
  const previousInput = centerlineInput();
  previousInput.elements.delete(cable);
  const previous = wasm.solvePDelta3D(previousInput);
  if (typeof previous === 'string') throw new Error(previous);
  expect(previous.converged).toBe(true);
  expect(knownIssueResultDisposition(previous).refused).toBe(false);
  const sup = [...modelStore.supports.values()].find(s => s.nodeId === b)!;
  modelStore.updateSupport(sup.id, { dofRestraints: { tx: true, ty: true, tz: true, rx: false, ry: false, rz: false }, dz: -0.00001 });
  const source = readFileSync(new URL('../../../components/pro/ProAdvancedTab.svelte', import.meta.url), 'utf8');
  resultsStore.setPDeltaResult3D(previous);
  const scope: any = { pdeltaResult: { ...previous, ...amplification(previous) }, pdeltaRefused: null, pdeltaElapsed: null, advancedResults: {}, solving: false, solveError: null, buildInput: centerlineInput, wasmPDelta3D: wasm.solvePDelta3D, knownIssueResultDisposition, amplification, resultsStore, t, tp, errorText };
  function handler(name: string) {
    const script = source.slice(source.indexOf('>', source.indexOf('<script')) + 1, source.indexOf('</script>'));
    const parsed = ts.createSourceFile('ProAdvancedTab.ts', script, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    const declaration = parsed.statements.find((statement): statement is import('typescript').FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
    expect(declaration?.body, name).toBeDefined();
    const js = ts.transpile(declaration!.getText(parsed), { target: ts.ScriptTarget.ES2022 });
    return new Function('scope', `with (scope) { ${js}; return ${name}; }`)(scope);
  }
  expect(scope.pdeltaResult.results).toBe(previous.results);
  expect(resultsStore.pdeltaResult3D).toEqual(previous);
  scope.forgetPDelta = handler('forgetPDelta');
  handler('handlePDelta')();
  expect(scope.solving).toBe(false);
  expect(scope.solveError).toBe(`P-Delta: ${tp('analysisValidity.cable', { elements: String(cable) })}`);
  expect(scope.pdeltaResult).toBeNull();
  expect(resultsStore.pdeltaResult3D).toBeNull();
  recordFixedReplay({ path: 'actual P-Delta handler UI', refused: true, elementForces: [], error: scope.solveError });
});
