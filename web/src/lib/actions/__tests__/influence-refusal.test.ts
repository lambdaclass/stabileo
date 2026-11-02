import { afterEach, describe, expect, it, vi } from 'vitest';
import { modelStore, resultsStore, uiStore } from '../../store';
import type { InfluenceLineResult } from '../../store/model.svelte';
import { moveInfluenceSection, pickInfluenceTarget, runInfluence, setInfluenceDirection, setInfluenceQuantity } from '../influence-line';

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

  it('a target the solver refuses clears the line of the old target', () => {
    resultsStore.setInfluenceLine(line());
    vi.spyOn(modelStore, 'computeInfluenceLine').mockReturnValue('refused');
    expect(runInfluence('M', undefined, 2, 0.5)).toBe(false);
    expect(resultsStore.influenceLine).toBeNull();
  });

  it('a click on a target the solver refuses clears the line of the old target', () => {
    resultsStore.setInfluenceLine(line());
    vi.spyOn(modelStore, 'computeInfluenceLine').mockReturnValue('refused');
    pickInfluenceTarget({ x: 0, y: 0 }, 1, undefined, 0.1);
    expect(resultsStore.influenceLine).toBeNull();
  });

  it('a section moved to where the solver refuses clears the line of the old section', () => {
    resultsStore.setInfluenceLine(line());
    vi.spyOn(modelStore, 'computeInfluenceLine').mockReturnValue('refused');
    moveInfluenceSection(1, 0.9);
    expect(resultsStore.influenceLine).toBeNull();
  });
});
