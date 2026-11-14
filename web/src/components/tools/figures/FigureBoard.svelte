<script lang="ts">
  import LineChart from '../../research/shauer2025/LineChart.svelte';
  import SketchView from './SketchView.svelte';
  import { fieldColour } from './colour';
  import { publicI18n, tPublic as t } from '../../../lib/i18n/store.svelte';
  import type { Figure } from './figure';

  let { figures, stale = false, label }: { figures: Figure[]; stale?: boolean; label: string } = $props();
  const number = (n: number, digits = 4) => new Intl.NumberFormat(publicI18n.locale, { maximumSignificantDigits: digits }).format(n);
  const peakText = (f: Figure) => f.peak ? `${t(`tools.peak.${f.peak.label}`)} ${number(f.peak.value)}${f.peak.unit ? ` ${f.peak.unit}` : ''}` : '';
  const wide = (f: Figure) => {
    if (f.key === 'structure' || figures.length === 1) return true;
    if (!f.sketch) return false;
    const [x0, y0, x1, y1] = f.sketch.bounds;
    return (x1 - x0) >= 1.4 * (y1 - y0);
  };
  const where = (f: Figure) => f.peak?.at && f.chart?.along ? ` · ${f.chart.along.symbol} = ${number(f.peak.at[0], 3)} ${f.chart.along.unit}` : '';
  const ramp = (signed: boolean, min: number, max: number) => `linear-gradient(to right, ${Array.from({ length: 9 }, (_, k) => fieldColour(signed, min + (max - min) * k / 8, min, max)).join(', ')})`;
</script>

<div class="board" class:stale aria-busy={stale} aria-label={label} role="group" data-testid="figures">
  {#each figures as f, i (f.key)}
    <figure class="tool-figure" class:lead={i === 0 && wide(f)} data-testid={`figure-${f.key}`}>
      <figcaption>
        <span class="fig-title">{f.title}{#if f.unit}<span class="fig-unit">({f.unit})</span>{/if}</span>
        {#if f.peak}<span class="fig-peak" data-testid={`peak-${f.key}`} data-value={f.peak.value}>{peakText(f)}{where(f)}</span>{/if}
      </figcaption>
      {#if f.sketch?.legend}
        {@const legend = f.sketch.legend}
        <ul class="legend" data-testid="viewer-legend" data-shape={legend.shape} data-scale={legend.scale}>
          <li><span class="swatch member" aria-hidden="true"></span>{t('tools.legend.undeformed')}</li>
          <li><span class="swatch result" aria-hidden="true"></span>{legend.shape === 'mode' ? t('tools.legend.mode') : t('tools.legend.deformed').replace('{scale}', number(legend.scale ?? 1, 3))}</li>
        </ul>
      {/if}
      {#if f.sketch}
        <SketchView view={f.sketch} height={i === 0 && wide(f) ? 240 : 220} label={f.title} />
        {#if !f.sketch.geometryOnly}
          {@const r = f.sketch.range}
          <div class="colour-bar" data-testid="colour-bar">
            <span>{number(r.min, 3)}</span><span class="bar" style:background={ramp(r.min < 0, r.min, r.max)}></span><span>{number(r.max, 3)} {f.sketch.unit}</span>
          </div>
        {/if}
      {:else if f.chart}
        <LineChart ariaLabel={f.title} series={f.chart.series} xLabel={f.chart.xLabel} yLabel={f.chart.yLabel} height={190} marker={f.chart.marker ?? null} point={f.peak?.at ?? null} />
      {/if}
    </figure>
  {/each}
</div>

<style>
  .board { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr)); gap: .75rem; }
  .board > * { min-width: 0; }
  .tool-figure { margin: 0; max-width: none; padding: .6rem .75rem .5rem; background: var(--card); border: 1px solid var(--card-hair); border-radius: 6px; transition: opacity .15s; }
  .tool-figure.lead { grid-column: 1 / -1; }
  .stale .tool-figure { opacity: .55; transition: opacity .2s .3s; }
  figcaption { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: .1rem .75rem; margin-bottom: .35rem; }
  .fig-title { font: 500 .9375rem/1.3 var(--lp-display); color: var(--fg); }
  .fig-unit { font: .8125rem var(--lp-mono); color: var(--fg-2); margin-left: .35em; }
  .fig-peak { font: .8125rem/1.3 var(--lp-mono); color: var(--fg); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .legend { display: flex; flex-wrap: wrap; gap: .1rem 1rem; list-style: none; margin: 0 0 .25rem; padding: 0; font: .75rem var(--lp-mono); color: var(--fg-2); }
  .legend li { display: inline-flex; align-items: center; gap: .4rem; }
  .swatch { display: inline-block; width: 1.1rem; height: 3px; border-radius: 2px; }
  .swatch.member { background: var(--fg-2); }
  .swatch.result { background: var(--lp-accent); }
  .colour-bar { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: .5rem; font: .75rem var(--lp-mono); color: var(--fg-2); margin-top: .25rem; }
  .colour-bar .bar { height: .5rem; border-radius: 2px; }
  .tool-figure :global(.chart) { position: relative; }
  .tool-figure :global(.chart .readout) { position: absolute !important; top: 0; right: 0; left: auto !important; width: auto; max-width: 75%; }
</style>
