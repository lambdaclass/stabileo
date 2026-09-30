<script lang="ts">
  /**
   * One quantity against another, as a line: a result read along a line, a curve. Gaps (null
   * values) break the line. Hovering reads a point. Axes carry their extremes and zero when it is
   * in range; the values are the caller's, in the units it names.
   */
  let { xs, ys, xLabel, yLabel, testid = 'xy-chart' }: {
    xs: readonly number[]; ys: ReadonlyArray<number | null>; xLabel: string; yLabel: string; testid?: string;
  } = $props();

  const W = 320, H = 140, PL = 44, PR = 10, PT = 10, PB = 24;
  const pw = W - PL - PR, ph = H - PT - PB;
  const xMin = $derived(xs.length ? Math.min(...xs) : 0);
  const xMax = $derived(xs.length ? Math.max(...xs) : 1);
  const finite = $derived(ys.filter((v): v is number => v !== null && Number.isFinite(v)));
  const yMin = $derived(finite.length ? Math.min(0, ...finite) : 0);
  const yMax = $derived(finite.length ? Math.max(0, ...finite) : 1);
  const sx = (x: number) => PL + ((x - xMin) / (xMax - xMin || 1)) * pw;
  const sy = (y: number) => PT + ph - ((y - yMin) / (yMax - yMin || 1)) * ph;
  const path = $derived.by(() => {
    let d = '', pen = false;
    ys.forEach((y, i) => {
      if (y === null || !Number.isFinite(y)) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${sx(xs[i]!).toFixed(1)},${sy(y).toFixed(1)}`;
      pen = true;
    });
    return d;
  });
  let hover = $state<number | null>(null);
  function at(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = xMin + (((e.clientX - r.left) / r.width) * W - PL) / pw * (xMax - xMin);
    let k = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i]! - x) < Math.abs(xs[k]! - x)) k = i;
    hover = k;
  }
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
</script>

<div class="xy" data-testid={testid}>
  <div class="xy-readout">
    {#if hover !== null && ys[hover] !== null}{xLabel} = {fmt(xs[hover]!)} · {yLabel} = {fmt(ys[hover] as number)}{:else}{yLabel}{/if}
  </div>
  <svg viewBox="0 0 {W} {H}" role="img" aria-label="{yLabel} / {xLabel}" onpointermove={at} onpointerleave={() => (hover = null)}>
    <line class="xy-axis" x1={PL} y1={PT} x2={PL} y2={PT + ph} />
    {#if yMin < 0 && yMax > 0}<line class="xy-zero" x1={PL} y1={sy(0)} x2={PL + pw} y2={sy(0)} />{/if}
    <line class="xy-axis" x1={PL} y1={PT + ph} x2={PL + pw} y2={PT + ph} />
    <text class="xy-tick" x={PL - 4} y={PT + 4} text-anchor="end">{fmt(yMax)}</text>
    <text class="xy-tick" x={PL - 4} y={PT + ph} text-anchor="end">{fmt(yMin)}</text>
    <text class="xy-tick" x={PL} y={H - 8}>{fmt(xMin)}</text>
    <text class="xy-tick" x={PL + pw} y={H - 8} text-anchor="end">{fmt(xMax)} · {xLabel}</text>
    <path class="xy-line" d={path} />
    {#if hover !== null && ys[hover] !== null}<circle class="xy-dot" cx={sx(xs[hover]!)} cy={sy(ys[hover] as number)} r="4" />{/if}
  </svg>
</div>

<style>
  .xy { display: flex; flex-direction: column; gap: 2px; font-size: 0.62rem; color: var(--st-text-2); }
  .xy-readout { font-variant-numeric: tabular-nums; min-height: 1.2em; }
  svg { width: 100%; max-width: 420px; height: auto; }
  .xy-axis { stroke: var(--st-surface-3); stroke-width: 1; }
  .xy-zero { stroke: var(--st-surface-3); stroke-dasharray: 3 3; }
  .xy-tick { fill: var(--st-text-3); font-size: 8px; }
  .xy-line { fill: none; stroke: var(--st-value); stroke-width: 2; stroke-linejoin: round; }
  .xy-dot { fill: var(--st-value); stroke: var(--st-surface); stroke-width: 2; }
</style>
