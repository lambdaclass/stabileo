<script lang="ts">
  import { researchLocale } from '../i18n';
  let { title, xLabel, yLabel, series }: { title: string; xLabel: string; yLabel: string; series: { label: string; color: string; points: [number, number][] }[] } = $props();
  const xmax = $derived(Math.max(1e-12, ...series.flatMap(s => s.points.map(p => p[0]))) * 1.05);
  const ymax = $derived(Math.max(1e-12, ...series.flatMap(s => s.points.map(p => p[1]))) * 1.05);
  const x = (v: number) => 65 + 385 * v / xmax;
  const y = (v: number) => 150 - 125 * v / ymax;
  const nf = (v: number) => new Intl.NumberFormat(researchLocale(), { maximumSignificantDigits: 3 }).format(v);
</script>
<figure>
  <figcaption>{title}</figcaption>
  <svg viewBox="0 0 480 205" role="img" aria-label={title}>
    <path d="M65,20 V150 H455" fill="none" stroke="currentColor" />
    {#each series as s, i}<polyline points={s.points.map(p => `${x(p[0])},${y(p[1])}`).join(' ')} fill="none" stroke={s.color} stroke-width="2" stroke-dasharray={i ? '5 3' : undefined} />{/each}
    {#each [0, 0.5, 1] as f}
      <text x={x(f * xmax)} y="170" text-anchor="middle">{nf(f * xmax)}</text>
      <text x="60" y={y(f * ymax) + 4} text-anchor="end">{nf(f * ymax)}</text>
    {/each}
    <text x="65" y="14">{yLabel}</text><text x="260" y="195" text-anchor="middle">{xLabel}</text>
  </svg>
  <div>{#each series as s}<span style:color={s.color}>{s.label}</span>{/each}</div>
</figure>
<style>
  figure { margin: 1rem 0; } svg { width: 100%; display: block; } text { fill: currentColor; font-size: 13px; }
  figcaption { font-weight: 600; } div { display: flex; flex-wrap: wrap; gap: 1rem; font-size: .8rem; }
</style>
