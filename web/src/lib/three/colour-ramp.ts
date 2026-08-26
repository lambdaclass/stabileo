/**
 * The ONE colour ramp of the colour maps.
 *
 * Three places paint with it and a fourth explains it: the 2D canvas colours
 * its members, the 3D viewport colours its heat-map cylinders (and mirrors the
 * same colours onto wireframe and shells), and the legend draws the gradient a
 * reader decodes them with. Each used to carry its own copy — an HSL sweep
 * here, an rgb formula there, a stop list in the legend — and no two agreed,
 * so the bar under the map described a picture nobody was showing.
 *
 * Pure arithmetic, no three.js: the 2D viewport and the legend import this
 * too, and neither should carry a WebGL library to interpolate a colour.
 */

/** Stops of the ramp the maps paint: blue → green → yellow → red, low to high. */
export const COLOUR_RAMP_STOPS: ReadonlyArray<{ at: number; rgb: readonly [number, number, number] }> = [
  { at: 0, rgb: [0, 255, 200] },
  { at: 0.25, rgb: [0, 255, 0] },
  { at: 0.5, rgb: [255, 255, 0] },
  { at: 0.75, rgb: [255, 128, 0] },
  { at: 1, rgb: [255, 0, 0] },
];

/**
 * Past the top of the scale — utilisation over fy (ratio > 1) — the map
 * paints magenta. A member past its limit must not read as "red, but more
 * so": red already means the top of the scale, and blending the two hides
 * the one distinction the map exists to show.
 */
export const OVER_SCALE_RGB: readonly [number, number, number] = [255, 0, 255];

/**
 * The ramp colour at `norm`, where 0 is the bottom of the published scale and
 * 1 its top. Above 1 is off the scale and comes back magenta (see above).
 */
export function colourRampRgb(norm: number): [number, number, number] {
  if (norm > 1) return [OVER_SCALE_RGB[0], OVER_SCALE_RGB[1], OVER_SCALE_RGB[2]];
  const t = Math.max(0, norm);
  for (let i = 1; i < COLOUR_RAMP_STOPS.length; i++) {
    const hi = COLOUR_RAMP_STOPS[i];
    if (t <= hi.at) {
      const lo = COLOUR_RAMP_STOPS[i - 1];
      const k = (t - lo.at) / (hi.at - lo.at);
      return [0, 1, 2].map((c) => Math.round(lo.rgb[c] + (hi.rgb[c] - lo.rgb[c]) * k)) as [number, number, number];
    }
  }
  const top = COLOUR_RAMP_STOPS[COLOUR_RAMP_STOPS.length - 1].rgb;
  return [top[0], top[1], top[2]];
}

/** The same colour as a CSS `rgb()` — the 2D canvas and the legend. */
export function colourRampCss(norm: number): string {
  const [r, g, b] = colourRampRgb(norm);
  return `rgb(${r},${g},${b})`;
}

/** The same colour as a three.js hex — the 3D heat map. */
export function colourRampHex(norm: number): number {
  const [r, g, b] = colourRampRgb(norm);
  return (r << 16) | (g << 8) | b;
}

/**
 * The unit of whatever the colour map is painting.
 *
 * Utilisation is a ratio and has none — labelling it "1.00 MPa" would be
 * worse than labelling it nothing at all. Stresses read MPa and the painters
 * publish in MPa too: the 3D one samples in the solver's kPa and converts at
 * publish time, so the number and the unit always agree.
 */
export function colourMapUnit(kind: string): string {
  if (kind === 'stressRatio') return '';
  if (kind === 'vonMises' || kind === 'sigmaMax' || kind === 'tauMax') return 'MPa';
  if (kind === 'moment' || kind === 'momentY' || kind === 'momentZ' || kind === 'torsion') return 'kN·m';
  return 'kN';
}
