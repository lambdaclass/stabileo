<script lang="ts">
  import { num } from '../shell/format';
  type Point = { n: number; ratio: number | null };
  let { points, title, xLabel, yLabel, selected = null }: { points: Point[]; title: string; xLabel: string; yLabel: string; selected?: number | null } = $props();
  const measured = (p: Point): p is { n: number; ratio: number } => Number.isFinite(p.ratio);
  const finite = $derived(points.filter(measured));
  const ymax = $derived(Math.max(1.1, ...finite.map(p => p.ratio * 1.1)));
  const ymin = $derived(Math.min(0, ...finite.map(p => p.ratio * 1.1)));
  const xmin = $derived(Math.min(...points.map(p => p.n)));
  const xmax = $derived(Math.max(...points.map(p => p.n)));
  const x = (n: number) => 50 + 300 * (n - xmin) / Math.max(1, xmax - xmin);
  const y = (ratio: number) => 180 - 150 * (ratio - ymin) / (ymax - ymin);
  const fmt = (v: number) => num(v, { sig: 3 });
  const ticks = $derived.by(() => {
    const out: number[] = [];
    for (const n of [...points.map(p => p.n)].sort((a, b) => a - b)) if (!out.length || x(n) - x(out.at(-1)!) >= 30) out.push(n);
    return out;
  });
  let width = $state(400);
  const font = $derived(Math.max(12, 12.5 * 400 / Math.max(width, 1)));
</script>

<figure>
  <figcaption>{title}</figcaption>
  <svg viewBox="0 0 400 230" bind:clientWidth={width} style:font-size="{font}px" role="img" aria-label={`${title}: ${xLabel}, ${yLabel}`}>
    <path d="M50 30V180H365" fill="none" stroke="currentColor" />
    <path d={`M50 ${y(1)}H365`} stroke="currentColor" stroke-dasharray="5 4" />
    <text x="44" y={y(1) + 4} text-anchor="end">1</text>
    <text x="44" y="184" text-anchor="end">{fmt(ymin)}</text>
    <text x="44" y="35" text-anchor="end">{fmt(ymax)}</text>
    <text x="50" y="18">{yLabel}</text>
    {#each points as point, i (point.n)}
      {@const previous = points[i - 1]}
      {#if measured(point)}
      {#if previous && measured(previous)}
        <line x1={x(previous.n)} y1={y(previous.ratio)} x2={x(point.n)} y2={y(point.ratio)} stroke="var(--rs-accent, #5ab7da)" stroke-width="2" />
      {/if}
      <circle cx={x(point.n)} cy={y(point.ratio)} r={point.n === selected ? 6 : 4} fill="var(--rs-accent, #5ab7da)" stroke={point.n === selected ? 'currentColor' : 'none'}><title>{point.n} × {point.n}: {fmt(point.ratio)}</title></circle>
      {/if}
    {/each}
    {#each ticks as n (n)}
      <text x={x(n)} y="200" text-anchor="middle">{n}</text>
    {/each}
    <text x="200" y="224" text-anchor="middle">{xLabel}</text>
  </svg>
</figure>

<style>
  figure { margin: 1rem 0; }
  figcaption { font-weight: 600; }
  svg { width: 100%; max-height: 16rem; overflow: visible; }
  text { fill: currentColor; font-family: sans-serif; }
</style>
