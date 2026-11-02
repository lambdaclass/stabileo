import { afterEach, describe, expect, it, vi } from 'vitest';
import { modelStore, resultsStore, uiStore } from '../../store';
import type { InfluenceLineResult } from '../../store/model.svelte';
import { influenceTool } from '../../store/influence-tool.svelte';
import type { AlongEnvelope } from '../../engine/influence/envelope-along';
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
    modelStore.clear();
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0);
    const el = modelStore.addElement(a, b);
    resultsStore.setInfluenceLine(line());
    uiStore.ilQuantity = 'M';
    const solve = vi.spyOn(modelStore, 'computeInfluenceLine').mockReturnValue('refused');
    pickInfluenceTarget({ x: 1, y: 0 }, undefined, el, 0);
    expect(solve).toHaveBeenCalledTimes(1);
    expect(solve).toHaveBeenCalledWith('M', undefined, el, 0.25, 20, 'vertical');
    expect(resultsStore.influenceLine).toBeNull();
    modelStore.clear();
  });

  it('a section moved to where the solver refuses clears the line of the old section', () => {
    resultsStore.setInfluenceLine(line());
    const solve = vi.spyOn(modelStore, 'computeInfluenceLine').mockReturnValue('refused');
    moveInfluenceSection(1, 0.9);
    expect(solve).toHaveBeenCalledWith('M', undefined, 1, 0.9, 20, 'vertical');
    expect(resultsStore.influenceLine).toBeNull();
  });
});

describe('a zero line in the chosen direction', () => {
  const zero = (direction: 'vertical' | 'horizontal'): InfluenceLineResult => ({
    ...line(), direction, points: line().points.map((p) => ({ ...p, value: 0 })),
  } as unknown as InfluenceLineResult);

  it('moving the section keeps the chosen direction and its zero line, though the other direction is not zero', () => {
    resultsStore.setInfluenceLine(line());
    uiStore.ilDirection = 'vertical';
    const solve = vi.spyOn(modelStore, 'computeInfluenceLine').mockImplementation((_q, _n, _e, _at, _k, dir) => (dir === 'vertical' ? zero('vertical') : line()));
    moveInfluenceSection(1, 0.3);
    expect(solve).toHaveBeenCalledTimes(1);
    expect(uiStore.ilDirection).toBe('vertical');
    expect(resultsStore.influenceLine?.points.every((p) => p.value === 0)).toBe(true);
  });

  it('changing the quantity keeps the chosen direction too', () => {
    resultsStore.setInfluenceLine(line());
    uiStore.ilDirection = 'horizontal';
    vi.spyOn(modelStore, 'computeInfluenceLine').mockImplementation((_q, _n, _e, _at, _k, dir) => (dir === 'horizontal' ? zero('horizontal') : line()));
    setInfluenceQuantity('V');
    expect(uiStore.ilDirection).toBe('horizontal');
    expect(resultsStore.influenceLine?.points.every((p) => p.value === 0)).toBe(true);
  });
});

describe('a zero line on a fresh pick whose other direction is refused', () => {
  it('keeps the zero line, says only the chosen direction is zero and shows the refusal', () => {
    uiStore.ilDirection = 'vertical';
    const zeroLine = { ...line(), points: line().points.map((p) => ({ ...p, value: 0 })) } as unknown as InfluenceLineResult;
    const solve = vi.spyOn(modelStore, 'computeInfluenceLine').mockImplementation((_q, _n, _e, _at, _k, dir) => (dir === 'vertical' ? zeroLine : 'horizontal refused'));
    const toast = vi.spyOn(uiStore, 'toast');
    expect(runInfluence('M', undefined, 1, 0.5)).toBe(true);
    expect(solve).toHaveBeenCalledTimes(2);
    expect(uiStore.ilDirection).toBe('vertical');
    expect(resultsStore.influenceLine).toBe(zeroLine);
    const messages = toast.mock.calls.map((c) => [c[0], c[1]]);
    expect(messages).toContainEqual(['horizontal refused', 'error']);
    expect(messages.some(([m]) => /vertical u horizontal|vertical or horizontal/.test(m as string))).toBe(false);
    expect(messages.some(([m, kind]) => kind === 'info' && (m as string).includes('M'))).toBe(true);
  });
});

describe('the envelope follows the quantity', () => {
  it('a quantity the line on screen cannot carry clears the line and the old envelope', () => {
    resultsStore.setInfluenceLine(line());
    influenceTool.envelope = { members: [] } as unknown as AlongEnvelope;
    const solve = vi.spyOn(modelStore, 'computeInfluenceLine');
    setInfluenceQuantity('Rz');
    expect(solve).not.toHaveBeenCalled();
    expect(resultsStore.influenceLine).toBeNull();
    expect(influenceTool.envelope).toBeNull();
  });
});
