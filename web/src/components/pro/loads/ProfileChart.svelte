<script lang="ts">
  /** A pressure against height, drawn: height up, pressure to the right, the points marked. */
  interface Props { points: ReadonlyArray<readonly [number, number]>; unit?: string }
  let { points, unit = 'kPa' }: Props = $props();
  const W = 220, H = 140, P = 22;
  const view = $derived.by(() => {
    const zs = points.map(([z]) => z), ps = points.map(([, p]) => p);
    const zMax = Math.max(...zs, 1e-6), pMax = Math.max(...ps.map(Math.abs), 1e-6);
    const x = (p: number) => P + (W - 2 * P) * Math.max(p, 0) / pMax, y = (z: number) => H - P - (H - 2 * P) * z / zMax;
    return { path: points.map(([z, p], i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(z).toFixed(1)}`).join(' '), dots: points.map(([z, p]) => [x(p), y(z)] as const), zMax, pMax };
  });
</script>

<svg viewBox="0 0 {W} {H}" class="pc" role="img" aria-label="p(z)" data-testid="profile-chart">
  <line x1={P} y1={H - P} x2={W - P} y2={H - P} class="pc-axis" />
  <line x1={P} y1={P} x2={P} y2={H - P} class="pc-axis" />
  <path d={view.path} class="pc-line" />
  {#each view.dots as [cx, cy], i (i)}<circle {cx} {cy} r="2.5" class="pc-dot" />{/each}
  <text x={W - P} y={H - 6} class="pc-t" text-anchor="end">{view.pMax.toFixed(2)} {unit}</text>
  <text x={4} y={P - 6} class="pc-t">{view.zMax.toFixed(1)} m</text>
</svg>

<style>
  .pc { width: 100%; max-width: 240px; background: var(--st-surface-3); border-radius: var(--st-radius); }
  .pc-axis { stroke: var(--st-hair-strong); stroke-width: 1; }
  .pc-line { fill: none; stroke: var(--st-accent); stroke-width: 1.5; }
  .pc-dot { fill: var(--st-accent); }
  .pc-t { font-size: 9px; fill: var(--st-text-3); font-family: var(--st-mono); }
</style>
