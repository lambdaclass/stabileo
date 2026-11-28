import { SPACING_GRID } from './objective';

export const minimumColumnTieSpacing = 0.05;

export function columnEndZoneGeometry(b: number, h: number, clear: number, spacing: number, floor: number, cap = Infinity) {
  const endLength = +Math.max(Math.max(b, h), clear / 6, 0.45).toFixed(3);
  const gridSpacing = Math.floor((spacing / 2) / SPACING_GRID + 1e-9) * SPACING_GRID;
  const endSpacing = Math.min(cap, Math.max(floor, gridSpacing));
  return { endLength, endSpacing: +endSpacing.toFixed(4) };
}
