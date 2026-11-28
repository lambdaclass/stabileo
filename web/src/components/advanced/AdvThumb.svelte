<script lang="ts">
  /**
   * The small drawing on each advanced function's card: the structure in the text colour, what
   * the function finds in the accent, the way the PRO generator gallery shows what a generator makes.
   */
  import type { AdvThumbId } from '../../lib/advanced/catalog';

  let { id }: { id: AdvThumbId } = $props();
</script>

{#snippet pin(x: number, y: number)}
  <path class="sup" d="M{x} {y} l-3.5 5 h7 z" />
{/snippet}
{#snippet fix(x: number, y: number)}
  <path class="sup" d="M{x - 5} {y} h10 M{x - 4} {y} l-2 3 M{x} {y} l-2 3 M{x + 4} {y} l-2 3" />
{/snippet}
{#snippet arrowDown(x: number, y: number, len = 8)}
  <path class="load" d="M{x} {y} v{len} M{x - 2} {y + len - 3} l2 3 l2 -3" />
{/snippet}

<svg class="thumb" viewBox="0 0 64 40" aria-hidden="true" focusable="false">
  {#if id === 'kinematic'}
    <path class="bar" d="M12 34 V12 H52 V34" />
    <circle class="hinge" cx="12" cy="12" r="2.2" /><circle class="hinge" cx="52" cy="12" r="2.2" /><circle class="hinge" cx="32" cy="12" r="2.2" />
    {@render pin(12, 34)}{@render pin(52, 34)}
    <path class="resp" d="M18 22 h12 M26 19 l4 3 l-4 3" />
  {:else if id === 'pdelta'}
    {@render fix(20, 36)}
    <path class="bar dim" d="M20 36 V8" />
    <path class="resp" d="M20 36 C20 24 24 14 30 8" />
    {@render arrowDown(30, 0, 7)}
    <path class="load" d="M38 8 h8 M43 6 l3 2 l-3 2" />
    <text class="lbl" x="48" y="30">Δ</text>
  {:else if id === 'buckling'}
    {@render pin(32, 36)}
    <path class="sup" d="M32 8 l-5 -3.5 v7 z M25 3 v10" />
    <path class="bar dim" d="M32 36 V8" />
    <path class="resp" d="M32 36 C40 28 40 16 32 8" />
    {@render arrowDown(32, 0, 7)}
    <text class="lbl" x="44" y="16">P</text><text class="lbl sub" x="50" y="18">cr</text>
  {:else if id === 'modal'}
    <path class="bar dim" d="M14 36 V12 H50 V36" />
    <path class="resp" d="M14 36 C14 24 18 14 22 12 H58 C58 14 54 24 50 36" />
    {@render fix(14, 36)}{@render fix(50, 36)}
    <path class="resp thin" d="M2 6 q3 -4 6 0 t6 0" />
  {:else if id === 'plastic'}
    <path class="bar" d="M8 26 H56" />
    {@render fix(8, 26)}{@render fix(56, 26)}
    <path class="resp" d="M8 26 L32 34 L56 26" />
    <circle class="ph" cx="8" cy="26" r="2.6" /><circle class="ph" cx="32" cy="34" r="2.6" /><circle class="ph" cx="56" cy="26" r="2.6" />
    {@render arrowDown(32, 8, 9)}
  {:else if id === 'influence'}
    <path class="bar" d="M6 14 H58" />
    {@render pin(10, 14)}{@render pin(42, 14)}
    <path class="load" d="M26 2 v8 M24 7 l2 3 l2 -3" />
    <path class="base" d="M6 30 H58" />
    <path class="resp fill" d="M10 30 L26 22 L42 30 L58 36 Z" />
  {:else if id === 'train'}
    <path class="bar" d="M4 24 H60" />
    {@render pin(8, 24)}{@render pin(56, 24)}
    {@render arrowDown(20, 9, 12)}{@render arrowDown(28, 9, 12)}{@render arrowDown(40, 9, 12)}
    <path class="resp thin" d="M16 6 H46 M42 3 l4 3 l-4 3" />
  {:else if id === 'envelope'}
    <path class="bar" d="M4 26 H60" />
    {@render pin(6, 26)}{@render pin(25, 26)}{@render pin(44, 26)}{@render pin(58, 26)}
    <path class="resp" d="M8 14 H23 M8 14 v8 M13 14 v8 M18 14 v8 M23 14 v8 M46 14 H57 M46 14 v8 M51.5 14 v8 M57 14 v8" />
    <path class="load dashed" d="M27 14 H42" />
  {:else if id === 'freeBody'}
    <path class="bar" d="M18 20 H46" />
    <path class="load" d="M18 20 h-9 M12 18 l-3 2 l3 2" /><path class="load" d="M46 20 h9 M52 18 l3 2 l-3 2" />
    <path class="resp" d="M18 30 v-7 M16 26 l2 -3 l2 3" /><path class="resp" d="M46 10 v7 M44 14 l2 3 l2 -3" />
    <path class="resp thin" d="M14 11 a6 6 0 0 1 8 0" /><path class="resp thin" d="M42 29 a6 6 0 0 0 8 0" />
  {:else if id === 'section'}
    <path class="bar sec" d="M10 6 H30 M20 6 V34 M10 34 H30" />
    <path class="base" d="M44 6 V34" />
    <path class="resp fill" d="M44 6 L58 6 L30 34 L44 34 Z" />
    <text class="lbl" x="50" y="26">σ</text>
  {:else if id === 'mohr'}
    <path class="base" d="M4 22 H60 M14 4 V38" />
    <circle class="resp" cx="34" cy="22" r="13" />
    <path class="resp thin" d="M23 15 L45 29" />
    <circle class="ph" cx="23" cy="15" r="1.8" /><circle class="ph" cx="45" cy="29" r="1.8" />
  {:else if id === 'concrete'}
    <rect class="bar" x="20" y="4" width="22" height="32" rx="1" />
    <circle class="ph" cx="25" cy="31" r="2" /><circle class="ph" cx="31" cy="31" r="2" /><circle class="ph" cx="37" cy="31" r="2" />
    <path class="resp" d="M50 4 V36 M50 4 l6 0 M50 28 l8 0" />
  {:else if id === 'whatif'}
    <path class="bar" d="M8 16 H56" />
    {@render pin(12, 16)}{@render pin(52, 16)}
    <path class="resp" d="M12 16 Q32 26 52 16" />
    <path class="base" d="M10 34 H54" />
    <circle class="knob" cx="36" cy="34" r="3.2" />
  {:else if id === 'steps'}
    <circle class="ph" cx="10" cy="9" r="3" /><circle class="ph" cx="10" cy="20" r="3" /><circle class="ph" cx="10" cy="31" r="3" />
    <path class="bar" d="M18 9 H54 M18 20 H48 M18 31 H52" />
    <path class="resp thin" d="M10 12 V17 M10 23 V28" />
  {:else if id === 'stiffness'}
    <path class="bar" d="M14 6 h-4 v28 h4 M50 6 h4 v28 h-4" />
    <text class="lbl big" x="22" y="27">K</text><text class="lbl" x="33" y="27">·</text><text class="lbl big resp-t" x="38" y="27">u</text>
  {:else if id === 'flexibility'}
    <path class="bar" d="M8 22 H56" />
    {@render pin(8, 22)}{@render pin(56, 22)}
    <path class="resp" d="M32 34 v-9 M30 28 l2 -3 l2 3" />
    <text class="lbl resp-t" x="36" y="36">X₁</text>
    <path class="sup dim" d="M32 22 l-3 5 h6 z" />
  {:else if id === 'continuous'}
    <path class="bar" d="M4 18 H60" />
    {@render pin(6, 18)}{@render pin(26, 18)}{@render pin(44, 18)}{@render pin(58, 18)}
    <path class="resp" d="M6 18 Q16 30 26 18 Q35 8 44 18 Q51 27 58 18" />
  {:else if id === 'frames'}
    <path class="bar" d="M10 36 V10 H54 V36" />
    {@render fix(10, 36)}{@render fix(54, 36)}
    <path class="resp" d="M10 36 C10 26 14 16 16 10 H60 C60 16 56 26 54 36" />
  {:else if id === 'trusses'}
    <path class="bar" d="M6 30 H58 L45 12 H19 Z M19 12 L32 30 L45 12" />
    {@render pin(6, 30)}{@render pin(58, 30)}
    <path class="resp" d="M32 30 L45 12" />
  {:else if id === 'deflection'}
    <path class="bar dim" d="M6 14 H58" />
    {@render pin(8, 14)}{@render pin(56, 14)}
    <path class="resp" d="M8 14 Q32 34 56 14" />
    <path class="load" d="M32 14 v10 M30 21 l2 3 l2 -3" />
  {/if}
</svg>

<style>
  .thumb { display: block; width: 100%; height: 100%; overflow: visible; }
  .thumb :global(path), .thumb :global(circle), .thumb :global(rect) { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .bar { stroke: var(--st-text-2); stroke-width: 2; }
  .bar.dim { stroke: var(--st-text-3); stroke-dasharray: 2 2.5; stroke-width: 1.3; }
  .bar.sec { stroke-width: 3; }
  .base { stroke: var(--st-text-3); stroke-width: 1; }
  .sup { stroke: var(--st-text-3); stroke-width: 1.2; }
  .sup.dim { stroke-dasharray: 1.5 1.5; }
  .load { stroke: var(--st-text-2); stroke-width: 1.3; }
  .load.dashed { stroke: var(--st-text-3); stroke-dasharray: 2 2; }
  .hinge { stroke: var(--st-text-2); stroke-width: 1.4; fill: var(--st-surface) !important; }
  .resp { stroke: var(--st-accent); stroke-width: 2; }
  .resp.thin { stroke-width: 1.3; }
  .resp.fill { fill: color-mix(in srgb, var(--st-accent) 22%, transparent) !important; stroke-width: 1.4; }
  .ph { fill: var(--st-accent) !important; stroke: none; }
  .knob { fill: var(--st-accent) !important; stroke: var(--st-surface); stroke-width: 1.5; }
  .lbl { fill: var(--st-text-2); font: italic 600 9px var(--st-sans, sans-serif); }
  .lbl.sub { font-size: 6px; }
  .lbl.big { font-size: 15px; }
  .resp-t { fill: var(--st-accent); }
</style>
