<script lang="ts">
  import { num, tickDecimals } from '../shell/format';

  export type PathSeries = { name: string; color: string; points: [number, number][]; reference?: boolean };
  export type LimitMarker = { x: number; y: number; label: string };

  let {
    series,
    limits,
    xLabel,
    yLabel,
    current = null,
    height = 320,
  }: {
    series: PathSeries[];
    limits: LimitMarker[];
    xLabel: string;
    yLabel: string;
    current?: { x: number; y: number } | null;
    height?: number;
  } = $props();

  let width = $state(600);
  const M = { l: 62, r: 26, t: 28, b: 44 };

  function ticks(lo: number, hi: number, count: number) {
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { values: [0, 1], step: 1, lo: 0, hi: 1 };
    if (hi <= lo) [lo, hi] = hi === 0 ? [-1, 1] : [lo - Math.abs(lo || 1) * 0.05, hi + Math.abs(hi || 1) * 0.05];
    const raw = (hi - lo) / count;
    const p = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((v) => v >= raw) ?? raw;
    const low = Math.floor(lo / step) * step;
    const high = Math.ceil(hi / step) * step;
    const values: number[] = [];
    for (let v = low; v <= high + step * 1e-8; v += step) values.push(Number(v.toPrecision(12)));
    return { values, step, lo: low, hi: high };
  }

  const points = $derived(series.flatMap((s) => s.points).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
  const xt = $derived(ticks(Math.min(0, ...points.map((p) => p[0]), ...limits.map((p) => p.x)), Math.max(0, ...points.map((p) => p[0]), ...limits.map((p) => p.x)), 6));
  const yt = $derived(ticks(Math.min(0, ...points.map((p) => p[1]), ...limits.map((p) => p.y)), Math.max(0, ...points.map((p) => p[1]), ...limits.map((p) => p.y)), 5));
  const sx = (x: number) => M.l + ((x - xt.lo) / (xt.hi - xt.lo)) * (width - M.l - M.r);
  const sy = (y: number) => M.t + (1 - (y - yt.lo) / (yt.hi - yt.lo)) * (height - M.t - M.b);
  const path = (values: [number, number][]) => values.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(2)},${sy(y).toFixed(2)}`).join('');
  const ordered = $derived([...series].sort((a, b) => Number(!!b.reference) - Number(!!a.reference)));
</script>

<div class="path-chart" bind:clientWidth={width}>
  <svg {width} {height} role="img" aria-label="{yLabel} against {xLabel}">
    <text x={M.l - 8} y={13} class="label">{yLabel}</text>
    {#each xt.values as x (x)}
      <line x1={sx(x)} x2={sx(x)} y1={M.t} y2={height - M.b} class="grid" />
      <text x={sx(x)} y={height - M.b + 18} class="tick" text-anchor="middle">{num(x, { dp: tickDecimals(xt.step) })}</text>
    {/each}
    {#each yt.values as y (y)}
      <line x1={M.l} x2={width - M.r} y1={sy(y)} y2={sy(y)} class="grid" />
      <text x={M.l - 8} y={sy(y)} class="tick" text-anchor="end" dominant-baseline="middle">{num(y, { dp: tickDecimals(yt.step) })}</text>
    {/each}
    {#if xt.lo < 0 && xt.hi > 0}<line x1={sx(0)} x2={sx(0)} y1={M.t} y2={height - M.b} class="axis" />{/if}
    {#if yt.lo < 0 && yt.hi > 0}<line x1={M.l} x2={width - M.r} y1={sy(0)} y2={sy(0)} class="axis" />{/if}
    <text x={width - M.r} y={height - 7} class="label" text-anchor="end">{xLabel}</text>
    {#each ordered as item (item.name)}
      <path d={path(item.points)} fill="none" style:stroke={item.color} stroke-width={item.reference ? 7 : 2} stroke-opacity={item.reference ? 0.35 : 1} stroke-linecap="round" stroke-linejoin="round" />
    {/each}
    {#each limits as limit (limit.label)}
      <circle cx={sx(limit.x)} cy={sy(limit.y)} r="5" class="limit" />
      <text x={sx(limit.x)} y={sy(limit.y) - 10} class="limit-label" text-anchor="middle">{limit.label}</text>
    {/each}
    {#if current}
      <circle cx={sx(current.x)} cy={sy(current.y)} r="5" class="current" />
    {/if}
  </svg>
</div>

<style>
  .path-chart { width: 100%; min-width: 0; }
  svg { display: block; overflow: visible; }
  .grid { stroke: var(--rs-plot-grid); stroke-width: 1; }
  .axis { stroke: var(--rs-plot-axis); stroke-width: 1.25; }
  .tick, .label, .limit-label { fill: var(--fg-2); font: var(--rs-micro) var(--st-sans); font-variant-numeric: tabular-nums; }
  .limit { fill: var(--st-warn); stroke: var(--lp-ink); stroke-width: 2; }
  .limit-label { fill: var(--st-warn); }
  .current { fill: var(--rs-plot-ours); stroke: var(--lp-ink); stroke-width: 2; }
</style>
