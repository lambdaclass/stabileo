<script lang="ts">
  /** A stair's section along its run: the landings, steps and waist, every position of its bars with its mark, and the distribution bars as dots. */
  import { t } from '../../../lib/i18n';
  import type { StairRow } from '../../../lib/rc-sheets/stair-row';

  let { row }: { row: StairRow } = $props();
  const W = 560, PAD = 28;
  const box = $derived.by(() => {
    const ps = [...row.section.outline, ...row.bars.flatMap((b) => (b.rows ? [] : b.shape.pts))];
    const x0 = Math.min(...ps.map((p) => p[0])), x1 = Math.max(...ps.map((p) => p[0])), z0 = Math.min(...ps.map((p) => p[1])), z1 = Math.max(...ps.map((p) => p[1]));
    const k = (W - 2 * PAD) / Math.max(x1 - x0, 1e-6);
    return { x0, z1, k, h: (z1 - z0) * k + 2 * PAD };
  });
  const X = (s: number) => PAD + (s - box.x0) * box.k, Z = (z: number) => PAD + (box.z1 - z) * box.k;
  const line = (pts: ReadonlyArray<[number, number]>) => pts.map(([s, z]) => `${X(s).toFixed(1)},${Z(z).toFixed(1)}`).join(' ');
  const along = $derived(row.bars.filter((b) => !b.rows));
  const across = $derived(row.bars.filter((b) => b.rows));
  const label = (b: StairRow['bars'][number]) => `${b.mark} Ø${b.dia} c/${Math.round(b.spacing * 1000) / 10}`;
  const mid = (pts: ReadonlyArray<[number, number]>) => pts[Math.floor((pts.length - 1) / 2)]!;
</script>

<figure class="rss" data-testid="rc-stair-figure">
  <figcaption>{row.name} · {t('rcSheets.stair.section')}</figcaption>
  <svg viewBox="0 0 {W} {box.h}" width={W} height={box.h} role="img" aria-label={t('rcSheets.stair.section')}>
    <polygon points={line(row.section.outline)} class="conc" />
    {#each along as b (b.mark)}
      <polyline points={line(b.shape.pts)} class="bar {b.role}" data-testid="rc-stair-bar" data-role={b.role} />
      {@const m = mid(b.shape.pts)}
      <text x={X(m[0]) + 4} y={Z(m[1]) - 4} class="mk">{label(b)}</text>
    {/each}
    {#each across as b (b.mark)}
      {#each b.rows ?? [] as p, i (i)}<circle cx={X(p[0])} cy={Z(p[1])} r="1.8" class="dot" data-testid="rc-stair-dist" />{/each}
    {/each}
  </svg>
</figure>

<style>
  .rss { margin: 0; max-width: 100%; overflow-x: auto; }
  figcaption { font-size: 0.72rem; font-weight: 600; color: var(--st-text-2); margin-bottom: 4px; }
  .conc { fill: var(--st-surface-2); stroke: var(--st-text-3); stroke-width: 1; }
  .bar { fill: none; stroke: var(--st-accent); stroke-width: 1.6; }
  .bar.landing { stroke: var(--st-warn); }
  .bar.topFoot, .bar.topFootFlight, .bar.topHead { stroke: var(--st-ok); stroke-dasharray: 5 2; }
  .dot { fill: var(--st-text-2); }
  .mk { font-size: 9px; fill: var(--st-text-2); }
</style>
