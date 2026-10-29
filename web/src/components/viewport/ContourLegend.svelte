<script lang="ts">
  // The contour colour scale, as a picture: a bar sampled from the same colour function the
  // field is painted with, ticks, a title and a unit. Presentational: callers work out the range.
  import { formatContourLabel } from './contour-label';
  import { bandValue, bandEdges } from '../../lib/engine/contour-scale';
  import { colourFor, type ColourMap } from '../../lib/three/colour-maps';

  let {
    title,
    unit,
    min,
    max,
    bands = 0,
    footer = '',
    ariaLabel = title,
    colourMap = 'shell',
  }: { title: string; unit: string; min: number; max: number; bands?: number; footer?: string; ariaLabel?: string; colourMap?: ColourMap } = $props();
  const shellContourColor = (v: number, lo: number, hi: number) => colourFor(colourMap, v, lo, hi);

  function hex(n: number): string {
    return '#' + n.toString(16).padStart(6, '0');
  }

  const gradient = $derived.by(() => {
    const stops: string[] = [];
    if (bands > 0) {
      for (let k = 0; k < bands; k++) {
        const c = hex(shellContourColor(bandValue(min + ((k + 0.5) / bands) * (max - min), min, max, bands), min, max));
        stops.push(`${c} ${((k / bands) * 100).toFixed(2)}%`, `${c} ${(((k + 1) / bands) * 100).toFixed(2)}%`);
      }
      return `linear-gradient(to top, ${stops.join(', ')})`;
    }
    const N = 20;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      stops.push(`${hex(shellContourColor(min + t * (max - min), min, max))} ${(t * 100).toFixed(0)}%`);
    }
    return `linear-gradient(to top, ${stops.join(', ')})`;
  });

  const fmt = (value: number) => formatContourLabel(value, min, max, bands);
  const mid = $derived((min + max) / 2);
</script>

<div class="shell-legend" role="img" aria-label={ariaLabel}>
  <div class="legend-title">{title}{#if unit} <span class="legend-unit-inline">[{unit}]</span>{/if}</div>
  <div class="legend-body">
    <div class="legend-bar" style="background:{gradient}"></div>
    <div class="legend-ticks">
      {#if bands > 0 && bands <= 8}
        {#each bandEdges(min, max, bands).reverse() as v, i (i)}<span>{fmt(v)}</span>{/each}
      {:else}
        <span>{fmt(max)}</span>
        <span>{fmt(mid)}</span>
        <span>{fmt(min)}</span>
      {/if}
    </div>
  </div>
  {#if footer || unit}<div class="legend-unit">{footer || unit}</div>{/if}
</div>

<style>
  .shell-legend {
    position: absolute;
    right: 12px;
    bottom: 64px;
    background: rgba(20, 24, 38, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    padding: 8px 10px;
    color: #e6e9f0;
    font-size: 11px;
    pointer-events: none;
    z-index: 20;
    user-select: none;
  }
  .legend-title { font-weight: 600; margin-bottom: 6px; text-align: center; }
  .legend-body { display: flex; gap: 6px; }
  .legend-bar {
    width: 14px;
    height: 96px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.18);
  }
  .legend-ticks {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-variant-numeric: tabular-nums;
  }
  .legend-unit { margin-top: 5px; text-align: center; opacity: 0.7; }
  .legend-unit-inline { font-weight: 400; opacity: 0.6; font-size: 10px; }
</style>
