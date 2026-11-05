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

function pieces(s: PlotSeries): PlotSeries[] {
  const runs: Array<Array<[number, number]>> = [[]];
  for (const p of s.points) {
    if (Number.isFinite(p[0]) && Number.isFinite(p[1])) runs[runs.length - 1].push(p);
    else if (runs[runs.length - 1].length > 0) runs.push([]);
  }
  const kept = runs.filter((r) => r.length > 0);
  if (kept.length === 0) return [{ ...s, points: [] }];
  const { label, ...rest } = s;
  return kept.map((points, i) => (i === 0 && label !== undefined ? { ...rest, label, points } : { ...rest, points }));
}

/** A non-finite point breaks its series into separate pieces; the label stays on the first. */
export function plotOf(xLabel: string, yLabel: string, series: PlotSeries[], extra: Partial<Omit<Plot, 'xLabel' | 'yLabel' | 'series'>> = {}): Plot {
  return { xLabel, yLabel, series: series.flatMap(pieces), ...extra };
}
