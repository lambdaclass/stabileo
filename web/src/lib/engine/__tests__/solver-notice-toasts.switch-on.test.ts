import { describe, it, expect, vi, afterEach } from 'vitest';
import { reportManualSolveDiagnostics, solverNoticeCount } from '../solve-diagnostics';
import { uiStore } from '../../store';
import type { SolverDiagnostic } from '../types';

const diag = (severity: SolverDiagnostic['severity'], message: string) => ({ severity, message, code: 'X', source: 'solver' }) as SolverDiagnostic;

afterEach(() => { vi.restoreAllMocks(); });

describe('solver notices after a solve', () => {
  it('toasts only the errors: warnings are counted by the solve card and listed in Diagnostics', () => {
    const toast = vi.spyOn(uiStore, 'toast').mockImplementation(() => 0 as never);
    reportManualSolveDiagnostics([diag('warning', 'ill-conditioned'), diag('error', 'singular'), diag('info', 'sparse')]);
    expect(toast.mock.calls.map((c) => [c[0], c[1]])).toEqual([['singular', 'error']]);
    toast.mockClear();
    reportManualSolveDiagnostics([diag('warning', 'ill-conditioned')]);
    reportManualSolveDiagnostics(undefined);
    expect(toast).not.toHaveBeenCalled();
  });

  it('counts the warnings a 2D solve used to toast on their own, for the success toast', () => {
    expect(solverNoticeCount({
      diagnostics: [{ metric: 'negative_jacobian' }, { metric: 'aspect_ratio' }],
      solverDiagnostics: [{ severity: 'warning' }, { severity: 'info' }, { severity: 'warning' }],
    })).toBe(3);
    expect(solverNoticeCount({})).toBe(0);
  });
});
