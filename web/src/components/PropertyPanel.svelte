<script lang="ts">
  import { uiStore } from '../lib/store';
  import NodeDetails from './property/NodeDetails.svelte';
  import ElementDetails from './property/ElementDetails.svelte';
  import ContextHelp from './property/ContextHelp.svelte';

  let { showResults = false } = $props();
</script>

<div class="panel">
  {#if uiStore.selectedNodes.size > 0}
    <NodeDetails {showResults} />
  {/if}

  {#if uiStore.selectedElements.size > 0}
    <ElementDetails {showResults} />
  {/if}

  <ContextHelp />
</div>

<style>
  .panel {
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    overflow-y: auto;
    max-height: calc(100vh - 4rem);
    flex-shrink: 1;
  }
</style>
