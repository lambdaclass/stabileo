<script lang="ts">
  import { examplePreviews } from '../../lib/examples/previews.svelte';
  import { PREVIEW_W, PREVIEW_H } from '../../lib/examples/preview-geometry';

  let { id }: { id: string } = $props();
  const p = $derived(examplePreviews.get(id));
  const supports = $derived.by(() => {
    const out: [number, number][] = [];
    const flat = p?.p ?? [];
    for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
    return out;
  });
</script>

<svg class="xp" viewBox="0 0 {PREVIEW_W} {PREVIEW_H}" aria-hidden="true" focusable="false" data-preview={id}>
  {#if p}
    {#if p.s}<path class="xp-shell" d={p.s} />{/if}
    <path class="xp-member" d={p.m} />
    {#each supports as [x, y], i (i)}
      <path class="xp-support" d="M{x} {y}l-3.5 5.5h7z" />
    {/each}
  {/if}
</svg>

<style>
  .xp {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 10;
    background:
      linear-gradient(var(--st-hair) 1px, transparent 1px) 0 0 / 12px 12px,
      linear-gradient(90deg, var(--st-hair) 1px, transparent 1px) 0 0 / 12px 12px,
      var(--st-bg);
  }
  .xp-member { fill: none; stroke: var(--st-text-2); stroke-width: 1.3; stroke-linecap: round; vector-effect: non-scaling-stroke; }
  .xp-shell { fill: none; stroke: var(--st-text-3); stroke-width: 0.7; opacity: 0.7; vector-effect: non-scaling-stroke; }
  .xp-support { fill: var(--st-accent); }
</style>
