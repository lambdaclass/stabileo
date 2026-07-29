/**
 * PR15 — result-invalidation / trust-repair.
 *
 * Pins the mutation → invalidation contract so stale structural numbers can't
 * survive a model edit. Imports the WIRED stores from ../index so that
 * modelStore._onMutation (set in index.ts) is active — the same wiring the app
 * uses. Covers the holes the app-wide audit confirmed (S2):
 *   - clear() previously skipped the 3D advanced results,
 *   - the old `if (results || results3D)` guard skipped invalidation entirely
 *     for advanced-only / moving-load-only runs,
 *   - the moving-load controller was dropped without .abort().
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore, resultsStore, verificationStore } from '../index';
import type { MemberDesignResult, DesignCheckSummary } from '../../engine/design-check-results';

// The history store wires modelStore._setHistoryPush() from inside a
// queueMicrotask (see history.svelte.ts). Until that runs, modelStore's
// add* mutations can't fire _onMutation. Flushing a macrotask guarantees the
// microtask has run, so addNode() invalidates results exactly like in the app.
beforeAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

/** Minimal well-typed fake unified design results (values are irrelevant here —
 *  only presence matters for verificationStore.hasResults). */
function fakeDesignResults(): [MemberDesignResult[], DesignCheckSummary] {
  const results = [
    { elementId: 1, code: 'CIRSOC 201', utilization: 0.5, status: 'ok' },
  ] as unknown as MemberDesignResult[];
  const summary = {
    code: 'cirsoc', label: 'CIRSOC 201', results, total: 1, ok: 1, warn: 0, fail: 0,
  } as unknown as DesignCheckSummary;
  return [results, summary];
}

describe('PR15 result & verification invalidation on model mutation', () => {
  beforeEach(() => {
    // Fresh model + stores. clear() also aborts any in-flight moving-load run.
    modelStore.clear();
    resultsStore.clear();
    verificationStore.clear();
  });

  it('1. a model edit clears advanced 3D results (clear() now nulls them)', () => {
    resultsStore.setModalResult3D({} as any);
    expect(resultsStore.modalResult3D).not.toBeNull();
    expect(resultsStore.hasAnyResults).toBe(true);

    modelStore.addNode(0, 0, 0); // real edit → fires _onMutation

    expect(resultsStore.modalResult3D).toBeNull();
    expect(resultsStore.hasAnyResults).toBe(false);
  });

  it('2. advanced-only results are cleared even when results/results3D are null', () => {
    // A 3D buckling run leaves the base 2D/3D result fields null. The old guard
    // `if (results || results3D)` would have skipped clearing entirely.
    resultsStore.setBucklingResult3D({} as any);
    expect(resultsStore.results).toBeNull();
    expect(resultsStore.results3D).toBeNull();
    expect(resultsStore.bucklingResult3D).not.toBeNull();
    expect(resultsStore.hasAnyResults).toBe(true);

    modelStore.addNode(0, 0, 0);

    expect(resultsStore.bucklingResult3D).toBeNull();
    expect(resultsStore.hasAnyResults).toBe(false);
  });

  it('3. an in-flight moving-load solve is aborted on a model edit', () => {
    const ac = resultsStore.startMovingLoadAnalysis();
    expect(ac.signal.aborted).toBe(false);
    expect(resultsStore.movingLoadRunning).toBe(true);
    // A moving-load run also leaves results/results3D null — only movingLoadRunning
    // flags it, so hasAnyResults must account for it.
    expect(resultsStore.results).toBeNull();
    expect(resultsStore.hasAnyResults).toBe(true);

    modelStore.addNode(0, 0, 0);

    expect(ac.signal.aborted).toBe(true);
    expect(resultsStore.movingLoadRunning).toBe(false);
  });

  it('4. verification/design status clears on a model edit (even with no analysis results)', () => {
    const [results, summary] = fakeDesignResults();
    verificationStore.setDesignResults(results, summary);
    expect(verificationStore.hasResults).toBe(true);
    // No solver results at all — the old guard checked only resultsStore, so it
    // would have left verification status stranded on the mutated model. The hook is
    // now UNCONDITIONAL so the analysis revision can never fail to advance.
    expect(resultsStore.hasAnyResults).toBe(false);
    const revBefore = verificationStore.analysisRevision;

    modelStore.addNode(0, 0, 0);

    expect(verificationStore.hasResults).toBe(false);
    expect(verificationStore.analysisRevision).toBeGreaterThan(revBefore);
    expect(verificationStore.hasDemandData).toBe(false);
  });

  it('5. modelStore.restore(snapshot) clears stale results and verification', () => {
    // Build a model and snapshot it (restore fires _onMutation just like an edit).
    modelStore.addNode(0, 0, 0);
    modelStore.addNode(5, 0, 0);
    const snap = modelStore.snapshot();

    // Dirty both stores as if the user had solved + verified.
    resultsStore.setModalResult3D({} as any);
    const [results, summary] = fakeDesignResults();
    verificationStore.setDesignResults(results, summary);
    expect(resultsStore.hasAnyResults).toBe(true);
    expect(verificationStore.hasResults).toBe(true);

    const revBefore = verificationStore.analysisRevision;

    modelStore.restore(snap);

    expect(resultsStore.hasAnyResults).toBe(false);
    expect(verificationStore.hasResults).toBe(false);
    expect(verificationStore.analysisRevision).toBeGreaterThan(revBefore);
  });

  it('bonus: a 2D advanced-only run (plastic) is also invalidated', () => {
    resultsStore.setPlasticResult({ steps: [] } as any);
    expect(resultsStore.plasticResult).not.toBeNull();
    expect(resultsStore.hasAnyResults).toBe(true);

    modelStore.bumpModelVersion(); // direct mutation signal

    expect(resultsStore.plasticResult).toBeNull();
    expect(resultsStore.hasAnyResults).toBe(false);
  });
});
