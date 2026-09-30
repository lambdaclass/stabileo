<script lang="ts">
  /**
   * Display mathematics that fits its column. Drawn as written; while it runs
   * past the column's width on a narrow panel it is laid out again at the next
   * level of breaking (engine/steps/narrow-tex), and if even the last level
   * does not fit it is set a little smaller. Only then does it scroll.
   */
  import { tick } from 'svelte';
  import MathEquation from '../dsm/MathEquation.svelte';
  import { narrowTex, NARROW_LEVELS } from '../../lib/engine/steps/narrow-tex';

  let { tex, narrow = false }: { tex: string; narrow?: boolean } = $props();

  let box = $state<HTMLDivElement>();
  let width = $state(0);
  let level = $state(0);
  let scale = $state(1);
  const shown = $derived(narrow ? narrowTex(tex, level) : tex);

  const SMALLEST = 0.72;
  let run = 0;
  $effect(() => {
    void tex; void narrow; void width;
    const me = ++run;
    level = 0;
    scale = 1;
    (async () => {
      for (;;) {
        await tick();
        if (me !== run || !box) return;
        if (box.scrollWidth <= box.clientWidth + 1) return;
        if (narrow && level < NARROW_LEVELS) { level++; continue; }
        scale = Math.max(SMALLEST, box.clientWidth / box.scrollWidth);
        return;
      }
    })();
  });
</script>

<div class="fit" bind:this={box} bind:clientWidth={width} style:font-size={scale < 1 ? `${(scale * 100).toFixed(1)}%` : undefined}>
  <MathEquation equation={shown} displayMode />
</div>

<style>
  .fit { overflow-x: auto; overflow-y: hidden; max-width: 100%; }
</style>
