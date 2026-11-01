<script lang="ts">
  import { axis } from './plot-axis';
  /**
   * A small SVG chart: lines, bands, points with optional vertical error bars, a highlighted
   * current point and reference rules. Axes fit every series and end on a tick. Encoding: hue is
   * the source (ours blue, the paper orange); dashes mark a variant within a source.
   */
  export type PlotSeries = {
    name: string;
    color: string;
    points: { x: number; y: number; lo?: number; hi?: number }[];
    kind: 'line' | 'points' | 'band';
    dashed?: boolean;
    shape?: 'circle' | 'triangle' | 'square';
  };

  let {
    series,
    xLabel,
    yLabel,
    xDomain = null,
    yDomain = null,
    current = null,
    rules = [],
    height = 240,
    ariaLabel,
  }: {
    series: PlotSeries[];
    xLabel: string;
    yLabel: string;
    xDomain?: [number, number] | null;
    yDomain?: [number, number] | null;
    current?: { x: number; y: number; label: string } | null;
    rules?: { x?: number; y?: number; label: string }[];
    height?: number;
    ariaLabel: string;
  } = $props();

  let width = $state(480);
  const M = { l: 44, r: 28, t: 22, b: 30 };


  const ys = $derived(
    series.flatMap((s) => s.points.flatMap((p) => [p.y, p.lo ?? p.y, p.hi ?? p.y])).concat(current ? [current.y] : []).filter(Number.isFinite),
  );
  const xs = $derived(series.flatMap((s) => s.points.map((p) => p.x)).filter(Number.isFinite));
  const X = $derived(xDomain ? axis(xDomain[0], xDomain[1], true) : axis(Math.min(...xs), Math.max(...xs), false));
  const Y = $derived(yDomain ? axis(yDomain[0], yDomain[1], true) : axis(Math.min(...ys), Math.max(...ys), false));
  const sx = (x: number) => M.l + ((x - X.domain[0]) / (X.domain[1] - X.domain[0])) * (width - M.l - M.r);
  const sy = (y: number) => M.t + (1 - (y - Y.domain[0]) / (Y.domain[1] - Y.domain[0])) * (height - M.t - M.b);
  const fmt = (v: number, d: number) => (Math.abs(v) < 1e-12 ? '0' : v.toFixed(d).replace('-', '−'));
  const path = (pts: { x: number; y: number }[]) =>
    pts
      .filter((p) => Number.isFinite(p.y))
      .map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
      .join('');
  const band = (pts: { x: number; lo?: number; hi?: number }[]) => {
    const up = pts.map((p) => `${sx(p.x).toFixed(1)},${sy(p.hi ?? 0).toFixed(1)}`);
    const down = [...pts].reverse().map((p) => `${sx(p.x).toFixed(1)},${sy(p.lo ?? 0).toFixed(1)}`);
    return `M${up.join('L')}L${down.join('L')}Z`;
  };
</script>

