import { afterEach, describe, expect, it, vi } from 'vitest';
import { modelStore, resultsStore, uiStore } from '../../store';
import type { InfluenceLineResult } from '../../store/model.svelte';
import { setInfluenceDirection, setInfluenceQuantity } from '../influence-line';

const line = (): InfluenceLineResult => ({
  quantity: 'M', targetElementId: 1, targetPosition: 0.5, direction: 'vertical',
  points: [{ x: 0, y: 0, elementId: 1, t: 0, value: 0 }, { x: 1, y: 0, elementId: 1, t: 1, value: 0.25 }],
} as unknown as InfluenceLineResult);

afterEach(() => { vi.restoreAllMocks(); resultsStore.setInfluenceLine(null); uiStore.ilDirection = 'vertical'; uiStore.ilQuantity = 'M'; });

describe('a refused influence line leaves no line under the new choice', () => {
  it('a quantity the solver refuses clears the old line', () => {
    resultsStore.setInfluenceLine(line());
    vi.spyOn(modelStore, 'computeInfluenceLine').mockReturnValue('refused');
    setInfluenceQuantity('V');
    expect(uiStore.ilQuantity).toBe('V');
    expect(resultsStore.influenceLine).toBeNull();
  });

  it('a direction the solver refuses clears the old line', () => {
    resultsStore.setInfluenceLine(line());
    vi.spyOn(modelStore, 'computeInfluenceLine').mockReturnValue('refused');
    setInfluenceDirection('horizontal');
    expect(uiStore.ilDirection).toBe('horizontal');
    expect(resultsStore.influenceLine).toBeNull();
  });
});
