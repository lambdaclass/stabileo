<script lang="ts">
  /**
   * Lines on one shared y axis, with a crosshair tooltip that reads every series at the nearest
   * x. Series are drawn in the order given, which fixes their colour.
   */
  import type { Series } from './protocol';

  let {
    series,
    xLabel,
    yLabel,
    height = 260,
    fx = (v: number) => v.toPrecision(3),
    fy = (v: number) => v.toPrecision(3),
    marker = null,
  }: {
    series: Series[];
    xLabel: string;
    yLabel: string;
    height?: number;
    fx?: (v: number) => string;
    fy?: (v: number) => string;
    /** An x to mark with a vertical rule (the step shown in the field view). */
    marker?: number | null;
  } = $props();

  let width = $state(600);
  let hoverX = $state<number | null>(null);
  const M = { l: 84, r: 16, t: 12, b: 40 };

  /** Ticks that cover [lo, hi]: the first at or below lo, the last at or above hi. */
  function niceTicks(lo: number, hi: number, n = 5): number[] {
    if (!(hi > lo)) return [lo, lo + 1];
    const raw = (hi - lo) / n;
    const p = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw) ?? raw;
    const first = Math.floor(lo / step + 1e-9) * step;
    const last = Math.ceil(hi / step - 1e-9) * step;
    const out: number[] = [];
    for (let v = first; v <= last + step * 1e-6; v += step) out.push(Number(v.toPrecision(12)));
    return out;
  }

  const all = $derived(series.flatMap((s) => s.points).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])));
  const xTicks = $derived(niceTicks(0, Math.max(1e-12, ...all.map((p) => p[0]))));
  const yLo = $derived(Math.min(0, ...all.map((p) => p[1])));
  const yHi = $derived(Math.max(1e-12, ...all.map((p) => p[1])));
  const yTicks = $derived(niceTicks(yLo, yHi + 0.04 * (yHi - yLo)));
  const x0 = $derived(xTicks[0]);
  const x1 = $derived(xTicks[xTicks.length - 1]);
  const y0 = $derived(yTicks[0]);
  const y1 = $derived(yTicks[yTicks.length - 1]);
  const sx = (x: number) => M.l + ((x - x0) / (x1 - x0)) * (width - M.l - M.r);
  const sy = (y: number) => M.t + (1 - (y - y0) / (y1 - y0)) * (height - M.t - M.b);
  const clipId = `clip-${Math.random().toString(36).slice(2)}`;

  function path(points: [number, number][]) {
    return points.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('');
  }

  const readout = $derived.by(() => {
    if (hoverX === null) return null;
    const rows = series.map((s) => {
      let best: [number, number] | null = null;
      for (const p of s.points) if (!best || Math.abs(p[0] - hoverX!) < Math.abs(best[0] - hoverX!)) best = p;
      return { s, p: best };
    });
    const x = rows.find((r) => r.p)?.p?.[0];
    return x === undefined ? null : { x, rows };
  });

  function onMove(e: PointerEvent) {
    const svg = e.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const px = e.clientX - r.left;
    if (px < M.l || px > width - M.r) {
      hoverX = null;
      return;
    }
    hoverX = x0 + ((px - M.l) / (width - M.l - M.r)) * (x1 - x0);
  }
</script>

