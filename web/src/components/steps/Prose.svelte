<script lang="ts">
  /** A line of words from a step-by-step document, with its subscripts and superscripts set as such. */
  import { proseParts } from '../../lib/engine/steps/format';
  let { text }: { text: string } = $props();
  const parts = $derived(proseParts(text));
</script>

{#each parts as p}{#if p.kind === 'sub'}<sub>{p.text}</sub>{:else if p.kind === 'sup'}<sup>{p.text}</sup>{:else}{p.text}{/if}{/each}
