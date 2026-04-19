<script lang="ts">
  /**
   * RC Design Workflow — single entry point for RC design.
   *
   * Verification now appears inline within each expanded element row in the
   * Design tab (per QA3 feedback). The separate RC Verification subtab has
   * been removed to avoid a disconnected dual-system experience.
   */
  import ProDesignTab from './ProDesignTab.svelte';
  import type { ElementVerification } from '../../lib/engine/codes/argentina/cirsoc201';

  let { verifications = $bindable() }: { verifications?: ElementVerification[] } = $props();
  verifications = verifications ?? [];
</script>

<div class="rc-workflow">
  <ProDesignTab />
</div>

<style>
  .rc-workflow { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
  .rc-workflow > :global(*) { flex: 1; overflow: hidden; }
</style>
