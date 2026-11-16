<script lang="ts">
  /** A bar folded flat as a schedule draws it, each distinct leg dimensioned in cm beside it, sized to the row. */
  import { sketchOf, fitSketch } from '../../../lib/rc-sheets/schedule/sketch';
  import { shapeText } from '../../../lib/rc-sheets/schedule/exports';
  import type { BarShape } from '../../../lib/rc-sheets/shape';

  let { shape }: { shape: BarShape } = $props();
  const TEXT = { h: 11, char: 6.6 };
  const BOX = { w: 190, h: 50, pad: 3, text: TEXT };
  const fit = $derived(fitSketch(sketchOf(shape), BOX));
  const anchor = (side: string) => (side === 'left' ? 'end' : side === 'right' ? 'start' : 'middle');
  const dx = (side: string) => (side === 'left' ? -4 : side === 'right' ? 4 : 0);
  const dy = (side: string) => (side === 'above' ? -4 : side === 'below' ? TEXT.h + 2 : TEXT.h / 2 - 1);
</script>

<svg class="rcb" viewBox="0 0 {BOX.w} {BOX.h}" width={BOX.w} height={BOX.h} role="img" aria-label={shapeText(shape)} data-testid="rc-bbs-sketch">
  <path d={fit.d} />
  {#each fit.legs as l, i (i)}
    <text x={l.pos.x + dx(l.side)} y={l.pos.y + dy(l.side)} text-anchor={anchor(l.side)} data-testid="rc-bbs-sketch-leg">{Math.round(l.lengthM * 100)}</text>
  {/each}
</svg>

<style>
  .rcb { display: block; color: var(--st-text); overflow: visible; }
  path { fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }
  text { font-size: 11px; fill: var(--st-text-2); font-family: var(--st-mono); }
</style>
