import type { Section } from '../store/model.svelte';

/**
 * A round bar stored as a CHS with no wall, which is how the solid and concrete circle templates
 * write it: no thickness, or one of half the diameter, and the area of the full disc.
 */
export function isSolidCircle(s: Pick<Section, 'shape' | 'a' | 'h' | 't'>): boolean {
  if (s.shape !== 'CHS' || !(s.h && s.h > 0) || !(s.a > 0)) return false;
  if (s.t != null && s.t > 0 && s.t < s.h / 2 - 1e-9) return false;
  return Math.abs(s.a - (Math.PI * s.h * s.h) / 4) <= 0.01 * s.a;
}
