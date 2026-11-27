import { fixedNumber } from '../utils/unit-format';
import { toDisplay, unitLabel, type UnitSystem } from '../utils/units';
import { DIAGRAM_EXTREMA_UNAVAILABLE } from '../engine/member-diagram';

export function axialPaintRange({ maxValue, minValue }: { maxValue: number; minValue: number }) {
  const tension = Math.max(0, maxValue);
  const compression = Math.min(0, minValue);
  return { tension, compression, mixed: tension > 0 && compression < 0, peak: Math.max(tension, -compression) };
}

export function signedAxialRange(read: () => { maxValue: number; minValue: number; extrema?: 'bounded' }) {
  try {
    const diagram = read();
    return diagram.extrema === 'bounded' ? null : axialPaintRange(diagram);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== DIAGRAM_EXTREMA_UNAVAILABLE) throw error;
    return null;
  }
}

export function axialPaintLabel(range: ReturnType<typeof axialPaintRange>, units: UnitSystem): string {
  return [range.compression, range.tension].filter(v => v !== 0).map(v => {
    const fixed = fixedNumber(v, 'force', 1, units);
    const number = Number(fixed) === 0 ? String(Number(toDisplay(v, 'force', units).toPrecision(2))) : fixed;
    return (v > 0 ? '+' : '') + number + ' ' + unitLabel('force', units);
  }).join(' / ');
}