<div class="chart" bind:clientWidth={width}>
  <svg {width} {height} role="img" aria-label="{yLabel} against {xLabel}" onpointermove={onMove} onpointerleave={() => (hoverX = null)}>
    {#each yTicks as t (t)}
      <line x1={M.l} x2={width - M.r} y1={sy(t)} y2={sy(t)} class="grid" />
      <text x={M.l - 8} y={sy(t)} class="tick" text-anchor="end" dominant-baseline="middle">{fy(t)}</text>
    {/each}
    {#each xTicks as t (t)}
      <text x={sx(t)} y={height - M.b + 16} class="tick" text-anchor="middle">{fx(t)}</text>
    {/each}
    <line x1={M.l} x2={width - M.r} y1={sy(0)} y2={sy(0)} class="axis" />
    <text x={(M.l + width - M.r) / 2} y={height - 6} class="label" text-anchor="middle">{xLabel}</text>
    <text transform="translate(14 {(M.t + height - M.b) / 2}) rotate(-90)" class="label" text-anchor="middle">{yLabel}</text>
    {#if marker !== null}
      <line x1={sx(marker)} x2={sx(marker)} y1={M.t} y2={height - M.b} class="marker" />
    {/if}
    <defs><clipPath id={clipId}><rect x={M.l} y={M.t - 4} width={width - M.l - M.r} height={height - M.t - M.b + 8} /></clipPath></defs>
    <g clip-path="url(#{clipId})">
    {#each series as s (s.name)}
      <path d={path(s.points)} fill="none" stroke={s.color} stroke-width="2" stroke-dasharray={s.dashed ? '5 4' : undefined} stroke-linejoin="round" />
      {#if s.markers}
        {#each s.points as p, i (i)}
          <circle cx={sx(p[0])} cy={sy(p[1])} r="2.5" fill={s.color} />
        {/each}
      {/if}
    {/each}
    </g>
    {#if readout}
      <line x1={sx(readout.x)} x2={sx(readout.x)} y1={M.t} y2={height - M.b} class="cross" />
      {#each readout.rows as r (r.s.name)}
        {#if r.p}
          <circle cx={sx(r.p[0])} cy={sy(r.p[1])} r="4" fill={r.s.color} stroke="#0f1e2b" stroke-width="2" />
        {/if}
      {/each}
    {/if}
  </svg>
  {#if readout}
    <div class="readout" style:left="{Math.min(sx(readout.x) + 10, width - 230)}px">
      <div class="rx">{xLabel}: {fx(readout.x)}</div>
      {#each readout.rows as r (r.s.name)}
        {#if r.p}
          <div><span class="sw" style:background={r.s.color}></span>{r.s.name}: {fy(r.p[1])}</div>
        {/if}
      {/each}
    </div>
  {/if}
  {#if series.length > 1 || marker !== null}
    <ul class="legend">
      {#each series as s (s.name)}
        <li><span class="sw" class:dashed={s.dashed} style:border-color={s.color} style:background={s.dashed ? 'transparent' : s.color}></span>{s.name}</li>
      {/each}
      {#if marker !== null}<li><span class="sw dotted"></span>step shown in the field view</li>{/if}
    </ul>
  {/if}
</div>

<style>
  .chart {
    position: relative;
    width: 100%;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .grid {
    stroke: var(--hair);
    stroke-width: 1;
  }
  .axis {
    stroke: var(--fg-2);
    stroke-width: 1;
  }
  .marker {
    stroke: var(--fg-2);
    stroke-dasharray: 2 3;
  }
  .cross {
    stroke: var(--fg-2);
  }
  .tick {
    fill: var(--fg-2);
    font: 11px var(--lp-mono);
  }
  .label {
    fill: var(--fg-2);
    font: 12px var(--lp-sans);
  }
  .readout {
    position: absolute;
    top: 8px;
    pointer-events: none;
    background: var(--lp-ink, #0c1620);
    border: 1px solid var(--hair);
    color: var(--fg);
    font: 12px/1.5 var(--lp-mono);
    padding: 0.35rem 0.55rem;
    border-radius: 3px;
    white-space: nowrap;
  }
  .rx {
    color: var(--fg-2);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    list-style: none;
    padding: 0;
    margin: 0.4rem 0 0 84px;
    font-size: 13px;
    color: var(--fg-2);
  }
  .sw {
    display: inline-block;
    width: 14px;
    height: 0;
    border-top: 2px solid;
    vertical-align: middle;
    margin-right: 0.4rem;
  }
  .readout .sw {
    height: 8px;
    width: 8px;
    border: 0;
    border-radius: 50%;
  }
  .sw.dotted {
    border-top: 2px dotted var(--fg-2);
  }
  .sw.dashed {
    border-top-style: dashed;
  }
</style>
