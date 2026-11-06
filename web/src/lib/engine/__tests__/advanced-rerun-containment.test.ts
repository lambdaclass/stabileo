import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { compile } from 'svelte/compiler';
import { describe, it, expect, vi } from 'vitest';
import { knownIssueResultDisposition } from '../known-issues';
import { errorText } from '../../utils/error-text';
import { eigenRefusalText } from '../finite-spectrum-warning';
import { timeHistoryRefusal } from '../dynamics/time-history-refusal';

const source = readFileSync(new URL('../../../components/pro/ProAdvancedTab.svelte', import.meta.url), 'utf8');
// Execute the actual component handlers with their reactive bindings represented by this scope.
function handler(name: string, scope: Record<string, any>) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf('\n  }', start) + 4;
  const js = ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ES2022 });
  return new Function('scope', `with (scope) { ${js}; return ${name}; }`)(scope);
}
const diagnostic = { code: 'known_issue', severity: 'error', phase: 'BU-BOUND', value: 741, message: 'ENGINE' };
const refusal = JSON.stringify({ structuredDiagnostics: [diagnostic] });
function setup() {
  const scope: Record<string, any> = {
    advancedResults: {}, modalResult: null, spectralResult: null, bucklingResult: null, pdeltaResult: null,
    modalModelVersion: null, modalAutoNote: null, modalConstrained: false, modalAuto: false,
    modalElapsed: null, bucklingElapsed: null, pdeltaElapsed: null, pdeltaRefused: null,
    numModes: 2, numBucklingModes: 2, solveError: null, solving: false,
    buildInput: () => ({}), buildDynamicInput: () => ({ input: {}, densities: new Map() }),
    modelStore: { modelVersion: 1 }, knownIssueResultDisposition, errorText, eigenRefusalText,
    amplification: () => ({ b2: 1.2, stable: true }),
    t: (s: string) => s, tp: (_s: string, p: any) => p.error,
  };
  const store: Record<string, any> = {};
  for (const name of ['Modal', 'Buckling', 'PDelta']) {
    const field = name[0]!.toLowerCase() + name.slice(1) + 'Result3D';
    // PDelta's store field is pdeltaResult3D.
    const key = name === 'PDelta' ? 'pdeltaResult3D' : field;
    store[key] = null;
    store[`set${name}Result3D`] = (r: any) => store[key] = r;
    store[`clear${name}3D`] = () => store[key] = null;
  }
  store.spectralResult3D = null;
  store.clearSpectral3D = () => store.spectralResult3D = null;
  scope.resultsStore = store;
  for (const name of ['forgetPDelta', 'forgetModal', 'forgetBuckling']) scope[name] = handler(name, scope);
  return scope;
}

