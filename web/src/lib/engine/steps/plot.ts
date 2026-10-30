/**
 * A chart of a step-by-step document, as data: curves y(x) on one pair of
 * axes, drawn by components/steps/StepPlot.svelte. Axis labels are symbols
 * and units ("t (s)", "u (mm)"); words go in series labels as i18n keys.
 */
import type { Txt } from './doc';

export type PlotColor = 'accent' | 'muted' | 'load' | 'reaction' | 'moment' | 'deformed' | 'diagram' | 'dof';

export interface PlotSeries {
  points: Array<[number, number]>;
  label?: string | Txt;
  color?: PlotColor;
  dashed?: boolean;
}

export interface Plot {
  xLabel: string;
  yLabel: string;
  series: PlotSeries[];
  /** Points to mark, with a short label (a value, "β = 1"). */
  marks?: Array<{ x: number; y: number; label?: string }>;
  /** Vertical reference lines. */
  vlines?: Array<{ x: number; label?: string }>;
  /** Clip the y axis to this range (a resonance peak that would flatten the rest). */
  yRange?: [number, number];
  height?: number;
}

const clean = (pts: Array<[number, number]>) => pts.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

export function plotOf(xLabel: string, yLabel: string, series: PlotSeries[], extra: Partial<Omit<Plot, 'xLabel' | 'yLabel' | 'series'>> = {}): Plot {
  return { xLabel, yLabel, series: series.map((s) => ({ ...s, points: clean(s.points) })), ...extra };
}
