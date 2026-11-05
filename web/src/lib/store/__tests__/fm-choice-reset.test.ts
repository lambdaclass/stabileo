import { describe, expect, it } from 'vitest';
import { fmChoice } from '../fm-choice.svelte';

describe('the force-method choices hold for the model they were made on', () => {
  it('a new model drops the axial choice with the releases, back to the method\'s own', () => {
    fmChoice.reset(1);
    fmChoice.setAxial(false);
    fmChoice.solvedWith(['M:1:i'], 1);
    expect(fmChoice.optionsFor(1)).toEqual({ axial: false, releases: ['M:1:i'] });
    expect(fmChoice.optionsFor(2)).toEqual({ axial: true });
    expect(fmChoice.axial).toBe(true);
  });
});
