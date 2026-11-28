import { expect, it } from 'vitest';
import { resultsStore } from '../../store';
import { axialPaintLabel, axialPaintRange, envelopeAxialRanges, signedAxialRange } from '../axial-paint';

it('retains both signs below the first fixed display digit', () => {
  const range = axialPaintRange({ minValue: -0.001, maxValue: 0.002 });
  expect(axialPaintLabel(range, 'SI')).toBe('-0.001 kN / +0.002 kN');
});

it.each([-1, 1])('keeps axial roundoff neutral on sign %s', sign => {
  for (const residual of [0, 1e-11, 1e-10]) {
    expect(axialPaintRange({ minValue: sign * residual, maxValue: sign * residual }).peak).toBe(0);
  }
  expect(axialPaintRange({ minValue: sign * 1.01e-10, maxValue: sign * 1.01e-10 }).peak).toBe(1.01e-10);
});

it.each(['moving', 'combination'])('reads both signed curves from the selected %s envelope', source => {
  resultsStore.clear();
  const initial = { displacements: [], reactions: [], elementForces: [] };
  const axial = { kind: 'axial', globalMax: 9, elements: [{ elementId: 1, tPositions: [0, 1], posValues: [0, 3], negValues: [-9, 0] }] };
  const env = { axial, maxAbsResults: initial };
  if (source === 'moving') {
    resultsStore.setMovingLoadEnvelope({ elements: new Map(), positions: [{ refPosition: 0, results: initial }], fullEnvelope: env, train: {}, path: [] } as never);
  } else {
    resultsStore.setCombinationResults(new Map(), new Map([[1, initial]]), env as never);
    resultsStore.activeView = 'envelope';
  }
  expect(resultsStore.screen.envelopeActive).toBe(true);
  expect(envelopeAxialRanges(resultsStore.screen.envelope2D?.axial).get(1)).toEqual({ tension: 3, compression: -9, peak: 9, mixed: true });
  if (source === 'moving') resultsStore.movingLoadShowEnvelope = false;
  else resultsStore.activeView = 'combo';
  expect(resultsStore.screen.envelopeActive).toBe(false);
  resultsStore.clear();
});

it('requires complete ordered signed curves for an envelope member', () => {
  for (const tPositions of [[0], [0, 0.5], [0.1, 1], [0, 0.8, 0.3, 1], [0, NaN, 1]]) {
    const elements = [{ elementId: 1, tPositions, posValues: tPositions.map(() => 2), negValues: tPositions.map(() => -3) }];
    expect(envelopeAxialRanges({ elements }).has(1)).toBe(false);
  }
  const bad = (minValue: number, maxValue: number) => signedAxialRange(() => ({ minValue, maxValue }));
  expect(bad(NaN, 3)).toBeNull();
  expect(bad(-2, Infinity)).toBeNull();
  expect(bad(3, 2)).toBeNull();
});