describe('advanced reruns retire panel, viewport and report results', () => {
  it('a modal rerun retires spectral results built on the previous modes', () => {
    for (const second of [{ modes: [{ frequency: 3, period: 1 / 3 }] }, refusal]) {
      const scope = setup();
      scope.wasmModal3D = vi.fn().mockReturnValueOnce({ modes: [{ frequency: 2, period: 0.5 }] }).mockReturnValueOnce(second);
      const run = handler('handleModal', scope);
      run();
      scope.resultsStore.spectralResult3D = { baseShearX: 13579 };
      scope.spectralResult = { baseShearX: 13579 };
      run();
      expect(scope.resultsStore.spectralResult3D).toBeNull();
      expect(scope.spectralResult).toBeNull();
    }
  });
  it.each(['Modal', 'Buckling'] as const)('%s success then thrown/string refusal cannot retain factors or modes', name => {
    for (const throws of [true, false]) {
      const scope = setup();
      const result = name === 'Modal' ? { modes: [{ frequency: 12345, period: 1 }] } : { factors: [12345] };
      scope[`wasm${name}3D`] = vi.fn().mockReturnValueOnce(result).mockImplementationOnce(() => {
        if (throws) throw refusal;
        return refusal;
      });
      const run = handler(`handle${name}`, scope);
      run();
      const key = name.toLowerCase();
      expect(scope[`${key}Result`]).toEqual(result);
      expect(scope.advancedResults[key]).toBeTruthy();
      run();
      expect(scope[`${key}Result`]).toBeNull();
      expect(scope.resultsStore[`${key}Result3D`]).toBeNull();
      expect(scope.advancedResults[key]).toBeUndefined();
      expect(JSON.stringify(scope.advancedResults)).not.toContain('12345');
      expect(scope.solveError).toContain('#741');
      expect(scope.solveError).not.toContain('structuredDiagnostics');
      expect(scope.solving).toBe(false);
    }
  });
  it('P-Delta with a nested refusal after a clean run keeps only the diagnostic', () => {
    const scope = setup();
    scope.amplification = () => ({ b2: 7.654321, stable: true });
    scope.wasmPDelta3D = vi.fn().mockReturnValueOnce({ converged: true, iterations: 2, results: {} })
      .mockReturnValueOnce({ converged: true, iterations: 2, results: { displacements: [{ ux: 987654 }], structuredDiagnostics: [diagnostic] } });
    const run = handler('handlePDelta', scope);
    run();
    expect(scope.resultsStore.pdeltaResult3D).toBeTruthy();
    expect(scope.advancedResults.pdelta.b2Factor).toBe(7.654321);
    run();
    expect(scope.pdeltaResult).toBeNull();
    expect(scope.resultsStore.pdeltaResult3D).toBeNull();
    expect(scope.advancedResults.pdelta).toBeUndefined();
    expect(JSON.stringify(scope.advancedResults)).not.toMatch(/7\.654321|987654/);
    expect(scope.solveError).toContain('#741');
    expect(scope.solving).toBe(false);
    expect(source).toContain('pdeltaResult && !knownIssueResultDisposition(pdeltaResult).refused');
  });
  it.each(['Modal', 'Buckling'] as const)('%s returned with a refusal after a clean run keeps only the diagnostic', name => {
    const scope = setup();
    const clean = name === 'Modal' ? { modes: [{ frequency: 2, period: 0.5 }], totalMass: 3 } : { factors: [2] };
    const refused = name === 'Modal'
      ? { modes: [{ frequency: 12345, period: 1 }], totalMass: 54321, structuredDiagnostics: [diagnostic] }
      : { factors: [12345], structuredDiagnostics: [diagnostic] };
    scope[`wasm${name}3D`] = vi.fn().mockReturnValueOnce(clean).mockReturnValueOnce(refused);
    const run = handler(`handle${name}`, scope);
    const key = name.toLowerCase();
    run();
    expect(scope[`${key}Result`]).toEqual(clean);
    expect(scope.resultsStore[`${key}Result3D`]).toEqual(clean);
    run();
    expect(scope[`${key}Result`]).toBeNull();
    expect(scope.resultsStore[`${key}Result3D`]).toBeNull();
    expect(scope.advancedResults[key]).toBeUndefined();
    expect(JSON.stringify(scope.advancedResults)).not.toMatch(/12345|54321/);
    expect(scope.solveError).toContain('#741');
    expect(scope.solving).toBe(false);
  });
});

