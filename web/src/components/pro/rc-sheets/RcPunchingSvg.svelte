<script lang="ts">
  /**
   * A punching joint in plan: the column, the slab around it with its free edges, the code's
   * control perimeter (straight at d/2, or rounded at 2d in EN 1992-1-1) cut at the free edges,
   * and the lines of stirrups when the concrete alone does not carry the shear.
   */
  import { t, tp, i18n, tpn } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import type { PunchingFigure } from '../../../lib/rc-sheets/punching-row';
  import { ringPath } from '../../../lib/rc-sheets/view-helpers';
  import { freeSides } from '../../../lib/rc-sheets/punching-bars';

  let { fig, name }: { fig: PunchingFigure; name: string } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));

  const free = $derived(freeSides(fig));

  const SIZE = 250, PAD = 34;
  const bx = $derived(fig.b / 2), by = $derived(fig.h / 2);
  const reach = $derived(fig.offset + (fig.reinforcement ? Math.max(0, fig.reinforcement.extent - fig.offset) : 0));
  const margin = $derived(Math.max(0.25, 0.6 * reach));
  // The slab drawn: out to the perimeter and a margin, stopped at the column face on a free side.
  const box = $derived({
    x0: free.has('nx') ? -bx : -(bx + reach + margin), x1: free.has('px') ? bx : bx + reach + margin,
    y0: free.has('ny') ? -by : -(by + reach + margin), y1: free.has('py') ? by : by + reach + margin,
  });
  const k = $derived((SIZE - 2 * PAD) / Math.max(box.x1 - box.x0, box.y1 - box.y0));
  const X = (x: number) => PAD + (x - box.x0) * k;
  const Y = (y: number) => PAD + (box.y1 - y) * k;
  const W = $derived(2 * PAD + (box.x1 - box.x0) * k), H = $derived(2 * PAD + (box.y1 - box.y0) * k);

  const ring = (off: number, rounded: boolean): string => ringPath({ bx, by, off, rounded, free, X, Y, k });
  const lines = $derived(fig.reinforcement ? Array.from({ length: fig.reinforcement.lines }, (_, i) => fig.reinforcement!.spacing / 2 + i * fig.reinforcement!.spacing) : []);
  const cm = (m: number) => fmt(m * 100, 0);
  const offLabel = $derived(fig.rounded ? `2d = ${cm(fig.offset)} cm` : `d/2 = ${cm(fig.offset)} cm`);
  const ties = (n: number, half: number) => Array.from({ length: n }, (_, i) => (n === 1 ? 0 : -half / 2 + (i * half) / (n - 1)));
  const integrityX = $derived(fig.integrity ? ties(fig.integrity.bars, by) : []);
  const integrityY = $derived(fig.integrity ? ties(fig.integrity.bars, bx) : []);
  const edges = $derived([...free].map((s) => s === 'px' ? { x1: X(bx), y1: Y(box.y0), x2: X(bx), y2: Y(box.y1) } : s === 'nx' ? { x1: X(-bx), y1: Y(box.y0), x2: X(-bx), y2: Y(box.y1) } : s === 'py' ? { x1: X(box.x0), y1: Y(by), x2: X(box.x1), y2: Y(by) } : { x1: X(box.x0), y1: Y(-by), x2: X(box.x1), y2: Y(-by) }));
</script>

<figure class="rpu-fig" data-testid="rc-punching-figure" data-position={fig.position}>
  <figcaption>{tp('rcSheets.punchFig.title', { name })}</figcaption>
  <svg viewBox="0 0 {W} {H}" width={W} height={H} role="img" aria-label={tp('rcSheets.punchFig.title', { name })}>
    <rect x={X(box.x0)} y={Y(box.y1)} width={(box.x1 - box.x0) * k} height={(box.y1 - box.y0) * k} class="slab" />
    {#each edges as e, i (i)}<line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} class="edge" data-testid="rc-punching-edge" />{/each}
    {#each lines as off, i (i)}<path d={ring(off, false)} class="studs" data-testid="rc-punching-line" />{/each}
    <path d={ring(fig.offset, fig.rounded)} class="perim" data-testid="rc-punching-perimeter" />
    <rect x={X(-bx)} y={Y(by)} width={fig.b * k} height={fig.h * k} class="col" />
    {#each integrityX as y, i (i)}<line x1={X(box.x0)} y1={Y(y)} x2={X(box.x1)} y2={Y(y)} class="integ" data-testid="rc-punching-integrity" />{/each}
    {#each integrityY as x, i (i)}<line x1={X(x)} y1={Y(box.y0)} x2={X(x)} y2={Y(box.y1)} class="integ" data-testid="rc-punching-integrity" />{/each}
    <text x={X(0)} y={Y(0) + 3} class="lbl">{cm(fig.b)}×{cm(fig.h)}</text>
    {#if !free.has('px')}
      <line x1={X(bx)} y1={Y(0)} x2={X(bx + fig.offset)} y2={Y(0)} class="dim" />
      <text x={X(bx + fig.offset / 2)} y={Y(0) - 4} class="lbl small">{offLabel}</text>
    {/if}
  </svg>
  <ul class="rpu-notes">
    <li>{tp('rcSheets.punchFig.perimeter', { bo: fmt(fig.bo), d: cm(fig.d) })} — {fig.clause}</li>
    <li>{t(`rcSheets.punchFig.pos.${fig.position}`)}</li>
    {#if fig.integrity}<li>{tp('rcSheets.punchFig.integrity', { n: fig.integrity.bars, dia: fig.integrity.dia })} — §8.7.4.2.2</li>{/if}
    {#if fig.reinforcement}
      <li class="warn">{tpn('rcSheets.punchFig.stirrups', fig.reinforcement.lines, { dia: fig.reinforcement.legDiameter, s: cm(fig.reinforcement.spacing), legs: fig.reinforcement.legs, ext: cm(fig.reinforcement.extent) })} — {fig.reinforcement.clause}</li>
      {#if fig.reinforcement.overCeiling}<li class="bad">{t('rcSheets.punchFig.overCeiling')}</li>{/if}
    {/if}
  </ul>
</figure>

<style>
  .rpu-fig { margin: 0; display: inline-flex; flex-direction: column; gap: 4px; padding: 6px 8px; border: 1px solid var(--st-hair); border-radius: 6px; background: var(--st-surface-2); }
  figcaption { font-size: 0.7rem; font-weight: 600; color: var(--st-text-2); }
  .slab { fill: var(--st-surface-3, rgba(128, 128, 128, 0.12)); stroke: none; }
  .edge { stroke: var(--st-text-2); stroke-width: 2; }
  .col { fill: rgba(128, 128, 128, 0.45); stroke: var(--st-text-2); stroke-width: 1; }
  .perim { fill: none; stroke: var(--st-accent, #4ecdc4); stroke-width: 1.8; stroke-dasharray: 6 3; }
  .studs { fill: none; stroke: #e0a03c; stroke-width: 1.2; }
  .integ { stroke: #2a9d8f; stroke-width: 1.6; }
  .dim { stroke: var(--st-text-3); stroke-width: 1; }
  .lbl { font-size: 10px; fill: var(--st-text); text-anchor: middle; font-family: var(--st-mono); }
  .lbl.small { font-size: 9px; fill: var(--st-text-2); }
  .rpu-notes { margin: 0; padding-left: 14px; font-size: 0.66rem; color: var(--st-text-2); max-width: 42ch; }
  .warn { color: var(--st-warn); }
  .bad { color: var(--st-danger); }
</style>
