/**
 * The re-check's re-run where PRO's design is off: the analysis alone, said as such, and no code
 * check computed behind the switch (`actions/recheck.ts`).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../engine/live-calc', () => ({
  runGlobalSolve: vi.fn(async () => ({ ok: true, combinationsLeftOut: null })),
}));

import { uiStore, resultsStore } from '../../store';
import { designRunStore } from '../../store/design-run.svelte';
import { recheckStore } from '../../store/recheck.svelte';
import { rerunAnalysisAndDesign, recheckKey } from '../recheck';
import { runGlobalSolve } from '../../engine/live-calc';

const runCodeCheck = vi.spyOn(designRunStore, 'runCodeCheck').mockImplementation(() => undefined as never);

describe('re-check re-run and the design switch', () => {
  beforeEach(() => {
    runCodeCheck.mockClear();
    vi.mocked(runGlobalSolve).mockResolvedValue({ ok: true, combinationsLeftOut: null });
    uiStore.analysisMode = 'pro';
    vi.spyOn(resultsStore, 'results3D', 'get').mockReturnValue({} as never);
    vi.spyOn(recheckStore, 'stale', 'get').mockReturnValue(false);
  });

  it('re-runs the analysis alone, and says so, while design is off', async () => {
    uiStore.designInPro = false;
    expect(recheckKey('recheck.rerun')).toBe('recheck.rerunAnalysis');
    expect((await rerunAnalysisAndDesign()).ok).toBe(true);
    expect(runCodeCheck).not.toHaveBeenCalled();
  });

  it('re-runs the code check too once design is on', async () => {
    uiStore.designInPro = true;
    expect(recheckKey('recheck.rerun')).toBe('recheck.rerun');
    expect((await rerunAnalysisAndDesign()).ok).toBe(true);
    expect(runCodeCheck).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed analysis failed while design is off', async () => {
    uiStore.designInPro = false;
    vi.mocked(runGlobalSolve).mockResolvedValue({ ok: false, error: 'analysis refused' });
    expect(await rerunAnalysisAndDesign()).toEqual({ ok: false, error: 'analysis refused' });
    expect(runCodeCheck).not.toHaveBeenCalled();
  });

  it('restores the previous stamp when combinations were left out, with design off', async () => {
    uiStore.designInPro = false;
    const before = recheckStore.capture();
    const restore = vi.spyOn(recheckStore, 'restoreStamp');
    vi.mocked(runGlobalSolve).mockResolvedValue({ ok: true, combinationsLeftOut: 'combinations refused' });
    expect((await rerunAnalysisAndDesign()).ok).toBe(false);
    expect(restore).toHaveBeenCalledWith(before);
    expect(runCodeCheck).not.toHaveBeenCalled();
  });
});
