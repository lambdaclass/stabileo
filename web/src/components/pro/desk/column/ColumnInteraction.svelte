<script lang="ts">
  /** A column's φPn–φMn curves, bending over its depth and over its width, with the demand points. */
  import { t } from '../../../../lib/i18n';
  import type { InteractionPlot } from '../../../../lib/engine/design/column-interaction';
  let { plot }: { plot: InteractionPlot } = $props();
  const W = 300, H = 220, M = 34;
  const mMax = $derived(Math.max(1, ...plot.overDepth.map((p) => p.M), ...plot.overWidth.map((p) => p.M), ...plot.demands.map((d) => Math.max(d.Mdepth, d.Mwidth))) * 1.05);
  const pMax = $derived(Math.max(1, ...plot.overDepth.map((p) => p.P), ...plot.demands.map((d) => d.P)) * 1.05);
  const pMin = $derived(Math.min(0, ...plot.overDepth.map((p) => p.P), ...plot.demands.map((d) => d.P)) * 1.05);
  const X = (m: number) => M + (m / mMax) * (W - M - 8);
  const Y = (p: number) => 8 + ((pMax - p) / (pMax - pMin || 1)) * (H - M - 8);
  const line = (ps: Array<{ M: number; P: number }>) => ps.map((p, i) => `${i ? 'L' : 'M'}${X(p.M).toFixed(1)},${Y(p.P).toFixed(1)}`).join(' ');
</script>

<svg viewBox="0 0 {W} {H}" class="ci" role="img" aria-label={t('colEd.interaction')} data-testid="column-interaction">
  <line x1={M} y1={Y(0)} x2={W - 8} y2={Y(0)} class="ax" />
  <line x1={M} y1={8} x2={M} y2={H - M} class="ax" />
  <text x={4} y={14} class="lb">φPn</text>
  <text x={W - 40} y={H - M + 14} class="lb">φMn</text>
  <text x={M + 2} y={Y(pMax / 1.05) + 10} class="lb">{(pMax / 1.05).toFixed(0)} kN</text>
  <text x={X(mMax / 1.05) - 30} y={Y(0) - 3} class="lb">{(mMax / 1.05).toFixed(0)} kN·m</text>
  <path d={line(plot.overDepth)} class="c1" />
  <path d={line(plot.overWidth)} class="c2" />
  {#each plot.demands as d}
    <circle cx={X(d.Mdepth)} cy={Y(d.P)} r="1.8" class="d1"><title>{d.combo}</title></circle>
    <circle cx={X(d.Mwidth)} cy={Y(d.P)} r="1.8" class="d2"><title>{d.combo}</title></circle>
  {/each}
</svg>
<p class="lg"><span class="c1t">—</span> {t('colEd.overDepth')} · <span class="c2t">—</span> {t('colEd.overWidth')} · ● {t('colEd.demands')}</p>

<style>
  .ci { width: 100%; max-width: 360px; background: var(--st-surface); border: 1px solid var(--st-hair); border-radius: 4px; }
  .ax { stroke: var(--st-hair-strong); stroke-width: 0.8; }
  .lb { font-size: 8px; fill: var(--st-text-3); }
  .c1 { fill: none; stroke: var(--st-value); stroke-width: 1.5; }
  .c2 { fill: none; stroke: var(--st-warn); stroke-width: 1.5; }
  .d1 { fill: var(--st-value); } .d2 { fill: var(--st-warn); }
  .lg { font-size: 0.64rem; color: var(--st-text-3); margin: 2px 0 0; }
  .c1t { color: var(--st-value); } .c2t { color: var(--st-warn); }
</style>
