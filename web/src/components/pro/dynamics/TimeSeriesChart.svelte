<script lang="ts">
  /**
   * One response component against time, with the instant on screen marked.
   *
   * One series at a time on purpose: ux, uy and uz share an axis only in unit, and the axis
   * colours they would naturally take — red and green — are the pair colour-blind readers cannot
   * tell apart. The component is chosen beside the chart instead.
   *
   * Hovering reads a value without moving anything; pressing or dragging sets the step, which is
   * what moves the model.
   */
  let {
    times, values, cursor, unitLabel, scale = 1, label,
    onscrub,
  }: {
    times: number[];
    values: number[];
    cursor: number;
    unitLabel: string;
    /** Multiplier from the values' unit to the displayed one (m → mm is 1000). */
    scale?: number;
    label: string;
    onscrub?: (index: number) => void;
  } = $props();

  const W = 320, H = 110, PAD_L = 38, PAD_R = 8, PAD_T = 8, PAD_B = 18;
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;

  const tMax = $derived(times.length > 1 ? times[times.length - 1]! : 1);
  const yMax = $derived.by(() => {
    let m = 0;
    for (const v of values) m = Math.max(m, Math.abs(v));
    return m > 0 ? m : 1;
  });
  const x = (t: number) => PAD_L + (t / tMax) * plotW;
  const y = (v: number) => PAD_T + plotH / 2 - (v / yMax) * (plotH / 2);

  const path = $derived.by(() => {
    // Decimated to about one point per horizontal pixel, keeping each bucket's extremes so a
    // peak between pixels is not smoothed away.
    const n = values.length;
    if (n === 0) return '';
    const buckets = Math.min(n, plotW * 2);
    const per = n / buckets;
    const pts: string[] = [];
    for (let b = 0; b < buckets; b++) {
      const i0 = Math.floor(b * per), i1 = Math.max(i0 + 1, Math.floor((b + 1) * per));
      let lo = i0, hi = i0;
      for (let i = i0; i < i1 && i < n; i++) {
        if (values[i]! < values[lo]!) lo = i;
        if (values[i]! > values[hi]!) hi = i;
      }
      for (const i of lo <= hi ? [lo, hi] : [hi, lo]) pts.push(`${x(times[i]!).toFixed(1)},${y(values[i]!).toFixed(1)}`);
    }
    return `M${pts.join('L')}`;
  });

  let hover = $state<number | null>(null);
  let dragging = false;

  function indexAt(e: PointerEvent): number {
    const svg = (e.currentTarget as SVGElement).closest('svg')!;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const t = Math.max(0, Math.min(tMax, ((px - PAD_L) / plotW) * tMax));
    // Times are uniform: index by ratio, then clamp.
    return Math.max(0, Math.min(times.length - 1, Math.round((t / tMax) * (times.length - 1))));
  }

  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
  const shown = $derived(hover ?? cursor);
</script>

<div class="tsc" data-testid="th-chart">
  <div class="tsc-readout">
    {label} — t = {(times[shown] ?? 0).toFixed(2)} s · {fmt((values[shown] ?? 0) * scale)} {unitLabel}
  </div>
  <svg
    viewBox="0 0 {W} {H}" role="img" aria-label="{label}, {unitLabel}"
    onpointermove={(e) => { const i = indexAt(e); hover = i; if (dragging) onscrub?.(i); }}
    onpointerleave={() => { hover = null; dragging = false; }}
    onpointerdown={(e) => { dragging = true; (e.currentTarget as Element).setPointerCapture(e.pointerId); onscrub?.(indexAt(e)); }}
    onpointerup={() => { dragging = false; }}
  >
    <line class="grid" x1={PAD_L} x2={W - PAD_R} y1={y(0)} y2={y(0)} />
    <text class="tick" x={PAD_L - 4} y={y(yMax) + 3} text-anchor="end">{fmt(yMax * scale)}</text>
    <text class="tick" x={PAD_L - 4} y={y(0) + 3} text-anchor="end">0</text>
    <text class="tick" x={PAD_L - 4} y={y(-yMax) + 3} text-anchor="end">{fmt(-yMax * scale)}</text>
    <text class="tick" x={PAD_L} y={H - 4}>0</text>
    <text class="tick" x={W - PAD_R} y={H - 4} text-anchor="end">{tMax.toFixed(2)} s</text>
    <path class="series" d={path} />
    {#if hover !== null}
      <line class="hover" x1={x(times[hover] ?? 0)} x2={x(times[hover] ?? 0)} y1={PAD_T} y2={PAD_T + plotH} />
    {/if}
    <line class="cursor" x1={x(times[cursor] ?? 0)} x2={x(times[cursor] ?? 0)} y1={PAD_T} y2={PAD_T + plotH} />
    <circle class="dot" cx={x(times[cursor] ?? 0)} cy={y(values[cursor] ?? 0)} r="3" />
  </svg>
</div>

<style>
  .tsc { display: flex; flex-direction: column; gap: 2px; }
  .tsc-readout { font-size: 0.66rem; color: var(--st-text-2); font-family: monospace; }
  svg { width: 100%; height: auto; touch-action: none; cursor: ew-resize; }
  .grid { stroke: var(--st-canvas-axis); stroke-width: 1; }
  .tick { font-size: 8px; fill: var(--st-text-3); font-family: monospace; }
  .series { fill: none; stroke: var(--st-value); stroke-width: 1.5; stroke-linejoin: round; }
  .hover { stroke: var(--st-hair-strong); stroke-width: 1; }
  .cursor { stroke: var(--st-text-2); stroke-width: 1; }
  .dot { fill: var(--st-value); stroke: var(--st-surface); stroke-width: 2; }
</style>
