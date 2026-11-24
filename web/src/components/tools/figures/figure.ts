import type { View } from '../../examples/define';
import type { Series } from '../../research/shauer2025/protocol';

export type PeakLabel = 'max' | 'f' | 'lambda' | 'pcr';

export type Peak = { value: number; unit: string; label: PeakLabel; at?: [number, number] };

export type ChartFigure = { series: Series[]; xLabel: string; yLabel: string; marker?: number | null; along?: { symbol: string; unit: string } };

export type Figure = {
  key: string;
  title: string;
  unit: string;
  peak?: Peak;
  sketch?: View;
  chart?: ChartFigure;
};

export function peakOf(points: readonly [number, number][]): [number, number] {
  return points.reduce<[number, number]>((best, p) => (Math.abs(p[1]) > Math.abs(best[1]) ? p : best), points[0] ?? [0, 0]);
}

export function chartFigure(key: string, title: string, unit: string, points: [number, number][], along = { symbol: 'x', unit: 'm' }): Figure {
  const at = peakOf(points);
  return {
    key, title, unit,
    peak: { value: Math.abs(at[1]), unit, label: 'max', at },
    chart: { series: [{ name: title, color: 'var(--lp-accent)', points }], xLabel: `${along.symbol} (${along.unit})`, yLabel: unit ? `${title} (${unit})` : title, along },
  };
}
