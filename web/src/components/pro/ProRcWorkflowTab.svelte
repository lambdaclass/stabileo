<script lang="ts">
  /**
   * RC Design Workflow — single entry point for RC design.
   *
   * Verification now appears inline within each expanded element row in the
   * Design tab. The separate RC Verification subtab has been removed.
   *
   * Verification state lives in verificationStore (single source of truth).
   * This component is a thin layout wrapper — no props needed.
   */
  import ProDesignTab from './ProDesignTab.svelte';
</script>

<div class="rc-workflow">
  <ProDesignTab />
</div>

<style>
  .rc-workflow { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
  .rc-workflow > :global(*) { flex: 1; overflow: hidden; }
</style>
