import { describe, it, expect, beforeEach } from 'vitest';
import { deformedScaleCeiling, deformedScaleMax, stepDeformedScale, DEFORMED_SCALE_LIMIT } from '../deformed-scale';
import { modelStore, resultsStore, uiStore } from '../index';
import { initSolver } from '../../engine/wasm-solver';
import type { AnalysisResults } from '../../engine/types';
import { effectiveBendingInertia } from '../../engine/solver-service';

describe('deformed scale ceiling', () => {
  it('draws the largest movement at a quarter of the structure at most', () => {
    expect(deformedScaleCeiling(10, 0.01)).toBe(250);
    expect(deformedScaleCeiling(29, 0.5)).toBe(14);
  });

  it('keeps 1000× for movements too small to reach it, and 1× when the true shape is already large', () => {
    expect(deformedScaleCeiling(6, 1e-4)).toBe(DEFORMED_SCALE_LIMIT);
    expect(deformedScaleCeiling(10, 5)).toBe(1);
    expect(deformedScaleCeiling(10, 0)).toBe(DEFORMED_SCALE_LIMIT);
    expect(deformedScaleCeiling(0, 0.1)).toBe(DEFORMED_SCALE_LIMIT);
  });

  it('steps by 1, 5 and 50 and stops at the ceiling', () => {
    expect(stepDeformedScale(9, 1, 1000)).toBe(10);
    expect(stepDeformedScale(10, 1, 1000)).toBe(15);
    expect(stepDeformedScale(100, 1, 1000)).toBe(150);
    expect(stepDeformedScale(12, 1, 14)).toBe(14);
    expect(stepDeformedScale(1, -1, 14)).toBe(1);
  });
});

describe('deformed scale of the model on screen', () => {
  beforeEach(async () => {
    await initSolver();
    uiStore.analysisMode = '2d';
    modelStore.clear();
    resultsStore.clear();
  });

  /** A 10 m simple span under q kN/m: only its interior moves. */
  function beam(q: number): number {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(10, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'pinned');
    modelStore.addSupport(b, 'rollerX');
    const el = modelStore.elements.get(e)!;
    modelStore.addDistributedLoad(e, -q);
    const r = modelStore.solve(false, 'xy');
    if (typeof r === 'string') throw new Error(r);
    resultsStore.setResults(r as AnalysisResults);
    const ei = modelStore.materials.get(el.materialId)!.e * 1000 * effectiveBendingInertia(modelStore.sections.get(el.sectionId)!);
    return (5 * q * 10 ** 4) / (384 * ei);
  }

  it('counts the deflection inside a span whose nodes do not move', () => {
    const mid = beam(10);
    expect(Math.abs(deformedScaleMax() - (0.25 * 10) / mid)).toBeLessThan(1.5);
    expect(deformedScaleMax()).toBeLessThan(DEFORMED_SCALE_LIMIT);
  });

  it('gives a span that already sags a lot a short slider', () => {
    expect(beam(1e4)).toBeGreaterThan(2.5);
    expect(deformedScaleMax()).toBe(1);
  });
});