it('phone and tablet controls have unconditional 44px targets and at least 12px text', () => {
  expect(() => compile(source, { filename: 'ProAdvancedTab.svelte', generate: 'server' })).not.toThrow();
  expect(source).toContain('@media (max-width: 810px)');
  expect(source).toMatch(/button, input, select, summary, \.adv-check \{ min-height: 44px; min-width: 44px;/);
  for (const match of source.matchAll(/font-size:\s*([\d.]+)rem/g)) expect(Number(match[1])).toBeGreaterThanOrEqual(0.75);
  expect(source).toContain('.adv-label, .adv-run-btn, .adv-chip { white-space: normal; }');
});

it('moving-load catch renders the localized refusal rather than its JSON', () => {
  const moving = readFileSync(new URL('../../../components/pro/ProMovingLoadsPanel.svelte', import.meta.url), 'utf8');
  expect(() => compile(moving, { filename: 'ProMovingLoadsPanel.svelte', generate: 'server' })).not.toThrow();
  const expression = moving.match(/error = e instanceof DOMException[^;]+;/)![0];
  const runCatch = new Function('e', 'errorText', 't', `let error; ${expression}; return error;`);
  const message = runCatch(new Error(refusal), errorText, (key: string) => key);
  expect(message).toContain('#741');
  expect(message).not.toMatch(/ENGINE|structuredDiagnostics/);
});

it('spectral success followed by string or thrown refusal retires report and local results', () => {
  for (const throws of [true, false]) {
    const scope = setup();
    Object.assign(scope, {
      modalResult: { modes: [] }, modalModelVersion: 1, modelStore: { modelVersion: 1, model: {} },
      spectralSource: 'code', codeSpectrum: { zone: 3 }, siteClass: 'SD', destinationGroup: 'B', spectralR: 1,
      spectralCombination: 'SRSS', spectralXi: 0.05, HORIZONTAL_DIRECTIONS: ['X', 'Y'],
      RISK_FACTOR: { B: 1 }, isBlocked: () => false, spectrumPoints: () => [], spectralModesFrom: () => [],
      wasmSpectral3D: () => ({ baseShear: 12345 }),
    });
    scope.resultsStore.clearSpectral3D = vi.fn();
    const run = handler('handleSpectral', scope); run();
    expect(scope.advancedResults.spectral.baseShearX).toBe(12345);
    scope.wasmSpectral3D = () => { if (throws) throw refusal; return refusal; };
    run();
    expect(scope.spectralResult).toBeNull();
    expect(scope.advancedResults.spectral).toBeUndefined();
    expect(scope.resultsStore.clearSpectral3D).toHaveBeenCalledTimes(2);
    expect(scope.solveError).toContain('#741');
    expect(scope.solveError).not.toContain('structuredDiagnostics');
  }
});

it('spectral returned with a refusal publishes no base shear', () => {
  const scope = setup();
  Object.assign(scope, {
    modalResult: { modes: [] }, modalModelVersion: 1, modelStore: { modelVersion: 1, model: {} },
    spectralSource: 'code', codeSpectrum: { zone: 3 }, siteClass: 'SD', destinationGroup: 'B', spectralR: 1,
    spectralCombination: 'SRSS', spectralXi: 0.05, HORIZONTAL_DIRECTIONS: ['X', 'Y'],
    RISK_FACTOR: { B: 1 }, isBlocked: () => false, spectrumPoints: () => [], spectralModesFrom: () => [],
    wasmSpectral3D: () => ({ baseShear: 12345, structuredDiagnostics: [diagnostic] }),
  });
  scope.resultsStore.clearSpectral3D = vi.fn();
  handler('handleSpectral', scope)();
  expect(scope.spectralResult).toBeNull();
  expect(scope.advancedResults.spectral).toBeUndefined();
  expect(JSON.stringify(scope.advancedResults)).not.toContain('12345');
  expect(scope.solveError).toContain('#741');
  expect(scope.solving).toBe(false);
});

it('time-history success then refusal clears chart, peaks and selected node', () => {
  const th = readFileSync(new URL('../../../components/pro/dynamics/TimeHistoryPanel.svelte', import.meta.url), 'utf8');
  const start = th.indexOf('  function run() {'), end = th.indexOf('\n  }', start) + 4;
  const scope: Record<string, any> = {
    timeHistoryView: { result: null as any, set(r: any) { this.result = r; }, clear() { this.result = null; } },
    nodeId: null, running: false, onError: vi.fn(), save: vi.fn(), spec: { ground: { x: {}, y: {}, z: {} } },
    buildDynamicInput: () => ({}), timeHistoryInput: () => ({}), spectrumSa: null, component: 'ux',
    modelStore: { modelVersion: 1 }, peakNode: () => 12345, errorText, timeHistoryRefusal, te: (m: unknown) => String(m), t: (s: string) => s,
    solveTimeHistory3D: vi.fn().mockReturnValueOnce({ peakDisplacements: [12345] }).mockImplementationOnce(() => { throw refusal; }),
  };
  const run = new Function('scope', `with(scope) { ${ts.transpile(th.slice(start, end))}; return run; }`)(scope);
  run(); expect(scope.timeHistoryView.result).toBeTruthy();
  run(); expect(scope.timeHistoryView.result).toBeNull(); expect(scope.nodeId).toBeNull();
  expect(scope.onError.mock.calls.at(-1)[0]).toContain('#741');
});

it.each([
  'pro/dynamics/TimeHistoryPanel.svelte', 'pro/ProForcesReport.svelte',
  'pro/ProResultTableModes.svelte', 'toolbar/ToolbarAdvanced.svelte',
])('updated consumer %s compiles', path => {
  const s = readFileSync(new URL(`../../../components/${path}`, import.meta.url), 'utf8');
  expect(() => compile(s, { filename: path, generate: 'server' })).not.toThrow();
});

it.each([
  ['handleHarmonic', 'harmResult', 'solveHarmonic3D'],
  ['handleWinkler', 'winklerResult', 'solveWinkler3D'],
  ['handleSSI', 'ssiResult', 'solveSSI3D'],
  ['handleStaged', 'stagedResult', 'solveStaged3D'],
  ['handleCreep', 'creepResult', 'creepSteps'],
] as const)('%s success then a thrown refusal leaves no previous numbers', (name, field, solver) => {
  for (const failure of [new Error(refusal), refusal]) {
    const scope = setup();
    Object.assign(scope, {
      harmNPoints: 2, harmFMin: 1, harmFMax: 2, harmNodeId: 1, harmDamping: 0.05, harmDir: 'X', harmonicElapsed: null,
      densityRecord: () => ({}), defaultFreeNode: () => 1, performance: { now: () => 0 },
      winklerSprings: [], ssiSprings: [], ssiMaxIter: 10, ssiTolerance: 1e-6, finishSolve3D: () => {}, asModel: (r: any) => r,
      hasPieces: () => false, stagedRefusal: () => null, stages: [], uiStore: { includeSelfWeight: false, axisConvention3D: 'rightHand' },
      modelStore: { modelVersion: 1, nodes: new Map(), elements: new Map(), supports: new Map(), loads: [], materials: new Map([[1, { fy: 25 }]]),
        sections: new Map(), quads: new Map(), plates: new Map(), constraints: [], connectors: [], analysis: {}, model: { groups: [], loadCases: [] } },
      caseSolverLoads3D: () => [], stagedLoadsByCase: () => ({ loads: [], indicesOf: new Map() }), stagedStagesPayload: () => [],
      concreteMaterials: () => new Map([[1, { fy: 25 }]]), creepFc: 25, creepRH: 70, creepH0: 200, creepAge: 28, creepCementClass: 'N',
      creepTimeSteps: [{ time: 100 }], solve3D: () => ({}),
      harmResult: null, winklerResult: null, ssiResult: null, stagedResult: null, creepResult: null,
    });
    scope.resultsStore.results3D = null;
    scope.resultsStore.setResults3D = vi.fn((r: any) => { scope.resultsStore.results3D = r; });
    scope.resultsStore.clear3D = vi.fn(() => { scope.resultsStore.results3D = null; });
    scope.winklerPublished = null;
    scope.ssiPublished = null;
    const clean = { peakAmplitude: 12345, displacements: [{ ux: 12345 }], results: { displacements: [{ ux: 12345 }] }, stages: [{ maxDisp: 12345 }] };
    scope[solver] = vi.fn().mockReturnValueOnce(solver === 'creepSteps' ? [clean] : clean).mockImplementationOnce(() => { throw failure; });
    const run = handler(name, scope);
    run();
    expect(JSON.stringify(scope[field])).toContain('12345');
    const published = scope.resultsStore.results3D;
    if (name === 'handleWinkler' || name === 'handleSSI') expect(JSON.stringify(published)).toContain('12345');
    run();
    expect(scope[field]).toBeNull();
    expect(JSON.stringify(scope.resultsStore.results3D ?? null)).not.toContain('12345');
    expect(scope.solveError).toContain('#741');
    expect(scope.solveError).not.toContain('structuredDiagnostics');
    expect(scope.solving).toBe(false);
  }
});

it('a moving-load envelope returned with a refusal shows the refusal and no envelope values', async () => {
  const moving = readFileSync(new URL('../../../components/pro/ProMovingLoadsPanel.svelte', import.meta.url), 'utf8');
  const start = moving.indexOf('    try {\n      result = await sweepTrains3D(');
  const end = moving.indexOf('\n    } finally {', start);
  const body = ts.transpile(`async function sweep() {${moving.slice(start, end)}\n    } finally {}}`, { target: ts.ScriptTarget.ES2022 });
  const scope: Record<string, any> = {
    result: null, error: null, notes: [], resultProvenance: null, progress: null, controller: { signal: null },
    input: { base: {}, path: [], trains: [], step: 1, path2: null }, provenance: () => 'p',
    knownIssueResultDisposition, errorText, t: (s: string) => s,
    sweepTrains3D: async () => ({ positions: 4, path: [], elements: new Map([[1, { mz: { max: { value: 12345 } } }]]), structuredDiagnostics: [diagnostic] }),
  };
  await new Function('scope', `with (scope) { ${body}; return sweep; }`)(scope)();
  expect(scope.result).toBeNull();
  expect(scope.resultProvenance).toBeNull();
  expect(scope.error).toContain('#741');
  expect(scope.notes.join()).not.toContain('#741');
});
