<script lang="ts">
  /**
   * A chart of a step-by-step document (engine/steps/plot): curves on one pair
   * of axes with ticks, a zero line, reference lines and marked points. The
   * colours are the sketches', so a mode or a load reads the same in both.
   */
  import { tp } from '../../lib/i18n';
  import { isTxt } from '../../lib/engine/steps/doc';
  import { numText } from '../../lib/engine/steps/format';
  import type { Plot } from '../../lib/engine/steps/plot';

  let { plot }: { plot: Plot } = $props();

  const W = 320;
  const H = $derived(plot.height ?? 170);
  const L = 46, R = 10, T = 22, B = 30;

  function ticks(lo: number, hi: number, n = 5): number[] {
    if (!(hi > lo)) return [lo];
    const raw = (hi - lo) / n;
    const p = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw) ?? raw;
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  }

  const box = $derived.by(() => {
    const pts = plot.series.flatMap((s) => s.points);
    let x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0]));
    let y0 = Math.min(0, ...pts.map((p) => p[1])), y1 = Math.max(0, ...pts.map((p) => p[1]));
    if (plot.yRange) { y0 = Math.max(y0, plot.yRange[0]); y1 = Math.min(y1, plot.yRange[1]); }
    if (!Number.isFinite(x0) || x1 <= x0) { x0 = 0; x1 = 1; }
    if (!Number.isFinite(y0) || y1 <= y0) { y0 = -1; y1 = 1; }
    const pad = (y1 - y0) * 0.06;
    return { x0, x1, y0: y0 < 0 ? y0 - pad : y0, y1: y1 + pad };
  });
  const sx = (x: number) => L + ((x - box.x0) / (box.x1 - box.x0)) * (W - L - R);
  const sy = (y: number) => {
    const c = Math.max(box.y0, Math.min(box.y1, y));
    return T + (1 - (c - box.y0) / (box.y1 - box.y0)) * (H - T - B);
  };
  const path = (pts: Array<[number, number]>) => pts.map(([x, y], k) => `${k ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ');
  const xt = $derived(ticks(box.x0, box.x1));
  const yt = $derived(ticks(box.y0, box.y1, 4));
  const label = (l: string | { key: string; params?: Record<string, string | number> }) => (isTxt(l) ? tp(l.key, l.params) : l);
</script>

<svg class="sp" viewBox="0 0 {W} {H}" role="img" data-testid="step-plot">
  {#each yt as v}
    <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} class="grid" class:zero={v === 0} />
    <text x={L - 4} y={sy(v) + 3} class="tick" text-anchor="end">{numText(v, 3)}</text>
  {/each}
  {#each xt as v}
    <line x1={sx(v)} x2={sx(v)} y1={H - B} y2={H - B + 3} class="axis" />
    <text x={sx(v)} y={H - B + 13} class="tick" text-anchor="middle">{numText(v, 3)}</text>
  {/each}
  <line x1={L} x2={L} y1={T} y2={H - B} class="axis" />
  <line x1={L} x2={W - R} y1={H - B} y2={H - B} class="axis" />
  <text x={W - R} y={H - 3} class="alabel" text-anchor="end">{plot.xLabel}</text>
  <text x={4} y={T - 8} class="alabel">{plot.yLabel}</text>
  {#each plot.vlines ?? [] as v}
    <line x1={sx(v.x)} x2={sx(v.x)} y1={T} y2={H - B} class="vline" />
    {#if v.label}<text x={sx(v.x) + 3} y={T + 9} class="tick">{v.label}</text>{/if}
  {/each}
  {#each plot.series as s}
    <path d={path(s.points)} class="curve c-{s.color ?? 'accent'}" class:dashed={s.dashed} />
  {/each}
  {#each plot.marks ?? [] as m}
    <circle cx={sx(m.x)} cy={sy(m.y)} r="3" class="mark" />
    {#if m.label}<text x={sx(m.x) + 5} y={sy(m.y) - 5} class="tick strong">{m.label}</text>{/if}
  {/each}
  {#if plot.series.some((s) => s.label)}
    {@const named = plot.series.filter((s) => s.label)}
    {#each named as s, i}
      <g transform="translate({L + 8 + (i % 3) * 88}, {T - 14 + Math.floor(i / 3) * 10})">
        <line x1="0" x2="12" y1="0" y2="0" class="curve c-{s.color ?? 'accent'}" class:dashed={s.dashed} />
        <text x="15" y="3" class="tick">{label(s.label!)}</text>
      </g>
    {/each}
  {/if}
</svg>

<style>
  .sp {
    width: 100%; height: auto; display: block;
    --p-accent: var(--st-accent); --p-muted: var(--st-text-3); --p-load: #4f8ef7; --p-reaction: #2fb36b;
    --p-moment: #e5484d; --p-deformed: #f59e0b; --p-diagram: #b36bd6; --p-dof: #14b8a6;
  }
  .grid { stroke: var(--st-hair); stroke-width: 0.6; }
  .grid.zero { stroke: var(--st-hair-strong); stroke-width: 0.9; }
  .axis { stroke: var(--st-text-3); stroke-width: 0.8; }
  .vline { stroke: var(--st-text-3); stroke-width: 0.7; stroke-dasharray: 3 3; }
  .tick { font-size: 8px; fill: var(--st-text-3); font-variant-numeric: tabular-nums; }
  .tick.strong { fill: var(--st-text); }
  .alabel { font-size: 8.5px; fill: var(--st-text-2); }
  .curve { fill: none; stroke-width: 1.4; stroke-linejoin: round; }
  .curve.dashed { stroke-dasharray: 4 3; stroke-width: 1.1; }
  .mark { fill: var(--st-accent); stroke: var(--st-surface, #fff); stroke-width: 1; }
  .c-accent { stroke: var(--p-accent); }
  .c-muted { stroke: var(--p-muted); }
  .c-load { stroke: var(--p-load); }
  .c-reaction { stroke: var(--p-reaction); }
  .c-moment { stroke: var(--p-moment); }
  .c-deformed { stroke: var(--p-deformed); }
  .c-diagram { stroke: var(--p-diagram); }
  .c-dof { stroke: var(--p-dof); }
</style>
