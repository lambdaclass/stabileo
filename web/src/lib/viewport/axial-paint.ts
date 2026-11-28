import { fixedNumber } from '../utils/unit-format';
import { toDisplay, unitLabel, type UnitSystem } from '../utils/units';
import { DIAGRAM_EXTREMA_UNAVAILABLE } from '../engine/member-diagram';

export function axialPaintRange({ maxValue, minValue }: { maxValue: number; minValue: number }) {
  const tension = maxValue > 1e-10 ? maxValue : 0;
  const compression = minValue < -1e-10 ? minValue : 0;
  return { tension, compression, mixed: tension > 0 && compression < 0, peak: Math.max(tension, -compression) };
}

export function envelopeAxialRanges(data?: { elements: { elementId: number; tPositions: number[]; posValues: number[]; negValues: number[] }[] }) {
  const ranges = new Map<number, ReturnType<typeof axialPaintRange>>();
  for (const { elementId, tPositions, posValues, negValues } of data?.elements ?? []) {
    if (!Array.isArray(tPositions) || !Array.isArray(posValues) || !Array.isArray(negValues) ||
        tPositions[0] !== 0 || tPositions.at(-1) !== 1 ||
        tPositions.length !== posValues.length || tPositions.length !== negValues.length) continue;
    let maxValue = 0, minValue = 0;
    const valid = tPositions.every((station, i) => {
      const positive = posValues[i], negative = negValues[i];
      if (!Number.isFinite(station) || (i > 0 && station < tPositions[i - 1]!) || !Number.isFinite(positive) || !Number.isFinite(negative) || positive < 0 || negative > 0) return false;
      maxValue = Math.max(maxValue, positive);
      minValue = Math.min(minValue, negative);
      return true;
    });
    if (valid) ranges.set(elementId, axialPaintRange({ maxValue, minValue }));
  }
  return ranges;
}

export function signedAxialRange(read: () => { maxValue: number; minValue: number; extrema?: 'bounded' }) {
  try {
    const diagram = read();
    if (diagram.extrema === 'bounded' || !Number.isFinite(diagram.minValue) || !Number.isFinite(diagram.maxValue) ||
        diagram.minValue > diagram.maxValue) return null;
    return axialPaintRange(diagram);
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
