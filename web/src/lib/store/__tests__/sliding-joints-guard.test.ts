/**
 * Sliding-joint advanced-analysis guard.
 *
 * Sliders are only expanded on the linear-static / combinations / free-body
 * paths. Advanced analyses (P-Δ, buckling, modal, spectral, plastic, moving
 * load, influence lines, what-if, step-by-step DSM) route through
 * buildSolverInput (no slider expansion) and would silently produce too-stiff
 * results. ToolbarAdvanced gates each of those on `modelStore.hasSlidingJoints()`
 * and toasts `advanced.slidingUnsupported` instead of running.
 *
 * These tests pin the guard's decision predicate, confirm the allowed paths
 * still run with a slider present, and check the warning copy exists EN/ES.
 * The end-to-end "click P-Δ → warning, solver not called" wiring is covered by
 * the Playwright browser QA (no component-render harness in this repo).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { initSolver } from '../../engine/wasm-solver';
import en from '../../i18n/locales/en';
import es from '../../i18n/locales/es';

/** Two collinear frames sharing node 2; optional slider on element 2's I-end. */
function buildModel(withSlider: boolean) {
  modelStore.clear();
  const n1 = modelStore.addNode(0, 0);
  const n2 = modelStore.addNode(2, 0);
  const n3 = modelStore.addNode(4, 0);
  modelStore.addElement(n1, n2, 'frame');
  const e2 = modelStore.addElement(n2, n3, 'frame');
  modelStore.addSupport(n1, 'fixed');
  modelStore.addSupport(n3, 'pinned');
  modelStore.addNodalLoad(n2, 10, 0);
  if (withSlider) modelStore.setSlide(e2, 'i', 'x', 'global');
  return { e2 };
}

describe('sliding-joint advanced-analysis guard', () => {
  beforeEach(async () => { await initSolver(); });

  it('hasSlidingJoints() is the guard predicate: true with a slider, false without', () => {
    const { e2 } = buildModel(true);
    expect(modelStore.hasSlidingJoints()).toBe(true);
    // Clearing the slider flips it back — guard would then ALLOW advanced runs.
    modelStore.setSlide(e2, 'i', undefined);
    expect(modelStore.hasSlidingJoints()).toBe(false);
  });

  it('a plain model (no slider) is NOT blocked', () => {
    buildModel(false);
    expect(modelStore.hasSlidingJoints()).toBe(false);
  });

  it('linear static still runs with a slider present (allowed path)', () => {
    buildModel(true);
    const r = modelStore.solve(false);
    expect(typeof r).not.toBe('string');
    expect(r).toBeTruthy();
    expect((r as any).displacements?.length).toBeGreaterThan(0);
  });

  it('warning copy exists in EN and ES and names the supported paths', () => {
    for (const loc of [en, es] as Array<Record<string, string>>) {
      for (const key of ['advanced.slidingUnsupported', 'advanced.sliding3dUnsupported']) {
        const msg = loc[key];
        expect(msg).toBeTruthy();
        expect(msg.length).toBeGreaterThan(30);
      }
    }
    expect(en['advanced.slidingUnsupported']).toMatch(/linear static/i);
    expect(es['advanced.slidingUnsupported']).toMatch(/lineal/i);
    expect(en['advanced.sliding3dUnsupported']).toMatch(/3D/i);
    expect(es['advanced.sliding3dUnsupported']).toMatch(/3D/i);
  });

  it('3D solve is BLOCKED when a slider is present (returns the 3D warning, solver not run)', () => {
    buildModel(true);
    const r = modelStore.solve3D(false, false, false);
    expect(r).toBe(en['advanced.sliding3dUnsupported']);
  });

  it('3D combinations are blocked with a slider present', () => {
    buildModel(true);
    const r = modelStore.solveCombinations3D(false, false, false);
    expect(r).toBe(en['advanced.sliding3dUnsupported']);
  });

  it('3D solve runs normally when no slider is present', () => {
    buildModel(false);
    const r = modelStore.solve3D(false, false, false);
    // Not the sliding warning — a real 3D result (or a different validation string).
    expect(r).not.toBe(en['advanced.sliding3dUnsupported']);
  });
});
