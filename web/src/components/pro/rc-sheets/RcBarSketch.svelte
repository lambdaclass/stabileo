<script lang="ts">
  /** A bar folded flat as a schedule draws it, each distinct leg dimensioned in cm. */
  import { sketchOf, fitSketch } from '../../../lib/rc-sheets/schedule/sketch';
  import { shapeText } from '../../../lib/rc-sheets/schedule/exports';
  import type { BarShape } from '../../../lib/rc-sheets/shape';

  let { shape }: { shape: BarShape } = $props();
  const BOX = { w: 132, h: 54, pad: 10 };
  const fit = $derived(fitSketch(sketchOf(shape), BOX));
</script>

<svg class="rcb" viewBox="0 0 {BOX.w} {BOX.h}" width={BOX.w} height={BOX.h} role="img" aria-label={shapeText(shape)} data-testid="rc-bbs-sketch">
  <path d={fit.d} />
  {#each fit.legs as l, i (i)}
    <text x={l.pos.x + (l.horizontal ? 0 : 4)} y={l.pos.y - (l.horizontal ? 3 : 0)} text-anchor={l.horizontal ? 'middle' : 'start'} dominant-baseline={l.horizontal ? 'auto' : 'middle'}>{Math.round(l.lengthM * 100)}</text>
  {/each}
</svg>

<style>
  .rcb { display: block; color: var(--st-text); }
  path { fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linejoin: round; stroke-linecap: round; }
  text { font-size: 7px; fill: var(--st-text-2); font-family: var(--st-mono); }
</style>
