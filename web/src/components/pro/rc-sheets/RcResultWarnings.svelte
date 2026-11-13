<script lang="ts">
  import { resultsStore } from '../../../lib/store/results.svelte';
  const disposition = $derived(resultsStore.knownIssues3D);
</script>

{#if disposition.messages.length}
  <div class="rc-result-warnings" data-testid="rc-result-warnings">
    {#each disposition.messages as message}<p role="alert">{message}</p>{/each}
  </div>
{/if}

<style>
  .rc-result-warnings { border: 1px solid var(--st-warning, #b7791f); padding: 0.6rem; margin: 0.6rem 0; overflow-wrap: anywhere; }
  p { margin: 0.3rem 0; font-size: 0.8rem; line-height: 1.5; }
</style>
