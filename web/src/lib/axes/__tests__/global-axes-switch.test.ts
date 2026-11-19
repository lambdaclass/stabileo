import { expect, it, vi } from 'vitest';
import { featuresForMode } from '../../../../config/public-features.mjs';
import { DEFAULT_AXES } from '../frame';
import { axesStore } from '../axes.svelte';

it.skip('known wrong result: #1986 a production-disabled build ignores a stored or requested global frame', () => {
  expect(featuresForMode('production')).toHaveProperty('globalAxes', false);
  vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
  try {
    axesStore.choice = { up: '-Y', right: '-X', hand: 'left' };
    axesStore.pickerOpen = true;
    expect(axesStore.choice).toEqual(DEFAULT_AXES);
    expect(axesStore.pickerOpen).toBe(false);
  } finally {
    vi.unstubAllGlobals();
    axesStore.reset();
  }
});
