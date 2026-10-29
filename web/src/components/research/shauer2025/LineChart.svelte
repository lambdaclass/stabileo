<script lang="ts">
  /**
   * Lines on one shared y axis. Reference series are drawn first as a wide translucent underlay and
   * ours on top as a thin line, so agreement reads as a line inside a halo. Series are labelled on
   * the plot (`labels`), not in a legend box. A crosshair tooltip reads every series at the nearest x.
   */
  import type { Series } from './protocol';
  import { num, tickDecimals } from '../shell/format';

  type Label = { x: number; y: number; text: string; anchor?: 'start' | 'middle' | 'end'; dy?: number };
  let {
    series,
    xLabel,
    yLabel,
    height = 260,
    marker = null,
    markerLabel = '',
    labels = [],
    log = false,
    rules = [],
  }: {
    series: Series[];
    xLabel: string;
    yLabel: string;
    height?: number;
    /** An x to mark with a vertical rule (the step shown in the viewer). */
    marker?: number | null;
    markerLabel?: string;
    labels?: Label[];
    /** A log10 y axis (for differences spanning orders of magnitude). */
    log?: boolean;
    /** Horizontal reference rules (tolerances), drawn dashed with their label. */
    rules?: { y: number; text: string }[];
  } = $props();

  let width = $state(600);
  let hoverX = $state<number | null>(null);
  const M = { l: 48, r: 28, t: 22, b: 36 };

  function niceTicks(lo: number, hi: number, n = 5): { ticks: number[]; step: number } {
    if (!(hi > lo)) return { ticks: [lo, lo + 1], step: 1 };
    const raw = (hi - lo) / n;
    const p = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw) ?? raw;
    const first = Math.floor(lo / step + 1e-9) * step;
    const last = Math.ceil(hi / step - 1e-9) * step;
    const out: number[] = [];
    for (let v = first; v <= last + step * 1e-6; v += step) out.push(Number(v.toPrecision(12)));
    return { ticks: out, step };
  }

  const ty = (v: number) => (log ? Math.log10(Math.max(v, 1e-300)) : v);
  const all = $derived(series.flatMap((s) => s.points).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && (!log || p[1] > 0)));
  const xt = $derived(niceTicks(0, Math.max(1e-12, ...all.map((p) => p[0]))));
  const yVals = $derived([...all.map((p) => ty(p[1])), ...rules.map((r) => ty(r.y))]);
  const yLo = $derived(log ? Math.floor(Math.min(...yVals)) : Math.min(0, ...yVals));
  const yHi = $derived(log ? Math.ceil(Math.max(...yVals)) : Math.max(1e-12, ...yVals));
  /* Plain numbers on the ticks; a common power of ten goes into the axis title. */
  const yExp = $derived(log ? 0 : (() => { const m = Math.max(Math.abs(yLo), Math.abs(yHi)); return m > 0 && (m < 1e-2 || m >= 1e4) ? Math.floor(Math.log10(m)) : 0; })());
  const yt = $derived(log ? { ticks: Array.from({ length: yHi - yLo + 1 }, (_, i) => yLo + i).filter((_, i, a) => a.length <= 6 || i % 2 === 0), step: 1 } : niceTicks(yLo / 10 ** yExp, (yHi + 0.04 * (yHi - yLo)) / 10 ** yExp));
  const x0 = $derived(xt.ticks[0]);
  const x1 = $derived(xt.ticks[xt.ticks.length - 1]);
  const y0 = $derived(log ? yt.ticks[0] : yt.ticks[0] * 10 ** yExp);
  const y1 = $derived(log ? Math.max(yHi, yt.ticks[yt.ticks.length - 1]) : yt.ticks[yt.ticks.length - 1] * 10 ** yExp);
  const sx = (x: number) => M.l + ((x - x0) / (x1 - x0 || 1)) * (width - M.l - M.r);
  const sy = (y: number) => M.t + (1 - (ty(y) - y0) / (y1 - y0 || 1)) * (height - M.t - M.b);
  const syRaw = (v: number) => M.t + (1 - (v - y0) / (y1 - y0 || 1)) * (height - M.t - M.b);
  const clipId = `clip-${Math.random().toString(36).slice(2)}`;

  function path(points: [number, number][]) {
    return points
      .filter((p) => !log || p[1] > 0)
      .map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`)
      .join('');
  }
  const ordered = $derived([...series].sort((a, b) => Number(!!b.dashed) - Number(!!a.dashed)));

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
  const atMarker = $derived(
    marker === null ? [] : series.filter((s) => !s.dashed).map((s) => ({ s, p: s.points.reduce<[number, number] | null>((b, p) => (!b || Math.abs(p[0] - marker!) < Math.abs(b[0] - marker!) ? p : b), null) })),
  );

  function onMove(e: PointerEvent) {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    hoverX = px < M.l || px > width - M.r ? null : x0 + ((px - M.l) / (width - M.l - M.r)) * (x1 - x0);
  }
  const fmtX = (v: number) => num(v, { dp: tickDecimals(xt.step) });
  const fmtY = (t: number) => (log ? '' : num(t, { dp: tickDecimals(yt.step) }));
  const fmtVal = (v: number) => num(v, { sig: 4 });
</script>

<div class="chart" bind:clientWidth={width}>
  <svg {width} {height} role="img" aria-label="{yLabel} against {xLabel}" onpointermove={onMove} onpointerleave={() => (hoverX = null)}>
    <text x={M.l - 6} y={11} class="label" text-anchor="start">{yLabel}{#if yExp}&#8201;(×10<tspan baseline-shift="super" font-size="75%">{num(yExp, {})}</tspan>){/if}</text>
    {#each yt.ticks as t (t)}
      {@const yy = log ? syRaw(t) : sy(t * 10 ** yExp)}
      <line x1={M.l} x2={width - M.r} y1={yy} y2={yy} class="grid" />
      {#if log}
        <text x={M.l - 6} y={yy} class="tick" text-anchor="end" dominant-baseline="middle">10<tspan baseline-shift="super" font-size="75%">{num(t, {})}</tspan></text>
      {:else}
        <text x={M.l - 6} y={yy} class="tick" text-anchor="end" dominant-baseline="middle">{fmtY(t)}</text>
      {/if}
    {/each}
    {#each xt.ticks as t, i (t)}
      <text x={sx(t)} y={height - M.b + 15} class="tick" text-anchor={i === xt.ticks.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'}>{fmtX(t)}</text>
    {/each}
    {#if !log}<line x1={M.l} x2={width - M.r} y1={sy(0)} y2={sy(0)} class="axis" />{/if}
    <text x={width - M.r} y={height - 3} class="label" text-anchor="end">{xLabel}</text>
    {#each rules as r (r.text)}
      <line x1={M.l} x2={width - M.r} y1={sy(r.y)} y2={sy(r.y)} class="rule" />
      <text x={width - M.r} y={sy(r.y) - 4} class="tick" text-anchor="end">{r.text}</text>
    {/each}
    <defs><clipPath id={clipId}><rect x={M.l} y={M.t - 6} width={width - M.l - M.r} height={height - M.t - M.b + 12} /></clipPath></defs>
    <g clip-path="url(#{clipId})">
      {#each ordered as s (s.name)}
        {#if s.dashed}
          <path d={path(s.points)} fill="none" style:stroke={s.color} stroke-width="6" stroke-opacity="0.35" stroke-linecap="round" stroke-linejoin="round" />
        {:else}
          <path d={path(s.points)} fill="none" style:stroke={s.color} stroke-width="1.75" stroke-linejoin="round" />
        {/if}
      {/each}
      {#if marker !== null}
        <line x1={sx(marker)} x2={sx(marker)} y1={M.t} y2={height - M.b} class="marker" />
        {#each atMarker as m (m.s.name)}
          {#if m.p}<circle cx={sx(m.p[0])} cy={sy(m.p[1])} r="4" style:fill={m.s.color} stroke="var(--st-surface, #0f1e2b)" stroke-width="2" />{/if}
        {/each}
      {/if}
      {#if readout}
        <line x1={sx(readout.x)} x2={sx(readout.x)} y1={M.t} y2={height - M.b} class="cross" />
      {/if}
    </g>
    {#if marker !== null && markerLabel}
      <text x={sx(marker)} y={M.t - 6} class="tick" text-anchor="middle">{markerLabel}</text>
    {/if}
    {#each labels as l (l.text)}
      <text x={sx(l.x)} y={sy(l.y) + (l.dy ?? -8)} class="dlabel" text-anchor={l.anchor ?? 'start'}>{l.text}</text>
    {/each}
  </svg>
  {#if readout}
    <div class="readout" style:left="{Math.min(sx(readout.x) + 10, width - 230)}px">
      <div class="rx">{xLabel}: {fmtVal(readout.x)}</div>
      {#each readout.rows as r (r.s.name)}
        {#if r.p}<div><span class="sw" style:background={r.s.color}></span>{r.s.name}: {fmtVal(r.p[1])}</div>{/if}
      {/each}
    </div>
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
    stroke: var(--rs-plot-grid);
    stroke-width: 1;
  }
  .axis {
    stroke: var(--rs-plot-axis);
    stroke-width: 1;
  }
  .rule {
    stroke: var(--st-warn);
    stroke-dasharray: 4 3;
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
    font: var(--rs-micro) var(--st-sans);
    font-variant-numeric: tabular-nums;
  }
  .label {
    fill: var(--fg-2);
    font: var(--rs-micro) var(--st-sans);
  }
  .dlabel {
    fill: var(--fg);
    font: var(--rs-micro) var(--st-sans);
  }
  .readout {
    position: absolute;
    top: 8px;
    pointer-events: none;
    background: var(--lp-ink, #0c1620);
    border: 1px solid var(--hair);
    color: var(--fg);
    font: var(--rs-micro) / 1.5 var(--st-sans);
    font-variant-numeric: tabular-nums;
    padding: 0.35rem 0.55rem;
    border-radius: 3px;
    white-space: nowrap;
  }
  .rx {
    color: var(--fg-2);
  }
  .sw {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 0.4rem;
  }
</style>
