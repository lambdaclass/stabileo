import { beforeEach, expect, it } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { historyStore } from '../../store/history.svelte';
import { centerlineInput, dynamicInput } from '../../store/dynamic-input';
import * as wasm from '../wasm-solver';
import { knownIssueResultDisposition } from '../known-issues';
import { amplification } from '../pdelta-amplification';
import { validateAndSolve3D, solveCombinations3D } from '../solver-service';

beforeEach(() => {
  modelStore.clear(); historyStore.clear();
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false; uiStore.axisConvention3D = 'rightHand';
});
function fixture(braced = false) {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
  const frame = modelStore.addElement(a, b, 'frame');
  const cable = modelStore.addElement(a, b, 'truss');
  modelStore.updateElement(cable, { behaviour: 'cable' });
  modelStore.addSupport(a, 'fixed3d');
  if (braced) modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: false, rx: false, ry: false, rz: false } });
  modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0, 1);
  return { a, b, frame, cable };
}
function record(path: string, r: any, cable: number) {
  const forceRows: any[] = [];
  const diagnostics: any[] = [];
  const seen = new Set<object>();
  function scan(v: any, at = '') {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (v.elementId === cable && ('nStart' in v || 'axialForce' in v || 'tension' in v)) forceRows.push({ at, ...v });
    if (v instanceof Map) for (const [key, value] of v) scan(value, `${at}.map.${key}`);
    for (const [key, value] of Object.entries(v)) {
      if (/diagnostic|warning/i.test(key)) diagnostics.push({ at: `${at}.${key}`, value });
      scan(value, `${at}.${key}`);
    }
  }
  scan(r);
  console.log(JSON.stringify({ path, forceRows, diagnostics, disposition: knownIssueResultDisposition(r), converged: r?.converged, isStable: r?.isStable, keys: Object.keys(r ?? {}) }));
  return r;
}
it('replays advanced P-Delta through the actual store builder and WASM entry', () => {
  const { cable } = fixture(true);
  const input = centerlineInput({ caseDisplacements: true });
  expect(input.elements.get(cable)?.type).toBe('truss');
  const r = record('PRO advanced P-Delta', wasm.solvePDelta3D(input), cable);
  console.log(JSON.stringify({ amplification: amplification(r), displacements: r.results.displacements }));
  expect(r.results.elementForces.find((f: any) => f.elementId === cable)!.nStart).toBeLessThan(0);
  expect(knownIssueResultDisposition(r).messages).toEqual([]);
  expect(r.converged).toBe(true);
  expect(amplification(r).stable).toBe(true);
});
it('replays the automatic dedicated cable route as a control', () => {
  const { cable } = fixture();
  record('Solve automatic cable', validateAndSolve3D(modelStore.model as never, false, false), cable);
  record('Combinations automatic cable', solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, [{ id: 1, name: 'D', factors: [{ caseId: 1, factor: 1 }] }]), cable);
});
it('replays the other advanced static entries', async () => {
  const { a, b, frame, cable } = fixture(true);
  const input = centerlineInput({ caseDisplacements: true });
  const { withFirstModeB2 } = await import('../../actions/second-order');
  const { withNotionalLoads, notionalLoadsRefusal, stagedStagesPayload, creepSteps } = await import('../advanced-analyses');
  const { solveDetailed3D } = await import('../solver-detailed-3d');
  const { solveForceMethod3D } = await import('../force-method/solve-3d');
  const { runDirectAnalysis } = await import('../direct-analysis');
  const cases = [{ id: 1, name: 'D', factors: [{ caseId: 1, factor: 1 }] }];
  const attempts: Array<[string, () => any]> = [
    ['toolbar P-Delta', () => withFirstModeB2(input, wasm.solvePDelta3D(input))],
    ['advanced/toolbar buckling', () => wasm.solveBuckling3D(centerlineInput(), 6)],
    ['advanced corotational', () => wasm.solveCorotational3D(input, 50, 1e-6, 10)],
    ['advanced Winkler', () => wasm.solveWinkler3D({ solver: input, foundationSprings: [{ elementId: frame, ky: 10000, kz: 10000 }] })],
    ['advanced SSI', () => wasm.solveSSI3D({ solver: input, soilSprings: [{ nodeId: b, direction: 1, tributaryLength: 1, curve: { type: 'py_soft_clay', su: 50, gamma_eff: 18, d: 0.6, depth: 5, eps_50: 0.01, j: 0.5 } }], maxIter: 50, tolerance: 1e-4 })],
    ['advanced staged', () => wasm.solveStaged3D({ solver: centerlineInput(), stages: stagedStagesPayload([{ name: 'one', elementsAdded: [frame, cable], elementsRemoved: [], platesAdded: [], platesRemoved: [], quadsAdded: [], quadsRemoved: [], caseIds: [1] }], new Map([[1, [0]]]), [a, b]) })],
    ['advanced creep', () => creepSteps(input, new Map([[input.elements.get(frame)!.materialId, { fck: 30, rh: 60, h0: 200, t0: 28, cement: 'N' }]]), [365], wasm.solve3D)],
    ['advanced influence axial', () => wasm.computeInfluenceLine3D({ solver: centerlineInput({ uncut: true }), quantity: 'N', targetElementId: cable, targetPosition: 0.5, gravityDirection: 'z' })],
    ['explained stiffness', () => solveDetailed3D(input)],
    ['explained flexibility', () => solveForceMethod3D(input)],
    ['direct analysis', () => runDirectAnalysis(modelStore.model as never, modelStore.model.loadCases, cases, { includeSelfWeight: false })],
    ['P-Delta per combination cable route', () => { modelStore.model.analysis = { ...modelStore.model.analysis, perCombination: 'pdelta' }; return solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, cases); }],
  ];
  for (const [path, run] of attempts) {
    try { record(path, await run(), cable); }
    catch (e) { console.log(JSON.stringify({ path, error: String(e) })); }
  }
  console.log(JSON.stringify({ path: 'advanced imperfections on braced fixture', refusal: notionalLoadsRefusal(input, 0.005, 'X') }));
  modelStore.removeSupport([...modelStore.supports.values()].find(s => s.nodeId === b)!.id);
  const unbraced = centerlineInput({ caseDisplacements: true });
  record('advanced imperfections unbraced', wasm.solve3D(withNotionalLoads(unbraced, 0.005, 'X').input), cable);
});
it('replays dynamic entries', async () => {
  const { b, cable } = fixture(true);
  const { input, densities } = dynamicInput();
  const { densityRecord, spectralModesFrom } = await import('../dynamics/requests');
  const modes = wasm.solveModal3D(input, densities, 6);
  record('advanced modal', modes, cable);
  record('advanced spectral', wasm.solveSpectral3D({ solver: input, modes: spectralModesFrom(modes), densities, spectrum: { name: 'test', points: [[0, 1], [10, 1]], inG: true }, direction: 'Z', rule: 'CQC', importanceFactor: 1, reductionFactor: 1, xi: 0.05 }), cable);
  record('advanced harmonic', wasm.solveHarmonic3D({ solver: input, densities: densityRecord(densities), frequencies: [0.1, 1], dampingRatio: 0.05, responseNodeId: b, responseDof: 'z' }), cable);
  record('advanced time history', wasm.solveTimeHistory3D({ solver: input, densities: densityRecord(densities), timeStep: 0.02, nSteps: 10, method: 'newmark', beta: 0.25, gamma: 0.5, dampingXi: 0.05 }), cable);
});
it('no-warning P-Delta under imposed shortening', () => {
  const { b, cable } = fixture(true);
  const support = [...modelStore.supports.values()].find(s => s.nodeId === b)!;
  modelStore.updateSupport(support.id, { dofRestraints: { tx: true, ty: true, tz: true, rx: false, ry: false, rz: false }, dz: -0.00001 });
  const input = centerlineInput({ caseDisplacements: true });
  const r = record('PRO advanced P-Delta imposed shortening', wasm.solvePDelta3D(input), cable);
  console.log(JSON.stringify({ path: 'shortening detail', input: { supports: [...input.supports], sections: [...input.sections], materials: [...input.materials] }, result: r }));
  expect(r.results.elementForces.find((f: any) => f.elementId === cable)!.nStart).toBeLessThan(0);
  expect(knownIssueResultDisposition(r).messages).toEqual([]);
  expect(r.converged).toBe(true);
  expect(amplification(r).stable).toBe(true);
});
it('remaining paths: moving sweep, force recovery, modal plan and spectral statics', async () => {
  const { b, frame, cable } = fixture(true);
  const { movingLoadBase3D, buildPath3D, sweepMovingLoad3D } = await import('../moving-loads-3d');
  const base = movingLoadBase3D(modelStore.model as never)!;
  const moving = await sweepMovingLoad3D(base, buildPath3D(base, [frame])!, { name: 'one', axles: [{ offset: 0, weight: 10 }] }, { step: 3 });
  record('moving sweep', moving, cable);
  console.log(JSON.stringify({ path: 'moving detail', result: { ...moving, elements: [...moving.elements] } }));
  const { solveDetailed3D } = await import('../solver-detailed-3d');
  const { solveForceMethod3D } = await import('../force-method/solve-3d');
  const input = centerlineInput();
  const detailed = solveDetailed3D(input);
  const flexibility = solveForceMethod3D(input);
  console.log(JSON.stringify({ path: 'explained detail', stiffness: detailed.elementForces, flexibility: { keys: Object.keys(flexibility), final: flexibility.final, result: flexibility.results } }));
  const { planModalResult } = await import('../../store/seismic-modes');
  record('seismic/wind plan modal', planModalResult({ distributed: [], surface: [] } as never, 0.25), cable);
  const { imposedInput } = await import('../../store/spectral-cases');
  const { modeShapeField } = await import('../spectral-case');
  const dyn = dynamicInput();
  const modal = wasm.solveModal3D(dyn.input, dyn.densities, 6);
  record('spectral-case mode statics', wasm.solve3D(imposedInput(dyn.input, modeShapeField(modal.modes[0]!))), cable);
});
it('actual P-Delta panel handler with no-warning shortened cable', async () => {
  const { readFileSync } = await import('node:fs');
  const ts = await import('typescript');
  const { resultsStore } = await import('../../store');
  const { t, tp } = await import('../../i18n');
  const { errorText } = await import('../../utils/error-text');
  const { b, cable } = fixture(true);
  const sup = [...modelStore.supports.values()].find(s => s.nodeId === b)!;
  modelStore.updateSupport(sup.id, { dofRestraints: { tx: true, ty: true, tz: true, rx: false, ry: false, rz: false }, dz: -0.00001 });
  const source = readFileSync(new URL('../../../components/pro/ProAdvancedTab.svelte', import.meta.url), 'utf8');
  const scope: any = { pdeltaResult: null, pdeltaRefused: null, pdeltaElapsed: null, advancedResults: {}, solving: false, solveError: null, buildInput: centerlineInput, wasmPDelta3D: wasm.solvePDelta3D, knownIssueResultDisposition, amplification, resultsStore, t, tp, errorText };
  function handler(name: string) {
    const start = source.indexOf(`  function ${name}(`);
    const end = source.indexOf('\n  }', start) + 4;
    const js = ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ES2022 });
    return new Function('scope', `with (scope) { ${js}; return ${name}; }`)(scope);
  }
  scope.forgetPDelta = handler('forgetPDelta');
  handler('handlePDelta')();
  expect(scope.solveError).toBeNull();
  expect(scope.pdeltaRefused).toBeNull();
  expect(scope.pdeltaResult.converged).toBe(true);
  expect(scope.pdeltaResult.stable).toBe(true);
  expect(knownIssueResultDisposition(scope.pdeltaResult).messages).toEqual([]);
  expect(resultsStore.pdeltaResult3D!.results.elementForces.find(f => f.elementId === cable)!.nStart).toBeLessThan(0);
  console.log(JSON.stringify({ path: 'actual P-Delta handler UI', solveError: scope.solveError, pdeltaRefused: scope.pdeltaRefused, converged: scope.pdeltaResult.converged, stable: scope.pdeltaResult.stable, b2: scope.pdeltaResult.b2, disposition: knownIssueResultDisposition(scope.pdeltaResult), force: resultsStore.pdeltaResult3D!.results.elementForces.find(f => f.elementId === cable) }));
});
it('additional paths: toolbar modal, horizontal spectra, pushover and saved spectral cases', async () => {
  const { cable, b } = fixture();
  const { withBasicMass } = await import('../dynamics/basic-mass');
  const basic = withBasicMass(modelStore.buildSolverInput3D(false, false, { basic: false, expandMemberOffsets: false })!, modelStore.model as never, 'izz');
  record('toolbar modal', wasm.solveModal3D(basic.input, basic.densities), cable);
  const { spectralModesFrom } = await import('../dynamics/requests');
  const dyn = dynamicInput();
  const modal = wasm.solveModal3D(dyn.input, dyn.densities, 6);
  for (const direction of ['X', 'Y'] as const) record(`advanced spectral ${direction}`, wasm.solveSpectral3D({ solver: dyn.input, modes: spectralModesFrom(modal), densities: dyn.densities, spectrum: { name: 'test', points: [[0, 1], [10, 1]], inG: true }, direction, rule: 'CQC', importanceFactor: 1, reductionFactor: 1, xi: 0.05 }), cable);
  modelStore.addNodalLoad3D(b, 1, 0, 0, 0, 0, 0, 1);
  const { plasticInput3D } = await import('../plastic-moments');
  const { plasticForSolve } = await import('../advanced-analyses');
  const input = centerlineInput();
  const plastic = plasticForSolve(plasticInput3D(modelStore.sections, modelStore.materials, modelStore.elements), input, id => modelStore.elements.get(id)?.sectionId);
  record('advanced pushover', wasm.solvePlastic3D({ solver: input, sections: plastic.sections, materials: plastic.materials, mpOverrides: plastic.mpOverrides, maxHinges: 20 }), cable);
  modelStore.model.dynamics = { spectra: [{ id: 1, name: 'test', ordinate: 'Sa', unit: 'g', interpolation: 'linear', points: [[0, 1], [10, 1]] }] };
  modelStore.model.loadCases = [{ id: 2, name: 'spectrum', type: 'E', spectral: { source: { kind: 'user', spectrumId: 1 }, factors: { x: 0, y: 0, z: 1 }, rule: 'cqc', xi: 0.05, scale: 1 } }] as never;
  const { spectralCaseResults } = await import('../../store/spectral-cases');
  record('saved spectral case', spectralCaseResults(), cable);
});
it('concrete creep through the panel material filter and automatic cable forces', async () => {
  const { b, cable, frame } = fixture(true);
  const { concreteMaterials, creepSteps } = await import('../advanced-analyses');
  const concrete = modelStore.addMaterial({ name: 'H-30', e: 30000, nu: 0.2, fy: 30, rho: 25 });
  modelStore.updateElement(frame, { materialId: concrete });
  const settings = new Map([...concreteMaterials(modelStore.materials)].map(([id, m]) => [id, { fck: m.fy!, rh: 60, h0: 200, t0: 28, cement: 'N' as const }]));
  const r = { steps: creepSteps(centerlineInput({ caseDisplacements: true }), settings, [365], wasm.solve3D) };
  record('advanced concrete creep filtered', r, cable);
  expect(settings.size).toBe(1);
  modelStore.clear();
  const control = fixture(true);
  const solved: any = validateAndSolve3D(modelStore.model as never, false, false);
  console.log(JSON.stringify({ path: 'automatic cable force control', elementForces: solved.elementForces, nonlinear: solved.nonlinear }));
  expect(solved.elementForces.find((f: any) => f.elementId === control.cable)!.nStart).toBe(0);
  expect(solved.elementForces.find((f: any) => f.elementId === control.frame)!.nStart).toBe(-10);
});
it('influence coefficients and basic toolbar share the cable substitution', async () => {
  const { cable } = fixture(true);
  const influence = wasm.computeInfluenceLine3D({ solver: centerlineInput({ uncut: true }), quantity: 'N', targetElementId: cable, targetPosition: 0.5, gravityDirection: 'z' });
  console.log(JSON.stringify({ path: 'influence detail', result: influence }));
  const { withFirstModeB2 } = await import('../../actions/second-order');
  const basic = modelStore.buildSolverInput3D(false, false, { basic: true, expandMemberOffsets: false, caseDisplacements: true })!;
  expect(basic.elements.get(cable)!.type).toBe('truss');
  record('basic toolbar P-Delta', withFirstModeB2(basic, wasm.solvePDelta3D(basic)), cable);
});