{#snippet mark(shape: PlotSeries['shape'], cx: number, cy: number, color: string)}
  {#if shape === 'triangle'}
    <path d="M{cx},{cy - 5}l4.5,8h-9z" fill={color} />
  {:else if shape === 'square'}
    <rect x={cx - 4} y={cy - 4} width="8" height="8" fill="none" stroke={color} stroke-width="1.6" />
  {:else}
    <circle {cx} {cy} r="3.2" fill={color} />
  {/if}
{/snippet}

<figure class="plot" bind:clientWidth={width}>
  <svg {width} {height} role="img" aria-label={ariaLabel}>
    <text x={M.l - 6} y="12" class="axis" text-anchor="start">{yLabel}</text>
    {#each Y.ticks as t (t)}
      <line x1={M.l} x2={width - M.r} y1={sy(t)} y2={sy(t)} class="grid" />
      <text x={M.l - 6} y={sy(t) + 4} text-anchor="end" class="tick">{fmt(t, Y.decimals)}</text>
    {/each}
    {#each X.ticks as t, i (t)}
      <text x={sx(t)} y={height - M.b + 15} text-anchor={i === X.ticks.length - 1 ? 'end' : 'middle'} class="tick">{fmt(t, X.decimals)}</text>
    {/each}
    {#if Y.domain[0] < 0 && Y.domain[1] > 0}<line x1={M.l} x2={width - M.r} y1={sy(0)} y2={sy(0)} class="zero" />{/if}
    {#each rules as r (r.label)}
      {#if r.x !== undefined}
        <line x1={sx(r.x)} x2={sx(r.x)} y1={M.t} y2={height - M.b} class="rule" /><text x={sx(r.x) + 4} y={M.t + 11} class="rule-t">{r.label}</text>
      {:else if r.y !== undefined}
        <line x1={M.l} x2={width - M.r} y1={sy(r.y)} y2={sy(r.y)} class="rule" /><text x={width - M.r - 4} y={sy(r.y) - 4} text-anchor="end" class="rule-t">{r.label}</text>
      {/if}
    {/each}
    {#each series as s (s.name)}
      {#if s.kind === 'band'}
        <path d={band(s.points)} fill={s.color} opacity="0.18" />
      {:else if s.kind === 'line'}
        <path d={path(s.points)} fill="none" stroke={s.color} stroke-width="1.75" stroke-dasharray={s.dashed ? '5 4' : undefined} />
      {:else}
        {#each s.points as p, i (i)}
          {#if p.lo !== undefined && p.hi !== undefined}
            <line x1={sx(p.x)} x2={sx(p.x)} y1={sy(p.lo)} y2={sy(p.hi)} stroke={s.color} stroke-width="1.2" opacity="0.8" />
          {/if}
          {#if Number.isFinite(p.y)}{@render mark(s.shape, sx(p.x), sy(p.y), s.color)}{/if}
        {/each}
      {/if}
    {/each}
    {#if current && Number.isFinite(current.y)}
      <circle cx={sx(current.x)} cy={sy(current.y)} r="6" fill="none" stroke="var(--fg, #fff)" stroke-width="2" />
    {/if}
    <text x={width - M.r} y={height - 2} text-anchor="end" class="axis">{xLabel}</text>
  </svg>
  <ul class="legend">
    {#each series.filter((s) => s.kind !== 'band') as s (s.name)}
      <li>
        <svg width="18" height="12" aria-hidden="true">
          {#if s.kind === 'line'}<line x1="0" x2="18" y1="6" y2="6" stroke={s.color} stroke-width="2" stroke-dasharray={s.dashed ? '4 3' : undefined} />{:else}{@render mark(s.shape, 9, 7, s.color)}{/if}
        </svg>{s.name}
      </li>
    {/each}
    {#if current}<li><svg width="18" height="14" aria-hidden="true"><circle cx="9" cy="7" r="5" fill="none" stroke="var(--fg, #fff)" stroke-width="2" /></svg>{current.label}</li>{/if}
  </ul>
</figure>

<style>
  .plot {
    width: 100%;
    margin: 0.5rem 0 1rem;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .grid {
    stroke: var(--st-canvas-grid, rgba(255, 255, 255, 0.13));
    stroke-width: 1;
  }
  .zero {
    stroke: var(--fg-2, #999);
    stroke-width: 1;
  }
  .rule {
    stroke: var(--fg-2, #999);
    stroke-dasharray: 2 3;
  }
  .rule-t,
  .tick {
    fill: var(--fg-2, #999);
    font: 12px var(--lp-sans, sans-serif);
    font-variant-numeric: tabular-nums;
  }
  .axis {
    fill: var(--fg, #ddd);
    font: 13px var(--lp-sans, sans-serif);
  }
  .legend {
    list-style: none;
    padding: 0;
    margin: 0.4rem 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 1rem;
    font-size: 0.875rem;
    color: var(--fg-2, #aaa);
  }
  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .legend svg {
    display: inline-block;
  }
</style>
