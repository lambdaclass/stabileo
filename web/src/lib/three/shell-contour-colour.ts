import * as THREE from 'three';

/**
 * The colour of one shell-contour value, over the range actually present.
 *
 * ── Why a rainbow, and why over [min, max] ─────────────────────────
 *
 * The contour was normalised by AMPLITUDE — the largest magnitude present —
 * and painted white → red. On a raft whose `mx` runs from −33 to 1735 kN·m/m
 * that put every value in the top decade of one hue: the plate came out a
 * uniform pale pink, and a reader could not see where the moment peaked,
 * which is the only reason to draw the map.
 *
 * Two changes, and they are the two every FE post-processor makes. The range
 * is the one the results occupy, so the whole scale is spent on the field
 * that exists rather than on a symmetric span around zero that does not. And
 * the ramp walks blue → cyan → green → yellow → red, because five hues
 * separate a gradient that one hue's lightness cannot: the eye reads hue far
 * better than it reads saturation, which is why contour plots have looked
 * like this since they were printed on paper.
 *
 * A field with no range at all (every value equal) paints mid-scale rather
 * than dividing by zero — flat IS the answer there.
 */
export function shellContourColor(v: number, min: number, max: number): number {
  const span = max - min;
  const t = span > 1e-12 ? Math.max(0, Math.min(1, (v - min) / span)) : 0.5;
  const c = new THREE.Color();
  /* Five stops, linearly interpolated in RGB. Hue rotation would be smoother
     in theory and gives a magenta wrap in practice, which reads as a second
     maximum. */
  const stops: Array<[number, number, number]> = [
    [0.10, 0.20, 0.85], // blue
    [0.10, 0.75, 0.90], // cyan
    [0.20, 0.80, 0.25], // green
    [0.95, 0.90, 0.15], // yellow
    [0.90, 0.15, 0.10], // red
  ];
  const x = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i], b = stops[i + 1];
  c.setRGB(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
  return c.getHex();
}
