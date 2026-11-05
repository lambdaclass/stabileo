<script lang="ts">
  import type { Snippet } from 'svelte';
  let { disposition, children, preserveModel = false }: { preserveModel?: boolean; disposition: { refused: boolean; messages: string[] }; children?: Snippet } = $props();
</script>

{#if disposition.messages.length}
  <div class="containment-notice" class:refused={disposition.refused} role="alert">
    {#each disposition.messages as message}<p>{message}</p>{/each}
  </div>
{/if}
{#if children && (preserveModel || !disposition.refused)}{@render children()}{/if}

<style>
  .containment-notice { position: absolute; top: 8px; left: 8px; right: 56px; z-index: 20; max-height: 180px; overflow-y: auto; padding: 8px 12px; border: 2px solid #a65b00; background: #fff4db; color: #513000; font-size: 12px; }
  .containment-notice.refused { border-color: #b42318; background: #fff0ee; color: #7a1610; }
  p { margin: 4px 0; }
</style>
