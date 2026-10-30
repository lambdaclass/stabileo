<script lang="ts">
  import type { Case, Result } from './cases';
  let { cases, rows, title, xLabel, yLabel, locale }: { cases: Case[]; rows: Result[]; title: string; xLabel: string; yLabel: string; locale: string } = $props();
  const points = $derived(cases.map(c => ({ n: c.mesh, ratio: rows.find(r => r.id === c.id)?.value == null ? null : rows.find(r => r.id === c.id)!.value! / c.reference })));
  const ymax = $derived(Math.max(1.1, ...points.map(p => (p.ratio ?? 0) * 1.1)));
  const xmin = $derived(Math.min(...cases.map(c => c.mesh)));
  const xmax = $derived(Math.max(...cases.map(c => c.mesh)));
  const x = (n: number) => 50 + 300 * (n - xmin) / Math.max(1, xmax - xmin);
  const y = (ratio: number) => 180 - 140 * ratio / ymax;
  const fmt = (v: number) => new Intl.NumberFormat(locale, { maximumSignificantDigits: 3 }).format(v);
</script>

<figure>
  <figcaption>{title}</figcaption>
  <svg viewBox="0 0 400 230" role="img" aria-label={`${title}: ${xLabel}, ${yLabel}`}>
    <path d="M50 30V180H365" fill="none" stroke="currentColor" />
    <path d={`M50 ${y(1)}H365`} stroke="currentColor" stroke-dasharray="5 4" />
    <text x="40" y={y(1) + 4} text-anchor="end">1</text>
    <text x="40" y="184" text-anchor="end">0</text>
    <text x="40" y="35" text-anchor="end">{fmt(ymax)}</text>
    <text x="50" y="18">{yLabel}</text>
    {#each points as point, i}
      {#if point.ratio !== null}
        {#if i > 0 && points[i - 1].ratio !== null}
          <line x1={x(points[i - 1].n)} y1={y(points[i - 1].ratio!)} x2={x(point.n)} y2={y(point.ratio)} stroke="var(--rs-accent, #5ab7da)" stroke-width="2" />
        {/if}
        <circle cx={x(point.n)} cy={y(point.ratio)} r="4" fill="var(--rs-accent, #5ab7da)"><title>{point.n} × {point.n}: {fmt(point.ratio)}</title></circle>
      {/if}
      <text x={x(point.n)} y="200" text-anchor="middle">{point.n}</text>
    {/each}
    <text x="200" y="222" text-anchor="middle">{xLabel}</text>
  </svg>
</figure>

<style>
  figure { margin: 1rem 0; }
  figcaption { font-weight: 600; }
  svg { width: 100%; max-height: 16rem; }
  text { fill: currentColor; font: 11px sans-serif; }
</style>
