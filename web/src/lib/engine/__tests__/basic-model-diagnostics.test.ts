// Issue #181 — a Basic-mode solve must surface model diagnostics.
//
// `checkModel` defines 21 checks (13 of them severity `error`) and every one of
// them was reachable ONLY from `pro/` components: ProPanel and
// ProDiagnosticsTab were the sole callers. A 2D/Basic user who built two
// members on the same node pair — the report in issue #181 — got a solve, got
// numbers, and got no warning of any kind.
//
// The detection was never missing. The WIRING was. `transverseOnTrussWarnings`
// even carries a comment saying it was extracted from `checkModel` "so the
// Basic solve path can surface it as a pre-solve diagnostic too" — and then had
// no caller anywhere outside the `checkModel` it was extracted from.
//
// So these tests pin the wiring, not the detection. `model-diagnostics` already
// owns whether a duplicate is found; what follows owns whether anyone hears it.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runGlobalSolve } from '../live-calc';
import { reportModelDiagnostics, checkCurrentModel } from '../solve-diagnostics';
import { modelStore, uiStore } from '../../store';
import { t } from '../../i18n';

/** The exact toast text a duplicate member produces, resolved the way the
 *  reporter resolves it. Asserting on THIS rather than on "some toast fired"
 *  matters: a solve can toast for unrelated reasons (a WASM error, a
 *  mechanism), and a test that counts toasts would pass on those instead. */
const DUPLICATE_TOAST = t('diag.model.duplicateElement');

const duplicateToasts = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.filter((c) => c[0] === DUPLICATE_TOAST).length;

/** A valid, solvable 2D frame whose ONLY defect is the duplicated member. */
function buildModelWithDuplicateMember() {
  modelStore.clear();
  const n1 = modelStore.addNode(0, 0, 0);
  const n2 = modelStore.addNode(5, 0, 0);
  modelStore.addElement(n1, n2, 'frame');
  // The defect: a second member on the same node pair. Nothing in the solver
  // objects to this — it silently doubles the stiffness of that span.
  modelStore.addElement(n1, n2, 'frame');
  modelStore.addSupport(n1, 'fixed');
  modelStore.addSupport(n2, 'fixed');
  return { n1, n2 };
}

describe('Basic-mode pre-solve model diagnostics (issue #181)', () => {
  beforeEach(() => {
    uiStore.analysisMode = '2d';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    uiStore.analysisMode = '2d';
    modelStore.clear();
  });

  it('detects the duplicated member on the live store', () => {
    buildModelWithDuplicateMember();
    const codes = checkCurrentModel().map((d) => d.code);
    expect(codes).toContain('MODEL_DUPLICATE_ELEMENT');
  });

  it('is the only defect that can reach a toast', () => {
    // Guards the tests below: if the fixture drifted into ALSO being
    // section-less or support-less, `MAX_TOASTS` could surface those errors
    // instead and the assertions would pass while proving nothing. Only
    // error/warning severities are eligible — the `info` ones never toast.
    buildModelWithDuplicateMember();
    const eligible = checkCurrentModel().filter((d) => d.severity !== 'info');
    expect(eligible.map((d) => d.code)).toEqual(['MODEL_DUPLICATE_ELEMENT']);
  });

  it('surfaces it as a toast — the wiring that issue #181 was missing', () => {
    buildModelWithDuplicateMember();
    const toast = vi.spyOn(uiStore, 'toast').mockImplementation(() => {});

    reportModelDiagnostics();

    expect(duplicateToasts(toast)).toBe(1);
  });

  it('a manual Basic solve reports it before solving', async () => {
    buildModelWithDuplicateMember();
    const toast = vi.spyOn(uiStore, 'toast').mockImplementation(() => {});

    await runGlobalSolve();

    // The point of the fix: reaching a solve in Basic no longer means reaching
    // it in silence.
    expect(duplicateToasts(toast)).toBe(1);
  });

  it('stays silent in PRO, which reports the same diagnostics in its own panel', async () => {
    buildModelWithDuplicateMember();
    const toast = vi.spyOn(uiStore, 'toast').mockImplementation(() => {});
    uiStore.analysisMode = 'pro';

    reportModelDiagnostics();
    expect(duplicateToasts(toast)).toBe(1); // direct call still reports…

    toast.mockClear();
    // …but the solve path must not, or PRO users get every diagnostic twice:
    // once from ProPanel's panel and once from here. Other toasts (a WASM
    // error, a mechanism) are none of this test's business, hence the filter.
    await runGlobalSolve().catch(() => {});
    expect(duplicateToasts(toast)).toBe(0);
  });

  it('a clean model produces no toast at all', () => {
    modelStore.clear();
    const n1 = modelStore.addNode(0, 0, 0);
    const n2 = modelStore.addNode(5, 0, 0);
    modelStore.addElement(n1, n2, 'frame');
    modelStore.addSupport(n1, 'fixed');
    const toast = vi.spyOn(uiStore, 'toast').mockImplementation(() => {});

    reportModelDiagnostics();

    expect(duplicateToasts(toast)).toBe(0);
    expect(toast).not.toHaveBeenCalled();
  });
});
