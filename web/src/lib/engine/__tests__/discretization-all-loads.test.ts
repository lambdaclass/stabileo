/**
 * The discretization estimate of a model with combinations: live-calc publishes, as its base
 * result, the "all loads" sum of the cases of one multi-case solve, which no single solve
 * returned. It is estimated as the single solve of the same loads (the mesh is the same), and
 * only for a sum of the cases of one multi-case solve.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { initSolver, callCertify } from '../wasm-solver';
import { allLoadsInputOf, certifiableInputOf, estimableInputOf, markAllLoads } from '../solver-service';

beforeAll(async () => { await initSolver(); });

describe('the all-loads result of a solve with combinations', () => {
  it('is estimated as the single solve of its loads', async () => {
    await modelStore.loadExample('rc-qa-diagnostic-shells');
    const bundle = modelStore.solveCombinations3D(false, false, true);
    if (!bundle || typeof bundle === 'string') throw new Error(String(bundle));
    const factors = [...bundle.perCase.keys()].map((caseId) => ({ caseId, factor: 1 }));
    expect(factors.length).toBe(2);

    const input = allLoadsInputOf(bundle.perCase, factors);
    expect(input).not.toBeNull();
    const single = modelStore.solve3D(false, false, true);
    if (!single || typeof single === 'string') throw new Error(String(single));
    const fromSum = callCertify('estimate_discretization_3d', [input!.wire()]);
    const fromSingle = callCertify('estimate_discretization_3d', [certifiableInputOf(single)!.wire()]);
    expect(fromSum.relativeError).toBeGreaterThan(0);
    expect(fromSum.relativeError).toBeCloseTo(fromSingle.relativeError, 10);

    // The published sum carries that input for the estimate, never for the certificate.
    const sum = {};
    markAllLoads(sum, bundle.perCase, factors);
    expect(estimableInputOf(sum)).not.toBeNull();
    expect(certifiableInputOf(sum)).toBeNull();
  });

  it('is not estimated when a case is not that solve’s result', async () => {
    await modelStore.loadExample('rc-qa-diagnostic-shells');
    const bundle = modelStore.solveCombinations3D(false, false, true);
    if (!bundle || typeof bundle === 'string') throw new Error(String(bundle));
    const [a, b] = [...bundle.perCase.keys()];
    // A case result rebuilt after the solve (a settlement added, a spectral part…) is a new object.
    const rebuilt = new Map(bundle.perCase).set(b!, { ...bundle.perCase.get(b!)! });
    expect(allLoadsInputOf(rebuilt, [{ caseId: a!, factor: 1 }, { caseId: b!, factor: 1 }])).toBeNull();
    // A case the factors name but the bundle does not hold.
    expect(allLoadsInputOf(bundle.perCase, [{ caseId: a!, factor: 1 }, { caseId: 999, factor: 1 }])).toBeNull();
  });
});
