<script lang="ts">
  import { figure } from './figure';
  import type { GameModel } from './game-model';
  import type { Diagram } from './traces';

  let { model, diagram = null, label, faintLoads = false, bare = false }: { model: GameModel; diagram?: Diagram | null; label: string; faintLoads?: boolean; bare?: boolean } = $props();
  const fig = $derived(figure(model, diagram, bare));
</script>

<svg class="figure" class:faint-loads={faintLoads} viewBox={fig.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}>
  {#each fig.shapes as s, i (i)}
    <path d={s.d} class={s.ink} vector-effect="non-scaling-stroke" style:stroke-width={s.width ? `${s.width}px` : null} />
  {/each}
  {#each fig.labels as l, i (i)}
    <text x={l.x} y={l.y} class={`label ${l.ink}`} font-size={fig.unit * 0.1} text-anchor="middle" dominant-baseline="middle">{l.text}</text>
  {/each}
</svg>

<style>
  .figure { display: block; width: 100%; height: 100%; overflow: visible; }
  path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .member { stroke: var(--st-model-member); stroke-width: 2.5px; }
  .support { stroke: var(--st-model-support); stroke-width: 1.25px; }
  .hinge { stroke: var(--st-model-member); stroke-width: 1.5px; fill: var(--st-surface-2); }
  .load { stroke: var(--st-warn); stroke-width: 1.5px; }
  .faint-loads .load { opacity: 0.35; }
  .fill { fill: var(--dg-ink, var(--st-accent)); fill-opacity: 0.16; stroke: none; }
  .curve { stroke: var(--dg-ink, var(--st-accent)); stroke-width: 2px; }
  .ghost { stroke: var(--st-text-3); stroke-width: 1px; stroke-dasharray: 4 4; }
  .tension { stroke: var(--st-tension); stroke-width: 3px; }
  .compression { stroke: var(--st-blue-text); stroke-width: 3px; }
  .zero { stroke: var(--st-text-3); stroke-dasharray: 3 3; stroke-width: 1px; }
  text.label { font-family: var(--st-mono); font-weight: 600; stroke: none; }
  text.curve { fill: var(--dg-ink, var(--st-accent)); }
  text.tension { fill: var(--st-tension); }
  text.compression { fill: var(--st-blue-text); }
</style>
