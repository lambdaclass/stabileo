/**
 * ONE ramp, three painters, one legend.
 *
 * The colour map is painted by the 2D canvas, by the 3D heat map, and
 * explained by the legend — and each used to carry its own copy of the ramp
 * (an rgb formula, an HSL sweep, a stop list), so the bar under the map
 * described a picture nobody was showing. These tests pin the sharing itself,
 * not just the colours: the painters must be unable to drift from the legend
 * again without failing here.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COLOUR_RAMP_STOPS, OVER_SCALE_RGB,
  colourRampRgb, colourRampCss, colourRampHex, colourMapUnit,
} from '../colour-ramp';
import { heatmapColor } from '../selection-helpers';

const css = (rgb: readonly [number, number, number]) => `rgb(${rgb.join(',')})`;
const hex = (rgb: readonly [number, number, number]) => (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];

describe('the shared colour ramp', () => {
  it('passes through every published stop exactly', () => {
    for (const stop of COLOUR_RAMP_STOPS) {
      expect(colourRampCss(stop.at), `css at ${stop.at}`).toBe(css(stop.rgb));
      expect(colourRampHex(stop.at), `hex at ${stop.at}`).toBe(hex(stop.rgb));
    }
  });

  it('interpolates linearly between stops', () => {
    // Halfway between stop 0 (0,255,200) and stop 1 (0,255,0).
    expect(colourRampRgb(0.125)).toEqual([0, 255, 100]);
    // Halfway between yellow (255,255,0) and orange (255,128,0).
    expect(colourRampRgb(0.625)).toEqual([255, 192, 0]);
  });

  it('clamps below the bottom of the scale to the first stop', () => {
    expect(colourRampRgb(-0.5)).toEqual([...COLOUR_RAMP_STOPS[0].rgb]);
  });

  it('paints magenta past the top of the scale — utilisation over fy', () => {
    expect(colourRampRgb(1.01)).toEqual([...OVER_SCALE_RGB]);
    expect(colourRampCss(1.5)).toBe('rgb(255,0,255)');
    expect(colourRampHex(2)).toBe(0xff00ff);
  });

  it('is the ramp the 3D painter uses', () => {
    /*
     * heatmapColor used to be a private HSL sweep that matched neither the
     * legend nor the 2D canvas. It must now be the shared ramp, verbatim —
     * including the magenta above 1, which the old clamp hid as red.
     */
    for (const norm of [0, 0.125, 0.4, 0.75, 1, 1.3]) {
      expect(heatmapColor(norm), `norm ${norm}`).toBe(colourRampHex(norm));
    }
  });

  it('is the ramp the legend and the 2D painter import', () => {
    /*
     * Svelte components cannot be asserted colour-by-colour without a DOM, so
     * this pins the next best thing: neither file may carry its own ramp
     * again — both must read from the module this test covers.
     */
    const components = join(import.meta.dirname, '../../../components');
    expect(readFileSync(join(components, 'ColourScaleLegend.svelte'), 'utf8'))
      .toContain('colour-ramp');
    expect(readFileSync(join(components, 'Viewport.svelte'), 'utf8'))
      .toContain('colour-ramp');
  });
});

describe('the unit of whatever the map is painting', () => {
  it('is the one mapping both viewports publish', () => {
    expect(colourMapUnit('stressRatio')).toBe('');      // a ratio has no unit
    expect(colourMapUnit('vonMises')).toBe('MPa');
    expect(colourMapUnit('sigmaMax')).toBe('MPa');
    expect(colourMapUnit('tauMax')).toBe('MPa');
    expect(colourMapUnit('moment')).toBe('kN·m');
    expect(colourMapUnit('momentY')).toBe('kN·m');
    expect(colourMapUnit('momentZ')).toBe('kN·m');
    expect(colourMapUnit('torsion')).toBe('kN·m');
    expect(colourMapUnit('axial')).toBe('kN');
    expect(colourMapUnit('shear')).toBe('kN');
    expect(colourMapUnit('shearY')).toBe('kN');
    expect(colourMapUnit('shearZ')).toBe('kN');
  });
});
