<script lang="ts">
  import PublishedPlateMeshDialog from './PublishedPlateMeshDialog.svelte';
  import UnifiedPlateMeshDialog from './UnifiedPlateMeshDialog.svelte';

  let { ids, onclose }: { ids: number[]; onclose: () => void } = $props();
</script>

{#if __PUBLIC_FEATURES__.proPlatesUnified}
  <UnifiedPlateMeshDialog {ids} {onclose} />
{:else}
  <PublishedPlateMeshDialog {ids} {onclose} />
{/if}
