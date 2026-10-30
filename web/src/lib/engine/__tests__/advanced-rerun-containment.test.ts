import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { compile } from 'svelte/compiler';
import { describe, it, expect, vi } from 'vitest';
import { knownIssueResultDisposition } from '../known-issues';
import { errorText } from '../../utils/error-text';

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
    modelStore: { modelVersion: 1 }, knownIssueResultDisposition, errorText,
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
  scope.resultsStore = store;
  for (const name of ['forgetPDelta', 'forgetModal', 'forgetBuckling']) scope[name] = handler(name, scope);
  return scope;
}

describe('advanced reruns retire panel, viewport and report results', () => {
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
  it('P-Delta retains nested diagnostics and refuses publication after a clean run', () => {
    const scope = setup();
    scope.wasmPDelta3D = vi.fn().mockReturnValueOnce({ converged: true, iterations: 2, results: {} })
      .mockReturnValueOnce({ converged: true, iterations: 2, results: { structuredDiagnostics: [diagnostic] } });
    const run = handler('handlePDelta', scope);
    run();
    expect(scope.resultsStore.pdeltaResult3D).toBeTruthy();
    run();
    expect(knownIssueResultDisposition(scope.pdeltaResult).refused).toBe(true);
    expect(scope.resultsStore.pdeltaResult3D).toBeNull();
    expect(scope.advancedResults.pdelta.disposition.refused).toBe(true);
    expect(scope.pdeltaRefused).toContain('#741');
    expect(source).toContain('pdeltaResult && !knownIssueResultDisposition(pdeltaResult).refused');
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
