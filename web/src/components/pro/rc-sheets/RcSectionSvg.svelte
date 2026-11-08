<script lang="ts">
  import { i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import type { SectionDrawing } from '../../../lib/rc-sheets/drawing';

  let { drawing, title, notes = [] }: { drawing: SectionDrawing; title: string; notes?: string[] } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const BOX = 130, PAD = 26;
  const k = $derived(BOX / Math.max(drawing.b, drawing.h));
  const w = $derived(drawing.b * k), hh = $derived(drawing.h * k);
  const X = (x: number) => PAD + x * k;
  const Y = (y: number) => PAD + hh - y * k;
  const inset = $derived((drawing.cover + drawing.tieDia / 2000) * k);
</script>

<figure class="rcs-fig" data-testid="rc-section">
  <figcaption>{title}</figcaption>
  <svg viewBox="0 0 {w + 2 * PAD} {hh + 2 * PAD}" width={w + 2 * PAD} height={hh + 2 * PAD} role="img" aria-label={title}>
    <rect x={PAD} y={PAD} width={w} height={hh} class="conc" />
    <rect x={PAD + inset} y={PAD + inset} width={Math.max(0, w - 2 * inset)} height={Math.max(0, hh - 2 * inset)} rx="3" class="hoop" style="stroke-width: {Math.max(1, drawing.tieDia / 1000 * k)}px" />
    {#each drawing.ties as t, i (i)}
      <line x1={X(t.x1)} y1={Y(t.y1)} x2={X(t.x2)} y2={Y(t.y2)} class="tie" style="stroke-width: {Math.max(1, drawing.tieDia / 1000 * k)}px" />
    {/each}
    {#each drawing.bars as b, i (i)}
      <circle cx={X(b.x)} cy={Y(b.y)} r={Math.max(3, (b.dia / 2000) * k)} class="bar" />
    {/each}
    <text x={PAD + w / 2} y={PAD + hh + 16} class="dim">{fmt(drawing.b * 100, 0)}</text>
    <text x={PAD - 8} y={PAD + hh / 2} class="dim" transform="rotate(-90 {PAD - 8} {PAD + hh / 2})">{fmt(drawing.h * 100, 0)}</text>
  </svg>
  {#each notes as n, i (i)}<div class="note">{n}</div>{/each}
</figure>

<style>
  .rcs-fig { margin: 0; display: inline-flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 8px; border: 1px solid var(--st-hair); border-radius: 6px; background: var(--st-surface-2); }
  figcaption { font-size: 0.7rem; font-weight: 600; color: var(--st-text-2); }
  .conc { fill: var(--st-surface-3, rgba(128, 128, 128, 0.12)); stroke: var(--st-text-3); stroke-width: 1; }
  .hoop, .tie { fill: none; stroke: var(--st-text-2); }
  .bar { fill: var(--st-text); }
  .dim { font-size: 10px; fill: var(--st-text-3); text-anchor: middle; font-family: var(--st-mono); }
  .note { font-size: 0.68rem; font-family: var(--st-mono); color: var(--st-text-2); }
</style>
