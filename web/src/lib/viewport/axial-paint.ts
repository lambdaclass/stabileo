import { fixedQuantity } from '../utils/unit-format';
import type { UnitSystem } from '../utils/units';

export function axialPaintRange({ maxValue, minValue }: { maxValue: number; minValue: number }) {
  const tension = Math.max(0, maxValue);
  const compression = Math.min(0, minValue);
  return { tension, compression, mixed: tension > 0 && compression < 0, peak: Math.max(tension, -compression) };
}

export function axialPaintLabel(range: ReturnType<typeof axialPaintRange>, units: UnitSystem): string {
  return [range.compression, range.tension].filter(v => v !== 0).map(v => {
    const formatted = fixedQuantity(v, 'force', 1, units);
    return (v > 0 ? '+' : '') + formatted;
  }).join(' / ');
}
