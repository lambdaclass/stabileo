import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { createRawSnippet } from 'svelte';
import { modelStore, resultsStore, uiStore } from '../../store';
import { timeHistoryView } from '../../store/time-history-view.svelte';
import { solveNow } from '../../actions/solve';
import { runPlasticCollapse } from '../../actions/plastic';
import { lastSolveFailure } from '../live-calc';
import { validateAndSolve3D, validateAndSolve3DAsync } from '../solver-service';
import * as wasm from '../wasm-solver';
import * as pool from '../solver-pool';
import { setLocale } from '../../i18n';
import ContainmentBanner from '../../../components/ContainmentBanner.svelte';

const refusal = JSON.stringify({ structuredDiagnostics: [{
  code: 'known_issue', severity: 'error', phase: 'SH-GLOBAL-STRESS', value: 757, message: 'ENGINE',
}] });

afterEach(() => {
  vi.restoreAllMocks();
  timeHistoryView.clear();
  resultsStore.clear();
  uiStore.analysisMode = '2d';
});

async function model() {
  modelStore.clear();
  await modelStore.loadExample('3d-portal-frame');
  uiStore.analysisMode = 'pro';
  vi.spyOn(wasm, 'isWasmReady').mockReturnValue(true);
}

describe('production containment', () => {
  it.each(['en', 'es', 'pt'] as const)('solveNow exposes a localized refusal in %s', async (locale) => {
    await model();
    setLocale(locale);
    vi.spyOn(pool, 'solve3DInWorker').mockRejectedValue(new Error(refusal));
    const toast = vi.spyOn(uiStore, 'toast');
    const outcome = await solveNow();
    expect(outcome.ok).toBe(false);
    expect(lastSolveFailure()).toContain('#757');
    expect(lastSolveFailure()).not.toContain('structuredDiagnostics');
    expect(lastSolveFailure()).not.toContain('ENGINE');
    expect(toast.mock.calls.some(([message]) => message.includes('#757'))).toBe(true);
    expect(toast.mock.calls.every(([message]) => !message.includes('structuredDiagnostics'))).toBe(true);
    expect(resultsStore.results3D).toBeNull();
  });

  it('both synchronous and unavailable-worker fallback paths format refusals', async () => {
    await model();
    vi.spyOn(wasm, 'solve3D').mockImplementation(() => { throw new Error(refusal); });
    vi.spyOn(pool, 'solve3DInWorker').mockRejectedValue(new pool.PoolUnavailableError('no worker'));
    const sync = validateAndSolve3D(modelStore.model);
    const fallback = await validateAndSolve3DAsync(modelStore.model);
    for (const result of [sync, fallback]) {
      expect(result).toContain('#757');
      expect(result).not.toContain('structuredDiagnostics');
    }
  });

  it('keeps time-history warnings next to the displayed response independently of the panel', () => {
    timeHistoryView.set({
      structuredDiagnostics: [{ code: 'known_issue', severity: 'warning', phase: 'TH-RECIPROCITY', value: 760, message: 'ENGINE' }],
      timeSteps: [0, 0.1], nodeHistories: [], peakDisplacements: [], peakReactions: [], nSteps: 1, method: 'newmark',
    }, modelStore.modelVersion);
    timeHistoryView.setShown(true);
    const html = render(ContainmentBanner, { props: {
      disposition: resultsStore.knownIssues3D,
      children: createRawSnippet(() => ({ render: () => '<span>Response 123.45</span>' })),
    } }).body;
    expect(html).toContain('#760');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Response 123.45');
    timeHistoryView.clear();
    expect(resultsStore.knownIssues3D.messages).toEqual([]);
  });

  it('Basic plastic refuses before displaying or tagging a legacy result', async () => {
    modelStore.clear();
    uiStore.analysisMode = '2d';
    await modelStore.loadExample('cantilever-point');
    expect(() => runPlasticCollapse()).toThrow(/#758/);
  });
});
