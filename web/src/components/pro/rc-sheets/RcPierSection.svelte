<script lang="ts">
  import { t, tp } from '../../../lib/i18n';
  import { pierSection } from '../../../lib/rc-sheets/pier-section';
  import type { WallRow } from '../../../lib/rc-sheets/wall-row';
  import type { SheetCode } from '../../../lib/rc-sheets/types';

  let { name, walls, code }: { name: string; walls: WallRow[]; code: SheetCode } = $props();
  const s = $derived(pierSection(walls, code));
  const MAX_W = 460, MAX_H = 340, PAD = 28;
  const box = $derived(s.bounds);
  const k = $derived(Math.min((MAX_W - 2 * PAD) / Math.max(box.x1 - box.x0, 0.1), (MAX_H - 2 * PAD) / Math.max(box.y1 - box.y0, 0.1)));
  const W = $derived((box.x1 - box.x0) * k + 2 * PAD), H = $derived((box.y1 - box.y0) * k + 2 * PAD);
  const X = (x: number) => PAD + (x - box.x0) * k, Y = (y: number) => PAD + (box.y1 - y) * k;
  const pts = (ps: ReadonlyArray<{ x: number; y: number }>) => ps.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ');
  const R = (dia: number) => Math.max(1.5, (dia / 2000) * k);
  const cm = (m: number) => Math.round(m * 100);
</script>

<figure class="rps" data-testid="rc-pier-section" data-scale={k}>
  <figcaption>{tp('rcSheets.pier.sectionTitle', { name })}</figcaption>
  <svg viewBox="0 0 {W} {H}" width={W} height={H} role="img" aria-label={tp('rcSheets.pier.sectionTitle', { name })}>
    {#each s.walls as w (w.key)}
      <polygon points={pts(w.outline)} class="conc" data-testid="rc-pier-section-wall" />
    {/each}
    {#each s.columns as c (c.key)}
      <polygon points={pts(c.outline)} class="col" data-testid="rc-pier-section-column" data-b={c.b} data-h={c.h} />
    {/each}
    {#each s.walls as w (w.key)}
      {#each w.bars as b, i (i)}<circle cx={X(b.x)} cy={Y(b.y)} r={R(b.dia)} class="bar" class:bnd={b.boundary} />{/each}
    {/each}
    {#each s.columns as c (c.key)}
      {#each c.bars as b, i (i)}<circle cx={X(b.x)} cy={Y(b.y)} r={R(b.dia)} class="bar bnd" />{/each}
    {/each}
    {#each s.walls as w (w.key)}
      <text x={X(w.mid.x)} y={Y(w.mid.y)} class="nm">{w.name}</text>
    {/each}
    {#each s.columns as c (c.key)}
      <text x={X((Math.min(...c.outline.map((p) => p.x)) + Math.max(...c.outline.map((p) => p.x))) / 2)} y={Y(Math.max(...c.outline.map((p) => p.y))) - 5} class="nm col-tag" data-testid="rc-pier-section-tag">{c.name} {cm(c.b)}×{cm(c.h)}</text>
    {/each}
  </svg>
  <ul class="rps-notes">
    {#each s.columns as c (c.key)}<li>{c.name} {cm(c.b)}×{cm(c.h)}: {c.label}</li>{/each}
    <li>{t('rcSheets.pier.sectionNote')}</li>
  </ul>
</figure>

<style>
  .rps { margin: 0; display: inline-flex; flex-direction: column; gap: 4px; padding: 6px 8px; border: 1px solid var(--st-hair); border-radius: 6px; background: var(--st-surface-2); max-width: 100%; }
  figcaption { font-size: 0.7rem; font-weight: 600; color: var(--st-text-2); }
  svg { max-width: 100%; height: auto; }
  .conc { fill: var(--st-surface-3, rgba(128, 128, 128, 0.12)); stroke: var(--st-text-3); stroke-width: 1; }
  .col { fill: rgba(91, 141, 239, 0.14); stroke: var(--st-text-2); stroke-width: 1; stroke-dasharray: 3 2; }
  .bar { fill: #4ecdc4; }
  .bar.bnd { fill: var(--st-text); }
  .nm { font-size: 10px; fill: var(--st-text-2); text-anchor: middle; dominant-baseline: middle; font-family: var(--st-mono); paint-order: stroke; stroke: var(--st-surface-2); stroke-width: 3px; }
  .col-tag { font-weight: 600; dominant-baseline: auto; }
  .rps-notes { margin: 0; padding-left: 14px; font-size: 0.66rem; color: var(--st-text-2); max-width: 64ch; }
</style>
